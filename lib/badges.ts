/**
 * Streak badges are unlocked by the best ACTIVITY streak — consecutive days on
 * which anything at all was checked in, see `bestActivityStreak`. Not the best
 * run of a single habit: these reward turning up in Lumo, so a week spent
 * checking in on a different habit each day counts as a week.
 *
 * Badge art is drawn in code (components/BadgeArt) so it follows the active
 * theme; each milestone belongs to a rising tier, Bronze up to Diamond.
 */
export type BadgeTierKey = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export type Badge = {
  threshold: number;
  tier: BadgeTierKey;
  /** Named for Lumo, who is a spark: the light grows as the streak does. */
  name: string;
  /** One line for the badge dialog — what this milestone actually means. */
  description: string;
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

/**
 * The ladder is front-loaded on purpose: the first four rungs land inside the
 * first fortnight, because a badge you can almost touch is what actually pulls
 * someone back tomorrow. The later ones spread out to stay meaningful.
 *
 * Every description says what the NEXT stretch asks of you rather than just
 * restating the number, so a locked badge reads as an invitation.
 */
/**
 * Eight rungs, one per illustration in `constants/badgeAssets`. Adding a badge
 * here means drawing its art too — `badgeArtFor` returns undefined otherwise.
 *
 * The ladder is front-loaded on purpose: the first four land inside a
 * fortnight, because a badge you can almost touch is what actually pulls
 * someone back tomorrow. Descriptions say what the stretch asks of you rather
 * than restating the number, so a locked badge reads as an invitation.
 */
export const badges: Badge[] = [
  {
    threshold: 1,
    tier: "bronze",
    name: "First Light",
    description: "One day down. Every badge below this one starts exactly where you are standing."
  },
  {
    threshold: 3,
    tier: "bronze",
    name: "First Spark",
    description: "Three days running — the hardest stretch of the whole ladder, and it is behind you."
  },
  {
    threshold: 7,
    tier: "bronze",
    name: "Kindling",
    description: "A full week. Long enough that tomorrow takes less deciding than it did on Monday."
  },
  {
    threshold: 14,
    tier: "silver",
    name: "Steady Flame",
    description: "Two weeks unbroken. This has stopped being something you remember to do."
  },
  {
    threshold: 30,
    tier: "silver",
    name: "Bright Month",
    description: "A month, every day. Whatever you built this around is holding — that is worth knowing."
  },
  {
    threshold: 60,
    tier: "gold",
    name: "Sunbeam",
    description: "Two months. Most people who start something never get near this, and you did it quietly."
  },
  {
    threshold: 120,
    tier: "platinum",
    name: "Beacon",
    description: "Four months steady. This is not discipline any more, it is just how your days are shaped."
  },
  {
    threshold: 360,
    tier: "diamond",
    name: "Everlight",
    description: "A year, near enough. The last badge on the ladder, and the only one that explains itself."
  }
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
