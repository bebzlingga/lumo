import type { ImageSourcePropType } from "react-native";

/**
 * Move badge art — one illustration per milestone, in two states.
 *
 * A registry rather than a path built at the call site, because Metro resolves
 * `require` statically: `require(\`.../\${id}.webp\`)` does not work in React
 * Native, and a missing rung would fail at runtime rather than at build time.
 * Adding a milestone means adding a row here, and TypeScript then insists both
 * states exist.
 *
 * All fourteen are normalised to a 600 × 600 canvas with the badge shape at a
 * fixed height, so locked and unlocked render identically and a badge does not
 * jump size the moment it is earned. The originals were not: they arrived in
 * three different frames with the artwork off-centre in several. See
 * `assets/move/README.md` for the recipe.
 */
type BadgeArt = { locked: ImageSourcePropType; unlocked: ImageSourcePropType };

const MOVE_BADGE_ART: Record<string, BadgeArt> = {
  "1k": {
    locked: require("../assets/move/badges/locked/1k.webp") as ImageSourcePropType,
    unlocked: require("../assets/move/badges/unlocked/1k.webp") as ImageSourcePropType
  },
  "5k": {
    locked: require("../assets/move/badges/locked/5k.webp") as ImageSourcePropType,
    unlocked: require("../assets/move/badges/unlocked/5k.webp") as ImageSourcePropType
  },
  "10k": {
    locked: require("../assets/move/badges/locked/10k.webp") as ImageSourcePropType,
    unlocked: require("../assets/move/badges/unlocked/10k.webp") as ImageSourcePropType
  },
  "25k": {
    locked: require("../assets/move/badges/locked/25k.webp") as ImageSourcePropType,
    unlocked: require("../assets/move/badges/unlocked/25k.webp") as ImageSourcePropType
  },
  "50k": {
    locked: require("../assets/move/badges/locked/50k.webp") as ImageSourcePropType,
    unlocked: require("../assets/move/badges/unlocked/50k.webp") as ImageSourcePropType
  },
  "100k": {
    locked: require("../assets/move/badges/locked/100k.webp") as ImageSourcePropType,
    unlocked: require("../assets/move/badges/unlocked/100k.webp") as ImageSourcePropType
  },
  "300k": {
    locked: require("../assets/move/badges/locked/300k.webp") as ImageSourcePropType,
    unlocked: require("../assets/move/badges/unlocked/300k.webp") as ImageSourcePropType
  }
};

/**
 * The art for a milestone, or undefined when a rung has none yet.
 *
 * Undefined rather than a placeholder image, so the caller can fall back to the
 * drawn hexagon — a ladder can grow a rung before its illustration is ready
 * without shipping a broken tile.
 */
export function moveBadgeArt(milestoneId: string, unlocked: boolean): ImageSourcePropType | undefined {
  const art = MOVE_BADGE_ART[milestoneId];

  return art ? (unlocked ? art.unlocked : art.locked) : undefined;
}

export function hasMoveBadgeArt(milestoneId: string): boolean {
  return milestoneId in MOVE_BADGE_ART;
}
