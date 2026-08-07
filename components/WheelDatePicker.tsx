import React from "react";
import { StyleSheet, View } from "react-native";
import { radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { parseDateKey, toDateKey } from "@/lib/date";
import { WHEEL_HEIGHT, WheelColumn } from "./WheelTimePicker";

/** How far back the year column reaches from the newest selectable year. */
const YEARS_BACK = 5;

const MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleDateString(undefined, { month: "short" })
);

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Month / day / year wheels, spun on the same columns as the time picker.
 *
 * `max` clamps the selection — the journal uses it to keep entries out of the
 * future, since a day you have not lived yet has nothing to record.
 */
export function WheelDatePicker({
  value,
  onChange,
  max = toDateKey()
}: {
  /** Selected day as a YYYY-MM-DD key. */
  value: string;
  onChange: (value: string) => void;
  /** Latest selectable day, also a date key. */
  max?: string;
}) {
  const { palette } = useLumo();
  const selected = parseDateKey(value);
  const maxDate = parseDateKey(max);

  const lastYear = maxDate.getFullYear();
  const years = Array.from({ length: YEARS_BACK + 1 }, (_, index) => String(lastYear - YEARS_BACK + index));
  const yearIndex = Math.max(0, years.indexOf(String(selected.getFullYear())));
  const monthIndex = selected.getMonth();

  // Days ahead of `max` are not offered at all, rather than offered and then
  // snapped back — a wheel that scrolls to a value it will not keep reads as
  // broken. Truncating from the end keeps every index aligned to its calendar
  // number, so month 0 is still January and day index 0 is still the 1st.
  const inMaxYear = selected.getFullYear() === lastYear;
  const months = inMaxYear ? MONTHS.slice(0, maxDate.getMonth() + 1) : MONTHS;
  const lastDay =
    inMaxYear && monthIndex === maxDate.getMonth() ? maxDate.getDate() : daysInMonth(selected.getFullYear(), monthIndex);
  const days = Array.from({ length: lastDay }, (_, index) => String(index + 1));
  const dayIndex = selected.getDate() - 1;

  /** Rebuilds the key from whichever wheel moved, then clamps it to `max`. */
  function emit(year: number, month: number, day: number) {
    // A short month can strand the day (Jan 31 → Feb): pull it back to the
    // month's last day rather than rolling into the next one.
    const next = new Date(year, month, Math.min(day, daysInMonth(year, month)));
    onChange(toDateKey(next > maxDate ? maxDate : next));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.columns}>
        <View pointerEvents="none" style={[styles.selectionBand, { backgroundColor: alpha(palette.greenDark, "12") }]} />
        <WheelColumn
          data={months}
          index={monthIndex}
          palette={palette}
          width={78}
          onChange={(next) => emit(selected.getFullYear(), next, selected.getDate())}
        />
        <WheelColumn
          data={days}
          index={dayIndex}
          palette={palette}
          onChange={(next) => emit(selected.getFullYear(), monthIndex, next + 1)}
        />
        <WheelColumn
          data={years}
          index={yearIndex}
          palette={palette}
          width={78}
          onChange={(next) => emit(Number(years[next]), monthIndex, selected.getDate())}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: WHEEL_HEIGHT,
    alignItems: "center",
    justifyContent: "center"
  },
  columns: {
    flexDirection: "row",
    height: WHEEL_HEIGHT,
    gap: spacing.xs
  },
  selectionBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: (WHEEL_HEIGHT - 40) / 2,
    height: 40,
    borderRadius: radius.lg
  }
});
