import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { WheelTimePicker } from "./WheelTimePicker";
import { defaultHabitColor, fontFamilies, habitColorPickerOptions, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { dayLabels, dayNames, parseDateKey, toDateKey } from "@/lib/date";
import { Habit, HabitDraft, GoalType, RepeatSchedule, Weekday, habitCategories } from "@/types/habit";
import { categoryIcons, categoryNamePlaceholders } from "./CategoryChips";
import { FloatingDropdown } from "./FloatingDropdown";
import { categoryIconOptions } from "./IconPicker";
import { HabitIcon } from "./HabitIcon";
import { Icon, IconName, isIconName } from "./Icon";
import {
  AppText,
  Button,
  Card,
  Field,
  FieldLabel,
  IconButton,
  LumoInput,
  Screen
} from "./ui";

const DEFAULT_HABIT_ICON: IconName = "sparkle";
const ICON_PICKER_BOX_SIZE = 24;
const ICON_PICKER_SIZE = 22;

function createDefaultDraft(): HabitDraft {
  return {
    name: "",
    category: "General",
    emoji: DEFAULT_HABIT_ICON,
    color: defaultHabitColor,
    createdAt: toDateKey(),
    reminderEnabled: false,
    reminderMode: "time",
    reminderTime: "09:00",
    reminderIntervalValue: 1,
    reminderIntervalUnit: "hours",
    repeatSchedule: { type: "daily" },
    goal: { type: "once" }
  };
}

// One merged "How often?" axis: day-bound schedules and any-day period
// targets are alternatives, so conflicting combos (e.g. "weekends only" +
// "20× a month") are inexpressible by construction. "Times per day" applies
// only to the day-bound choices.
export type HabitCadence = RepeatSchedule["type"] | "weekly" | "monthly";

const cadenceOptions: { label: string; value: HabitCadence }[] = [
  { label: "Every day", value: "daily" },
  { label: "Weekdays", value: "weekdays" },
  { label: "Weekends", value: "weekends" },
  { label: "Specific days", value: "specific" },
  { label: "Custom interval", value: "interval" },
  { label: "Times per week", value: "weekly" },
  { label: "Times per month", value: "monthly" }
];

function FormSection({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Card style={[styles.formCard, style]}>{children}</Card>;
}

function isValidDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  return toDateKey(parseDateKey(dateKey)) === dateKey;
}

// Progressive "MM / DD / YYYY" mask. Month is clamped to 01-12 and day to
// 01-31; a leading digit too large to start a 2-digit segment is auto-padded
// (e.g. month "2" -> "02 / ", day "4" -> "04 / ") and the " / " is appended as
// soon as a segment completes so the next digit lands in the right place.
function maskDateInput(value: string) {
  const digits = value.replace(/\D/g, "");
  let index = 0;

  let month = "";
  let monthDone = false;
  if (index < digits.length) {
    if (Number(digits[index]) >= 2) {
      month = `0${digits[index]}`;
      monthDone = true;
      index += 1;
    } else if (index + 1 < digits.length) {
      month = String(Math.min(12, Math.max(1, Number(digits.slice(index, index + 2))))).padStart(2, "0");
      monthDone = true;
      index += 2;
    } else {
      month = digits[index];
      index += 1;
    }
  }

  let day = "";
  let dayDone = false;
  if (monthDone && index < digits.length) {
    if (Number(digits[index]) >= 4) {
      day = `0${digits[index]}`;
      dayDone = true;
      index += 1;
    } else if (index + 1 < digits.length) {
      day = String(Math.min(31, Math.max(1, Number(digits.slice(index, index + 2))))).padStart(2, "0");
      dayDone = true;
      index += 2;
    } else {
      day = digits[index];
      index += 1;
    }
  }

  const year = dayDone ? digits.slice(index, index + 4) : "";

  let masked = month;
  if (monthDone) {
    masked += " / ";
  }
  masked += day;
  if (dayDone) {
    masked += " / ";
  }
  masked += year;

  return masked;
}

// "MM / DD / YYYY" -> "YYYY-MM-DD" date key (empty until 8 digits are present).
function maskedDateToKey(masked: string) {
  const digits = masked.replace(/\D/g, "");

  if (digits.length !== 8) {
    return "";
  }

  return `${digits.slice(4, 8)}-${digits.slice(0, 2)}-${digits.slice(2, 4)}`;
}

// "YYYY-MM-DD" date key -> "MM / DD / YYYY" display string.
function dateKeyToMasked(dateKey: string) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return "";
  }

  const [, year, month, day] = match;
  return `${month} / ${day} / ${year}`;
}

// Backspace over an auto-inserted separator should also drop the digit before
// it, so deletion isn't stuck on the " / " glue.
function digitsAfterEdit(text: string, previousMasked: string) {
  let nextDigits = text.replace(/\D/g, "");

  if (text.length < previousMasked.length && nextDigits === previousMasked.replace(/\D/g, "")) {
    nextDigits = nextDigits.slice(0, -1);
  }

  return nextDigits;
}

// Reminder times are stored as 24-hour "HH:MM" (what the scheduler parses), but
// shown to the user in 12-hour time with AM/PM via the picker.
function normalizeTime(value?: string) {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return "09:00";
  }

  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// "HH:MM" (24h) -> "9:00 AM" display string.
function formatTime12(value: string) {
  const [hour, minute] = normalizeTime(value).split(":").map(Number);
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function draftFromHabit(habit?: Habit): HabitDraft {
  if (!habit) {
    return createDefaultDraft();
  }

  return {
    name: habit.name,
    category: habit.category ?? "General",
    emoji: isIconName(habit.emoji) ? habit.emoji : DEFAULT_HABIT_ICON,
    color: habit.color,
    createdAt: habit.createdAt,
    reminderEnabled: habit.reminderEnabled,
    reminderMode: habit.reminderMode ?? "time",
    reminderTime: habit.reminderTime,
    reminderTimes: habit.reminderTimes,
    reminderIntervalValue: habit.reminderIntervalValue ?? 1,
    reminderIntervalUnit: habit.reminderIntervalUnit ?? "hours",
    repeatSchedule: habit.repeatSchedule,
    goal: habit.goal
  };
}

export function HabitForm({
  habit,
  title,
  onSave
}: {
  habit?: Habit;
  title: string;
  onSave: (draft: HabitDraft) => Promise<void>;
}) {
  const router = useRouter();
  const { palette, isDark } = useLumo();
  // greenDark is a *dark* green in light mode but a *light* green in dark mode,
  // so a filled button needs the medium green in dark to keep white text legible.
  const buttonFill = isDark ? palette.green : palette.greenDark;
  const buttonShadow = isDark ? "transparent" : palette.greenDark;
  const [draft, setDraft] = useState<HabitDraft>(() => draftFromHabit(habit));
  const [customInterval, setCustomInterval] = useState(() => {
    return draft.repeatSchedule.type === "interval" ? String(draft.repeatSchedule.every) : "2";
  });
  const [goalAmount, setGoalAmount] = useState(() => {
    if (draft.goal.type === "multiple") {
      return String(draft.goal.count);
    }
    if (draft.goal.type === "weekly" || draft.goal.type === "monthly") {
      return String(draft.goal.target);
    }
    // "once" reads as 1 time per day in the merged control.
    return "1";
  });
  const [startDateInput, setStartDateInput] = useState(() => dateKeyToMasked(draft.createdAt));
  // Reminder times kept as 24h "HH:MM". A single time covers once/weekly/monthly
  // goals; the array holds one time per check-in for "multiple times per day".
  const [singleTime, setSingleTime] = useState(() => normalizeTime(draft.reminderTime));
  const [multiTimes, setMultiTimes] = useState<string[]>(() => {
    const times = draft.reminderTimes?.length ? draft.reminderTimes : [draft.reminderTime];
    return times.map(normalizeTime);
  });
  // Which time field has the picker open: "single", a slot index, or null.
  const [pickerTarget, setPickerTarget] = useState<null | "single" | number>(null);
  const selectedIconName = isIconName(draft.emoji) ? draft.emoji : DEFAULT_HABIT_ICON;
  // Resting bottom-border for inputs and selects — a tinted green that reads
  // more clearly than the faint cream hairline.
  const fieldBorderColor = alpha(palette.greenDark, "33");

  const multipleCount = draft.goal.type === "multiple" ? Math.max(2, Number(goalAmount) || 2) : 1;

  // Keep one reminder-time slot per daily check-in when the goal is "multiple".
  useEffect(() => {
    if (draft.goal.type !== "multiple") {
      return;
    }

    setMultiTimes((current) => {
      if (current.length === multipleCount) {
        return current;
      }
      const next = current.slice(0, multipleCount);
      while (next.length < multipleCount) {
        next.push("09:00");
      }
      return next;
    });
  }, [multipleCount, draft.goal.type]);

  function handleStartDateChange(text: string) {
    const masked = maskDateInput(digitsAfterEdit(text, startDateInput));
    setStartDateInput(masked);
    setDraft((current) => ({ ...current, createdAt: maskedDateToKey(masked) }));
  }

  const pickerValue =
    pickerTarget === "single"
      ? singleTime
      : typeof pickerTarget === "number"
        ? multiTimes[pickerTarget] ?? "09:00"
        : "09:00";

  function applyPickedTime(time: string) {
    if (pickerTarget === "single") {
      setSingleTime(time);
    } else if (typeof pickerTarget === "number") {
      const index = pickerTarget;
      setMultiTimes((current) => {
        const next = [...current];
        next[index] = time;
        return next;
      });
    }
  }

  const selectedDays = useMemo(() => {
    return draft.repeatSchedule.type === "specific" ? draft.repeatSchedule.days : ([1, 2, 3, 4, 5] as Weekday[]);
  }, [draft.repeatSchedule]);

  // Period (weekly/monthly) targets replace the day schedule ("any day").
  const periodGoal = draft.goal.type === "weekly" || draft.goal.type === "monthly";
  const cadence: HabitCadence = draft.goal.type === "weekly" || draft.goal.type === "monthly" ? draft.goal.type : draft.repeatSchedule.type;

  function dayBoundGoal(): GoalType {
    const count = Math.max(1, Number(goalAmount) || 1);

    return count > 1 ? { type: "multiple", count } : { type: "once" };
  }

  function setCadence(value: HabitCadence) {
    if (value === "weekly" || value === "monthly") {
      // Period targets can happen any day, so the schedule resets to daily.
      setDraft((current) => ({
        ...current,
        repeatSchedule: { type: "daily" },
        goal: { type: value, target: Math.max(1, Number(goalAmount) || 1) }
      }));
      return;
    }

    const repeatSchedule: RepeatSchedule =
      value === "specific"
        ? { type: "specific", days: selectedDays }
        : value === "interval"
          ? { type: "interval", every: Math.max(1, Number(customInterval) || 1) }
          : { type: value };

    setDraft((current) => ({ ...current, repeatSchedule, goal: dayBoundGoal() }));
  }

  // Amount edits update the goal live (the reminder section keys off it).
  function setAmount(text: string) {
    setGoalAmount(text);
    const amount = Math.max(1, Number(text) || 1);

    setDraft((current) => {
      if (current.goal.type === "weekly" || current.goal.type === "monthly") {
        return { ...current, goal: { type: current.goal.type, target: amount } };
      }

      return { ...current, goal: amount > 1 ? { type: "multiple", count: amount } : { type: "once" } };
    });
  }

  function toggleSpecificDay(day: Weekday) {
    const next = selectedDays.includes(day) ? selectedDays.filter((item) => item !== day) : [...selectedDays, day].sort();
    setDraft((current) => ({ ...current, repeatSchedule: { type: "specific", days: next.length ? next : [day] } }));
  }

  async function save() {
    const cleanName = draft.name.trim();

    if (!cleanName) {
      Alert.alert("Habit name needed", "Give this habit a small, clear name first.");
      return;
    }

    const cleanStartDate = draft.createdAt.trim();

    if (!isValidDateKey(cleanStartDate)) {
      Alert.alert("Start date needed", "Enter a real date as MM / DD / YYYY, like 06 / 25 / 2026.");
      return;
    }

    if (cleanStartDate > toDateKey()) {
      Alert.alert("Start date in the future", "Pick today or an earlier date.");
      return;
    }

    const wantsMultiple = draft.goal.type === "multiple";
    const reminderTimeValues = multiTimes.slice(0, multipleCount).map(normalizeTime);

    const cleanDraft: HabitDraft = {
      ...draft,
      name: cleanName,
      createdAt: cleanStartDate,
      emoji: selectedIconName,
      reminderMode: "time",
      reminderIntervalValue: Math.max(1, Number(draft.reminderIntervalValue) || 1),
      reminderTime: wantsMultiple ? reminderTimeValues[0] ?? "09:00" : normalizeTime(singleTime),
      reminderTimes: wantsMultiple ? reminderTimeValues : undefined,
      // Period targets always save as any-day (also normalizes habits created
      // before the frequency lock existed).
      repeatSchedule: periodGoal
        ? { type: "daily" }
        : draft.repeatSchedule.type === "interval"
          ? { type: "interval", every: Math.max(1, Number(customInterval) || 1) }
          : draft.repeatSchedule,
      goal:
        draft.goal.type === "multiple"
          ? { type: "multiple", count: Math.max(2, Number(goalAmount) || 2) }
          : draft.goal.type === "weekly" || draft.goal.type === "monthly"
            ? { type: draft.goal.type, target: Math.max(1, Number(goalAmount) || 1) }
            : draft.goal
    };

    await onSave(cleanDraft);
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.topBar}>
        <View>
          <AppText variant="displaySmall" style={styles.title}>
            {title}
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
            Small, gentle, repeatable.
          </AppText>
        </View>
        <IconButton
          icon="close"
          label="Close"
          iconWeight="bulk"
          iconSize={26}
          buttonSize={48}
          onPress={() => router.back()}
          style={{ backgroundColor: palette.surface, borderColor: palette.hairline }}
        />
      </View>

      <FormSection>
        <ScrollView
          horizontal
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryRow}
        >
          {habitCategories.map((category) => {
              const isSelected = draft.category === category;

              return (
                <Pressable
                  key={category}
                  accessibilityRole="button"
                  accessibilityLabel={category}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() =>
                    setDraft((current) => {
                      const options = categoryIconOptions[category];
                      const emoji = options.includes(current.emoji as IconName) ? current.emoji : options[0];
                      return { ...current, category, emoji };
                    })
                  }
                  style={[styles.categoryChip, { backgroundColor: isSelected ? alpha(palette.greenDark, "1F") : "transparent" }]}
                >
                  <View style={styles.categoryGlyph}>
                    <Icon
                      name={categoryIcons[category]}
                      size={22}
                      color={isSelected ? palette.greenDark : palette.subtle}
                      weight="bulk"
                    />
                  </View>
                  <AppText
                    variant="caption"
                    color={isSelected ? palette.greenDark : palette.subtle}
                    numberOfLines={1}
                    style={styles.categoryLabel}
                  >
                    {category}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

        <Field>
          <FieldLabel>Habit name</FieldLabel>
          <LumoInput
            value={draft.name}
            onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
            placeholder={categoryNamePlaceholders[draft.category]}
            style={[styles.flatInput, { borderColor: fieldBorderColor }]}
          />
        </Field>

        <Field>
          <FieldLabel>Start date</FieldLabel>
          <LumoInput
            value={startDateInput}
            onChangeText={handleStartDateChange}
            placeholder="MM / DD / YYYY"
            keyboardType="number-pad"
            maxLength={14}
            style={[styles.flatInput, { borderColor: fieldBorderColor }]}
          />
        </Field>

        <Field>
          <FieldLabel>Icon</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconChipRow}>
            {categoryIconOptions[draft.category].map((iconName) => {
              const isSelected = selectedIconName === iconName;

              return (
                <Pressable
                  key={iconName}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setDraft((current) => ({ ...current, emoji: iconName }))}
                  style={[styles.iconChip, { backgroundColor: isSelected ? alpha(palette.greenDark, "1F") : "transparent" }]}
                >
                  <View style={styles.iconGlyph}>
                    <HabitIcon value={iconName} color={palette.greenDark} size={ICON_PICKER_SIZE} />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>

        <Field>
          <FieldLabel>Color</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorChipRow}>
            {habitColorPickerOptions.map((option) => {
              const isSelected = draft.color === option.color;

              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setDraft((current) => ({ ...current, color: option.color }))}
                  style={[styles.colorChipOuter, { borderColor: isSelected ? option.accent : "transparent" }]}
                >
                  <View style={[styles.colorChip, { backgroundColor: option.color, borderColor: palette.hairline }]}>
                    {isSelected ? <Icon name="checkCircle" size={16} color={option.onColor} weight="bulk" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>

      </FormSection>

      <FormSection>
        <View style={styles.cardHeader}>
          <AppText variant="titleSmall" color={palette.ink}>
            Frequency & goal
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle}>
            Pick the days this habit repeats — or a weekly/monthly target you can hit on any day.
          </AppText>
        </View>
        <View style={[styles.sectionDivider, { backgroundColor: palette.hairline }]} />

        <Field>
          <FieldLabel>How often?</FieldLabel>
          <FloatingDropdown
            variant="input"
            options={cadenceOptions}
            value={cadence}
            onChange={setCadence}
            accessibilityLabel="How often"
            borderColor={fieldBorderColor}
          />
          {periodGoal ? (
            <AppText variant="caption" color={palette.subtle}>
              Hit your target on any days that suit you.
            </AppText>
          ) : null}
        </Field>

        {draft.repeatSchedule.type === "specific" ? (
          <Field>
            <FieldLabel>Days</FieldLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayList}>
              {dayNames.map((name, index) => {
                const checked = selectedDays.includes(index as Weekday);

                return (
                  <Pressable
                    key={name}
                    accessibilityRole="checkbox"
                    accessibilityLabel={name}
                    accessibilityState={{ checked }}
                    onPress={() => toggleSpecificDay(index as Weekday)}
                    style={styles.dayItem}
                  >
                    {checked ? (
                      <Icon name="checkCircle" size={20} color={palette.greenDark} weight="bulk" />
                    ) : (
                      <View style={[styles.dayCircle, { borderColor: palette.hairline, backgroundColor: palette.surface }]} />
                    )}
                    <AppText
                      variant="body"
                      color={checked ? palette.ink : palette.subtle}
                      style={[styles.dayName, checked ? styles.dayNameSelected : null]}
                    >
                      {dayLabels[index]}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Field>
        ) : null}

        {draft.repeatSchedule.type === "interval" ? (
          <Field>
            <FieldLabel>Every how many days?</FieldLabel>
            <LumoInput
              value={customInterval}
              onChangeText={setCustomInterval}
              keyboardType="number-pad"
              style={[styles.flatInput, { borderColor: fieldBorderColor }]}
            />
          </Field>
        ) : null}

        <Field>
          <FieldLabel>
            {draft.goal.type === "weekly" ? "Times per week" : draft.goal.type === "monthly" ? "Times per month" : "Times per day"}
          </FieldLabel>
          <LumoInput
            value={goalAmount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            style={[styles.flatInput, { borderColor: fieldBorderColor }]}
          />
        </Field>
      </FormSection>

      <FormSection>
        <View style={styles.reminderHeaderRow}>
          <View style={[styles.cardHeader, styles.reminderHeaderText]}>
            <AppText variant="titleSmall" color={palette.ink}>
              Reminder
            </AppText>
            <AppText variant="bodySmall" color={palette.subtle} numberOfLines={1}>
              {draft.goal.type === "multiple" ? "A nudge at each check-in time." : "A gentle nudge at your set time."}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Enable reminders"
            accessibilityState={{ checked: draft.reminderEnabled }}
            onPress={() => setDraft((current) => ({ ...current, reminderEnabled: !current.reminderEnabled }))}
            hitSlop={8}
            style={({ pressed }) => [styles.switchButton, { opacity: pressed ? 0.76 : 1 }]}
          >
            <View
              style={[
                styles.switchTrack,
                {
                  backgroundColor: draft.reminderEnabled ? palette.green : palette.chartTrack,
                  borderColor: draft.reminderEnabled ? palette.green : palette.chartTrack
                }
              ]}
            >
              <View style={[styles.switchThumb, { transform: [{ translateX: draft.reminderEnabled ? 16 : 0 }] }]} />
            </View>
          </Pressable>
        </View>
        {draft.reminderEnabled ? <View style={[styles.sectionDivider, { backgroundColor: palette.hairline }]} /> : null}

        {draft.reminderEnabled ? (
          draft.goal.type === "multiple" ? (
            multiTimes.slice(0, multipleCount).map((time, index) => (
              <Field key={`reminder-${index}`}>
                <FieldLabel>{`Reminder ${index + 1}`}</FieldLabel>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Reminder ${index + 1} time, ${formatTime12(time)}`}
                  onPress={() => setPickerTarget(index)}
                  style={[styles.timeField, { borderColor: fieldBorderColor }]}
                >
                  <AppText variant="body" color={palette.ink} style={styles.timeFieldText}>
                    {formatTime12(time)}
                  </AppText>
                  <Icon name="clock" size={20} color={palette.subtle} weight="bulk" />
                </Pressable>
              </Field>
            ))
          ) : (
            <Field>
              <FieldLabel>Reminder time</FieldLabel>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reminder time, ${formatTime12(singleTime)}`}
                onPress={() => setPickerTarget("single")}
                style={[styles.timeField, { borderColor: fieldBorderColor }]}
              >
                <AppText variant="body" color={palette.ink} style={styles.timeFieldText}>
                  {formatTime12(singleTime)}
                </AppText>
                <Icon name="clock" size={20} color={palette.subtle} weight="bulk" />
              </Pressable>
            </Field>
          )
        ) : null}
      </FormSection>

      {pickerTarget !== null ? (
        <Modal transparent animationType="none" visible onRequestClose={() => setPickerTarget(null)}>
          <View style={styles.pickerBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerTarget(null)} />
            <View style={[styles.pickerSheet, { backgroundColor: palette.card }]}>
              <WheelTimePicker value={pickerValue} onChange={applyPickedTime} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                onPress={() => setPickerTarget(null)}
                style={({ pressed }) => [styles.pickerDoneButton, { backgroundColor: buttonFill, opacity: pressed ? 0.85 : 1 }]}
              >
                <AppText variant="button" color={palette.white} style={styles.pickerDoneLabel}>
                  Done
                </AppText>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}

      <View
        style={{
          marginTop: spacing.xs,
          borderRadius: 18,
          backgroundColor: buttonFill,
          shadowColor: buttonShadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.28,
          shadowRadius: 16,
          elevation: 8
        }}
      >
        <Button
          label={habit ? "Save changes" : "Create habit"}
          variant="primary"
          onPress={save}
          className="min-h-[48px] w-full flex-row items-center justify-center rounded-[18px] px-4 py-2"
          style={{ backgroundColor: buttonFill, borderRadius: 18, borderWidth: 0 }}
          labelStyle={{ fontSize: 17 }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl
  },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  title: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 34,
    lineHeight: 40
  },
  subtitle: {
    marginTop: spacing.xxs
  },
  formCard: {
    gap: spacing.md,
    padding: spacing.xl
  },
  cardHeader: {
    gap: spacing.xxs
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth
  },
  inlineFields: {
    flexDirection: "row",
    gap: spacing.md
  },
  iconField: {
    gap: spacing.xs
  },
  iconChipRow: {
    alignItems: "center",
    paddingRight: spacing.lg
  },
  categoryScroll: {
    marginHorizontal: -spacing.xl,
    marginBottom: spacing.sm
  },
  categoryRow: {
    alignItems: "flex-start",
    paddingHorizontal: spacing.xl
  },
  categoryChip: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    width: 80,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.xl
  },
  categoryGlyph: {
    alignItems: "center",
    justifyContent: "center",
    width: ICON_PICKER_BOX_SIZE,
    height: ICON_PICKER_BOX_SIZE
  },
  categoryLabel: {
    textAlign: "center"
  },
  iconChip: {
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: radius.xl
  },
  iconGlyph: {
    alignItems: "center",
    justifyContent: "center",
    width: ICON_PICKER_BOX_SIZE,
    height: ICON_PICKER_BOX_SIZE
  },
  colorChipRow: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.lg
  },
  colorChipOuter: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  colorChip: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
  dayList: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingRight: spacing.lg
  },
  dayItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xxs
  },
  dayCircle: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 1.5
  },
  dayName: {
    fontSize: 16
  },
  dayNameSelected: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  flatInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderRadius: 0,
    minHeight: 0,
    paddingHorizontal: 0,
    paddingTop: spacing.xxs,
    paddingBottom: spacing.sm,
    fontFamily: fontFamilies.lexendBold
  },
  reminderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  reminderHeaderText: {
    flex: 1
  },
  switchButton: {
    width: 38,
    height: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  switchTrack: {
    width: 38,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
    justifyContent: "center",
    alignItems: "flex-start",
    overflow: "hidden"
  },
  switchThumb: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
    shadowColor: "#141413",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 2,
    elevation: 2
  },
  timeField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderBottomWidth: 1,
    paddingTop: spacing.xxs,
    paddingBottom: spacing.sm
  },
  timeFieldText: {
    fontFamily: fontFamilies.lexendBold
  },
  pickerBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    backgroundColor: "rgba(0, 0, 0, 0.35)"
  },
  pickerSheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 40,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl
  },
  pickerDoneButton: {
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  pickerDoneLabel: {
    fontSize: 17
  }
});
