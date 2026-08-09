import * as Haptics from "expo-haptics";
import React from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { fontFamilies, habitAccent, habitColorOption, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { toDateKey } from "@/lib/date";
import { cadenceLabel, completionCount, currentStreak, dailyTarget, isDoneOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { AppText, Card } from "./ui";
import { HabitIcon } from "./HabitIcon";
import { HoldProgressRing } from "./HoldProgressRing";
import { Icon } from "./Icon";
import { LumoMascot } from "./LumoMascot";

/** Exported so the group habits list holds for exactly as long as this one —
 *  the two are the same gesture on the same kind of row, and a hold that
 *  completes at a different moment in each place is two gestures. */
export const UNDO_HOLD_DURATION_MS = 1500;
// Only reveal the progress ring after this much holding, so a quick tap never
// flashes it. The ring then fills over the remaining time.
export const HOLD_REVEAL_DELAY_MS = 500;

/** The multi-count ring, shared by all three habit lists — home, the friends
 *  tab's group rows, and a group's own Habits tab. One size for the three of
 *  them: they are the same control doing the same job, and it should not be a
 *  few points apart depending on which screen you reached it from. Down from
 *  30/5, which stood a third taller than the check circle it stands in for. */
const RING_SIZE = 24;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** The trailing check target — a filled disc once done, an empty ring before.
 *  Shared with the friends tab's habit rows, which draw the same 22. A group's
 *  own Habits tab deliberately runs smaller at 18: that row carries a share bar
 *  and a fortnight strip under the name where these carry a subtitle. */
const CHECK_SIZE = 22;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A progress ring split into `total` arc segments with gaps between them.
 * Each segment has its own animated value: the green arc grows over the gray
 * track when it fills (0 -> 1) and shrinks back when a completion is undone.
 *
 * No size prop: every caller draws it at RING_SIZE. See that constant for why
 * the three habit lists share one.
 */
export function SegmentedRing({ total, filled, fillColor: fillColorOverride }: { total: number; filled: number; fillColor?: string }) {
  const { palette } = useLumo();
  const fillColor = fillColorOverride ?? palette.glow;
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
  /** Card heading — "Today's Habits" on today, plain "Habits" on other days. */
  title?: string;
};

function WidgetHabitRow({
  habit,
  dateKey,
  disabledActions = false,
  inGroup = false,
  onHoldEnd,
  onHoldStart,
  holdProgress
}: {
  habit: Habit;
  dateKey: string;
  disabledActions?: boolean;
  inGroup?: boolean;
  onHoldEnd?: () => void;
  onHoldStart?: () => void;
  /** Drives the hold-to-undo progress ring on this row's icon (0 -> 1). */
  holdProgress?: Animated.Value;
}) {
  const { palette, isDark, completeHabit, undoHabit } = useLumo();
  const done = isDoneOnDate(habit, dateKey);
  const count = completionCount(habit, dateKey);
  const target = dailyTarget(habit);
  const isMultiple = habit.goal.type === "multiple";
  // When the habit was checked off — shown in place of the cadence once done.
  const completedTime = React.useMemo(() => {
    const entry = habit.completions.find((item) => item.date === dateKey);
    return entry?.completedAt ? new Date(entry.completedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
  }, [habit.completions, dateKey]);
  // The row's second line: what the habit asks of you, plus whichever of
  // "3/5 today", "12 day streak" or the completion time is worth saying now.
  const subtitle = React.useMemo(() => {
    const cadence = cadenceLabel(habit);

    if (done) {
      return completedTime ? `Done · ${completedTime}` : "Done";
    }

    if (isMultiple) {
      return `${Math.min(count, target)}/${target} today · ${cadence}`;
    }

    // Streaks only surface once they reach 3 days — shorter runs stay quiet.
    const streak = currentStreak(habit);

    return streak >= 3 ? `${streak} day streak · ${cadence}` : cadence;
  }, [habit, done, completedTime, isMultiple, count, target]);
  // Habits with a color theme carry it through the row; legacy habits keep
  // the app theme's greens.
  const habitColor = habitColorOption(habit.color);
  const habitAccentColor = habitAccent(habit.color, isDark);
  // Onboarding's IconTile treatment: a soft tint carrying a saturated glyph,
  // rather than a solid fill with a knocked-out white one.
  const iconBackgroundColor = habitColor ? alpha(habitColor.color, isDark ? "2E" : "24") : palette.greenSoft;
  const habitIconColor = habitAccentColor ?? palette.greenDark;
  const holdRingColor = habitAccentColor ?? palette.glow;
  // The check target wears the habit's swatch rather than the app accent, so a
  // row is one colour end to end. `onColor` is the swatch's own paired content
  // colour — white on the bold hues, the deep family hue on the pale ones — so
  // the tick stays legible on every option. Habits saved before colour themes
  // fall back to the app's greens.
  const checkFill = habitColor ? habitColor.color : palette.greenDark;
  const checkGlyph = habitColor ? habitColor.onColor : palette.white;
  // Empty, but tinted: the ring says which habit it belongs to before it is
  // ticked, without reading as already filled.
  const checkEmptyBorder = habitAccentColor ? alpha(habitAccentColor, "4D") : palette.hairline;
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
            ? `${habit.name}. ${subtitle}. Tap to add a completion.`
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
      {/* Rounded square, not a disc — it reads as a tile of the habit's colour
          beside the round check target on the other end of the row. */}
      <View style={[styles.widgetIcon, { backgroundColor: iconBackgroundColor }]}>
        <HabitIcon value={habit.emoji} color={habitIconColor} size={21} />
      </View>

      <View style={styles.rowText}>
        <View style={styles.nameRow}>
          <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.nameText}>
            {habit.name}
          </AppText>
          {inGroup ? <Icon name="friends" size={14} color={palette.muted} weight="bulk" /> : null}
        </View>
        <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.subtitleText}>
          {subtitle}
        </AppText>
      </View>

      {/* The hold-to-undo ring winds around whatever this slot is showing —
          the check or the segmented ring. It used to circle the habit's icon,
          which worked while that icon was a disc; around the rounded-square
          tile the icon wears now, a circle cuts straight through its corners.
          Here it also sits on the control the hold actually acts on. */}
      <View style={styles.trailing}>
        {isMultiple && !done ? (
          <View style={{ opacity: disabledActions ? 0.45 : 1 }}>
            <SegmentedRing total={target} filled={Math.min(count, target)} fillColor={habitAccentColor} />
          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale: badgeScale }] }}>
            <View
              style={[
                styles.check,
                {
                  backgroundColor: done ? checkFill : "transparent",
                  borderColor: done ? checkFill : checkEmptyBorder,
                  opacity: disabledActions && !done ? 0.45 : 1
                }
              ]}
            >
              {done ? <Icon name="check" size={12} color={checkGlyph} weight="bold" /> : null}
            </View>
          </Animated.View>
        )}
        {canUndoCompletion && holdProgress ? (
          <HoldProgressRing progress={holdProgress} size={36} stroke={2.5} color={holdRingColor} trackColor={alpha(holdRingColor, "24")} />
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * One row's hold-to-undo plumbing, plus the hairline that separates it from
 * the row above.
 *
 * There is no enter/exit animation here any more. Ticking a habit used to send
 * its row to the bottom of the list, and this shell existed to fade and
 * collapse it out of one position and spring it into the other. Rows now stay
 * where they are, so the whole apparatus went with the reordering — a habit's
 * place in the list is a fixed landmark, and moving it under the reader's
 * finger the moment they tapped it was the opposite of that.
 */
function QuickHabitRow({
  children,
  divided
}: {
  children: (holdControls: { onHoldEnd: () => void; onHoldStart: () => void; holdProgress: Animated.Value }) => React.ReactNode;
  /** Draws the hairline above this row (every row but the first). */
  divided: boolean;
}) {
  const { palette } = useLumo();
  const holdProgress = React.useRef(new Animated.Value(0)).current; // 0 idle -> 1 hold complete

  const handleHoldStart = React.useCallback(() => {
    holdProgress.stopAnimation();
    // Hold the ring hidden for the reveal delay, then fill over the remaining
    // time so it reaches full exactly as the long-press fires.
    Animated.timing(holdProgress, {
      toValue: 1,
      delay: HOLD_REVEAL_DELAY_MS,
      duration: UNDO_HOLD_DURATION_MS - HOLD_REVEAL_DELAY_MS,
      easing: Easing.linear,
      useNativeDriver: false
    }).start();
  }, [holdProgress]);

  const handleHoldEnd = React.useCallback(() => {
    holdProgress.stopAnimation();
    Animated.timing(holdProgress, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [holdProgress]);

  return (
    <View style={divided ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha(palette.hairline, "80") } : null}>
      {children({ onHoldEnd: handleHoldEnd, onHoldStart: handleHoldStart, holdProgress })}
    </View>
  );
}

/** Shown inside the card when nothing is scheduled for the selected day. */
function RestDayState() {
  const { palette } = useLumo();

  return (
    <View style={styles.restState}>
      <LumoMascot mood="happy" width={96} />
      <AppText variant="titleSmall" color={palette.ink} style={styles.restTitle}>
        Nothing scheduled
      </AppText>
      <AppText variant="bodySmall" color={palette.subtle} style={styles.restBody}>
        Enjoy the breather — rest is part of the routine.
      </AppText>
    </View>
  );
}

/**
 * The day's habits as one panel: a heading with the done count, then a divided
 * list of rows. Tap a row to complete it; hold a completed one to undo.
 *
 * Completed habits drop to the bottom of the same list rather than into a
 * separate section — the order IS the state.
 */
export function QuickDoneWidgets({ habits, dateKey = toDateKey(), disabledActions = false, groupHabitIds, title = "Today's Habits" }: Props) {
  const { palette } = useLumo();
  const doneCount = habits.filter((habit) => isDoneOnDate(habit, dateKey)).length;

  return (
    <Card style={styles.listCard}>
      <View style={styles.listHeader}>
        <AppText color={palette.ink} numberOfLines={1} style={styles.listTitle}>
          {title}
        </AppText>
        {habits.length > 0 ? (
          <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.listCount}>
            <AppText variant="caption" color={palette.ink} style={styles.listCountValue}>
              {doneCount}
            </AppText>{" "}
            of {habits.length} done
          </AppText>
        ) : null}
      </View>

      {habits.length === 0 ? (
        <RestDayState />
      ) : (
        // No gap between rows — the hairline IS the separator, and a gap on top
        // of it would be two spacings doing the same job.
        <View>
          {habits.map((habit, index) => (
            <QuickHabitRow key={habit.id} divided={index > 0}>
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
            </QuickHabitRow>
          ))}
        </View>
      )}

      {/* Full iOS WidgetKit or Android widget support would bridge these same
          completion actions through a native extension, shared storage, and
          deep-link reconciliation back into the Expo app. */}
    </Card>
  );
}

const styles = StyleSheet.create({
  // The rows carry their own vertical padding and run edge to edge inside the
  // card, so the card only insets horizontally.
  listCard: {
    paddingHorizontal: spacing.ml,
    paddingTop: spacing.md,
    // The last row brings its own 12pt, so this adds 12 on top of it — landing
    // on 24 under the final habit against the 16 above the header. The asymmetry
    // is deliberate: the list ends here, and a flush bottom edge made the last
    // habit look clipped against the card boundary.
    //
    // Taken off the card rather than off that row, because zeroing or growing
    // one row's padding makes its icon sit off-centre against every other
    // row's 12/12.
    paddingBottom: spacing.sm,
    gap: spacing.xs
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: 28
  },
  // A step under the app's section-heading size. This heading sits INSIDE the
  // card it names rather than above a group of them, so at the full heading
  // step it outweighed the habit names underneath it.
  listTitle: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendBold,
    fontSize: 14,
    lineHeight: 19
  },
  listCount: {
    flexShrink: 0,
    fontFamily: fontFamilies.lexendMedium
  },
  listCountValue: {
    fontFamily: fontFamilies.lexendBold
  },
  restState: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.ml
  },
  restTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    marginTop: spacing.xs
  },
  restBody: {
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 20
  },
  widgetRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  widgetIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center"
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs
  },
  // 14/21 over a 12/16 caption — the same pair the habits list uses for its
  // rows. This card was running its names a full step larger, so the two lists
  // of the same habits did not look like the same kind of list.
  nameText: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 14,
    lineHeight: 21
  },
  subtitleText: {
    fontSize: 12,
    lineHeight: 16
  },
  // Sized to the hold ring it hosts, so the ring's absolute fill centres on the
  // check inside it rather than on a box the check happens to sit in. Kept at
  // 36 rather than dropping with the check, because the segmented ring that
  // shares this slot is 30 across and needs the room.
  trailing: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center"
  }
});
