/**
 * Distance milestones — markers you PASS, never targets you sign up for.
 *
 * The distinction is the whole design of Move. Nobody is asked to commit to a
 * distance before they have gone anywhere: you press start, you go, and when
 * you get back Lumo tells you what you have added up to. A milestone arrives as
 * news, not as homework.
 *
 * That is deliberate, and it is a reversal. An earlier version of this had
 * people join a challenge first. It made the screen a decision to get through
 * before the front door, which is exactly the moment a walk stops happening —
 * and it made every milestone feel like something you could fail at.
 *
 * Distance ONLY. Not time, and not walking-versus-running — a kilometre is a
 * kilometre however long it took you and whichever way you covered it. Nothing
 * in this file mentions pace, because nothing here depends on it.
 *
 * The ladder is front-loaded the same way the streak badges are: the first two
 * rungs land inside the first afternoon, because a marker you can almost touch
 * is what brings someone back tomorrow. The last one is meant to take months.
 */

/** Rising tiers, matching `badgeTierMeta` in `lib/badges.ts` so the two ladders read alike. */
export type MilestoneTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export type Milestone = {
  id: string;
  /** Full name, for headings — "10 km Runner". */
  name: string;
  /** The badge face. Two or three characters, because that is all a hexagon holds. */
  short: string;
  /** The distance to cover, in metres — the same unit `WalkRecord.distanceM` uses. */
  targetM: number;
  tier: MilestoneTier;
  /** One line saying what the stretch asks of you, not restating the number. */
  blurb: string;
};

/**
 * Tier colours.
 *
 * Deliberately the same five swatches as `badgeTierMeta` — a gold challenge
 * badge and a gold streak badge should be the same gold, or the app has two
 * unrelated ideas of what a tier means.
 */
export const MILESTONE_TIER_ACCENT: Record<MilestoneTier, string> = {
  bronze: "#C6803F",
  silver: "#8FA1B3",
  gold: "#E0AE3A",
  platinum: "#5F9BB0",
  diamond: "#5BC6D6"
};

export const MILESTONES: Milestone[] = [
  {
    id: "1k",
    name: "1 km Starter",
    short: "1K",
    targetM: 1000,
    tier: "bronze",
    blurb: "Your first kilometre. Everything below this starts here."
  },
  {
    id: "5k",
    name: "5 km Achiever",
    short: "5K",
    targetM: 5000,
    tier: "bronze",
    blurb: "Five kilometres on foot. A week of short walks and it was behind you."
  },
  {
    id: "10k",
    name: "10 km Runner",
    short: "10K",
    targetM: 10_000,
    tier: "silver",
    blurb: "Ten kilometres. The first one that took some turning up."
  },
  {
    id: "25k",
    name: "25 km Explorer",
    short: "25K",
    targetM: 25_000,
    tier: "gold",
    blurb: "Twenty-five kilometres. Far enough that you went somewhere new to do it."
  },
  {
    id: "50k",
    name: "50 km Trailblazer",
    short: "50K",
    targetM: 50_000,
    tier: "platinum",
    blurb: "Fifty kilometres under your own power. That is a month of showing up."
  },
  {
    id: "100k",
    name: "100 km Journey",
    short: "100K",
    targetM: 100_000,
    tier: "diamond",
    blurb: "Three figures, on foot. This one was measured in seasons."
  }
];

export function findMilestone(id: string | null | undefined): Milestone | undefined {
  return id ? MILESTONES.find((entry) => entry.id === id) : undefined;
}

/** "1 km", "10 km", "100 km" — the distance, for a label. */
export function milestoneDistanceLabel(milestone: Milestone): string {
  return `${milestone.targetM / 1000} km`;
}
