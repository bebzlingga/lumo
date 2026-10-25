import React from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Icon } from "@/components/Icon";
import { ChallengeRing } from "@/components/move/ChallengeUI";
import { GpsHint, GpsIndicator, Metric, TrackingDebugPanel } from "@/components/move/TrackingUI";
import type { WalkPeer } from "@/components/move/useSharedWalk";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { WalkMap } from "@/components/WalkMap";
import { ctaFill, fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import type { ChallengeProgress } from "@/lib/move/activeChallenge";
import { alpha, readableOn } from "@/lib/color";
import type { MoveMilestoneFamily } from "@/lib/move/challengeDefs";
import { toWalkPoints } from "@/lib/move/tracking/bridge";
import { formatDistance, formatDistanceValue, formatDuration, formatPace } from "@/lib/move/tracking/pace";
import type { ActivityTrackingState } from "@/lib/move/tracking/types";

/**
 * A recording in progress: the map, and one card with the distance, three
 * figures, what the walk feeds (a challenge, a friend's distance) and Finish.
 *
 * Pause/resume live in the page bar beside the map they act on, which keeps the
 * one irreversible control — Finish — away from the one that pauses.
 */
export function LiveWalkView({
  state,
  permission,
  averagePace,
  accent,
  lastFix,
  enter,
  challenge,
  challengeFamily,
  peers,
  companions,
  onBack,
  onTogglePause,
  onFinish
}: {
  state: ActivityTrackingState;
  permission: string | null;
  averagePace: number | null;
  accent: string;
  lastFix: { lat: number; lon: number } | null;
  /** 0 → 1 as the map fades up and the card rises in. */
  enter: Animated.Value;
  challenge: ChallengeProgress | null;
  challengeFamily: MoveMilestoneFamily | undefined;
  peers: WalkPeer[];
  companions: string;
  onBack: () => void;
  onTogglePause: () => void;
  onFinish: () => void;
}) {
  const { palette, isDark } = useLumo();
  const [showDebug, setShowDebug] = React.useState(false);
  const paused = state.status === "paused" || state.status === "autoPaused";
  // Only the walker's own pause can be lifted; an auto-pause lifts itself on the next fix.
  const pausedByUser = state.status === "paused";
  // Acquiring: nothing recorded yet, the walk begins on the first decent fix.
  const preparing = state.status === "preparing";
  const rule = alpha(palette.hairline, "CC");
  const finishColor = paused ? palette.danger : readableOn(ctaFill(isDark), palette.card, 4.5);
  const entering = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }]
  };

  return (
    <Screen
      scroll={false}
      contentStyle={styles.content}
      backgroundVariant={null}
      backgroundNode={
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: enter }]}>
          {/* Centred on you at a fixed zoom; `center` frames it before the route has points. */}
          <WalkMap route={toWalkPoints(state)} accent={accent} style={StyleSheet.absoluteFill} showRecenter={false} center={lastFix} frame="position" />
        </Animated.View>
      }
    >
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: onBack }}
        rightAction={
          preparing
            ? undefined
            : { icon: pausedByUser ? "play" : "pause", label: pausedByUser ? "Resume" : "Pause", iconWeight: "fill", onPress: onTogglePause }
        }
        centerContent={
          // No title over the map; the slot hides the dev diagnostics toggle.
          <Pressable
            accessibilityRole={__DEV__ ? "button" : undefined}
            accessibilityLabel={__DEV__ ? "Tracking diagnostics" : undefined}
            disabled={!__DEV__}
            onPress={() => setShowDebug((current) => !current)}
            style={styles.debugSlot}
          />
        }
      />

      <View pointerEvents="none" style={styles.spacer} />

      {__DEV__ && showDebug ? <TrackingDebugPanel state={state} lastDeltaM={0} /> : null}

      <GpsHint quality={state.gpsQuality} phase={preparing ? "preparing" : state.status === "autoPaused" ? "signalLost" : "tracking"} />

      {permission === "while-running" ? (
        <AppText variant="caption" color={palette.subtle} style={styles.permissionNote}>
          Recording continues with the screen off. Just leave Lumo running — closing it ends the walk.
        </AppText>
      ) : null}

      <Animated.View style={[styles.card, entering, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
        <View style={styles.head}>
          <GpsIndicator quality={state.gpsQuality} accuracyM={state.lastAccuracyM} />
          <AppText color={palette.ink} style={styles.distance} numberOfLines={1}>
            {formatDistanceValue(state.distanceMeters)}
            <AppText color={palette.ink} style={styles.distanceUnit}>
              {" km"}
            </AppText>
          </AppText>
        </View>

        {/* Moving time and AVERAGE pace only: current pace swings fix to fix,
            and a number that moves while you watch it is not one you can act on. */}
        <View style={styles.metrics}>
          <Metric label="Moving" value={formatDuration(state.movingDuration)} />
          <View style={[styles.divider, { backgroundColor: rule }]} />
          <Metric label="Avg. pace" value={averagePace === null ? "—" : formatPace(averagePace)} />
          <View style={[styles.divider, { backgroundColor: rule }]} />
          <Metric label="Steps" value={state.steps === null ? "—" : state.steps.toLocaleString()} />
        </View>

        {challenge && challengeFamily ? (
          <View style={[styles.row, { borderTopColor: rule }]}>
            {/* This walk counted in: "am I getting there", not "where was I at the start". */}
            <ChallengeRing
              ratio={(challenge.currentM + state.distanceMeters) / Math.max(1, challenge.targetM)}
              size={22}
              stroke={4}
              accent={accent}
              track={alpha(palette.hairline, "99")}
            />
            <AppText variant="caption" color={palette.ink} numberOfLines={1} style={styles.rowName}>
              {challengeFamily.title} Challenge
            </AppText>
            <AppText variant="caption" color={palette.muted} numberOfLines={1}>
              {formatDistanceValue(Math.min(challenge.targetM, challenge.currentM + state.distanceMeters))} / {formatDistance(challenge.targetM)}
            </AppText>
          </View>
        ) : null}

        {peers.length > 0 ? (
          <View style={[styles.row, { borderTopColor: rule }]}>
            <Icon name="friends" size={14} color={accent} weight="bulk" />
            <AppText variant="caption" color={palette.ink} numberOfLines={1} style={styles.rowName}>
              {companions || "Together"}
            </AppText>
            <AppText variant="caption" color={palette.muted} numberOfLines={1}>
              {formatDistanceValue(peers.reduce((total, peer) => total + peer.distanceM, 0))} km
            </AppText>
          </View>
        ) : companions ? (
          <View style={styles.companions}>
            <Icon name="friends" size={13} color={palette.muted} weight="bulk" />
            <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.companionsLabel}>
              With {companions}
            </AppText>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Finish"
          onPress={onFinish}
          style={({ pressed }) => [styles.finish, { borderTopColor: rule, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="check" size={16} color={finishColor} weight="bold" />
          <AppText variant="button" color={finishColor}>
            Finish
          </AppText>
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.sm,
    paddingBottom: spacing.xl
  },
  spacer: {
    flex: 1
  },
  debugSlot: {
    alignItems: "center",
    minHeight: 38,
    minWidth: 80
  },
  permissionNote: {
    textAlign: "center",
    maxWidth: 320,
    alignSelf: "center"
  },
  card: {
    gap: spacing.sm,
    paddingHorizontal: spacing.ml,
    paddingVertical: spacing.sm,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  head: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingTop: spacing.sm
  },
  distance: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 52,
    lineHeight: 60,
    marginTop: spacing.xs
  },
  distanceUnit: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 26
  },
  metrics: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: -2
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 2
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: -spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  rowName: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 14,
    lineHeight: 19
  },
  companions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    paddingTop: spacing.xs
  },
  companionsLabel: {
    flexShrink: 1
  },
  finish: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth
  }
});
