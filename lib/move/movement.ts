import type { MoveActivityType, MoveMetric, MovementSummary, MoveTotals } from "@/lib/move/types";

/**
 * Movement aggregation — the maths every other part of Move reads.
 *
 * Pure, and takes every date it needs as a parameter. Nothing here reads the
 * clock or a timezone, which is what lets the day-boundary cases be tested
 * without freezing time.
 *
 * The one rule that shapes the whole file: **a day is identified by its local
 * date key, and a key appears at most once.** Health platforms happily return
 * the same day twice from overlapping queries, and a sync that appended rather
 * than replaced would inflate someone's total a little more on every refresh.
 * `mergeSummaries` is the only way summaries enter the system.
 */

export const emptyTotals: MoveTotals = { distanceMeters: 0, steps: 0, activeMinutes: 0, countedDays: [] };

/** A day with nothing in it. Used for gaps, so a week always has seven bars. */
export function emptySummary(date: string): MovementSummary {
  return { date, steps: 0, distanceMeters: 0, activeMinutes: 0 };
}

function sanitize(value: unknown): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;
}

/**
 * Narrows one summary from a provider or from storage.
 *
 * Negative and non-finite values are floored to zero rather than dropped: a
 * platform occasionally reports a nonsense figure for one metric on a day that
 * is otherwise fine, and throwing the whole day away would lose real movement.
 */
export function normalizeSummary(value: unknown): MovementSummary | null {
  const raw = value as Partial<MovementSummary> | undefined;

  if (!raw || typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    return null;
  }

  const summary: MovementSummary = {
    date: raw.date,
    steps: Math.round(sanitize(raw.steps)),
    distanceMeters: sanitize(raw.distanceMeters),
    activeMinutes: Math.round(sanitize(raw.activeMinutes))
  };

  // Only carried when the platform actually split them — see the note on the
  // type. Absent is not zero.
  if (Number.isFinite(raw.walkingDistanceMeters)) {
    summary.walkingDistanceMeters = sanitize(raw.walkingDistanceMeters);
  }

  if (Number.isFinite(raw.runningDistanceMeters)) {
    summary.runningDistanceMeters = sanitize(raw.runningDistanceMeters);
  }

  return summary;
}

/**
 * Folds freshly synced days into the cache, newest reading winning.
 *
 * Replace rather than add, which is the whole defence against double-counting:
 * re-syncing today ten times leaves exactly one entry for today, holding the
 * last thing the platform said. Sorted by date so every consumer can assume
 * ascending order.
 */
export function mergeSummaries(existing: MovementSummary[], incoming: MovementSummary[]): MovementSummary[] {
  const byDate = new Map<string, MovementSummary>();

  for (const summary of existing) {
    byDate.set(summary.date, summary);
  }

  for (const summary of incoming) {
    byDate.set(summary.date, summary);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The summaries falling inside an inclusive local date range. */
export function summariesInRange(summaries: MovementSummary[], startKey: string, endKey: string): MovementSummary[] {
  return summaries.filter((summary) => summary.date >= startKey && summary.date <= endKey);
}

/**
 * How much of one metric a summary contributes, for a given activity.
 *
 * Activity filtering only ever applies to DISTANCE, because that is the only
 * metric a health platform splits by activity. Steps and active minutes are
 * reported as one figure whatever you were doing, so a "running, steps" goal
 * reads the same number a "walking, steps" one does — and pretending otherwise
 * would be inventing data.
 *
 * When the split is absent, an activity-specific distance goal falls back to
 * the total. That is deliberately generous: the alternative is telling someone
 * who walked 5 km that they walked nothing because their phone did not itemise
 * it.
 */
export function metricValue(summary: MovementSummary, metric: MoveMetric, activityType: MoveActivityType = "any"): number {
  if (metric === "steps") {
    return summary.steps;
  }

  if (metric === "activeMinutes") {
    return summary.activeMinutes;
  }

  if (activityType === "walking" && summary.walkingDistanceMeters !== undefined) {
    return summary.walkingDistanceMeters;
  }

  if (activityType === "running" && summary.runningDistanceMeters !== undefined) {
    return summary.runningDistanceMeters;
  }

  return summary.distanceMeters;
}

/** Totals one metric over a range. */
export function sumMetric(
  summaries: MovementSummary[],
  metric: MoveMetric,
  startKey: string,
  endKey: string,
  activityType: MoveActivityType = "any"
): number {
  return summariesInRange(summaries, startKey, endKey).reduce(
    (total, summary) => total + metricValue(summary, metric, activityType),
    0
  );
}

/** True when a day holds any qualifying movement at all. */
export function hasMovement(summary: MovementSummary): boolean {
  return summary.steps > 0 || summary.distanceMeters > 0 || summary.activeMinutes > 0;
}

/** Days in the range with movement on them. What "3 days active" reads. */
export function activeDayCount(summaries: MovementSummary[], startKey: string, endKey: string): number {
  return summariesInRange(summaries, startKey, endKey).filter(hasMovement).length;
}

/**
 * Folds days into the cumulative ledger, once each and never twice.
 *
 * This is the function that makes repeated health syncs safe. A day already in
 * `countedDays` contributes nothing however many times it is offered, so the
 * total that milestones and the journey are measured against only ever goes up,
 * and only by movement it has not already counted.
 *
 * **Today is deliberately excluded by the caller**, not here — see
 * `countableDays`. A day still in progress would be counted at lunchtime and
 * then be unable to accept the afternoon.
 */
export function foldIntoTotals(totals: MoveTotals, summaries: MovementSummary[]): MoveTotals {
  const counted = new Set(totals.countedDays);
  let next = totals;

  for (const summary of summaries) {
    if (counted.has(summary.date) || !hasMovement(summary)) {
      continue;
    }

    counted.add(summary.date);
    next = {
      distanceMeters: next.distanceMeters + summary.distanceMeters,
      steps: next.steps + summary.steps,
      activeMinutes: next.activeMinutes + summary.activeMinutes,
      countedDays: next.countedDays
    };
  }

  return counted.size === totals.countedDays.length ? totals : { ...next, countedDays: [...counted].sort() };
}

/**
 * The days safe to fold into the cumulative total: everything strictly before
 * today.
 *
 * A day is only final once it is over. Folding today in at lunchtime would bank
 * half a day and then have no way to accept the rest, because `foldIntoTotals`
 * refuses to count a day twice — so the afternoon would be lost from the total
 * forever while still showing on the Today card.
 */
export function countableDays(summaries: MovementSummary[], todayKey: string): MovementSummary[] {
  return summaries.filter((summary) => summary.date < todayKey);
}

/**
 * What the cumulative figure should READ as, today included.
 *
 * The banked total plus whatever today has so far. Shown rather than stored, so
 * the number on screen climbs during a walk without today ever being written
 * into the ledger before it is over.
 */
export function displayedTotalDistance(totals: MoveTotals, summaries: MovementSummary[], todayKey: string): number {
  const today = summaries.find((summary) => summary.date === todayKey);

  return totals.distanceMeters + (today && !totals.countedDays.includes(todayKey) ? today.distanceMeters : 0);
}

/** Narrows a stored ledger. A malformed one resets rather than corrupting totals. */
export function normalizeTotals(value: unknown): MoveTotals {
  const raw = value as Partial<MoveTotals> | undefined;

  if (!raw || typeof raw !== "object") {
    return emptyTotals;
  }

  const countedDays = Array.isArray(raw.countedDays)
    ? [...new Set(raw.countedDays.filter((day): day is string => typeof day === "string"))].sort()
    : [];

  return {
    distanceMeters: sanitize(raw.distanceMeters),
    steps: Math.round(sanitize(raw.steps)),
    activeMinutes: Math.round(sanitize(raw.activeMinutes)),
    countedDays
  };
}

/**
 * Consecutive days with movement, counted back from today.
 *
 * Counted from YESTERDAY when today is still empty, so a streak someone built
 * does not read as broken before the day it depends on has finished — the same
 * grace the habit streak gives.
 *
 * `previousDay` is passed in rather than computed, because turning a date key
 * into the one before it is `lib/date`'s job and this module deliberately
 * imports nothing.
 */
export function movementStreak(summaries: MovementSummary[], todayKey: string, previousDay: (key: string) => string): number {
  const active = new Set(summaries.filter(hasMovement).map((summary) => summary.date));

  let cursor = active.has(todayKey) ? todayKey : previousDay(todayKey);
  let streak = 0;

  while (active.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }

  return streak;
}

// --- formatting -------------------------------------------------------------

/**
 * Kilometres as a number, trimmed.
 *
 * One decimal while that still reads as a number someone would say out loud —
 * "2.8", "18.4" — and none once it is large enough that the decimal is noise.
 * Whole numbers never carry a pointless ".0", which is what stopped "50 / 100
 * km" reading as "50.0 / 100 km".
 */
export function kmValue(meters: number): string {
  const value = Math.max(0, meters) / 1000;

  return Number.isInteger(value) || value >= 100 ? String(Math.round(value)) : value.toFixed(1);
}

/** "2.8 km" over a kilometre, "840 m" under it. */
export function formatDistance(meters: number): string {
  const safe = Math.max(0, meters);

  return safe < 1000 ? `${Math.round(safe)} m` : `${kmValue(safe)} km`;
}

/**
 * "0 km" / "0.4 km" / "2.8 km" — always kilometres, whatever the figure.
 *
 * For readouts that sit beside a challenge target, which is always in
 * kilometres. `formatDistance` switching to metres under a kilometre is right
 * in a sentence about one walk, and wrong next to "/ 5 km" — the unit changing
 * between the two numbers makes them look unrelated.
 */
export function formatKilometres(meters: number): string {
  return `${kmValue(meters)} km`;
}

/** "4,321" — steps always read as a whole count. */
/** Steps with a thousands separator, or a dash when the device has no counter. */
export function formatSteps(steps: number | null): string {
  return steps === null ? "—" : Math.round(Math.max(0, steps)).toLocaleString();
}

/** "38 min", "1h 12m". */
export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));

  return safe < 60 ? `${safe} min` : `${Math.floor(safe / 60)}h ${safe % 60}m`;
}

/** One value in whichever unit its metric uses. */
export function formatMetric(metric: MoveMetric, value: number): string {
  if (metric === "steps") {
    return formatSteps(value);
  }

  if (metric === "activeMinutes") {
    return formatMinutes(value);
  }

  return formatDistance(value);
}

/**
 * "2.8 / 5 km" — a pair in one unit rather than two formatted values.
 *
 * Written by hand rather than as `${formatMetric(a)} / ${formatMetric(b)}`,
 * which would read "2.8 km / 5 km" and repeat the unit, or worse "800 m / 5 km"
 * and put two different units on one line.
 */
export function formatMetricPair(metric: MoveMetric, current: number, target: number): string {
  if (metric === "steps") {
    return `${formatSteps(current)} / ${formatSteps(target)}`;
  }

  if (metric === "activeMinutes") {
    return `${Math.round(Math.max(0, current))} / ${Math.round(target)} min`;
  }

  if (target < 1000) {
    return `${Math.round(Math.max(0, current))} / ${Math.round(target)} m`;
  }

  return `${kmValue(current)} / ${kmValue(target)} km`;
}

/** "3 km", "8,000 steps", "30 min" — a target on its own. */
export function formatTarget(metric: MoveMetric, target: number): string {
  if (metric === "steps") {
    return `${formatSteps(target)} steps`;
  }

  if (metric === "activeMinutes") {
    return `${Math.round(target)} min`;
  }

  return formatDistance(target);
}
