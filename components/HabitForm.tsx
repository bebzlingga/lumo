import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from "react-native"
import { WheelTimePicker } from "./WheelTimePicker";
import { ctaFill as ctaFillFor, defaultHabitColor, fontFamilies, habitAccent, habitColorPickerOptions, layout, radius, spacing, tileRadius } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha, readableOn } from "@/lib/color";
import { dayLabels, dayNames, parseDateKey, toDateKey } from "@/lib/date";
import { Habit, HabitDraft, GoalType, RepeatSchedule, Weekday, habitCategories } from "@/types/habit";
import { categoryIcons, categoryNamePlaceholders, categorySuggestions } from "./CategoryChips";
import { FloatingDropdown } from "./FloatingDropdown";
import { categoryIconOptions } from "./IconPicker";
import { HabitIcon } from "./HabitIcon";
import { Icon, IconName, isIconName } from "./Icon";
import { AppText, Field, FieldLabel, fieldShadow, LumoInput, Screen } from "./ui";
import { Toggle } from "./controls";
import { Pressable } from "@/components/Pressable"

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
    reminderEnabled: true,
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

/**
 * A form section. Deliberately NOT a card — onboarding groups fields with a
 * heading and whitespace rather than nesting surfaces, and the form follows it.
 *
 * Exported so the group form uses this rather than its own near-copy: two forms
 * that look alike but are built differently drift apart on the first change to
 * either.
 */
export function FormSection({
  heading,
  hint,
  trailing,
  children,
  style
}: {
  heading?: string;
  hint?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useLumo();

  return (
    <View style={[styles.formSection, style]}>
      {heading ? (
        <View style={[styles.sectionHeader, { borderBottomColor: palette.hairline }]}>
          <View style={styles.sectionHeaderText}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.sectionHeading}>
              {heading}
            </AppText>
            {hint ? (
              <AppText variant="bodySmall" color={palette.subtle}>
                {hint}
              </AppText>
            ) : null}
          </View>
          {trailing}
        </View>
      ) : null}
      {children}
    </View>
  );
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
    goal: habit.goal,
    // Always present, even when unset — `updateHabit` merges the draft over the
    // stored habit, so an absent key would leave a cleared measurement in place.
    measurement: habit.measurement
  };
}

export function HabitForm({
  habit,
  title,
  subtitle,
  backLabel = "Habits",
  onSave
}: {
  habit?: Habit;
  title: string;
  /** Lead copy under the title. Falls back to a category-aware suggestion. */
  subtitle?: string;
  /** Name of the screen this form was opened from — shown beside the back arrow. */
  backLabel?: string;
  onSave: (draft: HabitDraft) => Promise<void>;
}) {
  const router = useRouter();
  const { palette, isDark } = useLumo();
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
  // Fields show no resting edge; only the active/open state draws one.
  const fieldBorderColor = "transparent";
  // Accent follows the selected colour swatch, so every cue in the form
  // previews what the habit will actually look like. greenDark is the fallback
  // for legacy habits with no colour theme — it is a *dark* green in light mode
  // but a *light* green in dark mode, so the filled button uses the medium
  // green in dark to keep white text legible.
  // The selected colour's card-safe accent. Used raw for the icon's selection
  // bubble, where it is a 12% wash and legibility is not at stake.
  const draftColorAccent = habitAccent(draft.color, isDark) ?? palette.greenDark;
  // Habit icons preview the selected colour. Darkened only as far as needed to
  // stay legible — the ambers and corals sit under 3:1 on the card surface at
  // full strength.
  const draftAccent = readableOn(draftColorAccent, palette.card);
  // The CTA deliberately does NOT follow the habit's colour: 12 of the 17
  // picker accents cannot carry a white label at 4.5:1, so tinting it per habit
  // would leave the primary button unreadable for most choices. `CTA_FILL` is
  // the app-wide answer.
  const ctaFill = ctaFillFor(isDark);
  const saveLabel = habit ? "Save changes" : "Create habit";

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
      {/* Outlined back circle, title centred, matching the journal editor and
          the habit screens. The right slot is an empty box of the same width so
          the title centres on the row rather than on the space left over. */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${backLabel}`}
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.topBarButton, { borderColor: palette.hairline, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="arrowLeft" size={20} color={palette.ink} weight="bold" />
        </Pressable>
        <View style={styles.topBarCopy}>
          <AppText color={palette.ink} numberOfLines={1} style={styles.topBarTitle}>
            {title}
          </AppText>
        </View>
        <View style={styles.topBarSpacer} />
      </View>

      <View style={styles.titleBlock}>
        <AppText variant="body" color={palette.subtle} style={styles.subtitle}>
          {subtitle ?? `Start small enough to manage on a bad day — ${categorySuggestions[draft.category]}. You can always grow it later.`}
        </AppText>
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
                  // Same treatment as the icon row below: a tinted bubble when
                  // selected, nothing at rest. Tinted from the theme green
                  // rather than the habit's colour, because the glyph and label
                  // inside are green too — a category is not colour-coded.
                  style={[
                    styles.categoryChip,
                    { backgroundColor: isSelected ? alpha(palette.greenDark, "1F") : "transparent" }
                  ]}
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
            style={[styles.flatInput, { backgroundColor: palette.card }]}
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
            style={[styles.flatInput, { backgroundColor: palette.card }]}
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
                  // Selection is a tinted bubble in the habit's OWN colour —
                  // no border, no resting fill. It was a bordered card tile,
                  // which put a box round every icon and made the row read as
                  // eight surfaces rather than eight glyphs.
                  style={[styles.iconChip, { backgroundColor: isSelected ? alpha(draftColorAccent, "1F") : "transparent" }]}
                >
                  <HabitIcon value={iconName} color={draftAccent} size={ICON_PICKER_SIZE} />
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
                  {/* No tick inside the swatch — the ring around it already
                      says which is chosen, and a glyph on top obscured the one
                      colour the control exists to show you. */}
                  <View style={[styles.colorChip, { backgroundColor: option.color, borderColor: palette.hairline }]} />
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>

      </FormSection>

      <FormSection
        heading="Frequency & goal"
        hint="Pick the days this habit repeats — or a weekly/monthly target you can hit on any day."
      >

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
              style={[styles.flatInput, { backgroundColor: palette.card }]}
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
            style={[styles.flatInput, { backgroundColor: palette.card }]}
          />
        </Field>

      </FormSection>

      <FormSection
        heading="Reminder"
        hint={draft.goal.type === "multiple" ? "A nudge at each check-in time." : "A gentle nudge at your set time."}
        trailing={
          <Toggle
            value={draft.reminderEnabled}
            onValueChange={(next) => setDraft((current) => ({ ...current, reminderEnabled: next }))}
            accessibilityLabel="Enable reminders"
          />
        }
      >

        {draft.reminderEnabled ? (
          draft.goal.type === "multiple" ? (
            multiTimes.slice(0, multipleCount).map((time, index) => (
              <Field key={`reminder-${index}`}>
                <FieldLabel>{`Reminder ${index + 1}`}</FieldLabel>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Reminder ${index + 1} time, ${formatTime12(time)}`}
                  onPress={() => setPickerTarget(index)}
                  style={[styles.timeField, { borderColor: fieldBorderColor, backgroundColor: palette.card, shadowColor: palette.shadow }]}
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
                style={[styles.timeField, { borderColor: fieldBorderColor, backgroundColor: palette.card, shadowColor: palette.shadow }]}
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
                style={({ pressed }) => [styles.pickerDoneButton, { backgroundColor: ctaFill, opacity: pressed ? 0.88 : 1 }]}
              >
                <AppText variant="button" color={palette.onGreen} style={styles.pickerDoneLabel}>
                  Done
                </AppText>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={saveLabel}
        onPress={save}
        style={({ pressed }) => [styles.cta, { backgroundColor: ctaFill, opacity: pressed ? 0.88 : 1 }]}
      >
        <AppText variant="button" color={palette.onGreen}>
          {saveLabel}
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    // Onboarding pads its screens by spacing.xl — the form follows it.
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing.xxl
  },
  // Onboarding's CtaButton geometry.
  cta: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    minHeight: 54,
    paddingHorizontal: layout.screenPaddingX,
    marginTop: spacing.xl
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  topBarButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  topBarSpacer: {
    width: 38,
    height: 38
  },
  topBarCopy: {
    flex: 1,
    alignItems: "center"
  },
  topBarTitle: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 19,
    lineHeight: 25
  },
  titleBlock: {
    gap: spacing.xs,
    // Screen gap (20) + the first section's marginTop (20) reads too loose
    // under the header; pull it back without touching section rhythm.
    marginBottom: -spacing.sm
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 340
  },
  /**
   * The form rhythm, and the only place it is set — every form in the app
   * (this one and the group activity screen) inherits it from here:
   *
   *   label → control      8   `Field`'s own gap
   *   field → field       16   this gap
   *   section → section   24   this margin
   *   last field → CTA    32   `cta`'s margin
   *
   * One 8pt step per level, so a field reads as one unit and a section as one
   * group without the form spreading out. The steps were 20/32/40, which
   * separated things clearly but left the sections floating apart; halving the
   * step keeps the hierarchy legible and pulls the form back together.
   *
   * Screens must NOT add a row gap of their own on top of this; two sources for
   * the same gap is how the forms drifted to 20 and 36 apart.
   */
  formSection: {
    gap: spacing.md,
    marginTop: spacing.lg
  },
  // The section's own 20pt gap already follows this, so the header adds only
  // the room its rule needs. It was paddingBottom 12 plus marginBottom 4 on top
  // of that gap — 36pt between a heading and the field it introduces.
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.xs
  },
  sectionHeaderText: {
    flex: 1,
    gap: spacing.xxs
  },
  sectionHeading: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 16,
    lineHeight: 22
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
    gap: spacing.xxs,
    paddingVertical: spacing.xs,
    paddingRight: spacing.xl
  },
  // No marginBottom of its own: the row already carries 8pt of padding under
  // the cards, and the next section brings its own 24pt on top. All three
  // stacked to 44pt of nothing under the category picker.
  categoryScroll: {
    marginHorizontal: -layout.screenPaddingX
  },
  categoryRow: {
    alignItems: "flex-start",
    gap: spacing.xxs,
    paddingVertical: spacing.xs,
    paddingHorizontal: layout.screenPaddingX
  },
  // No border and no resting fill — selection is the tinted bubble alone.
  categoryChip: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    width: 84,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.card
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
  // A card per icon — bordered tile on the card surface, matching the
  // selection rows in onboarding.
  // Selection changes the border only, never the surface — and the border is
  // always present at 2pt so selecting doesn't shift the row by 2pt.
  // No border and no resting fill — selection is the tinted bubble alone.
  // Rounded, not a full circle: a pill-radius bubble behind a round glyph read
  // as a second ring around it.
  iconChip: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: tileRadius(44)
  },
  colorChipRow: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.xl
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
    alignItems: "center",
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
  // Onboarding's field treatment: a boxed, warm 2pt border on the card
  // surface — not a borderless underline.
  flatInput: {
    borderWidth: 1,
    borderRadius: radius.button,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamilies.lexendSemiBold
  },
  // Same box as an input, so the reminder row reads as a field.
  timeField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.button,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    ...fieldShadow
  },
  timeFieldText: {
    fontFamily: fontFamilies.lexendSemiBold
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
    borderRadius: radius.dialog,
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing.xl
  },
  pickerDoneButton: {
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  pickerDoneLabel: {
    fontSize: 17
  }
});
