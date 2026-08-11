/**
 * Lumo Move — the shared vocabulary.
 *
 * Move is a STANDALONE feature. Nothing in here refers to a habit, a completion
 * or a streak from `types/habit.ts`, and nothing in Move ever writes one. The
 * two systems share the design system and the storage layer and nothing else.
 *
 * Units are fixed and never negotiated: **metres** for distance, **whole steps**
 * for steps, **whole minutes** for active time. Health platforms hand back
 * kilometres, miles and seconds depending on the query; normalising at the
 * provider boundary is what stops those units leaking into the maths.
 */

/** What kind of movement a goal or challenge cares about. */
export type MoveActivityType = "walking" | "running" | "any";

/** What is being counted. Extensible: a new metric is a case here and a case in the evaluator. */
export type MoveMetric = "distance" | "steps" | "activeMinutes";

export type MoveFrequency = "daily" | "weekly";

/**
 * One day of movement, normalised.
 *
 * The unit of everything in Move. Goals, challenges, milestones and the journey
 * are all derived from a list of these, which is what keeps a single source of
 * truth for "how much did this person move".
 *
 * Keyed by LOCAL date (`YYYY-MM-DD`), not by an instant. A day is a local
 * concept — someone walking at 23:50 in Manila is walking on a different date
 * than the same instant in London — and every window Move measures (today, this
 * week, before 9am) is a local one.
 */
export type MovementSummary = {
  /** Local date key, `YYYY-MM-DD`. Unique per summary. */
  date: string;
  steps: number;
  distanceMeters: number;
  activeMinutes: number;
  /**
   * The walking and running split, when the platform can tell them apart.
   *
   * Optional rather than defaulted to zero, and the distinction matters: iOS
   * reports walking+running distance as one figure on most devices, so `0` here
   * would be a claim that someone did not run, which is different from not
   * knowing. Activity-specific goals fall back to the total when these are
   * absent rather than reading a missing split as no movement.
   */
  walkingDistanceMeters?: number;
  runningDistanceMeters?: number;
};

/**
 * Movement that Lumo has folded into the cumulative total.
 *
 * Held separately from the daily summaries because the two answer different
 * questions. Summaries are a cache of what the health platform says and are
 * safe to overwrite from a re-sync; the cumulative ledger is what milestones
 * and the journey are measured against and must never move backwards because a
 * platform re-reported a day differently.
 */
export type MoveTotals = {
  /** Every qualifying metre Lumo has counted. Monotonic. */
  distanceMeters: number;
  steps: number;
  activeMinutes: number;
  /** Local date keys already folded in, so a repeated sync is a no-op. */
  countedDays: string[];
};

export type MoveGoal = {
  id: string;
  activityType: MoveActivityType;
  metric: MoveMetric;
  /** Metres, steps or minutes, matching `metric`. */
  target: number;
  frequency: MoveFrequency;
  /** ISO instant. */
  createdAt: string;
  enabled: boolean;
  /**
   * Set when this goal came from a friend's invitation rather than being made
   * here.
   *
   * The name is stored alongside the id on purpose: the goals screen has to say
   * "You're on Sarah's goal" while offline, and a lookup that needs the network
   * would leave it saying "You're on someone's goal".
   */
  origin?: { friendId: string; friendName: string };
  /**
   * Friends this goal is shared with, by Supabase profile id.
   *
   * A goal shared with friends is PARALLEL, not pooled: everyone works toward
   * the same target and can see how the others are getting on. That is the
   * difference between this and a group Move challenge, where the distance goes
   * into one shared pot — and it is why this needs no group to exist in.
   *
   * Optional, so every goal made before sharing existed still reads. An empty
   * array and an absent field both mean "just me".
   */
  invitedFriendIds?: string[];
};

/** A goal's standing over the period it is measured in. */
export type MoveGoalProgress = {
  goal: MoveGoal;
  /** Where the current period runs from and to, as local date keys (inclusive). */
  periodStart: string;
  periodEnd: string;
  current: number;
  target: number;
  /** 0–1, clamped. */
  ratio: number;
  completed: boolean;
  /** Left to do, floored at zero. */
  remaining: number;
};

/** What a challenge asks of someone. Every field is optional bar the shape. */
export type MoveChallengeType = "cumulative" | "daily" | "streak" | "timed" | "group";

export type MoveTimeWindow = {
  /** Inclusive local hour, 0–23. */
  fromHour?: number;
  /** Exclusive local hour, 0–24. */
  toHour?: number;
  /** Restrict to given weekdays (0 = Sunday), for weekend-only challenges. */
  weekdays?: number[];
};

export type MoveChallenge = {
  id: string;
  title: string;
  description: string;
  metric: MoveMetric;
  /** Metres, steps, minutes, or DAYS when `challengeType` is "streak". */
  target: number;
  activityType: MoveActivityType;
  challengeType: MoveChallengeType;
  /** Local date keys bounding a timed challenge. */
  startDate?: string;
  endDate?: string;
  timeWindow?: MoveTimeWindow;
  repeatable: boolean;
  /** One short line shown on completion. */
  reward?: string;
};

export type MoveChallengeProgress = {
  challenge: MoveChallenge;
  current: number;
  target: number;
  ratio: number;
  completed: boolean;
  /** Human-facing, e.g. "3.4 / 5 km" or "5 / 7 days". */
  label: string;
};

/**
 * A challenge someone has taken on and how it went.
 *
 * `completedAt` is stamped once and never recomputed, which is what stops a
 * finished challenge un-finishing itself when a health platform revises a day.
 */
export type MoveChallengeEntry = {
  challengeId: string;
  joinedAt: string;
  completedAt: string | null;
};

export type MoveMilestone = {
  id: string;
  title: string;
  description: string;
  /** Cumulative metres. */
  target: number;
  metric: MoveMetric;
  tier: "bronze" | "silver" | "gold" | "platinum" | "diamond";
};

export type MoveMilestoneProgress = {
  milestone: MoveMilestone;
  progress: number;
  target: number;
  ratio: number;
  unlocked: boolean;
  /** ISO instant, stamped when first crossed. */
  unlockedAt: string | null;
};
