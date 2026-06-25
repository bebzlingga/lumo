import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { fontFamilies, habitColors, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { dayLabels, parseDateKey, toDateKey } from "@/lib/date";
import { Habit, HabitDraft, GoalType, RepeatSchedule, Weekday, habitCategories } from "@/types/habit";
import { HabitIcon } from "./HabitIcon";
import { IconName, isIconName } from "./Icon";
import {
  AppText,
  Button,
  Card,
  ChoiceChip,
  Field,
  FieldLabel,
  IconButton,
  LumoInput,
  Pill,
  Screen,
  Select
} from "./ui";

const DEFAULT_HABIT_ICON: IconName = "star";
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

const categoryOptions = habitCategories.map((category) => ({ label: category, value: category }));

const habitIconOptions: IconName[] = [
  "star",
  "sparkle",
  "drop",
  "milk",
  "activity",
  "weight",
  "health",
  "heart",
  "moon",
  "sun",
  "book",
  "note",
  "taskSquare",
  "timer",
  "headphone",
  "broom",
  "tree",
  "money",
  "brush",
  "coffee",
  "trophy"
];

function FormSection({ children }: { children: React.ReactNode }) {
  return <Card style={styles.formCard}>{children}</Card>;
}

function isValidDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  return toDateKey(parseDateKey(dateKey)) === dateKey;
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
  const selectedIconName = isIconName(draft.emoji) ? draft.emoji : DEFAULT_HABIT_ICON;
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
      Alert.alert("Start date needed", "Use the format YYYY-MM-DD, like 2026-06-25.");
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

      <FormSection>
        <Field>
          <FieldLabel>Habit name</FieldLabel>
          <LumoInput value={draft.name} onChangeText={(name) => setDraft((current) => ({ ...current, name }))} placeholder="Drink water" />
        </Field>

        <Field>
          <FieldLabel>Category</FieldLabel>
          <Select
            options={categoryOptions}
            value={draft.category}
            onChange={(category) => setDraft((current) => ({ ...current, category: category as HabitDraft["category"] }))}
            accessibilityLabel="Habit category"
          />
        </Field>

        <Field>
          <FieldLabel>Start date</FieldLabel>
          <LumoInput
            value={draft.createdAt}
            onChangeText={(createdAt) => setDraft((current) => ({ ...current, createdAt }))}
            placeholder={toDateKey()}
            keyboardType="numbers-and-punctuation"
          />
        </Field>

        <Field>
          <FieldLabel>Icon</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconChipRow}>
            {habitIconOptions.map((iconName) => {
              const isSelected = selectedIconName === iconName;

              return (
                <Pressable
                  key={iconName}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setDraft((current) => ({ ...current, emoji: iconName }))}
                  style={({ pressed }) => [
                    styles.iconChip,
                    {
                      backgroundColor: isSelected ? palette.surfaceStrong : palette.surface,
                      borderColor: isSelected ? palette.greenDark : palette.hairline,
                      borderWidth: 2,
                      opacity: pressed ? 0.75 : 1
                    }
                  ]}
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
          <FieldLabel>Color theme</FieldLabel>
          <View style={styles.swatchRow}>
            {habitColors.map((color) => (
              <Button
                key={color}
                label={draft.color === color ? "✓" : ""}
                onPress={() => setDraft((current) => ({ ...current, color }))}
                style={[styles.swatch, { backgroundColor: color, borderColor: draft.color === color ? palette.ink : "transparent" }]}
              />
            ))}
          </View>
        </Field>
      </FormSection>

      <FormSection>
        <Field>
          <FieldLabel>Frequency</FieldLabel>
          <Select
            options={repeatScheduleOptions}
            value={draft.repeatSchedule.type}
            onChange={(value) => setSchedule(value as RepeatSchedule["type"])}
            accessibilityLabel="Repeat schedule"
          />
        </Field>

        {draft.repeatSchedule.type === "specific" ? (
          <Field>
            <FieldLabel>Days</FieldLabel>
            <View style={styles.dayGrid}>
              {dayLabels.map((label, index) => (
                <ChoiceChip
                  key={label}
                  label={label}
                  selected={selectedDays.includes(index as Weekday)}
                  onPress={() => toggleSpecificDay(index as Weekday)}
                  className="min-h-[38px] min-w-[48px] items-center justify-center rounded-[22px] px-3"
                />
              ))}
            </View>
          </Field>
        ) : null}

        {draft.repeatSchedule.type === "interval" ? (
          <Field>
            <FieldLabel>Every how many days?</FieldLabel>
            <LumoInput value={customInterval} onChangeText={setCustomInterval} keyboardType="number-pad" />
          </Field>
        ) : null}

        <View style={[styles.sectionDivider, { backgroundColor: palette.hairline }]} />

        <Field>
          <FieldLabel>Target</FieldLabel>
          <View style={styles.pillGrid}>
            <Pill label="Once per day" selected={draft.goal.type === "once"} onPress={() => setGoal("once")} />
            <Pill label="Multiple times" selected={draft.goal.type === "multiple"} onPress={() => setGoal("multiple")} />
            <Pill label="Weekly target" selected={draft.goal.type === "weekly"} onPress={() => setGoal("weekly")} />
            <Pill label="Monthly target" selected={draft.goal.type === "monthly"} onPress={() => setGoal("monthly")} />
          </View>
        </Field>

        {draft.goal.type !== "once" ? (
          <Field>
            <FieldLabel>
              {draft.goal.type === "multiple" ? "Times per day" : draft.goal.type === "weekly" ? "Times per week" : "Times per month"}
            </FieldLabel>
            <LumoInput value={goalAmount} onChangeText={setGoalAmount} keyboardType="number-pad" />
          </Field>
        ) : null}
      </FormSection>

      <Button label={habit ? "Save changes" : "Create habit"} icon="checkCircle" shape="pill" onPress={save} style={styles.saveButton} />
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
    gap: spacing.lg
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
    gap: spacing.sm,
    paddingRight: spacing.lg
  },
  iconChip: {
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: radius.pill
  },
  iconGlyph: {
    alignItems: "center",
    justifyContent: "center",
    width: ICON_PICKER_BOX_SIZE,
    height: ICON_PICKER_BOX_SIZE
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  swatch: {
    width: 42,
    height: 42,
    minHeight: 42,
    minWidth: 42,
    borderRadius: radius.pill,
    paddingHorizontal: 0
  },
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  dayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  saveButton: {
    minHeight: 54
  }
});
