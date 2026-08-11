import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui";
import { spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { addDays, dayInitials, parseDateKey, startOfWeekMonday } from "@/lib/date";
import { formatDistance, summariesInRange } from "@/lib/move/movement";
import type { MovementSummary } from "@/lib/move/types";

/**
 * The last seven days as seven dots.
 *
 * Dots rather than bars because at zero a bar chart is seven invisible marks
 * and a lot of empty rail, which reads as broken. A dot is always there — it
 * just fills in. Size AND fill carry the amount, so the week survives being
 * read without colour.
 */
export function MoveWeekDots({
  summaries,
  todayKey,
  accent,
  /**
   * `rolling` ends on today and reaches back six days; `calendar` runs Monday
   * to Sunday.
   *
   * Rolling is the honest answer to "how have I been doing lately" — a calendar
   * week says almost nothing on a Monday morning, when six of its seven days
   * have not happened yet.
   */
  window = "calendar"
}: {
  summaries: MovementSummary[];
  todayKey: string;
  accent: string;
  window?: "calendar" | "rolling";
}) {
  const { palette } = useLumo();

  const start = window === "rolling" ? addDays(todayKey, -6) : startOfWeekMonday(todayKey);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const inWeek = summariesInRange(summaries, start, days[6]);
  const busiest = Math.max(1, ...inWeek.map((entry) => entry.distanceMeters));

  return (
    <View style={styles.row}>
      {days.map((day, index) => {
        const summary = inWeek.find((entry) => entry.date === day);
        const value = summary?.distanceMeters ?? 0;
        const future = day > todayKey;
        const size = 12 + Math.round(Math.min(1, value / busiest) * 10);

        return (
          <View key={day} style={styles.day}>
            <AppText variant="caption" color={day === todayKey ? palette.ink : palette.muted} numberOfLines={1}>
              {/* Read off the DATE rather than the position, since a rolling
                  window can start on any weekday. */}
              {dayInitials[parseDateKey(day).getDay()]}
            </AppText>
            {/* Fixed height so a bigger dot never shifts the labels either side. */}
            <View style={styles.dotWrap}>
              <View
                accessible
                accessibilityLabel={future ? `${day}, still to come` : `${day}, ${formatDistance(value)}`}
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: value > 0 ? accent : alpha(palette.hairline, "CC"),
                  borderWidth: day === todayKey ? 2 : 0,
                  borderColor: palette.greenDark
                }}
              />
            </View>
            <AppText variant="caption" color={value > 0 ? palette.body : palette.muted} numberOfLines={1}>
              {Math.round(value / 100) / 10}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center"
  },
  day: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xxs
  },
  dotWrap: {
    height: 24,
    alignItems: "center",
    justifyContent: "center"
  }
});
