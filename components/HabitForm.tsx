import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { fontFamilies, habitColors, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { dayLabels, dayNames, parseDateKey, toDateKey } from "@/lib/date";
import { Habit, HabitDraft, GoalType, RepeatSchedule, Weekday, habitCategories } from "@/types/habit";
import { FloatingDropdown } from "./FloatingDropdown";
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
    color: habitColors[0],
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

const repeatScheduleOptions: { label: string; value: RepeatSchedule["type"] }[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekdays", value: "weekdays" },
  { label: "Weekends", value: "weekends" },
  { label: "Specific days", value: "specific" },
  { label: "Custom interval", value: "interval" }
];

const categoryIcons: Record<(typeof habitCategories)[number], IconName> = {
  General: "sparkle",
  Health: "heart",
  Fitness: "weight",
  Mind: "smiley",
  Focus: "eye",
  Learning: "book",
  Social: "emojiHappy",
  Home: "home",
  Money: "money",
  Creative: "brush"
};

const categoryNamePlaceholders: Record<(typeof habitCategories)[number], string> = {
  General: "Drink water",
  Health: "Take vitamins",
  Fitness: "Go for a run",
  Mind: "Meditate 10 minutes",
  Focus: "Deep work session",
  Learning: "Read 10 pages",
  Social: "Call a friend",
  Home: "Tidy up the space",
  Money: "Track today's spending",
  Creative: "Sketch for 15 minutes"
};

const goalOptions: { label: string; value: GoalType["type"] }[] = [
  { label: "Once per day", value: "once" },
  { label: "Multiple times", value: "multiple" },
  { label: "Weekly target", value: "weekly" },
  { label: "Monthly target", value: "monthly" }
];

const categoryIconOptions: Record<(typeof habitCategories)[number], IconName[]> = {
  General: ["sparkle", "star", "taskSquare", "note", "calendar", "checkCircle", "grid", "elementPlus"],
  Health: ["health", "heart", "drop", "milk", "glass", "moon", "sun", "weight"],
  Fitness: ["weight", "activity", "fire", "zap", "trophy", "heart", "timer", "award"],
  Mind: ["moon", "smiley", "emojiHappy", "sun", "sparkle", "tree", "heart", "star"],
  Focus: ["eye", "timer", "clock", "taskSquare", "chart", "zap", "note", "book"],
  Learning: ["book", "note", "edit", "award", "headphone", "chart", "taskSquare", "star"],
  Social: ["emojiHappy", "heart", "smiley", "coffee", "headphone", "facebook", "star", "sparkle"],
  Home: ["home", "broom", "tree", "coffee", "milk", "drop", "note", "sun"],
  Money: ["money", "chart", "trophy", "award", "star", "calendar", "taskSquare", "archive"],
  Creative: ["brush", "edit", "sparkle", "note", "headphone", "star", "drop", "coffee"]
};

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
  const { palette } = useLumo();
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
    return "3";
  });
  const [startDateInput, setStartDateInput] = useState(() => dateKeyToMasked(draft.createdAt));
  const selectedIconName = isIconName(draft.emoji) ? draft.emoji : DEFAULT_HABIT_ICON;
  // Resting bottom-border for inputs and selects — a tinted green that reads
  // more clearly than the faint cream hairline.
  const fieldBorderColor = alpha(palette.greenDark, "33");

  function handleStartDateChange(text: string) {
    let nextDigits = text.replace(/\D/g, "");

    // If a backspace only removed an auto-inserted " / " (the digits are
    // unchanged but the string got shorter), drop the last digit too so
    // deletion isn't stuck on the separator.
    if (text.length < startDateInput.length && nextDigits === startDateInput.replace(/\D/g, "")) {
      nextDigits = nextDigits.slice(0, -1);
    }

    const masked = maskDateInput(nextDigits);
    setStartDateInput(masked);
    setDraft((current) => ({ ...current, createdAt: maskedDateToKey(masked) }));
  }
  const selectedDays = useMemo(() => {
    return draft.repeatSchedule.type === "specific" ? draft.repeatSchedule.days : ([1, 2, 3, 4, 5] as Weekday[]);
  }, [draft.repeatSchedule]);

  function setSchedule(type: RepeatSchedule["type"]) {
    if (type === "specific") {
      setDraft((current) => ({ ...current, repeatSchedule: { type: "specific", days: selectedDays } }));
    } else if (type === "interval") {
      setDraft((current) => ({
        ...current,
        repeatSchedule: { type: "interval", every: Math.max(1, Number(customInterval) || 1) }
      }));
    } else {
      setDraft((current) => ({ ...current, repeatSchedule: { type } as RepeatSchedule }));
    }
  }

  function setGoal(type: GoalType["type"]) {
    if (type === "multiple") {
      setDraft((current) => ({ ...current, goal: { type, count: Math.max(2, Number(goalAmount) || 2) } }));
    } else if (type === "weekly" || type === "monthly") {
      setDraft((current) => ({ ...current, goal: { type, target: Math.max(1, Number(goalAmount) || 1) } }));
    } else {
      setDraft((current) => ({ ...current, goal: { type } }));
    }
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

    const cleanDraft: HabitDraft = {
      ...draft,
      name: cleanName,
      createdAt: cleanStartDate,
      emoji: selectedIconName,
      reminderIntervalValue: Math.max(1, Number(draft.reminderIntervalValue) || 1),
      reminderTime: draft.reminderTime.match(/^\d{1,2}:\d{2}$/) ? draft.reminderTime : "09:00",
      repeatSchedule:
        draft.repeatSchedule.type === "interval"
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

      <FormSection style={styles.categoryCard}>
        <ScrollView
          horizontal
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
      </FormSection>

      <FormSection>
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

      </FormSection>

      <FormSection>
        <View style={styles.cardHeader}>
          <AppText variant="titleSmall" color={palette.ink}>
            Frequency & goal
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle}>
            Choose how often this habit repeats and how many check-ins count as done.
          </AppText>
        </View>
        <View style={[styles.sectionDivider, { backgroundColor: palette.hairline }]} />

        <Field>
          <FieldLabel>Frequency</FieldLabel>
          <FloatingDropdown
            variant="input"
            options={repeatScheduleOptions}
            value={draft.repeatSchedule.type}
            onChange={setSchedule}
            accessibilityLabel="Repeat schedule"
            borderColor={fieldBorderColor}
          />
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
          <FieldLabel>Target</FieldLabel>
          <FloatingDropdown
            variant="input"
            options={goalOptions}
            value={draft.goal.type}
            onChange={setGoal}
            accessibilityLabel="Habit target"
            borderColor={fieldBorderColor}
          />
        </Field>

        {draft.goal.type !== "once" ? (
          <Field>
            <FieldLabel>
              {draft.goal.type === "multiple" ? "Times per day" : draft.goal.type === "weekly" ? "Times per week" : "Times per month"}
            </FieldLabel>
            <LumoInput
              value={goalAmount}
              onChangeText={setGoalAmount}
              keyboardType="number-pad"
              style={[styles.flatInput, { borderColor: fieldBorderColor }]}
            />
          </Field>
        ) : null}
      </FormSection>

      <View
        style={{
          marginTop: spacing.xs,
          borderRadius: 18,
          backgroundColor: palette.greenDark,
          shadowColor: palette.greenDark,
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
          style={{ backgroundColor: palette.greenDark, borderRadius: 18, borderWidth: 0 }}
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
  categoryCard: {
    paddingVertical: spacing.md + 4
  },
  categoryScroll: {
    marginHorizontal: -spacing.xl
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
  }
});
