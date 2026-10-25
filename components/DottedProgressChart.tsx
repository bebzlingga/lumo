import type { ScrollViewInstance } from "react-native";
import React, { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { addDays, dateRange, daysBetween, monthRange, startOfWeek, startOfWeekMonday, toDateKey } from "@/lib/date";
import { completionCount, isScheduledOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";

type Props = {
  habit: Habit;
  days?: number;
  dotSize?: number;
  layout?: "weekly" | "monthly";
  tone?: "default" | "hero";
  /** Dots per column. 7 keeps the week-aligned grid; other values chunk the
   * raw day range directly, with today as the very last dot. */
  rows?: number;
  /** Align week columns Monday–Sunday instead of the default Sunday start. */
  weekStartsOnMonday?: boolean;
  /** Habit color theme accent. When set, filled dots use it instead of the
   * app theme's green (ignored by the hero tone, which stays white). */
  accentColor?: string;
};


function Dot({
  status,
  size,
  isInactive,
  isTodayPending,
  tone,
  accentColor
}: {
  status: "empty" | "partial" | "complete" | "strong";
  size: number;
  isInactive: boolean;
  isTodayPending: boolean;
  tone: NonNullable<Props["tone"]>;
  accentColor?: string;
}) {
  const { palette, isDark } = useLumo();
  const scale = useSharedValue(status === "empty" ? 0.92 : 1);

  useEffect(() => {
    scale.value = withSpring(status === "empty" ? 0.92 : 1, { damping: 12, stiffness: 160 });
  }, [scale, status]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const fillColor = accentColor ?? palette.greenDark;
  const emptyColor = accentColor ? alpha(accentColor, "24") : alpha(palette.greenSoft, "3D");
  const backgroundColor = isTodayPending
    ? "transparent"
    : tone === "hero"
      ? status === "empty"
        ? `${palette.white}${isDark ? "33" : "44"}`
        : status === "partial"
          ? `${palette.white}99`
          : palette.white
      : status === "empty"
        ? emptyColor
        : status === "partial"
          ? alpha(fillColor, "66")
          : fillColor;

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
          opacity: isInactive && !isTodayPending ? 0.72 : 1
        },
        // Today-but-not-done reads as an outlined placeholder, not an alert.
        isTodayPending
          ? {
              borderWidth: 1.5,
              borderStyle: "dotted" as const,
              borderColor: tone === "hero" ? `${palette.white}CC` : alpha(fillColor, "AA")
            }
          : null
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

function datesToColumns(dates: string[], size = 7) {
  const columns: string[][] = [];

  for (let index = 0; index < dates.length; index += size) {
    columns.push(dates.slice(index, index + size));
  }

  return columns;
}

export function DottedProgressChart({
  habit,
  days = 84,
  dotSize = 10,
  layout = "weekly",
  tone = "default",
  rows = 7,
  weekStartsOnMonday = false,
  accentColor
}: Props) {
  const todayKey = toDateKey();
  const scrollRef = React.useRef<ScrollViewInstance>(null);
  const weekAligned = rows === 7;
  const rawDates =
    layout === "monthly"
      ? monthRange(todayKey)
      : dateRange(days, todayKey);
  let gridDates = rawDates;

  if (weekAligned) {
    // Align the start to a week boundary, but end at the last real day —
    // the current week's column grows one box per day instead of showing
    // empty placeholders for days that haven't happened yet.
    const alignStart = weekStartsOnMonday ? startOfWeekMonday : startOfWeek;
    const firstDate = alignStart(rawDates[0]);
    const lastDate = rawDates[rawDates.length - 1];
    gridDates = Array.from({ length: daysBetween(firstDate, lastDate) + 1 }, (_, index) => addDays(firstDate, index));
  }

  const columns = datesToColumns(gridDates, rows);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      style={styles.scroller}
      contentContainerStyle={[styles.scrollContent, tone === "hero" ? styles.heroScrollContent : null]}
    >
      <View style={styles.weeklyWrap}>
        {columns.map((week, index) => (
          <View key={`${week[0]}-${index}`} style={styles.weekColumn}>
            {week.map((dateKey) => {
              const status = getDotStatus(habit, dateKey, todayKey);
              const isTodayPending = dateKey === todayKey && status !== "complete" && status !== "strong";

              return (
                <Dot
                  key={dateKey}
                  status={status}
                  size={dotSize}
                  isInactive={status === "empty"}
                  isTodayPending={isTodayPending}
                  tone={tone}
                  accentColor={accentColor}
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
  // The hero card removes its own horizontal padding so the grid clips at the
  // card edges (a visual cue that it scrolls); the inset lives here instead.
  // Per-side values because the base style's paddingRight would otherwise win
  // over the paddingHorizontal shorthand.
  heroScrollContent: {
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg
  },
  weeklyWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5
  },
  weekColumn: {
    gap: 5,
    paddingVertical: 2
  },
  dot: {
    borderWidth: 0
  }
});
