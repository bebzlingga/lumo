import { MedalIcon } from "phosphor-react-native/src/icons/Medal";
import { TrophyIcon } from "phosphor-react-native/src/icons/Trophy";
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { GroupChallengeTier, TrophyVariant } from "@/constants/groupChallenges";

type CustomIconProps = { variant?: string; color?: string; size?: number };

// Gold — "star4": a filled star with a lower ribbon accent (the two-tone bulk look).
function Star4Icon({ color = "#000", size = 24 }: CustomIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M17.1696 10.9C16.8896 11.18 16.7596 11.58 16.8296 11.97L17.2696 14.49C17.3796 15.12 17.1296 15.75 16.5996 16.12C16.0896 16.5 15.4096 16.54 14.8296 16.24L14.4596 16.05L12.5496 15.05C12.2096 14.87 11.7796 14.87 11.4396 15.05L9.52957 16.05L9.15957 16.24C8.59957 16.54 7.91957 16.5 7.38957 16.12C6.86957 15.74 6.60957 15.12 6.71957 14.49L7.15957 11.97C7.22957 11.58 7.08957 11.18 6.81957 10.9L4.98957 9.11C4.51957 8.68 4.36957 8.01 4.55957 7.4C4.74957 6.8 5.26957 6.36 5.89957 6.27L8.42957 5.9C8.81957 5.84 9.15957 5.6 9.33957 5.24L10.4696 2.93H10.4996C10.7896 2.36 11.3596 2 11.9896 2C12.6196 2 13.2096 2.37 13.4896 2.93L14.6196 5.24C14.7996 5.6 15.1396 5.84 15.5296 5.9L18.0596 6.27C18.6896 6.36 19.2196 6.8 19.3996 7.4C19.5896 8.01 19.4296 8.68 18.9696 9.11L17.1396 10.9H17.1696Z"
        fill={color}
      />
      <Path
        opacity={0.4}
        d="M14.9 22H9.10004C8.34004 22 7.80004 21.26 8.04004 20.54L9.10004 17.34C9.28004 17.29 9.46004 17.22 9.63004 17.13L11.9 15.94C11.96 15.91 12.04 15.92 12.09 15.94L14.37 17.13C14.54 17.22 14.71 17.29 14.89 17.33L15.96 20.54C16.2 21.26 15.66 22 14.9 22Z"
        fill={color}
      />
    </Svg>
  );
}

// Diamond — "enhance-prize": a trophy cup with a sparkle accent (two-tone bulk).
function EnhancePrizeIcon({ color = "#000", size = 24 }: CustomIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        opacity={0.4}
        d="M6.91 12H6.44C3.99 12 2 10.01 2 7.55997V5.32997C2 4.71997 2.5 4.21997 3.11 4.21997H6.44V9.77997C6.44 10.57 6.6 11.32 6.91 12Z"
        fill={color}
      />
      <Path
        d="M17.34 21.5399C17.14 21.8299 16.8 21.9999 16.44 21.9999H7.56C7.2 21.9999 6.86 21.8299 6.66 21.5399C6.45 21.2499 6.39 20.8799 6.5 20.5399L6.87 19.4299C7.02 18.9699 7.45 18.6699 7.93 18.6699H16.07C16.55 18.6699 16.98 18.9699 17.13 19.4299L17.5 20.5399C17.61 20.8799 17.55 21.2499 17.34 21.5399Z"
        fill={color}
      />
      <Path d="M12.75 15.33V18.67H11.25V15.33C11.25 15.33 11.25 15.29 11.26 15.27C11.5 15.31 11.75 15.33 12 15.33C12.25 15.33 12.5 15.31 12.74 15.28C12.75 15.3 12.75 15.31 12.75 15.33Z" fill={color} />
      <Path
        d="M13.77 14.5C13.2 14.34 12.81 13.84 12.81 13.23C12.81 12.62 13.19 12.12 13.79 11.95L14.75 11.7C15.26 11.55 15.63 11.18 15.77 10.68L16.03 9.73L16.09 9.56C16.28 9.06 16.73 8.75 17.28 8.75C17.38 8.75 17.47 8.77 17.56 8.79V3.11C17.56 2.5 17.06 2 16.44 2H7.56C6.94 2 6.44 2.5 6.44 3.11V9.78C6.44 10.57 6.6 11.32 6.91 12C7.18 12.64 7.58 13.22 8.07 13.71C8.91 14.55 10.02 15.12 11.26 15.27C11.5 15.31 11.75 15.33 12 15.33C12.25 15.33 12.5 15.31 12.74 15.28C13.38 15.2 13.98 14.99 14.53 14.71L13.77 14.5Z"
        fill={color}
      />
      <Path
        opacity={0.4}
        d="M20.89 4.21997H17.56V8.78997C17.99 8.87997 18.35 9.15997 18.51 9.56997L18.82 10.69C18.92 11.06 19.16 11.36 19.47 11.55C20.96 10.83 22 9.31997 22 7.55997V5.32997C22 4.71997 21.5 4.21997 20.89 4.21997Z"
        fill={color}
      />
      <Path
        d="M20.81 13.25C20.81 13.32 20.77 13.48 20.58 13.54L19.6 13.81C18.75 14.04 18.11 14.68 17.88 15.53L17.62 16.49C17.56 16.71 17.39 16.73 17.31 16.73C17.23 16.73 17.06 16.71 17 16.49L16.74 15.52C16.51 14.68 15.86 14.04 15.02 13.81L14.05 13.55C13.84 13.49 13.82 13.31 13.82 13.24C13.82 13.16 13.84 12.98 14.05 12.92L15.03 12.66C15.87 12.42 16.51 11.78 16.74 10.94L17.02 9.91997C17.09 9.74997 17.25 9.71997 17.31 9.71997C17.37 9.71997 17.54 9.73997 17.6 9.89997L17.88 10.93C18.11 11.77 18.76 12.41 19.6 12.65L20.6 12.93C20.8 13.01 20.81 13.19 20.81 13.25Z"
        fill={color}
      />
    </Svg>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Phosphor + custom icons share a loose prop shape
const TIER_ICON: Record<GroupChallengeTier, React.ComponentType<any>> = {
  bronze: MedalIcon,
  silver: TrophyIcon,
  gold: Star4Icon,
  diamond: EnhancePrizeIcon
};

// --- decorative touches (drawn behind the icon, in a 64×64 space) -----------
// Four-point twinkle — quadratic controls at the centre pinch the arms to points.
function sparklePath(cx: number, cy: number, s: number): string {
  return (
    `M${cx},${cy - s} Q${cx},${cy} ${cx + s},${cy}` +
    ` Q${cx},${cy} ${cx},${cy + s} Q${cx},${cy} ${cx - s},${cy} Q${cx},${cy} ${cx},${cy - s} Z`
  );
}

// Short radiating ticks (a corona / burst) around the icon.
function ticksPath(cx: number, cy: number, r1: number, r2: number, angles: number[]): string {
  return angles
    .map((a) => {
      const rad = (a * Math.PI) / 180;
      return (
        `M${(cx + Math.sin(rad) * r1).toFixed(1)},${(cy - Math.cos(rad) * r1).toFixed(1)}` +
        ` L${(cx + Math.sin(rad) * r2).toFixed(1)},${(cy - Math.cos(rad) * r2).toFixed(1)}`
      );
    })
    .join(" ");
}

const SPARKLES: Record<GroupChallengeTier, { x: number; y: number; s: number }[]> = {
  bronze: [
    { x: 51, y: 15, s: 2.4 },
    { x: 13, y: 48, s: 1.7 }
  ],
  silver: [
    { x: 52, y: 14, s: 2.6 },
    { x: 11, y: 18, s: 1.9 },
    { x: 15, y: 49, s: 1.6 }
  ],
  gold: [
    { x: 53, y: 13, s: 2.8 },
    { x: 10, y: 16, s: 2.0 },
    { x: 49, y: 50, s: 1.7 }
  ],
  diamond: [
    { x: 54, y: 17, s: 2.8 },
    { x: 9, y: 18, s: 2.6 }
  ]
};

// Ray bursts — Gold gets a small crown of top rays, Diamond a full corona.
const RAY_ANGLES: Partial<Record<GroupChallengeTier, number[]>> = {
  gold: [-54, -36, -18, 0, 18, 36, 54],
  diamond: [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180]
};

/**
 * A tier's award icon with escalating decorative touches layered behind it:
 *   bronze — a couple of sparkles · silver — more sparkles ·
 *   gold — a crown of rays + sparkles · diamond — a full corona of rays + sparkles.
 * The icon is chosen by `tier` (bronze medal, silver award, gold star, diamond
 * prize) and everything is tinted with `color` (the tier accent, muted when locked).
 * `variant` is accepted for backwards compatibility but no longer affects the art.
 */
export function TrophyGraphic({
  tier = "bronze",
  color,
  size = 56
}: {
  variant?: TrophyVariant;
  tier?: GroupChallengeTier;
  color: string;
  size?: number;
}) {
  const IconComponent = TIER_ICON[tier];
  const iconSize = Math.round(size * 0.82);
  const sparkles = SPARKLES[tier];
  const rays = RAY_ANGLES[tier];
  const rayRadii = tier === "diamond" ? { r1: 27, r2: 31 } : { r1: 23, r2: 28 };

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} viewBox="0 0 64 64" style={StyleSheet.absoluteFill} pointerEvents="none">
        {rays ? (
          <Path d={ticksPath(32, 32, rayRadii.r1, rayRadii.r2, rays)} stroke={color} strokeWidth={1.4} strokeLinecap="round" opacity={0.55} />
        ) : null}
        {sparkles.map((sp, index) => (
          <Path key={index} d={sparklePath(sp.x, sp.y, sp.s)} fill={color} opacity={0.95} />
        ))}
      </Svg>
      <IconComponent weight="duotone" duotoneOpacity={0.35} color={color} size={iconSize} />
    </View>
  );
}
