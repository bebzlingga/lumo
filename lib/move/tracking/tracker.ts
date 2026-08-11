import { TRACKING_CONFIG, type ActivityType } from "@/lib/move/tracking/config";
import { breaksSegment, filterLocationPoint } from "@/lib/move/tracking/filter";
import { gpsQualityFrom, isMovement, stepMovement } from "@/lib/move/tracking/movement";
import type {
  ActivitySegment,
  ActivityTrackingState,
  ProcessResult,
  RawLocationPoint
} from "@/lib/move/tracking/types";

/**
 * The tracking engine.
 *
 * Pure functions over a state object: no timers, no subscriptions, no React,
 * and `now` is always passed in. Everything the tracker DECIDES lives here and
 * can be tested by feeding it a list of fixes — which is the only way to test a
 * tracker at all, since the alternative is going for a walk.
 *
 * The device half — starting the OS location updates, the background task, the
 * pedometer, writing to disk — belongs to the caller. This module never touches
 * any of it.
 *
 * ## The pipeline, in order
 *
 *   raw fix → quality filter → segment check → distance → movement state →
 *   auto-pause → clock
 *
 * Distance is only ever added between two ACCEPTED fixes inside ONE segment,
 * while the activity is neither paused nor stopped. Every stage can only ever
 * reduce what counts; nothing downstream can put back what the filter rejected.
 */

export type StartInput = {
  activityId: string;
  type: ActivityType;
  now: number;
  autoPause?: boolean;
};

/**
 * A new activity, in the acquisition phase.
 *
 * `preparing` rather than `active`: the first fixes after a cold start are
 * routinely hundreds of metres out, and a walk that opens with a 300 m jump has
 * lost before it began. Fixes still arrive and still set the signal indicator —
 * they simply do not count. The caller promotes with `beginTracking` once the
 * signal is good, or once it has waited long enough.
 */
export function createActivity(input: StartInput): ActivityTrackingState {
  return {
    activityId: input.activityId,
    type: input.type,
    status: "preparing",
    startedAt: input.now,
    lastTickAt: input.now,
    elapsedDuration: 0,
    movingDuration: 0,
    pausedDuration: 0,
    distanceMeters: 0,
    steps: null,
    movement: "moving",
    movementSince: input.now,
    lastMovementAt: input.now,
    gpsQuality: "unavailable",
    lastAccuracyM: null,
    segments: [],
    rawPoints: [],
    manuallyPaused: false,
    autoPauseEnabled: input.autoPause ?? TRACKING_CONFIG.autoPause.enabled
  };
}

/** Leaves the acquisition phase. The activity's clock starts HERE. */
export function beginTracking(state: ActivityTrackingState, now: number): ActivityTrackingState {
  if (state.status !== "preparing") {
    return state;
  }

  return {
    ...state,
    status: "active",
    // Reset, so the seconds spent waiting for a fix are not reported as walking.
    startedAt: now,
    lastTickAt: now,
    movementSince: now,
    lastMovementAt: now,
    segments: [newSegment(state.activityId, 0, now)]
  };
}

/**
 * Advances the clock to `now`.
 *
 * Called on every fix and on a display timer, and safe to call at any rate —
 * the durations are accumulated from the delta, so calling it twice as often
 * does not double anything.
 *
 * Elapsed time is wall clock and always advances. Moving and paused split the
 * same delta between them according to the state at the time. A delta longer
 * than `maxTickMs` — the app was suspended without background permission —
 * counts as elapsed only: a phone asleep in a pocket did not walk anywhere.
 */
export function tick(state: ActivityTrackingState, now: number): ActivityTrackingState {
  if (state.status === "preparing" || state.status === "finished") {
    return { ...state, lastTickAt: now };
  }

  const delta = Math.max(0, now - state.lastTickAt);
  const paused = state.status === "paused" || state.status === "autoPaused";

  /**
   * A delta longer than `maxTickMs` means nothing was processed for a while —
   * the app was suspended, or the OS throttled it.
   *
   * The two clocks treat that differently, and the difference is what is
   * KNOWN. A paused activity takes the whole gap as paused time: pausing and
   * resuming are user actions and both tick, so the state cannot have changed
   * while nobody was looking. A running one banks no moving time at all,
   * because whether those minutes were walked is exactly what we do not know —
   * and a phone asleep in a pocket did not walk anywhere.
   */
  const moving = !paused && state.movement === "moving" && delta <= TRACKING_CONFIG.maxTickMs;

  return {
    ...state,
    lastTickAt: now,
    elapsedDuration: state.elapsedDuration + delta,
    movingDuration: state.movingDuration + (moving ? delta : 0),
    pausedDuration: state.pausedDuration + (paused ? delta : 0),
    gpsQuality: gpsQualityFrom({ accuracyM: state.lastAccuracyM, lastFixAt: lastFixAt(state), now })
  };
}

/**
 * Takes one GPS fix through the pipeline.
 *
 * Always returns the point it built, accepted or not, and always stores it.
 * Rejected fixes are the only record of why a walk recorded the way it did.
 */
export function processLocation(
  state: ActivityTrackingState,
  sample: Omit<RawLocationPoint, "isAccepted" | "rejectionReason">,
  options: { now: number; steppingRecently?: boolean } = { now: sample.timestamp }
): ProcessResult {
  const now = options.now;
  const ticked = tick(state, now);
  const segment = ticked.segments[ticked.segments.length - 1];
  const previous = segment ? (segment.points[segment.points.length - 1] ?? null) : null;
  const beforePrevious = segment ? (segment.points[segment.points.length - 2] ?? null) : null;

  // Fixes outside a running activity set the signal indicator and nothing else.
  // `preparing` needs them for exactly that; a paused activity keeps listening
  // so the indicator is honest when the user resumes.
  if (ticked.status !== "active" && ticked.status !== "autoPaused") {
    const point: RawLocationPoint = { ...sample, isAccepted: false, rejectionReason: "notTracking" };

    return {
      state: withRawPoint(
        { ...ticked, lastAccuracyM: sample.horizontalAccuracy ?? null, gpsQuality: gpsQualityFrom({ accuracyM: sample.horizontalAccuracy ?? null, lastFixAt: sample.timestamp, now }) },
        point
      ),
      point,
      distanceDeltaM: 0
    };
  }

  const verdict = filterLocationPoint({
    point: sample,
    previous,
    beforePrevious,
    newestAt: newestTimestamp(ticked, sample.timestamp),
    type: ticked.type,
    steppingRecently: options.steppingRecently
  });

  const point: RawLocationPoint = verdict.accepted
    ? { ...sample, isAccepted: true }
    : { ...sample, isAccepted: false, rejectionReason: verdict.reason };

  let next: ActivityTrackingState = {
    ...ticked,
    lastAccuracyM: sample.horizontalAccuracy ?? null,
    gpsQuality: gpsQualityFrom({ accuracyM: sample.horizontalAccuracy ?? null, lastFixAt: sample.timestamp, now })
  };

  if (!verdict.accepted) {
    // A rejected fix is still information about whether the person is moving:
    // it says nothing happened here. The movement clock keeps running on it.
    const outcome = stepMovement({
      state: next.movement,
      since: next.movementSince,
      lastMovementAt: next.lastMovementAt,
      now,
      moved: false
    });

    return {
      state: applyAutoPause(withRawPoint({ ...next, ...movementFields(outcome) }, point), now),
      point,
      distanceDeltaM: 0
    };
  }

  // A break in tracking starts a new segment, so nothing draws a line across
  // the gap and no distance is carried over it.
  if (breaksSegment(previous, sample)) {
    next = { ...next, segments: [...closeSegment(next.segments, sample.timestamp), newSegment(next.activityId, next.segments.length, sample.timestamp)] };
  }

  const elapsedMs = previous ? sample.timestamp - previous.timestamp : 0;
  const moved = isMovement({ legM: verdict.distanceM, elapsedMs, stepping: options.steppingRecently });
  const outcome = stepMovement({
    state: next.movement,
    since: next.movementSince,
    lastMovementAt: next.lastMovementAt,
    now,
    moved
  });

  /**
   * Distance is added only while genuinely tracking and genuinely moving.
   *
   * The `stopped` guard is what stops a phone on a café table accumulating: its
   * fixes still pass the filter now and then, and without this they would trickle
   * distance into a walk that ended twenty minutes ago.
   */
  const counts = next.status === "active" && outcome.state !== "stopped";
  const distanceDeltaM = counts ? verdict.distanceM : 0;

  next = {
    ...next,
    ...movementFields(outcome),
    distanceMeters: next.distanceMeters + distanceDeltaM,
    segments: appendPoint(next.segments, point)
  };

  return { state: applyAutoPause(withRawPoint(next, point), now), point, distanceDeltaM };
}

/**
 * Auto-pause, which is only ever the tracker's own opinion.
 *
 * A manual pause is never lifted here — that is the whole distinction between
 * the two states. `autoPaused` lifts itself the moment movement returns.
 */
function applyAutoPause(state: ActivityTrackingState, now: number): ActivityTrackingState {
  if (!state.autoPauseEnabled || state.manuallyPaused || state.status === "finished" || state.status === "preparing") {
    return state;
  }

  if (state.status === "active" && state.movement === "stopped") {
    return { ...state, status: "autoPaused" };
  }

  if (state.status === "autoPaused" && state.movement === "moving") {
    // Resuming opens a NEW segment: the fixes either side of a stop are minutes
    // and possibly metres apart, and joining them would invent a leg.
    return {
      ...state,
      status: "active",
      segments: [...closeSegment(state.segments, now), newSegment(state.activityId, state.segments.length, now)]
    };
  }

  return state;
}

/** The user's pause. Outranks anything the tracker thinks. */
export function pauseActivity(state: ActivityTrackingState, now: number): ActivityTrackingState {
  if (state.status !== "active" && state.status !== "autoPaused") {
    return state;
  }

  return { ...tick(state, now), status: "paused", manuallyPaused: true, segments: closeSegment(state.segments, now) };
}

/**
 * The user's resume, which always starts a new segment.
 *
 * Without that, the first fix after a twenty-minute break would be measured
 * against the last fix before it — a straight line across however far the
 * person walked, drove or was carried in between, counted as distance.
 */
export function resumeActivity(state: ActivityTrackingState, now: number): ActivityTrackingState {
  if (state.status !== "paused") {
    return state;
  }

  return {
    ...tick(state, now),
    status: "active",
    manuallyPaused: false,
    movement: "moving",
    movementSince: now,
    lastMovementAt: now,
    segments: [...state.segments, newSegment(state.activityId, state.segments.length, now)]
  };
}

export function finishActivity(state: ActivityTrackingState, now: number): ActivityTrackingState {
  if (state.status === "finished") {
    return state;
  }

  return { ...tick(state, now), status: "finished", finishedAt: now, segments: closeSegment(state.segments, now) };
}

/**
 * Brings a stored activity back after a crash or a cold start.
 *
 * The gap since the last tick is attributed to ELAPSED time only, and tracking
 * resumes in a new segment. Nothing about what happened while the app was gone
 * can be known, so nothing is claimed: no distance, no moving time, no line on
 * the map between where it stopped and where it starts again.
 */
export function restoreActivity(state: ActivityTrackingState, now: number): ActivityTrackingState {
  if (state.status === "finished") {
    return state;
  }

  const gap = Math.max(0, now - state.lastTickAt);

  return {
    ...state,
    lastTickAt: now,
    elapsedDuration: state.elapsedDuration + gap,
    movement: "possiblyStopped",
    movementSince: now,
    lastMovementAt: now,
    gpsQuality: "unavailable",
    segments: [...closeSegment(state.segments, state.lastTickAt), newSegment(state.activityId, state.segments.length, now)]
  };
}

/** Steps from the pedometer. Never touches distance — see `filter.ts`. */
export function setSteps(state: ActivityTrackingState, steps: number): ActivityTrackingState {
  return { ...state, steps: Math.max(0, Math.round(steps)) };
}

// --- helpers ----------------------------------------------------------------

function newSegment(activityId: string, index: number, startedAt: number): ActivitySegment {
  return { id: `${activityId}-${index}`, startedAt, points: [] };
}

function closeSegment(segments: ActivitySegment[], endedAt: number): ActivitySegment[] {
  if (segments.length === 0) {
    return segments;
  }

  const last = segments[segments.length - 1];

  return last.endedAt === undefined ? [...segments.slice(0, -1), { ...last, endedAt }] : segments;
}

function appendPoint(segments: ActivitySegment[], point: RawLocationPoint): ActivitySegment[] {
  if (segments.length === 0) {
    return segments;
  }

  const last = segments[segments.length - 1];

  return [...segments.slice(0, -1), { ...last, points: [...last.points, point] }];
}

/**
 * Keeps every fix, bounded.
 *
 * The oldest go first when the cap is reached — a three-hour ceiling at one fix
 * a second — because the recent ones are what explain a problem being looked at
 * now. The ROUTE is not affected: accepted points live in their segments.
 */
function withRawPoint(state: ActivityTrackingState, point: RawLocationPoint): ActivityTrackingState {
  const raw = [...state.rawPoints, point];

  return { ...state, rawPoints: raw.length > TRACKING_CONFIG.storage.maxRawPoints ? raw.slice(-TRACKING_CONFIG.storage.maxRawPoints) : raw };
}

function movementFields(outcome: { state: ActivityTrackingState["movement"]; since: number; lastMovementAt: number }) {
  return { movement: outcome.state, movementSince: outcome.since, lastMovementAt: outcome.lastMovementAt };
}

function lastFixAt(state: ActivityTrackingState): number | null {
  const last = state.rawPoints[state.rawPoints.length - 1];

  return last ? last.timestamp : null;
}

function newestTimestamp(state: ActivityTrackingState, candidate: number): number {
  return Math.max(lastFixAt(state) ?? 0, candidate);
}

/** Every accepted fix, in order, across every segment. The route. */
export function routePoints(state: ActivityTrackingState): RawLocationPoint[] {
  return state.segments.flatMap((segment) => segment.points);
}
