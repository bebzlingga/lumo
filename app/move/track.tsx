import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { ChallengeRing } from "@/components/move/ChallengeUI";
import { GpsHint, GpsIndicator, Metric, TrackingDebugPanel } from "@/components/move/TrackingUI";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { WalkBackground, useWalkSceneInset } from "@/components/WalkBackground";
import { WalkMap } from "@/components/WalkMap";
import { WalkRoute } from "@/components/WalkRoute";
import { CTA_FILL, fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { MOVE_ROUTE_ACCENT } from "@/constants/tools";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { alpha, readableOn } from "@/lib/color";
import { toDateKey } from "@/lib/date";
import { findFamily } from "@/lib/move/challengeDefs";
import { checkIntegrity, toWalkPoints, toWalkRecordFromActivity } from "@/lib/move/tracking/bridge";
import {
  elevationGain,
  estimateCalories,
  formatDistance,
  formatElevation,
  formatDistanceValue,
  formatDuration,
  formatPace,
  formatSpeed
} from "@/lib/move/tracking/pace";
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
 *   ready ──▶ tracking ──▶ summary
 *
 * The screen owns NONE of the tracking. Every number here is read from
 * `useActivityTracker`, which reads the controller, which drives the pure
 * engine in `lib/move/tracking`. This file decides what things look like and
 * nothing else — which is why the engine could be tested without it.
 */

/** How long the map and the live card take to arrive. */
const ENTER_MS = 320;

/**
 * What the tracker is doing, in three lines, on the screen where somebody is
 * deciding whether to trust it with a walk.
 *
 * This replaced a Walk/Run toggle. The toggle's only mechanical job was setting
 * the filter's speed ceiling, and a wrong guess threw away real movement — a
 * jog recorded as a walk had its fastest legs rejected as impossible. Worse,
 * plenty of outings are both, which no single choice describes. So the answer
 * is worked out from the recording, and the screen explains that instead of
 * asking.
 */
const HOW_IT_WORKS: { icon: IconName; label: string; body: string }[] = [
  {
    icon: "walk",
    label: "Walk or run — both count",
    body: "Nothing to choose. Lumo measures each stretch on its own and works out afterwards which it was."
  },
  {
    icon: "target",
    label: "Only real movement",
    body: "Bad GPS, standing still and anything faster than a person can move on foot are left out of your distance."
  },
  {
    icon: "moon",
    label: "Keeps going in your pocket",
    body: "Lock the screen and the route carries on. Stop for a while and Lumo pauses itself until you set off again."
  }
];

export default function MoveTrackScreen() {
  const router = useRouter();
  const { palette, isDark } = useLumo();
  const move = useMove();
  const { state, prepare, averagePace, averageSpeed, controller } = useActivityTracker();

  const [saving, setSaving] = React.useState(false);
  /**
   * True for the frame the share image is taken in.
   *
   * The picture is the whole screen — Lumo's scene included, because that is
   * what makes it a Lumo walk rather than four numbers — so the two controls
   * that are chrome rather than content are pulled for the shot. Nobody wants a
   * screenshot with a Share button in it.
   */
  const [capturing, setCapturing] = React.useState(false);
  /** What a share captures: the figures and the route, without the page bar. */
  const summaryRef = React.useRef<View>(null);
  const [showDebug, setShowDebug] = React.useState(false);
  /**
   * How far the live card has arrived, 0 to 1.
   *
   * Standing in for the countdown that used to cover this transition: without
   * something between them the ready screen was replaced by a map and a card in
   * one frame, which read as a glitch rather than as a walk beginning. The card
   * rises into place while the map settles under it.
   */
  const enter = React.useRef(new Animated.Value(0)).current;

  const { width } = useWindowDimensions();
  /** The home-indicator strip the floating bar has to sit above. */
  const insets = useSafeAreaInsets();
  const routeWidth = width - layout.screenPaddingX * 2;
  /**
   * The colour the route, the position dot and the live figures are drawn in.
   *
   * Warm rather than the app's green, and that is deliberate: on a map the
   * green sat inside the greens the tiles are already made of, and a route has
   * to be the loudest thing on it. Walked until white text clears 4.5:1, so the
   * same value can fill a button.
   */
  const accent = readableOn(MOVE_ROUTE_ACCENT, palette.white, 4.5);
  const dateKey = toDateKey();
  const sceneInset = useWalkSceneInset("walking");

  /**
   * The last position the tracker saw, accepted or not.
   *
   * Only ever used to frame the map before the route has any points of its own.
   * A rejected fix is still roughly where the phone is, which is all this needs.
   */
  const lastFix = React.useMemo(() => {
    const point = state?.rawPoints[state.rawPoints.length - 1];

    return point ? { lat: point.latitude, lon: point.longitude } : null;
  }, [state?.rawPoints]);

  const challenge = move.progress;
  const challengeFamily = challenge ? findFamily(challenge.variant.milestoneId) : undefined;

  /**
   * Runs the entrance once the recording view is on screen, and resets it when
   * the walk ends so a second walk in the same session animates in too.
   */
  const recording = Boolean(state) && state?.status !== "finished";

  React.useEffect(() => {
    if (!recording) {
      enter.setValue(0);

      return;
    }

    const animation = Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });

    animation.start();

    return () => animation.stop();
  }, [recording, enter]);

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

  // --- actions --------------------------------------------------------------

  /**
   * Start recording, immediately.
   *
   * There used to be a three-second countdown here. It bought nothing — the
   * engine's clock starts at `controller.start()` either way, so the count was
   * three seconds of standing still being told to wait — and it put a full
   * screen between the tap and the map. The haptic is what confirms the tap
   * now, and the walk begins on it.
   */
  function beginTracking() {
    if (prepare.permission === "unavailable") {
      Alert.alert(
        "Lumo needs location",
        "Lumo traces your route to measure how far you went. You can turn location on in Settings and start again."
      );

      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    void controller.start();
  }

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

    const record = toWalkRecordFromActivity(state);

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

    await controller.discard();
    void move.refresh().catch(() => undefined);
    setSaving(false);
    router.back();
  }

  /**
   * Shares the summary as an image.
   *
   * The same approach `AwardDialog` uses, and the same two guards: `view-shot`
   * is a native module, so a build without it must lose sharing rather than
   * crash the screen, and the OS sheet is only opened when the platform says it
   * is available.
   *
   * Captures the SUMMARY, not the whole screen — the page bar and its buttons
   * are chrome, and nobody wants a screenshot with a back arrow in it.
   */
  async function handleShare() {
    let uri: string;

    setCapturing(true);
    // One beat for the hidden controls to leave the screen. Without it the
    // capture races the re-render and catches the buttons it just dropped.
    await new Promise((resolve) => setTimeout(resolve, 64));

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
      uri = await captureRef(summaryRef, { format: "png", quality: 1 });
    } catch {
      Alert.alert("Almost there", "Sharing needs the latest app build. Rebuild the app to enable it.");

      return;
    } finally {
      setCapturing(false);
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your walk" });
      }
    } catch {
      Alert.alert("Sharing failed", "Could not share the image. Please try again.");
    }
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

  // --- the summary ----------------------------------------------------------

  if (state && state.status === "finished") {
    const calories = estimateCalories({ distanceM: state.distanceMeters, movingMs: state.movingDuration });

    return (
      /* The ref sits outside `Screen`, so the shot takes the backdrop with it —
         the scene Lumo is drawn into is the frame of the picture. */
      <View ref={summaryRef} collapsable={false} style={styles.fill}>
      <Screen contentStyle={styles.content} backgroundVariant={null} backgroundNode={<WalkBackground plate="walkDone" />}>
        {/* No title. The distance under it is the headline, and "Walk
            Complete" above a number that says the same thing was the screen
            announcing itself. */}
        <ScreenHeader
          /* Only in the picture. On the screen the distance is the headline and
             a title over it says the same thing twice — but a shared image
             leaves the app behind, so it has to carry its own name. */
          title={capturing ? "RUN WITH LUMO" : undefined}
          rightAction={
            capturing
              ? undefined
              : { icon: "check", label: saving ? "Saving" : "Save this activity", onPress: () => void handleSave() }
          }
        />

        <View style={styles.summaryCapture}>
        <View style={styles.summaryHero}>
          {/* The unit at half the number's size, as on the live screen — one
              readout, two places, the same shape. */}
          <AppText color={palette.ink} style={styles.summaryDistance} numberOfLines={1}>
            {formatDistanceValue(state.distanceMeters)}
            <AppText color={palette.ink} style={styles.summaryDistanceUnit}>
              {" km"}
            </AppText>
          </AppText>
        </View>

        {/* Four figures, one row. Steps and elapsed time came out: the
            pedometer's count is the one number here that is not measured from
            the route, and elapsed only ever explained the gap to moving time —
            which nobody needs explaining when the walk has just ended. */}
        <View style={styles.metrics}>
          <Metric label="Moving time" value={formatDuration(state.movingDuration)} />
          <Metric label="Avg. pace" value={formatPace(averagePace)} />
          <Metric label="Avg. speed" value={formatSpeed(averageSpeed)} />
        </View>

        {/* Two, centred rather than stretched: at a third of the width each
            they would line up under the row above and read as a five-column
            grid with a hole in it. */}
        <View style={styles.metricsPair}>
          {/* Labelled an estimate wherever it appears — see `estimateCalories`. */}
          <Metric label="Calories (est.)" value={`${calories ?? 0}`} />
          <Metric label="Elevation" value={formatElevation(elevationGain(state.segments))} />
        </View>

        {toWalkPoints(state).length > 0 ? (
          <WalkRoute route={toWalkPoints(state)} accent={accent} width={routeWidth} height={200} />
        ) : null}
        </View>

        {/* Under the route, not in the page bar: everything it shares is on
            screen above it, so this reads as "send THAT" rather than as one of
            the two chrome buttons at the top.

            Hidden without a route. A walk with no fixes has nothing worth
            sending — the shared image would be four numbers on cream — and an
            offer to share it is the app asking for something nobody wants. */}
        {toWalkPoints(state).length > 0 && !capturing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share this activity"
          onPress={() => void handleShare()}
          // The app's chip wash, as on the habit form's categories: a green
          // tint with the glyph and label green to match, so it reads as one
          // control rather than dark text on a coloured patch.
          style={({ pressed }) => [
            styles.shareAction,
            { backgroundColor: alpha(palette.greenDark, "1F"), opacity: pressed ? 0.6 : 1 }
          ]}
        >
          <Icon name="share" size={20} color={palette.greenDark} weight="fill" />
          <AppText color={palette.greenDark} style={styles.shareLabel}>
            Share
          </AppText>
        </Pressable>
        ) : null}

        {/* No Save button. The tick in the page bar files the walk, and a
            second control doing the same thing at the foot of the page made it
            look like the summary had two different endings. */}
      </Screen>
      </View>
    );
  }

  // --- recording ------------------------------------------------------------

  if (state) {
    const paused = state.status === "paused" || state.status === "autoPaused";
    /** Fades the map up and lifts the card into place. */
    const entering = {
      opacity: enter,
      transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }]
    };

    return (
      <Screen
        scroll={false}
        contentStyle={styles.trackingContent}
        backgroundVariant={null}
        /**
         * A map, held back to almost nothing: muted tiles, no points of
         * interest, no buildings, no traffic — see `WalkMap`.
         *
         * `center` is what stops it opening on the whole country. With no fixes
         * in the route yet there is no region to frame, and the platform's
         * answer to that is fully zoomed out; the last fix the tracker saw is a
         * far better guess than the world. After that the region follows the
         * route, re-framing on every fix.
         */
        backgroundNode={
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: enter }]}>
          <WalkMap
            route={toWalkPoints(state)}
            accent={accent}
            style={StyleSheet.absoluteFill}
            showRecenter={false}
            center={lastFix}
            // Keeps you in the middle at a fixed zoom while walking. Fitting
            // the whole route instead would pull back all hour, ending on a
            // city and a thread.
            frame="position"
          />
          </Animated.View>
        }
      >
        <ScreenHeader
          leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
          /**
           * Pause and resume live in the page bar, where the map is.
           *
           * They belong beside what they act on: the walk is the map, and the
           * bar is the only chrome over it. It also leaves the foot of the
           * screen to the one irreversible control, so the tap that ENDS a walk
           * is never next to the tap that pauses it.
           */
          rightAction={{
            icon: paused ? "play" : "pause",
            label: paused ? "Resume" : "Pause",
            // Filled, not outlined: a transport control is a solid shape
            // everywhere else it appears, and at 20pt over a map an outline
            // reads as a smudge.
            iconWeight: "fill",
            onPress: () => (paused ? controller.resume() : controller.pause())
          }}
          centerContent={
            /* The diagnostics toggle hides here in development: the title is
               the one thing in the bar with nothing else to do. */
            <Pressable
              accessibilityRole={__DEV__ ? "button" : undefined}
              accessibilityLabel={__DEV__ ? "Tracking diagnostics" : undefined}
              disabled={!__DEV__}
              onPress={() => setShowDebug((current) => !current)}
              style={styles.trackTitle}
            >
              <AppText color={palette.ink} style={styles.trackTitleText} numberOfLines={1}>
                {state.status === "autoPaused" ? "Paused — no movement" : paused ? "Paused" : "Moving"}
              </AppText>
            </Pressable>
          }
        />

        <View pointerEvents="none" style={styles.spacer} />

        {/* Dev only, and off by default even there. */}
        {__DEV__ && showDebug ? <TrackingDebugPanel state={state} lastDeltaM={0} /> : null}

        <GpsHint quality={state.gpsQuality} />

        <Animated.View style={[styles.card, entering, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
          <View style={styles.gpsRow}>
            <GpsIndicator quality={state.gpsQuality} accuracyM={state.lastAccuracyM} />
            {/* Distance, straight under the signal badge and as big as the card
                allows. It is the number this screen exists to show, and the one
                a glance mid-walk is looking for. */}
            {/* The unit at half the number's size: "km" is the same on every
                walk, and at full weight it took as much of the line as the
                figure that actually changes. */}
            <AppText color={palette.ink} style={styles.liveDistance} numberOfLines={1}>
              {formatDistanceValue(state.distanceMeters)}
              <AppText color={palette.ink} style={styles.liveDistanceUnit}>
                {" km"}
              </AppText>
            </AppText>
          </View>

          {/* Divided from each other rather than fenced off from the distance
              above: three figures side by side needed to be told apart, and a
              rule across the top was answering a different question. */}
          <View style={[styles.metrics, styles.metricsSpaced]}>
            {/* Moving time only. Elapsed is on the summary, where it explains
                the gap between the two; mid-walk it is just a second clock. */}
            <Metric label="Moving" value={formatDuration(state.movingDuration)} />
            <View style={[styles.metricDivider, { backgroundColor: alpha(palette.hairline, "CC") }]} />
            {/* The average only. Current pace swings on a single fix even after
                smoothing, and a number that moves while you watch it is not one
                you can act on mid-walk. */}
            <Metric label="Avg. pace" value={formatPace(averagePace)} />
            <View style={[styles.metricDivider, { backgroundColor: alpha(palette.hairline, "CC") }]} />
            <Metric label="Steps" value={(state.steps ?? 0).toLocaleString()} />
          </View>

          {/* The challenge this walk feeds, when there is one.
              A line inside the card rather than a second card under it: it is
              one of this walk's figures, and a card of its own made it look
              like a separate thing happening at the same time. */}
          {challenge && challengeFamily ? (
            <View style={[styles.challengeRow, { borderTopColor: alpha(palette.hairline, "CC") }]}>
              {/* This walk counted in, so the dial answers "am I getting there"
                  rather than "where was I when I set off". */}
              <ChallengeRing
                ratio={(challenge.currentM + state.distanceMeters) / Math.max(1, challenge.targetM)}
                size={22}
                stroke={4}
                accent={accent}
                track={alpha(palette.hairline, "99")}
              />

              <AppText variant="caption" color={palette.ink} numberOfLines={1} style={styles.challengeName}>
                {challengeFamily.title} Challenge
              </AppText>

              {/* The unit said once, at the end: "0.0 km of 1.0 km" repeated it
                  for a pair of numbers that can only ever share it. */}
              <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                {formatDistanceValue(Math.min(challenge.targetM, challenge.currentM + state.distanceMeters))} /{" "}
                {formatDistance(challenge.targetM)}
              </AppText>
            </View>
          ) : null}

          {/* Inside the card, under a rule: it acts on the figures above it.
              No fill and no inset of its own — the colour alone carries the
              state, green while walking and red once paused. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Finish"
            onPress={() => void handleFinish()}
            style={({ pressed }) => [
              styles.finishRow,
              { borderTopColor: alpha(palette.hairline, "CC"), opacity: pressed ? 0.6 : 1 }
            ]}
          >
            <Icon
              name="check"
              size={16}
              color={paused ? palette.danger : readableOn(CTA_FILL, palette.card, 4.5)}
              weight="bold"
            />
            <AppText variant="button" color={paused ? palette.danger : readableOn(CTA_FILL, palette.card, 4.5)}>
              Finish
            </AppText>
          </Pressable>
        </Animated.View>

      </Screen>
    );
  }

  // --- setting out ----------------------------------------------------------

  return (
    /**
     * The start button floats over the foot of the screen rather than sitting at
     * the end of the content.
     *
     * It is the only thing anybody comes here to press, and on a long page it
     * was below the fold — the one control that must never need scrolling to.
     * `Screen` has a sticky header but no footer, so the bar is a sibling laid
     * over it, and the content carries enough bottom padding to clear it.
     */
    <View style={styles.fill}>
      <Screen contentStyle={styles.content} backgroundVariant={null} backgroundNode={<WalkBackground plate="walking" />}>
      <ScreenHeader title="Move" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      <View style={{ height: sceneInset }} />

      <View style={styles.readyHead}>
        <GpsIndicator quality={prepare.quality} accuracyM={prepare.accuracyM} />
        <GpsHint quality={prepare.quality} />
      </View>

      {/* What the tracker does, instead of a choice nobody should have to make.
          Walk or run was only ever setting a speed ceiling, and getting it wrong
          threw away real movement — so it is worked out from the recording
          rather than declared in advance. */}
      <View style={styles.how}>
        {HOW_IT_WORKS.map((line) => (
          <View key={line.label} style={styles.howRow}>
            <View style={styles.howHead}>
              <Icon name={line.icon} size={18} color={accent} weight="bulk" />
              <AppText variant="bodySmall" color={palette.ink} style={styles.howTitle}>
                {line.label}
              </AppText>
            </View>
            <AppText variant="caption" color={palette.subtle} style={styles.howBody}>
              {line.body}
            </AppText>
          </View>
        ))}
      </View>

      </Screen>

      <View style={[styles.startBar, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xl }]}>
        {/* Never traps anybody: a poor signal makes the button say what it is
            agreeing to, rather than refusing to start. */}
        {prepare.permission === "foreground-only" ? (
          <AppText variant="caption" color={palette.subtle} style={styles.note}>
            Lumo only has location while the app is open, so the route stops when the screen locks.
          </AppText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start moving"
          onPress={beginTracking}
          style={({ pressed }) => [styles.cta, { backgroundColor: CTA_FILL, opacity: pressed ? 0.85 : 1 }]}
        >
          <Icon name="play" size={18} color={palette.white} weight="fill" />
          <AppText variant="button" color={palette.white}>
            {/* "Moving", not "Walk": nobody declares which this is any more,
                and the label should not quietly reintroduce the choice. */}
            {prepare.ready ? "Start Moving" : "Start anyway"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1
  },
  content: {
    gap: spacing.md,
    // Clears the floating bar, so the last card is never trapped behind it.
    paddingBottom: spacing.xxl * 2
  },
  startBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.xs,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing.sm
  },
  trackingContent: {
    flex: 1,
    gap: spacing.sm,
    paddingBottom: spacing.xl
  },
  spacer: {
    flex: 1
  },
  challengeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    // The card's own gap sits under this row as well, so it needs none of its
    // own — Finish is the next rule down and the two were reading as far apart
    // as the metrics block above.
    marginBottom: -spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  challengeName: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 14,
    lineHeight: 19
  },
  readyHead: {
    alignItems: "center",
    gap: spacing.xs,
    // Clears the signal hint from the explanation under it — without this the
    // warning read as the first of the three lines rather than as its own.
    paddingBottom: spacing.md
  },
  // No card. These three lines are the page talking, not an object on it —
  // a plate around them made the explanation look like a thing to interact
  // with, on a screen whose only control is the button at the foot.
  how: {
    gap: spacing.lg
  },
  howRow: {
    alignItems: "center",
    gap: spacing.xxs
  },
  // Glyph beside the line it belongs to, not stacked above it: the two are one
  // statement, and centring them together keeps the block's axis.
  howHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  howTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    textAlign: "center"
  },
  howBody: {
    // Regular against the title's semibold. At the same weight the two read as
    // two headings rather than a line and its explanation.
    fontFamily: fontFamilies.lexend,
    textAlign: "center",
    lineHeight: 17,
    maxWidth: 300
  },
  card: {
    gap: spacing.sm,
    // Wider than it is tall: the figures inside are centred, and a square inset
    // left them looking crowded against the edges while the card itself sat
    // deeper than it needed to.
    paddingHorizontal: spacing.ml,
    paddingVertical: spacing.sm,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  gpsRow: {
    alignItems: "center",
    gap: spacing.xxs,
    // Air above the badge, so the card opens on a breath rather than on its
    // own edge.
    paddingTop: spacing.sm
  },
  liveDistanceUnit: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 26
  },
  liveDistance: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 52,
    lineHeight: 60,
    marginTop: spacing.xs
  },
  metrics: {
    flexDirection: "row",
    alignItems: "flex-end"
  },
  metricsPair: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "flex-end",
    // A third of the screen each, so the pair sits inside the row above rather
    // than spreading to its edges.
    width: "66%"
  },
  metricsSpaced: {
    // Pulled up against the card's own gap: the distance block above ends in a
    // small "Distance" caption, which already reads as a break.
    marginTop: -2
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 2
  },
  shareAction: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill
  },
  shareLabel: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 15,
    lineHeight: 20
  },
  summaryCapture: {
    gap: spacing.md
  },
  summaryHero: {
    alignItems: "center",
    gap: 2
  },
  summaryDistanceUnit: {
    fontFamily: fontFamilies.lexendBlack,
    // Half the figure, as on the live screen — the unit never changes, so it
    // never competes with the number that does.
    fontSize: 34
  },
  summaryDistance: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 68,
    lineHeight: 78
  },
  trackTitle: {
    alignItems: "center"
  },
  trackTitleText: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 18,
    lineHeight: 24
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
  finishRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  // Sized to its label rather than stretched, but with a floor: a lone pill
  // reading "Start Walk" in the middle of a wide bar looks like an afterthought,
  // and the label changes length when the signal is poor.
  cta: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minWidth: 200,
    minHeight: 54,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill
  },
  note: {
    textAlign: "center",
    maxWidth: 320,
    alignSelf: "center"
  }
});
