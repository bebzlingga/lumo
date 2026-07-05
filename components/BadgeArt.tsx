import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Polygon } from "react-native-svg";
import { fontFamilies } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import type { BadgeTierKey } from "@/lib/badges";
import { AppText } from "./ui";

/**
 * Badge art drawn in code so it follows the active palette: the ribbon and
 * center disc pick up theme colors (and dark mode) while the frame keeps its
 * tier metal. Each tier has its own silhouette, rising in ornament:
 * bronze = plain medal, silver = scalloped rosette, gold = starburst,
 * platinum = shield hexagon, diamond = faceted gem. Locked badges render in
 * the palette's muted grays.
 */
const PETAL_COUNT = 12;

const petals = Array.from({ length: PETAL_COUNT }, (_, index) => {
  const angle = (index / PETAL_COUNT) * Math.PI * 2;

  return {
    cx: 50 + 32 * Math.cos(angle),
    cy: 50 + 32 * Math.sin(angle)
  };
});

function starPoints(cx: number, cy: number, outer: number, inner: number, spikes: number) {
  const points: string[] = [];

  for (let index = 0; index < spikes * 2; index++) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (index / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;

    points.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
  }

  return points.join(" ");
}

function hexPoints(cx: number, cy: number, radius: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * Math.PI * 2 - Math.PI / 2;

    return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
  }).join(" ");
}

export function BadgeArt({
  threshold,
  tier,
  accent,
  earned,
  size = 88
}: {
  threshold: number;
  tier: BadgeTierKey;
  accent: string;
  earned: boolean;
  size?: number;
}) {
  const { palette } = useLumo();
  const frame = earned ? accent : palette.chartTrack;
  const ribbon = earned ? palette.greenDark : alpha(palette.subtle, "33");
  const disc = earned ? palette.card : alpha(palette.subtle, "14");
  const ring = earned ? alpha(accent, "66") : alpha(palette.subtle, "26");
  const numberColor = earned ? palette.ink : palette.subtle;
  const captionColor = earned ? palette.subtle : alpha(palette.subtle, "99");
  const showRibbon = tier === "bronze" || tier === "silver" || tier === "gold";

  return (
    <View style={{ width: size, height: size * 1.2 }}>
      <Svg width={size} height={size * 1.2} viewBox="0 0 100 120">
        {showRibbon ? (
          <>
            <Path d="M34 78 L24 112 L37 104 L43 116 L50 84 Z" fill={ribbon} />
            <Path d="M66 78 L76 112 L63 104 L57 116 L50 84 Z" fill={ribbon} />
          </>
        ) : null}

        {tier === "bronze" ? (
          <>
            <Circle cx={50} cy={50} r={38} fill={frame} />
            <Circle cx={50} cy={50} r={33} stroke={disc} strokeWidth={1.5} fill="none" opacity={0.7} />
          </>
        ) : null}

        {tier === "silver" ? (
          <>
            {petals.map((petal, index) => (
              <Circle key={index} cx={petal.cx} cy={petal.cy} r={9.5} fill={frame} />
            ))}
            <Circle cx={50} cy={50} r={36} fill={frame} />
          </>
        ) : null}

        {tier === "gold" ? (
          <>
            <Polygon points={starPoints(50, 50, 45, 34, 12)} fill={frame} />
            <Circle cx={50} cy={50} r={34} fill={frame} />
          </>
        ) : null}

        {tier === "platinum" ? (
          <>
            <Polygon points={hexPoints(50, 50, 44)} fill={frame} />
            <Polygon points={hexPoints(50, 50, 37)} stroke={disc} strokeWidth={1.5} fill="none" opacity={0.7} />
          </>
        ) : null}

        {tier === "diamond" ? (
          <>
            <Path d="M84 12 l2.4 6 l6 2.4 l-6 2.4 l-2.4 6 l-2.4 -6 l-6 -2.4 l6 -2.4 Z" fill={frame} />
            <Path d="M13 26 l1.8 4.5 l4.5 1.8 l-4.5 1.8 l-1.8 4.5 l-1.8 -4.5 l-4.5 -1.8 l4.5 -1.8 Z" fill={frame} opacity={0.8} />
            <Path d="M28 20 L72 20 L90 42 L50 108 L10 42 Z" fill={frame} />
            <Path d="M28 20 L50 52 M72 20 L50 52 M10 42 L50 52 M90 42 L50 52 M50 52 L50 108" stroke={ring} strokeWidth={1.8} />
          </>
        ) : null}

        {tier === "diamond" ? (
          <Polygon points="36,32 64,32 74,44 50,82 26,44" fill={disc} />
        ) : (
          <>
            <Circle cx={50} cy={50} r={28} fill={disc} />
            <Circle cx={50} cy={50} r={28} stroke={ring} strokeWidth={2.5} fill="none" />
          </>
        )}
      </Svg>
      {/* The caption below the number would otherwise push the number above
          the disc's center, so the stack is nudged down by half its height. */}
      <View style={[styles.label, { width: size, height: size, transform: [{ translateY: size * 0.045 }] }]} pointerEvents="none">
        <AppText
          color={numberColor}
          style={{ fontFamily: "Lexend-Black", fontSize: size * 0.22, lineHeight: size * 0.22, textAlign: "center", includeFontPadding: false }}
        >
          {threshold}
        </AppText>
        <AppText
          color={captionColor}
          style={{
            fontFamily: fontFamilies.lexendBold,
            fontSize: size * 0.08,
            letterSpacing: 1,
            textAlign: "center",
            includeFontPadding: false,
            marginTop: -size * 0.035
          }}
        >
          DAYS
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center"
  }
});
