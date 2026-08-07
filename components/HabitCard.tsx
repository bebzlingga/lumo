import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Animated as RNAnimated, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { fontFamilies, habitAccent, habitColorOption, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha, readableOn } from "@/lib/color";
import { toDateKey } from "@/lib/date";
import { cadenceLabel, completionCount, currentStreak, dailyTarget, isDoneOnDate, monthlyCompletionCount, weeklyCompletionCount } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { AppText, Button, Card } from "./ui";
import { DottedProgressChart } from "./DottedProgressChart";
import { FIRE_COLOR, FireIcon } from "./FireIcon";
import { HabitIcon } from "./HabitIcon";
import { HoldProgressRing } from "./HoldProgressRing";
import { Icon } from "./Icon";

/** A streak only reads as a streak once it holds — same rule as StreakBadge. */
const STREAK_MINIMUM = 3;

const UNDO_HOLD_DURATION_MS = 1500;
// Only reveal the progress ring after this much holding, so a quick tap never
// flashes it.
const HOLD_REVEAL_DELAY_MS = 500;

export function HabitCard({
  habit,
  compact = false,
  dateKey = toDateKey(),
  disabledActions = false
}: {
  habit: Habit;
  compact?: boolean;
  dateKey?: string;
  disabledActions?: boolean;
}) {
  const { palette, isDark, completeHabit, undoHabit } = useLumo();
  const router = useRouter();
  const todayDone = isDoneOnDate(habit, dateKey);
  const count = completionCount(habit, dateKey);
  const suppressActionUntil = React.useRef(0);
  const undoPromptOpen = React.useRef(false);
  const pulse = useSharedValue(1);
  const holdScale = useSharedValue(1);
  // Drives the hold-to-undo progress ring (0 idle -> 1 hold complete). Kept on
  // the RN Animated API because HoldProgressRing animates SVG stroke props.
  const holdProgress = React.useRef(new RNAnimated.Value(0)).current;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }]
  }));
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: holdScale.value }]
  }));

  const streak = React.useMemo(() => currentStreak(habit), [habit]);
  const target = dailyTarget(habit);
  const reminderLabel = !habit.reminderEnabled
    ? "No reminder"
    : habit.reminderMode === "interval"
      ? `Every ${habit.reminderIntervalValue} ${habit.reminderIntervalUnit === "hours" ? "hr" : "min"}`
      : habit.reminderTime;
  // What the habit asks of you, rather than how it is going — the streak now
  // lives in the trailing badge. Shared with the home screen's habit rows.
  const cadence = React.useMemo(() => cadenceLabel(habit), [habit]);

  const goalLabel = React.useMemo(
    () =>
      habit.goal.type === "weekly"
        ? `${weeklyCompletionCount(habit, dateKey)}/${habit.goal.target} this week`
        : habit.goal.type === "monthly"
          ? `${monthlyCompletionCount(habit, dateKey)}/${habit.goal.target} this month`
          : habit.goal.type === "multiple"
            ? `${count}/${target} this day`
            : todayDone
              ? "Done"
              : "Open",
    [habit, dateKey, count, target, todayDone]
  );
  // Habits with a color theme carry it through the card; legacy habits keep
  // the app theme's greens.
  const habitColor = habitColorOption(habit.color);
  // Onboarding's IconTile treatment: a soft tint carrying a saturated glyph,
  // rather than a solid fill with a knocked-out white one.
  const iconBackgroundColor = habitColor ? alpha(habitColor.color, "24") : palette.greenSoft;
  const iconColor = habitColor ? readableOn(habitColor.color, palette.card) : palette.greenDark;
  const accentColor = habitAccent(habit.color, isDark) ?? palette.greenDark;
  const canUndoCompletion = !disabledActions && habit.status === "active" && count > 0;

  function handleDone() {
    if (Date.now() < suppressActionUntil.current || disabledActions || habit.status !== "active") {
      return;
    }

    if (todayDone) {
      handleUndoCompletion();
      return;
    }

    pulse.value = withSequence(withSpring(0.94), withSpring(1));
    completeHabit(habit.id, dateKey);
  }

  function handleHoldStart() {
    if (!canUndoCompletion) {
      return;
    }

    holdScale.value = withTiming(1.035, {
      duration: UNDO_HOLD_DURATION_MS,
      easing: Easing.out(Easing.cubic)
    });
    // Keep the ring hidden for the reveal delay (so a quick tap doesn't flash
    // it), then fill over the remaining time so it's full when the long-press fires.
    holdProgress.stopAnimation();
    RNAnimated.timing(holdProgress, {
      toValue: 1,
      delay: HOLD_REVEAL_DELAY_MS,
      duration: UNDO_HOLD_DURATION_MS - HOLD_REVEAL_DELAY_MS,
      easing: (value) => value,
      useNativeDriver: false
    }).start();
  }

  function handleHoldEnd() {
    holdScale.value = withSpring(1, {
      damping: 14,
      stiffness: 150
    });
    holdProgress.stopAnimation();
    RNAnimated.timing(holdProgress, {
      toValue: 0,
      duration: 220,
      useNativeDriver: false
    }).start();
  }

  function handleOpenHabit() {
    if (Date.now() < suppressActionUntil.current) {
      return;
    }

    router.push(`/habit/${habit.id}`);
  }

  function handleUndoCompletion(trigger: "tap" | "longPress" = "tap") {
    if (!canUndoCompletion || undoPromptOpen.current) {
      return;
    }

    undoPromptOpen.current = true;
    suppressActionUntil.current = Date.now() + 1000;
    if (trigger === "longPress") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      handleHoldEnd();
    }
    Alert.alert(
      "Undo completion?",
      count > 1 ? `Remove one completion from ${habit.name}?` : `Move ${habit.name} out of Completed?`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            undoPromptOpen.current = false;
          }
        },
        {
          text: "Undo",
          style: "destructive",
          onPress: () => {
            undoPromptOpen.current = false;
            undoHabit(habit.id, dateKey);
          }
        }
      ],
      {
        onDismiss: () => {
          undoPromptOpen.current = false;
        }
      }
    );
  }

  return (
    <Pressable
      onPress={handleOpenHabit}
      {...(compact
        ? // The list is a browse surface: no completing, and so no hold-to-undo
          // either — otherwise you could remove a completion here but not add one.
          null
        : {
            onLongPress: () => handleUndoCompletion("longPress"),
            onPressIn: handleHoldStart,
            onPressOut: handleHoldEnd,
            delayLongPress: UNDO_HOLD_DURATION_MS
          })}
      accessibilityRole="button"
      accessibilityLabel={!compact && canUndoCompletion ? `${habit.name}. Long press to undo completion.` : habit.name}
    >
      <Animated.View style={cardAnimatedStyle}>
        <Card style={compact ? styles.compactCard : undefined}>
          <View style={styles.header}>
            <View style={[styles.iconBubble, { backgroundColor: iconBackgroundColor }]}>
              <HabitIcon value={habit.emoji} color={iconColor} size={21} />
              {!compact && canUndoCompletion ? (
                <HoldProgressRing progress={holdProgress} size={52} stroke={3} color={accentColor} trackColor={alpha(accentColor, "24")} />
              ) : null}
            </View>
            <View style={styles.titleBlock}>
              <View style={styles.titleRow}>
                <AppText variant="titleSmall" numberOfLines={1} style={[styles.titleText, compact ? styles.titleTextCompact : null]}>
                  {habit.name}
                </AppText>
                {habit.status === "paused" ? (
                  <View style={[styles.statusBadge, { backgroundColor: `${palette.chartPartial}26`, borderColor: `${palette.chartPartial}73` }]}>
                    <AppText variant="caption" color={palette.chartPartial} numberOfLines={1} style={styles.statusBadgeText}>
                      Paused
                    </AppText>
                  </View>
                ) : null}
              </View>
              {compact ? (
                <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.compactMeta}>
                  {habit.status === "archived" ? goalLabel : `${cadence} · ${reminderLabel}`}
                </AppText>
              ) : (
                <View style={styles.metaRow}>
                  <Icon name="clock" size={14} color={palette.muted} weight="bulk" />
                  <AppText variant="bodySmall" color={palette.muted}>
                    {reminderLabel}
                  </AppText>
                  {streak >= 3 ? (
                    <>
                      <View style={[styles.metaDot, { backgroundColor: palette.hairline }]} />
                      <FireIcon size={14} />
                      <AppText variant="bodySmall" color={palette.muted}>
                        {streak} day streak
                      </AppText>
                    </>
                  ) : null}
                </View>
              )}
            </View>
            {/* Streak, not a completion control — completing happens on Today
                and the habit's own screen, so the list stays a browse surface. */}
            {compact && streak >= STREAK_MINIMUM ? (
              <View style={styles.streakBadge} accessibilityLabel={`${streak} day streak`}>
                <FireIcon size={15} />
                <AppText variant="caption" color={readableOn(FIRE_COLOR, palette.card, 4.5)} style={styles.streakBadgeText}>
                  {streak}
                </AppText>
              </View>
            ) : null}
          </View>

          {!compact ? (
            <View style={styles.chartWrap}>
              <DottedProgressChart habit={habit} days={112} dotSize={10} accentColor={habitColor ? accentColor : undefined} />
            </View>
          ) : null}

          {!compact ? (
            <>
              <View style={styles.actionRow}>
                <View>
                  <AppText variant="caption" color={todayDone ? accentColor : palette.muted}>
                    {goalLabel}
                  </AppText>
                  {habit.status === "paused" ? (
                    <AppText variant="bodySmall" color={palette.muted}>
                      Paused
                    </AppText>
                  ) : null}
                </View>
                <Animated.View style={animatedStyle}>
                  <Button
                    label={todayDone ? "Done" : habit.goal.type === "multiple" ? "+1" : "Done"}
                    icon={todayDone ? "check" : "sparkle"}
                    onPress={handleDone}
                    onLongPress={() => handleUndoCompletion("longPress")}
                    onPressIn={handleHoldStart}
                    onPressOut={handleHoldEnd}
                    delayLongPress={UNDO_HOLD_DURATION_MS}
                    disabled={disabledActions || habit.status !== "active"}
                    style={[styles.doneButton, habitColor ? { backgroundColor: habitColor.accent, borderColor: habitColor.accent } : null]}
                  />
                </Animated.View>
              </View>

              {todayDone ? (
                <Pressable disabled={!canUndoCompletion} onPress={() => handleUndoCompletion()} style={styles.undo}>
                  <AppText variant="caption" color={accentColor}>
                    Undo completion
                  </AppText>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </Card>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Same geometry as an onboarding selection row.
  compactCard: {
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 66
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  // Soft tinted rounded square, matching onboarding's IconTile — not a solid
  // filled circle.
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center"
  },
  titleBlock: {
    flex: 1,
    gap: spacing.xxs
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  titleText: {
    flex: 1,
    minWidth: 0
  },
  // Matches the starter-pack rows — list titles sit at body size, not title.
  titleTextCompact: {
    fontSize: 14,
    lineHeight: 21
  },
  statusBadge: {
    minHeight: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs
  },
  statusBadgeText: {
    fontSize: 11,
    lineHeight: 14
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3
  },
  streakBadgeText: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  compactMeta: {
    fontSize: 12,
    lineHeight: 16
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: radius.pill
  },
  chartWrap: {
    marginTop: spacing.lg,
    // Escapes the Card's padding (spacing.lg), NOT the screen gutter.
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg
  },
  actionRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  doneButton: {
    minWidth: 96
  },
  undo: {
    marginTop: spacing.sm,
    alignSelf: "flex-start"
  }
});
