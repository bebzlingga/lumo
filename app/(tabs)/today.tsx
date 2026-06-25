import React, { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { fontFamilies, layout, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { addDays, parseDateKey, toDateKey } from "@/lib/date";
import { isDoneOnDate, isScheduledOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { DateStrip } from "@/components/DateStrip";
import { QuickDoneWidgets } from "@/components/QuickDoneWidgets";
import { AppText, LoadingState, Screen } from "@/components/ui";

type RecentProgress = {
  completeDays: number;
  missedDays: number;
  trackedDays: number;
};

function progressForDay(habits: Habit[], dateKey: string): "complete" | "missed" | "none" {
  const scheduledHabits = habits.filter((habit) => isScheduledOnDate(habit, dateKey));

  if (!scheduledHabits.length) {
    return "none";
  }

  return scheduledHabits.every((habit) => isDoneOnDate(habit, dateKey)) ? "complete" : "missed";
}

function recentProgress(habits: Habit[], dateKey: string, todayKey: string): RecentProgress {
  const anchorKey = dateKey > todayKey ? todayKey : dateKey;
  const anchorDate = parseDateKey(anchorKey);
  const progress: RecentProgress = {
    completeDays: 0,
    missedDays: 0,
    trackedDays: 0
  };

  for (let index = 1; index <= 5; index += 1) {
    const previousKey = addDays(anchorKey, -index);
    const previousDate = parseDateKey(previousKey);

    if (previousDate.getMonth() !== anchorDate.getMonth() || previousDate.getFullYear() !== anchorDate.getFullYear()) {
      continue;
    }

    const dayProgress = progressForDay(habits, previousKey);

    if (dayProgress === "none") {
      continue;
    }

    progress.trackedDays += 1;

    if (dayProgress === "complete") {
      progress.completeDays += 1;
    } else {
      progress.missedDays += 1;
    }
  }

  return progress;
}

function monthlyHeaderMessage(dateKey: string, habits: Habit[], todayKey: string) {
  const date = parseDateKey(dateKey);
  const day = date.getDate();
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - day;
  const progress = recentProgress(habits, dateKey, todayKey);

  const recoveryMessages = [
    "Fresh start,\none habit today counts.",
    "Missed days happen,\nlet's show up today.",
    "Reset gently,\none habit gets you moving.",
    "A red day is not the end,\ntoday can turn green.",
    "Still in the game,\nchoose one habit now.",
    "Almost there,\nfinish with one win."
  ];

  const momentumMessages = [
    "Green days already,\nkeep the spark going.",
    "Nice rhythm,\nkeep stacking wins.",
    "Momentum is building,\nstay with it.",
    "Your habits are showing,\nkeep them glowing.",
    "Strong month,\nkeep protecting the streak.",
    "Almost there,\nbring it home."
  ];

  const neutralMessages = [
    "Fresh month,\nstart with one small win.",
    "Nice start,\nfind your rhythm today.",
    "Momentum can start here,\none habit at a time.",
    "Halfway energy,\nshow up for one habit.",
    "Keep stacking wins,\nyou're getting close.",
    "Almost there,\nfinish strong."
  ];

  const phaseIndex = daysLeft <= 4 ? 5 : Math.min(4, Math.floor((day - 1) / 5));

  if (progress.missedDays > 0) {
    return recoveryMessages[phaseIndex];
  }

  if (progress.completeDays > 0) {
    return momentumMessages[phaseIndex];
  }

  return neutralMessages[phaseIndex];
}

export default function TodayScreen() {
  const { habits, isReady, nickname, palette } = useLumo();
  const todayKey = toDateKey();
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const activeHabits = habits.filter((habit) => habit.status === "active");
  const headerMessage = monthlyHeaderMessage(todayKey, activeHabits, todayKey);
  const selectedHabits = activeHabits.filter((habit) => isScheduledOnDate(habit, selectedDateKey));

  useEffect(() => {
    setSelectedDateKey(todayKey);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setSelectedDateKey(toDateKey());
      }
    });

    return () => subscription.remove();
  }, [todayKey]);

  if (!isReady) {
    return <LoadingState />;
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.checkInPanel}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.greetingTitle}>
              Hey, {nickname?.trim() || "there"}!
            </AppText>
            <AppText variant="titleSmall" color={palette.ink} style={styles.questionTitle}>
              {headerMessage}
            </AppText>
          </View>
        </View>

        <DateStrip selectedDateKey={selectedDateKey} habits={activeHabits} onSelectDate={setSelectedDateKey} />
      </View>

      <QuickDoneWidgets habits={selectedHabits} dateKey={selectedDateKey} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: layout.tabScreenBottomPadding
  },
  checkInPanel: {
    gap: spacing.md
  },
  header: {
    gap: spacing.xs
  },
  headerCopy: {
    flex: 1
  },
  greetingTitle: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 18,
    lineHeight: 23,
    marginBottom: spacing.xs
  },
  questionTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 31,
    lineHeight: 38
  }
});
