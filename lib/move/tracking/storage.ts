import AsyncStorage from "@react-native-async-storage/async-storage";
import { TRACKING_CONFIG } from "@/lib/move/tracking/config";
import type { ActivitySegment, ActivityTrackingState, RawLocationPoint } from "@/lib/move/tracking/types";

/**
 * Where a live activity lives while it is being recorded.
 *
 * ## Why not SQLite
 *
 * The brief suggests it, and for a route of a hundred thousand points it would
 * be right. This app records walks: an hour at one fix a second is 3,600
 * points, which serialises to a few hundred kilobytes — well inside what
 * AsyncStorage handles, and the app already depends on it. Adding a database,
 * a migration story and a native module for that is the "unnecessary library"
 * §35 warns against. What matters far more is WHEN it is written, which is
 * every ten seconds and on every state change.
 *
 * ## Its own key
 *
 * `@lumo/move/activity/v1`, never the `@lumo/state/v1` blob. That one is
 * re-serialised whole on every change, and a GPS fix arriving every second
 * would rewrite every habit, completion and journal entry alongside it.
 *
 * ## What is trimmed
 *
 * The route — accepted points, in segments — is written in full, because it is
 * the thing that cannot be reconstructed. Raw REJECTED points are diagnostic,
 * so only a recent tail is kept on disk; losing the older ones costs an
 * explanation, not a walk.
 */

const ACTIVITY_KEY = "@lumo/move/activity/v1";
const QUEUE_KEY = "@lumo/move/activity/pending/v1";

/** How many raw points survive a write. The route is never trimmed. */
const PERSISTED_RAW_POINTS = 600;

export async function saveActivity(state: ActivityTrackingState): Promise<void> {
  try {
    const trimmed: ActivityTrackingState = {
      ...state,
      rawPoints: state.rawPoints.slice(-PERSISTED_RAW_POINTS)
    };

    await AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify(trimmed));
  } catch {
    // The in-memory activity is still correct and the next autosave carries it.
    // A failed write must never interrupt a recording in progress.
  }
}

export async function loadActivity(): Promise<ActivityTrackingState | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVITY_KEY);

    return raw ? normalizeActivity(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function clearActivity(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVITY_KEY);
  } catch {
    // Nothing to recover: a stale activity is caught by `normalizeActivity`.
  }
}

/**
 * Fixes the background task collected while the app was not running its own
 * pipeline.
 *
 * The task cannot own the tracker — it wakes into a JS context that may have no
 * React tree and no in-memory state — so it does the one thing it safely can:
 * appends raw samples to this queue. The controller drains it in order the
 * moment it is alive again, and the engine processes them exactly as if they
 * had arrived live. One pipeline, one set of rules, whatever the app was doing.
 */
export type PendingFix = Omit<RawLocationPoint, "isAccepted" | "rejectionReason">;

export async function enqueueFixes(fixes: PendingFix[]): Promise<void> {
  if (fixes.length === 0) {
    return;
  }

  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const existing = raw ? (JSON.parse(raw) as PendingFix[]) : [];
    // Bounded: a queue that grew without limit during a long background stretch
    // would be the one thing that could exhaust storage mid-walk.
    const next = [...existing, ...fixes].slice(-TRACKING_CONFIG.storage.maxRawPoints);

    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch {
    // A dropped background fix costs a few metres of route, and the next fix
    // still lands. Failing loudly here would take down the background task.
  }
}

/** Takes everything queued and clears it, oldest first. */
export async function drainFixes(): Promise<PendingFix[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);

    if (!raw) {
      return [];
    }

    await AsyncStorage.removeItem(QUEUE_KEY);

    const parsed = JSON.parse(raw) as PendingFix[];

    return Array.isArray(parsed)
      ? parsed
          .filter((fix) => Number.isFinite(fix?.latitude) && Number.isFinite(fix?.longitude) && Number.isFinite(fix?.timestamp))
          .sort((a, b) => a.timestamp - b.timestamp)
      : [];
  } catch {
    return [];
  }
}

export async function clearQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    // Same as above: nothing here is worth interrupting a walk for.
  }
}

/**
 * Narrows a stored activity, or drops it.
 *
 * Forward-only defensive reading, the same convention the rest of the app uses:
 * anything unrecognisable is treated as absent rather than migrated. An
 * activity is worth recovering only if it can be trusted, and half a shape is
 * worse than none.
 */
export function normalizeActivity(value: unknown): ActivityTrackingState | null {
  const raw = value as Partial<ActivityTrackingState> | undefined;

  if (!raw || typeof raw.activityId !== "string" || !raw.activityId) {
    return null;
  }

  if (raw.type !== "walk" && raw.type !== "run" && raw.type !== "mixed") {
    return null;
  }

  if (!Number.isFinite(raw.startedAt)) {
    return null;
  }

  const status =
    raw.status === "active" || raw.status === "paused" || raw.status === "autoPaused" || raw.status === "finished" || raw.status === "preparing"
      ? raw.status
      : "paused";

  return {
    activityId: raw.activityId,
    type: raw.type,
    status,
    startedAt: raw.startedAt as number,
    lastTickAt: Number.isFinite(raw.lastTickAt) ? (raw.lastTickAt as number) : (raw.startedAt as number),
    finishedAt: Number.isFinite(raw.finishedAt) ? (raw.finishedAt as number) : undefined,
    elapsedDuration: positive(raw.elapsedDuration),
    movingDuration: positive(raw.movingDuration),
    pausedDuration: positive(raw.pausedDuration),
    distanceMeters: positive(raw.distanceMeters),
    walkingMeters: positive(raw.walkingMeters),
    runningMeters: positive(raw.runningMeters),
    steps: Number.isFinite(raw.steps) ? Math.max(0, Math.round(raw.steps as number)) : null,
    movement: raw.movement === "moving" || raw.movement === "possiblyStopped" || raw.movement === "stopped" ? raw.movement : "possiblyStopped",
    movementSince: Number.isFinite(raw.movementSince) ? (raw.movementSince as number) : (raw.startedAt as number),
    lastMovementAt: Number.isFinite(raw.lastMovementAt) ? (raw.lastMovementAt as number) : (raw.startedAt as number),
    // Never trusted from disk: a signal reading is about right now, and the
    // one that was true when the app died says nothing about the moment it
    // comes back.
    gpsQuality: "unavailable",
    lastAccuracyM: null,
    segments: normalizeSegments(raw.segments),
    rawPoints: Array.isArray(raw.rawPoints) ? raw.rawPoints.filter(isPoint) : [],
    manuallyPaused: raw.manuallyPaused === true,
    autoPauseEnabled: raw.autoPauseEnabled !== false
  };
}

function normalizeSegments(value: unknown): ActivitySegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => entry as Partial<ActivitySegment>)
    .filter((entry): entry is ActivitySegment => typeof entry?.id === "string" && Number.isFinite(entry.startedAt))
    .map((entry) => ({
      id: entry.id,
      startedAt: entry.startedAt,
      endedAt: Number.isFinite(entry.endedAt) ? entry.endedAt : undefined,
      points: Array.isArray(entry.points) ? entry.points.filter(isPoint) : []
    }));
}

function isPoint(value: unknown): value is RawLocationPoint {
  const point = value as Partial<RawLocationPoint> | undefined;

  return Boolean(point) && Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude) && Number.isFinite(point?.timestamp);
}

function positive(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : 0;
}
