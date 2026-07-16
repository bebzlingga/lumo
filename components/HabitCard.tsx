import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { habitAccent, habitColorOption, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { toDateKey } from "@/lib/date";
import { completionCount, currentStreak, dailyTarget, isDoneOnDate, monthlyCompletionCount, weeklyCompletionCount } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { AppText, Button, Card } from "./ui";
import { DottedProgressChart } from "./DottedProgressChart";
import { HabitIcon } from "./HabitIcon";
import { Icon } from "./Icon";

const UNDO_HOLD_DURATION_MS = 1500;

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
  const iconBackgroundColor = habitColor ? habitColor.color : isDark ? palette.greenSoft : palette.greenDark;
  const iconColor = habitColor ? habitColor.onColor : isDark ? palette.greenDark : palette.white;
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
  }

  function handleHoldEnd() {
    holdScale.value = withSpring(1, {
      damping: 14,
      stiffness: 150
    });
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
      onLongPress={() => handleUndoCompletion("longPress")}
      onPressIn={handleHoldStart}
      onPressOut={handleHoldEnd}
      delayLongPress={UNDO_HOLD_DURATION_MS}
      accessibilityRole="button"
      accessibilityLabel={canUndoCompletion ? `${habit.name}. Long press to undo completion.` : habit.name}
    >
      <Animated.View style={cardAnimatedStyle}>
        <Card style={compact ? styles.compactCard : undefined}>
          <View style={styles.header}>
            <View style={[styles.iconBubble, { backgroundColor: iconBackgroundColor }]}>
              <HabitIcon value={habit.emoji} color={iconColor} size={21} />
            </View>
            <View style={styles.titleBlock}>
              <View style={styles.titleRow}>
                <AppText variant="titleSmall" numberOfLines={1} style={styles.titleText}>
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
              <View style={styles.metaRow}>
                <Icon name="clock" size={14} color={palette.muted} weight="bulk" />
                <AppText variant="bodySmall" color={palette.muted}>
                  {reminderLabel}
                </AppText>
                <View style={[styles.metaDot, { backgroundColor: palette.hairline }]} />
                <AppText variant="bodySmall" color={palette.muted}>
                  {streak} day streak
                </AppText>
              </View>
            </View>
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
  compactCard: {
    borderRadius: radius.nav,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
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
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: radius.pill
  },
  chartWrap: {
    marginTop: spacing.lg,
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
