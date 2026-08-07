import { router } from "expo-router";
import React from "react";
import { type DimensionValue, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native"
import { fontFamilies, habitAccent, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { addDays, dateRange, dayLabels, daysBetween, parseDateKey, toDateKey } from "@/lib/date";
import { isDoneOnDate, isScheduledOnDate, totalCompletions } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { HabitIcon } from "./HabitIcon";
import { Icon } from "./Icon";
import { AppText } from "./ui";
import { Pressable } from "@/components/Pressable"

const weekdayFullLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const weekdayHeatOrder = [1, 2, 3, 4, 5, 6, 0] as const;

function activeHabits(habits: Habit[]) {
  return habits.filter((habit) => habit.status === "active");
}

/**
 * The empty part of a bar. Kept as a wash rather than a solid: `chartTrack` at
 * full strength is the warm sand, which reads as its own filled bar next to a
 * short one, and in dark mode it sits too close to the card colour to see at
 * all. Both modes get a tint that says "this is the space the bar could fill"
 * without competing with the bar itself.
 *
 * Exported so the group page's bars sit on the same ground: an empty track is
 * the same object wherever it appears, and it had drifted to a second reading
 * over there.
 */
export function chartTrackColor(palette: ReturnType<typeof useLumo>["palette"], isDark: boolean) {
  return isDark ? alpha(palette.greenDark, "14") : alpha(palette.chartTrack, "30");
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

/**
 * The two charts that used to sit under Insights' "Overall" tab, now embedded
 * in Profile. The headline figures that tab also carried are deliberately not
 * here — Profile's own stat strip and Journey row already state every one of
 * them, and repeating a number one card later reads as two different numbers.
 */
export function OverallStatsView({ habits }: { habits: Habit[] }) {
  const currentHabits = React.useMemo(() => activeHabits(habits), [habits]);

  if (!currentHabits.length) {
    return <EmptyStats message="Overall progress will build as you track habits." />;
  }

  return (
    <View style={styles.viewStack}>
      <OverallHabitBarChart habits={currentHabits} />
      <OverallMissPatternCard habits={currentHabits} />
    </View>
  );
}

function OverallHabitBarChart({ habits }: { habits: Habit[] }) {
  const { palette, isDark } = useLumo();
  const { width } = useWindowDimensions();
  const trackColor = chartTrackColor(palette, isDark);
  const chartHabits = React.useMemo(
    () =>
      [...habits]
        .sort((a, b) => totalCompletions(b) - totalCompletions(a))
        .map((habit) => ({ habit, total: totalCompletions(habit) })),
    [habits]
  );
  const maxTotal = Math.max(1, ...chartHabits.map((item) => item.total));
  // Both insets have to be the real ones or the slots are sized against a
  // width the card never has: the screen gutter is layout.screenPaddingX (32),
  // not spacing.lg, and the card's own padding is spacing.ml.
  const cardHorizontalPadding = spacing.ml * 2;
  const screenHorizontalPadding = layout.screenPaddingX * 2;
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

      {/* Reads as a footnote to the chart rather than a preamble you have to
          get through before seeing it. */}
      <AppText variant="caption" color={palette.muted} style={styles.cardBlurb}>
        Each bar is one habit's total check-ins, tallest first — a short bar next to a tall one means that habit gets logged less often, not that it
        matters less.
      </AppText>

      <View style={[styles.overallHabitList, { borderTopColor: palette.hairline }]}>
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
  const trackColor = chartTrackColor(palette, isDark);
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

      <AppText variant="caption" color={palette.muted} style={styles.cardBlurb}>
        {insight}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
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
  addButton: {
    minHeight: 42,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs
  },
  // The habit detail screen's card geometry: 18pt radius, spacing.ml inset.
  // 11/15, matching the week card's footnote directly above these on Profile.
  // At `caption`'s own 12 the blurb ran four or five lines and carried more
  // weight than the chart it is a footnote to.
  cardBlurb: {
    fontFamily: fontFamilies.lexend,
    fontSize: 11,
    lineHeight: 15
  },
  habitTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  habitDivider: {
    height: StyleSheet.hairlineWidth
  },
  // Tighter vertically than horizontally: the charts inside already carry their
  // own plot height, so a full spacing.ml top and bottom read as dead air.
  overallBarCard: {
    borderRadius: radius.card,
    // Was 20 across and 12 down, which read as a card pinched at the top and
    // bottom next to the evenly-padded ones above it.
    paddingHorizontal: spacing.ml,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.075,
    shadowRadius: 18,
    elevation: 3
  },
  missPatternCard: {
    paddingBottom: spacing.md
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
    gap: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xxs
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
