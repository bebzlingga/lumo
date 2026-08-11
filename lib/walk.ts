/**
 * Move — the session model and the geo maths under it.
 *
 * Three rules shape this file.
 *
 * **1. Store the wall-clock instant, never a running count.** The same rule
 * `lib/focus.ts` is built on, and it matters more here: iOS suspends the app
 * and JS timers stop with it, so a walk that counted ticks would lose exactly
 * the minutes the user spent walking with the phone in their pocket. A running
 * session stores `runningSince`; elapsed is always derived from `Date.now()`.
 *
 * **2. Distance accumulates, it is never recomputed.** Each accepted point adds
 * its leg to a running total. Re-deriving the total from the whole point list
 * would mean one late-arriving bad sample could silently rewrite history, and it
 * would get slower as the walk got longer.
 *
 * **3. Only distance covered on foot counts.** A phone in a car produces a
 * perfectly clean GPS trace, and without this it would add twenty kilometres to
 * twenty kilometres to your total in the time it takes to drive home. Legs are
 * classified by speed
 * and a sustained run of vehicle-speed ones is banked separately — see
 * `MOVEMENT` below, which is where most of the thinking in this file lives.
 *
 * Everything here is pure and takes `now` where it needs the time, so the tests
 * need no fake timers.
 */
import { MILESTONES, type Milestone } from "@/constants/milestones";

export type WalkStatus = "idle" | "active" | "paused" | "completed" | "cancelled";

/**
 * How a leg was covered.
 *
 * `unknown` is the honest answer before there is a second fix to measure
 * against, and is never treated as either on-foot or vehicle.
 */
export type MovementKind = "unknown" | "still" | "walking" | "running" | "vehicle";

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

export type WalkSession = {
  /**
   * Client-generated and stable for the life of the walk.
   *
   * The id is minted on the device before anything reaches a server, which is
   * what lets a walk recorded in airplane mode sync later without the server
   * having to guess whether it already has it.
   */
  id: string;
  status: WalkStatus;
  startedAt: number;
  /** Ended, for a finished walk. Null while it is still going. */
  endedAt: number | null;
  /** Banked active ms from stretches before the current one. */
  accumulatedMs: number;
  /** Epoch ms the current stretch began, or null while paused. */
  runningSince: number | null;
  points: WalkPoint[];
  /**
   * Distance covered ON FOOT, in metres. The only number that counts.
   */
  distanceM: number;
  /**
   * Distance thrown out as vehicle travel.
   *
   * Kept rather than discarded so the summary can say "8.4 km of this was not
   * on foot" instead of silently showing a shorter walk than the map draws —
   * being wrong quietly is worse than being wrong out loud.
   */
  vehicleM: number;
  /**
   * Legs at vehicle speed not yet banked either way, and how many in a row.
   *
   * A single fast leg is GPS noise and should count; several in a row is a car
   * and should not. Holding them here until the streak breaks is what lets the
   * decision be made after the fact rather than guessed at on the first one.
   */
  pendingM: number;
  vehicleStreak: number;
  /** What the last measurable leg looked like. For the screen, not the maths. */
  movement: MovementKind;
  /**
   * Steps, or null when the device has no pedometer or permission was refused.
   *
   * Null rather than 0 on purpose — the same call `lib/iap.ts` makes about
   * unknown entitlements. "No step counter" and "walked zero steps" are
   * different facts, and rendering the first as the second is a lie.
   */
  steps: number | null;
  /** Habits this outing should count toward. Chosen when it starts. */
  habitIds: string[];
  mood?: WalkMood;
  note?: string;
};

// --- tuning -----------------------------------------------------------------

/**
 * Fixes worse than this are dropped outright.
 *
 * 30m is generous for a phone under open sky and tight enough to reject the
 * first few fixes after a cold start, which are routinely hundreds of metres out
 * and would otherwise draw a spike across the map.
 */
export const MAX_ACCURACY_M = 30;

/**
 * Fastest leg that is a real fix at all, in m/s. 60 m/s is 216 km/h.
 *
 * A sanity bound and nothing more — this is the line between "you moved" and
 * "the GPS teleported", not between walking and driving. Sorting a car out from
 * a walk is `VEHICLE_SPEED_MS`'s job, and the difference matters: a rejected
 * point never joins the route at all, so a rejected drive would freeze the map
 * and the distance with nothing on screen saying why. A leg that is merely fast
 * has to be RECORDED and then excluded, which is the only way the screen can
 * explain itself.
 *
 * It was 4 m/s when Move was walking-only. That is 14.4 km/h, which would have
 * silently thrown away the legs of anyone running a decent pace.
 */
export const MAX_SPEED_MS = 60;

/**
 * Legs shorter than this are ignored.
 *
 * Standing still, consecutive fixes wander by a few metres indefinitely. Without
 * a floor those wanders accumulate, and a walk paused at a crossing quietly
 * gains distance. 3m is below a real stride between samples — walking or
 * running — and above the jitter.
 */
export const MIN_LEG_M = 3;

/** Earth's mean radius in metres, for the haversine below. */
const EARTH_RADIUS_M = 6_371_000;

const MINUTE_MS = 60_000;

// --- MOVEMENT ---------------------------------------------------------------

/**
 * Below this a leg is standing still, in m/s. 0.5 m/s is 1.8 km/h — slower than
 * anyone actually going anywhere, so this is a shuffle at a crossing.
 */
export const STILL_SPEED_MS = 0.5;

/**
 * The walk/run line, in m/s. 2.2 m/s is about 7.9 km/h — a very brisk walk, and
 * roughly where anyone would say they had started jogging.
 *
 * Only ever labels the session for display. Nothing counted changes across
 * this line: a kilometre walked and a kilometre run are the same kilometre,
 * which is the whole reason distance is what Move measures.
 */
export const RUNNING_SPEED_MS = 2.2;

/**
 * At or above this, a leg was not covered on foot. 6 m/s is 21.6 km/h.
 *
 * Set where it is because of what is on either side. Below: a strong club
 * runner holds about 4.5 m/s over 5k, and even a very fast one stays under 6.
 * Above: cycling and town driving both live comfortably past it. The overlap
 * band — an elite sprinter and a slow cyclist — is real and unresolvable from
 * GPS alone, so this errs toward calling it a vehicle. Wrongly discarding a few
 * hundred metres of somebody's sprint is a smaller lie than counting a car
 * journey as distance they covered.
 */
export const VEHICLE_SPEED_MS = 6;

/**
 * How many vehicle-speed legs in a row before the distance is thrown out.
 *
 * One is noise — a GPS fix jumping a block sideways looks exactly like this, and
 * discarding on a single leg would eat chunks of ordinary walks in cities. Three
 * consecutive is somewhere between fifteen and thirty seconds of sustained
 * speed, which no fix error survives and no pedestrian produces.
 */
export const VEHICLE_LEG_STREAK = 3;

/** What a leg's speed says it was. Speed alone; nothing here reads the pedometer. */
export function classifyLeg(legM: number, elapsedMs: number): MovementKind {
  if (elapsedMs <= 0) {
    return "unknown";
  }

  const speed = legM / (elapsedMs / 1000);

  if (speed < STILL_SPEED_MS) {
    return "still";
  }

  if (speed < RUNNING_SPEED_MS) {
    return "walking";
  }

  if (speed < VEHICLE_SPEED_MS) {
    return "running";
  }

  return "vehicle";
}

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
 * Milliseconds per kilometre — the "13:45 /km" on the walk screen.
 *
 * Returns null under 10 metres rather than a number: pace over a distance that
 * short is dominated by GPS noise, and a wildly wrong figure at the start of
 * every walk is worse than a dash.
 */
export function calculatePace(distanceM: number, activeMs: number): number | null {
  if (distanceM < 10 || activeMs <= 0) {
    return null;
  }

  return activeMs / (distanceM / 1000);
}

export type PointRejection = "accuracy" | "stale" | "jitter" | "impossible";

/**
 * Whether a fix should join the route, and if not, why.
 *
 * Returns a REASON rather than a boolean so the caller can tell "standing
 * still" (jitter) from "bad GPS" (accuracy) — the first is normal and the
 * second is worth telling the user about.
 */
export function validateLocationPoint(point: WalkPoint, previous: WalkPoint | null): PointRejection | null {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || !Number.isFinite(point.at)) {
    return "impossible";
  }

  if (Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) {
    return "impossible";
  }

  if (!Number.isFinite(point.accuracy) || point.accuracy > MAX_ACCURACY_M) {
    return "accuracy";
  }

  if (!previous) {
    return null;
  }

  const elapsedMs = point.at - previous.at;

  // Non-monotonic timestamps happen when the OS replays a buffered fix. Taking
  // them would produce a negative leg time and an infinite speed.
  if (elapsedMs <= 0) {
    return "stale";
  }

  const legM = calculateDistance(previous, point);

  if (legM < MIN_LEG_M) {
    return "jitter";
  }

  if (legM / (elapsedMs / 1000) > MAX_SPEED_MS) {
    return "impossible";
  }

  return null;
}

/**
 * Banks whatever vehicle-speed legs are being held, now that we know what they
 * were.
 *
 * Short streak — a fix jumping sideways, or one genuinely quick stretch — and
 * the distance is credited as normal. Long streak and it goes to `vehicleM`,
 * where it is reported but never counted.
 */
function settlePending(session: WalkSession): WalkSession {
  if (session.pendingM === 0 && session.vehicleStreak === 0) {
    return session;
  }

  const wasVehicle = session.vehicleStreak >= VEHICLE_LEG_STREAK;

  return {
    ...session,
    distanceM: wasVehicle ? session.distanceM : session.distanceM + session.pendingM,
    vehicleM: wasVehicle ? session.vehicleM + session.pendingM : session.vehicleM,
    pendingM: 0,
    vehicleStreak: 0
  };
}

/**
 * Adds a fix to a session if it passes validation, accumulating its leg.
 *
 * Returns the SAME session object when the point is rejected, so a caller can
 * cheaply tell whether anything changed and skip a re-render or a write.
 *
 * A leg at vehicle speed is NOT counted immediately. It is held in `pendingM`
 * until the streak either breaks (noise — credited) or reaches
 * `VEHICLE_LEG_STREAK` (a ride — discarded). Deciding after the fact is the only
 * way to tell those apart, because the first leg of each looks identical.
 */
export function appendLocationPoint(session: WalkSession, point: WalkPoint): WalkSession {
  // Points are only collected while the clock is running. A fix that lands
  // during a pause would otherwise draw a line across wherever the user went
  // while stopped.
  if (session.status !== "active") {
    return session;
  }

  const previous = session.points.length > 0 ? session.points[session.points.length - 1] : null;

  if (validateLocationPoint(point, previous)) {
    return session;
  }

  const points = [...session.points, point];

  if (!previous) {
    return { ...session, points };
  }

  const leg = calculateDistance(previous, point);
  const movement = classifyLeg(leg, point.at - previous.at);

  if (movement === "vehicle") {
    return {
      ...session,
      points,
      movement,
      pendingM: session.pendingM + leg,
      vehicleStreak: session.vehicleStreak + 1
    };
  }

  const settled = settlePending(session);

  return { ...settled, points, movement, distanceM: settled.distanceM + leg };
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

/**
 * Starts an outing. Takes no target, on purpose — see `constants/milestones.ts`.
 * The only decision Move asks for is whether to go.
 */
export function startWalk(id: string, now: number, habitIds: string[] = []): WalkSession {
  return {
    id,
    status: "active",
    startedAt: now,
    endedAt: null,
    accumulatedMs: 0,
    runningSince: now,
    points: [],
    distanceM: 0,
    vehicleM: 0,
    pendingM: 0,
    vehicleStreak: 0,
    movement: "unknown",
    steps: null,
    habitIds
  };
}

export function isPaused(session: WalkSession): boolean {
  return session.status === "paused";
}

/** Milliseconds actually walked — paused time is not counted. */
export function activeMs(session: WalkSession, now: number): number {
  const live = session.runningSince === null ? 0 : Math.max(0, now - session.runningSince);

  return session.accumulatedMs + live;
}

/** Banks the live stretch and stops the clock. */
export function pauseWalk(session: WalkSession, now: number): WalkSession {
  if (session.status !== "active") {
    return session;
  }

  return { ...session, status: "paused", accumulatedMs: activeMs(session, now), runningSince: null };
}

/** Restarts the clock from now, so the pause itself costs nothing. */
export function resumeWalk(session: WalkSession, now: number): WalkSession {
  if (session.status !== "paused") {
    return session;
  }

  return { ...session, status: "active", runningSince: now };
}

export function finishWalk(session: WalkSession, now: number): WalkSession {
  if (session.status !== "active" && session.status !== "paused") {
    return session;
  }

  // Whatever was still being held decides now. A walk that ended mid-streak
  // must not carry unbanked metres into history, where nothing would ever
  // settle them.
  const settled = settlePending(session);

  return {
    ...settled,
    status: "completed",
    accumulatedMs: activeMs(settled, now),
    runningSince: null,
    endedAt: now
  };
}

export function cancelWalk(session: WalkSession, now: number): WalkSession {
  return { ...session, status: "cancelled", accumulatedMs: activeMs(session, now), runningSince: null, endedAt: now };
}

/**
 * True while the outing looks like a car ride rather than a walk.
 *
 * What the screen puts a notice on. Reads the live streak rather than the
 * banked total, so it clears again the moment someone gets out and starts
 * walking — a notice that stayed up for the rest of the outing would be
 * accusing them of something they stopped doing.
 */
export function looksLikeVehicle(session: WalkSession): boolean {
  return session.vehicleStreak >= VEHICLE_LEG_STREAK;
}

// --- formatting -------------------------------------------------------------

/** "18:42", or "1:04:18" once a walk passes an hour. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** "2.34 km" over a kilometre, "840 m" under it. */
export function formatDistance(metres: number): string {
  const safe = Math.max(0, metres);

  if (safe < 1000) {
    return `${Math.round(safe)} m`;
  }

  return `${(safe / 1000).toFixed(2)} km`;
}

/** "13:45 /km", or a dash when the walk is too short to have a meaningful pace. */
/**
 * Average speed over the walk, in metres per second. Null under 10 m, the same
 * floor `calculatePace` uses — over a couple of metres the arithmetic produces
 * numbers that are noise rather than information.
 */
export function averageSpeed(distanceM: number, activeMs: number): number | null {
  if (distanceM < 10 || activeMs <= 0) {
    return null;
  }

  return distanceM / (activeMs / 1000);
}

/**
 * The fastest LEG of a walk, in metres per second.
 *
 * Measured leg by leg rather than read off `point.speed`, because the platform's
 * own speed is instantaneous and reports whatever the receiver believed at that
 * instant — including the spikes that `validateLocationPoint` exists to reject.
 *
 * Legs at vehicle speed are skipped: a walk that shared a leg with a bus should
 * not report the bus as its fastest moment. Legs shorter than a metre are
 * skipped too, since a jittery fix over a fraction of a second divides out to
 * an absurd figure.
 *
 * Null when no leg qualifies — a walk with one fix, or every leg thrown out.
 */
export function maxLegSpeed(points: WalkPoint[]): number | null {
  let fastest: number | null = null;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const elapsedMs = point.at - previous.at;

    if (elapsedMs <= 0) {
      continue;
    }

    const legM = calculateDistance(previous, point);

    if (legM < 1) {
      continue;
    }

    const speed = legM / (elapsedMs / 1000);

    if (speed >= VEHICLE_SPEED_MS) {
      continue;
    }

    if (fastest === null || speed > fastest) {
      fastest = speed;
    }
  }

  return fastest;
}

/** "5.2 km/h", or a dash when there is nothing to report. */
export function formatSpeed(metresPerSecond: number | null): string {
  if (metresPerSecond === null || !Number.isFinite(metresPerSecond)) {
    return "—";
  }

  return `${((metresPerSecond * 3600) / 1000).toFixed(1)} km/h`;
}

export function formatPace(paceMsPerKm: number | null): string {
  if (paceMsPerKm === null || !Number.isFinite(paceMsPerKm)) {
    return "—";
  }

  const totalSeconds = Math.round(paceMsPerKm / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

/** Steps with a thousands separator, or a dash when the device has no counter. */
export function formatSteps(steps: number | null): string {
  return steps === null ? "—" : steps.toLocaleString();
}

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
  /** False until this walk has reached the server. Never blocks anything local. */
  synced: boolean;
};

export type WalkState = {
  /** The outing in progress, or null. At most one at a time. */
  active: WalkSession | null;
  history: WalkRecord[];
};

/**
 * Walks kept locally. Enough for a real history, bounded so the stored blob
 * cannot grow without limit — a year of daily walking fits inside it.
 */
export const WALK_HISTORY_LIMIT = 400;

/**
 * Walks shorter than this are not recorded.
 *
 * Start-then-immediately-stop is a mis-tap. The floor is on DURATION rather
 * than distance, so a genuine slow walk that covered little ground still counts
 * — this is a "did you show up" app, and 90 seconds of walking showed up.
 */
export const MIN_RECORDED_WALK_MS = 90_000;

export const emptyWalkState: WalkState = { active: null, history: [] };

/** Turns a finished session into its history record, or null if it was too short. */
export function toWalkRecord(session: WalkSession, now: number): WalkRecord | null {
  const active = activeMs(session, now);

  if (active < MIN_RECORDED_WALK_MS) {
    return null;
  }

  return {
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? now,
    activeMs: active,
    distanceM: session.distanceM,
    vehicleM: session.vehicleM,
    steps: session.steps,
    route: simplifyRouteForDisplay(session.points),
    habitIds: session.habitIds,
    mood: session.mood,
    note: session.note,
    synced: false
  };
}

/** Files a finished outing, newest first. */
export function recordWalk(state: WalkState, record: WalkRecord): WalkState {
  return {
    ...state,
    active: null,
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

/** Every metre ever recorded on foot. What the milestones are measured against. */
export function lifetimeDistanceM(history: WalkRecord[]): number {
  return history.reduce((total, record) => total + record.distanceM, 0);
}

export type MilestoneStanding = {
  milestone: Milestone;
  passed: boolean;
  /** 0–1 toward this one. 1 once passed. */
  ratio: number;
  /** Metres still to go, 0 once passed. */
  remainingM: number;
};

/**
 * Where every milestone stands against the lifetime total.
 *
 * Derived on every read rather than stored, which is what makes deleting an
 * outing take its contribution with it instead of leaving a total that no
 * longer matches the walks behind it.
 */
export function milestoneStandings(history: WalkRecord[]): MilestoneStanding[] {
  const total = lifetimeDistanceM(history);

  return MILESTONES.map((milestone) => ({
    milestone,
    passed: total >= milestone.targetM,
    ratio: Math.min(1, total / milestone.targetM),
    remainingM: Math.max(0, milestone.targetM - total)
  }));
}

/**
 * The next one to pass, or null once they are all behind you.
 *
 * The only milestone the setup screen shows. Not a list to choose from — there
 * is nothing to choose, which is the point.
 */
export function nextMilestone(history: WalkRecord[]): MilestoneStanding | null {
  return milestoneStandings(history).find((standing) => !standing.passed) ?? null;
}

/**
 * Which milestones an outing carried you past.
 *
 * Compares the total before it against the total after, so an outing long
 * enough to cross two of them reports both — and one that crossed none reports
 * nothing rather than re-announcing a marker passed last week.
 */
export function milestonesCrossedBy(historyBefore: WalkRecord[], record: WalkRecord): Milestone[] {
  const before = lifetimeDistanceM(historyBefore);
  const after = before + record.distanceM;

  return MILESTONES.filter((milestone) => before < milestone.targetM && after >= milestone.targetM);
}

/**
 * Consecutive days ending today (or yesterday) with an outing on them.
 *
 * Counted back from yesterday when today has none, so the streak someone built
 * does not read as broken until they have actually missed a whole day. The same
 * grace the habit streak gives.
 *
 * `dayKeyOf` is passed in rather than computed, because turning an instant into
 * a local day is `lib/date`'s job and this module deliberately imports nothing.
 */
export function outingStreak(history: WalkRecord[], todayKey: string, dayKeyOf: (at: number) => string, previousKey: (key: string) => string): number {
  const days = new Set(history.map((record) => dayKeyOf(record.startedAt)));

  let cursor = days.has(todayKey) ? todayKey : previousKey(todayKey);
  let streak = 0;

  while (days.has(cursor)) {
    streak += 1;
    cursor = previousKey(cursor);
  }

  return streak;
}

/** The longest single outing on record, in metres. 0 when there are none. */
export function personalBestM(history: WalkRecord[]): number {
  return history.reduce((best, record) => Math.max(best, record.distanceM), 0);
}

/**
 * The one line of encouragement the setup screen opens with.
 *
 * Ranked so the most specific true thing wins. Every branch is a FACT about
 * what someone has already done — never a target, never a nudge about what they
 * ought to do next. "You have walked 4 days running" earns its place; "time for
 * a walk!" does not.
 */
export function encouragement(history: WalkRecord[], streak: number, weekOutings: number): string {
  if (history.length === 0) {
    return "Press start and go. Lumo will take care of the rest.";
  }

  if (streak >= 2) {
    return `${streak} days in a row. That is the hard part done.`;
  }

  if (weekOutings >= 3) {
    return `${weekOutings} times out this week. That is a habit, not a fluke.`;
  }

  if (weekOutings >= 1) {
    return `${weekOutings === 1 ? "Once" : `${weekOutings} times`} out this week already.`;
  }

  return `${history.length} ${history.length === 1 ? "outing" : "outings"} behind you. Ready for another?`;
}

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
    accuracy: Number.isFinite(raw.accuracy) ? (raw.accuracy as number) : MAX_ACCURACY_M,
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

  const rawActive = raw.active;
  let active: WalkSession | null = null;

  if (
    rawActive &&
    typeof rawActive === "object" &&
    typeof rawActive.id === "string" &&
    Number.isFinite(rawActive.startedAt) &&
    (rawActive.status === "active" || rawActive.status === "paused")
  ) {
    active = {
      id: rawActive.id,
      status: rawActive.status,
      startedAt: rawActive.startedAt,
      endedAt: null,
      accumulatedMs: Number.isFinite(rawActive.accumulatedMs) ? Math.max(0, rawActive.accumulatedMs as number) : 0,
      // A non-finite `runningSince` restores as PAUSED rather than being
      // discarded: the banked time is real, and resuming is one tap.
      runningSince: Number.isFinite(rawActive.runningSince) ? (rawActive.runningSince as number) : null,
      points: Array.isArray(rawActive.points) ? rawActive.points.map(normalizePoint).filter((p): p is WalkPoint => p !== null) : [],
      distanceM: Number.isFinite(rawActive.distanceM) ? Math.max(0, rawActive.distanceM as number) : 0,
      vehicleM: Number.isFinite(rawActive.vehicleM) ? Math.max(0, rawActive.vehicleM as number) : 0,
      // The streak deliberately does NOT survive a restart. It is a claim about
      // the last thirty seconds, and the app was not running for them — so a
      // resumed outing starts over rather than discarding the first legs back
      // on the strength of a streak from before lunch.
      pendingM: 0,
      vehicleStreak: 0,
      movement: "unknown",
      steps: Number.isFinite(rawActive.steps) ? (rawActive.steps as number) : null,
      habitIds: Array.isArray(rawActive.habitIds) ? rawActive.habitIds.filter((id): id is string => typeof id === "string") : [],
      mood: rawActive.mood,
      note: rawActive.note
    };

    if (active.runningSince === null) {
      active.status = "paused";
    }
  }

  return { active, history };
}
