import React from "react";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * Full-screen sunset backdrop for the Challenges screen. Unlike ChallengesHeroArt
 * (a fixed-height boxed scene used by the nav tile), the mountain ground here runs
 * all the way to the bottom of the screen, so the only visible edge is the ridge
 * silhouette — the ground gradient flows seamlessly under the list with no seam.
 */
export function ChallengesBackdrop({ width, height, insetTop }: { width: number; height: number; insetTop: number }) {
  if (width <= 0 || height <= 0) {
    return null;
  }

  const w = width;
  const h = height;
  const horizon = insetTop + 172;

  // Front ridge — tall summit right-of-centre — then fills to the very bottom.
  const front =
    `M0,${horizon + 20}` +
    ` L${w * 0.16},${horizon - 4}` +
    ` L${w * 0.33},${horizon + 14}` +
    ` L${w * 0.5},${horizon - 12}` +
    ` L${w * 0.72},${horizon - 44}` +
    ` L${w * 0.86},${horizon - 6}` +
    ` L${w},${horizon - 18}` +
    ` L${w},${h} L0,${h} Z`;

  // Distant range sits behind and higher; only the band above the front ridge shows.
  const distant =
    `M0,${horizon - 8}` +
    ` L${w * 0.2},${horizon - 48}` +
    ` L${w * 0.38},${horizon - 16}` +
    ` L${w * 0.56},${horizon - 58}` +
    ` L${w * 0.76},${horizon - 22}` +
    ` L${w * 0.9},${horizon - 50}` +
    ` L${w},${horizon - 24}` +
    ` L${w},${h} L0,${h} Z`;

  return (
    <Svg width={w} height={h} pointerEvents="none">
      <Defs>
        <LinearGradient id="cbSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F6A860" />
          <Stop offset="1" stopColor="#B85226" />
        </LinearGradient>
        <LinearGradient id="cbGround" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7A3115" />
          <Stop offset="1" stopColor="#2E1409" />
        </LinearGradient>
        <LinearGradient id="cbSun" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE9A8" />
          <Stop offset="1" stopColor="#FFC24D" />
        </LinearGradient>
      </Defs>

      {/* sky fills the whole screen; the ground paints over the lower part */}
      <Rect x="0" y="0" width={w} height={h} fill="url(#cbSky)" />

      {/* sun */}
      <Circle cx={w * 0.8} cy={insetTop + 44} r={40} fill="#FFFFFF" opacity={0.08} />
      <Circle cx={w * 0.8} cy={insetTop + 44} r={24} fill="url(#cbSun)" opacity={0.92} />

      {/* clouds */}
      <Ellipse cx={w * 0.2} cy={insetTop + 30} rx={34} ry={9} fill="#FFFFFF" opacity={0.1} />
      <Ellipse cx={w * 0.31} cy={insetTop + 40} rx={22} ry={7} fill="#FFFFFF" opacity={0.08} />

      {/* mountains — both ranges run to the bottom, so there is no horizontal seam */}
      <Path d={distant} fill="#A84A20" opacity={0.55} />
      <Path d={front} fill="url(#cbGround)" />
    </Svg>
  );
}
