import { Habit } from "@/types/habit";
import { addDays, dateRange, daysBetween, formatShortDate, toDateKey } from "./date";
import { isDoneOnDate, isScheduledOnDate, MAX_HISTORY_DAYS, totalCompletions } from "./habitMath";

/**
 * Derived analytics for a single habit — the numbers behind the detail screen's
 * charts. Everything reads from `habit.completions` / `habit.skips`, so these
 * stay in step with `habitMath` rather than keeping a second source of truth.
 */

/**
 * History is always evaluated as if the habit were running. Pausing or
 * archiving takes it off today's list; it must not rewrite what already
 * happened, and `isScheduledOnDate` returns false for any non-active habit.
 */
function asActive(habit: Habit): Habit {
  return habit.status === "active" ? habit : { ...habit, status: "active" };
}

/** How far back a habit's own record reaches, capped like the other stats. */
function trackedSpan(habit: Habit, todayKey: string) {
  return Math.min(MAX_HISTORY_DAYS, Math.max(1, daysBetween(habit.createdAt, todayKey) + 1));
}

export type WindowStats = {
  /** Days the habit was actually due — skips and off-days excluded. */
  scheduled: number;
  done: number;
  rate: number;
};

/** Completion rate over a rolling window ending on `endKey`. */
export function windowStats(habit: Habit, days: number, endKey = toDateKey()): WindowStats {
  const active = asActive(habit);
  const scheduled = dateRange(days, endKey).filter((dateKey) => isScheduledOnDate(active, dateKey));
  const done = scheduled.filter((dateKey) => isDoneOnDate(habit, dateKey)).length;

  return {
    scheduled: scheduled.length,
    done,
    rate: scheduled.length > 0 ? Math.round((done / scheduled.length) * 100) : 0
  };
}

/**
 * Scheduled days the habit was fully met on, across its whole record.
 *
 * Distinct from `totalCompletions`, which sums raw log counts — a 3x-a-day
 * habit kept perfectly for a week is 7 completed days and 21 logs.
 */
export function completedDays(habit: Habit, todayKey = toDateKey()) {
  const active = asActive(habit);

  return dateRange(trackedSpan(habit, todayKey), todayKey).filter(
    (dateKey) => isScheduledOnDate(active, dateKey) && isDoneOnDate(habit, dateKey)
  ).length;
}

export type ProgressRange = "7D" | "30D" | "90D" | "6M" | "1Y";

/**
 * Each range is split into buckets that divide it exactly, so no bucket covers
 * a different number of days than its neighbours and the line stays comparable
 * left to right. "6M" buckets weekly, matching the consistency heatmap's
 * column-per-week grid.
 */
const RANGE_SHAPE: Record<ProgressRange, { days: number; buckets: number }> = {
  "7D": { days: 7, buckets: 7 },
  "30D": { days: 30, buckets: 10 },
  "90D": { days: 91, buckets: 13 },
  "6M": { days: 182, buckets: 26 },
  "1Y": { days: 360, buckets: 12 }
};

export type ProgressPoint = {
  label: string;
  rate: number;
  /** False when the habit was never due in this bucket — a hole, not a zero. */
  tracked: boolean;
};

export type ProgressSeries = {
  points: ProgressPoint[];
  /** Mean rate across tracked buckets. */
  average: number;
  /** Percentage points against the preceding window of the same length. */
  delta: number;
  hasPrevious: boolean;
  days: number;
};

/** Completion rate bucketed across a range, oldest bucket first. */
export function progressSeries(habit: Habit, range: ProgressRange, todayKey = toDateKey()): ProgressSeries {
  const active = asActive(habit);
  const { days, buckets } = RANGE_SHAPE[range];
  const bucketDays = days / buckets;

  const points = Array.from({ length: buckets }, (_, index) => {
    const endKey = addDays(todayKey, -(buckets - 1 - index) * bucketDays);
    const scheduled = dateRange(bucketDays, endKey).filter((dateKey) => isScheduledOnDate(active, dateKey));
    const done = scheduled.filter((dateKey) => isDoneOnDate(habit, dateKey)).length;

    return {
      label: formatShortDate(endKey),
      rate: scheduled.length > 0 ? Math.round((done / scheduled.length) * 100) : 0,
      tracked: scheduled.length > 0
    };
  });

  const tracked = points.filter((point) => point.tracked);
  const current = windowStats(habit, days, todayKey);
  const previous = windowStats(habit, days, addDays(todayKey, -days));

  return {
    points,
    average: tracked.length > 0 ? Math.round(tracked.reduce((sum, point) => sum + point.rate, 0) / tracked.length) : 0,
    delta: current.rate - previous.rate,
    hasPrevious: previous.scheduled > 0,
    days
  };
}

/** Width of each completion-time bucket, in hours. */
const BIN_HOURS = 2;

export type TimeBin = {
  /** Hour the bin starts on, 0–22. */
  hour: number;
  count: number;
  /** Share of all logged completions, 0–100. */
  share: number;
};

export type CompletionTimes = {
  bins: TimeBin[];
  total: number;
  /** Mean time of day as "HH:MM", or null with nothing logged. */
  averageLabel: string | null;
  /** Start hour of the busiest bin, or null with nothing logged. */
  bestHour: number | null;
};

function padClock(value: number) {
  return String(value).padStart(2, "0");
}

function meridiem(hour: number) {
  return hour < 12 ? "AM" : "PM";
}

function hour12(hour: number) {
  return hour % 12 === 0 ? 12 : hour % 12;
}

/** "8 AM" — whole hours, for the histogram axis and its spoken labels. */
export function formatHourLabel(hour: number) {
  return `${hour12(hour)} ${meridiem(hour)}`;
}

/**
 * When in the day this habit actually gets done, from each entry's
 * `completedAt` stamp.
 *
 * One stamp exists per day-entry even when `count` is higher, so a 3x-a-day
 * habit contributes a single reading per day — the shape of the distribution
 * is right, but the counts are days-with-a-log, not individual logs.
 */
export function completionTimeHistogram(habit: Habit): CompletionTimes {
  const bins: TimeBin[] = Array.from({ length: 24 / BIN_HOURS }, (_, index) => ({
    hour: index * BIN_HOURS,
    count: 0,
    share: 0
  }));

  let minutesTotal = 0;
  let total = 0;

  for (const entry of habit.completions) {
    if (entry.count <= 0) {
      continue;
    }

    const stamp = new Date(entry.completedAt);

    if (Number.isNaN(stamp.getTime())) {
      continue;
    }

    const hour = stamp.getHours();
    bins[Math.floor(hour / BIN_HOURS)].count += 1;
    minutesTotal += hour * 60 + stamp.getMinutes();
    total += 1;
  }

  if (total === 0) {
    return { bins, total: 0, averageLabel: null, bestHour: null };
  }

  for (const bin of bins) {
    bin.share = Math.round((bin.count / total) * 100);
  }

  const best = bins.reduce((top, bin) => (bin.count > top.count ? bin : top), bins[0]);
  const average = Math.round(minutesTotal / total);
  const averageHour = Math.floor(average / 60);

  return {
    bins,
    total,
    // Same 12-hour clock as the axis, so the caption and the chart under it
    // never state the same time two different ways.
    averageLabel: `${hour12(averageHour)}:${padClock(average % 60)} ${meridiem(averageHour)}`,
    bestHour: best.count > 0 ? best.hour : null
  };
}

/** Most recent day with any completion logged, or null if there is none. */
export function lastCompletedKey(habit: Habit): string | null {
  return (
    habit.completions
      .filter((entry) => entry.count > 0)
      .map((entry) => entry.date)
      .sort()
      .pop() ?? null
  );
}

/** Calendar days since the habit was created, inclusive of today. */
export function daysTracked(habit: Habit, todayKey = toDateKey()) {
  return Math.max(1, daysBetween(habit.createdAt, todayKey) + 1);
}

/**
 * Average completions per week since the habit started, to one decimal.
 * Counts raw completions rather than "days done", so a 3x-a-day habit reads at
 * the volume it's actually being kept at.
 */
export function averagePerWeek(habit: Habit, todayKey = toDateKey()) {
  const perDay = totalCompletions(habit) / daysTracked(habit, todayKey);
  return Math.round(perDay * 7 * 10) / 10;
}
