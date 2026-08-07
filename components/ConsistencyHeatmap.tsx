import React from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { tintWithWhite } from "@/lib/color";
import { addDays, parseDateKey, startOfWeekMonday, toDateKey } from "@/lib/date";
import { completionCount, dailyTarget, isScheduledOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { AppText } from "./ui";

/**
 * How much of a day's target was met, as a 0-4 step.
 *
 * Step 0 is "scheduled but nothing logged" and step -1 is "not scheduled",
 * which are deliberately different: an unscheduled day is not a miss, so it
 * renders as an empty slot rather than the lightest shade of the accent.
 */
function intensityStep(habit: Habit, dateKey: string, todayKey: string) {
  if (dateKey > todayKey || !isScheduledOnDate({ ...habit, status: "active" }, dateKey)) {
    return -1;
  }

  const target = Math.max(1, dailyTarget(habit));
  const share = Math.min(completionCount(habit, dateKey), target) / target;

  if (share <= 0) {
    return 0;
  }

  // Four filled steps between "started" and "met the target".
  return Math.max(1, Math.min(4, Math.ceil(share * 4)));
}

/**
 * The whole scale is the habit's own colour, from a whisper to full strength.
 *
 * Opaque tints rather than alpha, so a cell reads the same wherever it sits
 * over the landscape backdrop. The steps climb monotonically — roughly 1.2-1.5x
 * contrast between neighbours — so intensity is legible without a legend.
 *
 * Index 0 is "not scheduled / future" and index 1 is "scheduled, nothing
 * logged"; the four above them are the filled steps.
 */
const STEP_TINT = [0.12, 0.28, 0.46, 0.64, 0.82, 1] as const;

function stepColor(step: number, accentColor: string) {
  // `step` is -1..4, and the ramp is indexed 0..5.
  return tintWithWhite(accentColor, STEP_TINT[step + 1]) ?? accentColor;
}

/**
 * GitHub-style contribution grid: one column per week, one row per weekday,
 * Monday at the top. Everything is derived from `habit.completions`, so it
 * stays in step with every other stat in the app.
 */
/** Half a year of weeks. Fewer columns means each cell can be larger. */
const WEEKS = 27;

/** Month labels across the top — one per month covered, current month last. */
const MONTHS = 6;

export function ConsistencyHeatmap({ habit, accentColor }: { habit: Habit; accentColor: string }) {
  const { palette } = useLumo();
  const todayKey = toDateKey();
  const [rowWidth, setRowWidth] = React.useState(0);
  const cell = rowWidth > 0 ? Math.floor((rowWidth - CELL_GAP * (WEEKS - 1)) / WEEKS) : 0;

  const columns = React.useMemo(() => {
    // Anchor on this week's Monday so the last column is the current week.
    const lastMonday = startOfWeekMonday(todayKey);
    const firstMonday = addDays(lastMonday, -(WEEKS - 1) * 7);

    return Array.from({ length: WEEKS }, (_, weekIndex) => {
      const weekStart = addDays(firstMonday, weekIndex * 7);

      return {
        weekStart,
        days: Array.from({ length: 7 }, (_, dayIndex) => addDays(weekStart, dayIndex))
      };
    });
  }, [todayKey]);

  /**
   * Evenly spread labels with the CURRENT month always last, so the axis reads
   * the same whatever today's date is. Labelling the first column of each
   * month instead would make the spacing jump around as weeks shift across
   * month boundaries.
   */
  const monthLabels = React.useMemo(() => {
    const now = parseDateKey(todayKey);

    return Array.from({ length: MONTHS }, (_, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - index), 1);

      return month.toLocaleDateString(undefined, { month: "short" });
    });
  }, [todayKey]);

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}>
        {monthLabels.map((label, index) => (
          <View key={index} style={styles.monthSlot}>
            <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.monthLabel}>
              {label}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.gridRow} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
        {columns.map((column) => (
          <View key={column.weekStart} style={styles.column}>
            {column.days.map((dateKey) => {
              const step = intensityStep(habit, dateKey, todayKey);

              return (
                <View
                  key={dateKey}
                  style={[
                    styles.cell,
                    {
                      width: cell,
                      height: cell,
                      backgroundColor: stepColor(step, accentColor)
                    }
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>

    </View>
  );
}

const CELL_GAP = 2;

const styles = StyleSheet.create({
  // The only gap here is the one under the month axis. At 4pt the labels sat on
  // top of the grid and read as part of the first row of cells.
  wrap: {
    gap: spacing.xs
  },
  monthRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  monthSlot: {
    flex: 1,
    alignItems: "center"
  },
  gridRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  column: {
    gap: CELL_GAP
  },
  monthLabel: {
    fontSize: 10,
    lineHeight: 14
  },
  cell: {
    borderRadius: 2
  },
});
