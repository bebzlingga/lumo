import { router } from "expo-router";
import React from "react";
import { type DimensionValue, type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { fontFamilies, habitAccent, habitColors, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { addDays, dateRange, dayLabels, daysBetween, parseDateKey, toDateKey } from "@/lib/date";
import { completionCount, currentStreak, dailyTarget, isDoneOnDate, isScheduledOnDate, totalCompletions } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { FireIcon } from "./FireIcon";
import { HabitIcon } from "./HabitIcon";
import { Icon } from "./Icon";
import { AppText, StatTile } from "./ui";

export type StatsTab = "overall" | "weekly" | "monthly";

export const statsTabs: { label: string; value: StatsTab }[] = [
  { label: "Overall", value: "overall" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" }
];

const weekdayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayFullLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const weekdayHeatOrder = [1, 2, 3, 4, 5, 6, 0] as const;
const monthlyGridColumns = 22;
const monthlyGridGap = 4;

const ringPositions = [
  { top: 14, left: 76, width: 72, height: 34, rotate: "-28deg" },
  { top: 26, left: 156, width: 68, height: 34, rotate: "18deg" },
  { top: 82, left: 194, width: 92, height: 36, rotate: "82deg" },
  { top: 166, left: 154, width: 80, height: 34, rotate: "-6deg" },
  { top: 160, left: 46, width: 66, height: 34, rotate: "25deg" },
  { top: 86, left: 10, width: 86, height: 36, rotate: "-68deg" },
  { top: 44, left: 22, width: 58, height: 34, rotate: "18deg" },
  { top: 106, left: 220, width: 68, height: 34, rotate: "-18deg" }
];

function activeHabits(habits: Habit[]) {
  return habits.filter((habit) => habit.status === "active");
}

function mondayWeekRange(dateKey: string) {
  const date = parseDateKey(dateKey);
  const mondayOffset = (date.getDay() + 6) % 7;
  const monday = toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset, 12));

  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function lastThreeMonthRange(dateKey: string) {
  const date = parseDateKey(dateKey);
  const startKey = toDateKey(new Date(date.getFullYear(), date.getMonth() - 3, date.getDate(), 12));

  return dateRange(Math.max(1, daysBetween(startKey, dateKey)), dateKey);
}

function scheduleLabel(habit: Habit) {
  if (habit.goal.type === "multiple") {
    return `${habit.goal.count} times a day`;
  }

  if (habit.goal.type === "weekly") {
    return `${habit.goal.target} days per week`;
  }

  if (habit.goal.type === "monthly") {
    return `${habit.goal.target} days per month`;
  }

  switch (habit.repeatSchedule.type) {
    case "daily":
      return "Everyday";
    case "weekdays":
      return "Weekdays";
    case "weekends":
      return "Weekends";
    case "specific":
      return `${habit.repeatSchedule.days.length} days per week`;
    case "interval":
      return `Every ${habit.repeatSchedule.every} day${habit.repeatSchedule.every === 1 ? "" : "s"}`;
  }
}

function dateProgress(habit: Habit, dateKey: string, todayKey = toDateKey()) {
  if (dateKey > todayKey || dateKey < habit.createdAt || !isScheduledOnDate(habit, dateKey)) {
    return "empty" as const;
  }

  const count = completionCount(habit, dateKey);

  if (count <= 0) {
    return "missed" as const;
  }

  if (habit.goal.type === "multiple" && count < dailyTarget(habit)) {
    return "partial" as const;
  }

  return "done" as const;
}

function dayRate(habits: Habit[], dateKey: string) {
  const scheduled = habits.filter((habit) => dateKey >= habit.createdAt && isScheduledOnDate(habit, dateKey));

  if (!scheduled.length) {
    return 0;
  }

  return scheduled.filter((habit) => isDoneOnDate(habit, dateKey)).length / scheduled.length;
}

function completedHabitDays(habits: Habit[], todayKey = toDateKey()) {
  const startKey = habits.reduce((earliest, habit) => (habit.createdAt < earliest ? habit.createdAt : earliest), todayKey);
  const days = dateRange(Math.max(1, daysBetween(startKey, todayKey) + 1), todayKey);

  return days.reduce((sum, dateKey) => {
    const scheduled = habits.filter((habit) => dateKey >= habit.createdAt && isScheduledOnDate(habit, dateKey));

    return sum + scheduled.filter((habit) => isDoneOnDate(habit, dateKey)).length;
  }, 0);
}

function allTimeBestStreak(habit: Habit, todayKey = toDateKey()) {
  const days = dateRange(Math.max(1, daysBetween(habit.createdAt, todayKey) + 1), todayKey);
  let best = 0;
  let run = 0;

  for (const dateKey of days) {
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

function allTimeCompletionRate(habit: Habit, todayKey = toDateKey()) {
  const days = dateRange(Math.max(1, daysBetween(habit.createdAt, todayKey) + 1), todayKey);
  const scheduled = days.filter((dateKey) => isScheduledOnDate(habit, dateKey));

  if (!scheduled.length) {
    return 0;
  }

  return Math.round((scheduled.filter((dateKey) => isDoneOnDate(habit, dateKey)).length / scheduled.length) * 100);
}

function missedPatternByWeekday(habits: Habit[], todayKey = toDateKey()) {
  const startKey = habits.reduce((earliest, habit) => (habit.createdAt < earliest ? habit.createdAt : earliest), todayKey);
  const endKey = addDays(todayKey, -1);
  const days = daysBetween(startKey, endKey) >= 0 ? dateRange(daysBetween(startKey, endKey) + 1, endKey) : [];
  const pattern = dayLabels.map((shortLabel, day) => ({
    day,
    label: weekdayFullLabels[day],
    shortLabel,
    missed: 0,
    scheduled: 0,
    rate: 0
  }));

  days.forEach((dateKey) => {
    const day = parseDateKey(dateKey).getDay();

    habits.forEach((habit) => {
      if (dateKey < habit.createdAt || !isScheduledOnDate(habit, dateKey)) {
        return;
      }

      pattern[day].scheduled += 1;

      if (!isDoneOnDate(habit, dateKey)) {
        pattern[day].missed += 1;
      }
    });
  });

  return pattern.map((item) => ({
    ...item,
    rate: item.scheduled ? item.missed / item.scheduled : 0
  }));
}

function todayScoreForHabits(habits: Habit[], dateKey: string) {
  const scheduled = habits.filter((habit) => dateKey >= habit.createdAt && isScheduledOnDate(habit, dateKey));

  if (!scheduled.length) {
    return { score: 0, rate: 0, completed: 0, total: 0 };
  }

  const total = scheduled.reduce((sum, habit) => sum + dailyTarget(habit), 0);
  const completed = scheduled.reduce((sum, habit) => {
    return sum + Math.min(completionCount(habit, dateKey), dailyTarget(habit));
  }, 0);
  const rate = total ? completed / total : 0;

  return {
    score: Math.round(rate * 100) / 10,
    rate,
    completed,
    total
  };
}

function EmptyStats({ message }: { message: string }) {
  const { palette } = useLumo();
  const emptyColor = alpha(palette.subtle, "B8");

  return (
    <View style={styles.emptyState}>
      <Icon name="sparkle" size={34} color={emptyColor} weight="bulk" />
      <AppText variant="bodySmall" color={emptyColor} style={[styles.centerText, styles.emptyText]}>
        {message}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/habit/new")}
        style={({ pressed }) => [
          styles.addButton,
          {
            backgroundColor: palette.ink,
            opacity: pressed ? 0.75 : 1
          }
        ]}
      >
        <Icon name="plus" size={16} color={palette.card} weight="bold" />
        <AppText variant="button" color={palette.card}>
          Add habit
        </AppText>
      </Pressable>
    </View>
  );
}

export function StatsSegmentedControl({ value, onChange }: { value: StatsTab; onChange: (value: StatsTab) => void }) {
  const { palette, isDark } = useLumo();
  const controlBackground = isDark ? palette.chartTrack : alpha(palette.chartTrack, "99");
  const selectedBackground = isDark ? palette.greenDark : palette.white;
  const inactiveText = palette.subtle;

  return (
    <View className="mb-2 w-full flex-row px-2 py-2" style={[styles.segmentedControl, styles.segmentedShadow, { backgroundColor: controlBackground, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      {statsTabs.map((tab) => {
        const selected = value === tab.value;

        return (
          <Pressable
            key={tab.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.value)}
            className="min-w-0 flex-1 items-stretch justify-center px-0.5"
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.75 : 1
              }
            ]}
          >
            <View
              className="w-full items-center justify-center"
              style={[
                selected
                  ? {
                      backgroundColor: selectedBackground,
                      borderColor: isDark ? palette.greenDark : "transparent",
                      borderWidth: isDark ? 1 : 0,
                      shadowColor: isDark ? "transparent" : palette.shadow,
                      shadowOpacity: isDark ? 0 : 0.08,
                      shadowRadius: 5,
                      elevation: 1
                    }
                  : { backgroundColor: "transparent" },
                styles.segmentSurface,
                styles.segmentSurfaceShadow
              ]}
            >
              <AppText variant="button" color={selected ? (isDark ? palette.onAccent : palette.greenDark) : inactiveText} numberOfLines={1} style={[styles.segmentText, selected ? styles.segmentTextActive : styles.segmentTextInactive]}>
                {tab.label}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TodayStatsView({ habits, onOpenOverall }: { habits: Habit[]; onOpenOverall?: () => void }) {
  const { palette } = useLumo();
  const todayKey = toDateKey();
  const yesterdayKey = addDays(todayKey, -1);
  const currentHabits = activeHabits(habits);
  const todayHabits = currentHabits.filter((habit) => isScheduledOnDate(habit, todayKey));
  const remainingToday = todayHabits
    .map((habit) => {
      const target = dailyTarget(habit);
      const completed = Math.min(completionCount(habit, todayKey), target);

      return {
        habit,
        remaining: Math.max(0, target - completed)
      };
    })
    .filter((item) => item.remaining > 0);
  const bestCurrentStreak = currentHabits
    .map((habit) => ({ habit, streak: currentStreak(habit, todayKey) }))
    .sort((a, b) => b.streak - a.streak)[0];
  const ringHabits = (todayHabits.length ? todayHabits : currentHabits).slice(0, ringPositions.length);
  const today = todayScoreForHabits(currentHabits, todayKey);
  const yesterday = todayScoreForHabits(currentHabits, yesterdayKey);
  const delta = Math.round((today.rate - yesterday.rate) * 100);
  const hasDelta = today.total > 0 && yesterday.total > 0 && delta !== 0;
  const deltaColor = delta < 0 ? palette.danger : palette.greenDark;
  const scoreCopy =
    today.rate >= 1
      ? "Your daily habits are completed."
      : today.rate > 0
        ? "Your daily habits are not completed."
        : "Start with one small win today.";

  if (!currentHabits.length) {
    return <EmptyStats message="No habits to measure yet." />;
  }

  return (
    <View style={styles.viewStack}>
      <View style={styles.todayScoreWrap}>
        {ringHabits.map((habit, index) => {
          const position = ringPositions[index];

          return (
            <View
              key={habit.id}
              style={[
                styles.ringHabit,
                {
                  top: position.top,
                  left: position.left,
                  width: position.width,
                  height: position.height,
                  backgroundColor: alpha(palette.greenDark, "66"),
                  transform: [{ rotate: position.rotate }]
                }
              ]}
            >
              <HabitIcon value={habit.emoji} color={palette.ink} size={19} />
            </View>
          );
        })}
        <View style={styles.scoreCenter}>
          <AppText color={palette.ink} style={styles.scoreText}>
            {today.score.toFixed(1)}
          </AppText>
          <AppText variant="caption" color={palette.ink} style={styles.scoreCaption}>
            {scoreCopy}
          </AppText>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/habit/new")}
          style={({ pressed }) => [
            styles.addButton,
            {
              backgroundColor: palette.ink,
              opacity: pressed ? 0.75 : 1
            }
          ]}
        >
          <Icon name="plus" size={16} color={palette.card} weight="bold" />
          <AppText variant="button" color={palette.card}>
            Add habit
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit habits"
          onPress={() => router.push("/(tabs)/today")}
          style={({ pressed }) => [
            styles.roundIconButton,
            {
              backgroundColor: palette.surface,
              opacity: pressed ? 0.75 : 1
            }
          ]}
        >
          <Icon name="edit" size={18} color={palette.ink} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View overall insights"
          onPress={onOpenOverall}
          style={({ pressed }) => [
            styles.roundIconButton,
            {
              backgroundColor: palette.surface,
              opacity: pressed ? 0.75 : 1
            }
          ]}
        >
          <Icon name="chart" size={18} color={palette.ink} />
        </Pressable>
      </View>

      <TodayInsightCard completed={today.completed} total={today.total} remaining={remainingToday} bestStreak={bestCurrentStreak} />

      <View style={[styles.noticeCard, { backgroundColor: palette.greenSoft }]}>
        <AppText variant="bodySmall" color={palette.ink}>
          {hasDelta ? (
            <>
              Your habits score {delta < 0 ? "dropped " : "improved "}
              <AppText variant="bodySmall" color={deltaColor} style={styles.inlineStrong}>
                {Math.abs(delta)}%
              </AppText>{" "}
              compared to yesterday.
            </>
          ) : (
            "Your habits score is steady compared to yesterday."
          )}
        </AppText>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.discussButton,
            {
              backgroundColor: palette.ink,
              opacity: pressed ? 0.75 : 1
            }
          ]}
        >
          <AppText variant="button" color={palette.card}>
            Let's discuss
          </AppText>
        </Pressable>
      </View>

      <DailySummaryBars habits={currentHabits} />
    </View>
  );
}

function TodayInsightCard({
  completed,
  total,
  remaining,
  bestStreak
}: {
  completed: number;
  total: number;
  remaining: { habit: Habit; remaining: number }[];
  bestStreak?: { habit: Habit; streak: number };
}) {
  const { palette, isDark } = useLumo();
  const progress = total ? completed / total : 0;
  const visibleRemaining = remaining.slice(0, 3);
  const extraRemainingCount = Math.max(0, remaining.length - visibleRemaining.length);
  const remainingTotal = remaining.reduce((sum, item) => sum + item.remaining, 0);
  const progressLabel = total ? `${completed}/${total} check-ins` : "No habits scheduled";
  const progressValue = total ? `${Math.round(progress * 100)}%` : "Clear";

  return (
    <View style={[styles.habitCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      <View style={styles.todayProgressHeader}>
        <View style={styles.todayProgressCopy}>
          <AppText variant="titleSmall">Today's Progress</AppText>
          <AppText variant="bodySmall" color={palette.subtle}>
            {progressLabel}
          </AppText>
        </View>
        <AppText variant="titleSmall" color={palette.greenDark} style={styles.todayProgressValue}>
          {progressValue}
        </AppText>
      </View>

      <View style={[styles.todayProgressTrack, { backgroundColor: palette.surface }]}>
        <View style={[styles.todayProgressFill, { width: `${progress * 100}%`, backgroundColor: palette.greenDark }]} />
      </View>

      <View style={[styles.habitDivider, { backgroundColor: palette.hairline }]} />

      <View style={styles.todaySection}>
        <View style={styles.todaySectionHeader}>
          <AppText variant="titleSmall">Remaining Today</AppText>
          <AppText variant="bodySmall" color={palette.muted} style={styles.habitScheduleText}>
            {remainingTotal ? `${remainingTotal} left` : "Done"}
          </AppText>
        </View>
        {visibleRemaining.length ? (
          <>
            {visibleRemaining.map(({ habit, remaining: remainingCount }, index) => (
              <View
                key={habit.id}
                style={[
                  styles.todayInsightRow,
                  index < visibleRemaining.length - 1 || extraRemainingCount > 0
                    ? { borderBottomColor: palette.hairline, borderBottomWidth: StyleSheet.hairlineWidth }
                    : null
                ]}
              >
                <View style={styles.habitTitle}>
                  <HabitIcon value={habit.emoji} color={palette.ink} size={18} />
                  <AppText variant="bodySmall" numberOfLines={1} style={styles.overallHabitName}>
                    {habit.name}
                  </AppText>
                </View>
                <AppText variant="bodySmall" color={palette.muted} style={styles.overallHabitTotal}>
                  {remainingCount} left
                </AppText>
              </View>
            ))}
            {extraRemainingCount > 0 ? (
              <AppText variant="bodySmall" color={palette.muted} style={styles.todayExtraText}>
                +{extraRemainingCount} more for today
              </AppText>
            ) : null}
          </>
        ) : (
          <View style={styles.todayInsightRow}>
            <View style={styles.habitTitle}>
              <Icon name="checkCircle" size={18} color={palette.greenDark} weight="bulk" />
              <AppText variant="bodySmall" color={palette.subtle} numberOfLines={2} style={styles.todayEmptyText}>
                All scheduled habits are complete.
              </AppText>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.habitDivider, { backgroundColor: palette.hairline }]} />

      <View style={styles.todaySection}>
        <View style={styles.todaySectionHeader}>
          <AppText variant="titleSmall">Best Current Streak</AppText>
        </View>
        {bestStreak && bestStreak.streak > 0 ? (
          <View style={styles.todayInsightRow}>
            <View style={styles.habitTitle}>
              <HabitIcon value={bestStreak.habit.emoji} color={palette.ink} size={18} />
              <AppText variant="bodySmall" numberOfLines={1} style={styles.overallHabitName}>
                {bestStreak.habit.name}
              </AppText>
            </View>
            <AppText variant="bodySmall" color={palette.greenDark} style={styles.overallHabitTotal}>
              {bestStreak.streak} day{bestStreak.streak === 1 ? "" : "s"}
            </AppText>
          </View>
        ) : (
          <View style={styles.todayInsightRow}>
            <View style={styles.habitTitle}>
              <Icon name="streakFire" size={18} color={palette.glow} weight="bulk" />
              <AppText variant="bodySmall" color={palette.subtle} numberOfLines={2} style={styles.todayEmptyText}>
                Finish one habit to start a streak.
              </AppText>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function DailySummaryBars({ habits }: { habits: Habit[] }) {
  const { palette } = useLumo();
  const todayKey = toDateKey();
  const days = dateRange(7, todayKey);

  return (
    <View style={styles.summaryBlock}>
      <AppText variant="titleSmall">Summary:</AppText>
      <View style={styles.summaryBars}>
        {days.map((dateKey, index) => {
          const rate = dayRate(habits, dateKey);
          const date = parseDateKey(dateKey);

          return (
            <View key={dateKey} style={styles.summaryColumn}>
              <View style={[styles.summaryTrack, { backgroundColor: palette.surface }]}>
                <View
                  style={[
                    styles.summaryFill,
                    {
                      height: `${Math.max(14, rate * 100)}%`,
                      backgroundColor: alpha(habitColors[index % habitColors.length], "88")
                    }
                  ]}
                />
              </View>
              <AppText variant="caption" color={palette.muted} style={styles.centerText}>
                {dayLabels[date.getDay()].slice(0, 1)}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function WeeklyStatsView({ habits }: { habits: Habit[] }) {
  const currentHabits = activeHabits(habits);

  if (!currentHabits.length) {
    return <EmptyStats message="Your weekly habit view will appear here." />;
  }

  return (
    <View style={styles.viewStack}>
      {currentHabits.map((habit) => (
        <WeeklyHabitCard key={habit.id} habit={habit} />
      ))}
    </View>
  );
}

export function MonthlyStatsView({ habits }: { habits: Habit[] }) {
  const currentHabits = activeHabits(habits);

  if (!currentHabits.length) {
    return <EmptyStats message="Your monthly habit view will appear here." />;
  }

  return (
    <View style={styles.viewStack}>
      {currentHabits.map((habit) => (
        <MonthlyHabitCard key={habit.id} habit={habit} />
      ))}
    </View>
  );
}

function MonthlyHabitCard({ habit }: { habit: Habit }) {
  const { palette, isDark } = useLumo();
  const accentColor = habitAccent(habit.color, isDark);
  const doneColor = accentColor ?? palette.greenDark;
  const emptyColor = accentColor ? alpha(accentColor, "24") : alpha(palette.greenSoft, "3D");
  const [monthGridWidth, setMonthGridWidth] = React.useState(0);
  const todayKey = toDateKey();
  const days = lastThreeMonthRange(todayKey).slice(3);
  const streak = currentStreak(habit, todayKey);
  const monthDotSize =
    monthGridWidth > 0
      ? Math.max(8, (monthGridWidth - monthlyGridGap * (monthlyGridColumns - 1)) / monthlyGridColumns)
      : 12;
  const handleMonthGridLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;

    setMonthGridWidth((currentWidth) => (Math.abs(currentWidth - nextWidth) > 0.5 ? nextWidth : currentWidth));
  };

  return (
    <View style={[styles.habitCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      <View style={styles.habitHeader}>
        <View style={styles.habitTitle}>
          <HabitIcon value={habit.emoji} color={accentColor ?? palette.green} size={18} />
          <AppText variant="titleSmall" numberOfLines={1} style={styles.habitName}>
            {habit.name}
          </AppText>
        </View>
        {streak >= 3 ? (
          <View style={styles.habitStreak}>
            <FireIcon size={14} />
            <AppText variant="bodySmall" color={palette.muted} numberOfLines={1} style={styles.habitScheduleText}>
              {streak} day streak
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={[styles.habitDivider, { backgroundColor: palette.hairline }]} />

      <View onLayout={handleMonthGridLayout} style={styles.monthGrid}>
        {days.map((dateKey, index) => {
          const status = dateProgress(habit, dateKey, todayKey);
          const isRowEnd = (index + 1) % monthlyGridColumns === 0;
          const fill =
            status === "done"
              ? doneColor
              : status === "partial"
                ? alpha(doneColor, "66")
                : emptyColor;

          return (
            <View
              key={dateKey}
              style={[
                styles.monthDot,
                {
                  width: monthDotSize,
                  height: monthDotSize,
                  marginRight: isRowEnd ? 0 : monthlyGridGap,
                  marginBottom: monthlyGridGap,
                  backgroundColor: fill
                }
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

function WeeklyHabitCard({ habit }: { habit: Habit }) {
  const { palette, isDark } = useLumo();
  const accentColor = habitAccent(habit.color, isDark);
  const doneColor = accentColor ?? palette.greenDark;
  const emptyColor = accentColor ? alpha(accentColor, "24") : alpha(palette.greenSoft, "3D");
  const todayKey = toDateKey();
  const week = mondayWeekRange(todayKey);

  return (
    <View style={[styles.habitCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      <View style={styles.habitHeader}>
        <View style={styles.habitTitle}>
          <HabitIcon value={habit.emoji} color={accentColor ?? palette.green} size={18} />
          <AppText variant="titleSmall" numberOfLines={1} style={styles.habitName}>
            {habit.name}
          </AppText>
        </View>
        <AppText variant="bodySmall" color={palette.muted} numberOfLines={1} style={styles.habitScheduleText}>
          {scheduleLabel(habit)}
        </AppText>
      </View>

      <View style={[styles.habitDivider, { backgroundColor: palette.hairline }]} />

      <View style={styles.weekGrid}>
        {week.map((dateKey, index) => {
          const status = dateProgress(habit, dateKey, todayKey);
          const done = status === "done";
          const partial = status === "partial";
          const backgroundColor = done ? doneColor : partial ? alpha(doneColor, "66") : emptyColor;

          return (
            <View key={dateKey} style={styles.weekDay}>
              <AppText variant="caption" color={palette.body} style={styles.centerText}>
                {weekdayOrder[index]}
              </AppText>
              <View
                style={[
                  styles.weekDot,
                  {
                    backgroundColor,
                    borderColor: backgroundColor
                  }
                ]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function OverallStatsView({ habits }: { habits: Habit[] }) {
  const currentHabits = React.useMemo(() => activeHabits(habits), [habits]);
  const { completedDays, best, successRate, completed } = React.useMemo(() => {
    return {
      completedDays: completedHabitDays(currentHabits),
      best: currentHabits.reduce((max, habit) => Math.max(max, allTimeBestStreak(habit)), 0),
      successRate: currentHabits.length
        ? Math.round(currentHabits.reduce((sum, habit) => sum + allTimeCompletionRate(habit), 0) / currentHabits.length)
        : 0,
      completed: currentHabits.reduce((sum, habit) => sum + totalCompletions(habit), 0)
    };
  }, [currentHabits]);

  if (!currentHabits.length) {
    return <EmptyStats message="Overall progress will build as you track habits." />;
  }

  return (
    <View style={styles.viewStack}>
      <View style={styles.metricGrid}>
        <StatTile label="Completed habits" value={`${completedDays}`} icon="taskSquare" />
        <StatTile label="Best streak" value={`${best}`} icon="trophy" />
        <StatTile label="Completion rate" value={`${successRate}%`} icon="chart" />
        <StatTile label="Total completions" value={`${completed}`} icon="checkCircle" />
      </View>

      <OverallHabitBarChart habits={currentHabits} />
      <OverallMissPatternCard habits={currentHabits} />
    </View>
  );
}

function OverallHabitBarChart({ habits }: { habits: Habit[] }) {
  const { palette, isDark } = useLumo();
  const { width } = useWindowDimensions();
  // In dark mode chartTrack sits too close to the card color, so the empty
  // track uses a soft wash of the theme accent instead.
  const trackColor = isDark ? alpha(palette.greenDark, "1A") : palette.chartTrack;
  const chartHabits = React.useMemo(
    () =>
      [...habits]
        .sort((a, b) => totalCompletions(b) - totalCompletions(a))
        .map((habit) => ({ habit, total: totalCompletions(habit) })),
    [habits]
  );
  const maxTotal = Math.max(1, ...chartHabits.map((item) => item.total));
  const cardHorizontalPadding = spacing.md * 2;
  const screenHorizontalPadding = spacing.lg * 2;
  const visibleSlots = 8;
  const slotGap = spacing.sm;
  const availableWidth = Math.max(280, width - screenHorizontalPadding - cardHorizontalPadding);
  const slotWidth = Math.max(34, (availableWidth - slotGap * (visibleSlots - 1)) / visibleSlots);
  const placeholderCount = Math.max(0, visibleSlots - chartHabits.length);
  const chartSlotCount = chartHabits.length + placeholderCount;
  const contentWidth = chartSlotCount * slotWidth + Math.max(0, chartSlotCount - 1) * slotGap;

  return (
    <View style={[styles.overallBarCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={chartHabits.length > visibleSlots}>
        <View style={[styles.overallBarContent, { width: contentWidth, gap: slotGap }]}>
          {chartHabits.map(({ habit, total }) => {
            const fillHeight: DimensionValue = total > 0 ? `${Math.max(10, (total / maxTotal) * 100)}%` : "0%";
            const barColor = habitAccent(habit.color, isDark) ?? palette.greenDark;

            return (
              <View key={habit.id} style={[styles.overallBarItem, { width: slotWidth }]}>
                <View style={[styles.overallBarTrack, { backgroundColor: trackColor }]}>
                  <View
                    style={[
                      styles.overallBarFill,
                      {
                        height: fillHeight,
                        backgroundColor: alpha(barColor, total > 0 ? "CC" : "00")
                      }
                    ]}
                  />
                </View>
                <View style={styles.overallBarIcon}>
                  <HabitIcon value={habit.emoji} color={barColor} size={21} />
                </View>
              </View>
            );
          })}
          {Array.from({ length: placeholderCount }, (_, index) => (
            <View key={`placeholder-${index}`} style={[styles.overallBarItem, { width: slotWidth }]}>
              <View style={[styles.overallBarTrack, { backgroundColor: trackColor }]} />
              <View style={styles.overallBarIcon} />
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.overallBarHeader, { borderTopColor: palette.hairline }]}>
        <AppText variant="titleSmall">Most Completed Habits</AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.overallBarAnalysis}>
          Every check-in is proof of progress. Keep going, one small win at a time.
        </AppText>
      </View>

      <View style={styles.overallHabitList}>
        {chartHabits.map(({ habit, total }, index) => (
          <View
            key={habit.id}
            style={[
              styles.overallHabitRow,
              index < chartHabits.length - 1 ? { borderBottomColor: palette.hairline, borderBottomWidth: StyleSheet.hairlineWidth } : null
            ]}
          >
            <View style={styles.habitTitle}>
              <HabitIcon value={habit.emoji} color={habitAccent(habit.color, isDark) ?? palette.ink} size={18} />
              <AppText variant="bodySmall" numberOfLines={1} style={styles.overallHabitName}>
                {habit.name}
              </AppText>
            </View>
            <AppText variant="bodySmall" color={palette.muted} style={styles.overallHabitTotal}>
              {total}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

function OverallMissPatternCard({ habits }: { habits: Habit[] }) {
  const { palette, isDark } = useLumo();
  // Same dark-mode track fix as the bar chart above.
  const trackColor = isDark ? alpha(palette.greenDark, "1A") : palette.chartTrack;
  const pattern = React.useMemo(() => missedPatternByWeekday(habits), [habits]);
  const orderedPattern = weekdayHeatOrder.map((day) => pattern[day]);
  const daysWithData = orderedPattern.filter((item) => item.scheduled > 0);
  const peakDay = daysWithData.reduce<(typeof orderedPattern)[number] | null>((peak, item) => {
    if (!peak) {
      return item;
    }

    if (item.rate > peak.rate) {
      return item;
    }

    if (item.rate === peak.rate && item.missed > peak.missed) {
      return item;
    }

    return peak;
  }, null);
  const maxMissed = Math.max(1, ...orderedPattern.map((item) => item.missed));
  const totalMissed = orderedPattern.reduce((sum, item) => sum + item.missed, 0);
  const totalScheduled = orderedPattern.reduce((sum, item) => sum + item.scheduled, 0);
  const overallMissRate = totalScheduled ? totalMissed / totalScheduled : 0;
  const insight =
    !peakDay || totalScheduled === 0
      ? "Miss patterns will appear as you build more history."
      : totalMissed === 0
        ? "No missed-day pattern yet. Your rhythm is holding steady. Keep protecting the routine that is already working."
        : totalMissed <= 2 || overallMissRate <= 0.1
          ? "Your missed days are still light, and no weekday looks too heavy yet. Keep the routine simple, then adjust only if one day starts feeling crowded."
          : `${peakDay.label}s seem to be your hardest habit day. Try making the day lighter by moving a few flexible habits elsewhere, so the week starts with an easier win.`;

  return (
    <View style={[styles.overallBarCard, styles.missPatternCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      <View style={styles.missBarContent}>
        {orderedPattern.map((item) => {
          const fillHeight: DimensionValue = item.missed > 0 ? `${Math.max(12, (item.missed / maxMissed) * 100)}%` : "0%";

          return (
            <View key={item.day} style={styles.missBarItem}>
              <View style={[styles.overallBarTrack, { backgroundColor: trackColor }]}>
                <View
                  style={[
                    styles.overallBarFill,
                    styles.missBarFill,
                    {
                      height: fillHeight,
                      backgroundColor: alpha(palette.danger, item.missed > 0 ? "CC" : "00")
                    }
                  ]}
                >
                  {item.missed > 0 ? (
                    <AppText variant="caption" color="#F8D8D3" style={styles.missBarCountText}>
                      {item.missed}
                    </AppText>
                  ) : null}
                </View>
              </View>
              <View style={styles.missBarLabel}>
                <AppText variant="caption" color={item.missed > 0 ? palette.danger : palette.muted} style={styles.centerText}>
                  {item.shortLabel.slice(0, 1)}
                </AppText>
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.habitDivider, { backgroundColor: palette.hairline }]} />

      <AppText variant="bodySmall" color={palette.subtle} style={styles.overallBarAnalysis}>
        {insight}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  segmentedControl: {
    borderRadius: radius.pill
  },
  segmentedShadow: {
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 4
  },
  segmentSurface: {
    minHeight: 44,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm
  },
  segmentSurfaceShadow: {
    shadowOffset: { width: 0, height: 4 }
  },
  segmentText: {
    textAlign: "center"
  },
  segmentTextActive: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  segmentTextInactive: {
    fontFamily: fontFamilies.lexendMedium
  },
  viewStack: {
    gap: spacing.sm
  },
  emptyState: {
    minHeight: 180,
    marginTop: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl
  },
  emptyText: {
    maxWidth: 280,
    fontFamily: fontFamilies.lexendSemiBold,
    lineHeight: 21
  },
  todayScoreWrap: {
    width: 296,
    height: 220,
    alignSelf: "center",
    marginTop: spacing.xs
  },
  ringHabit: {
    position: "absolute",
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  ringEmoji: {
    fontSize: 19,
    lineHeight: 23
  },
  scoreCenter: {
    position: "absolute",
    top: 70,
    left: 88,
    width: 120,
    alignItems: "center"
  },
  scoreText: {
    fontSize: 66,
    lineHeight: 72,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "center"
  },
  scoreCaption: {
    marginTop: -2,
    textAlign: "center"
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm
  },
  addButton: {
    minHeight: 42,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs
  },
  roundIconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  noticeCard: {
    borderRadius: radius.nav,
    padding: spacing.md,
    gap: spacing.md
  },
  discussButton: {
    minHeight: 36,
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center"
  },
  inlineStrong: {
    fontWeight: "700"
  },
  todayProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  todayProgressCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs
  },
  todayProgressValue: {
    fontFamily: fontFamilies.lexendBold
  },
  todayProgressTrack: {
    height: 9,
    borderRadius: radius.pill,
    overflow: "hidden"
  },
  todayProgressFill: {
    height: "100%",
    borderRadius: radius.pill
  },
  todaySection: {
    gap: spacing.xs
  },
  todaySectionHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  todayInsightRow: {
    minHeight: 38,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  todayExtraText: {
    paddingTop: spacing.xxs,
    textAlign: "center"
  },
  todayEmptyText: {
    flex: 1
  },
  summaryBlock: {
    gap: spacing.sm
  },
  summaryBars: {
    height: 170,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  summaryColumn: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    gap: spacing.xs
  },
  summaryTrack: {
    flex: 1,
    width: "100%",
    borderRadius: radius.sm,
    overflow: "hidden",
    justifyContent: "flex-end"
  },
  summaryFill: {
    width: "100%",
    borderRadius: radius.sm
  },
  habitCard: {
    borderRadius: radius.nav,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.075,
    shadowRadius: 18,
    elevation: 3
  },
  habitHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  habitTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  habitEmoji: {
    fontSize: 18,
    lineHeight: 22
  },
  habitName: {
    flex: 1
  },
  habitScheduleText: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 13,
    lineHeight: 18
  },
  habitStreak: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs
  },
  habitDivider: {
    height: StyleSheet.hairlineWidth
  },
  weekGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.xs
  },
  weekDay: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs
  },
  weekDot: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
  monthGrid: {
    alignSelf: "stretch",
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    alignContent: "flex-start",
    flexWrap: "wrap",
    paddingVertical: spacing.xxs
  },
  monthDot: {
    borderRadius: radius.xs
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  overallBarCard: {
    borderRadius: radius.nav,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.075,
    shadowRadius: 18,
    elevation: 3
  },
  missPatternCard: {
    paddingBottom: spacing.lg
  },
  overallBarHeader: {
    gap: spacing.xxs,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xs,
    paddingTop: spacing.lg
  },
  overallBarAnalysis: {
    lineHeight: 18
  },
  missBarContent: {
    minHeight: 170,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  missBarItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs
  },
  missBarCountText: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 11,
    lineHeight: 14,
    textAlign: "center"
  },
  missBarFill: {
    alignItems: "center",
    justifyContent: "center"
  },
  missBarLabel: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  overallBarContent: {
    minHeight: 170,
    flexDirection: "row",
    alignItems: "flex-end"
  },
  overallBarItem: {
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs
  },
  overallBarTrack: {
    width: 28,
    height: 116,
    borderRadius: radius.pill,
    overflow: "hidden",
    justifyContent: "flex-end"
  },
  overallBarFill: {
    width: "100%",
    borderRadius: radius.pill
  },
  overallBarIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center"
  },
  overallHabitList: {
    gap: 0
  },
  overallHabitRow: {
    minHeight: 38,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  overallHabitName: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold
  },
  overallHabitTotal: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  centerText: {
    textAlign: "center"
  }
});
