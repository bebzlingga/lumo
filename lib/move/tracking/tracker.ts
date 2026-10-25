import { TRACKING_CONFIG, type ActivityType } from "@/lib/move/tracking/config";
import { breaksSegment, filterLocationPoint } from "@/lib/move/tracking/filter";
import { gpsQualityFrom, isMovement, movementThresholds, stepMovement } from "@/lib/move/tracking/movement";
import { smoothFix } from "@/lib/move/tracking/smoothing";
import { calculateDistance } from "@/lib/walk";
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
  now: number;
  autoPause?: boolean;
  /** Display names of whoever came along. See `ActivityTrackingState`. */
  companions?: string[];
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
    // Provisional, and rewritten at the finish from what was actually recorded
    // — see `classifyActivity`. Nobody is asked to choose.
    type: "walk",
    status: "preparing",
    startedAt: input.now,
    lastTickAt: input.now,
    elapsedDuration: 0,
    movingDuration: 0,
    pausedDuration: 0,
    distanceMeters: 0,
    walkingMeters: 0,
    runningMeters: 0,
    steps: null,
    movement: "moving",
    movementSince: input.now,
    lastMovementAt: input.now,
    gpsQuality: "unavailable",
    lastAccuracyM: null,
    lastLocatedAt: input.now,
    segments: [],
    rawPoints: [],
    companions: input.companions?.length ? input.companions : undefined,
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
    // The clock the signal is judged against starts here too. Promotion means a
    // fix just landed, and where it did not — the acquisition timed out — the
    // walk deserves the full window before being told it is lost.
    lastLocatedAt: now,
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
export function tick(
  state: ActivityTrackingState,
  now: number,
  /**
   * `autoPause: false` when a FIX is driving this tick.
   *
   * THE FLICKER THIS REMOVES IS WHY A WALK IN A POCKET RECORDED NOTHING. iOS
   * hands a suspended app its locations in batches, and the wake can be a long
   * way past the forty-second window — so the tick at the head of
   * `processLocation` saw "no fix for fifty seconds", auto-paused, and only then
   * did the fix that had just arrived update `lastLocatedAt` and lift it again.
   * Every single delivery went pause → pick up, and a pick-up discards the leg
   * that caused it. Distance stopped, the clock stopped, and the walk came back
   * from a locked screen with nothing on it.
   *
   * The fix's own timestamp is the answer to the question auto-pause is asking,
   * and it is already in hand. So the caller ticks without deciding, applies the
   * signal fields, and decides ONCE — see `processLocation`.
   */
  options: { autoPause?: boolean } = {}
): ActivityTrackingState {
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
  /**
   * The moving clock runs at `possiblyStopped` too, and STOPS when the evidence
   * for it goes stale. Two corrections to one line, both of which cost real
   * minutes off a walk.
   *
   * `!== "stopped"` rather than `=== "moving"`, first, because that is already
   * the rule DISTANCE is banked by (see `counts` in `processLocation`) and the
   * two have to agree: banking metres into a clock that is not running inflates
   * average pace by exactly the share of the walk spent in the middle state. And
   * `possiblyStopped` is documented as the state that decides nothing — it
   * exists so `stopped` can be slow — yet it was quietly deciding this.
   *
   * The freshness check, second, because `movement` is only ever updated by a
   * FIX. With no fixes at all — a tunnel, a pocket, a receiver that gave up —
   * the last one to arrive said "moving" and the clock went on crediting minutes
   * to a walk nothing was watching. Auto-pause eventually catches it, but only
   * after forty seconds, and only when it is enabled. Movement seen longer ago
   * than the detector's own stop threshold is not evidence about now.
   */
  const staleAfterMs = movementThresholds(state.lastAccuracyM).stoppedAfterMs;
  const evidenceFresh = now - state.lastMovementAt < staleAfterMs;
  const moving = !paused && state.movement !== "stopped" && evidenceFresh && delta <= TRACKING_CONFIG.maxTickMs;

  /**
   * Auto-pause is applied HERE as well as on every fix, because the state it
   * watches for is the absence of fixes. A signal that dies completely delivers
   * nothing to notice it with, so the display clock is what notices.
   */
  const ticked: ActivityTrackingState = {
    ...state,
    lastTickAt: now,
    elapsedDuration: state.elapsedDuration + delta,
    movingDuration: state.movingDuration + (moving ? delta : 0),
    pausedDuration: state.pausedDuration + (paused ? delta : 0),
    gpsQuality: gpsQualityFrom({ accuracyM: state.lastAccuracyM, lastFixAt: lastFixAt(state), now })
  };

  return options.autoPause === false ? ticked : applyAutoPause(ticked, now);
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
  // Ticked WITHOUT the auto-pause decision — this fix is about to answer it.
  const ticked = tick(state, now, { autoPause: false });
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
        {
          ...ticked,
          ...signalFields(ticked, sample, now),
          gpsQuality: gpsQualityFrom({ accuracyM: sample.horizontalAccuracy ?? null, lastFixAt: sample.timestamp, now })
        },
        point
      ),
      point,
      distanceDeltaM: 0
    };
  }

  /**
   * Whether this fix breaks the segment, decided BEFORE it is smoothed.
   *
   * Order matters: blending a fix from the far side of a tunnel into the
   * estimate held before it would drag the first point of the new segment back
   * toward the old one, putting the route's fresh start somewhere nobody was.
   * A break restarts the estimate from this fix alone.
   */
  const breaks = breaksSegment(previous, sample);
  const smoothed = smoothFix(breaks ? null : (ticked.smoothing ?? null), sample);

  /**
   * THE FILTER JUDGES THE RAW FIX; THE DISTANCE IS MEASURED ON THE ESTIMATE.
   *
   * Acceptance stays raw so the jitter floor sees what the receiver said. But
   * summing raw legs sums the receiver's wander too — simulated, that read
   * 20–70% long on a walk and hundreds of metres for ten minutes standing still.
   * The velocity model has no steady-state lag, so the smoothed legs are not
   * short; they are just quiet. See `legM` below.
   */
  const verdict = filterLocationPoint({
    point: sample,
    previous,
    beforePrevious,
    newestAt: newestTimestamp(ticked, sample.timestamp),
    steppingRecently: options.steppingRecently
  });

  /**
   * Whether the estimate keeps what this fix told it.
   *
   * A fix rejected as JITTER is a good reading of somebody standing still, and
   * folding it in is how the estimate settles instead of wandering. Every other
   * rejection is a reading we do not believe — too vague, a jump, out of order —
   * and the estimate is better off not having seen it.
   */
  const trusted = verdict.accepted || verdict.reason === "jitter";

  const point: RawLocationPoint = verdict.accepted
    ? { ...sample, isAccepted: true, drawLatitude: smoothed.latitude, drawLongitude: smoothed.longitude }
    : { ...sample, isAccepted: false, rejectionReason: verdict.reason };

  let next: ActivityTrackingState = {
    ...ticked,
    ...signalFields(ticked, sample, now),
    gpsQuality: gpsQualityFrom({ accuracyM: sample.horizontalAccuracy ?? null, lastFixAt: sample.timestamp, now }),
    smoothing: trusted ? smoothed : ticked.smoothing
  };

  /**
   * THE ONE AUTO-PAUSE DECISION FOR THIS FIX, TAKEN AFTER THE SIGNAL FIELDS.
   *
   * By here `lastLocatedAt` knows about the fix in hand, so a delivery that
   * arrived late — the ordinary case with the screen off — is judged on when it
   * was TAKEN rather than on how long we were asleep before hearing about it.
   *
   * It is also taken before the fix is placed in a segment, which the old order
   * got wrong the other way round: lifting an auto-pause opens a segment, and
   * doing that on the way OUT meant the fix that caused the lift had already
   * been appended to the segment being closed behind it.
   */
  const wasAutoPaused = next.status === "autoPaused";

  next = applyAutoPause(next, now);

  /**
   * A GENUINE pick-up: the app was awake, the receiver produced nothing for the
   * whole window, and this fix is the first one back.
   *
   * Rare again now that a late delivery no longer auto-pauses on its way in.
   * Before that it fired on every background batch, and since a pick-up throws
   * the leg away, a walk with the screen off threw away everything it recorded.
   */
  const pickedUp = wasAutoPaused && next.status === "active";

  if (!verdict.accepted) {
    /**
     * A rejected fix is still information about whether the person is moving:
     * it says nothing happened here. The movement clock keeps running on it.
     *
     * WITH ONE EXCEPTION, and it is the difference between an indoor walk
     * timing itself and freezing. A fix thrown out for ACCURACY is not evidence
     * of stillness — it is the absence of evidence, and reading it as "no
     * movement" is how a walk through a mall, a market or a wooded path stopped
     * its moving clock while the walker was plainly walking. Every other
     * rejection has a usable fix behind it and genuinely does say nothing
     * happened: jitter in particular is a GOOD reading of somebody standing
     * still, and must keep counting as quiet.
     *
     * The pedometer is what fills the gap, and only ever in that one case. It
     * says WHETHER, never where — so this can move the moving clock and can
     * never move the distance, which stays where it belongs: between two fixes
     * the filter believed.
     */
    const blind = verdict.reason === "accuracy" && options.steppingRecently === true;

    const outcome = stepMovement({
      state: next.movement,
      since: next.movementSince,
      lastMovementAt: next.lastMovementAt,
      resumingSince: next.resumingSince,
      now,
      moved: blind,
      // The accuracy of THIS fix, because that is what set the minimum leg it
      // was just judged against — and therefore how long quiet has to last
      // before it means anything. See `movementThresholds`.
      accuracyM: sample.horizontalAccuracy ?? null,
      stepping: options.steppingRecently
    });

    return {
      state: withRawPoint({ ...next, ...movementFields(outcome) }, point),
      point,
      distanceDeltaM: 0
    };
  }

  /**
   * A break in tracking starts a new segment, so nothing draws a line across
   * the gap and no distance is carried over it.
   *
   * ONE RULE DECIDES THIS, and it is `breaksSegment` — not whether the tracker
   * happened to be auto-paused. Lifting an auto-pause used to open a segment of
   * its own and throw the leg away with it, on the theory that anything spanning
   * a lost signal is a blackout. But auto-pause fires at forty seconds and a
   * segment breaks at sixty, so every gap in between was treated as a blackout
   * by one rule and as ordinary walking by the other. Sparse background
   * deliveries live squarely in that window, which is how a walk with the screen
   * off threw away every leg it recorded.
   *
   * A pick-up has already opened one, and a second empty segment helps nobody.
   */
  if (breaks && !pickedUp) {
    next = { ...next, segments: [...closeSegment(next.segments, sample.timestamp), newSegment(next.activityId, next.segments.length, sample.timestamp)] };
  }

  /**
   * What this leg is worth, which is nothing when it spans a real blackout.
   *
   * The filter measured this fix against the last one before the signal died,
   * because that was the newest point in the segment at the time. That distance
   * was not walked in front of us: it is the gap itself. The fix is still where
   * you are and it opens the new segment, but it carries no leg — exactly as the
   * first fix of any segment does not.
   */
  const legM =
    pickedUp || !previous || verdict.distanceM === 0
      ? 0
      : calculateDistance(
          { lat: previous.drawLatitude ?? previous.latitude, lon: previous.drawLongitude ?? previous.longitude },
          { lat: smoothed.latitude, lon: smoothed.longitude }
        );
  const elapsedMs = previous && !pickedUp ? sample.timestamp - previous.timestamp : 0;
  const moved = isMovement({ legM, elapsedMs, stepping: options.steppingRecently, platformSpeedMs: sample.speed });
  const outcome = stepMovement({
    state: next.movement,
    since: next.movementSince,
    lastMovementAt: next.lastMovementAt,
    resumingSince: next.resumingSince,
    legMs: elapsedMs,
    now,
    moved,
    accuracyM: sample.horizontalAccuracy ?? null,
    stepping: options.steppingRecently
  });

  /**
   * Distance is added only while genuinely tracking and genuinely moving.
   *
   * The `stopped` guard is what stops a phone on a café table accumulating: its
   * fixes still pass the filter now and then, and without this they would trickle
   * distance into a walk that ended twenty minutes ago.
   */
  const counts = next.status === "active" && outcome.state !== "stopped";
  const distanceDeltaM = counts ? legM : 0;

  /**
   * Moving time the TICK refused, which this fix can vouch for.
   *
   * `maxTickMs` exists so a phone that slept in a pocket for an hour does not
   * report an hour of walking — the clock cannot credit a gap nothing was
   * watching. But a gap closed by an accepted, moving leg was watched: the
   * receiver was awake the whole time and has just handed over the proof, even
   * though the app was suspended and no timer ran. Without this, a walk with the
   * screen off kept perfect distance and reported almost no moving time, because
   * every background delivery landed past the cap.
   *
   * Bounded by the leg's own span, so it can never credit more time than the two
   * fixes actually stand between, and it only ever fires on a leg that counted —
   * which the filter has already limited to `segmentBreakMs`.
   */
  const withheldMs = ticked.lastTickAt - state.lastTickAt;
  const vouchedMs =
    ticked.movingDuration === state.movingDuration && withheldMs > TRACKING_CONFIG.maxTickMs && distanceDeltaM > 0 && moved
      ? Math.min(withheldMs, elapsedMs)
      : 0;

  // Which side of running speed this leg fell on. Judged per leg, which is the
  // only place it can be judged: an outing that walked, ran and walked again is
  // three answers, not one.
  const running = elapsedMs > 0 && distanceDeltaM / (elapsedMs / 1000) >= TRACKING_CONFIG.speed.runningMs;

  next = {
    ...next,
    ...movementFields(outcome),
    movingDuration: next.movingDuration + vouchedMs,
    distanceMeters: next.distanceMeters + distanceDeltaM,
    walkingMeters: next.walkingMeters + (running ? 0 : distanceDeltaM),
    runningMeters: next.runningMeters + (running ? distanceDeltaM : 0),
    segments: appendPoint(next.segments, point)
  };

  return { state: withRawPoint(next, point), point, distanceDeltaM };
}

/**
 * Auto-pause, which is only ever the tracker's own opinion.
 *
 * ONE trigger: the tracker cannot locate you. Not stillness — see the note on
 * `autoPause` in the config for why standing at a crossing stopped being this
 * function's business. A manual pause is never lifted here, which is the whole
 * distinction between the two states.
 *
 * It lifts itself on the first accurate fix, with no hysteresis on the way back
 * up on purpose: coming out of a tunnel, the honest thing is to start recording
 * again immediately, and the cost of being wrong is one resumed second.
 *
 * LIFTING IT IS THIS FUNCTION'S JOB ALONE. The walker cannot resume out of an
 * auto-pause, because there is nothing on the other side of that button for them
 * to resume INTO: the tracker cannot place them, so carrying on would record
 * elapsed time against no route and no distance. See `resumeActivity`.
 */
function applyAutoPause(state: ActivityTrackingState, now: number): ActivityTrackingState {
  if (!state.autoPauseEnabled || state.manuallyPaused || state.status === "finished" || state.status === "preparing") {
    return state;
  }

  const lost = now - state.lastLocatedAt >= TRACKING_CONFIG.autoPause.signalLostAfterMs;

  if (state.status === "active" && lost) {
    return { ...state, status: "autoPaused" };
  }

  if (state.status === "autoPaused" && !lost) {
    // Resuming opens a NEW segment: the fixes either side of a blackout can be
    // minutes and half a mile apart, and joining them would invent a leg.
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
 *
 * A MANUAL PAUSE ONLY, and the asymmetry with `pauseActivity` is deliberate.
 *
 * You may lift what you set. What the TRACKER set is not yours to lift, because
 * there is nothing on the other side of that button to resume into: an
 * auto-pause means the tracker cannot place you, and carrying on from one would
 * bank elapsed time against no route, no distance and no pace — a walk that
 * looks recorded and is not. It lifts itself the instant a fix lands, which is
 * the only moment there is anything to carry on WITH; see `applyAutoPause`.
 *
 * The screen must therefore not offer Resume during an auto-pause at all. A
 * button that returns the state untouched is the worst of the three options,
 * and it is what this used to be.
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
    // Same grace a fresh start gets: a walk resumed after twenty minutes in a
    // café must not auto-pause on the strength of how old the last fix is.
    lastLocatedAt: now,
    // And the position estimate goes with it: wherever the walk picks up, it is
    // not to be pulled back toward where it stopped.
    smoothing: undefined,
    /**
     * Closed, THEN opened. A manual pause closes the stretch on its way in, but
     * an auto-pause does not — it is a state the tracker may lift again by
     * itself, and closing on every signal dip would shred the route into
     * segments. So resuming one left the old stretch open beside the new one,
     * and a walk that lost signal three times finished with three segments that
     * never ended.
     */
    segments: [...closeSegment(state.segments, now), newSegment(state.activityId, state.segments.length, now)]
  };
}

export function finishActivity(state: ActivityTrackingState, now: number): ActivityTrackingState {
  if (state.status === "finished") {
    return state;
  }

  return {
    ...tick(state, now),
    status: "finished",
    // The label is set HERE, from the recording, and nowhere else.
    type: classifyActivity(state),
    finishedAt: now,
    segments: closeSegment(state.segments, now)
  };
}

/**
 * What the activity turned out to be.
 *
 * A walk if almost none of it was run, a run if almost none was walked, and
 * mixed for everything in between — which is what a warm-up, a run and a walk
 * home actually is. `mixedShare` is the band: a fifth of the distance either
 * way is enough to say both happened.
 *
 * Nothing rides on this but the label and the summary's title. Distance, pace
 * and challenge credit are identical whichever it returns.
 */
export function classifyActivity(state: ActivityTrackingState): ActivityType {
  const total = state.walkingMeters + state.runningMeters;

  if (total <= 0) {
    return "walk";
  }

  const runShare = state.runningMeters / total;
  const share = TRACKING_CONFIG.speed.mixedShare;

  if (runShare >= 1 - share) {
    return "run";
  }

  return runShare <= share ? "walk" : "mixed";
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
    lastLocatedAt: now,
    smoothing: undefined,
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

function movementFields(outcome: { state: ActivityTrackingState["movement"]; since: number; lastMovementAt: number; resumingSince?: number }) {
  return { movement: outcome.state, movementSince: outcome.since, lastMovementAt: outcome.lastMovementAt, resumingSince: outcome.resumingSince };
}

/**
 * What a fix says about the signal, before anything is decided about the leg.
 *
 * `lastLocatedAt` takes the fix's own timestamp rather than `now`: a batch the
 * OS deferred for fifteen seconds still proves we knew where the phone was at
 * the time, and stamping it with the arrival would make late delivery look like
 * lost signal. Never moves backwards, since a batch can arrive out of order.
 */
function signalFields(
  state: ActivityTrackingState,
  sample: { horizontalAccuracy?: number | null; timestamp: number },
  now: number
): Pick<ActivityTrackingState, "lastAccuracyM" | "lastLocatedAt"> {
  const accuracy = sample.horizontalAccuracy ?? null;
  /**
   * The same gate the filter judges by, and deliberately not the tighter
   * indicator bands: a fix that may join the route is a fix that located you.
   * A missing accuracy is trusted for the same reason the filter trusts it —
   * Android leaves it null, and reading that as "lost" would pause those phones
   * for the whole walk.
   */
  const located = accuracy === null || accuracy <= TRACKING_CONFIG.location.rejectAccuracyAboveM;

  return {
    lastAccuracyM: accuracy,
    lastLocatedAt: located ? Math.max(state.lastLocatedAt, Math.min(sample.timestamp, now)) : state.lastLocatedAt
  };
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
