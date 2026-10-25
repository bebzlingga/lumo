import { addDays, monthRange, startOfMonth, startOfWeekMonday, weekRangeMonday } from "@/lib/date";

/**
 * A DISTANCE TARGET SOMEBODY SETS FOR THEMSELVES — "100 km a week" — and the
 * period it renews over.
 *
 * ## How this differs from a challenge, and why both exist
 *
 * A challenge is a RUNG: a fixed distance with a badge at the end of it, chosen
 * from a list somebody else wrote, done once. A goal is a PACE: a number you
 * picked, renewing every day or week or month, with nothing at the end but the
 * next period. One is an achievement, the other is a habit — which is the whole
 * app's subject — and neither substitutes for the other.
 *
 * They run side by side on purpose. The app enforces one active CHALLENGE at a
 * time because two rungs at once makes neither of them the thing you are doing;
 * a goal is not in that competition, and a walk counts toward both without
 * being told to.
 *
 * ## The three rules that shape everything here
 *
 *  1. **It renews.** Each period starts back at zero. That is what makes "100 km
 *     a week" mean anything, and it is the only reason the period is a choice —
 *     with one running total, daily and monthly would differ by nothing but a
 *     word.
 *  2. **Reaching it does not end it.** The period is marked hit, the figure
 *     keeps climbing past the target, and the goal is still there next period. A
 *     target that deleted itself on success would punish the good week.
 *  3. **Only the reader ends it.** No expiry, no auto-archive. It runs until
 *     they cancel it.
 *
 * ## Calendar periods, not rolling windows
 *
 * A week is Monday to Sunday and a month is the 1st to the 31st, so a period is
 * something that can be FINISHED. Move's Stats tab deliberately does the
 * opposite — its "last 7 days" is a rolling window, because a calendar week says
 * least on a Monday morning, exactly when somebody is most likely to look. Both
 * are right for what they do: Stats reports, a goal is a commitment, and you
 * cannot commit to a window that slides out from under you.
 */
export type MoveGoalPeriod = "daily" | "weekly" | "monthly";

export type MoveGoal = {
  /** Distance to cover in each period. Metres, like everything else in Move. */
  targetM: number;
  period: MoveGoalPeriod;
  /** When it was set, ISO. Periods before this one are not counted or shown. */
  startedAt: string;
  /**
   * Period keys already reached, oldest first.
   *
   * Kept so a hit is celebrated ONCE — the figure keeps climbing after the
   * target, and without this every metre walked past it would re-fire whatever
   * the reaching triggers. It is also the record of how the goal has gone,
   * which is the only history a renewing target has.
   *
   * Bounded at `HIT_HISTORY` on write; a goal left running for two years should
   * not grow an unbounded array in a device's storage.
   */
  hitPeriods: string[];
};

/** How many hit periods are kept. A season of weeks, or two months of days. */
export const HIT_HISTORY = 26;

export const GOAL_PERIODS: { value: MoveGoalPeriod; label: string; every: string }[] = [
  { value: "daily", label: "Daily", every: "every day" },
  { value: "weekly", label: "Weekly", every: "every week" },
  { value: "monthly", label: "Monthly", every: "every month" }
];

/**
 * What the slider offers, per period, in metres.
 *
 * A RANGE PER PERIOD, not one range for all three: 5 km is a fair day, a poor
 * week and a rounding error in a month, so a single scale would spend most of
 * its length on numbers that are absurd for whichever period is selected. These
 * three keep the whole travel of the slider useful whichever one you are on.
 *
 * The floors are a real floor, not zero — a goal of nothing is not a goal, and
 * starting the scale at a walkable number means the leftmost position is still
 * an answer somebody might choose.
 */
export const GOAL_RANGE: Record<MoveGoalPeriod, { min: number; max: number }> = {
  daily: { min: 1_000, max: 100_000 },
  weekly: { min: 10_000, max: 300_000 },
  monthly: { min: 30_000, max: 600_000 }
};

/**
 * Where a fresh picker opens, per period.
 *
 * Low in each range on purpose: a goal you miss in week one is a goal you cancel
 * in week two, and the slider makes reaching for more the easy direction.
 */
export const DEFAULT_GOAL_TARGET: Record<MoveGoalPeriod, number> = {
  daily: 5_000,
  weekly: 40_000,
  monthly: 150_000
};

/**
 * The absolute bounds a STORED goal is accepted within — wider than any one
 * period's range on purpose.
 *
 * `GOAL_RANGE` governs what can be set today. This governs what can be read back
 * tomorrow, and the two must not be the same number: tightening a range later
 * would otherwise silently delete a goal somebody had already set and was
 * walking toward, which is the worst thing a validator can do.
 */
export const GOAL_MIN_M = 500;
export const GOAL_MAX_M = 1_000_000;

/** Holds a target inside the range its period offers. */
export function clampToRange(targetM: number, period: MoveGoalPeriod): number {
  const { min, max } = GOAL_RANGE[period];

  return Math.min(max, Math.max(min, targetM));
}

/**
 * Which period a date falls in, as a stable key.
 *
 * Prefixed by kind, so a goal that is switched from daily to weekly cannot
 * mistake an old day key for a week key and read a period as already hit.
 */
export function periodKeyFor(period: MoveGoalPeriod, dateKey: string): string {
  switch (period) {
    case "daily":
      return `d:${dateKey}`;
    case "weekly":
      return `w:${startOfWeekMonday(dateKey)}`;
    case "monthly":
      return `m:${startOfMonth(dateKey)}`;
  }
}

/**
 * Every date key in the period containing `dateKey`.
 *
 * The whole period, INCLUDING days still ahead — the caller sums distance over
 * it, and a future day simply contributes nothing. Returning only elapsed days
 * would make "days left" a second, separate calculation that could disagree
 * with this one.
 */
export function periodDays(period: MoveGoalPeriod, dateKey: string): string[] {
  switch (period) {
    case "daily":
      return [dateKey];
    case "weekly":
      return weekRangeMonday(dateKey);
    case "monthly":
      return monthRange(dateKey);
  }
}

/** One day of a period, and what was walked on it. Future days are simply 0. */
export type MoveGoalDay = {
  dateKey: string;
  metres: number;
};

export type MoveGoalProgress = {
  goal: MoveGoal;
  /** The period being reported, and the days in it. */
  periodKey: string;
  /**
   * Every counted day with its own distance, oldest first.
   *
   * The per-day figures come from the same pass that sums `walkedM`, so the
   * strip a screen draws and the total above it can never disagree — which they
   * would the moment a caller re-derived the days from its own copy of the data.
   */
  days: MoveGoalDay[];
  /** Metres covered in this period so far. Can exceed the target — rule 2. */
  walkedM: number;
  targetM: number;
  /** 0–1, clamped for drawing. `walkedM / targetM` is the honest figure. */
  ratio: number;
  /** Never negative: what is left is 0 once the target is passed. */
  remainingM: number;
  /**
   * What a single day has to be to stay on pace — the target spread over the
   * days that count.
   *
   * NOT the target divided by the period's full length: a goal set on a Friday
   * counts three days, and those three are what the week's target has to be
   * walked in. Prorating the target instead would quietly hand somebody most of
   * a week off for having set the goal late.
   */
  dailyShareM: number;
  /** Target reached IN THIS PERIOD. */
  hit: boolean;
  /** Today included, so the last day of a period reads "1 day left". */
  daysLeft: number;
  /** How many of the recorded periods were hit — the goal's own record. */
  hitCount: number;
};

/**
 * Where a goal stands in the period containing `todayKey`.
 *
 * Takes a `distanceOn` LOOKUP rather than the summaries array, because the
 * caller is the only one who knows what a day's distance means: the Move tab
 * reconciles health data against tracked walks and takes the greater of the two
 * (see `dayDistance` there), and re-deriving that here would give the goal a
 * different idea of the same day than the list underneath it.
 */
export function goalProgress(goal: MoveGoal, todayKey: string, distanceOn: (dateKey: string) => number): MoveGoalProgress {
  const days = periodDays(goal.period, todayKey);
  const periodKey = periodKeyFor(goal.period, todayKey);
  /**
   * Days before the goal existed do not count.
   *
   * Setting a 100 km week on a Friday should not open at 78 km because of walks
   * taken before there was anything to walk toward — that is a goal met by
   * history rather than by intent. The first period is therefore a short one,
   * which is the honest version of starting mid-week.
   */
  const startedKey = goal.startedAt.slice(0, 10);
  // One pass, so the per-day figures and the total are the same arithmetic.
  const counted = days
    .filter((day) => day >= startedKey)
    .map((dateKey) => ({ dateKey, metres: Math.max(0, distanceOn(dateKey)) }));
  const walkedM = counted.reduce((total, day) => total + day.metres, 0);
  const targetM = Math.max(1, goal.targetM);
  const lastDay = days[days.length - 1];

  return {
    goal,
    periodKey,
    days: counted,
    walkedM,
    targetM,
    ratio: Math.min(1, walkedM / targetM),
    remainingM: Math.max(0, targetM - walkedM),
    dailyShareM: targetM / Math.max(1, counted.length),
    hit: walkedM >= targetM,
    // Inclusive of today: on the last day of a period there is still today.
    daysLeft: Math.max(0, Math.round((Date.parse(`${lastDay}T00:00:00`) - Date.parse(`${todayKey}T00:00:00`)) / 86_400_000) + 1),
    hitCount: goal.hitPeriods.length
  };
}

/**
 * Records that a period was reached, if it has not been already.
 *
 * Returns the SAME object when nothing changed, so a caller can use identity to
 * decide whether to persist — this is asked on every distance update, and a new
 * array each time would write storage on every step.
 */
export function withPeriodHit(goal: MoveGoal, periodKey: string): MoveGoal {
  if (goal.hitPeriods.includes(periodKey)) {
    return goal;
  }

  return { ...goal, hitPeriods: [...goal.hitPeriods, periodKey].slice(-HIT_HISTORY) };
}

/**
 * When the current period rolls over, as a date key.
 *
 * For the copy that says when the slate is wiped — "resets Monday" is the one
 * fact about a renewing goal that a progress bar cannot show.
 */
export function periodResetsOn(period: MoveGoalPeriod, todayKey: string): string {
  const days = periodDays(period, todayKey);

  return addDays(days[days.length - 1], 1);
}

/** "100 km a week" — the goal in one phrase, for a row or a label. */
export function describeGoal(goal: MoveGoal): string {
  const distance = `${Number((goal.targetM / 1000).toFixed(1))} km`;

  switch (goal.period) {
    case "daily":
      return `${distance} a day`;
    case "weekly":
      return `${distance} a week`;
    case "monthly":
      return `${distance} a month`;
  }
}

/** "This week", "Today", "This month" — what the current period is called. */
export function periodLabel(period: MoveGoalPeriod): string {
  switch (period) {
    case "daily":
      return "Today";
    case "weekly":
      return "This week";
    case "monthly":
      return "This month";
  }
}

/**
 * Narrows a stored goal, or returns null.
 *
 * Field by field, like every other reader in the app — there is no schema
 * version, so a value that cannot be trusted is dropped rather than repaired
 * into something that was never set.
 */
export function normalizeGoal(value: unknown): MoveGoal | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<MoveGoal>;
  const targetM = typeof raw.targetM === "number" && Number.isFinite(raw.targetM) ? Math.round(raw.targetM) : 0;
  const period = raw.period === "daily" || raw.period === "weekly" || raw.period === "monthly" ? raw.period : null;

  // A goal with no distance or no period is not a goal that can be reported on.
  if (targetM < GOAL_MIN_M || targetM > GOAL_MAX_M || period === null) {
    return null;
  }

  return {
    targetM,
    period,
    startedAt: typeof raw.startedAt === "string" && raw.startedAt.length >= 10 ? raw.startedAt : new Date().toISOString(),
    hitPeriods: Array.isArray(raw.hitPeriods)
      ? raw.hitPeriods.filter((entry): entry is string => typeof entry === "string").slice(-HIT_HISTORY)
      : []
  };
}
