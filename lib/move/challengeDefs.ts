/**
 * Every Move challenge, in one place.
 *
 * The whole system is configuration-driven: a milestone family is a distance
 * and a badge, and a variant is a way of reaching it. Adding "10 km in 3 days"
 * is a row in this file and nothing else — no screen knows about any particular
 * challenge, and none should.
 *
 * ## Naming
 *
 * A route's title names the WAY, never the distance: "Go it alone", "Beat the
 * clock", "Bring friends". The distance is on the badge, in the milestone
 * heading, in every description and on the summary — repeating it a fifth time
 * in each row made three near-identical strings that had to be read to the end
 * to be told apart. The way is the actual choice.
 *
 * ## The shape, and why
 *
 * **The badge belongs to the MILESTONE, and what it takes depends on the rung.**
 * Each family carries an `unlock` rule:
 *
 *  - `any` (1K–25K) — one route, whichever. The early rungs are where somebody
 *    decides whether Move is for them, and gating a first badge behind three
 *    challenges, one of which needs a willing friend, loses people who have
 *    just walked their first kilometre.
 *  - `teamPlusSolo` (50K+) — the team route AND one of the two solo routes. The
 *    long distances are where the badge should mean something more than
 *    persistence, so the top of the ladder asks for company as well.
 *
 * Every completion is recorded on its own (see `lib/move/achievements.ts`), so a
 * badge card can still say "earned with Abdul, Sarah and Ali" whichever rule
 * unlocked it, and finishing the other routes after the badge still counts.
 *
 * **Walking and running are one thing.** Nobody is asked to declare which they
 * are about to do, and every variant counts both. Health platforms report them
 * as a single distance on most devices anyway, so splitting them would be
 * inventing a distinction the data cannot support.
 */

export type MoveChallengeKind = "solo" | "team";

export type MoveChallengeVariant = {
  id: string;
  /** The milestone this earns. Several variants share one. */
  milestoneId: string;
  title: string;
  /** One line, in the imperative. What you have to do. */
  description: string;
  kind: MoveChallengeKind;
  /** Metres. Always equal to the milestone's own distance. */
  targetM: number;
  /**
   * Days from starting to the deadline, or null for no clock.
   *
   * An open-ended variant is deliberately the easiest thing in the list: it is
   * the path for someone who wants the badge without a countdown, and Move
   * should never make the calm option the missing one.
   */
  durationDays: number | null;
  /**
   * How many friends must accept before a team challenge can start.
   *
   * Zero on solo variants. Never counts the owner — "with at least 3 friends"
   * means four people.
   *
   * A team challenge is PARALLEL: everyone covers the full distance, and it is
   * done when everyone has. Pooling would mean four people walking a quarter
   * each and all counting it as the team route — the route would mean something
   * different depending on how many friends you have. See
   * `ChallengeProgress.complete`.
   */
  minFriends: number;
};

/**
 * What a family's badge asks for.
 *
 * `any` — any single route. `teamPlusSolo` — the team route plus at least one
 * of the solo routes. Declared per family rather than derived from distance, so
 * moving a rung between tiers is one word here and nothing else.
 */
export type MoveUnlockRule = "any" | "teamPlusSolo";

export type MoveMilestoneFamily = {
  id: string;
  title: string;
  /** The row's subtitle on the Challenges screen. */
  subtitle: string;
  distanceM: number;
  unlock: MoveUnlockRule;
  /**
   * Whether this rung needs a subscription.
   *
   * The first three are free and always will be: somebody has to be able to
   * earn a badge before being asked to pay for the next one, and a ladder whose
   * bottom rung is behind a paywall is not a ladder.
   *
   * Enforced in three places, for the same reason the single-active rule is —
   * the card says it, the milestone screen refuses, and the database has the
   * final word (see `move_challenges.is_pro` in supabase/schema.sql).
   */
  pro: boolean;
  variants: MoveChallengeVariant[];
};

/** Builds a family's three variants from its distance, so the set stays uniform. */
function family(input: {
  id: string;
  title: string;
  distanceKm: number;
  /** Days for the timed variant. */
  timedDays: number;
  /** Friends required by the team variant. */
  minFriends: number;
  unlock: MoveUnlockRule;
  pro: boolean;
}): MoveMilestoneFamily {
  const targetM = input.distanceKm * 1000;
  const distance = `${input.distanceKm} km`;
  const friendWord = `at least ${input.minFriends} ${input.minFriends === 1 ? "friend" : "friends"}`;

  return {
    id: input.id,
    title: input.title,
    subtitle: `Walk or run ${distance}`,
    distanceM: targetM,
    unlock: input.unlock,
    pro: input.pro,
    variants: [
      {
        id: `${input.id}-open`,
        milestoneId: input.id,
        title: "Go it alone",
        description: `Finish ${distance} at your own pace, with no deadline.`,
        kind: "solo",
        targetM,
        durationDays: null,
        minFriends: 0
      },
      {
        id: `${input.id}-timed`,
        milestoneId: input.id,
        title: "Beat the clock",
        description: `Finish ${distance} within ${input.timedDays} ${input.timedDays === 1 ? "day" : "days"}.`,
        kind: "solo",
        targetM,
        durationDays: input.timedDays,
        minFriends: 0
      },
      {
        id: `${input.id}-team`,
        milestoneId: input.id,
        title: "Bring friends",
        description: `You and ${friendWord} each cover ${distance}.`,
        kind: "team",
        targetM,
        // Team challenges are always time-boxed. An open-ended one never
        // resolves — someone drifts off, and it sits in everybody's slot for
        // months blocking anything else.
        durationDays: input.timedDays,
        minFriends: input.minFriends
      }
    ]
  };
}

/**
 * The ladder.
 *
 * Ids match the badge art in `constants/moveBadgeAssets.ts` exactly — a family
 * whose id has no art falls back to a drawn hexagon rather than breaking.
 */
export const MOVE_FAMILIES: MoveMilestoneFamily[] = [
  family({ id: "1k", title: "1K Starter", distanceKm: 1, timedDays: 1, minFriends: 1, unlock: "any", pro: false }),
  family({ id: "5k", title: "5K Explorer", distanceKm: 5, timedDays: 3, minFriends: 1, unlock: "any", pro: false }),
  family({ id: "10k", title: "10K Explorer", distanceKm: 10, timedDays: 7, minFriends: 1, unlock: "any", pro: false }),
  family({ id: "25k", title: "25K Adventurer", distanceKm: 25, timedDays: 7, minFriends: 2, unlock: "any", pro: true }),
  family({ id: "50k", title: "50K Voyager", distanceKm: 50, timedDays: 14, minFriends: 2, unlock: "teamPlusSolo", pro: true }),
  family({ id: "100k", title: "100K Champion", distanceKm: 100, timedDays: 30, minFriends: 3, unlock: "teamPlusSolo", pro: true }),
  family({ id: "300k", title: "300K Legend", distanceKm: 300, timedDays: 60, minFriends: 3, unlock: "teamPlusSolo", pro: true })
];

export const MOVE_VARIANTS: MoveChallengeVariant[] = MOVE_FAMILIES.flatMap((entry) => entry.variants);

export function findFamily(milestoneId: string | null | undefined): MoveMilestoneFamily | undefined {
  return milestoneId ? MOVE_FAMILIES.find((entry) => entry.id === milestoneId) : undefined;
}

export function findVariant(variantId: string | null | undefined): MoveChallengeVariant | undefined {
  return variantId ? MOVE_VARIANTS.find((entry) => entry.id === variantId) : undefined;
}

/** What this family's badge asks for, in a line. */
export function describeUnlockRule(family: MoveMilestoneFamily): string {
  return family.unlock === "any"
    ? "Finish any one route to earn the badge."
    : "Earn the badge with friends, plus either solo route.";
}

/** "Solo challenge" / "With at least 3 friends" — what the summary shows. */
export function describeVariantKind(variant: MoveChallengeVariant): string {
  if (variant.kind === "solo") {
    return "Solo challenge";
  }

  return `With at least ${variant.minFriends} ${variant.minFriends === 1 ? "friend" : "friends"}`;
}

/** "7 days" / "No time limit". */
export function describeVariantDuration(variant: MoveChallengeVariant): string {
  if (variant.durationDays === null) {
    return "No time limit";
  }

  return `${variant.durationDays} ${variant.durationDays === 1 ? "day" : "days"}`;
}
