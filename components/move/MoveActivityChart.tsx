import React from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { AppText } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { areaPath, linePath, type ChartCurve } from "@/lib/move/chart";

/**
 * How tall the plot is, and how much room the peak's label needs above it.
 *
 * 108 is the shortest this can be and still show a shape: under about 90 a day
 * at half the week's best and a day at its best land close enough together that
 * the line reads as flat, which is the one thing a trend chart must not do.
 *
 * The headroom is not decoration — the peak's own marker and its label sit in it.
 * Without it the tallest point is drawn ON the top edge, half the dot clipped.
 *
 * 22 rather than the 18 that just fits: the label is centred OVER the peak's dot
 * on any peak that is not at either end, so the two are on the same vertical.
 * At 18 the caption's baseline cleared the top of the dot by about a pixel, which
 * is not clearance, it is a near miss.
 */
const PLOT_HEIGHT = 108;
const LABEL_HEADROOM = 22;

/**
 * The line's weight, and the dots' radius.
 *
 * 2 and 4: thin enough that the line is a reading of the days rather than a bar
 * in its own right, and a 8pt dot is the smallest that still reads as a
 * deliberate marker instead of a kink in the stroke.
 */
const LINE_WIDTH = 2;
const DOT_RADIUS = 4;

/** One day in the window. `metres` is the whole day, both sources — see `dayDistance`. */
export type ActivityPoint = {
  dateKey: string;
  metres: number;
};

/**
 * Daily distance as a line, over whatever window the caller hands it.
 *
 * Two callers, two windows, one chart: Stats draws the last fortnight, and the
 * goal block draws the elapsed part of its period. Everything below is written
 * about the fortnight because that is the case it was cut for, and every word
 * of it holds at seven points or at thirty.
 *
 * ## Why a line, and why this window
 *
 * The figures above it answer "how much" — all-time, today, the two rolling
 * windows — and the list below answers "which days". Neither answers the
 * question somebody actually opens Stats with, which is whether they are keeping
 * it up. That is change over time, and change over time is a line.
 *
 * A fortnight because it is the shortest window with a SHAPE in it: a week is
 * the list underneath in another form, and thirty points across a phone's width
 * puts the days about 10pt apart, where the line stops being readable and
 * becomes texture. Fourteen also spans two of whatever weekly rhythm somebody
 * has, so a Sunday walker sees two peaks rather than one and a slope.
 *
 * ## What it draws, and what it deliberately does not
 *
 * One series, so no legend — the heading names it. The area under the line is a
 * wash rather than a second colour: it gives the line a body to be read against
 * without becoming a shape competing with it.
 *
 * Two dots and one label, not fourteen. A number on every point is a table
 * pretending to be a chart, and the table already exists directly below this.
 * The best day is labelled because it is the only figure the chart itself owes
 * you — the scale — and today is dotted because it is where the eye lands last.
 *
 * Rest days are drawn at zero rather than skipped. A line that hops over them
 * shows a fortnight of walking that never happened; a line that touches the
 * floor shows the rest days, which are the honest half of the record.
 */
export function MoveActivityChart({
  points,
  /** The line and the dots. Pass Move's `accent.glyph` — already walked for contrast on a card. */
  color,
  /**
   * The wash under the line.
   *
   * On by default, and turned off where the line is the whole point. The area
   * gives a chart WEIGHT — it reads as a quantity, a volume of walking piled up
   * under the days — which is right when the chart is the section and there is
   * nothing else on the page saying how much. It is wrong directly under a
   * progress bar: the bar is already a filled shape saying how much, and a
   * second filled shape under it makes two blocks of the same colour competing
   * to be the total. Stripped back to a line, the two stop arguing — one says
   * how far in, the other says what the days looked like.
   */
  showArea = true,
  /** How the points are joined — see `linePath`. Smoothed unless asked otherwise. */
  curve = "smooth",
  todayKey
}: {
  /** Oldest FIRST. Fourteen of them on Stats; any length is drawn. */
  points: ActivityPoint[];
  color: string;
  showArea?: boolean;
  curve?: ChartCurve;
  todayKey: string;
}) {
  const { palette, isDark } = useLumo();
  /**
   * Measured rather than computed from the window.
   *
   * The chart sits inside whatever the page puts it in — a section that may be
   * inset, on a screen whose padding is not this component's business. Laying it
   * out from `useWindowDimensions` means guessing that padding, and the guess is
   * wrong the moment the page changes.
   */
  const [width, setWidth] = React.useState(0);
  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  /**
   * The best day in the window — the chart's ceiling, and the one figure it
   * names. Undefined only for an empty `points`, which draws nothing.
   */
  const peak = React.useMemo(
    (): ActivityPoint | undefined =>
      points.reduce<ActivityPoint | undefined>(
        (best, point) => (best === undefined || point.metres > best.metres ? point : best),
        undefined
      ),
    [points]
  );

  /**
   * Where each day sits, and the two paths drawn from that.
   *
   * The scale starts at zero always — a chart of distance whose floor is the
   * quietest day would show a 200m stroll and a 6km walk as the same climb. The
   * top is the fortnight's best, so the shape fills the plot whatever the
   * numbers happen to be.
   */
  const geometry = React.useMemo(() => {
    if (width <= 0 || points.length < 2 || peak === undefined) {
      return null;
    }

    const bottom = LABEL_HEADROOM + PLOT_HEIGHT;
    // Inset by the dot, so the first and last markers are drawn whole rather
    // than half-clipped against the sides of the canvas.
    const left = DOT_RADIUS;
    const right = Math.max(left + 1, width - DOT_RADIUS);
    const step = (right - left) / (points.length - 1);
    // Never zero: an all-rest fortnight would divide by it, and every point
    // belongs on the floor in that case anyway.
    const ceiling = Math.max(1, peak.metres);

    const plotted = points.map((point, index) => ({
      x: left + index * step,
      y: bottom - (Math.max(0, point.metres) / ceiling) * PLOT_HEIGHT,
      point
    }));

    const line = linePath(plotted, curve);

    return { plotted, bottom, line, area: areaPath(line, plotted, bottom) };
  }, [width, points, peak, curve]);

  const peakMarker = geometry?.plotted.find((entry) => entry.point.dateKey === peak?.dateKey);
  const todayMarker = geometry?.plotted[geometry.plotted.length - 1];
  /**
   * The peak's label, pushed off whichever side would run it out of the canvas.
   *
   * A best day in the middle of the fortnight centres over its dot; one at
   * either end would otherwise be laid out half off the chart, so those two
   * anchor to the edge instead.
   */
  const peakLabelStyle =
    peakMarker && width > 0
      ? peakMarker.x < width * 0.2
        ? { left: 0 }
        : peakMarker.x > width * 0.8
          ? { right: 0 }
          : { left: peakMarker.x - 40, width: 80, textAlign: "center" as const }
      : null;

  return (
    /**
     * Summarised for a screen reader rather than read out piece by piece.
     *
     * `accessible` collapses the whole thing to ONE element: the peak's figure
     * and the two axis ends are captions on a picture, and announced separately
     * they are three fragments that never add up to the shape. The label says
     * what the line says, and the day list below is the same fortnight in full —
     * which is where somebody goes for the figures themselves.
     */
    <View
      onLayout={handleLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        peak
          ? `Daily distance over the last ${points.length} days. Best day ${(peak.metres / 1000).toFixed(1)} kilometres.`
          : "Daily distance"
      }
      style={styles.chart}
    >
      {geometry ? (
        <>
          {/* The scale, stated once. The chart's own vertical extent means
              nothing until one number on it is named, and the best day is the
              one worth naming — every other height is read against it. */}
          <AppText variant="caption" color={palette.muted} style={[styles.peakLabel, peakLabelStyle]}>
            {((peak?.metres ?? 0) / 1000).toFixed(1)} km
          </AppText>

          <Svg width={width} height={LABEL_HEADROOM + PLOT_HEIGHT}>
            {showArea ? (
              <Defs>
                {/* Strongest against the line and gone by the floor: a flat fill
                    reads as a filled shape whose top edge happens to be the
                    data, where a fade reads as the line casting the area rather
                    than the area carrying the line. */}
                <LinearGradient id="moveActivityWash" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity={isDark ? 0.28 : 0.2} />
                  <Stop offset="1" stopColor={color} stopOpacity="0" />
                </LinearGradient>
              </Defs>
            ) : null}

            {/* The floor. A hairline in the page's own rule colour, not the
                series colour — it is the chart's furniture, and furniture the
                same colour as the data reads as data. */}
            <Path
              d={`M0 ${geometry.bottom} L${width} ${geometry.bottom}`}
              stroke={palette.hairline}
              strokeWidth={StyleSheet.hairlineWidth}
            />

            {showArea ? <Path d={geometry.area} fill="url(#moveActivityWash)" /> : null}
            <Path
              d={geometry.line}
              stroke={color}
              strokeWidth={LINE_WIDTH}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />

            {/* Today last, so it is drawn OVER the peak's marker on the day the
                two are the same — one dot with a ring, rather than two dots
                fighting for the same 8pt. */}
            {peakMarker ? <Circle cx={peakMarker.x} cy={peakMarker.y} r={DOT_RADIUS} fill={color} /> : null}
            {todayMarker ? (
              <>
                {/* A ring in the page's own ground, which is what separates this
                    dot from the line running under it. `canvas` and not `card`:
                    the Stats page draws straight onto the walking plate, and the
                    plate is washed back to the canvas colour behind its content. */}
                <Circle cx={todayMarker.x} cy={todayMarker.y} r={DOT_RADIUS + 2} fill={palette.canvas} />
                <Circle cx={todayMarker.x} cy={todayMarker.y} r={DOT_RADIUS} fill={color} />
              </>
            ) : null}
          </Svg>

          {/* Both ends named, nothing between them. Fourteen dates along the
              foot is a row of unreadable stubs; the two that matter are where
              the window starts and that the right-hand end is now. */}
          <View style={styles.axis}>
            {/* `length - 1`, not `length`: the leftmost point is the START of
                the window, so a fortnight's chart opens thirteen days back and
                today is the fourteenth. */}
            <AppText variant="caption" color={palette.muted} style={styles.axisLabel}>
              {points.length - 1} days ago
            </AppText>
            <AppText variant="caption" color={palette.muted} style={styles.axisLabel}>
              {points[points.length - 1]?.dateKey === todayKey ? "Today" : "Latest"}
            </AppText>
          </View>
        </>
      ) : (
        // Holds the space while the width is being measured, so the section does
        // not snap taller on the second frame.
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    width: "100%"
  },
  placeholder: {
    height: LABEL_HEADROOM + PLOT_HEIGHT
  },
  // Absolute, in the headroom above the plot: in the flow it would push the
  // canvas down and the label would sit over nothing.
  peakLabel: {
    position: "absolute",
    top: 0,
    fontFamily: fontFamilies.lexendSemiBold
  },
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.xxs
  },
  axisLabel: {
    fontSize: 11,
    lineHeight: 15
  }
});
