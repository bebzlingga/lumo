/**
 * Streak badges are unlocked by a habit's best day-streak. Badge art is drawn
 * in code (components/BadgeArt) so it follows the active theme; each milestone
 * belongs to a rising tier, from Bronze up to Diamond.
 */
export type BadgeTierKey = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export type Badge = {
  threshold: number;
  tier: BadgeTierKey;
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
  { threshold: 3, tier: "bronze" },
  { threshold: 10, tier: "bronze" },
  { threshold: 15, tier: "bronze" },
  { threshold: 20, tier: "silver" },
  { threshold: 30, tier: "silver" },
  { threshold: 50, tier: "silver" },
  { threshold: 100, tier: "gold" },
  { threshold: 150, tier: "gold" },
  { threshold: 200, tier: "gold" },
  { threshold: 250, tier: "platinum" },
  { threshold: 300, tier: "platinum" },
  { threshold: 500, tier: "platinum" },
  { threshold: 650, tier: "diamond" },
  { threshold: 850, tier: "diamond" },
  { threshold: 1000, tier: "diamond" }
];

export type BadgeProgress = Badge & {
  earned: boolean;
};

export function habitBadges(streak: number): BadgeProgress[] {
  return badges.map((badge) => ({ ...badge, earned: streak >= badge.threshold }));
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
 * milestone, or the first milestone (still locked) when none are earned.
 */
export function currentBadge(streak: number): BadgeProgress {
  let earnedBadge: Badge | null = null;

  for (const badge of badges) {
    if (streak >= badge.threshold) {
      earnedBadge = badge;
    }
  }

  if (earnedBadge) {
    return { ...earnedBadge, earned: true };
  }

  return { ...badges[0], earned: false };
}
