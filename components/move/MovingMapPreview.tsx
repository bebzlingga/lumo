import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { WalkMap } from "@/components/WalkMap";
import { layout } from "@/constants/theme";
import { MOVE_ROUTE_ACCENT } from "@/constants/tools";
import { useLumo } from "@/context/LumoContext";
import { readableOn } from "@/lib/color";
import type { WalkPoint } from "@/lib/walk";

/**
 * A glimpse of the walk in progress, at the foot of the Move tab.
 *
 * Not a map you use — there is a whole screen for that, one tap away. This is
 * the route as a texture: enough to see the shape of where you have been and
 * that the app is still following you, and no more.
 *
 * ## Why it fades rather than sits in a card
 *
 * A rectangle of map on a cream page reads as a window cut into it, and windows
 * invite panning and pinching. Faded into the canvas on three sides it reads as
 * part of the page instead, and nothing about it suggests it can be dragged —
 * which is right, because it cannot: `pointerEvents` is off and the tap belongs
 * to the block above.
 *
 * ## Full-bleed
 *
 * It escapes the screen's gutter with a negative margin. A fade that stops
 * short of the edge leaves two hard vertical lines exactly where the softness
 * was supposed to be.
 */
export function MovingMapPreview({
  route,
  /** Where to look before the route has a point of its own. */
  center,
  height = 150
}: {
  route: WalkPoint[];
  center?: { lat: number; lon: number } | null;
  height?: number;
}) {
  const { palette } = useLumo();
  const { width } = useWindowDimensions();

  // The same warm orange the tracking screen draws in, walked for contrast so
  // one route is one colour wherever it appears.
  const accent = readableOn(MOVE_ROUTE_ACCENT, palette.white, 4.5);
  // The fade is painted in the page's own colour, which is what makes the map
  // dissolve into it rather than sit behind a grey veil.
  const canvas = palette.canvas;
  /** How far in from each edge the map has fully returned to the page. */
  const sideFade = 0.22;

  return (
    <View style={[styles.wrap, { height, marginHorizontal: -layout.screenPaddingX }]} pointerEvents="none">
      <WalkMap
        route={route}
        accent={accent}
        center={center}
        // Following the walker at a fixed zoom, as on the tracking screen: a
        // frame that pulls back to fit a growing route would end the hour
        // showing a city and a thread.
        frame="position"
        showRecenter={false}
        style={StyleSheet.absoluteFill}
      />

      {/* Three fades in one pass — left, right, and top. The bottom is left
          alone: the page ends there, so there is nothing to blend into. */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="movePreviewSides" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={canvas} stopOpacity="1" />
            <Stop offset={String(sideFade)} stopColor={canvas} stopOpacity="0" />
            <Stop offset={String(1 - sideFade)} stopColor={canvas} stopOpacity="0" />
            <Stop offset="1" stopColor={canvas} stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="movePreviewTop" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={canvas} stopOpacity="1" />
            <Stop offset="0.45" stopColor={canvas} stopOpacity="0.25" />
            <Stop offset="1" stopColor={canvas} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#movePreviewTop)" />
        <Rect x="0" y="0" width={width} height={height} fill="url(#movePreviewSides)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // No radius and no clipping: a rounded corner would draw the edge this is
    // trying not to have.
    overflow: "hidden"
  }
});
