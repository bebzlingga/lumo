import * as Haptics from "expo-haptics";
import React from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { fontFamilies, radius, spacing, ThemeColorScheme } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { toDateKey } from "@/lib/date";
import { completionCount, currentStreak, dailyTarget, isDoneOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { AppText, Card } from "./ui";
import { HabitIcon } from "./HabitIcon";
import { Icon } from "./Icon";

const UNDO_HOLD_DURATION_MS = 1500;

/**
 * Contrasting pop color per theme for in-progress state (ring fill + TO DO
 * badge) — deliberately NOT the theme's own hue, the way amber pops on the
 * black theme. All are light enough to carry near-black text in both modes.
 */
const PROGRESS_ACCENTS: Record<ThemeColorScheme, string> = {
  black: "#FFC94D", // amber
  green: "#EE8B6C", // terracotta
  blue: "#F09B7A", // peach coral
  indigo: "#F0928A", // coral
  orange: "#E5C685", // cream / sand
  pink: "#F7BE45", // deep gold
  purple: "#F2A08C" // salmon
};
const PROGRESS_ACCENT_TEXT = "#141413";

const RING_SIZE = 30;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A progress ring split into `total` arc segments with gaps between them.
 * Each segment has its own animated value: the green arc grows over the gray
 * track when it fills (0 -> 1) and shrinks back when a completion is undone.
 */
function SegmentedRing({ total, filled }: { total: number; filled: number }) {
  const { palette, settings } = useLumo();
  const fillColor = PROGRESS_ACCENTS[settings.colorScheme ?? "green"] ?? palette.glow;
  const slice = RING_CIRCUMFERENCE / total;
  // Round line caps extend half the stroke width into each side of a gap,
  // so pad the gap enough to stay visible after the caps are drawn.
  const gap = Math.min(8, Math.max(slice * 0.25, RING_STROKE + 3));
  const segment = slice - gap;
  const segmentAnims = React.useRef<Animated.Value[]>([]).current;

  // Lazily create one value per segment, starting at its current fill state
  // so nothing animates on first mount.
  for (let index = segmentAnims.length; index < total; index++) {
    segmentAnims.push(new Animated.Value(index < filled ? 1 : 0));
  }

  React.useEffect(() => {
    segmentAnims.slice(0, total).forEach((value, index) => {
      Animated.timing(value, {
        toValue: index < filled ? 1 : 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false
      }).start();
    });
  }, [filled, total, segmentAnims]);

  return (
    <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
      {Array.from({ length: total }, (_, index) => {
        const shared = {
          cx: RING_SIZE / 2,
          cy: RING_SIZE / 2,
          r: RING_RADIUS,
          strokeWidth: RING_STROKE,
          strokeDashoffset: -(index * slice + gap / 2),
          strokeLinecap: "round" as const,
          fill: "none",
          originX: RING_SIZE / 2,
          originY: RING_SIZE / 2,
          rotation: -90
        };

        return (
          <React.Fragment key={index}>
            <Circle {...shared} stroke={palette.chartTrack} strokeDasharray={`${segment} ${RING_CIRCUMFERENCE - segment}`} />
            <AnimatedCircle
              {...shared}
              stroke={fillColor}
              strokeDasharray={segmentAnims[index].interpolate({
                inputRange: [0, 1],
                outputRange: [`0.01 ${RING_CIRCUMFERENCE}`, `${segment} ${RING_CIRCUMFERENCE - segment}`]
              })}
              opacity={segmentAnims[index].interpolate({
                inputRange: [0, 0.04, 1],
                outputRange: [0, 1, 1]
              })}
            />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

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
  const { palette, isDark, settings, completeHabit, undoHabit } = useLumo();
  const done = isDoneOnDate(habit, dateKey);
  const todoBadgeColor = PROGRESS_ACCENTS[settings.colorScheme ?? "green"] ?? palette.glow;
  const todoBadgeTextColor = PROGRESS_ACCENT_TEXT;
  const count = completionCount(habit, dateKey);
  const target = dailyTarget(habit);
  const isMultiple = habit.goal.type === "multiple";
  const progressLabel = React.useMemo(
    () => (habit.goal.type === "multiple" ? `${Math.min(count, target)}/${target} today` : `${currentStreak(habit)} day streak`),
    [habit, count, target]
  );
  const iconBackgroundColor = isDark ? palette.greenSoft : palette.greenDark;
  const habitIconColor = isDark ? palette.greenDark : palette.white;
  const suppressTapUntil = React.useRef(0);
  const promptOpen = React.useRef(false);
  const badgeScale = React.useRef(new Animated.Value(1)).current;
  const prevDone = React.useRef(done);
  const canAddCompletion = !disabledActions && !done;
  const canUndoCompletion = !disabledActions && count > 0;
  const isActionDisabled = !canAddCompletion && !canUndoCompletion;

  React.useEffect(() => {
    if (done && !prevDone.current) {
      badgeScale.setValue(0.6);
      Animated.spring(badgeScale, {
        toValue: 1,
        friction: 4,
        tension: 160,
        useNativeDriver: true
      }).start();
    }
    prevDone.current = done;
  }, [done, badgeScale]);

  function handlePressIn() {
    if (canUndoCompletion) {
      onHoldStart?.();
    }
  }

  function handlePressOut() {
    onHoldEnd?.();
  }

  function handleRowPress() {
    if (Date.now() < suppressTapUntil.current) {
      return;
    }

    if (canAddCompletion) {
      confirmAddCompletion();
      return;
    }

    if (canUndoCompletion) {
      handleUndoCompletion();
    }
  }

  function confirmAddCompletion() {
    if (promptOpen.current) {
      return;
    }

    promptOpen.current = true;
    suppressTapUntil.current = Date.now() + 500;
    Alert.alert(
      isMultiple ? "Add a completion?" : "Complete habit?",
      isMultiple
        ? `Log one more for ${habit.name} — that makes ${Math.min(count + 1, target)}/${target} today.`
        : `Mark ${habit.name} as done for today?`,
      [
        {
          text: "Not yet",
          style: "cancel",
          onPress: () => {
            promptOpen.current = false;
          }
        },
        {
          text: isMultiple ? "Add" : "Complete",
          onPress: () => {
            promptOpen.current = false;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            if (count + 1 >= target) {
              onCompleted?.(habit.id);
            }
            completeHabit(habit.id, dateKey);
          }
        }
      ],
      {
        onDismiss: () => {
          promptOpen.current = false;
        }
      }
    );
  }

  function handleUndoCompletion(trigger: "tap" | "longPress" = "tap") {
    if (!canUndoCompletion || promptOpen.current) {
      return;
    }

    promptOpen.current = true;
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
            promptOpen.current = false;
          }
        },
        {
          text: "Undo",
          style: "destructive",
          onPress: () => {
            promptOpen.current = false;
            undoHabit(habit.id, dateKey);
          }
        }
      ],
      {
        onDismiss: () => {
          promptOpen.current = false;
        }
      }
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isActionDisabled, selected: done }}
      accessibilityLabel={
        done
          ? `${habit.name}. Completed. Tap or long press to undo completion.`
          : isMultiple
            ? `${habit.name}. ${progressLabel}. Tap to add a completion.`
            : `${habit.name}. Tap to complete.`
      }
      delayLongPress={UNDO_HOLD_DURATION_MS}
      disabled={isActionDisabled}
      onLongPress={() => handleUndoCompletion("longPress")}
      onPress={handleRowPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.widgetRow}
    >
      <View style={[styles.widgetIcon, { backgroundColor: iconBackgroundColor }]}>
        <HabitIcon value={habit.emoji} color={habitIconColor} size={19} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="titleSmall" numberOfLines={1}>
          {habit.name}
        </AppText>
        <AppText variant="bodySmall" color={palette.muted}>
          {progressLabel}
        </AppText>
      </View>
      {isMultiple && !done ? (
        <View style={[styles.ringWrap, { opacity: disabledActions ? 0.45 : 1 }]}>
          <SegmentedRing total={target} filled={Math.min(count, target)} />
        </View>
      ) : (
        <Animated.View
          style={[
            styles.statusBadge,
            {
              backgroundColor: done ? palette.greenSoft : todoBadgeColor,
              opacity: disabledActions && !done ? 0.45 : 1,
              transform: [{ scale: badgeScale }]
            }
          ]}
        >
          <AppText variant="caption" color={done ? palette.greenDark : todoBadgeTextColor} style={styles.statusBadgeText}>
            {done ? "DONE" : "TO DO"}
          </AppText>
        </Animated.View>
      )}
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
      {needsCompletion.map((habit) => (
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
      ))}

      {completed.length ? (
        <View style={[styles.completedSection, !needsCompletion.length && styles.completedSectionFlush]}>
          <View style={styles.completedHeader}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.completedTitle}>
              Completed
            </AppText>
            <View style={styles.completedHeaderActions}>
              <AppText variant="bodySmall" color={palette.subtle} style={styles.completedCount}>
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
  ringWrap: {
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center"
  },
  statusBadge: {
    minWidth: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  statusBadgeText: {
    fontFamily: "Lexend-Black",
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.6
  },
  completedSection: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs
  },
  completedSectionFlush: {
    paddingTop: 0
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
    fontFamily: fontFamilies.lexendSemiBold,
    opacity: 0.5
  },
  completedToggle: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  }
});
