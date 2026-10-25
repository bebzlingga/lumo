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
  /**
   * What the unfilled part is painted.
   *
   * Defaults to the hairline wash every inline bar uses. A bar carrying a page
   * on its own passes a tint of its own accent instead: at nought per cent the
   * track IS the readout, and a grey rule reads as a divider rather than as a
   * distance nobody has walked yet.
   */
  track,
  height = 8,
  style
}: {
  ratio: number;
  accent: string;
  label?: string;
  track?: string;
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
      style={[styles.track, { height, borderRadius: height, backgroundColor: track ?? alpha(palette.hairline, "80") }, style]}
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
  /**
   * `alignSelf: stretch`, and it is not decoration — without it the bar can
   * vanish outright.
   *
   * The track has no width of its own: it is a row of one child whose width is
   * a PERCENTAGE of it. In a column that stretches its children — which is
   * every ordinary card — that resolves fine. Inside a container that centres
   * them, the track falls back to hugging its content, the fill has no parent
   * width to be a percentage of, and the whole bar lays out at zero wide. It
   * does not misdraw, it is simply not there, which is a hard thing to see in a
   * component whose empty state is a faint wash.
   *
   * Stretching here rather than at each call site because there is no case for
   * a bar that hugs its fill, and a caller that genuinely wants a narrower one
   * still overrides it with `style`.
   */
  track: {
    alignSelf: "stretch",
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
