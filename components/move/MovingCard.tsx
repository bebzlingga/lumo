import React from "react";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { useMoveAccent } from "@/components/move/ChallengeUI";
import { MovingMapPreview } from "@/components/move/MovingMapPreview";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import type { Friendship } from "@/lib/friends";
import { alpha } from "@/lib/color";
import { toWalkPoints } from "@/lib/move/tracking/bridge";
import { formatDistanceValue, formatDuration } from "@/lib/move/tracking/pace";
import type { ActivityTrackingState } from "@/lib/move/tracking/types";

/**
 * A walk in progress, reported rather than argued for: the distance, the moving
 * time, who came along, and the route so far. The whole block is the way back to
 * the map. No card around it — the figure is the page talking.
 */
export function MovingCard({
  activity,
  avatarByName,
  onPress
}: {
  activity: ActivityTrackingState;
  avatarByName: Map<string, Friendship["profile"]["avatar"]>;
  onPress: () => void;
}) {
  const { palette } = useLumo();
  const accent = useMoveAccent();
  const paused = activity.status === "paused" || activity.status === "autoPaused";
  const tone = paused ? palette.danger : accent.glyph;
  const lastFix = React.useMemo(() => {
    const point = activity.rawPoints[activity.rawPoints.length - 1];

    return point ? { lat: point.latitude, lon: point.longitude } : null;
  }, [activity.rawPoints]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to your walk"
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.chip, { backgroundColor: alpha(tone, "1F") }]}>
        <AppText variant="caption" color={tone} style={styles.chipLabel}>
          {paused ? "Paused" : "Moving now"}
        </AppText>
      </View>

      <AppText color={palette.ink} style={styles.value} numberOfLines={1}>
        {formatDistanceValue(activity.distanceMeters)}
        <AppText color={palette.ink} style={styles.unit}>
          {" km"}
        </AppText>
      </AppText>

      <AppText variant="caption" color={palette.muted}>
        {formatDuration(activity.movingDuration)} moving · tap to open
      </AppText>

      {/* Names and a shared clock only: a plain move has no session on the
          server, so nobody else's distance is known. */}
      {activity.companions?.length ? (
        <View style={styles.with}>
          {activity.companions.map((name, index) => {
            const avatar = avatarByName.get(name);

            return (
              <View
                key={name}
                style={[styles.withRow, index === 0 ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }]}
              >
                {avatar ? (
                  <Avatar config={avatar} size={34} />
                ) : (
                  <View style={[styles.withFallback, { backgroundColor: alpha(palette.hairline, "80") }]}>
                    <Icon name="user" size={16} color={palette.muted} weight="bulk" />
                  </View>
                )}
                <AppText variant="caption" color={palette.ink} numberOfLines={1} style={styles.withName}>
                  {name}
                </AppText>
                <AppText variant="caption" color={palette.muted}>
                  With you
                </AppText>
              </View>
            );
          })}
        </View>
      ) : null}

      <MovingMapPreview route={toWalkPoints(activity)} center={lastFix} height={160} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingTop: spacing.md
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill
  },
  chipLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  value: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 62,
    lineHeight: 72
  },
  // Half the figure, as everywhere else the two appear together.
  unit: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 31
  },
  with: {
    width: "75%",
    paddingTop: spacing.sm
  },
  withRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48
  },
  withFallback: {
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: radius.pill
  },
  withName: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 14,
    lineHeight: 19
  }
});
