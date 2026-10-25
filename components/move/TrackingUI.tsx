import React from "react";
import { StyleSheet, View, type StyleProp, type TextStyle } from "react-native";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha, readableOn } from "@/lib/color";
import { smoothingShiftM } from "@/lib/move/tracking/smoothing";
import type { ActivityTrackingState, GpsQuality } from "@/lib/move/tracking/types";

/**
 * The pieces the tracking screen is built from.
 *
 * Kept out of the screen so the screen stays a layout, and kept in Lumo's own
 * visual language rather than a fitness app's: one accent, no gauges, no
 * gradients, nothing pulsing.
 */

/** What each signal state is called and coloured, in one place. */
function qualityMeta(quality: GpsQuality, palette: ReturnType<typeof useLumo>["palette"]) {
  switch (quality) {
    case "excellent":
      return { label: "Excellent", tone: palette.greenDark };
    case "good":
      return { label: "Good", tone: palette.greenDark };
    case "weak":
      return { label: "Weak", tone: palette.chartPartial };
    case "poor":
      return { label: "Poor", tone: palette.danger };
    default:
      return { label: "Searching", tone: palette.muted };
  }
}

/**
 * The signal indicator.
 *
 * A dot and a word. It exists so a bad recording is explicable WHILE it is
 * happening — "weak" on screen is the difference between "the app is broken"
 * and "I was under a railway bridge".
 */
export function GpsIndicator({ quality, accuracyM }: { quality: GpsQuality; accuracyM?: number | null }) {
  const { palette } = useLumo();
  const meta = qualityMeta(quality, palette);

  return (
    <View style={[styles.gps, { backgroundColor: alpha(meta.tone, "1F") }]}>
      <View style={[styles.gpsDot, { backgroundColor: meta.tone }]} />
      <AppText variant="caption" color={readableOn(meta.tone, palette.card, 4.5)} style={styles.gpsLabel}>
        GPS {meta.label}
        {typeof accuracyM === "number" ? ` · ±${Math.round(accuracyM)}m` : ""}
      </AppText>
    </View>
  );
}

/**
 * The advice that goes with a bad signal, or nothing when it is fine.
 *
 * `phase` outranks the quality band, because two states are about the recording
 * rather than the reception and have to be said even on a decent signal: the
 * moments before the clock starts, and a pause the tracker took by itself. Both
 * are the app doing something on its own, and neither is allowed to be silent.
 */
export function GpsHint({ quality, phase = "tracking" }: { quality: GpsQuality; phase?: "preparing" | "signalLost" | "tracking" }) {
  const { palette } = useLumo();

  if (phase === "preparing") {
    return (
      <AppText variant="caption" color={palette.subtle} style={styles.hint}>
        Finding your location. Lumo starts recording the moment it has a fix — you do not need to press anything.
      </AppText>
    );
  }

  if (phase === "signalLost") {
    return (
      <AppText variant="caption" color={palette.subtle} style={styles.hint}>
        Paused — no signal to record from. Keep walking: this picks up by itself the moment your location comes back.
      </AppText>
    );
  }

  if (quality === "excellent" || quality === "good") {
    return null;
  }

  return (
    <AppText variant="caption" color={palette.subtle} style={styles.hint}>
      {quality === "unavailable"
        ? "Looking for a signal. Open sky helps — under cover it can take a minute."
        : "Signal is weak here. Lumo keeps recording, but the route may be rough until it improves."}
    </AppText>
  );
}

/** One number and its label. The screen's whole readout is a few of these. */
export function Metric({
  label,
  value,
  large = false,
  /**
   * Overrides for a readout that is not on the app's own canvas.
   *
   * The share card can be laid over the walker's photo, where `palette.ink` may
   * be invisible — so the colours and an outline style come from the caller
   * rather than being read from the theme. Omitted everywhere else, which keeps
   * every other Metric on the palette.
   */
  color,
  labelColor,
  textStyle
}: {
  label: string;
  value: string;
  large?: boolean;
  color?: string;
  labelColor?: string;
  textStyle?: StyleProp<TextStyle>;
}) {
  const { palette } = useLumo();
  /**
   * "—" is the absence of a figure, so it is not set like one.
   *
   * At the same weight and size as a real number it read as a value in its own
   * right — a row of dashes looked like a reading of nothing rather than
   * nothing to read.
   */
  const missing = value === "—";

  return (
    <View style={styles.metric}>
      <AppText
        color={missing ? (labelColor ?? palette.muted) : (color ?? palette.ink)}
        style={[missing ? styles.metricMissing : large ? styles.metricValueLarge : styles.metricValue, textStyle]}
        numberOfLines={1}
      >
        {value}
      </AppText>
      <AppText variant="caption" color={labelColor ?? palette.muted} numberOfLines={1} style={textStyle}>
        {label}
      </AppText>
    </View>
  );
}

/**
 * The field-testing overlay.
 *
 * Never rendered unless a caller explicitly asks for it, and the only caller
 * gates on `__DEV__`. Everything a bad recording raises is here: what the
 * receiver claimed, what the filter decided, and what the tracker thinks the
 * person is doing — because the alternative is walking two kilometres and
 * guessing.
 */
export function TrackingDebugPanel({
  state,
  lastDeltaM
}: {
  state: ActivityTrackingState;
  /** Metres the most recent fix contributed. */
  lastDeltaM: number;
}) {
  const { palette } = useLumo();
  const last = state.rawPoints[state.rawPoints.length - 1];
  const accepted = state.rawPoints.filter((point) => point.isAccepted).length;

  const rows: [string, string][] = [
    ["GPS", `${state.gpsQuality}${state.lastAccuracyM === null ? "" : ` ±${Math.round(state.lastAccuracyM)}m`}`],
    ["Raw speed", last?.speed === null || last?.speed === undefined ? "—" : `${last.speed.toFixed(1)} m/s`],
    ["Delta", `${lastDeltaM.toFixed(1)} m`],
    ["Accepted", last ? (last.isAccepted ? "YES" : `NO · ${last.rejectionReason}`) : "—"],
    ["Points", `${accepted} of ${state.rawPoints.length}`],
    ["Movement", state.movement],
    ["Status", state.status],
    // What the smoother is doing to the line. A few metres is it reading the
    // receiver; tens of metres is it arguing with one.
    [
      "Smoothed",
      last?.drawLatitude === undefined || last.drawLongitude === undefined
        ? "—"
        : `${smoothingShiftM(last, { latitude: last.drawLatitude, longitude: last.drawLongitude }).toFixed(1)} m`
    ],
    // How close this is to auto-pausing, which is otherwise invisible until it
    // happens — and the whole point of walking around with this panel open.
    ["Located", `${Math.round((state.lastTickAt - state.lastLocatedAt) / 1000)}s ago`],
    ["Segments", String(state.segments.length)],
    ["Moving", `${Math.round(state.movingDuration / 1000)}s`],
    ["Elapsed", `${Math.round(state.elapsedDuration / 1000)}s`]
  ];

  return (
    <View style={[styles.debug, { backgroundColor: alpha(palette.ink, "E6") }]}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.debugRow}>
          <AppText variant="caption" color={palette.white} style={styles.debugLabel}>
            {label}
          </AppText>
          <AppText variant="caption" color={palette.white} numberOfLines={1}>
            {value}
          </AppText>
        </View>
      ))}
    </View>
  );
}


const styles = StyleSheet.create({
  gps: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill
  },
  gpsLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  hint: {
    textAlign: "center",
    maxWidth: 300,
    alignSelf: "center"
  },
  metric: {
    flex: 1,
    alignItems: "center",
    gap: 2
  },
  metricValue: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 20,
    lineHeight: 26
  },
  metricMissing: {
    fontFamily: fontFamilies.lexend,
    fontSize: 15,
    lineHeight: 26
  },
  metricValueLarge: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 40,
    lineHeight: 48
  },
  debug: {
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.card
  },
  debugRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  debugLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  challenge: {
    gap: spacing.xs
  },
  challengeHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  challengeTitle: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    overflow: "hidden"
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill
  },
  fillBanked: {
    position: "absolute",
    left: 0,
    top: 0
  }
});
