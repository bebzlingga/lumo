import React, { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { addDays, dateRange, daysBetween, monthRange, startOfWeek, toDateKey } from "@/lib/date";
import { completionCount, isScheduledOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";

type Props = {
  habit: Habit;
  days?: number;
  dotSize?: number;
  layout?: "weekly" | "monthly";
  tone?: "default" | "hero";
};

function alpha(color: string, value: string) {
  return color.startsWith("#") && color.length === 7 ? `${color}${value}` : color;
}

function Dot({
  status,
  size,
  isInactive,
  tone
}: {
  status: "empty" | "partial" | "complete" | "strong";
  size: number;
  isInactive: boolean;
  tone: NonNullable<Props["tone"]>;
}) {
  const { palette, isDark } = useLumo();
  const scale = useSharedValue(status === "empty" ? 0.92 : 1);

  useEffect(() => {
    scale.value = withSpring(status === "empty" ? 0.92 : 1, { damping: 12, stiffness: 160 });
  }, [scale, status]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const backgroundColor =
    tone === "hero"
      ? status === "empty"
        ? `${palette.white}${isDark ? "33" : "44"}`
        : status === "partial"
          ? `${palette.white}99`
          : palette.white
      : status === "empty"
        ? alpha(palette.greenSoft, "3D")
        : status === "partial"
          ? alpha(palette.greenDark, "66")
          : palette.greenDark;

  return (
    <Animated.View
      style={[
        styles.dot,
        animatedStyle,
        {
          width: size,
          height: size,
          borderRadius: Math.min(radius.xs, size / 2),
          backgroundColor,
          opacity: isInactive ? 0.72 : 1
        }
      ]}
    />
  );
}

function getDotStatus(habit: Habit, dateKey: string, todayKey: string): "empty" | "partial" | "complete" | "strong" {
  const chartHabit = { ...habit, status: "active" as const };

  if (dateKey > todayKey || dateKey < habit.createdAt || !isScheduledOnDate(chartHabit, dateKey)) {
    return "empty";
  }

  const count = completionCount(habit, dateKey);

  if (count === 0) {
    return "empty";
  }

  if (habit.goal.type === "multiple" && count < habit.goal.count) {
    return "partial";
  }

  return count > 1 ? "strong" : "complete";
}

function datesToColumns(dates: string[]) {
  const columns: string[][] = [];

  for (let index = 0; index < dates.length; index += 7) {
    columns.push(dates.slice(index, index + 7));
  }

  return columns;
}

export function DottedProgressChart({ habit, days = 84, dotSize = 10, layout = "weekly", tone = "default" }: Props) {
  const todayKey = toDateKey();
  const rawDates =
    layout === "monthly"
      ? monthRange(todayKey)
      : dateRange(days, todayKey);
  const firstDate = startOfWeek(rawDates[0]);
  const lastWeekStart = startOfWeek(rawDates[rawDates.length - 1]);
  const lastDate = addDays(lastWeekStart, 6);
  const gridDates = Array.from({ length: daysBetween(firstDate, lastDate) + 1 }, (_, index) => addDays(firstDate, index));
  const columns = datesToColumns(gridDates);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={[styles.scrollContent, tone === "hero" ? styles.heroScrollContent : null]}
    >
      <View style={[styles.weeklyWrap, tone === "hero" ? styles.heroWeeklyWrap : null]}>
        {columns.map((week, index) => (
          <View key={`${week[0]}-${index}`} style={styles.weekColumn}>
            {week.map((dateKey) => {
              const status = getDotStatus(habit, dateKey, todayKey);

              return (
                <Dot
                  key={dateKey}
                  status={status}
                  size={dotSize}
                  isInactive={status === "empty"}
                  tone={tone}
                />
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: {
    width: "100%"
  },
  scrollContent: {
    paddingRight: spacing.md
  },
  heroScrollContent: {
    flexGrow: 1,
    paddingRight: 0
  },
  weeklyWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5
  },
  heroWeeklyWrap: {
    width: "100%",
    justifyContent: "space-between",
    gap: 0
  },
  weekColumn: {
    gap: 5,
    paddingVertical: 2
  },
  dot: {
    borderWidth: 0
  }
});
