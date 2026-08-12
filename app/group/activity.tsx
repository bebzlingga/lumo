import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { FloatingDropdown } from "@/components/FloatingDropdown";
import { FormSection } from "@/components/HabitForm";
import { HabitIcon } from "@/components/HabitIcon";
import { Icon, type IconName } from "@/components/Icon";
import { categoryIconOptions } from "@/components/IconPicker";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Field, FieldLabel, LumoInput, Screen } from "@/components/ui";
import { CTA_FILL, defaultHabitColor, fontFamilies, habitAccent, habitColorPickerOptions, layout, radius, spacing, tileRadius } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha, readableOn } from "@/lib/color";
import { dayLabels, dayNames } from "@/lib/date";
import type { GroupHabit } from "@/lib/friends";
import { commitActivity, endActivityEdit, readActivitySession } from "@/lib/groupActivityBridge";
import type { GoalType, RepeatSchedule, Weekday } from "@/types/habit";

// All picker icons in one row (activities have no category).
const activityIconOptions: IconName[] = [...new Set(Object.values(categoryIconOptions).flat())];

// One merged "How often?" axis, same as the habit form: day-bound schedules and
// any-day period targets are alternatives, so conflicting combos are
// inexpressible. "Times per day" applies only to the day-bound choices.
type ActivityCadence = RepeatSchedule["type"] | "weekly" | "monthly";

const cadenceOptions: { label: string; value: ActivityCadence }[] = [
  { label: "Every day", value: "daily" },
  { label: "Weekdays", value: "weekdays" },
  { label: "Weekends", value: "weekends" },
  { label: "Specific days", value: "specific" },
  { label: "Custom interval", value: "interval" },
  { label: "Times per week", value: "weekly" },
  { label: "Times per month", value: "monthly" }
];

/**
 * One group activity, on its own screen.
 *
 * It was a modal on the group form, which could not hold it: six fields, three
 * horizontal pickers and a keyboard grew past the screen, taking the save
 * button with it. A screen is also what the equivalent personal habit gets
 * (`habit/new`), so the two now match.
 *
 * The activity it edits belongs to a group that has not been saved yet, so it
 * arrives and leaves through `groupActivityBridge` rather than the database.
 */
export default function GroupActivityScreen() {
  const router = useRouter();
  const { palette, isDark } = useLumo();
  // Read once: the session is cleared on unmount, and re-reading after that
  // would blank the form mid-edit.
  const session = React.useRef(readActivitySession()).current;
  const editing = session?.draft ?? null;

  const [name, setName] = React.useState(editing?.name ?? "");
  const [icon, setIcon] = React.useState<IconName>(editing?.icon ?? "sparkle");
  const [color, setColor] = React.useState(editing?.color ?? defaultHabitColor);
  const [cadence, setCadence] = React.useState<ActivityCadence>(() => {
    if (!editing) {
      return "daily";
    }

    return editing.goal.type === "weekly" || editing.goal.type === "monthly" ? editing.goal.type : editing.repeatSchedule.type;
  });
  const [specificDays, setSpecificDays] = React.useState<Weekday[]>(
    editing?.repeatSchedule.type === "specific" ? editing.repeatSchedule.days : [1, 2, 3, 4, 5]
  );
  const [intervalDays, setIntervalDays] = React.useState(
    editing?.repeatSchedule.type === "interval" ? String(editing.repeatSchedule.every) : "2"
  );
  const [goalAmount, setGoalAmount] = React.useState(() => {
    if (editing?.goal.type === "multiple") {
      return String(editing.goal.count);
    }
    if (editing?.goal.type === "weekly" || editing?.goal.type === "monthly") {
      return String(editing.goal.target);
    }

    return "1";
  });
  const [savePressed, setSavePressed] = React.useState(false);

  // Period (weekly/monthly) targets replace the day schedule ("any day").
  const periodGoal = cadence === "weekly" || cadence === "monthly";
  const canSave = Boolean(name.trim());
  /**
   * Every icon in the picker is drawn in the ACTIVITY'S OWN colour, so choosing
   * a colour recolours the whole row and you can see the pairing before
   * committing to it — the habit form does the same.
   *
   * Two values from one colour: the accent raw for the selection bubble, where
   * it is a 12% wash, and `readableOn` for the glyph, which keeps a pale swatch
   * legible against the card rather than washing out.
   */
  const colorAccent = habitAccent(color, isDark) ?? palette.greenDark;
  const iconTint = readableOn(colorAccent, palette.card);

  // Cleared on the way out however the screen is left — back gesture included —
  // so a handler from a form the user has since abandoned is never held.
  React.useEffect(() => endActivityEdit, []);

  function toggleSpecificDay(day: Weekday) {
    setSpecificDays((current) => {
      const next = current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort();

      return next.length ? next : [day];
    });
  }

  function save() {
    const cleaned = name.trim();

    if (!cleaned) {
      return;
    }

    if (session?.taken.some((taken) => taken.toLowerCase() === cleaned.toLowerCase())) {
      Alert.alert("Already added", `${cleaned} is already in this group.`);
      return;
    }

    // Same shapes the habit form builds (components/HabitForm.tsx save()).
    const amount = Math.max(1, Number(goalAmount) || 1);
    const repeatSchedule: RepeatSchedule =
      cadence === "weekly" || cadence === "monthly"
        ? { type: "daily" }
        : cadence === "specific"
          ? { type: "specific", days: specificDays }
          : cadence === "interval"
            ? { type: "interval", every: Math.max(1, Number(intervalDays) || 1) }
            : { type: cadence };
    const goal: GoalType =
      cadence === "weekly" || cadence === "monthly"
        ? { type: cadence, target: amount }
        : amount > 1
          ? { type: "multiple", count: amount }
          : { type: "once" };
    const activity: GroupHabit = {
      id: editing?.id ?? `act-${Date.now().toString(36)}`,
      name: cleaned,
      icon,
      color,
      repeatSchedule,
      goal
    };

    commitActivity(activity);
    router.back();
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader
        title={editing ? "Edit Activity" : "New Activity"}
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
      />

      <FormSection
        heading="Activity"
        hint="What the group does together. It lives only in this group — nobody's personal habits change."
        style={styles.firstSection}
      >
        <Field>
          <FieldLabel>Name</FieldLabel>
          <LumoInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Weekend run"
            autoCapitalize="sentences"
            autoFocus={!editing}
            returnKeyType="done"
            style={[styles.formInput, { backgroundColor: palette.card }]}
          />
        </Field>

        <Field>
          <FieldLabel>Icon</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.iconChipRow}>
            {activityIconOptions.map((iconName) => {
              const isSelected = icon === iconName;

              return (
                <Pressable
                  key={iconName}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setIcon(iconName)}
                  style={[styles.iconChip, { backgroundColor: isSelected ? alpha(colorAccent, "1F") : "transparent" }]}
                >
                  <HabitIcon value={iconName} color={iconTint} size={22} />
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>

        <Field>
          <FieldLabel>Color</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.colorChipRow}>
            {habitColorPickerOptions.map((option) => {
              const isSelected = color === option.color;

              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setColor(option.color)}
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

      <FormSection heading="How often?">
        <Field>
          <FloatingDropdown
            variant="input"
            options={cadenceOptions}
            value={cadence}
            onChange={setCadence}
            accessibilityLabel="How often"
            borderColor="transparent"
          />
          {periodGoal ? (
            <AppText variant="caption" color={palette.subtle}>
              Hit the target on any days that suit the group.
            </AppText>
          ) : null}
        </Field>

        {cadence === "specific" ? (
          <Field>
            <FieldLabel>Days</FieldLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayList}>
              {dayNames.map((dayName, index) => {
                const checked = specificDays.includes(index as Weekday);

                return (
                  <Pressable
                    key={dayName}
                    accessibilityRole="checkbox"
                    accessibilityLabel={dayName}
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

        {cadence === "interval" ? (
          <Field>
            <FieldLabel>Every how many days?</FieldLabel>
            <LumoInput
              value={intervalDays}
              onChangeText={setIntervalDays}
              keyboardType="number-pad"
              style={[styles.formInput, { backgroundColor: palette.card }]}
            />
          </Field>
        ) : null}

        <Field>
          <FieldLabel>{cadence === "weekly" ? "Times per week" : cadence === "monthly" ? "Times per month" : "Times per day"}</FieldLabel>
          <LumoInput
            value={goalAmount}
            onChangeText={setGoalAmount}
            keyboardType="number-pad"
            style={[styles.formInput, { backgroundColor: palette.card }]}
          />
        </Field>
      </FormSection>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={editing ? "Save this activity" : "Add this activity"}
        disabled={!canSave}
        onPress={save}
        onPressIn={() => setSavePressed(true)}
        onPressOut={() => setSavePressed(false)}
        style={[styles.cta, { backgroundColor: CTA_FILL, opacity: !canSave ? 0.45 : savePressed ? 0.85 : 1 }]}
      >
        <AppText variant="button" color={palette.white} style={styles.ctaLabel}>
          {editing ? "Save Activity" : "Add Activity"}
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // No row gap: `FormSection` already carries the space between sections, and
  // adding one here stacked on top of it — sections sat 36 apart on this screen
  // against 20 on the habit form.
  content: {
    paddingBottom: spacing.xxl
  },
  // `FormSection` sets sections apart from each other; the first has only the
  // header bar above it, so its margin would just be dead air.
  firstSection: {
    marginTop: 0
  },
  formInput: {
    borderWidth: 1,
    borderRadius: radius.button,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamilies.lexendSemiBold
  },
  // The picker rows run edge to edge; the content inset puts the first chip
  // back in line with the rest of the page.
  bleed: {
    marginHorizontal: -layout.screenPaddingX
  },
  iconChipRow: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: layout.screenPaddingX
  },
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
    paddingHorizontal: layout.screenPaddingX
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
    paddingRight: spacing.md
  },
  // The mark and the day sit on one line — stacked, each day was a two-row
  // column and seven of them read as a grid rather than a list of days.
  dayItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
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
  // Weight as well as colour: on a row of seven, colour alone is a weak enough
  // signal that the picked days do not stand out at a glance.
  dayNameSelected: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  // spacing.hero, matching the habit form's save button — the CTA sits further
  // from the last field than sections sit from each other.
  cta: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: layout.screenPaddingX,
    marginTop: spacing.xl
  },
  ctaLabel: {
    fontSize: 16,
    lineHeight: 21
  }
});
