import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { AppText } from "@/components/ui";
import { radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import type { WalkPoint } from "@/lib/walk";

/**
 * The shape of a walk, drawn on nothing.
 *
 * No tiles, no streets, no labels — the line you covered and where it started
 * and ended. That is the whole picture on a summary card: nobody is navigating
 * from it, and the map underneath was carrying roads and place names for a
 * route that already says everything it has to say.
 *
 * Costs nothing that a map costs. No native module, no API key, no network,
 * and it renders identically offline and on Android. `react-native-svg` is
 * already here for the badge rings and the award confetti.
 *
 * Kept separate from `WalkMap` rather than folded into it: the live screen
 * genuinely needs a map — you are looking at where you ARE — and this one is
 * for looking at where you WENT.
 */

/** Fraction of the box left empty around the path, so it never touches an edge. */
const INSET = 0.08;

/**
 * Projects the fixes into the drawing box.
 *
 * Longitude is scaled by `cos(latitude)` before anything else, which is what
 * keeps the shape honest: a degree of longitude is a degree of latitude only at
 * the equator, and skipping it draws every route in the UK about 40% too wide.
 *
 * The path is then fitted with ONE scale for both axes, so a walk up and down
 * the same street stays a thin line rather than being stretched to fill a
 * square it was never the shape of.
 */
function projectRoute(points: WalkPoint[], width: number, height: number): { x: number; y: number }[] {
  if (points.length === 0) {
    return [];
  }

  const midLat = points.reduce((total, point) => total + point.lat, 0) / points.length;
  const lonScale = Math.cos((midLat * Math.PI) / 180);

  const raw = points.map((point) => ({ x: point.lon * lonScale, y: -point.lat }));
  const xs = raw.map((point) => point.x);
  const ys = raw.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const boxW = width * (1 - INSET * 2);
  const boxH = height * (1 - INSET * 2);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  // A walk that never left one spot has no span at all; anything finite keeps
  // the single point in the middle instead of dividing by zero.
  const scale = spanX === 0 && spanY === 0 ? 0 : Math.min(spanX === 0 ? Infinity : boxW / spanX, spanY === 0 ? Infinity : boxH / spanY);

  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = (width - drawnW) / 2;
  const offsetY = (height - drawnH) / 2;

  return raw.map((point) => ({
    x: scale === 0 ? width / 2 : offsetX + (point.x - minX) * scale,
    y: scale === 0 ? height / 2 : offsetY + (point.y - minY) * scale
  }));
}

export function WalkRoute({
  route,
  accent,
  width,
  height = 180,
  rejected
}: {
  route: WalkPoint[];
  accent: string;
  width: number;
  height?: number;
  /**
   * Fixes the filter threw out, drawn in red beside the route in green.
   *
   * DEVELOPMENT ONLY. The single caller gates on `__DEV__`, and it must stay
   * that way: a normal user seeing red dots scattered around their walk would
   * reasonably conclude the app had recorded it wrong, when the opposite is
   * true — those are the points it correctly refused to count.
   */
  rejected?: WalkPoint[];
}) {
  const { palette } = useLumo();

  const projected = React.useMemo(() => projectRoute(route, width, height), [route, width, height]);
  /**
   * Projected against the ROUTE's bounds, not their own.
   *
   * A rejected fix half a kilometre away has to appear half a kilometre away.
   * Fitting them to their own box would put a teleport neatly beside the path
   * it teleported from, which is the one thing this view exists to show.
   */
  const projectedRejects = React.useMemo(
    () => (rejected && rejected.length > 0 ? projectRoute([...route, ...rejected], width, height).slice(route.length) : []),
    [rejected, route, width, height]
  );

  if (projected.length === 0) {
    return (
      <View style={[styles.empty, { width, height, backgroundColor: palette.surface }]}>
        <AppText variant="caption" color={palette.muted}>
          No route recorded
        </AppText>
      </View>
    );
  }

  const start = projected[0];
  const end = projected[projected.length - 1];

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {projected.length > 1 ? (
          <Polyline
            points={projected.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={accent}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {projectedRejects.map((point, index) => (
          <Circle key={`rejected-${index}`} cx={point.x} cy={point.y} r={3} fill={palette.danger} opacity={0.8} />
        ))}

        {/* Where it began and where it ended. On a loop these land on top of
            each other, which is exactly what a loop should look like. */}
        <Circle cx={start.x} cy={start.y} r={7} fill={palette.greenDark} stroke={palette.white} strokeWidth={2.5} />
        <Circle cx={end.x} cy={end.y} r={7} fill={accent} stroke={palette.white} strokeWidth={2.5} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.card,
    padding: spacing.md
  }
});
