import { Habit, Weekday } from "@/types/habit";
import { addDays, dateRange, daysBetween, monthRange, parseDateKey, startOfMonth, startOfWeekMonday, toDateKey, weekRange, weekRangeMonday } from "./date";

/**
 * Upper bound on how far back streak and completion-rate calculations look.
 * Just over a year so a "perfect year" still resolves; habits with history
 * beyond this window report stats truncated to the most recent MAX_HISTORY_DAYS.
 */
export const MAX_HISTORY_DAYS = 370;

export function dailyTarget(habit: Habit) {
  return habit.goal.type === "multiple" ? habit.goal.count : 1;
}

export function completionCount(habit: Habit, dateKey: string) {
  return habit.completions.find((entry) => entry.date === dateKey)?.count ?? 0;
}

/** Whether the day was deliberately skipped rather than missed. */
export function isSkippedOnDate(habit: Habit, dateKey: string) {
  return Boolean(habit.skips?.includes(dateKey));
}

export function isDoneOnDate(habit: Habit, dateKey: string) {
  if (habit.goal.type === "weekly" || habit.goal.type === "monthly") {
    return completionCount(habit, dateKey) > 0;
  }

  return completionCount(habit, dateKey) >= dailyTarget(habit);
}

export function scheduledWeekdays(habit: Habit): Weekday[] {
  switch (habit.repeatSchedule.type) {
    case "weekdays":
      return [1, 2, 3, 4, 5];
    case "weekends":
      return [0, 6];
    case "specific":
      return habit.repeatSchedule.days;
    default:
      return [0, 1, 2, 3, 4, 5, 6];
  }
}

export function isScheduledOnDate(habit: Habit, dateKey: string) {
  if (habit.status !== "active") {
    return false;
  }

  if (dateKey < habit.createdAt) {
    return false;
  }

  // A deliberate skip means the day was never expected, so it neither breaks
  // the streak nor counts against the completion rate.
  if (habit.skips?.includes(dateKey)) {
    return false;
  }

  const date = new Date(`${dateKey}T12:00:00`);
  const day = date.getDay() as Weekday;

  switch (habit.repeatSchedule.type) {
    case "daily":
      return true;
    case "weekdays":
      return day >= 1 && day <= 5;
    case "weekends":
      return day === 0 || day === 6;
    case "specific":
      return habit.repeatSchedule.days.includes(day);
    case "interval": {
      const elapsed = daysBetween(habit.createdAt, dateKey);
      return elapsed % Math.max(1, habit.repeatSchedule.every) === 0;
    }
  }
}

export function currentStreak(habit: Habit, todayKey = toDateKey()) {
  let streak = 0;
  let cursor = todayKey;

  if (isScheduledOnDate(habit, cursor) && !isDoneOnDate(habit, cursor)) {
    cursor = addDays(cursor, -1);
  }

  for (let index = 0; index < MAX_HISTORY_DAYS; index += 1) {
    if (daysBetween(habit.createdAt, cursor) < 0) {
      break;
    }

    if (!isScheduledOnDate(habit, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }

    if (!isDoneOnDate(habit, cursor)) {
      break;
    }

    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function bestStreak(habit: Habit, todayKey = toDateKey()) {
  const days = Math.min(MAX_HISTORY_DAYS, Math.max(1, daysBetween(habit.createdAt, todayKey) + 1));
  let best = 0;
  let run = 0;

  for (const dateKey of dateRange(days, todayKey)) {
    if (!isScheduledOnDate(habit, dateKey)) {
      continue;
    }

    if (isDoneOnDate(habit, dateKey)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  return best;
}

/**
 * Every day the user checked SOMETHING in, as ascending date keys.
 *
 * This is activity in Lumo rather than progress on one habit: it does not care
 * which habit was logged, only that the day was shown up for. Schedules are
 * ignored for the same reason — logging a habit on a day it was not due still
 * means you opened the app and did the thing.
 *
 * Every habit counts, paused and archived included. A check-in is a historical
 * fact; what later became of the habit it belonged to cannot un-happen it.
 */
export function activityDays(habits: Habit[]): string[] {
  const days = new Set<string>();

  for (const habit of habits) {
    for (const entry of habit.completions) {
      if (entry.count > 0) {
        days.add(entry.date);
      }
    }
  }

  return [...days].sort();
}

/**
 * Longest run of consecutive days with at least one check-in — the streak the
 * badges are awarded on.
 *
 * Deliberately NOT `bestStreakAcrossHabits`, which is the best run of a single
 * habit. Under that rule, checking in on eight different habits over eight
 * consecutive days scored a streak of 1, while the badges are meant to reward
 * turning up at all.
 */
export function bestActivityStreak(habits: Habit[], todayKey = toDateKey()) {
  const days = activityDays(habits).filter((day) => day <= todayKey);
  let best = 0;
  let run = 0;
  let previous: string | undefined;

  for (const day of days) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  return best;
}

/**
 * The run of check-in days still alive as of `todayKey`.
 *
 * Today not being logged yet does not break it — the day is not over. The run
 * is measured from yesterday in that case, exactly as `currentStreak` treats a
 * habit that is due today and not yet done.
 */
export function currentActivityStreak(habits: Habit[], todayKey = toDateKey()) {
  const days = new Set(activityDays(habits));
  let cursor = days.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;

  for (let index = 0; index < MAX_HISTORY_DAYS && days.has(cursor); index += 1) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/**
 * Best day-streak ever reached across every habit. Status is forced active so a
 * paused or archived habit still counts toward earned streak achievements.
 */
export function bestStreakAcrossHabits(habits: Habit[], todayKey = toDateKey()) {
  return habits.reduce((max, habit) => Math.max(max, bestStreak({ ...habit, status: "active" }, todayKey)), 0);
}

/**
 * Longest *current* streak across every habit, as of `todayKey`. Unlike
 * bestStreakAcrossHabits (best ever), this reflects the run ending on the given
 * day — so looking back a day yields a smaller number and streaks never carry
 * over to earlier dates.
 */
export function bestCurrentStreakAcrossHabits(habits: Habit[], todayKey = toDateKey()) {
  return habits.reduce((max, habit) => Math.max(max, currentStreak({ ...habit, status: "active" }, todayKey)), 0);
}

export function completionRate(habit: Habit, todayKey = toDateKey()) {
  const days = Math.min(MAX_HISTORY_DAYS, Math.max(1, daysBetween(habit.createdAt, todayKey) + 1));
  const scheduled = dateRange(days, todayKey).filter((dateKey) => isScheduledOnDate(habit, dateKey));

  if (scheduled.length === 0) {
    return 0;
  }

  const completed = scheduled.filter((dateKey) => isDoneOnDate(habit, dateKey)).length;
  return Math.round((completed / scheduled.length) * 100);
}

export function totalCompletions(habit: Habit) {
  return habit.completions.reduce((sum, entry) => sum + entry.count, 0);
}

export function weeklyCompletionCount(habit: Habit, dateKey = toDateKey()) {
  return weekRange(dateKey).reduce((sum, dayKey) => sum + completionCount(habit, dayKey), 0);
}

export function monthlyCompletionCount(habit: Habit, dateKey = toDateKey()) {
  return monthRange(dateKey).reduce((sum, dayKey) => sum + completionCount(habit, dayKey), 0);
}

export function isPerfectWeek(habit: Habit, dateKey: string) {
  const week = weekRange(dateKey).filter((dayKey) => {
    return daysBetween(habit.createdAt, dayKey) >= 0 && isScheduledOnDate(habit, dayKey);
  });

  return week.length > 0 && week.every((dayKey) => isDoneOnDate(habit, dayKey));
}

export function perfectWeeksForHabits(habits: Habit[], weeks = 12, todayKey = toDateKey()) {
  let total = 0;
  const activeHabits = habits.filter((habit) => habit.status === "active");

  for (let index = 0; index < weeks; index += 1) {
    const weekStart = addDays(toDateKey(new Date(`${todayKey}T12:00:00`)), index * -7);
    const week = weekRange(weekStart);
    const scheduledPairs = activeHabits.flatMap((habit) => {
      return week
        .filter((dayKey) => daysBetween(habit.createdAt, dayKey) >= 0 && isScheduledOnDate(habit, dayKey))
        .map((dayKey) => ({ habit, dayKey }));
    });

    if (scheduledPairs.length > 0 && scheduledPairs.every(({ habit, dayKey }) => isDoneOnDate(habit, dayKey))) {
      total += 1;
    }
  }

  return total;
}

export type DaySpanSummary = {
  /** Habit-days that were on the schedule across the span. */
  scheduled: number;
  /** How many of those were checked off. */
  done: number;
  /** Days where every scheduled habit was completed. */
  perfectDays: number;
  /** `done` over `scheduled`, as a whole percentage. Zero when nothing was due. */
  rate: number;
};

/**
 * Roll a run of days up into one set of totals.
 *
 * Days with nothing scheduled are skipped rather than counted as failures — a
 * rest day is not a miss, so it should neither dent the rate nor be handed out
 * as a free perfect day.
 */
export function summarizeDays(habits: Habit[], days: string[]): DaySpanSummary {
  let scheduled = 0;
  let done = 0;
  let perfectDays = 0;

  for (const day of days) {
    const dayHabits = habits.filter((habit) => isScheduledOnDate(habit, day));

    if (!dayHabits.length) {
      continue;
    }

    const dayDone = dayHabits.filter((habit) => isDoneOnDate(habit, day)).length;
    scheduled += dayHabits.length;
    done += dayDone;

    if (dayDone === dayHabits.length) {
      perfectDays += 1;
    }
  }

  return { scheduled, done, perfectDays, rate: scheduled ? Math.round((done / scheduled) * 100) : 0 };
}

/**
 * How a single day went across the whole habit set, for the home screen's week
 * strip: every scheduled habit done, some done, or nothing scheduled at all.
 *
 * "none" covers both an empty day and a rest day — neither is a miss, so the
 * strip draws them the same way.
 */
export type DayCompletionState = "complete" | "partial" | "missed" | "none";

export function dayCompletionState(habits: Habit[], dateKey: string): DayCompletionState {
  const scheduled = habits.filter((habit) => isScheduledOnDate(habit, dateKey));

  if (!scheduled.length) {
    return "none";
  }

  const done = scheduled.filter((habit) => isDoneOnDate(habit, dateKey)).length;

  if (done === scheduled.length) {
    return "complete";
  }

  return done > 0 ? "partial" : "missed";
}

/**
 * What the habit ASKS of you — "Weekdays", "3x a week", "Daily · 2x a day" —
 * as opposed to how it is going. Lives here rather than inside a card because
 * the habits list and the home screen's rows both label the same thing, and
 * two copies of this had already started to drift.
 */
export function cadenceLabel(habit: Habit) {
  if (habit.goal.type === "weekly") {
    return `${habit.goal.target}x a week`;
  }

  if (habit.goal.type === "monthly") {
    return `${habit.goal.target}x a month`;
  }

  const schedule = habit.repeatSchedule;
  const days =
    schedule.type === "weekdays"
      ? "Weekdays"
      : schedule.type === "weekends"
        ? "Weekends"
        : schedule.type === "specific"
          ? `${scheduledWeekdays(habit).length} days a week`
          : schedule.type === "interval"
            ? `Every ${schedule.every} days`
            : "Daily";
  const target = dailyTarget(habit);
  const perDay = habit.goal.type === "multiple" && target > 1 ? `${target}x a day` : null;

  return perDay ? `${days} · ${perDay}` : days;
}

export function habitSummary(habit: Habit) {
  return {
    currentStreak: currentStreak(habit),
    bestStreak: bestStreak(habit),
    completionRate: completionRate(habit),
    totalCompletions: totalCompletions(habit),
    weeklyCount: weeklyCompletionCount(habit),
    monthlyCount: monthlyCompletionCount(habit)
  };
}

export type AnalyticsPeriod = "week" | "month" | "year";

export type PeriodAnalytics = DaySpanSummary & {
  /** First and last day covered — the period's start through today. */
  startKey: string;
  endKey: string;
  /** Days with at least one check-in, out of the days elapsed so far. */
  activeDays: number;
  elapsedDays: number;
  /** Longest run of consecutive check-in days inside the period. */
  bestRun: number;
  /** One bar per day (week, month) or per month (year). `rate` is null for days not yet reached. */
  buckets: { key: string; label: string; rate: number | null }[];
  /** Per-habit rate across the period, best first. Habits with nothing due are left out. */
  habits: { habit: Habit; done: number; scheduled: number; rate: number }[];
  /** The whole previous period's rate, or null when nothing was due in it. */
  previousRate: number | null;
};

/**
 * The analytics page's figures for this week, month or year to date.
 *
 * Built on `summarizeDays`, so a rest day is never a miss here either. Rates
 * read active habits only (that is what `isScheduledOnDate` counts); check-in
 * days read every habit passed, matching `currentActivityStreak`.
 */
export function periodAnalytics(habits: Habit[], period: AnalyticsPeriod, todayKey = toDateKey()): PeriodAnalytics {
  const today = parseDateKey(todayKey);
  const startKey =
    period === "week" ? startOfWeekMonday(todayKey) : period === "month" ? startOfMonth(todayKey) : `${today.getFullYear()}-01-01`;
  const days = dateRange(daysBetween(startKey, todayKey) + 1, todayKey);
  const summary = summarizeDays(habits, days);

  const activity = new Set(activityDays(habits));
  let bestRun = 0;
  let run = 0;

  for (const day of days) {
    run = activity.has(day) ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  }

  const rateOf = (span: string[]) => {
    const result = summarizeDays(habits, span);
    return result.scheduled ? result.rate : null;
  };

  const buckets =
    period === "year"
      ? Array.from({ length: 12 }, (_, month) => {
          const key = toDateKey(new Date(today.getFullYear(), month, 1, 12));
          return {
            key,
            label: parseDateKey(key).toLocaleDateString(undefined, { month: "narrow" }),
            rate: key > todayKey ? null : rateOf(monthRange(key).filter((day) => day <= todayKey))
          };
        })
      : (period === "week" ? weekRangeMonday(todayKey) : monthRange(todayKey)).map((key, index) => ({
          key,
          label: period === "week" ? ["M", "T", "W", "T", "F", "S", "S"][index] : String(index + 1),
          rate: key > todayKey ? null : rateOf([key])
        }));

  const previousEnd = addDays(startKey, -1);
  const previousStart =
    period === "week" ? startOfWeekMonday(previousEnd) : period === "month" ? startOfMonth(previousEnd) : `${today.getFullYear() - 1}-01-01`;

  return {
    ...summary,
    startKey,
    endKey: todayKey,
    activeDays: days.filter((day) => activity.has(day)).length,
    elapsedDays: days.length,
    bestRun,
    buckets,
    habits: habits
      .map((habit) => ({ habit, ...summarizeDays([habit], days) }))
      .filter((item) => item.scheduled > 0)
      .sort((a, b) => b.rate - a.rate || b.done - a.done)
      .map(({ habit, done, scheduled, rate }) => ({ habit, done, scheduled, rate })),
    previousRate: rateOf(dateRange(daysBetween(previousStart, previousEnd) + 1, previousEnd))
  };
}
