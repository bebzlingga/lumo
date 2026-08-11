import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { AppText } from "@/components/ui";
import { MILESTONE_TIER_ACCENT, type Milestone } from "@/constants/milestones";
import { fontFamilies } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha, readableOn, shadeWithBlack } from "@/lib/color";

/**
 * A milestone's badge — the hexagon carrying "1K", "10K", "100K".
 *
 * Drawn in code rather than shipped as art, the same call `components/BadgeArt`
 * makes for the streak badges: the ladder gains rungs, each rung wants a face
 * with its own number on it, and six illustrations that have to be redrawn
 * whenever a target moves is a worse trade than a path and a label.
 *
 * An unpassed badge is the same shape, drained. Not a different picture and not
 * a padlock: the point of showing it at all is that you can see what is coming,
 * which needs the face you will eventually have.
 */

/**
 * The hexagon, point-up, on a 100 × 110 canvas.
 *
 * Point-up rather than flat-top because that is the shape the reference badges
 * use, and because the vertical point gives the short label more room to sit in
 * than a flat top of the same width would.
 */
const HEX_PATH = "M50 2 L96 29 L96 81 L50 108 L4 81 L4 29 Z";

const VIEW_BOX = "0 0 100 110";

export function MilestoneBadge({
  milestone,
  earned = true,
  size = 56
}: {
  milestone: Milestone;
  /** False draws the same face drained, for a marker not yet passed. */
  earned?: boolean;
  size?: number;
}) {
  const { palette, isDark } = useLumo();

  const accent = MILESTONE_TIER_ACCENT[milestone.tier];
  /**
   * Two stops of the one hue rather than a flat fill — a hexagon in a single
   * colour reads as a shape, and the same hexagon with a light face and a
   * shaded lower half reads as a medal. `shadeWithBlack` keeps the darker stop
   * on the same hue instead of drifting toward grey.
   */
  const top = earned ? accent : palette.muted;
  const bottom = earned ? shadeWithBlack(accent, 0.28) : shadeWithBlack(palette.muted, 0.18);
  /**
   * The number sits ON the badge, so it is walked against the badge's own fill
   * rather than the card's — white clears 4.5:1 on the deeper tiers and not on
   * gold, which is exactly the case a fixed colour would get wrong.
   */
  const label = readableOn(palette.white, bottom, 4.5);
  // A drained badge should recede, not vanish: still legible, clearly not won.
  const opacity = earned ? 1 : isDark ? 0.4 : 0.32;
  const gradientId = `milestone-${milestone.id}-${earned ? "on" : "off"}`;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={earned ? `${milestone.name}, passed` : `${milestone.name}, not yet`}
      style={[styles.wrap, { width: size, height: size * 1.1, opacity }]}
    >
      <Svg width={size} height={size * 1.1} viewBox={VIEW_BOX}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>
        </Defs>
        <Path d={HEX_PATH} fill={`url(#${gradientId})`} />
        {/* An inner rim, in the badge's own hue lightened — it reads as the
            bevel on a medal and stops the flat SVG edge looking like a sticker. */}
        <Path d={HEX_PATH} fill="none" stroke={alpha(palette.white, "59")} strokeWidth={4} />
      </Svg>

      <View pointerEvents="none" style={styles.labelWrap}>
        <AppText color={label} numberOfLines={1} style={[styles.label, { fontSize: size * 0.3 }]}>
          {milestone.short}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center"
  },
  labelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  label: {
    fontFamily: fontFamilies.lexendBold,
    // The hexagon's own point-up geometry puts its visual middle slightly above
    // the box's, so the label follows it up rather than sitting low.
    marginTop: -2
  }
});
