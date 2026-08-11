import type { ImageSourcePropType } from "react-native";

/**
 * Illustrated streak badges — Lumo holding a shield with the day count on it,
 * in `assets/badges/unlocked` — and their locked counterparts in
 * `assets/badges/locked`, drawn in greys with a padlock on the shield.
 *
 * WHY EACH ENTRY CARRIES A SCALE
 * The illustrations were drawn independently, so the badge sits at a different
 * size inside each canvas: it fills 65% of the height in `locked/60` but 87% in
 * `360`. Rendered at one box size they come out visibly unequal — a third
 * bigger in places. `scale` normalises that, derived by measuring each file's
 * opaque bounding box so every badge draws its artwork at ART_HEIGHT of the
 * tile. `offsetY` re-centres art that sits high in its canvas.
 *
 * Regenerate both by measuring the alpha bounding box of each PNG if the art is
 * ever redrawn; they are not values to guess at.
 */
export type BadgeArt = {
  source: ImageSourcePropType;
  /** Multiplier on the tile size so every badge draws at the same art height. */
  scale: number;
  /** Fraction of the tile to shift down, re-centring art drawn high. */
  offsetY: number;
};

/** Art height as a fraction of the tile, the target every `scale` normalises to. */
export const BADGE_ART_HEIGHT = 0.86;

const badgeArt: Record<number, { earned: BadgeArt; locked: BadgeArt }> = {
  1: {
    earned: { source: require("../assets/badges/unlocked/1.webp"), scale: 1.116, offsetY: 0.067 },
    locked: { source: require("../assets/badges/locked/1.webp"), scale: 1.111, offsetY: 0.052 }
  },
  3: {
    earned: { source: require("../assets/badges/unlocked/3.webp"), scale: 1.06, offsetY: 0.049 },
    locked: { source: require("../assets/badges/locked/3.webp"), scale: 0.992, offsetY: 0.029 }
  },
  7: {
    earned: { source: require("../assets/badges/unlocked/7.webp"), scale: 0.97, offsetY: 0.058 },
    locked: { source: require("../assets/badges/locked/7.webp"), scale: 1.089, offsetY: 0.035 }
  },
  14: {
    earned: { source: require("../assets/badges/unlocked/14.webp"), scale: 1.126, offsetY: 0.05 },
    locked: { source: require("../assets/badges/locked/14.webp"), scale: 1.029, offsetY: 0.031 }
  },
  30: {
    earned: { source: require("../assets/badges/unlocked/30.webp"), scale: 1.035, offsetY: 0.035 },
    locked: { source: require("../assets/badges/locked/30.webp"), scale: 1.111, offsetY: 0.058 }
  },
  60: {
    earned: { source: require("../assets/badges/unlocked/60.webp"), scale: 1.216, offsetY: 0.055 },
    locked: { source: require("../assets/badges/locked/60.webp"), scale: 1.314, offsetY: 0.039 }
  },
  120: {
    earned: { source: require("../assets/badges/unlocked/120.webp"), scale: 1.035, offsetY: 0.048 },
    locked: { source: require("../assets/badges/locked/120.webp"), scale: 1.106, offsetY: 0.017 }
  },
  360: {
    earned: { source: require("../assets/badges/unlocked/360.webp"), scale: 1.069, offsetY: 0.037 },
    locked: { source: require("../assets/badges/locked/360.webp"), scale: 1.004, offsetY: 0.019 }
  }
};

export function badgeArtFor(threshold: number, earned = true): BadgeArt | undefined {
  return badgeArt[threshold]?.[earned ? "earned" : "locked"];
}
