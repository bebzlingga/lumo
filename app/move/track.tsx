import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Alert, Animated, Easing, StyleSheet, View } from "react-native";
import { LiveWalkView } from "@/components/move/LiveWalkView";
import { GpsHint, GpsIndicator } from "@/components/move/TrackingUI";
import { useSharedWalk } from "@/components/move/useSharedWalk";
import { WalkSummaryView } from "@/components/move/WalkSummaryView";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Screen } from "@/components/ui";
import { WalkBackground, useWalkSceneInset } from "@/components/WalkBackground";
import { spacing } from "@/constants/theme";
import { MOVE_ROUTE_ACCENT } from "@/constants/tools";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { readableOn } from "@/lib/color";
import { toDateKey } from "@/lib/date";
import { findFamily } from "@/lib/move/challengeDefs";
import { checkIntegrity, toWalkRecordFromActivity } from "@/lib/move/tracking/bridge";
import { useActivityTracker } from "@/lib/move/tracking/useActivityTracker";
import { clearWalkSession } from "@/lib/move/walkSession";
import { habitsReachedByWalks, recordWalk } from "@/lib/walk";
import { loadWalkState, saveWalkState } from "@/lib/walkStorage";
import { enqueueWalk } from "@/lib/walkSyncRunner";

/** How long the map and the live card take to arrive. */
const ENTER_MS = 320;

/**
 * Recording a walk or a run — one route, three states, so a live activity can
 * never be stranded behind a back stack:
 *
 *   starting ──▶ recording (LiveWalkView) ──▶ summary (WalkSummaryView)
 *
 * The screen owns none of the tracking: every number comes from
 * `useActivityTracker`, which reads the controller that drives the pure engine in
 * `lib/move/tracking`. This file wires the lifecycle — recovery, auto-start,
 * finish, save, discard — and hands the views what to draw.
 */
export default function MoveTrackScreen() {
  const router = useRouter();
  const { palette, habits, completeHabit } = useLumo();
  const move = useMove();
  const { state, prepare, averagePace, controller } = useActivityTracker();
  const [saving, setSaving] = React.useState(false);

  /** Who came along: the route param seeds it, the activity owns it (it survives a crash). */
  const { with: withParam } = useLocalSearchParams<{ with?: string }>();
  const startingWith = React.useMemo(
    () => (typeof withParam === "string" ? withParam.split(",").map((name) => name.trim()).filter(Boolean) : []),
    [withParam]
  );
  const companions = (state?.companions ?? startingWith).join(", ");

  /**
   * The route's colour — warm rather than the app's green, which sank into the
   * map's own greens; walked until white clears 4.5:1 so it can fill a button.
   */
  const accent = readableOn(MOVE_ROUTE_ACCENT, palette.white, 4.5);
  const sceneInset = useWalkSceneInset("walking");
  const recording = Boolean(state) && state?.status !== "finished";
  const shared = useSharedWalk({ recording, activityType: state?.type, controller });

  /** Frames the map before the route has points; a rejected fix is close enough. */
  const lastFix = React.useMemo(() => {
    const point = state?.rawPoints[state.rawPoints.length - 1];

    return point ? { lat: point.latitude, lon: point.longitude } : null;
  }, [state?.rawPoints]);

  /** The map fades up and the card rises in; reset when the walk ends so the next animates too. */
  const enter = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!recording) {
      enter.setValue(0);

      return;
    }

    const animation = Animated.timing(enter, { toValue: 1, duration: ENTER_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true });

    animation.start();

    return () => animation.stop();
  }, [recording, enter]);

  /**
   * Permission and sampling start when the screen opens (not at launch — a
   * location prompt for an unopened feature gets refused), and the receiver is
   * released if it closes without a walk. `releaseIfIdle` is a no-op once an
   * activity exists, which is what lets this screen be closed mid-walk.
   */
  React.useEffect(() => {
    void controller.beginPrepare();

    return () => {
      void controller.releaseIfIdle();
    };
  }, [controller]);

  /**
   * A walk left behind by a crash is offered back, not silently resumed. A
   * finished-but-unsaved one comes back as the summary (see `recover`).
   */
  const [recoveryChecked, setRecoveryChecked] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    void controller.recover().then((recovered) => {
      if (cancelled) {
        return;
      }

      setRecoveryChecked(true);

      if (!recovered || recovered.status === "finished") {
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

  /** Starts immediately — the haptic confirms the tap; there is no countdown to wait through. */
  function beginTracking() {
    if (prepare.permission === "unavailable") {
      Alert.alert(
        "Lumo needs location",
        "Lumo traces your route to measure how far you went. You can turn location on in Settings and start again.",
        [{ text: "OK", onPress: () => router.back() }]
      );

      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    void controller.start({ companions: startingWith });
  }

  /**
   * Recording begins the moment the screen opens, once recovery has been checked
   * (or a crashed walk would be replaced before it could be offered back).
   *
   * `startedRef` stops a second start in the tick before `state` arrives.
   * `leavingRef` is set the moment this screen commits to leaving (save or
   * discard): emptying the tracker sets `state` to null while the screen is still
   * mounted, and without it the effect read that as "no walk yet" and started a
   * fresh one on the way out.
   */
  const startedRef = React.useRef(false);
  const leavingRef = React.useRef(false);

  React.useEffect(() => {
    if (startedRef.current || leavingRef.current || state || !recoveryChecked) {
      return;
    }

    startedRef.current = true;
    beginTracking();
  }, [state, recoveryChecked]);

  async function handleFinish() {
    if (!(await controller.finish())) {
      return;
    }

    await shared.endSharedWalk();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }

  /**
   * Files the activity: history first (the one thing that cannot be recomputed),
   * then the sync queue and the goal/challenge credit.
   */
  async function handleSave() {
    // `leavingRef` too: a second tap in the same frame still sees saving === false.
    if (!state || saving || leavingRef.current) {
      return;
    }

    leavingRef.current = true;
    setSaving(true);

    // Every active habit with a measured target is credited by the walk.
    const measuredHabitIds = habits.filter((habit) => habit.status === "active" && habit.measurement).map((habit) => habit.id);
    const record = toWalkRecordFromActivity(state, measuredHabitIds);

    if (!record) {
      await controller.discard();
      await clearWalkSession();
      router.back();

      return;
    }

    const saved = recordWalk(await loadWalkState(), record);

    await saveWalkState(saved);
    await enqueueWalk(record.id).catch(() => undefined);

    // A walk that carries a measured habit over its target completes it for the
    // walk's own day — once; a habit already done that day is left alone.
    const day = new Date(record.startedAt);
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    // Next midnight, not +24h: a daylight-saving day is 23 or 25 hours long.
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
    const dayKey = toDateKey(day);

    for (const habitId of habitsReachedByWalks(saved.history, habits, dayKey, dayStart, dayEnd)) {
      completeHabit(habitId, dayKey);
    }

    // The engine decides what happened; `checkIntegrity` decides whether it is
    // plausible enough to count. A failure keeps the walk and withholds the claim.
    if (checkIntegrity(state).ok) {
      move.creditActivity(state.distanceMeters, state.startedAt);
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
          // Before the discard: emptying the tracker would trip the auto-start.
          leavingRef.current = true;
          void controller.discard();
          void clearWalkSession().catch(() => undefined);
          router.back();
        }
      }
    ]);
  }

  if (state?.status === "finished") {
    return (
      <WalkSummaryView
        state={state}
        averagePace={averagePace}
        accent={accent}
        companions={companions}
        saving={saving}
        onSave={() => void handleSave()}
        onDiscard={confirmDiscard}
      />
    );
  }

  if (state) {
    const challenge = move.progress;

    return (
      <LiveWalkView
        state={state}
        permission={prepare.permission}
        averagePace={averagePace}
        accent={accent}
        lastFix={lastFix}
        enter={enter}
        challenge={challenge}
        challengeFamily={challenge ? findFamily(challenge.variant.milestoneId) : undefined}
        peers={shared.peers}
        companions={companions}
        onBack={() => router.back()}
        onTogglePause={() => void (state.status === "paused" ? controller.resume() : controller.pause())}
        onFinish={() => void handleFinish()}
      />
    );
  }

  // The moment between the tap and the first activity: the backdrop, the signal,
  // and a way out — so a refused permission is not a dead end.
  return (
    <Screen contentStyle={styles.content} backgroundVariant={null} backgroundNode={<WalkBackground plate="walking" />}>
      <ScreenHeader title="Move" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />
      <View style={{ height: sceneInset }} />
      <View style={styles.starting}>
        <GpsIndicator quality={prepare.quality} accuracyM={prepare.accuracyM} />
        <GpsHint quality={prepare.quality} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md
  },
  starting: {
    alignItems: "center",
    gap: spacing.xs,
    paddingBottom: spacing.md
  }
});
