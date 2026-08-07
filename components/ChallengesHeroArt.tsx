import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * The green mountain-summit scene used by the Challenges header. Extracted so
 * the Challenges nav tile on the group screen can share the exact same artwork.
 *
 * Fills its parent completely: it self-measures via an absolute-fill wrapper and
 * feeds explicit pixel dimensions to the Svg — a percentage-sized Svg doesn't
 * resolve against a content-sized (flex) parent, which would leave gaps. Pass
 * width/height to skip the measure (e.g. when the parent already knows its size).
 * The viewBox + slice keep the summit anchored bottom-centre as it scales.
 */
export function ChallengesHeroArt({
  width,
  height,
  transparentSky = false
}: {
  width?: number;
  height?: number;
  // Skips the opaque sky + bottom shade so a screen-level gradient shows through
  // and the scene blends seamlessly into the rest of the screen.
  transparentSky?: boolean;
}) {
  const [measured, setMeasured] = React.useState({ w: 0, h: 0 });
  const w = width ?? measured.w;
  const h = height ?? measured.h;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(event) => setMeasured({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })}
    >
      {w > 0 && h > 0 ? (
        <Svg width={w} height={h} viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice">
          <Defs>
            <LinearGradient id="chSky" x1="0" y1="0" x2="0.2" y2="1">
              <Stop offset="0" stopColor="#F6A860" />
              <Stop offset="1" stopColor="#B85226" />
            </LinearGradient>
            <LinearGradient id="chSun" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFE9A8" />
              <Stop offset="1" stopColor="#FFC24D" />
            </LinearGradient>
            <LinearGradient id="chShade" x1="0" y1="0.35" x2="0" y2="1">
              <Stop offset="0" stopColor="#3A1608" stopOpacity="0" />
              <Stop offset="1" stopColor="#3A1608" stopOpacity="0.6" />
            </LinearGradient>
          </Defs>
          {transparentSky ? null : <Rect x="0" y="0" width="400" height="200" fill="url(#chSky)" />}
          {/* sun */}
          <Circle cx="322" cy="48" r="42" fill="#FFFFFF" opacity="0.08" />
          <Circle cx="322" cy="48" r="26" fill="url(#chSun)" opacity="0.92" />
          {/* clouds */}
          <Ellipse cx="86" cy="44" rx="34" ry="10" fill="#FFFFFF" opacity="0.1" />
          <Ellipse cx="118" cy="50" rx="22" ry="8" fill="#FFFFFF" opacity="0.08" />
          <Ellipse cx="250" cy="36" rx="26" ry="8" fill="#FFFFFF" opacity="0.07" />
          {/* distant range */}
          <Path d="M0,150 L70,96 L140,140 L220,80 L300,132 L360,100 L400,138 L400,200 L0,200 Z" fill="#FFFFFF" opacity="0.1" />
          {/* front mountains — tallest peak sits off-centre to the right */}
          <Path d="M0,200 L0,178 L68,152 L138,172 L206,146 L300,104 L362,152 L400,142 L400,200 Z" fill="#5A2410" opacity="0.38" />
          {/* bottom shade so overlaid text stays legible */}
          {transparentSky ? null : <Rect x="0" y="0" width="400" height="200" fill="url(#chShade)" />}
        </Svg>
      ) : null}
    </View>
  );
}
