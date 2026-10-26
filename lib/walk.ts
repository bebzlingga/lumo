/**
 * Saved walks: the record type, the local store's helpers, and the geo and
 * formatting maths the walk screens share.
 *
 * Recording lives in `lib/move/tracking/*` (the only GPS pipeline); a finished
 * activity becomes a `WalkRecord` through `tracking/bridge.ts`. The old session
 * engine that used to live here is gone — nothing recorded through it anymore.
 */

import { isDoneOnDate } from "@/lib/habitMath";
import type { Habit } from "@/types/habit";

export type WalkPoint = {
  lat: number;
  lon: number;
  /** Epoch ms the fix was taken. */
  at: number;
  /** Horizontal accuracy in metres. Larger is worse. */
  accuracy: number;
  speed?: number;
  altitude?: number;
};

export type WalkMood = "easy" | "good" | "tough";

// --- tuning -----------------------------------------------------------------

/** Earth's mean radius in metres, for the haversine below. */
const EARTH_RADIUS_M = 6_371_000;

/** Stored for a saved point whose accuracy was lost — the old acceptance ceiling. */
const UNKNOWN_ACCURACY_M = 30;

// --- MOVEMENT ---------------------------------------------------------------

// --- geo --------------------------------------------------------------------

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates, in metres.
 *
 * Haversine rather than a flat-earth approximation: the error of treating
 * lat/lon as a plane grows with latitude, and a walk is exactly the scale where
 * "close enough" starts showing up as a wrong kilometre count over an hour.
 */
export function calculateDistance(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Thins a route for drawing — Ramer–Douglas–Peucker.
 *
 * A half-hour walk is a few hundred points, and handing all of them to a map
 * polyline costs frames for a shape the eye cannot tell from the simplified one.
 * `toleranceM` is the furthest a dropped point may sit from the kept line.
 *
 * Only ever used for DISPLAY. Distance and pace always read the full list, so
 * simplification can never change what the walk is worth.
 */
export function simplifyRouteForDisplay(points: WalkPoint[], toleranceM = 5): WalkPoint[] {
  if (points.length <= 2) {
    return points;
  }

  const first = points[0];
  const last = points[points.length - 1];
  let furthest = 0;
  let furthestIndex = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], first, last);

    if (distance > furthest) {
      furthest = distance;
      furthestIndex = index;
    }
  }

  if (furthest <= toleranceM) {
    return [first, last];
  }

  const left = simplifyRouteForDisplay(points.slice(0, furthestIndex + 1), toleranceM);
  const right = simplifyRouteForDisplay(points.slice(furthestIndex), toleranceM);

  // `left` already ends on the pivot that `right` begins with.
  return [...left.slice(0, -1), ...right];
}

/**
 * How far `point` sits from the line `start`–`end`, in metres.
 *
 * Projected onto a local plane rather than done on the sphere: over the few
 * hundred metres a simplification window spans, the curvature error is far below
 * the tolerance being tested, and the closed form is much cheaper inside a
 * recursive routine.
 */
function perpendicularDistance(point: WalkPoint, start: WalkPoint, end: WalkPoint): number {
  const lineLength = calculateDistance(start, end);

  if (lineLength === 0) {
    return calculateDistance(start, point);
  }

  // Metres-per-degree, taken at the segment's latitude so longitude is scaled
  // correctly — a degree of longitude shrinks toward the poles.
  const latScale = 111_320;
  const lonScale = 111_320 * Math.cos(toRadians(start.lat));

  const px = (point.lon - start.lon) * lonScale;
  const py = (point.lat - start.lat) * latScale;
  const ex = (end.lon - start.lon) * lonScale;
  const ey = (end.lat - start.lat) * latScale;

  return Math.abs(px * ey - py * ex) / Math.sqrt(ex * ex + ey * ey);
}

// --- the session ------------------------------------------------------------

// --- formatting -------------------------------------------------------------

// --- the store --------------------------------------------------------------

/**
 * A finished walk, kept for history.
 *
 * Holds the simplified route rather than every fix: a half-hour walk is a few
 * hundred points, and history only ever draws them. The full trace lives on
 * until it syncs and is not what history reads.
 */
export type WalkRecord = {
  id: string;
  startedAt: number;
  endedAt: number;
  activeMs: number;
  /** On foot only. Vehicle distance never reaches this field. */
  distanceM: number;
  /** What was discarded as vehicle travel, reported but never counted. */
  vehicleM: number;
  steps: number | null;
  route: WalkPoint[];
  habitIds: string[];
  mood?: WalkMood;
  note?: string;
  /**
   * What the tracker worked out, for the server.
   *
   * Optional and inert locally — nothing in the app reads it. It exists so the
   * facts the engine computed at the finish (which of walk/run it was, paused
   * time, average pace, the integrity verdict) survive the trip through the
   * walk store to `walkRow`, instead of being recomputed from a route that no
   * longer has the raw fixes to recompute them from.
   *
   * Absent on a walk recorded before the tracker existed, and on one that came
   * from anywhere else; `walkRow` has a defined fallback for every field.
   */
  facts?: ActivityFacts;
  /** False until this walk has reached the server. Never blocks anything local. */
  synced: boolean;
};

/**
 * The tracker's own findings, in the shape the server row wants.
 *
 * Declared here rather than imported from `walkSync` so `WalkRecord` does not
 * depend on the sync layer — the record is the app's shape, and sync is one of
 * its readers.
 */
export type ActivityFacts = {
  type?: "walk" | "run";
  elapsedMs?: number;
  pausedMs?: number;
  averagePaceMsPerKm?: number | null;
  averageSpeedMs?: number | null;
  caloriesEstimate?: number | null;
  segmentCount?: number;
  integrityOk?: boolean;
  integrityReason?: string | null;
};

export type WalkState = {
  history: WalkRecord[];
};

/**
 * Walks kept locally. Enough for a real history, bounded so the stored blob
 * cannot grow without limit — a year of daily walking fits inside it.
 */
export const WALK_HISTORY_LIMIT = 400;

export const emptyWalkState: WalkState = { history: [] };

/** Files a finished outing, newest first. */
export function recordWalk(state: WalkState, record: WalkRecord): WalkState {
  return {
    ...state,
    history: [record, ...state.history.filter((entry) => entry.id !== record.id)].slice(0, WALK_HISTORY_LIMIT)
  };
}

export type WalkTotals = { walks: number; activeMs: number; distanceM: number };

/**
 * Totals over a window — what "THIS WEEK · 4 walks · 2h 14m · 9.8 km" reads.
 *
 * Filed by when a walk STARTED. A walk begun at 23:50 and finished at 00:20
 * belongs to the day it was set out on, which is the day the user would look
 * for it under.
 */
export function totalsSince(history: WalkRecord[], sinceMs: number): WalkTotals {
  return history
    .filter((record) => record.startedAt >= sinceMs)
    .reduce<WalkTotals>(
      (totals, record) => ({
        walks: totals.walks + 1,
        activeMs: totals.activeMs + record.activeMs,
        distanceM: totals.distanceM + record.distanceM
      }),
      { walks: 0, activeMs: 0, distanceM: 0 }
    );
}

/**
 * How much a day's walks contributed toward one habit, in that habit's unit.
 *
 * This is what makes multiple walks accumulate: two twenty-minute walks satisfy
 * a "walk 30 minutes" habit between them, without either one having done it.
 */
/** The units a habit can be measured in. Mirrors `HabitMeasurement["kind"]`. */
export type MeasurementKind = "duration" | "distance" | "steps";

export function habitContribution(
  history: WalkRecord[],
  habitId: string,
  kind: MeasurementKind,
  dayStartMs: number,
  dayEndMs: number
): number {
  return history
    .filter((record) => record.habitIds.includes(habitId) && record.startedAt >= dayStartMs && record.startedAt < dayEndMs)
    .reduce((total, record) => {
      if (kind === "duration") {
        return total + record.activeMs;
      }
      if (kind === "distance") {
        return total + record.distanceM;
      }
      return total + (record.steps ?? 0);
    }, 0);
}

/**
 * A measured habit's standing for one day: what the walks came to, what was
 * asked for, and whether it is met.
 *
 * Derived on every read rather than stored anywhere. The habit keeps only its
 * TARGET; the amount lives in the walk store, so deleting a walk takes its
 * contribution with it instead of leaving a number stranded on the habit.
 */
export type MeasurementProgress = { total: number; target: number; ratio: number; reached: boolean };

export function measurementProgress(
  history: WalkRecord[],
  habitId: string,
  measurement: { kind: MeasurementKind; target: number },
  dayStartMs: number,
  dayEndMs: number
): MeasurementProgress {
  const total = habitContribution(history, habitId, measurement.kind, dayStartMs, dayEndMs);
  // A non-positive target would make every habit permanently met, so it reads
  // as "no target" — the same call `normalizeMeasurement` makes on the way in.
  const target = measurement.target > 0 ? measurement.target : 0;

  return {
    total,
    target,
    ratio: target > 0 ? Math.min(1, total / target) : 0,
    reached: target > 0 && total >= target
  };
}

/** "18 / 30 min", "1.2 / 3 km", "4,100 / 5,000" — one line for a chip. */
/**
 * The habits a day's walks have just carried over their target and that are not
 * yet done that day — what saving a walk completes.
 *
 * Skipping a habit already done is what makes it once only: a second walk the
 * same day, or re-saving, finds it done and leaves it alone.
 */
export function habitsReachedByWalks(history: WalkRecord[], habits: Habit[], dateKey: string, dayStartMs: number, dayEndMs: number): string[] {
  return habits
    .filter(
      (habit) =>
        habit.status === "active" &&
        habit.measurement !== undefined &&
        !isDoneOnDate(habit, dateKey) &&
        measurementProgress(history, habit.id, habit.measurement, dayStartMs, dayEndMs).reached
    )
    .map((habit) => habit.id);
}

export function formatMeasurement(kind: MeasurementKind, total: number, target: number): string {
  if (kind === "duration") {
    return `${Math.floor(total / 60_000)} / ${Math.round(target / 60_000)} min`;
  }

  if (kind === "distance") {
    return target < 1000
      ? `${Math.round(total)} / ${Math.round(target)} m`
      : `${(total / 1000).toFixed(1)} / ${target / 1000} km`;
  }

  return `${Math.round(total).toLocaleString()} / ${target.toLocaleString()}`;
}

// --- milestones and encouragement -------------------------------------------

// --- reading back from storage ----------------------------------------------

function normalizePoint(value: unknown): WalkPoint | null {
  const raw = value as Partial<WalkPoint> | undefined;

  if (!raw || !Number.isFinite(raw.lat) || !Number.isFinite(raw.lon) || !Number.isFinite(raw.at)) {
    return null;
  }

  return {
    lat: raw.lat as number,
    lon: raw.lon as number,
    at: raw.at as number,
    accuracy: Number.isFinite(raw.accuracy) ? (raw.accuracy as number) : UNKNOWN_ACCURACY_M,
    speed: Number.isFinite(raw.speed) ? raw.speed : undefined,
    altitude: Number.isFinite(raw.altitude) ? raw.altitude : undefined
  };
}

/**
 * Narrows whatever storage hands back.
 *
 * The one rule that matters: a malformed ACTIVE session is dropped, but history
 * is repaired record by record. Losing the walk in progress is recoverable —
 * losing months of finished walks is not.
 */
export function normalizeWalkState(value: unknown): WalkState {
  if (!value || typeof value !== "object") {
    return emptyWalkState;
  }

  const raw = value as Partial<WalkState>;

  const history: WalkRecord[] = Array.isArray(raw.history)
    ? raw.history
        .filter(
          (record): record is WalkRecord =>
            Boolean(record) && typeof record.id === "string" && Number.isFinite(record.startedAt) && Number.isFinite(record.activeMs)
        )
        .map((record) => ({
          id: record.id,
          startedAt: record.startedAt,
          endedAt: Number.isFinite(record.endedAt) ? record.endedAt : record.startedAt,
          activeMs: Math.max(0, record.activeMs),
          distanceM: Number.isFinite(record.distanceM) ? Math.max(0, record.distanceM) : 0,
          // Absent on anything written before vehicle travel was detected. Zero
          // is the right reading there: those walks had none thrown out.
          vehicleM: Number.isFinite(record.vehicleM) ? Math.max(0, record.vehicleM) : 0,
          steps: Number.isFinite(record.steps) ? (record.steps as number) : null,
          route: Array.isArray(record.route) ? record.route.map(normalizePoint).filter((p): p is WalkPoint => p !== null) : [],
          habitIds: Array.isArray(record.habitIds) ? record.habitIds.filter((id): id is string => typeof id === "string") : [],
          mood: record.mood === "easy" || record.mood === "good" || record.mood === "tough" ? record.mood : undefined,
          note: typeof record.note === "string" ? record.note : undefined,
          synced: record.synced === true
        }))
        .slice(0, WALK_HISTORY_LIMIT)
    : [];

  return { history };
}
