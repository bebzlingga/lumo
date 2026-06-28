import * as Haptics from "expo-haptics";
import React from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { toDateKey } from "@/lib/date";
import { completionCount, currentStreak, dailyTarget, isDoneOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { AppText, Card } from "./ui";
import { HabitIcon } from "./HabitIcon";
import { Icon } from "./Icon";

const ACTION_SIZE = 48;
const ACTION_RING_STROKE = 3.5;
const ACTION_RING_RADIUS = 19;
const ACTION_RING_CIRCUMFERENCE = 2 * Math.PI * ACTION_RING_RADIUS;
const UNDO_HOLD_DURATION_MS = 1500;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const confettiPieces = [
  { left: 14, top: 10, size: 7, fall: 34, drift: -12, rotate: 140 },
  { left: 26, top: 18, size: 5, fall: 40, drift: 10, rotate: -120 },
  { left: 42, top: 8, size: 8, fall: 38, drift: -6, rotate: 170 },
  { left: 58, top: 16, size: 5, fall: 36, drift: 12, rotate: 100 },
  { left: 72, top: 9, size: 7, fall: 42, drift: -10, rotate: -150 },
  { left: 84, top: 20, size: 6, fall: 35, drift: 8, rotate: 130 }
];

type Props = {
  habits: Habit[];
  dateKey?: string;
  disabledActions?: boolean;
};

function WidgetHabitRow({
  habit,
  dateKey,
  disabledActions = false,
  onCompleted,
  onHoldEnd,
  onHoldStart
}: {
  habit: Habit;
  dateKey: string;
  disabledActions?: boolean;
  onCompleted?: (habitId: string) => void;
  onHoldEnd?: () => void;
  onHoldStart?: () => void;
}) {
  const { palette, isDark, completeHabit, undoHabit } = useLumo();
  const done = isDoneOnDate(habit, dateKey);
  const count = completionCount(habit, dateKey);
  const target = dailyTarget(habit);
  const isMultiple = habit.goal.type === "multiple";
  const showProgressRing = isMultiple && !done;
  const progress = target > 0 ? Math.min(count, target) / target : 0;
  const progressLabel = React.useMemo(
    () => (habit.goal.type === "multiple" ? `${Math.min(count, target)}/${target} today` : `${currentStreak(habit)} day streak`),
    [habit, count, target]
  );
  const iconBackgroundColor = isDark ? palette.greenSoft : palette.greenDark;
  const habitIconColor = isDark ? palette.greenDark : palette.white;
  const progressTrackColor = isDark ? `${palette.greenSoft}4D` : `${palette.greenSoft}66`;
  const iconProgress = React.useRef(new Animated.Value(1)).current;
  const ringProgress = React.useRef(new Animated.Value(progress)).current;
  const suppressTapUntil = React.useRef(0);
  const undoPromptOpen = React.useRef(false);
  const iconWeight = done ? "bulk" : "linear";
  const canAddCompletion = !disabledActions && !done;
  const canUndoCompletion = !disabledActions && count > 0;
  const isActionDisabled = !canAddCompletion && !canUndoCompletion;
  const ringOffset = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [ACTION_RING_CIRCUMFERENCE, 0]
  });

  React.useEffect(() => {
    iconProgress.setValue(0.82);
    Animated.spring(iconProgress, {
      toValue: 1,
      friction: 5,
      tension: 180,
      useNativeDriver: true
    }).start();
  }, [done, iconProgress]);

  React.useEffect(() => {
    Animated.timing(ringProgress, {
      toValue: progress,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [progress, ringProgress]);

  function handlePressIn() {
    if (canUndoCompletion) {
      onHoldStart?.();
    }
  }

  function handlePressOut() {
    onHoldEnd?.();
  }

  function handleAddCompletion() {
    if (Date.now() < suppressTapUntil.current) {
      return;
    }

    if (done && canUndoCompletion) {
      handleUndoCompletion();
      return;
    }

    if (!canAddCompletion) {
      return;
    }

    if (count + 1 >= target) {
      onCompleted?.(habit.id);
    }

    completeHabit(habit.id, dateKey);
  }

  function handleUndoCompletion(trigger: "tap" | "longPress" = "tap") {
    if (!canUndoCompletion || undoPromptOpen.current) {
      return;
    }

    undoPromptOpen.current = true;
    suppressTapUntil.current = Date.now() + 1000;
    if (trigger === "longPress") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      onHoldEnd?.();
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
      accessibilityLabel={canUndoCompletion ? `${habit.name}. Long press to undo completion.` : undefined}
      delayLongPress={UNDO_HOLD_DURATION_MS}
      disabled={!canUndoCompletion}
      onLongPress={() => handleUndoCompletion("longPress")}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.widgetRow}
    >
      <View style={[styles.widgetIcon, { backgroundColor: iconBackgroundColor }]}>
        <HabitIcon value={habit.emoji} color={habitIconColor} size={22} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="titleSmall" numberOfLines={1}>
          {habit.name}
        </AppText>
        <AppText variant="bodySmall" color={palette.muted}>
          {progressLabel}
        </AppText>
      </View>
      <Pressable
        accessibilityLabel={
          done
            ? `${progressLabel}. Completed. Tap or long press to undo completion.`
            : canUndoCompletion
              ? `${progressLabel}. Tap to add completion. Long press to undo completion.`
              : habit.goal.type === "multiple"
                ? "Add completion"
                : "Mark done"
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: isActionDisabled, selected: done }}
        delayLongPress={UNDO_HOLD_DURATION_MS}
        onLongPress={() => handleUndoCompletion("longPress")}
        onPress={handleAddCompletion}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isActionDisabled}
        style={({ pressed }) => [
          styles.iconDoneButton,
          {
            backgroundColor: showProgressRing ? "transparent" : palette.greenSoft,
            borderColor: palette.hairline,
            opacity: disabledActions && !done ? 0.45 : pressed ? 0.76 : 1
          }
        ]}
      >
        {showProgressRing ? (
          <View style={styles.progressAction}>
            <Svg width={ACTION_SIZE} height={ACTION_SIZE} viewBox={`0 0 ${ACTION_SIZE} ${ACTION_SIZE}`} style={styles.progressRing}>
              <Circle
                cx={ACTION_SIZE / 2}
                cy={ACTION_SIZE / 2}
                r={ACTION_RING_RADIUS}
                stroke={progressTrackColor}
                strokeWidth={ACTION_RING_STROKE}
                fill="none"
              />
              <AnimatedCircle
                cx={ACTION_SIZE / 2}
                cy={ACTION_SIZE / 2}
                r={ACTION_RING_RADIUS}
                stroke={palette.greenDark}
                strokeWidth={ACTION_RING_STROKE}
                strokeDasharray={`${ACTION_RING_CIRCUMFERENCE} ${ACTION_RING_CIRCUMFERENCE}`}
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
                fill="none"
                originX={ACTION_SIZE / 2}
                originY={ACTION_SIZE / 2}
                rotation="-90"
              />
            </Svg>
            <Animated.View style={{ opacity: iconProgress, transform: [{ scale: iconProgress }] }}>
              <Icon name="checkCircle" size={24} color={palette.greenDark} weight={iconWeight} />
            </Animated.View>
          </View>
        ) : (
          <Animated.View style={{ opacity: iconProgress, transform: [{ scale: iconProgress }] }}>
            <Icon name="checkCircle" size={23} color={palette.greenDark} weight={iconWeight} />
          </Animated.View>
        )}
      </Pressable>
    </Pressable>
  );
}

function QuickHabitCard({
  children,
  exiting = false,
  habit,
  style
}: {
  children: (holdControls: { onHoldEnd: () => void; onHoldStart: () => void }) => React.ReactNode;
  exiting?: boolean;
  habit: Habit;
  style?: object;
}) {
  const holdScale = React.useRef(new Animated.Value(1)).current;
  const exitProgress = React.useRef(new Animated.Value(0)).current;
  const exitOpacity = exitProgress.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [1, 0.55, 0]
  });
  const exitTranslateY = exitProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -18]
  });

  const handleHoldStart = React.useCallback(() => {
    holdScale.stopAnimation();
    Animated.timing(holdScale, {
      toValue: 1.035,
      duration: UNDO_HOLD_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [holdScale]);

  const handleHoldEnd = React.useCallback(() => {
    holdScale.stopAnimation();
    Animated.spring(holdScale, {
      toValue: 1,
      friction: 7,
      tension: 120,
      useNativeDriver: true
    }).start();
  }, [holdScale]);

  React.useEffect(() => {
    exitProgress.stopAnimation();

    if (!exiting) {
      exitProgress.setValue(0);
      return;
    }

    Animated.timing(exitProgress, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [exitProgress, exiting]);

  return (
    <Animated.View
      key={habit.id}
      pointerEvents={exiting ? "none" : "auto"}
      style={[
        styles.habitCardScale,
        {
          opacity: exitOpacity,
          transform: [{ translateY: exitTranslateY }, { scale: holdScale }]
        }
      ]}
    >
      <Card style={style}>{children({ onHoldEnd: handleHoldEnd, onHoldStart: handleHoldStart })}</Card>
    </Animated.View>
  );
}

function CompletionCelebrationCard() {
  const { palette, isDark } = useLumo();
  const entranceProgress = React.useRef(new Animated.Value(0)).current;
  const confettiProgress = React.useRef(new Animated.Value(0)).current;
  const cardBackground = isDark ? palette.greenSoft : palette.greenDark;
  const titleColor = palette.white;
  const bodyColor = isDark ? palette.greenDark : palette.greenSoft;
  const confettiColors = [palette.glow, palette.greenSoft, palette.white, palette.accent, bodyColor];
  const entranceTranslateY = entranceProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0]
  });
  const entranceScale = entranceProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1]
  });

  React.useEffect(() => {
    Animated.spring(entranceProgress, {
      toValue: 1,
      friction: 8,
      tension: 90,
      useNativeDriver: true
    }).start();
  }, [entranceProgress]);

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(confettiProgress, {
          toValue: 1,
          duration: 1700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.delay(450),
        Animated.timing(confettiProgress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true
        })
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [confettiProgress]);

  return (
    <Animated.View style={{ opacity: entranceProgress, transform: [{ translateY: entranceTranslateY }, { scale: entranceScale }] }}>
      <Card style={[styles.celebrationCard, { backgroundColor: cardBackground }]}>
        <View pointerEvents="none" style={styles.confettiLayer}>
          {confettiPieces.map((piece, index) => {
            const translateY = confettiProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [-8, piece.fall]
            });
            const translateX = confettiProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, piece.drift]
            });
            const rotate = confettiProgress.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", `${piece.rotate}deg`]
            });
            const opacity = confettiProgress.interpolate({
              inputRange: [0, 0.12, 0.82, 1],
              outputRange: [0, 1, 1, 0]
            });

            return (
              <Animated.View
                key={`${piece.left}-${piece.top}`}
                style={[
                  styles.confettiPiece,
                  {
                    backgroundColor: confettiColors[index % confettiColors.length],
                    height: piece.size,
                    left: `${piece.left}%`,
                    opacity,
                    top: piece.top,
                    transform: [{ translateX }, { translateY }, { rotate }],
                    width: piece.size * 1.5
                  }
                ]}
              />
            );
          })}
        </View>
        <View style={styles.celebrationIcon}>
          <Icon name="award" size={104} color={titleColor} weight="bulk" />
        </View>
        <View style={styles.celebrationCopy}>
          <AppText variant="titleSmall" color={titleColor} style={styles.celebrationTitle}>
            Congratulations!
          </AppText>
          <AppText variant="body" color={bodyColor} style={styles.celebrationBody}>
            You showed up for yourself today.
          </AppText>
        </View>
      </Card>
    </Animated.View>
  );
}

export function QuickDoneWidgets({ habits, dateKey = toDateKey(), disabledActions = false }: Props) {
  const { palette } = useLumo();
  const [showCompleted, setShowCompleted] = React.useState(true);
  const [settlingCompletedIds, setSettlingCompletedIds] = React.useState<Set<string>>(() => new Set());
  const settleTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const needsCompletion = habits.filter((habit) => !isDoneOnDate(habit, dateKey) || settlingCompletedIds.has(habit.id));
  const completed = habits.filter((habit) => isDoneOnDate(habit, dateKey) && !settlingCompletedIds.has(habit.id));

  const holdCompletedHabit = React.useCallback((habitId: string) => {
    setSettlingCompletedIds((current) => {
      const next = new Set(current);
      next.add(habitId);
      return next;
    });

    if (settleTimers.current[habitId]) {
      clearTimeout(settleTimers.current[habitId]);
    }

    settleTimers.current[habitId] = setTimeout(() => {
      setSettlingCompletedIds((current) => {
        const next = new Set(current);
        next.delete(habitId);
        return next;
      });
      delete settleTimers.current[habitId];
    }, 700);
  }, []);

  React.useEffect(() => {
    return () => {
      Object.values(settleTimers.current).forEach(clearTimeout);
    };
  }, []);

  if (!habits.length) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {needsCompletion.length ? (
        needsCompletion.map((habit) => (
          <QuickHabitCard key={habit.id} exiting={settlingCompletedIds.has(habit.id) && isDoneOnDate(habit, dateKey)} habit={habit} style={styles.habitCard}>
            {({ onHoldEnd, onHoldStart }) => (
              <WidgetHabitRow
                habit={habit}
                dateKey={dateKey}
                disabledActions={disabledActions}
                onCompleted={holdCompletedHabit}
                onHoldEnd={onHoldEnd}
                onHoldStart={onHoldStart}
              />
            )}
          </QuickHabitCard>
        ))
      ) : (
        <CompletionCelebrationCard />
      )}

      {completed.length ? (
        <View style={styles.completedSection}>
          <View style={styles.completedHeader}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.completedTitle}>
              Completed
            </AppText>
            <View style={styles.completedHeaderActions}>
              <AppText variant="bodySmall" color={palette.muted} style={styles.completedCount}>
                {completed.length} {completed.length === 1 ? "Habit" : "Habits"}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showCompleted ? "Hide completed habits" : "Show completed habits"}
                accessibilityState={{ expanded: showCompleted }}
                onPress={() => setShowCompleted((current) => !current)}
                style={({ pressed }) => [
                  styles.completedToggle,
                  {
                    backgroundColor: showCompleted ? palette.greenDark : palette.greenSoft,
                    opacity: pressed ? 0.74 : 1
                  }
                ]}
              >
                <Icon name={showCompleted ? "eye" : "eyeSlash"} size={18} color={palette.greenDark} weight="bulk" />
              </Pressable>
            </View>
          </View>
          {showCompleted ? (
            <View style={styles.completedCards}>
              {completed.map((habit) => (
                <QuickHabitCard key={habit.id} habit={habit} style={styles.habitCard}>
                  {({ onHoldEnd, onHoldStart }) => (
                    <WidgetHabitRow
                      habit={habit}
                      dateKey={dateKey}
                      disabledActions={disabledActions}
                      onHoldEnd={onHoldEnd}
                      onHoldStart={onHoldStart}
                    />
                  )}
                </QuickHabitCard>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Full iOS WidgetKit or Android widget support would bridge these same
          completion actions through a native extension, shared storage, and
          deep-link reconciliation back into the Expo app. */}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs
  },
  widgetIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  habitCard: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  habitCardScale: {
    transformOrigin: "center"
  },
  widgetRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  rowText: {
    flex: 1
  },
  iconDoneButton: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    minHeight: ACTION_SIZE,
    minWidth: ACTION_SIZE,
    borderRadius: radius.nav,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0
  },
  progressAction: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    alignItems: "center",
    justifyContent: "center"
  },
  progressRing: {
    ...StyleSheet.absoluteFillObject
  },
  celebrationCard: {
    borderRadius: 34,
    marginBottom: spacing.md,
    minHeight: 220,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    overflow: "hidden"
  },
  celebrationIcon: {
    alignItems: "center",
    justifyContent: "center"
  },
  celebrationCopy: {
    alignItems: "center",
    gap: spacing.xxs
  },
  celebrationTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 22,
    lineHeight: 29,
    textAlign: "center"
  },
  celebrationBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center"
  },
  confettiLayer: {
    ...StyleSheet.absoluteFillObject
  },
  confettiPiece: {
    position: "absolute",
    borderRadius: radius.xs
  },
  completedSection: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs
  },
  completedCards: {
    gap: spacing.xs
  },
  completedHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  completedTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  completedHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  completedCount: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  completedToggle: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  }
});
