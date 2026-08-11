import { normalizeActivity, type FocusActivityId } from "@/constants/focusActivities";
import { createId } from "@/lib/id";

/**
 * Focus: pick what kind of work it is, set a length, and run a countdown
 * against it — with an optional checklist to tick off while it runs.
 *
 * The model rests on one decision: **store the wall-clock instant, never a
 * running count.** iOS suspends the app and JS timers stop with it, so anything
 * that decrements loses exactly the time the user spent away from the phone —
 * which, for a tool whose whole job is measuring 25 minutes away from the
 * phone, is every minute that matters. A running session stores `endsAt`;
 * remaining time is always derived from `Date.now()`.
 *
 * Pausing is the mirror case, and the reason `pausedRemainingMs` exists: it
 * freezes a DURATION rather than keeping the end instant. An `endsAt` held
 * through a pause keeps sliding into the past, and resuming would find the
 * session already over.
 *
 * Everything here is pure and takes `now`, so the tests need no fake timers.
 */

export type FocusTask = {
  id: string;
  title: string;
  /**
   * Set when the task came from a habit. Ticking such a task checks that habit
   * off for the day; the id is what lets the screen find it again.
   */
  habitId?: string;
  done: boolean;
};

export type FocusSession = {
  activity: FocusActivityId;
  /** Absolute epoch ms this countdown ends. Meaningless while paused. */
  endsAt: number;
  /** Full length of the session, so progress has a denominator. */
  durationMs: number;
  /** Milliseconds left at the moment of pausing, or null while running. */
  pausedRemainingMs: number | null;
};

/**
 * A finished session, kept so the history can show what the time went on.
 *
 * Stores BOTH what was focused and what was planned, so a block ended early
 * reads honestly rather than as a full one — a history that quietly rounds
 * everything up to the planned length is a history worth nothing.
 */
export type FocusRecord = {
  id: string;
  activity: FocusActivityId;
  /** Epoch ms the session ended. */
  endedAt: number;
  focusedMs: number;
  plannedMs: number;
  /** True when the countdown reached zero rather than being stopped early. */
  finished: boolean;
  /** Checklist items ticked at the moment it ended. */
  ticked: number;
};

/**
 * Sessions kept. Old enough to be a record, small enough that the blob stays
 * cheap to write — this is persisted on every state change.
 */
export const HISTORY_LIMIT = 100;

/**
 * Sessions shorter than this are not recorded at all.
 *
 * Start-then-immediately-end is a mis-tap, and a history full of nine-second
 * entries is one nobody scrolls.
 */
export const MIN_RECORDED_MS = 60_000;

export type FocusState = {
  /** The setup screen's current choices, remembered between sessions. */
  activity: FocusActivityId;
  durationMinutes: number;
  session: FocusSession | null;
  tasks: FocusTask[];
  /** Ambience that plays through the session, or null for silence. */
  backgroundSoundId: string | null;
  /** What sounds when the countdown reaches zero, or null for silence. */
  endSoundId: string | null;
  /** Finished sessions, newest first. */
  history: FocusRecord[];
};

/**
 * The dial's range and step.
 *
 * Five minutes is the shortest block worth arming a timer for; ninety is about
 * where a single sitting stops being one.
 *
 * Stepped by ONE minute: over an 85-minute range that is about a degree of
 * sweep per minute, which a finger can hold. Snapping to five was cheap
 * insurance against a jittery drag, but it also made 23 minutes unreachable —
 * and someone with 23 minutes before a meeting is exactly who this is for.
 */
export const MIN_MINUTES = 5;
export const MAX_MINUTES = 90;
export const STEP_MINUTES = 1;
export const DEFAULT_MINUTES = 25;

const MINUTE_MS = 60_000;

export const emptyFocusState: FocusState = {
  activity: "study",
  durationMinutes: DEFAULT_MINUTES,
  session: null,
  tasks: [],
  backgroundSoundId: null,
  endSoundId: null,
  history: []
};

export function minutesToMs(minutes: number): number {
  return Math.round(minutes * MINUTE_MS);
}

/** Clamps to the dial's range and snaps to its step. */
export function snapMinutes(minutes: number): number {
  const stepped = Math.round(minutes / STEP_MINUTES) * STEP_MINUTES;

  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, stepped));
}

/** Where a given length sits on the dial, 0 to 1 — what draws the arc. */
export function minutesToDial(minutes: number): number {
  return (snapMinutes(minutes) - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES);
}

/** The inverse: a dial position back to a snapped length. */
export function dialToMinutes(fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));

  return snapMinutes(MIN_MINUTES + clamped * (MAX_MINUTES - MIN_MINUTES));
}

export function isPaused(session: FocusSession): boolean {
  return session.pausedRemainingMs !== null;
}

/** Never negative — an overdue session reads as 0, not as a countdown past zero. */
export function remainingMs(session: FocusSession, now: number): number {
  if (session.pausedRemainingMs !== null) {
    return Math.max(0, session.pausedRemainingMs);
  }

  return Math.max(0, session.endsAt - now);
}

export function isFinished(session: FocusSession, now: number): boolean {
  return remainingMs(session, now) <= 0;
}

/** 0 → just started, 1 → done. Clamped, so a long background gap can't overshoot. */
export function progress(session: FocusSession, now: number): number {
  if (session.durationMs <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(0, 1 - remainingMs(session, now) / session.durationMs));
}

export function startSession(state: FocusState, now: number): FocusState {
  if (state.session) {
    return state;
  }

  const durationMs = minutesToMs(snapMinutes(state.durationMinutes));

  return {
    ...state,
    session: { activity: state.activity, endsAt: now + durationMs, durationMs, pausedRemainingMs: null }
  };
}

/** Freezes the remainder, so the pause itself costs no time. */
export function pauseSession(state: FocusState, now: number): FocusState {
  if (!state.session || isPaused(state.session)) {
    return state;
  }

  return { ...state, session: { ...state.session, pausedRemainingMs: remainingMs(state.session, now) } };
}

/** Rebuilds `endsAt` from the frozen remainder. */
export function resumeSession(state: FocusState, now: number): FocusState {
  if (!state.session || !isPaused(state.session)) {
    return state;
  }

  return {
    ...state,
    session: { ...state.session, endsAt: now + (state.session.pausedRemainingMs ?? 0), pausedRemainingMs: null }
  };
}

/**
 * Ends the session, records it, and clears the list.
 *
 * The list is per-session: what you meant to get done in THIS block is not
 * automatically what you mean to get done in the next one, and a list that
 * accumulates across sessions turns into a backlog nobody prunes. Whatever was
 * ticked is already captured in the record below, so ending loses the plan but
 * keeps the history of it.
 *
 * Recording happens here rather than when the countdown hits zero, because a
 * session is not over until the user says so — one left running past the end
 * is still theirs to end, and logging it twice would be worse than logging it
 * late.
 */
export function endSession(state: FocusState, now: number): FocusState {
  if (!state.session) {
    return state;
  }

  const { session } = state;
  const focusedMs = Math.max(0, session.durationMs - remainingMs(session, now));

  if (focusedMs < MIN_RECORDED_MS) {
    return { ...state, session: null, tasks: [] };
  }

  const record: FocusRecord = {
    id: createId(),
    activity: session.activity,
    endedAt: now,
    focusedMs,
    plannedMs: session.durationMs,
    finished: isFinished(session, now),
    ticked: doneCount(state)
  };

  // `ticked` is read off the state ABOVE this, so the count survives the clear.
  return { ...state, session: null, tasks: [], history: [record, ...state.history].slice(0, HISTORY_LIMIT) };
}

export function clearHistory(state: FocusState): FocusState {
  return { ...state, history: [] };
}

/** Everything focused across the whole history. */
export function totalFocusedMs(state: FocusState): number {
  return state.history.reduce((sum, record) => sum + record.focusedMs, 0);
}

export function setActivity(state: FocusState, activity: FocusActivityId): FocusState {
  return { ...state, activity };
}

export function setDuration(state: FocusState, minutes: number): FocusState {
  return { ...state, durationMinutes: snapMinutes(minutes) };
}

export function setBackgroundSound(state: FocusState, soundId: string | null): FocusState {
  return { ...state, backgroundSoundId: soundId };
}

export function setEndSound(state: FocusState, soundId: string | null): FocusState {
  return { ...state, endSoundId: soundId };
}

export function addTask(state: FocusState, title: string, habitId?: string): FocusState {
  const trimmed = title.trim();

  if (!trimmed) {
    return state;
  }

  // Two rows for one habit would give it two ticks that both claim to complete it.
  if (habitId && state.tasks.some((task) => task.habitId === habitId)) {
    return state;
  }

  return { ...state, tasks: [...state.tasks, { id: createId(), title: trimmed, habitId, done: false }] };
}

export function removeTask(state: FocusState, taskId: string): FocusState {
  return { ...state, tasks: state.tasks.filter((task) => task.id !== taskId) };
}

export function setTaskDone(state: FocusState, taskId: string, done: boolean): FocusState {
  return { ...state, tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, done } : task)) };
}

export function clearFinished(state: FocusState): FocusState {
  return { ...state, tasks: state.tasks.filter((task) => !task.done) };
}

export function doneCount(state: FocusState): number {
  return state.tasks.filter((task) => task.done).length;
}

/**
 * "25:00" — always mm:ss, and always rounded UP.
 *
 * Rounding up is what stops a fresh 25-minute session from rendering "24:59"
 * on its first frame, and stops the display sitting on "0:00" for a second
 * while the session is still running.
 */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** "1h 04m" / "12m" — the coarse form, for a total rather than a live clock. */
export function formatTotal(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${minutes}m`;
}

/** Spoken form for screen readers, where "25:00" is read as a time of day. */
export function describeRemaining(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} second${seconds === 1 ? "" : "s"} left`;
  }

  if (seconds === 0) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
  }

  return `${minutes} minute${minutes === 1 ? "" : "s"} ${seconds} second${seconds === 1 ? "" : "s"} left`;
}

/**
 * Narrows whatever storage hands back into a usable state.
 *
 * Storage is the one place a malformed value can enter — an older build, a
 * partial write — and a NaN `endsAt` would render "NaN:NaN" and never finish.
 */
export function normalizeFocusState(value: unknown): FocusState {
  if (!value || typeof value !== "object") {
    return emptyFocusState;
  }

  const raw = value as Partial<FocusState>;
  const tasks: FocusTask[] = Array.isArray(raw.tasks)
    ? raw.tasks
        .filter((task): task is FocusTask => Boolean(task) && typeof task.id === "string" && typeof task.title === "string")
        .map((task) => ({
          id: task.id,
          title: task.title,
          habitId: typeof task.habitId === "string" ? task.habitId : undefined,
          done: task.done === true
        }))
    : [];

  const rawSession = raw.session;
  let session: FocusSession | null = null;

  if (
    rawSession &&
    typeof rawSession === "object" &&
    Number.isFinite(rawSession.endsAt) &&
    Number.isFinite(rawSession.durationMs) &&
    (rawSession.durationMs ?? 0) > 0
  ) {
    session = {
      activity: normalizeActivity(rawSession.activity),
      endsAt: rawSession.endsAt as number,
      durationMs: rawSession.durationMs as number,
      pausedRemainingMs: Number.isFinite(rawSession.pausedRemainingMs) ? (rawSession.pausedRemainingMs as number) : null
    };
  }

  const history: FocusRecord[] = Array.isArray(raw.history)
    ? raw.history
        .filter(
          (record): record is FocusRecord =>
            Boolean(record) &&
            typeof record.id === "string" &&
            Number.isFinite(record.endedAt) &&
            Number.isFinite(record.focusedMs)
        )
        .map((record) => ({
          id: record.id,
          activity: normalizeActivity(record.activity),
          endedAt: record.endedAt,
          focusedMs: Math.max(0, record.focusedMs),
          plannedMs: Number.isFinite(record.plannedMs) ? Math.max(0, record.plannedMs) : record.focusedMs,
          finished: record.finished === true,
          ticked: Number.isFinite(record.ticked) ? Math.max(0, record.ticked) : 0
        }))
        .slice(0, HISTORY_LIMIT)
    : [];

  return {
    activity: normalizeActivity(raw.activity),
    durationMinutes: Number.isFinite(raw.durationMinutes) ? snapMinutes(raw.durationMinutes as number) : DEFAULT_MINUTES,
    session,
    tasks,
    backgroundSoundId: typeof raw.backgroundSoundId === "string" ? raw.backgroundSoundId : null,
    endSoundId: typeof raw.endSoundId === "string" ? raw.endSoundId : null,
    history
  };
}
