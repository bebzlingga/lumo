import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, AppState, Modal, PanResponder, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { FocusDial } from "@/components/FocusDial";
import { Icon } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusBar } from "expo-status-bar";
import { AppText, LumoInput, Screen } from "@/components/ui";
import { FOCUS_ACTIVITIES, activityAccent, focusActivity } from "@/constants/focusActivities";
import { END_SOUND_IDS, END_SOUNDS, SOUNDS_READY, endSoundLabel, soundLabel, soundsForTheme } from "@/constants/sounds";
import { CTA_FILL, fontFamilies, getPalette, habitAccent, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha, contrastRatio, readableOn, shadeWithBlack } from "@/lib/color";
import { toDateKey } from "@/lib/date";
import { lockLandscape, lockPortrait } from "@/lib/orientation";
import {
  addTask,
  clearFinished,
  clearHistory,
  describeRemaining,
  doneCount,
  emptyFocusState,
  endSession,
  formatRemaining,
  isFinished,
  isPaused,
  minutesToMs,
  normalizeFocusState,
  pauseSession,
  progress,
  remainingMs,
  removeTask,
  resumeSession,
  setActivity,
  setBackgroundSound,
  setDuration,
  setEndSound,
  setTaskDone,
  startSession,
  formatTotal,
  type FocusRecord,
  type FocusState,
  type FocusTask
} from "@/lib/focus";
import { completionCount, dailyTarget, isDoneOnDate, isScheduledOnDate } from "@/lib/habitMath";

/**
 * Its own key, NOT the `@lumo/state/v1` blob — that one is rewritten in full on
 * every change, so a running countdown living there would re-serialize every
 * habit, completion and journal entry each second. Written on state transitions
 * only (choose, tick, start, pause, end); never on a tick of the clock.
 */
const STORAGE_KEY = "@lumo/tools/focus";

/** Repaint cadence while running. The clock is `Date.now()`; this only redraws. */
const TICK_MS = 500;

const CHECK_SIZE = 22;
/**
 * How long focus mode's controls stay up before hiding again.
 *
 * Long enough to read the row and choose, short enough that the screen returns
 * to being just a number without anyone having to dismiss anything.
 */
const CONTROLS_HIDE_MS = 6_000;
/** Focus mode's only inset, and what the clock's size is derived from. */
const MODE_PADDING = 24;
/** Activity card width. Shared by the style and the strip's snap interval. */
const ACTIVITY_WIDTH = 84;


/**
 * The advice worth giving about a focus timer, and not a word more. Every line
 * is something that changes what the user does next — general encouragement is
 * what makes this kind of screen get skipped.
 */
const FOCUS_TIPS = [
  {
    title: "Pick a length you will finish",
    body: "A 25 you complete beats a 60 you abandon. You can always start another."
  },
  {
    title: "Decide what done looks like first",
    body: "List it before you start. Choosing what to do next is the part that eats a session."
  },
  {
    title: "Then put the phone down",
    body: "The countdown keeps running with the screen off, so there is nothing here worth watching."
  },
  {
    title: "Let distractions wait",
    body: "Something will come to mind. Add it to the list and carry on rather than chasing it."
  },
  {
    title: "Take the break you earn",
    body: "Attention recovers in the gaps, not during. Stopping on time is what makes the next block possible."
  }
] as const;

type Picker = "background" | "end" | null;

/**
 * What Focus is for, and how to get more out of it.
 *
 * A dialog rather than a screen: it is read once, and pushing a route for it
 * would put a back stack between someone and the timer they came to start.
 */
function FocusInfoDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette, isDark } = useLumo();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: alpha(palette.shadow, isDark ? "B3" : "80") }]}>
        <View style={[styles.sheet, { backgroundColor: palette.card }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
            <AppText color={palette.ink} style={styles.sheetTitle}>
              How Focus works
            </AppText>

            <AppText variant="bodySmall" color={palette.body} style={styles.sheetParagraph}>
              One block of protected time, against one kind of work. The timer is not here to make you faster — it is here to make
              starting easier and stopping deliberate, which is the part most days get wrong.
            </AppText>

            <View style={styles.tips}>
              {FOCUS_TIPS.map((tip, index) => (
                <View key={tip.title} style={styles.tip}>
                  {/* The heading carries the colour instead of a bullet beside
                      it — the green is what separates one tip from the next, so
                      nothing extra has to sit in the margin to do that job.

                      Numbered because these do run in order: you pick a length
                      before you fill the list, and you take the break after
                      the block rather than instead of it. */}
                  <AppText variant="bodySmall" color={palette.greenDark} style={styles.tipTitle}>
                    {index + 1}. {tip.title}
                  </AppText>
                  <AppText variant="caption" color={palette.subtle} style={styles.tipBody}>
                    {tip.body}
                  </AppText>
                </View>
              ))}
            </View>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={({ pressed }) => [styles.sheetClose, { backgroundColor: CTA_FILL, opacity: pressed ? 0.88 : 1 }]}
          >
            <AppText variant="button" color={palette.white}>
              Got it
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * "Today, 3:42 PM" for a recent session, the date for an older one.
 *
 * Relative for the last two days because that is the window where "yesterday"
 * is more use than a date, and absolute beyond it because "5 days ago" is not.
 */
function formatRecordWhen(endedAt: number): string {
  const when = new Date(endedAt);
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const dayKey = toDateKey(when);
  const today = toDateKey();

  if (dayKey === today) {
    return `Today, ${time}`;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (dayKey === toDateKey(yesterday)) {
    return `Yesterday, ${time}`;
  }

  return `${when.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

/**
 * Every session that has been finished, newest first.
 *
 * Shows what was actually focused rather than what was planned — a block
 * stopped at twelve minutes reads as twelve, with the planned length beside it
 * so the difference is visible instead of quietly rounded away.
 */
function FocusHistoryDialog({
  visible,
  history,
  onClear,
  onClose
}: {
  visible: boolean;
  history: FocusRecord[];
  onClear: () => void;
  onClose: () => void;
}) {
  const { palette, isDark } = useLumo();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: alpha(palette.shadow, isDark ? "B3" : "80") }]}>
        <View style={[styles.sheet, styles.sheetHistory, { backgroundColor: palette.card }]}>
          <View style={styles.historyHeader}>
            <AppText color={palette.ink} style={styles.sheetTitle}>
              Focus history
            </AppText>
            {/* Close lives in the header rather than as a button under the list:
                a dialog that is read rather than answered wants dismissing out
                of the way, not occupying the position a primary action would. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [styles.historyClose, { borderColor: palette.hairline, opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="close" size={16} color={palette.subtle} weight="bold" />
            </Pressable>
          </View>

          {history.length === 0 ? (
            <AppText variant="bodySmall" color={palette.subtle} style={styles.sheetParagraph}>
              Nothing yet. Finish a session and it will be listed here.
            </AppText>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.historyList}>
                {history.map((record, index) => {
                  const activity = focusActivity(record.activity);
                  const swatch = activityAccent(activity, isDark);
                  // Only worth saying when it differs from what was focused —
                  // on a completed block the two are the same number twice.
                  const short = !record.finished;

                  return (
                    <View
                      key={record.id}
                      style={[
                        styles.historyRow,
                        // Hairline UNDER each row except the last: a rule below
                        // the final entry would read as the start of another
                        // one, and there is nothing after it.
                        index < history.length - 1
                          ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: alpha(palette.hairline, "80") }
                          : null
                      ]}
                    >
                      <View style={[styles.historyIcon, { backgroundColor: alpha(activity.color, isDark ? "2E" : "24") }]}>
                        <Icon name={activity.icon} size={16} color={readableOn(swatch, palette.card, 3)} weight="bulk" />
                      </View>
                      <View style={styles.historyText}>
                        <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.historyTitle}>
                          {activity.label}
                        </AppText>
                        <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.historyMeta}>
                          {formatRecordWhen(record.endedAt)}
                          {record.ticked > 0 ? ` · ${record.ticked} ticked` : ""}
                        </AppText>
                      </View>
                      <View style={styles.historyAmount}>
                        <AppText variant="bodySmall" color={palette.ink} style={styles.historyTitle}>
                          {formatTotal(record.focusedMs)}
                        </AppText>
                        {short ? (
                          <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.historyMeta}>
                            of {formatTotal(record.plannedMs)}
                          </AppText>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
            </ScrollView>
          )}

          {history.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear focus history"
              onPress={() =>
                Alert.alert("Clear history?", "This removes every recorded session. It cannot be undone.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Clear", style: "destructive", onPress: onClear }
                ])
              }
              style={({ pressed }) => [
                styles.historyClear,
                { backgroundColor: alpha(palette.danger, isDark ? "24" : "14"), opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <AppText variant="button" color={palette.danger}>
                Clear history
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export default function FocusScreen() {
  const router = useRouter();
  const { palette, isDark, themeId, habits, completeHabit } = useLumo();

  const [state, setState] = React.useState<FocusState>(emptyFocusState);
  const [hydrated, setHydrated] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [now, setNow] = React.useState(() => Date.now());
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [picker, setPicker] = React.useState<Picker>(null);
  const [showInfo, setShowInfo] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  /** True while the dial is being swept — locks the page so it cannot scroll. */
  const [draggingDial, setDraggingDial] = React.useState(false);
  /** Landscape, full-bleed, everything but the clock and the list stripped out. */
  const [focusMode, setFocusMode] = React.useState(false);
  /**
   * Focus mode's two looks, toggled by a swipe.
   *
   * False draws the time in the activity's colour on a dark ground; true
   * interchanges them — the ground takes the colour and the time takes the
   * dark. Which one reads better depends entirely on the room, which is why it
   * is a gesture rather than a setting nobody would go and find.
   */
  const [modeInverted, setModeInverted] = React.useState(false);
  /** Focus mode's controls, which hide themselves again after a few seconds. */
  const [controlsShown, setControlsShown] = React.useState(false);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (active && raw) {
          setState(normalizeFocusState(JSON.parse(raw)));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!hydrated) {
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [hydrated, state]);

  const session = state.session;
  const ticking = session !== null && !isPaused(session) && !isFinished(session, now);

  // Only ticks while the countdown is going. A paused or finished session has
  // nothing to repaint, and an interval left running there is battery spent
  // redrawing the same frame.
  React.useEffect(() => {
    if (!ticking) {
      return;
    }

    const id = setInterval(() => setNow(Date.now()), TICK_MS);

    return () => clearInterval(id);
  }, [ticking]);

  // The clock kept going while the app was suspended; this is what makes the
  // remaining time correct on return rather than frozen where it left off.
  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        setNow(Date.now());
      }
    });

    return () => subscription.remove();
  }, []);

  /**
   * The screen wears the colour of whatever it is being used for.
   *
   * Two values, because one hue cannot do both jobs. `accent` is the activity's
   * colour walked until WHITE text on it clears 4.5:1 — brand.gold as a filled
   * button under a white label is about 1.9:1 and unreadable, so the raw swatch
   * can never be a fill. `accentSoft` is the same hue as a wash, for chips and
   * tinted surfaces where nothing sits on top.
   *
   * While a session runs the colour comes from the SESSION, not the current
   * selection: changing the picker underneath a running countdown should not
   * repaint the thing already in progress.
   */
  const activeActivity = focusActivity(session ? session.activity : state.activity);
  // The habit palette's own accent for this swatch, then walked only if a white
  // label on it would not clear 4.5:1 — most swatches already do, so this is a
  // guard rather than a transformation.
  const accent = readableOn(activityAccent(activeActivity, isDark), palette.white, 4.5);
  const accentSoft = alpha(activeActivity.color, isDark ? "2E" : "1F");

  const finished = session !== null && isFinished(session, now);
  // Fires once per completed session: the ref is what stops a re-render at the
  // same instant from buzzing twice.
  const celebratedRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!finished || !session || celebratedRef.current === session.endsAt) {
      return;
    }

    celebratedRef.current = session.endsAt;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [finished, session]);

  /**
   * Focus mode owns the device orientation while it is open.
   *
   * The cleanup is not optional: leaving the app pinned to landscape after this
   * screen unmounts would tip every other screen over, and the root layout's
   * portrait lock only runs once at startup. So this restores it on exit AND on
   * unmount — including the unmount that happens if the session ends from
   * somewhere else.
   */
  React.useEffect(() => {
    if (!focusMode) {
      return;
    }

    lockLandscape();

    return () => {
      lockPortrait();
    };
  }, [focusMode]);

  // A session that ends while in focus mode drops back to portrait rather than
  // leaving the setup screen sideways.
  React.useEffect(() => {
    if (!session) {
      setFocusMode(false);
    }
  }, [session]);

  /**
   * Swipe up or down in focus mode to interchange the time and background.
   *
   * Only claims the responder on MOVE, and only past a threshold — so a tap
   * still reaches the Pressable underneath and closes the mode. A responder
   * that claimed on start would swallow every tap and leave no way out.
   */
  const modeSwipe = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_event, gesture) => {
          if (Math.abs(gesture.dy) < 40) {
            return;
          }

          // Either direction toggles: with two looks there is no "next" and
          // "previous" worth distinguishing, and a swipe that does nothing in
          // one direction reads as a broken gesture.
          setModeInverted((current) => !current);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        }
      }),
    []
  );

  const clearHideTimer = React.useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  /**
   * Shows the focus-mode controls and restarts their countdown to hiding.
   *
   * Called on every button press, not just the first: pressing one while they
   * are already up has to push the deadline out, or the row disappears from
   * under a finger that is still using it.
   */
  const revealControls = React.useCallback(() => {
    setControlsShown(true);
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      // Clears its own handle as well as hiding: a fired timeout that leaves a
      // stale ref behind makes the ref a liar about whether anything is pending.
      hideTimerRef.current = null;
      setControlsShown(false);
    }, CONTROLS_HIDE_MS);
  }, [clearHideTimer]);

  /**
   * What a tap on the screen does: shows the controls, or hides them again if
   * they are already up.
   *
   * A tap that only ever revealed left no way to dismiss them early — you had
   * to wait out the timer while the row sat over a screen whose whole point is
   * having nothing on it.
   */
  const toggleControls = React.useCallback(() => {
    // Reads the STATE, not the timer handle. Whether a timeout is pending is a
    // different question from whether the row is on screen, and the two come
    // apart the moment one fires.
    if (controlsShown) {
      setControlsShown(false);
      clearHideTimer();
      return;
    }

    revealControls();
  }, [controlsShown, clearHideTimer, revealControls]);

  // Leaving focus mode by any route drops the pending timer and resets the
  // controls, so re-entering starts clean rather than mid-countdown.
  React.useEffect(() => {
    if (focusMode) {
      return;
    }

    setControlsShown(false);
    clearHideTimer();
  }, [focusMode, clearHideTimer]);

  React.useEffect(() => () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
  }, []);

  const dateKey = toDateKey();

  /** Today's habits not already on the list. */
  const habitOptions = React.useMemo(() => {
    const taken = new Set(state.tasks.map((task) => task.habitId).filter(Boolean));

    return habits.filter((habit) => isScheduledOnDate(habit, dateKey) && !taken.has(habit.id));
  }, [habits, state.tasks, dateKey]);

  function stamp() {
    const at = Date.now();
    setNow(at);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    return at;
  }

  /**
   * Ticking a task, and — when it came from a habit — checking that habit off.
   *
   * `completeHabit` INCREMENTS rather than sets, so an unguarded call on a
   * "3 times a day" habit would quietly add a completion the user never did.
   * Guarding on `isDoneOnDate` is the same rule QuickDoneWidgets applies.
   *
   * Un-ticking never calls `undoHabit`. Deleting a real completion from the
   * user's history because they unticked a row in a timer is a far bigger claim
   * than the tap makes.
   */
  function handleToggleDone(task: FocusTask) {
    const next = !task.done;

    setState((current) => setTaskDone(current, task.id, next));

    if (next) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }

    if (!next || !task.habitId) {
      return;
    }

    const habit = habits.find((item) => item.id === task.habitId);

    if (habit && !isDoneOnDate(habit, dateKey)) {
      completeHabit(habit.id, dateKey);
    }
  }

  /**
   * The checklist, shared by setup and the running screen.
   *
   * A plain function called as `{renderTasks()}`, NOT a component rendered as
   * `<TaskList />`. Declaring a component inside another gives it a fresh
   * identity on every render, so React would unmount and remount the whole list
   * each tick — here, every 500ms while the clock runs.
   */
  function renderTasks(compact = false) {
    /**
     * Ticking belongs to a running session.
     *
     * Before Start the list is a plan, and marking something done there would
     * either be a lie or would check a linked habit off for work nobody has
     * done yet. The rows still show and can be added to and removed — only the
     * tick is held back.
     */
    const canTick = session !== null;

    return (
      <View style={styles.list}>
        {state.tasks.map((task, index) => {
          const habit = task.habitId ? habits.find((item) => item.id === task.habitId) : undefined;
          // A "3 times a day" habit ticked once is at 1/3, not done — the badge
          // says so rather than a bare "Habit" that implies the goal is met.
          const target = habit ? dailyTarget(habit) : 1;
          const badge = habit ? (target > 1 ? `${Math.min(completionCount(habit, dateKey), target)}/${target}` : "Habit") : null;

          return (
            <View
              key={task.id}
              style={[
                styles.row,
                compact ? styles.rowCompact : null,
                // Hairline between rows rather than a card each: a checklist is
                // one list, and five stacked cards read as five separate things
                // that happen to be near each other.
                index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha(palette.hairline, "80") } : null
              ]}
            >
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.done, disabled: !canTick }}
                accessibilityLabel={badge ? `${task.title}, ${badge}` : task.title}
                accessibilityHint={canTick ? undefined : "Start the session to tick this off"}
                disabled={!canTick}
                hitSlop={12}
                onPress={() => handleToggleDone(task)}
                style={[
                  styles.check,
                  {
                    backgroundColor: task.done ? accent : "transparent",
                    borderColor: task.done ? accent : alpha(accent, "4D"),
                    // Dimmed rather than hidden, so the row still reads as
                    // something that WILL be tickable once the clock starts.
                    opacity: canTick ? 1 : 0.4
                  }
                ]}
              >
                {task.done ? <Icon name="check" size={12} color={palette.white} weight="bold" /> : null}
              </Pressable>

              <View style={styles.rowTitleLine}>
                <AppText
                  variant="bodySmall"
                  color={task.done ? palette.muted : palette.ink}
                  numberOfLines={2}
                  style={styles.rowTitle}
                >
                  {task.title}
                </AppText>
                {/* Beside the title, not under it: it qualifies the name rather
                    than being a second line about the task. Never shrinks — the
                    title is what yields when a name runs long. */}
                {badge ? (
                  <View style={[styles.habitBadge, { backgroundColor: alpha(accent, "1F") }]}>
                    <AppText variant="caption" color={accent} numberOfLines={1} style={styles.habitBadgeText}>
                      {badge}
                    </AppText>
                  </View>
                ) : null}
              </View>

              {/* Removal stays on the setup screen. Mid-session the list is a
                  checklist, and a delete target beside every row is an easy
                  mis-tap that silently loses what you meant to do next. */}
              {!compact ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${task.title}`}
                  hitSlop={10}
                  onPress={() => setState((current) => removeTask(current, task.id))}
                  style={({ pressed }) => [styles.rowAction, { opacity: pressed ? 0.5 : 1 }]}
                >
                  <Icon name="close" size={14} color={palette.muted} weight="bold" />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }

  // ---- Focus mode: the time, and nothing else ---------------------------
  if (session && focusMode) {
    const left = remainingMs(session, now);
    const modePaused = isPaused(session);
    const activity = focusActivity(session.activity);

    /**
     * Focus mode always runs dark, whatever the app is set to.
     *
     * A bright screen propped on a desk for twenty-five minutes is a lamp
     * pointed at the person using it, and the whole point of this mode is to
     * stop competing for attention. Takes the CURRENT theme's dark palette
     * rather than a fixed black, so the session still looks like the app.
     */
    const modePalette = getPalette(themeId, true);
    /**
     * Darker than the app's own dark canvas.
     *
     * Dark mode is tuned for a phone in a lit room reading lists; this is a
     * number stared at across a desk for half an hour, and the less light the
     * screen throws the better it does that job. Shaded from the theme's canvas
     * rather than set to black, so it still carries the theme's hue.
     */
    const modeCanvas = shadeWithBlack(modePalette.canvas, 0.55);
    // Walked against the canvas it actually sits on, not white — the accent
    // here is read AS text on a dark ground, which is the opposite of the
    // filled-button case the portrait screen's `accent` is tuned for.
    const modeAccent = readableOn(activityAccent(activity, true), modeCanvas, 4.5);
    // The interchange. `modeAccent` already clears 4.5:1 against the canvas, and
    // contrast is symmetric, so swapping the two is legible by construction —
    // no second walk needed.
    const modeText = modeInverted ? modeCanvas : modeAccent;
    const modeBackground = modeInverted ? modeAccent : modeCanvas;
    /**
     * The controls are plain chrome, not part of the colour scheme: white on a
     * dark ground, dark on a light one.
     *
     * Chosen by measuring rather than by branching on `modeInverted`, so it
     * still lands correctly for a theme whose accent is dark enough that the
     * inverted ground is not actually light.
     */
    const modeChrome =
      contrastRatio(palette.white, modeBackground) >= contrastRatio(modeCanvas, modeBackground) ? palette.white : modeCanvas;

    /**
     * As large as the screen can carry, bounded on BOTH axes.
     *
     * Width sets the ceiling in portrait, height in landscape — there is width
     * to spare there, and a number sized to it would run off the top and
     * bottom.
     *
     * 2.65 is the measure: "25:00" is four digits at roughly 0.55em plus a
     * colon near 0.3, so 2.5em is the true width — this rounds it up a little
     * so the number keeps a margin rather than reaching the padding exactly.
     * The longest value this can ever show is "90:00", so five characters is
     * the real worst case.
     */
    const byWidth = (windowWidth - MODE_PADDING * 2) / 2.65;
    const modeClockSize = Math.max(48, Math.floor(Math.min(byWidth, windowHeight * 0.62)));

    return (
      // No safe-area edges and no chrome: the number is centred, so nothing can
      // collide with a notch, and every inset would only shrink it.
      <Screen scroll={false} contentStyle={styles.modeContent} edges={[]} backgroundVariant={null} background={modeBackground}>
        <StatusBar hidden />

        {/* The clock fills the screen and takes the swipe. No tap handler on it
            any more: tapping to close fought the swipe, and a stray flick that
            ended the mode was worse than having no shortcut at all. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${activity.label}, ${describeRemaining(left)}${modePaused ? ", paused" : ""}`}
          accessibilityHint="Tap to show or hide the controls. Swipe up or down to swap the time and background colours"
          onPress={toggleControls}
          style={styles.modeTap}
          {...modeSwipe.panHandlers}
        >
          <AppText
            color={modeText}
            numberOfLines={1}
            style={[styles.modeClock, { fontSize: modeClockSize, lineHeight: modeClockSize * 1.12 }]}
          >
            {formatRemaining(left)}
          </AppText>
        </Pressable>

        {/* Overlaid top-centre rather than laid out: the clock is centred on the
            whole screen, and putting these in the layout would shove it down.
            Drawn in the time's own colour at low weight so they read as
            available without ever competing with it. */}
        {controlsShown ? (
          <View style={styles.modeOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap the time and background colours"
            hitSlop={8}
            onPress={() => {
              revealControls();
              setModeInverted((current) => !current);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            }}
            style={({ pressed }) => [styles.modeOverlayButton, { borderColor: alpha(modeChrome, "40"), opacity: pressed ? 1 : 0.55 }]}
          >
            <Icon name="colorFilter" size={16} color={modeChrome} weight="bold" />
          </Pressable>

          {!finished ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={modePaused ? "Resume" : "Pause"}
              hitSlop={8}
              onPress={() => {
                revealControls();
                const at = stamp();
                setState((current) => (modePaused ? resumeSession(current, at) : pauseSession(current, at)));
              }}
              style={({ pressed }) => [
                styles.modeOverlayButton,
                styles.modeOverlayPrimary,
                { borderColor: alpha(modeChrome, "40"), opacity: pressed ? 1 : 0.55 }
              ]}
            >
              <Icon name={modePaused ? "play" : "pause"} size={22} color={modeChrome} weight="fill" />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Leave focus mode"
            hitSlop={8}
            onPress={() => setFocusMode(false)}
            style={({ pressed }) => [styles.modeOverlayButton, { borderColor: alpha(modeChrome, "40"), opacity: pressed ? 1 : 0.55 }]}
          >
            {/* eyeSlash, not close: this leaves focus MODE and returns to the
                session, it does not end anything. An ✕ beside a running timer
                reads as "stop", which is the one thing it must not mean. */}
            <Icon name="eyeSlash" size={16} color={modeChrome} weight="bold" />
          </Pressable>
          </View>
        ) : null}
      </Screen>
    );
  }

  // ---- Running: the session owns the screen -----------------------------
  if (session) {
    const left = remainingMs(session, now);
    const paused = isPaused(session);
    const activity = focusActivity(session.activity);

    return (
      <Screen scroll={false} contentStyle={styles.runningContent} backgroundIntensity="medium">
        <View style={styles.runningDial}>
          <FocusDial minutes={state.durationMinutes} progress={1 - progress(session, now)} accent={accent} stroke={30}>
            {/* Grouped and labelled in words: VoiceOver reads "18:42" as a time
                of day, and split across nodes the number arrives with no
                relationship to what it counts. */}
            <View accessible accessibilityLabel={finished ? `${activity.label} session complete` : `${activity.label}, ${describeRemaining(left)}${paused ? ", paused" : ""}`}>
              <AppText color={accent} numberOfLines={1} style={[styles.clock, styles.clockRunning]}>
                {formatRemaining(left)}
              </AppText>
            </View>
            <AppText variant="caption" color={finished ? accent : paused ? palette.subtle : palette.subtle} style={styles.clockState}>
              {finished ? "Done" : paused ? "Paused" : activity.label}
            </AppText>
          </FocusDial>
        </View>

        {state.tasks.length > 0 ? (
          <ScrollView style={styles.runningList} contentContainerStyle={styles.runningListContent} showsVerticalScrollIndicator={false}>
            {renderTasks(true)}
          </ScrollView>
        ) : (
          <View style={styles.runningList} />
        )}

        <View style={styles.runningActions}>
          {/* Focus mode sits LEFT of the primary, where End used to. Both are
              things you might reach for mid-session, but only one of them stops
              the clock — and the one that does should not be the easy tap
              beside Pause. Outlined rather than bare text, so it reads as a
              button next to a filled one. */}
          {!finished ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enter focus mode"
              onPress={() => setFocusMode(true)}
              style={({ pressed }) => [styles.outlined, { borderColor: palette.hairlineStrong, opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="eye" size={16} color={palette.subtle} weight="bulk" />
              <AppText variant="button" color={palette.subtle}>
                Focus mode
              </AppText>
            </Pressable>
          ) : null}

          {!finished ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={paused ? "Resume" : "Pause"}
              onPress={() => {
                const at = stamp();
                setState((current) => (paused ? resumeSession(current, at) : pauseSession(current, at)));
              }}
              style={({ pressed }) => [styles.primary, { backgroundColor: accent, opacity: pressed ? 0.88 : 1 }]}
            >
              <Icon name={paused ? "play" : "pause"} size={18} color={palette.white} weight="fill" />
              <AppText variant="button" color={palette.white}>
                {paused ? "Resume" : "Pause"}
              </AppText>
            </Pressable>
          ) : null}

          {/* Finished has no pair to sit beside, so Done takes the row alone. */}
          {finished ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Finish"
              onPress={() => {
                const at = stamp();
                celebratedRef.current = null;
                setState((current) => endSession(current, at));
              }}
              style={({ pressed }) => [styles.primary, styles.primaryWide, { backgroundColor: accent, opacity: pressed ? 0.88 : 1 }]}
            >
              <AppText variant="button" color={palette.white}>
                Done
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {/* End is the quiet one now: ending a session is deliberate, and it
            should take a moment's aim rather than sitting under the thumb. */}
        {!finished ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="End this focus session"
            onPress={() => {
              const at = stamp();
              celebratedRef.current = null;
              setState((current) => endSession(current, at));
            }}
            style={({ pressed }) => [styles.modeEnter, { opacity: pressed ? 0.6 : 1 }]}
          >
            <AppText variant="caption" color={palette.subtle}>
              End session
            </AppText>
          </Pressable>
        ) : null}
      </Screen>
    );
  }

  // ---- Setup ------------------------------------------------------------
  const backgroundOptions = soundsForTheme(themeId);
  const finishedTasks = doneCount(state);

  return (
    <Screen contentStyle={styles.content} scrollEnabled={!draggingDial} scrollRef={pageRef}>
      <FocusInfoDialog visible={showInfo} onClose={() => setShowInfo(false)} />
      <FocusHistoryDialog
        visible={showHistory}
        history={state.history}
        onClear={() => setState((current) => clearHistory(current))}
        onClose={() => setShowHistory(false)}
      />

      <ScreenHeader
        title="Focus"
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        rightActions={[
          { icon: "question", label: "How Focus works", onPress: () => setShowInfo(true) },
          { icon: "clock", label: "Focus history", onPress: () => setShowHistory(true) }
        ]}
      />


      <View style={styles.dialWrap}>
        <FocusDial
          minutes={state.durationMinutes}
          onChange={(minutes) => setState((current) => setDuration(current, minutes))}
          accent={accent}
          onDragChange={setDraggingDial}
        >
          <AppText color={accent} style={styles.clock}>
            {formatRemaining(minutesToMs(state.durationMinutes))}
          </AppText>
        </FocusDial>
      </View>


      {/* Both sound choices on one card, split down the middle — they are the
          same kind of decision made twice, and two separate cards would imply
          otherwise. */}
      {SOUNDS_READY ? (
        <View style={[styles.soundCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Background sound: ${soundLabel(state.backgroundSoundId) ?? "None"}`}
            onPress={() => setPicker(picker === "background" ? null : "background")}
            style={({ pressed }) => [styles.soundHalf, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Icon name="moon" size={18} color={accent} weight="bulk" />
            <View style={styles.soundText}>
              <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                Background sound
              </AppText>
              <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.soundValue}>
                {soundLabel(state.backgroundSoundId) ?? "None"}
              </AppText>
            </View>
          </Pressable>
          <View style={[styles.soundDivider, { backgroundColor: palette.hairline }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Focus end sound: ${endSoundLabel(state.endSoundId) ?? "None"}`}
            onPress={() => setPicker(picker === "end" ? null : "end")}
            style={({ pressed }) => [styles.soundHalf, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Icon name="notifications" size={18} color={accent} weight="bulk" />
            <View style={styles.soundText}>
              <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                Focus end sound
              </AppText>
              <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.soundValue}>
                {endSoundLabel(state.endSoundId) ?? "None"}
              </AppText>
            </View>
          </Pressable>
        </View>
      ) : null}

      {picker ? (
        <View style={styles.chips}>
          {(picker === "background"
            ? [{ id: null as string | null, label: "None" }, ...backgroundOptions]
            : [{ id: null as string | null, label: "None" }, ...END_SOUND_IDS.map((id) => ({ id, label: END_SOUNDS[id].label }))]
          ).map((option) => {
            const current = picker === "background" ? state.backgroundSoundId : state.endSoundId;
            const selected = current === option.id;

            return (
              <Pressable
                key={option.id ?? "none"}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                onPress={() => {
                  setState((currentState) =>
                    picker === "background" ? setBackgroundSound(currentState, option.id) : setEndSound(currentState, option.id)
                  );
                  setPicker(null);
                }}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: selected ? accentSoft : palette.surface,
                    borderColor: selected ? accent : palette.hairline,
                    opacity: pressed ? 0.75 : 1
                  }
                ]}
              >
                <AppText variant="caption" color={selected ? accent : palette.body} numberOfLines={1}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Start a ${state.durationMinutes} minute ${focusActivity(state.activity).label} session`}
        onPress={() => {
          const at = stamp();
          celebratedRef.current = null;
          setState((current) => startSession(current, at));
        }}
        style={({ pressed }) => [styles.start, { backgroundColor: accent, opacity: pressed ? 0.88 : 1 }]}
      >
        <Icon name="play" size={18} color={palette.white} weight="fill" />
        <AppText variant="button" color={palette.white}>
          Start Focus
        </AppText>
      </Pressable>

      {/* Below Start, not above it: the dial and the button are the whole flow
          for most sessions, and the category is a thing you set once and rarely
          revisit — putting it in the middle made you scroll past a decision you
          had already made.

          Unlabelled — iconed cards with a tick on the selected one say what
          they are without a heading over them. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Snaps a card at a time so the row never rests with one sliced down
        // the middle. 84 wide plus the 8 gap.
        decelerationRate="fast"
        snapToInterval={ACTIVITY_WIDTH + spacing.xs}
        style={styles.activityScroll}
        contentContainerStyle={styles.activityRow}
      >
        {FOCUS_ACTIVITIES.map((activity) => {
          const selected = state.activity === activity.id;
          // Pastels vanish as a glyph on a light tile, so the sampled hue is
          // walked toward the surface's opposite only as far as 3:1 takes it.
          // Walked to 3:1 against the card. The habit palette's accents are tuned
          // to be sat ON as fills, not to be drawn as a glyph on near-white —
          // orange and coral both land nearer 2:1 there — so the hue is the
          // starting point and the walk is what makes it legible.
          const glyph = readableOn(activityAccent(activity, isDark), palette.card, 3);

          return (
            <Pressable
              key={activity.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={activity.label}
              onPress={() => setState((current) => setActivity(current, activity.id))}
              style={({ pressed }) => [
                styles.activity,
                {
                  backgroundColor: alpha(activity.color, isDark ? "24" : "1F"),
                  borderColor: selected ? accent : "transparent",
                  opacity: pressed ? 0.8 : 1
                }
              ]}
            >
              <Icon name={activity.icon} size={24} color={glyph} weight="bulk" />
              <AppText variant="caption" color={selected ? palette.ink : palette.body} numberOfLines={1} style={styles.activityLabel}>
                {activity.label}
              </AppText>
              {selected ? (
                <View style={[styles.activityCheck, { backgroundColor: accent, borderColor: palette.canvas }]}>
                  <Icon name="check" size={10} color={palette.white} weight="bold" />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Optional, and below Start on purpose: this is what you tick DURING the
          session, not a gate in front of it. */}
      <View style={styles.block}>
        <View style={styles.addRow}>
          <LumoInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add something to accomplish"
            returnKeyType="done"
            // Brings the field above the keyboard. The screen already reserves
            // the room via `automaticallyAdjustKeyboardInsets`, but reserving
            // room does not move the view — and this input is the last thing on
            // the page, so without the scroll it opens behind the keyboard.
            //
            // Deferred a frame: on focus the inset has not been applied yet, so
            // scrolling immediately lands short of the end.
            onFocus={() => requestAnimationFrame(() => pageRef.current?.scrollToEnd({ animated: true }))}
            onSubmitEditing={() => {
              setState((current) => addTask(current, draft));
              setDraft("");
            }}
            style={styles.addInput}
          />
          {/* Overlaid on the field rather than sitting beside it: the two are
              one control — type, then commit — and as separate elements the
              button read as a second, unrelated thing to press.

              The touch target spans the field's full height even though the
              disc is 36; a 36pt target at the end of a 52pt row is a small
              thing to hit with a thumb. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add something to accomplish"
            disabled={!draft.trim()}
            onPress={() => {
              setState((current) => addTask(current, draft));
              setDraft("");
            }}
            style={({ pressed }) => [styles.addButton, { opacity: !draft.trim() ? 0.35 : pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.addButtonDisc, { backgroundColor: accent }]}>
              <Icon name="plus" size={18} color={palette.white} weight="bold" />
            </View>
          </Pressable>
        </View>

        {/* Directly under the field: these are the fastest way to fill the
            list, so they belong where the eye already is rather than below
            whatever has been added so far. */}
        {habitOptions.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.habitChipsScroll}
            contentContainerStyle={styles.habitChips}
          >
            {habitOptions.map((habit) => {
              // Each chip wears its OWN habit's colour, not the session accent —
              // that is how the habit is recognised everywhere else in the app,
              // and a row of identically tinted chips gives up the one cue that
              // makes them scannable.
              const swatch = habitAccent(habit.color, isDark) ?? palette.greenDark;
              const glyph = readableOn(swatch, palette.surface, 3);

              return (
                <Pressable
                  key={habit.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${habit.name} to the list`}
                  onPress={() => setState((current) => addTask(current, habit.name, habit.id))}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: alpha(swatch, "3D"), backgroundColor: alpha(swatch, isDark ? "24" : "14"), opacity: pressed ? 0.7 : 1 }
                  ]}
                >
                  <Icon name="plus" size={12} color={glyph} weight="bold" />
                  <AppText variant="caption" color={glyph} numberOfLines={1}>
                    {habit.name}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {state.tasks.length > 0 ? renderTasks() : null}

        {finishedTasks > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear finished"
            onPress={() => setState((current) => clearFinished(current))}
            style={({ pressed }) => [styles.clear, { opacity: pressed ? 0.6 : 1 }]}
          >
            <AppText variant="caption" color={palette.subtle}>
              Clear {finishedTasks} finished
            </AppText>
          </Pressable>
        ) : null}

      </View>

    </Screen>
  );
}

const styles = StyleSheet.create({
  // ---- focus mode (landscape) ----
  modeContent: {
    flex: 1,
    // The screen's own inset is cancelled and MODE_PADDING applied instead, so
    // exactly one horizontal padding is in play — the clock's size is derived
    // from it, and two stacked would make that derivation wrong.
    marginHorizontal: -layout.screenPaddingX,
    paddingHorizontal: MODE_PADDING
  },
  modeTap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  // Top CENTRE, and `spacing.xl` down: the screen takes no safe-area edges, so
  // that inset is the only thing keeping the row clear of a notch. Pinned to
  // both sides and centred within, rather than positioned from one edge, so it
  // stays centred as the device rotates.
  modeOverlay: {
    position: "absolute",
    top: spacing.xl,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs
  },
  // Pause is the one control anyone actually reaches for mid-session, so it is
  // half again the size of the two beside it — findable without looking.
  modeOverlayPrimary: {
    width: 52,
    height: 52
  },
  modeOverlayButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  // Big, because in landscape there is height to spare and this is meant to be
  // legible with the phone propped across a desk.
  // Size comes from the call site — see `modeClockSize`.
  modeClock: {
    fontFamily: fontFamilies.serifBlack
  },
  // A quiet text button under the main pair — entering focus mode is a choice,
  // not the obvious next step, so it does not compete with Pause.
  modeEnter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    minHeight: 44,
    marginTop: spacing.xs
  },
  // ---- history dialog ----
  // No gap: the rows carry their own rule, and a gap would leave it floating
  // between them rather than dividing them.
  // Tighter than the info sheet's 24: that one separates paragraphs, this one
  // separates a divided list from the buttons under it, and the rules already
  // do most of the separating.
  sheetHistory: {
    gap: spacing.xs
  },
  historyList: {},
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center"
  },
  historyText: {
    flex: 1,
    minWidth: 0
  },
  historyTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  historyMeta: {
    fontFamily: fontFamilies.lexend
  },
  historyAmount: {
    alignItems: "flex-end"
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    // On top of the sheet's own 8: the title needs to clear the first row's
    // rule rather than sitting on it like another entry in the list.
    marginBottom: spacing.sm
  },
  // 34pt outlined disc, the same shape the page bar's actions wear.
  historyClose: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  // A soft wash of the danger colour rather than a filled button: destructive
  // and secondary at once, so it has to look tappable without competing with
  // anything. Full width now that it is the sheet's only action — a centred
  // pill with air either side reads as unfinished rather than as restraint.
  historyClear: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    // On top of the sheet's own 8, so the button clears the last row's rule
    // rather than looking like the next entry in the list.
    marginTop: spacing.md,
    borderRadius: radius.pill
  },
  // ---- info dialog ----
  scrim: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg
  },
  sheet: {
    // Capped so a long list scrolls inside the card rather than growing it off
    // the screen and taking the close button with it.
    maxHeight: "80%",
    // `nav`, not `card` — this is the radius every other modal in the app wears
    // (AwardDialog, GroupInviteModal). At 18 these two read as large cards that
    // happen to float rather than as dialogs.
    borderRadius: radius.nav,
    // Well past a card's 20: this is a page of prose rather than a row of
    // controls, and text needs the margin to be readable at length. With the
    // scrim's own inset that puts the copy 60pt off the screen edge, which is
    // about where the tip lines stop wrapping awkwardly.
    padding: spacing.xl,
    gap: spacing.lg
  },
  sheetBody: {
    gap: spacing.sm
  },
  sheetTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamilies.serifBlack,
    fontSize: 26,
    lineHeight: 33
  },
  // Extra room underneath: with the "Getting more from it" heading gone, this
  // paragraph sits directly on the first tip, and the body gap alone was not
  // enough to separate the intro from the list it introduces.
  sheetParagraph: {
    lineHeight: 22,
    marginBottom: spacing.sm
  },
  tips: {
    gap: spacing.md
  },
  tip: {
    gap: 2
  },
  tipTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  // Regular weight, against `caption`'s semibold: the title above it is the
  // thing being scanned, and at the same weight the two lines competed. Set at
  // 14 rather than caption's 12 — this is the actual advice, and it was reading
  // as fine print under the line it explains.
  tipBody: {
    fontFamily: fontFamilies.lexend,
    fontSize: 14,
    lineHeight: 20
  },
  sheetClose: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill
  },
  content: {
    // Well past `xxl`: this page ends on a text field, and a keyboard rising
    // over the last checklist rows is the thing extra bottom room actually
    // buys — plus the tab bar this screen does not have does not reserve any.
    paddingBottom: spacing.xxl * 2,
    gap: spacing.sm
  },
  // Bled to the screen edges so a card scrolls off the side rather than being
  // clipped at the content column — at the inset width the last card was cut
  // mid-tile with no room to run out.
  activityScroll: {
    marginHorizontal: -layout.screenPaddingX
  },
  activityRow: {
    gap: spacing.xs,
    // Put back on the CONTENT, not the scroller: the first and last cards line
    // up with everything else on the page, while the row itself still reaches
    // the edges in between.
    paddingHorizontal: layout.screenPaddingX,
    // 8, not 4 — the selected card's check badge overhangs its top by 6, and
    // at 4 the badge clipped against the scroller's bounds.
    paddingTop: spacing.xs,
    // Even now the strip sits between Start and the checklist rather than
    // carrying a section break under it.
    paddingBottom: spacing.xxs
  },
  activity: {
    width: ACTIVITY_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    // Border always present so selection changes only its colour — a border
    // that appears on selection would shift every card beside it.
    borderWidth: 2
  },
  activityLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  // Sits on the corner, ringed in the canvas colour so it reads as lifted off
  // the tile rather than drawn on it.
  activityCheck: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  // Inset past the Start button's measure — the dial no longer has to be the
  // largest thing on the page to be the obvious one. Leaves 188pt of clear
  // space inside the ring against the 170 the clock needs at "90:00".
  dialWrap: {
    marginHorizontal: spacing.xl
  },
  // 64: the dial narrowed again, leaving 188pt inside the ring. "90:00" at 68
  // runs near 180, which fits but sits close enough to the arc to look wedged.
  //
  // Drawn in the activity's accent, like the arc around it — the two are one
  // instrument. Safe at this size: the accent already clears 4.5:1 on white,
  // and type this large only ever needed 3:1.
  clock: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 64,
    lineHeight: 74
  },
  // 64 against setup's 72: the running dial is narrower, which leaves about
  // 216pt of clear space inside the ring. At 72 a "25:00" runs close to 198 and
  // would very nearly touch the arc.
  clockRunning: {
    fontSize: 64,
    lineHeight: 74
  },
  clockState: {
    fontFamily: fontFamilies.lexendSemiBold,
    textTransform: "uppercase",
    letterSpacing: 1.2
  },
  soundCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  soundHalf: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.md
  },
  soundText: {
    flex: 1,
    minWidth: 0
  },
  soundValue: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  soundDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: spacing.sm
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  // One scrolling row rather than a wrap, always — not only past some count.
  // Wrapping meant the section's height depended on how many habits were
  // scheduled that day, so the list below it moved around from morning to
  // evening. A row that scrolls is the same height at two habits or twenty, and
  // it matches the category strip further up the same screen.
  habitChipsScroll: {
    marginTop: spacing.xs,
    marginHorizontal: -layout.screenPaddingX
  },
  habitChips: {
    flexDirection: "row",
    // Tighter between, wider within: the chips read as one strip rather than as
    // scattered pills, and each name gets room off its own border.
    gap: spacing.xxs,
    // Put back on the content, so the first and last chips line up with
    // everything else while the row still reaches the edges in between.
    paddingHorizontal: layout.screenPaddingX
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    // Shorter than a standalone chip — these sit in a strip under the field —
    // but generous horizontally so a habit name is not pressed against its own
    // border.
    minHeight: 30,
    maxWidth: "100%",
    paddingHorizontal: spacing.ml,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  start: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 56,
    // Pulled in from the content edges rather than stretched flush: the dial
    // above it is the widest thing on the page, and a button running the full
    // measure competed with it for that.
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    // Separates the decision above it from the settings below: Start closes the
    // main flow, and the category strip under it reads as a different job.
    marginBottom: spacing.lg,
    borderRadius: radius.pill
  },
  block: {
    marginTop: spacing.lg,
    gap: spacing.xs
  },
  // Relative, so the button can be positioned against the field inside it.
  addRow: {
    position: "relative",
    justifyContent: "center"
  },
  addInput: {
    // Clears the disc, so typed text never runs underneath it.
    paddingRight: 52
  },
  addButton: {
    position: "absolute",
    right: spacing.xs,
    // Stretched to the field's height so the target is the full 52, not 36.
    top: 0,
    bottom: 0,
    width: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  addButtonDisc: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  // No gap: the rows carry their own hairline, and a gap would break the rule
  // into five floating segments.
  list: {},
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs
  },
  // Mid-session the list is tighter still — the dial above stays the loudest
  // thing on the screen.
  rowCompact: {
    paddingVertical: spacing.xs
  },
  rowTitleLine: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  habitBadge: {
    // Must not shrink — the title beside it is what yields when a name runs long.
    flexShrink: 0,
    minHeight: 20,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill
  },
  habitBadgeText: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 11,
    lineHeight: 15
  },
  // The 22pt disc the habit rows wear, so a tick means the same thing wherever
  // it appears in the app.
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center"
  },
  rowTitle: {
    // Yields to the badge beside it rather than pushing it out of the row.
    flexShrink: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 21
  },
  rowAction: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  clear: {
    alignSelf: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md
  },
  // ---- running ----
  // No back action on the header: the session is the screen, and a back button
  // that abandons a running clock without saying so is worse than none.
  runningContent: {
    flex: 1,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl
  },
  // Inset rather than bled, unlike the setup dial. During a session the ring is
  // the only thing on screen worth looking at, so it does not need the width —
  // and a smaller circle carrying a heavier stroke reads as more solid than a
  // wide one carrying a thin arc.
  runningDial: {
    paddingHorizontal: spacing.md
  },
  runningList: {
    flex: 1,
    marginTop: spacing.lg
  },
  runningListContent: {
    gap: spacing.xs,
    paddingBottom: spacing.lg
  },
  // A row now, not a stack: End and Pause are peers during a session, and
  // stacked they read as a primary with an afterthought under it.
  runningActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill
  },
  // The finished state has no Pause beside it, so Done takes the width back.
  primaryWide: {
    paddingHorizontal: spacing.xxl
  },
  // Same height and radius as `primary`, outlined instead of filled — the two
  // sit level in the row rather than one looking taller than the other. A row
  // now that it carries an icon beside its label.
  outlined: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  secondary: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.lg
  }
});
