import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from "react-native-svg";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { formatHourLabel, type ProgressPoint, type TimeBin } from "@/lib/habitInsights";
import { AppText } from "./ui";

/**
 * Charts for one habit's detail screen. The line chart is drawn with
 * react-native-svg (already a dependency) rather than a charting library — the
 * shapes are simple, and this keeps them on the app's own colour scale.
 *
 * Empty tracks use `alpha` rather than a white tint so a bar reads the same on
 * the cream and the dark card; a white-blended track would glow on dark.
 */

/** Shared by both charts so the two cards keep the same plot proportions. */
const CHART_HEIGHT = 84;
const PLOT_INSET = 8;
/** Where the gridlines sit, as percentages: floor, halfway, ceiling. The line
 *  chart draws these unlabelled — the shape of the trend is the point, not
 *  reading a value off it, so quarter marks were only adding texture. */
const Y_TICKS = [100, 50, 0];
/** Keeps the first and last dot from being clipped in half by the plot edge. */
const X_INSET = 4;

/**
 * Catmull-Rom through every point, emitted as cubic Béziers — a spline reads
 * the trend better than straight segments joining a run of weekly readings.
 *
 * The control points are clamped to the plot box: an unclamped spline overshoots
 * past a peak, and here that would carry the curve above 100% or below 0%, where
 * the area fill spills outside the chart.
 */
function smoothPath(points: { x: number; y: number }[], minY: number, maxY: number) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M${points[0].x},${points[0].y}`;
  }

  const clamp = (value: number) => Math.max(minY, Math.min(maxY, value));
  let path = `M${points[0].x},${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const start = points[index];
    const end = points[index + 1];
    const next = points[index + 2] ?? end;

    const c1x = start.x + (end.x - previous.x) / 6;
    const c1y = clamp(start.y + (end.y - previous.y) / 6);
    const c2x = end.x - (next.x - start.x) / 6;
    const c2y = clamp(end.y - (next.y - start.y) / 6);

    path += ` C${c1x},${c1y} ${c2x},${c2y} ${end.x},${end.y}`;
  }

  return path;
}

/** Completion rate over time, as an area chart with a point per bucket. */
export function ProgressLineChart({ points, accentColor }: { points: ProgressPoint[]; accentColor: string }) {
  const { palette } = useLumo();
  const [width, setWidth] = React.useState(0);

  // No axis labels, so no gutter — the plot runs the full width of the card.
  const plotWidth = Math.max(0, width - X_INSET * 2);
  const plotHeight = CHART_HEIGHT - PLOT_INSET * 2;
  const baseline = CHART_HEIGHT - PLOT_INSET;

  // A single bucket has no line to draw, so it sits centred as a lone point.
  const xFor = (index: number) =>
    X_INSET + (points.length > 1 ? (index / (points.length - 1)) * plotWidth : plotWidth / 2);
  const yFor = (rate: number) => PLOT_INSET + (1 - Math.max(0, Math.min(100, rate)) / 100) * plotHeight;

  const coords = points.map((point, index) => ({ x: xFor(index), y: yFor(point.rate) }));
  const line = smoothPath(coords, PLOT_INSET, baseline);
  const area = coords.length
    ? `${line} L${coords[coords.length - 1].x},${baseline} L${coords[0].x},${baseline} Z`
    : "";

  // Four labels at most, always including the newest bucket, so the axis stays
  // readable at every range without overlapping.
  const labelEvery = Math.max(1, Math.ceil(points.length / 4));

  return (
    <View style={styles.chartBody} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={{ height: CHART_HEIGHT }}>
        {width > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={accentColor} stopOpacity={0.28} />
                <Stop offset="1" stopColor={accentColor} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>

            {Y_TICKS.map((tick) => (
              <Line
                key={tick}
                x1={0}
                y1={yFor(tick)}
                x2={width}
                y2={yFor(tick)}
                // Reference, not structure: the gridlines sit just above the
                // card and never compete with the trend drawn over them.
                stroke={alpha(palette.hairline, "80")}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}

            <Path d={area} fill="url(#progressFill)" />
            <Path d={line} stroke={accentColor} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

            {/* Solid dots rather than knocked-out rings: at this size a ring
                reads as a gap in the line. */}
            {coords.map((coord, index) => (
              <Circle key={index} cx={coord.x} cy={coord.y} r={2} fill={accentColor} />
            ))}
          </Svg>
        ) : null}
      </View>

      <View style={styles.xAxis}>
        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <AppText
              key={index}
              variant="caption"
              color={palette.muted}
              numberOfLines={1}
              // Clamped to the plot box: the newest label is centred on the last
              // point, which sits on the right edge, so half of it would hang
              // outside the card.
              style={[styles.xLabel, { left: Math.min(Math.max(xFor(index) - X_LABEL_WIDTH / 2, 0), Math.max(0, width - X_LABEL_WIDTH)) }]}
            >
              {point.label}
            </AppText>
          ) : null
        )}
      </View>
    </View>
  );
}

const X_LABEL_WIDTH = 52;
/** Floor for a completion-time column, set by its "12 AM" label rather than by
 *  the bar, which would happily sit at half this width. */
const TIME_COLUMN_WIDTH = 34;

/**
 * When in the day the habit gets logged. Bars are plain views — a histogram
 * needs no curve fitting, and this keeps it on the same scale as the heatmap.
 */
export function CompletionTimeChart({ bins, accentColor }: { bins: TimeBin[]; accentColor: string }) {
  const { palette } = useLumo();
  const peak = Math.max(...bins.map((bin) => bin.share), 0);
  // Bars are scaled against a rounded-up 10% step so the tallest never touches
  // the top of the plot. The scale itself goes unlabelled — the shape of the
  // day is the point, not reading a percentage off any one slot.
  const axisMax = Math.max(10, Math.ceil(peak / 10) * 10);

  return (
    // Every slot carries its own label, so the plot needs more width than the
    // card has on a phone and scrolls sideways. `flexGrow` lets the columns
    // stretch to fill instead of scrolling when there is room for all of them.
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeScrollContent}>
      <View style={styles.timeChartBody}>
        <View style={styles.timeBars}>
          {bins.map((bin) => (
            <View
              key={bin.hour}
              style={styles.timeColumn}
              accessibilityRole="text"
              accessibilityLabel={`${formatHourLabel(bin.hour)}: ${bin.share} percent of completions`}
            >
              <View style={styles.timeTrack}>
                {bin.count > 0 ? (
                  <View
                    style={[
                      styles.timeFill,
                      {
                        // The floor keeps a rare-but-real slot visible instead
                        // of collapsing it to nothing.
                        height: `${Math.max((bin.share / axisMax) * 100, 4)}%`,
                        backgroundColor: bin.share === peak ? accentColor : alpha(accentColor, "8C")
                      }
                    ]}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.timeLabelRow}>
          {bins.map((bin) => (
            <View key={bin.hour} style={styles.timeColumn}>
              <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.timeLabel}>
                {formatHourLabel(bin.hour)}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chartBody: {
    minWidth: 0
  },
  xAxis: {
    height: 16,
    marginTop: spacing.xxs
  },
  xLabel: {
    position: "absolute",
    width: X_LABEL_WIDTH,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 14
  },

  timeScrollContent: {
    flexGrow: 1
  },
  timeChartBody: {
    flexGrow: 1
  },
  timeBars: {
    flexDirection: "row",
    gap: 3,
    height: CHART_HEIGHT
  },
  // Wide enough for a full "12 AM" under every bar. Twelve of these overflow a
  // phone-width card, which is what makes the plot scroll.
  timeColumn: {
    flex: 1,
    minWidth: TIME_COLUMN_WIDTH
  },
  timeTrack: {
    flex: 1,
    justifyContent: "flex-end"
  },
  timeFill: {
    width: "100%",
    borderTopLeftRadius: radius.xs,
    borderTopRightRadius: radius.xs
  },
  timeLabelRow: {
    flexDirection: "row",
    gap: 3,
    marginTop: spacing.xxs
  },
  timeLabel: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center"
  },
});
