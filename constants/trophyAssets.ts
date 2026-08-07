import type { ImageSourcePropType } from "react-native";

/**
 * Illustrated group trophies — the coloured award in `assets/trophies/unlocked`
 * and its greyed, padlocked counterpart in `assets/trophies/locked`. The same
 * treatment the streak badges get, so an award looks like an award whether it
 * belongs to one person or to a group.
 *
 * WHY THERE IS NO PER-FILE SCALE HERE
 * `badgeAssets` carries a measured `scale`/`offsetY` per illustration because
 * those were drawn independently and sit at wildly different sizes inside their
 * canvases. These were not: measuring every file's opaque bounding box gives a
 * longest art dimension of 0.90–0.91 of the (square) canvas across all 32, each
 * centred to within 0.3%. So `contain` at a square box already draws every
 * trophy at the same extent, and a normalising table would be a lookup full of
 * 1.0s. If the art is ever redrawn, re-measure before trusting that.
 *
 * Keyed by trophy id (`groupTrophies[].id`) rather than by filename: the files
 * are named for the trophy's TITLE, which is copy and can be reworded, while
 * the id is the stable handle the rest of the app already uses.
 */
export type TrophyArt = {
  earned: ImageSourcePropType;
  locked: ImageSourcePropType;
};

const trophyArt: Record<string, TrophyArt> = {
  // Bronze — the first wins.
  "bronze-completions": {
    earned: require("../assets/trophies/unlocked/bronze-first-wins.webp"),
    locked: require("../assets/trophies/locked/bronze-first-wins.webp")
  },
  "bronze-streak": {
    earned: require("../assets/trophies/unlocked/bronze-warming-up.webp"),
    locked: require("../assets/trophies/locked/bronze-warming-up.webp")
  },
  "bronze-members": {
    earned: require("../assets/trophies/unlocked/bronze-first-steps.webp"),
    locked: require("../assets/trophies/locked/bronze-first-steps.webp")
  },
  "bronze-challenge": {
    earned: require("../assets/trophies/unlocked/bronze-on-the-board.webp"),
    locked: require("../assets/trophies/locked/bronze-on-the-board.webp")
  },

  // Silver — building momentum.
  "silver-completions": {
    earned: require("../assets/trophies/unlocked/silver-team-effort.webp"),
    locked: require("../assets/trophies/locked/silver-team-effort.webp")
  },
  "silver-streak": {
    earned: require("../assets/trophies/unlocked/silver-on-a-roll.webp"),
    locked: require("../assets/trophies/locked/silver-on-a-roll.webp")
  },
  "silver-members": {
    earned: require("../assets/trophies/unlocked/silver-full-squad.webp"),
    locked: require("../assets/trophies/locked/silver-full-squad.webp")
  },
  "silver-challenge": {
    earned: require("../assets/trophies/unlocked/silver-challenger.webp"),
    locked: require("../assets/trophies/locked/silver-challenger.webp")
  },

  // Gold — serious commitment.
  "gold-completions": {
    earned: require("../assets/trophies/unlocked/gold-double-century.webp"),
    locked: require("../assets/trophies/locked/gold-double-century.webp")
  },
  "gold-streak": {
    earned: require("../assets/trophies/unlocked/gold-unstoppable.webp"),
    locked: require("../assets/trophies/locked/gold-unstoppable.webp")
  },
  "gold-rollcall": {
    earned: require("../assets/trophies/unlocked/gold-reliable.webp"),
    locked: require("../assets/trophies/locked/gold-reliable.webp")
  },
  "gold-challenge": {
    earned: require("../assets/trophies/unlocked/gold-dedicated.webp"),
    locked: require("../assets/trophies/locked/gold-dedicated.webp")
  },

  // Diamond — legendary.
  "diamond-completions": {
    earned: require("../assets/trophies/unlocked/diamond-elite.webp"),
    locked: require("../assets/trophies/locked/diamond-elite.webp")
  },
  "diamond-streak": {
    earned: require("../assets/trophies/unlocked/diamond-legends.webp"),
    locked: require("../assets/trophies/locked/diamond-legends.webp")
  },
  "diamond-rollcall": {
    earned: require("../assets/trophies/unlocked/diamond-ironclad.webp"),
    locked: require("../assets/trophies/locked/diamond-ironclad.webp")
  },
  "diamond-challenge": {
    earned: require("../assets/trophies/unlocked/diamond-champion.webp"),
    locked: require("../assets/trophies/locked/diamond-champion.webp")
  }
};

export function trophyArtFor(id: string, earned = true): ImageSourcePropType | undefined {
  return trophyArt[id]?.[earned ? "earned" : "locked"];
}
