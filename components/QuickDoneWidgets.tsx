import * as Haptics from "expo-haptics";
import React from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { fontFamilies, habitAccent, habitColorOption, progressAccents, progressAccentText, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { toDateKey } from "@/lib/date";
import { completionCount, currentStreak, dailyTarget, isDoneOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { AppText, Card } from "./ui";
import { HabitIcon } from "./HabitIcon";
import { HoldProgressRing } from "./HoldProgressRing";
import { Icon } from "./Icon";

const UNDO_HOLD_DURATION_MS = 1500;
// Only reveal the progress ring after this much holding, so a quick tap never
// flashes it. The ring then fills over the remaining time.
const HOLD_REVEAL_DELAY_MS = 500;

// Shared with the feature board's vote badge — see constants/theme.ts.
const PROGRESS_ACCENTS = progressAccents;
const PROGRESS_ACCENT_TEXT = progressAccentText;

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
export function SegmentedRing({ total, filled, fillColor: fillColorOverride }: { total: number; filled: number; fillColor?: string }) {
  const { palette, settings } = useLumo();
  const fillColor = fillColorOverride ?? PROGRESS_ACCENTS[settings.colorScheme ?? "green"] ?? palette.glow;
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
  /** Habits that belong to a friends group show a small group marker. */
  groupHabitIds?: Set<string>;
};

function WidgetHabitRow({
  habit,
  dateKey,
  disabledActions = false,
  inGroup = false,
  onCompleted,
  onHoldEnd,
  onHoldStart,
  holdProgress
}: {
  habit: Habit;
  dateKey: string;
  disabledActions?: boolean;
  inGroup?: boolean;
  onCompleted?: (habitId: string) => void;
  onHoldEnd?: () => void;
  onHoldStart?: () => void;
  /** Drives the hold-to-undo progress ring on this row's icon (0 -> 1). */
  holdProgress?: Animated.Value;
}) {
  const { palette, isDark, settings, completeHabit, undoHabit } = useLumo();
  const done = isDoneOnDate(habit, dateKey);
  const todoBadgeColor = PROGRESS_ACCENTS[settings.colorScheme ?? "green"] ?? palette.glow;
  const todoBadgeTextColor = PROGRESS_ACCENT_TEXT;
  const count = completionCount(habit, dateKey);
  const target = dailyTarget(habit);
  const isMultiple = habit.goal.type === "multiple";
  const progressLabel = React.useMemo(() => {
    if (habit.goal.type === "multiple") {
      return `${Math.min(count, target)}/${target} today`;
    }
    // Streaks only surface once they reach 3 days — shorter runs stay quiet.
    const streak = currentStreak(habit);
    return streak >= 3 ? `${streak} day streak` : "";
  }, [habit, count, target]);
  // Habits with a color theme carry it through the row; legacy habits keep
  // the app theme's greens.
  const habitColor = habitColorOption(habit.color);
  const habitAccentColor = habitAccent(habit.color, isDark);
  const iconBackgroundColor = habitColor ? habitColor.color : isDark ? palette.greenSoft : palette.greenDark;
  const habitIconColor = habitColor ? habitColor.onColor : isDark ? palette.greenDark : palette.white;
  const doneBadgeTextColor = habitAccentColor ?? palette.greenDark;
  const holdRingColor = habitAccentColor ?? todoBadgeColor;
  // When the habit was checked off today — shown on the right once done.
  const completedTime = React.useMemo(() => {
    const entry = habit.completions.find((item) => item.date === dateKey);
    return entry?.completedAt ? new Date(entry.completedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
  }, [habit.completions, dateKey]);
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

    // Tapping only adds a completion; undoing a done habit is long-press only
    // (consistent with group activities) so it can't happen by accident.
    if (canAddCompletion) {
      confirmAddCompletion();
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
          ? `${habit.name}. Completed. Long press to undo completion.`
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
        {done ? (
          <Icon name="checkCircle" size={22} color={habitIconColor} weight="bulk" />
        ) : (
          <HabitIcon value={habit.emoji} color={habitIconColor} size={19} />
        )}
        {canUndoCompletion && holdProgress ? (
          <HoldProgressRing progress={holdProgress} size={50} stroke={3} color={holdRingColor} trackColor={alpha(holdRingColor, "24")} />
        ) : null}
      </View>
      <View style={styles.rowText}>
        <View style={styles.nameRow}>
          <AppText variant="titleSmall" numberOfLines={1} style={styles.nameText}>
            {habit.name}
          </AppText>
          {inGroup ? <Icon name="friends" size={14} color={palette.muted} weight="bulk" /> : null}
        </View>
        {progressLabel ? (
          <AppText variant="caption" color={alpha(palette.muted, "AA")}>
            {progressLabel}
          </AppText>
        ) : null}
      </View>
      {isMultiple && !done ? (
        <View style={[styles.ringWrap, { opacity: disabledActions ? 0.45 : 1 }]}>
          <SegmentedRing total={target} filled={Math.min(count, target)} fillColor={habitAccentColor} />
        </View>
      ) : (
        <Animated.View
          style={[
            styles.statusBadge,
            {
              backgroundColor: done ? "transparent" : todoBadgeColor,
              opacity: disabledActions && !done ? 0.45 : 1,
              transform: [{ scale: badgeScale }]
            }
          ]}
        >
          {done ? (
            completedTime ? (
              <AppText variant="caption" color={doneBadgeTextColor} numberOfLines={1}>
                {completedTime}
              </AppText>
            ) : (
              <Icon name="checkCircle" size={24} color={doneBadgeTextColor} weight="bulk" />
            )
          ) : (
            <AppText variant="caption" color={todoBadgeTextColor} style={styles.statusBadgeText}>
              TO DO
            </AppText>
          )}
        </Animated.View>
      )}
    </Pressable>
  );
}

function QuickHabitCard({
  children,
  exiting = false,
  entering = false,
  habit,
  style
}: {
  children: (holdControls: { onHoldEnd: () => void; onHoldStart: () => void; holdProgress: Animated.Value }) => React.ReactNode;
  exiting?: boolean;
  // True only for a card that just transitioned into the Completed section, so
  // the entrance spring doesn't replay on load or on every tab focus.
  entering?: boolean;
  habit: Habit;
  style?: object;
}) {
  // All three drive the same view's transform/height together, so they share
  // the JS driver (height can't animate on the native thread anyway).
  const holdScale = React.useRef(new Animated.Value(1)).current;
  const holdProgress = React.useRef(new Animated.Value(0)).current; // 0 idle -> 1 hold complete
  const exitProgress = React.useRef(new Animated.Value(0)).current; // 0 present -> 1 gone
  const enterProgress = React.useRef(new Animated.Value(entering ? 0 : 1)).current; // 0 pre-mount -> 1 settled
  const [measuredHeight, setMeasuredHeight] = React.useState<number | null>(null);

  // Entrance: a gentle rise + scale so a habit arriving in the Completed
  // section reads as "landed" rather than popping in. Skipped (starts settled)
  // for cards that were already there.
  React.useEffect(() => {
    if (!entering) {
      return;
    }

    enterProgress.setValue(0);
    Animated.spring(enterProgress, {
      toValue: 1,
      friction: 9,
      tension: 80,
      useNativeDriver: false
    }).start();
  }, [entering, enterProgress]);

  // Exit: fade + settle-scale, then collapse height so the cards below flow up
  // smoothly instead of jumping when this one is removed.
  React.useEffect(() => {
    exitProgress.stopAnimation();

    if (!exiting) {
      exitProgress.setValue(0);
      return;
    }

    Animated.timing(exitProgress, {
      toValue: 1,
      duration: 440,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [exitProgress, exiting]);

  const handleHoldStart = React.useCallback(() => {
    holdScale.stopAnimation();
    holdProgress.stopAnimation();
    Animated.timing(holdScale, {
      toValue: 1.035,
      duration: UNDO_HOLD_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
    // Hold the ring hidden for the reveal delay, then fill over the remaining
    // time so it reaches full exactly as the long-press fires.
    Animated.timing(holdProgress, {
      toValue: 1,
      delay: HOLD_REVEAL_DELAY_MS,
      duration: UNDO_HOLD_DURATION_MS - HOLD_REVEAL_DELAY_MS,
      easing: Easing.linear,
      useNativeDriver: false
    }).start();
  }, [holdScale, holdProgress]);

  const handleHoldEnd = React.useCallback(() => {
    holdScale.stopAnimation();
    holdProgress.stopAnimation();
    Animated.spring(holdScale, {
      toValue: 1,
      friction: 7,
      tension: 120,
      useNativeDriver: false
    }).start();
    Animated.timing(holdProgress, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [holdScale, holdProgress]);

  const opacity = Animated.multiply(
    enterProgress,
    exitProgress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.35, 0] })
  );
  const scale = Animated.multiply(
    holdScale,
    Animated.multiply(
      enterProgress.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }),
      exitProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] })
    )
  );
  const translateY = enterProgress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  // Hold the full height until the fade is mostly done, then collapse to 0.
  const collapseStyle =
    exiting && measuredHeight != null
      ? {
          height: exitProgress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [measuredHeight, measuredHeight, 0]
          }),
          overflow: "hidden" as const
        }
      : null;

  return (
    <Animated.View
      key={habit.id}
      pointerEvents={exiting ? "none" : "auto"}
      onLayout={(event) => {
        if (measuredHeight == null) {
          setMeasuredHeight(event.nativeEvent.layout.height);
        }
      }}
      style={[styles.habitCardScale, collapseStyle, { opacity, transform: [{ translateY }, { scale }] }]}
    >
      <Card style={style}>{children({ onHoldEnd: handleHoldEnd, onHoldStart: handleHoldStart, holdProgress })}</Card>
    </Animated.View>
  );
}

export function QuickDoneWidgets({ habits, dateKey = toDateKey(), disabledActions = false, groupHabitIds }: Props) {
  const [settlingCompletedIds, setSettlingCompletedIds] = React.useState<Set<string>>(() => new Set());
  // Ids currently playing their entrance in the Completed section (just moved
  // there via the completion flow).
  const [enteringCompletedIds, setEnteringCompletedIds] = React.useState<Set<string>>(() => new Set());
  const settleTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const enterTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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

    // Let the exit fade + height collapse finish (~440ms) before moving the
    // card, then flag it as entering so it springs into the Completed section.
    settleTimers.current[habitId] = setTimeout(() => {
      setSettlingCompletedIds((current) => {
        const next = new Set(current);
        next.delete(habitId);
        return next;
      });
      setEnteringCompletedIds((current) => {
        const next = new Set(current);
        next.add(habitId);
        return next;
      });
      delete settleTimers.current[habitId];

      enterTimers.current[habitId] = setTimeout(() => {
        setEnteringCompletedIds((current) => {
          const next = new Set(current);
          next.delete(habitId);
          return next;
        });
        delete enterTimers.current[habitId];
      }, 600);
    }, 520);
  }, []);

  React.useEffect(() => {
    return () => {
      Object.values(settleTimers.current).forEach(clearTimeout);
      Object.values(enterTimers.current).forEach(clearTimeout);
    };
  }, []);

  if (!habits.length) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {needsCompletion.map((habit) => (
        <QuickHabitCard key={habit.id} exiting={settlingCompletedIds.has(habit.id) && isDoneOnDate(habit, dateKey)} habit={habit} style={styles.habitCard}>
          {({ onHoldEnd, onHoldStart, holdProgress }) => (
            <WidgetHabitRow
              habit={habit}
              dateKey={dateKey}
              disabledActions={disabledActions}
              inGroup={groupHabitIds?.has(habit.id)}
              onCompleted={holdCompletedHabit}
              onHoldEnd={onHoldEnd}
              onHoldStart={onHoldStart}
              holdProgress={holdProgress}
            />
          )}
        </QuickHabitCard>
      ))}

      {/* Completed habits simply drop to the bottom of the same list — no
          separate "Completed" section header or show/hide toggle. */}
      {completed.map((habit) => (
        <QuickHabitCard key={habit.id} habit={habit} entering={enteringCompletedIds.has(habit.id)} style={styles.habitCard}>
          {({ onHoldEnd, onHoldStart, holdProgress }) => (
            <WidgetHabitRow
              habit={habit}
              dateKey={dateKey}
              disabledActions={disabledActions}
              inGroup={groupHabitIds?.has(habit.id)}
              onHoldEnd={onHoldEnd}
              onHoldStart={onHoldStart}
              holdProgress={holdProgress}
            />
          )}
        </QuickHabitCard>
      ))}

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
    paddingVertical: spacing.xs,
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
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs
  },
  nameText: {
    flexShrink: 1
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
