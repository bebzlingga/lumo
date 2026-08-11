import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui";
import { radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";

/**
 * The one progress bar Move uses everywhere.
 *
 * Soft, rounded and thin — §41. Deliberately not a ring or a chart: this shows
 * up on the today card, on goals, on milestones, on the journey and inside
 * group challenges, and one shape used six times reads as a design rather than
 * six shapes reading as a dashboard.
 *
 * ## Progress is never communicated by colour alone (§48)
 *
 * Every use carries a text value beside it — "2.8 / 5 km" — and the bar itself
 * has a visible track, so the fill is legible as a LENGTH. Someone who cannot
 * separate the fill colour from the track still has the number and the
 * proportion.
 */
export function MoveProgressBar({
  ratio,
  accent,
  /** Announced to a screen reader in place of the raw ratio. */
  label,
  height = 8,
  style
}: {
  ratio: number;
  accent: string;
  label?: string;
  height?: number;
  style?: object;
}) {
  const { palette } = useLumo();
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent, text: label }}
      style={[styles.track, { height, borderRadius: height, backgroundColor: alpha(palette.hairline, "80") }, style]}
    >
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accent, borderRadius: height }]} />
    </View>
  );
}

/**
 * A label-and-value row above a bar. The pairing is so common that keeping it
 * together stops each screen re-inventing the spacing.
 */
export function MoveProgressRow({
  label,
  value,
  ratio,
  accent
}: {
  label: string;
  value: string;
  ratio: number;
  accent: string;
}) {
  const { palette } = useLumo();

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <AppText variant="bodySmall" color={palette.body} numberOfLines={1} style={styles.headLabel}>
          {label}
        </AppText>
        <AppText variant="bodySmall" color={palette.ink} numberOfLines={1}>
          {value}
        </AppText>
      </View>
      <MoveProgressBar ratio={ratio} accent={accent} label={`${label}, ${value}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: "hidden"
  },
  fill: {
    height: "100%"
  },
  row: {
    gap: spacing.xs
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  headLabel: {
    flex: 1
  },
  // Exported so callers can match the bar's corner on adjacent surfaces.
  card: {
    borderRadius: radius.card
  }
});
