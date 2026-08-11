import { findFamily, findVariant, MOVE_FAMILIES, type MoveMilestoneFamily } from "@/lib/move/challengeDefs";

/**
 * What someone has earned, and how.
 *
 * ## One badge per milestone, earned by the family's own rule
 *
 * A record here is ONE COMPLETED ROUTE, not a badge. What turns routes into a
 * badge is the family's `unlock` rule — any single route on the early rungs,
 * the team route plus a solo one from 50K up (see `challengeDefs.ts`).
 *
 * That makes `hasMilestone` a question about a SET of records, and it is the
 * only thing that should ever be asked before drawing a badge as unlocked.
 * Nothing outside this file should reconstruct the rule from variant ids.
 * `familyProgress` is for everything in between — "2 of 3 routes done" is the
 * state most rungs are in most of the time, and a screen that can only say
 * earned or not earned has nothing to show for two finished challenges.
 *
 * Each record keeps `completionType`, `days` and `withUserIds` so a badge can
 * say who was there and how long it took. They cannot be reconstructed later,
 * which is why they are stored at the moment of completion.
 *
 * Pure and clock-free — `now` is always passed in.
 */

export type MoveCompletionType = "solo" | "team";

export type MoveAchievement = {
  milestoneId: string;
  /** The variant that earned it. Kept even though the badge ignores it. */
  variantId: string;
  completionType: MoveCompletionType;
  /** ISO instant. */
  completedAt: string;
  /** Whole days the challenge took, for "completed in 5 days". */
  days: number;
  /** Everyone else who was on it. Empty for a solo completion. */
  withUserIds: string[];
};

/**
 * Files a completed route, once.
 *
 * Deduped per ROUTE, not per milestone: finishing 10K's timed variant after its
 * open one is real progress toward the badge and has to be recorded, but doing
 * the same route twice is not, and the second run must not overwrite the day of
 * the first.
 */
export function withAchievement(existing: MoveAchievement[], achievement: MoveAchievement): MoveAchievement[] {
  if (existing.some((entry) => entry.variantId === achievement.variantId)) {
    return existing;
  }

  return [...existing, achievement];
}

/** Whether this exact route has been finished. */
export function hasVariant(achievements: MoveAchievement[], variantId: string): boolean {
  return achievements.some((entry) => entry.variantId === variantId);
}

/** How many of a milestone's routes are done, of how many there are. */
export function familyProgress(achievements: MoveAchievement[], family: MoveMilestoneFamily): { done: number; total: number } {
  return {
    done: family.variants.filter((variant) => hasVariant(achievements, variant.id)).length,
    total: family.variants.length
  };
}

/**
 * Whether the BADGE is unlocked, by the family's own rule.
 *
 * The single question every badge draws itself from.
 */
export function isFamilyUnlocked(achievements: MoveAchievement[], family: MoveMilestoneFamily): boolean {
  const done = (variant: { id: string }) => hasVariant(achievements, variant.id);

  if (family.unlock === "any") {
    return family.variants.some(done);
  }

  // `teamPlusSolo`: every team route AND at least one solo route. Written
  // against `kind` rather than variant ids so a family with a different shape
  // — two solo routes, or two team ones — still answers correctly.
  const team = family.variants.filter((variant) => variant.kind === "team");
  const solo = family.variants.filter((variant) => variant.kind === "solo");

  return team.length > 0 && team.every(done) && solo.some(done);
}

export function hasMilestone(achievements: MoveAchievement[], milestoneId: string): boolean {
  const family = findFamily(milestoneId);

  return family ? isFamilyUnlocked(achievements, family) : false;
}

/**
 * How many routes this badge asks for — one on the early rungs, two from 50K
 * up (the team route plus a solo one).
 *
 * The denominator every tally should use. `familyProgress().total` is how many
 * routes EXIST, which is three everywhere and says nothing about what the badge
 * costs.
 */
export function routesRequired(family: MoveMilestoneFamily): number {
  return family.unlock === "any" ? 1 : 2;
}

/**
 * How many more routes the badge needs. Zero once it is earned.
 *
 * Counts what is MISSING from the rule, not routes left in the family — on a
 * `teamPlusSolo` rung, finishing both solo routes still leaves one to go.
 */
export function routesToBadge(achievements: MoveAchievement[], family: MoveMilestoneFamily): number {
  if (isFamilyUnlocked(achievements, family)) {
    return 0;
  }

  if (family.unlock === "any") {
    return 1;
  }

  const done = (variant: { id: string }) => hasVariant(achievements, variant.id);
  const team = family.variants.filter((variant) => variant.kind === "team");
  const solo = family.variants.filter((variant) => variant.kind === "solo");

  return (team.every(done) ? 0 : 1) + (solo.some(done) ? 0 : 1);
}

/**
 * When the badge was earned — the instant its rule was FIRST satisfied.
 *
 * Not the latest completion: finishing the other routes afterwards is still
 * worth recording, but it does not move the day the badge was won. Found by
 * replaying the records in order and stopping at the one that tipped it, which
 * works for any rule without this function knowing what the rule is.
 *
 * Null when the badge is not earned.
 */
export function familyEarnedAt(achievements: MoveAchievement[], family: MoveMilestoneFamily): string | null {
  if (!isFamilyUnlocked(achievements, family)) {
    return null;
  }

  const mine = achievements
    .filter((entry) => family.variants.some((variant) => variant.id === entry.variantId))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  for (let index = 0; index < mine.length; index += 1) {
    if (isFamilyUnlocked(mine.slice(0, index + 1), family)) {
      return mine[index].completedAt;
    }
  }

  return null;
}

/** "Badge earned" / "2 of 3 routes done", or null when none are. */
export function describeFamilyProgress(achievements: MoveAchievement[], family: MoveMilestoneFamily): string | null {
  if (isFamilyUnlocked(achievements, family)) {
    return "Badge earned";
  }

  // Counted against what the badge COSTS, not against the three routes that
  // exist: on a `teamPlusSolo` rung, both solo routes done is one of two, not
  // two of three — the second solo one bought nothing toward the badge.
  const required = routesRequired(family);
  const done = required - routesToBadge(achievements, family);

  return done === 0 ? null : `${done} of ${required} routes done`;
}

/** The first route finished for a milestone. Undefined if none have been. */
export function findAchievement(achievements: MoveAchievement[], milestoneId: string): MoveAchievement | undefined {
  return achievements.find((entry) => entry.milestoneId === milestoneId);
}

/** Milestones earned, in ladder order rather than the order they were filed. */
export function earnedFamilies(achievements: MoveAchievement[]): MoveMilestoneFamily[] {
  return MOVE_FAMILIES.filter((entry) => hasMilestone(achievements, entry.id));
}

/** The rung below this one, or null for the first. */
export function previousFamily(family: MoveMilestoneFamily): MoveMilestoneFamily | null {
  const index = MOVE_FAMILIES.findIndex((entry) => entry.id === family.id);

  return index > 0 ? MOVE_FAMILIES[index - 1] : null;
}

/**
 * Whether this rung is still shut — the one below it is not earned.
 *
 * The ladder is climbed in order. Someone who has not walked a kilometre has no
 * business being offered three hundred, and a list where every rung is startable
 * makes the early ones look pointless rather than first. The first rung is never
 * locked, so there is always exactly one way in.
 */
export function isFamilyLocked(achievements: MoveAchievement[], family: MoveMilestoneFamily): boolean {
  const previous = previousFamily(family);

  return previous !== null && !hasMilestone(achievements, previous.id);
}

/**
 * The next family to aim at.
 *
 * The first rung whose badge is not yet complete — not the nearest by distance.
 * The ladder is meant to be climbed in order, and offering 100K to someone who
 * has not finished 1K is how a beginner decides the feature is not for them.
 */
export function nextFamily(achievements: MoveAchievement[]): MoveMilestoneFamily | null {
  return MOVE_FAMILIES.find((entry) => !hasMilestone(achievements, entry.id)) ?? null;
}

/** Builds the record for a challenge that has just been finished. */
export function achievementFor(input: {
  variantId: string;
  startedAt: string;
  completedAt: string;
  /** Everyone else on it. Ignored for a solo variant. */
  withUserIds?: string[];
}): MoveAchievement | null {
  const variant = findVariant(input.variantId);

  if (!variant) {
    return null;
  }

  const elapsed = new Date(input.completedAt).getTime() - new Date(input.startedAt).getTime();

  return {
    milestoneId: variant.milestoneId,
    variantId: variant.id,
    completionType: variant.kind === "team" ? "team" : "solo",
    completedAt: input.completedAt,
    // At least 1: finishing inside a day took a day, not zero of them.
    days: Math.max(1, Math.ceil(elapsed / (24 * 60 * 60 * 1000))),
    withUserIds: variant.kind === "team" ? [...new Set(input.withUserIds ?? [])] : []
  };
}

/** "Completed in 5 days" / "Completed together in 6 days". */
export function describeAchievement(achievement: MoveAchievement): string {
  const days = `${achievement.days} ${achievement.days === 1 ? "day" : "days"}`;

  return achievement.completionType === "team" ? `Completed together in ${days}` : `Completed in ${days}`;
}

/** Narrows a stored achievement, or drops it. */
export function normalizeAchievement(value: unknown): MoveAchievement | null {
  const raw = value as Partial<MoveAchievement> | undefined;

  if (!raw || typeof raw.milestoneId !== "string" || !findFamily(raw.milestoneId)) {
    return null;
  }

  return {
    milestoneId: raw.milestoneId,
    variantId: typeof raw.variantId === "string" ? raw.variantId : `${raw.milestoneId}-open`,
    completionType: raw.completionType === "team" ? "team" : "solo",
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : new Date(0).toISOString(),
    days: Number.isFinite(raw.days) ? Math.max(1, Math.round(raw.days as number)) : 1,
    withUserIds: Array.isArray(raw.withUserIds) ? raw.withUserIds.filter((id): id is string => typeof id === "string") : []
  };
}
