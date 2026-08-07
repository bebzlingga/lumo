import React from "react";
import { StyleSheet, View } from "react-native"
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { addDays, dayInitials, dayLabels, formatMonthYear, monthRange, parseDateKey, startOfMonth, toDateKey } from "@/lib/date";
import { completionCount, dailyTarget, isDoneOnDate, isScheduledOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { AppText } from "./ui";
import { Icon } from "./Icon";
import { Pressable } from "@/components/Pressable"

export type DayStatus = "completed" | "partial" | "missed" | "unscheduled" | "future";

/**
 * Status of a single day for one habit. Derived from the habit's own
 * completions — nothing is stored per-day beyond what `completions` already
 * holds, so this stays in sync with every other stat in the app.
 */
export function dayStatus(habit: Habit, dateKey: string, todayKey = toDateKey()): DayStatus {
  if (dateKey > todayKey) {
    return "future";
  }

  // Status is evaluated as if active, so pausing a habit doesn't erase history.
  if (!isScheduledOnDate({ ...habit, status: "active" }, dateKey)) {
    return "unscheduled";
  }

  if (isDoneOnDate(habit, dateKey)) {
    return "completed";
  }

  return completionCount(habit, dateKey) > 0 ? "partial" : "missed";
}

/** Colour for a status, from the active palette. Never colour-only — callers
 * pair this with a label or shape so status doesn't rely on hue alone. */
function statusColor(status: DayStatus, palette: ReturnType<typeof useLumo>["palette"], accent: string) {
  switch (status) {
    case "completed":
      return accent;
    case "partial":
      return palette.chartPartial;
    case "missed":
      return palette.danger;
    default:
      return "transparent";
  }
}

const STATUS_LABEL: Record<DayStatus, string> = {
  completed: "completed",
  partial: "partially done",
  missed: "missed",
  unscheduled: "not scheduled",
  future: "upcoming"
};

/**
 * Month grid showing each day's status, with month navigation and a legend.
 * Sunday-first, matching `lib/date`'s week helpers and the OS calendar.
 */
export function HabitCalendar({
  habit,
  accentColor,
  selectedDateKey,
  onSelectDate
}: {
  habit: Habit;
  accentColor: string;
  selectedDateKey?: string;
  onSelectDate?: (dateKey: string) => void;
}) {
  const { palette } = useLumo();
  const todayKey = toDateKey();
  const [anchorKey, setAnchorKey] = React.useState(() => startOfMonth(todayKey));

  const days = React.useMemo(() => monthRange(anchorKey), [anchorKey]);
  // Blank cells so the 1st lands under its weekday column.
  const leadingBlanks = React.useMemo(() => parseDateKey(days[0]).getDay(), [days]);
  // Don't let people page into months the habit didn't exist for, or the future.
  const canGoBack = startOfMonth(habit.createdAt) < anchorKey;
  const canGoForward = anchorKey < startOfMonth(todayKey);

  function shiftMonth(direction: -1 | 1) {
    const anchor = parseDateKey(anchorKey);
    setAnchorKey(startOfMonth(toDateKey(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 15, 12))));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: !canGoBack }}
          disabled={!canGoBack}
          onPress={() => shiftMonth(-1)}
          hitSlop={12}
          style={({ pressed }) => [styles.monthNav, { opacity: !canGoBack ? 0.3 : pressed ? 0.6 : 1 }]}
        >
          <Icon name="arrowLeft" size={18} color={palette.ink} weight="bold" />
        </Pressable>
        <AppText variant="titleSmall" color={palette.ink} style={styles.monthLabel}>
          {formatMonthYear(anchorKey)}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canGoForward }}
          disabled={!canGoForward}
          onPress={() => shiftMonth(1)}
          hitSlop={12}
          style={({ pressed }) => [styles.monthNav, { opacity: !canGoForward ? 0.3 : pressed ? 0.6 : 1 }]}
        >
          <Icon name="arrowRight" size={18} color={palette.ink} weight="bold" />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {dayLabels.map((label, index) => (
          <AppText key={index} variant="caption" color={palette.muted} style={styles.weekday}>
            {label}
          </AppText>
        ))}
      </View>

      <View style={styles.grid}>
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <View key={`blank-${index}`} style={styles.cell} />
        ))}
        {days.map((dateKey) => {
          const status = dayStatus(habit, dateKey, todayKey);
          const selected = dateKey === selectedDateKey;
          const isToday = dateKey === todayKey;
          const dotColor = statusColor(status, palette, accentColor);
          const dayNumber = parseDateKey(dateKey).getDate();

          return (
            <Pressable
              key={dateKey}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${dayNumber} ${formatMonthYear(anchorKey)}, ${STATUS_LABEL[status]}`}
              onPress={() => onSelectDate?.(dateKey)}
              style={styles.cell}
            >
              <View
                style={[
                  styles.dayBubble,
                  selected && { backgroundColor: accentColor },
                  !selected && isToday && { borderColor: accentColor, borderWidth: 1.5 }
                ]}
              >
                <AppText
                  variant="caption"
                  color={selected ? palette.white : status === "future" ? palette.muted : palette.ink}
                  style={styles.dayNumber}
                >
                  {dayNumber}
                </AppText>
              </View>
              <View style={[styles.dot, dotColor !== "transparent" && { backgroundColor: dotColor }]} />
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.legend, { borderTopColor: palette.hairline }]}>
        {(["completed", "partial", "missed"] as const).map((status) => (
          <View key={status} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: statusColor(status, palette, accentColor) }]} />
            <AppText variant="caption" color={palette.subtle}>
              {status === "completed" ? "Completed" : status === "partial" ? "Partial" : "Missed"}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Mon–Sun completion bars for the selected week, as a share of each day's
 * target. Bars are plain views rather than a chart dependency — the shape is
 * simple and this keeps the bundle lean.
 */
export function WeeklyBars({ habit, accentColor, weekDays }: { habit: Habit; accentColor: string; weekDays: string[] }) {
  const { palette } = useLumo();
  const todayKey = toDateKey();

  return (
    <View>
      <View style={styles.chartRow}>
        {weekDays.map((dateKey) => {
          const target = dailyTarget(habit);
          const done = Math.min(completionCount(habit, dateKey), target);
          const pct = target > 0 ? done / target : 0;
          const scheduled = isScheduledOnDate({ ...habit, status: "active" }, dateKey);
          const future = dateKey > todayKey;
          const label = parseDateKey(dateKey).getDate();

          return (
            <View
              key={dateKey}
              style={styles.chartColumn}
              accessibilityRole="text"
              accessibilityLabel={`${label}: ${Math.round(pct * 100)} percent complete`}
            >
              <View style={[styles.chartTrack, { backgroundColor: palette.chartTrack }]}>
                <View
                  style={[
                    styles.chartFill,
                    {
                      height: `${Math.max(pct * 100, pct > 0 ? 6 : 0)}%`,
                      backgroundColor: future || !scheduled ? alpha(accentColor, "40") : accentColor
                    }
                  ]}
                />
              </View>
              <AppText variant="caption" color={palette.muted} style={styles.chartLabel}>
                {dayLabels[parseDateKey(dateKey).getDay()]}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Seven weekday dots for the current week — a compact companion to the bars. */
export function WeekDots({ habit, accentColor, weekDays }: { habit: Habit; accentColor: string; weekDays: string[] }) {
  const { palette } = useLumo();
  const todayKey = toDateKey();

  return (
    <View style={styles.dotsRow}>
      {weekDays.map((dateKey) => {
        const status = dayStatus(habit, dateKey, todayKey);
        const done = status === "completed";
        const partial = status === "partial";
        const isToday = dateKey === todayKey;

        return (
          <View key={dateKey} style={styles.dotsColumn}>
            {/* Every state is a shade of the habit's own colour, so the row
                reads as one scale rather than switching hue when a day is
                missed. A completed day fills solid; anything less stays
                translucent, with no glyph inside. */}
            <View
              style={[
                styles.weekDot,
                {
                  backgroundColor: done ? accentColor : partial ? alpha(accentColor, "4D") : alpha(accentColor, "14"),
                  borderColor: done ? accentColor : alpha(accentColor, "33")
                }
              ]}
            />
            {/* Today is called out in the habit's own colour, so the end of
                the row is obvious without a separate marker. */}
            <AppText
              variant="caption"
              color={isToday ? accentColor : palette.muted}
              style={[styles.dotLabel, isToday && styles.dotLabelToday]}
            >
              {dayInitials[parseDateKey(dateKey).getDay()]}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  monthNav: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  monthLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  weekdayRow: {
    flexDirection: "row"
  },
  weekday: {
    flex: 1,
    textAlign: "center"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: "center",
    paddingVertical: 3,
    gap: 2
  },
  dayBubble: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "transparent",
    borderWidth: 1.5
  },
  dayNumber: {
    fontFamily: fontFamilies.lexendMedium
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "transparent"
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    height: 132
  },
  chartColumn: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs
  },
  chartTrack: {
    width: "100%",
    flex: 1,
    borderRadius: radius.sm,
    justifyContent: "flex-end",
    overflow: "hidden"
  },
  chartFill: {
    width: "100%",
    borderRadius: radius.sm
  },
  chartLabel: {
    fontFamily: fontFamilies.lexendMedium
  },
  dotLabel: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 10,
    lineHeight: 14
  },
  dotLabelToday: {
    fontFamily: fontFamilies.lexendBlack
  },
  dotsRow: {
    flexDirection: "row",
    gap: spacing.xs
  },
  dotsColumn: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xxs
  },
  weekDot: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  }
});
