import type { ImageSourcePropType } from "react-native";

/**
 * Streak badges are unlocked by a habit's best day-streak. Each milestone
 * ships a full-color art (earned) and a greyscale art (locked). Milestones are
 * grouped into rising tiers, from Bronze up to Diamond.
 * Asset requires must be static string literals so Metro can bundle them.
 */
export type BadgeTierKey = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export type Badge = {
  threshold: number;
  tier: BadgeTierKey;
  color: ImageSourcePropType;
  locked: ImageSourcePropType;
};

export type BadgeTierMeta = {
  key: BadgeTierKey;
  name: string;
  subtitle: string;
  accent: string;
};

export const badgeTierMeta: Record<BadgeTierKey, BadgeTierMeta> = {
  bronze: { key: "bronze", name: "Bronze", subtitle: "building the habit", accent: "#C6803F" },
  silver: { key: "silver", name: "Silver", subtitle: "gaining momentum", accent: "#8FA1B3" },
  gold: { key: "gold", name: "Gold", subtitle: "in full stride", accent: "#E0AE3A" },
  platinum: { key: "platinum", name: "Platinum", subtitle: "unstoppable rhythm", accent: "#5F9BB0" },
  diamond: { key: "diamond", name: "Diamond", subtitle: "all the way to legend", accent: "#5BC6D6" }
};

export const badges: Badge[] = [
  { threshold: 3, tier: "bronze", color: require("../assets/badges/badge-3-color.png"), locked: require("../assets/badges/badge-3-locked.png") },
  { threshold: 10, tier: "bronze", color: require("../assets/badges/badge-10-color.png"), locked: require("../assets/badges/badge-10-locked.png") },
  { threshold: 15, tier: "bronze", color: require("../assets/badges/badge-15-color.png"), locked: require("../assets/badges/badge-15-locked.png") },
  { threshold: 20, tier: "silver", color: require("../assets/badges/badge-20-color.png"), locked: require("../assets/badges/badge-20-locked.png") },
  { threshold: 30, tier: "silver", color: require("../assets/badges/badge-30-color.png"), locked: require("../assets/badges/badge-30-locked.png") },
  { threshold: 50, tier: "silver", color: require("../assets/badges/badge-50-color.png"), locked: require("../assets/badges/badge-50-locked.png") },
  { threshold: 100, tier: "gold", color: require("../assets/badges/badge-100-color.png"), locked: require("../assets/badges/badge-100-locked.png") },
  { threshold: 150, tier: "gold", color: require("../assets/badges/badge-150-color.png"), locked: require("../assets/badges/badge-150-locked.png") },
  { threshold: 200, tier: "gold", color: require("../assets/badges/badge-200-color.png"), locked: require("../assets/badges/badge-200-locked.png") },
  { threshold: 250, tier: "platinum", color: require("../assets/badges/badge-250-color.png"), locked: require("../assets/badges/badge-250-locked.png") },
  { threshold: 300, tier: "platinum", color: require("../assets/badges/badge-300-color.png"), locked: require("../assets/badges/badge-300-locked.png") },
  { threshold: 500, tier: "platinum", color: require("../assets/badges/badge-500-color.png"), locked: require("../assets/badges/badge-500-locked.png") },
  { threshold: 650, tier: "diamond", color: require("../assets/badges/badge-650-color.png"), locked: require("../assets/badges/badge-650-locked.png") },
  { threshold: 850, tier: "diamond", color: require("../assets/badges/badge-850-color.png"), locked: require("../assets/badges/badge-850-locked.png") },
  { threshold: 1000, tier: "diamond", color: require("../assets/badges/badge-1000-color.png"), locked: require("../assets/badges/badge-1000-locked.png") }
];

export type BadgeProgress = Badge & {
  earned: boolean;
  source: ImageSourcePropType;
};

export function habitBadges(streak: number): BadgeProgress[] {
  return badges.map((badge) => {
    const earned = streak >= badge.threshold;
    return { ...badge, earned, source: earned ? badge.color : badge.locked };
  });
}

export type BadgeTierGroup = BadgeTierMeta & { badges: BadgeProgress[] };

export function badgesByTier(streak: number): BadgeTierGroup[] {
  const progress = habitBadges(streak);

  return (Object.keys(badgeTierMeta) as BadgeTierKey[]).map((key) => ({
    ...badgeTierMeta[key],
    badges: progress.filter((badge) => badge.tier === key)
  }));
}

export function earnedBadgeCount(streak: number) {
  return badges.reduce((count, badge) => (streak >= badge.threshold ? count + 1 : count), 0);
}

export function nextBadge(streak: number): Badge | null {
  return badges.find((badge) => streak < badge.threshold) ?? null;
}

/**
 * The badge to surface as a user's "current" achievement: the highest earned
 * milestone in full color, or the first milestone (still locked) when none are
 * earned.
 */
export function currentBadge(streak: number): { threshold: number; earned: boolean; source: ImageSourcePropType } {
  let earnedBadge: Badge | null = null;

  for (const badge of badges) {
    if (streak >= badge.threshold) {
      earnedBadge = badge;
    }
  }

  if (earnedBadge) {
    return { threshold: earnedBadge.threshold, earned: true, source: earnedBadge.color };
  }

  return { threshold: badges[0].threshold, earned: false, source: badges[0].locked };
}
