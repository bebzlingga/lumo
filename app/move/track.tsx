import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, StyleSheet, useWindowDimensions, View } from "react-native";
import { Icon } from "@/components/Icon";
import { MoveBadge } from "@/components/move/MoveBadge";
import { ChallengeProgressBar, GpsHint, GpsIndicator, Metric, TrackingDebugPanel } from "@/components/move/TrackingUI";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { WalkBackground, useWalkSceneInset } from "@/components/WalkBackground";
import { WalkMap } from "@/components/WalkMap";
import { WalkRoute } from "@/components/WalkRoute";
import { CTA_FILL, fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { WALK_ACCENT } from "@/constants/tools";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { alpha, readableOn } from "@/lib/color";
import { toDateKey } from "@/lib/date";
import { isDoneOnDate, isScheduledOnDate } from "@/lib/habitMath";
import { findFamily } from "@/lib/move/challengeDefs";
import { checkIntegrity, toWalkPoints, toWalkRecordFromActivity } from "@/lib/move/tracking/bridge";
import type { ActivityType } from "@/lib/move/tracking/config";
import { estimateCalories, formatDistance, formatDuration, formatPace, formatSpeed } from "@/lib/move/tracking/pace";
import { useActivityTracker } from "@/lib/move/tracking/useActivityTracker";
import { recordWalk } from "@/lib/walk";
import { loadWalkState, saveWalkState } from "@/lib/walkStorage";
import { enqueueWalk } from "@/lib/walkSyncRunner";

/**
 * Recording a walk or a run.
 *
 * Four states on one route, exactly as `app/focus.tsx` is built — a recording
 * in progress is not somewhere you navigate to, and a back stack between
 * "walking" and "finished" would let someone strand a live activity behind
 * them.
 *
 *   ready ──▶ countdown ──▶ tracking ──▶ summary
 *
 * The screen owns NONE of the tracking. Every number here is read from
 * `useActivityTracker`, which reads the controller, which drives the pure
 * engine in `lib/move/tracking`. This file decides what things look like and
 * nothing else — which is why the engine could be tested without it.
 */

/** How long the countdown runs. Long enough to put the phone away. */
const COUNTDOWN_FROM = 3;

export default function MoveTrackScreen() {
  const router = useRouter();
  const { palette, isDark, habits, completeHabit } = useLumo();
  const move = useMove();
  const { state, prepare, currentPace, averagePace, averageSpeed, controller } = useActivityTracker();

  const [type, setType] = React.useState<ActivityType>("walk");
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [pickedHabits, setPickedHabits] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [showDebug, setShowDebug] = React.useState(false);

  const { width } = useWindowDimensions();
  const routeWidth = width - layout.screenPaddingX * 2;
  const accent = readableOn(WALK_ACCENT, palette.white, 4.5);
  const dateKey = toDateKey();
  const sceneInset = useWalkSceneInset("walking");

  const challenge = move.progress;
  const challengeFamily = challenge ? findFamily(challenge.variant.milestoneId) : undefined;

  /**
   * Asks for permission and starts sampling the moment the screen opens.
   *
   * Not at app launch: a location prompt for a feature nobody has opened is the
   * one that gets refused out of reflex. Here it arrives with the screen that
   * explains it.
   */
  React.useEffect(() => {
    void controller.beginPrepare();
  }, [controller]);

  /**
   * An activity left behind by a crash gets offered back rather than resumed.
   *
   * Silently carrying on would put however long the app was gone into the
   * walk's elapsed time and draw a line across wherever the person went.
   */
  React.useEffect(() => {
    let cancelled = false;

    void controller.recover().then((recovered) => {
      if (cancelled || !recovered || recovered.status === "finished") {
        return;
      }

      Alert.alert(
        "You have a walk in progress",
        "Lumo stopped before this one was saved. The distance it recorded is safe — what happened while the app was closed is not, so nothing from that gap is counted.",
        [
          { text: "Discard", style: "destructive", onPress: () => void controller.discard() },
          { text: "Keep it", onPress: () => void controller.continueRecovered() }
        ]
      );
    });

    return () => {
      cancelled = true;
    };
  }, [controller]);

  const habitOptions = React.useMemo(() => habits.filter((habit) => isScheduledOnDate(habit, dateKey)), [habits, dateKey]);

  // --- actions --------------------------------------------------------------

  function beginCountdown() {
    if (prepare.permission === "unavailable") {
      Alert.alert(
        "Lumo needs location",
        "Lumo traces your route to measure how far you went. You can turn location on in Settings and start again."
      );

      return;
    }

    setCountdown(COUNTDOWN_FROM);
  }

  /**
   * The countdown, which deliberately records nothing.
   *
   * The engine's clock starts at `controller.start()`, so the three seconds
   * spent counting are not part of the walk.
   */
  React.useEffect(() => {
    if (countdown === null) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    if (countdown === 0) {
      const timer = setTimeout(() => {
        setCountdown(null);
        void controller.start(type);
      }, 500);

      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);

    return () => clearTimeout(timer);
  }, [countdown, controller, type]);

  async function handleFinish() {
    const finished = await controller.finish();

    if (!finished) {
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }

  /**
   * Files the activity: history, habits, the sync queue, and the challenge.
   *
   * The order matters only in that the LOCAL write comes first. Everything else
   * — the upload, the habit tick — can be retried or recomputed; the recording
   * itself cannot.
   */
  async function handleSave() {
    if (!state || saving) {
      return;
    }

    setSaving(true);

    const record = toWalkRecordFromActivity(state, pickedHabits);

    if (!record) {
      await controller.discard();
      router.back();

      return;
    }

    const stored = await loadWalkState();

    await saveWalkState(recordWalk(stored, record));
    await enqueueWalk(record.id).catch(() => undefined);

    /**
     * Challenge progress, and the one check that guards it.
     *
     * `checkIntegrity` is separate from the recording on purpose: the engine
     * decides what happened, and this decides whether what happened is
     * plausible enough to count. A failure keeps the walk and withholds only
     * its claim — and it is where an integrity score would go later.
     */
    const integrity = checkIntegrity(state);

    if (integrity.ok) {
      move.creditActivity(state.distanceMeters);
    }

    // Habits, with the same two guards the rest of the app uses: never tick
    // twice in a day, and a measured habit only when the day's total reaches
    // its target.
    for (const habitId of record.habitIds) {
      const habit = habits.find((entry) => entry.id === habitId);

      if (habit && !isDoneOnDate(habit, dateKey) && !habit.measurement) {
        void completeHabit(habitId, dateKey);
      }
    }

    await controller.discard();
    void move.refresh().catch(() => undefined);
    setSaving(false);
    router.back();
  }

  function confirmDiscard() {
    Alert.alert("Discard this activity?", "The route and everything it recorded will be lost.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          void controller.discard();
          router.back();
        }
      }
    ]);
  }

  // --- the countdown --------------------------------------------------------

  if (countdown !== null) {
    return (
      <Screen scroll={false} contentStyle={styles.countdown} backgroundVariant={null} backgroundNode={<WalkBackground plate="walking" />}>
        <AppText color={palette.ink} style={styles.countdownValue}>
          {countdown === 0 ? "GO" : countdown}
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle}>
          {type === "run" ? "Run starts now" : "Walk starts now"}
        </AppText>
      </Screen>
    );
  }

  // --- the summary ----------------------------------------------------------

  if (state && state.status === "finished") {
    const calories = estimateCalories({ distanceM: state.distanceMeters, movingMs: state.movingDuration });

    return (
      <Screen contentStyle={styles.content} backgroundVariant={null} backgroundNode={<WalkBackground plate="walkDone" />}>
        <ScreenHeader
          title={type === "run" ? "Run Complete" : "Walk Complete"}
          leftAction={{ icon: "back", label: "Back", onPress: confirmDiscard }}
          rightAction={{ icon: "check", label: "Save this activity", onPress: () => void handleSave() }}
        />

        <View style={styles.summaryHero}>
          <AppText color={palette.ink} style={styles.summaryDistance} numberOfLines={1}>
            {formatDistance(state.distanceMeters)}
          </AppText>
          <AppText variant="caption" color={palette.muted}>
            Distance
          </AppText>
        </View>

        <View style={styles.metrics}>
          <Metric label="Moving time" value={formatDuration(state.movingDuration)} />
          <Metric label="Avg. pace" value={formatPace(averagePace)} />
          <Metric label="Steps" value={state.steps === null ? "—" : state.steps.toLocaleString()} />
        </View>

        <View style={styles.metrics}>
          <Metric label="Elapsed" value={formatDuration(state.elapsedDuration)} />
          <Metric label="Avg. speed" value={formatSpeed(averageSpeed)} />
          {/* Labelled an estimate wherever it appears — see `estimateCalories`. */}
          <Metric label="Calories (est.)" value={calories === null ? "—" : `${calories}`} />
        </View>

        {toWalkPoints(state).length > 0 ? (
          <WalkRoute route={toWalkPoints(state)} accent={accent} width={routeWidth} height={200} />
        ) : null}

        {challenge && challengeFamily ? (
          <ChallengeProgressBar
            title={`${challengeFamily.title} Challenge`}
            currentM={challenge.currentM}
            targetM={challenge.targetM}
            addedM={state.distanceMeters}
            accent={accent}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save this activity"
          onPress={() => void handleSave()}
          disabled={saving}
          style={({ pressed }) => [styles.cta, { backgroundColor: CTA_FILL, opacity: pressed || saving ? 0.85 : 1 }]}
        >
          <AppText variant="button" color={palette.white}>
            {saving ? "Saving…" : "Save Activity"}
          </AppText>
        </Pressable>
      </Screen>
    );
  }

  // --- recording ------------------------------------------------------------

  if (state) {
    const paused = state.status === "paused" || state.status === "autoPaused";

    return (
      <Screen
        scroll={false}
        contentStyle={styles.trackingContent}
        backgroundVariant={null}
        backgroundNode={<WalkMap route={toWalkPoints(state)} accent={accent} style={StyleSheet.absoluteFill} showRecenter={false} />}
      >
        <ScreenHeader
          leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
          rightAction={
            __DEV__
              ? { icon: "info", label: "Tracking diagnostics", onPress: () => setShowDebug((current) => !current) }
              : undefined
          }
          centerContent={
            <View style={styles.trackTitle}>
              <AppText color={palette.ink} style={styles.trackTitleText} numberOfLines={1}>
                {state.status === "autoPaused" ? "Paused — no movement" : paused ? "Paused" : type === "run" ? "Running" : "Moving"}
              </AppText>
            </View>
          }
        />

        <View pointerEvents="none" style={styles.spacer} />

        {/* Dev only, and off by default even there. */}
        {__DEV__ && showDebug ? <TrackingDebugPanel state={state} lastDeltaM={0} /> : null}

        <GpsHint quality={state.gpsQuality} />

        <View style={[styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
          <View style={styles.gpsRow}>
            <GpsIndicator quality={state.gpsQuality} accuracyM={state.lastAccuracyM} />
          </View>

          {/* Distance is the primary metric — everything else supports it. */}
          <Metric label="Distance" value={formatDistance(state.distanceMeters)} large />

          <View style={[styles.metrics, styles.metricsRuled, { borderTopColor: alpha(palette.hairline, "CC") }]}>
            <Metric label="Time" value={formatDuration(state.elapsedDuration)} />
            <Metric label="Pace" value={formatPace(currentPace)} />
            <Metric label="Steps" value={state.steps === null ? "—" : state.steps.toLocaleString()} />
          </View>
        </View>

        {challenge && challengeFamily ? (
          <View style={[styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
            <ChallengeProgressBar
              title={`${challengeFamily.title} Challenge`}
              currentM={challenge.currentM}
              targetM={challenge.targetM}
              addedM={state.distanceMeters}
              accent={accent}
            />
          </View>
        ) : null}

        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={paused ? "Resume" : "Pause"}
            onPress={() => (paused ? controller.resume() : controller.pause())}
            style={({ pressed }) => [
              styles.control,
              { backgroundColor: paused ? accent : alpha(accent, isDark ? "33" : "1F"), opacity: pressed ? 0.85 : 1 }
            ]}
          >
            <Icon name={paused ? "play" : "pause"} size={18} color={paused ? palette.white : palette.ink} weight="fill" />
            <AppText variant="button" color={paused ? palette.white : palette.ink}>
              {paused ? "Resume" : "Pause"}
            </AppText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Finish"
            onPress={() => void handleFinish()}
            style={({ pressed }) => [styles.control, { backgroundColor: CTA_FILL, opacity: pressed ? 0.85 : 1 }]}
          >
            <Icon name="check" size={16} color={palette.white} weight="bold" />
            <AppText variant="button" color={palette.white}>
              Finish
            </AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  // --- setting out ----------------------------------------------------------

  return (
    <Screen contentStyle={styles.content} backgroundVariant={null} backgroundNode={<WalkBackground plate="walking" />}>
      <ScreenHeader title="Move" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      <View style={{ height: sceneInset }} />

      <View style={styles.readyHead}>
        <GpsIndicator quality={prepare.quality} accuracyM={prepare.accuracyM} />
        <GpsHint quality={prepare.quality} />
      </View>

      {/* Walk or run, chosen up front because it sets the speed ceiling the
          filter judges every leg against — a runner's legs would be thrown out
          as impossible under the walking limit. */}
      <View style={styles.types}>
        {(["walk", "run"] as ActivityType[]).map((option) => {
          const picked = type === option;

          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: picked }}
              accessibilityLabel={option === "run" ? "Run" : "Walk"}
              onPress={() => setType(option)}
              style={({ pressed }) => [
                styles.typeChip,
                { backgroundColor: picked ? alpha(palette.greenDark, "1F") : "transparent", opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <Icon name={option === "run" ? "footprints" : "walk"} size={22} color={picked ? palette.greenDark : palette.subtle} weight="bulk" />
              <AppText variant="caption" color={picked ? palette.greenDark : palette.subtle}>
                {option === "run" ? "Run" : "Walk"}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {challenge && challengeFamily ? (
        <View style={[styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
          <View style={styles.challengeRow}>
            <MoveBadge
              progress={{
                milestone: {
                  id: challengeFamily.id,
                  title: challengeFamily.title,
                  description: "",
                  target: challengeFamily.distanceM,
                  metric: "distance",
                  tier: "bronze"
                },
                progress: 0,
                target: challengeFamily.distanceM,
                ratio: 0,
                unlocked: false,
                unlockedAt: null
              }}
              size={44}
            />
            <View style={styles.challengeText}>
              <ChallengeProgressBar
                title={`${challengeFamily.title} Challenge`}
                currentM={challenge.currentM}
                targetM={challenge.targetM}
                accent={accent}
              />
            </View>
          </View>
        </View>
      ) : null}

      {habitOptions.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
            Counts toward
          </AppText>
          <View style={styles.habits}>
            {habitOptions.map((habit) => {
              const picked = pickedHabits.includes(habit.id);

              return (
                <Pressable
                  key={habit.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked }}
                  accessibilityLabel={habit.name}
                  onPress={() =>
                    setPickedHabits((current) =>
                      current.includes(habit.id) ? current.filter((entry) => entry !== habit.id) : [...current, habit.id]
                    )
                  }
                  style={({ pressed }) => [
                    styles.habitChip,
                    {
                      backgroundColor: picked ? alpha(palette.greenDark, "1F") : palette.card,
                      opacity: pressed ? 0.7 : 1
                    }
                  ]}
                >
                  <AppText variant="caption" color={picked ? palette.greenDark : palette.subtle} numberOfLines={1}>
                    {habit.name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={type === "run" ? "Start run" : "Start walk"}
        onPress={beginCountdown}
        style={({ pressed }) => [styles.cta, { backgroundColor: CTA_FILL, opacity: pressed ? 0.85 : 1 }]}
      >
        <Icon name="play" size={18} color={palette.white} weight="fill" />
        <AppText variant="button" color={palette.white}>
          {prepare.ready ? `Start ${type === "run" ? "Run" : "Walk"}` : "Start anyway"}
        </AppText>
      </Pressable>

      {/* Never traps anybody: a poor signal makes the button say what it is
          agreeing to, rather than refusing to start. */}
      {prepare.permission === "foreground-only" ? (
        <AppText variant="caption" color={palette.subtle} style={styles.note}>
          Lumo only has location while the app is open, so the route stops when the screen locks. Allow location "Always" to record with the
          phone in your pocket.
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl
  },
  trackingContent: {
    flex: 1,
    gap: spacing.sm,
    paddingBottom: spacing.xl
  },
  spacer: {
    flex: 1
  },
  countdown: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs
  },
  countdownValue: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 96,
    lineHeight: 110
  },
  readyHead: {
    alignItems: "center",
    gap: spacing.xs
  },
  types: {
    flexDirection: "row",
    gap: spacing.sm
  },
  typeChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.card
  },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  gpsRow: {
    alignItems: "center"
  },
  metrics: {
    flexDirection: "row",
    alignItems: "flex-end"
  },
  metricsRuled: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  summaryHero: {
    alignItems: "center",
    gap: 2
  },
  summaryDistance: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 56,
    lineHeight: 64
  },
  trackTitle: {
    alignItems: "center"
  },
  trackTitleText: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 18,
    lineHeight: 24
  },
  challengeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  challengeText: {
    flex: 1
  },
  section: {
    gap: spacing.xs
  },
  sectionTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  habits: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  habitChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.card
  },
  controls: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.sm
  },
  control: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 54,
    borderRadius: radius.pill
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 54,
    marginTop: spacing.sm,
    borderRadius: radius.pill
  },
  note: {
    textAlign: "center",
    maxWidth: 320,
    alignSelf: "center"
  }
});
