import { Habit, Weekday } from "@/types/habit";
import { addDays, dateRange, daysBetween, monthRange, toDateKey, weekRange } from "./date";

export function dailyTarget(habit: Habit) {
  return habit.goal.type === "multiple" ? habit.goal.count : 1;
}

export function completionCount(habit: Habit, dateKey: string) {
  return habit.completions.find((entry) => entry.date === dateKey)?.count ?? 0;
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

  for (let index = 0; index < 370; index += 1) {
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
  const days = Math.min(370, Math.max(1, daysBetween(habit.createdAt, todayKey) + 1));
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

export function completionRate(habit: Habit, todayKey = toDateKey()) {
  const days = Math.min(370, Math.max(1, daysBetween(habit.createdAt, todayKey) + 1));
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
