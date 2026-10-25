/**
 * Every number the tracker judges by, in one place.
 *
 * Thresholds live here rather than in the module that happens to use them,
 * because tuning a tracker is tuning these against EACH OTHER: raising the
 * accuracy gate changes how often the movement detector sees a point, which
 * changes how quickly auto-pause fires. Scattered constants make that
 * impossible to reason about, and impossible to change per activity type.
 *
 * Every value is documented with what it is for and what breaks either side of
 * it. They are starting points measured against the phone, not laws.
 */

/**
 * What an activity turned out to BE, decided from the recording rather than
 * asked for up front.
 *
 * Nobody is made to declare it, for two reasons. The label's only mechanical
 * job was setting the speed ceiling, and getting it wrong threw away real
 * movement: a jog recorded as a walk had its fastest legs rejected as
 * impossible. And plenty of outings are genuinely both — a warm-up walk, a run,
 * a walk home — which no single choice describes.
 */
export type ActivityType = "walk" | "run" | "mixed";

export const TRACKING_CONFIG = {
  location: {
    /**
     * The accuracy we ask the OS for, in metres. Not a promise — the receiver
     * gives what it can — but it sets how hard it tries, and therefore the
     * battery cost.
     */
    desiredAccuracyM: 10,
    /**
     * Fixes worse than this never join the route.
     *
     * 40 m is deliberately looser than the 30 m the old walk model used: under
     * tree cover and between tall buildings a phone spends real stretches in
     * the 30–40 m band, and rejecting all of it leaves a walk with holes that
     * read as the app having stopped. Points in that band still move the route;
     * the movement detector and the minimum leg keep them from inventing
     * distance while standing still.
     */
    rejectAccuracyAboveM: 40,
    /**
     * How far ahead of the last accepted fix the acquisition phase will wait
     * for something better before starting anyway.
     */
    startupAccuracyM: 25,
    /** Longest the acquisition phase may hold someone before it gives up. */
    startupTimeoutMs: 15_000,
    /**
     * A fix older than this against the newest one already processed is stale —
     * a queued background delivery arriving out of order, typically.
     */
    maxAgeMs: 30_000,
    /** Distance under which two fixes are the same fix. Kills exact repeats. */
    duplicateM: 0.5
  },

  speed: {
    /**
     * The ceiling every leg is judged against, in metres per second.
     *
     * ONE ceiling, not one per activity type. 12 m/s is 43 km/h — past
     * world-record sprint pace — so nothing a person does on foot is ever
     * rejected by it, whether they walked, ran, or did both in one outing.
     *
     * The cost of the generous number is that a receiver jumping 20 m between
     * two fixes is no longer impossible on its face. That case is caught
     * further down instead, by the teleport check and the minimum leg, which
     * judge a fix against its NEIGHBOURS rather than against a label somebody
     * chose before setting off.
     */
    maxMs: 12,
    /**
     * Above this, a leg was run rather than walked. 2.2 m/s is about 8 km/h —
     * a slow jog, and comfortably above a brisk walk.
     *
     * Used only to describe an activity afterwards. Nothing is rejected by it.
     */
    runningMs: 2.2,
    /**
     * The share of distance that has to be running for an activity to be called
     * a run, and walking for it to be called a walk. Anything between the two
     * is mixed, which is what most real outings are.
     */
    mixedShare: 0.2
  },

  distance: {
    /**
     * Legs shorter than this are not counted.
     *
     * This is the single most important number in the tracker. A phone at rest
     * wanders by a couple of metres a second; at 3 m a stationary walk gains
     * kilometres an hour. Too high and a genuinely slow walker stops
     * accumulating — at 5 m a 3 km/h stroll sampled every second would have
     * most of its legs discarded, which is why this sits at 3 and the
     * movement detector does the rest of the work.
     */
    minLegM: 3,
    /**
     * How much of a fix's own claimed error a leg has to clear before it counts.
     *
     * THE FLAT FLOOR ABOVE IS ONLY HONEST AT A GOOD FIX. Three metres is the
     * right line when the receiver says ±5 m; at ±30 m — under trees, between
     * buildings, on a cloudy start — a "leg" of four metres is very likely the
     * same spot measured twice, and counting it is how a walk gains a kilometre
     * it never went. The floor therefore scales with what the receiver admits
     * to: at ±5 m it is the 3 m it always was, at ±30 m a leg has to be about
     * twenty metres to be believed.
     *
     * Nothing is LOST by raising it, which is the part worth understanding. A
     * rejected fix does not move the anchor the next one is measured from, so a
     * genuine walk through a bad patch simply accumulates in coarser steps —
     * four 20 m legs instead of twenty 4 m ones — and arrives at the same
     * distance. What it cannot do any more is accumulate the noise.
     */
    accuracyLegFactor: 0.7,
    /**
     * And a ceiling on that, so the gate cannot shut altogether.
     *
     * At the 40 m the accuracy filter allows, an unbounded factor would demand
     * 28 m legs, which is most of a city block — long enough that a real walk
     * would visibly stop counting. 20 m is the most this rule may ask for.
     */
    accuracyLegMaxM: 20,
    /**
     * A leg longer than this is treated as a break in the route rather than a
     * line to draw across: a tunnel, a lost signal, a phone that slept. The
     * distance is not counted and a new segment begins.
     */
    segmentBreakM: 150,
    /** Same idea in time: a gap this long ends the segment. */
    segmentBreakMs: 60_000
  },

  movement: {
    /** Below this, in m/s, a fix is not movement. Roughly 1.8 km/h. */
    stillSpeedMs: 0.5,
    /**
     * With steps counting, a reported (Doppler) speed this low still counts —
     * a slow shuffle. Below it the steps are someone fidgeting in place, and the
     * leg is drift: a speed of 0 must never be overruled by the pedometer.
     */
    steppingSpeedMs: 0.2,
    /** Consistent movement for this long promotes STOPPED back to MOVING. */
    resumeAfterMs: 3_000,
    /**
     * Quiet for this long demotes MOVING to POSSIBLY_STOPPED.
     *
     * A FLOOR, NOT THE WHOLE ANSWER — see `detectSpeedMs`.
     */
    possiblyStoppedAfterMs: 6_000,
    /** Still quiet this long after that, and it is a stop. Also a floor. */
    stoppedAfterMs: 12_000,
    /**
     * The walking speed the quiet thresholds above are scaled by, in m/s.
     *
     * THIS IS THE FIX FOR "MOVING TIME STOPS WHILE I AM WALKING", and the
     * reasoning is worth keeping. The detector only ever hears about movement
     * through ACCEPTED legs, and a leg is accepted once it clears
     * `minimumLegM` — which scales with the accuracy the receiver admits to
     * (`accuracyLegFactor`). At ±5 m the floor is 3.5 m and a walker clears it
     * every two or three seconds, so a flat six-second threshold is generous.
     * At ±25 m the floor is 17.5 m and the SAME walker clears it only every
     * twelve or thirteen seconds — so the flat twelve-second threshold fired
     * between every pair of legs, the detector latched on `stopped`, the moving
     * clock stopped and, because distance is only banked while not stopped, a
     * ten-minute walk recorded zero metres.
     *
     * The thresholds therefore cannot be constants: they have to be at least as
     * long as it TAKES the tracker to see movement at the accuracy it is
     * getting. 1.0 m/s is a slow walk, so the scaled window is what a genuinely
     * slow walker needs to clear the floor once. Standing still is unaffected —
     * drift never clears the floor at all, so the quiet simply grows until the
     * (larger) threshold is reached and the stop is called a few seconds later
     * than it used to be. Which is honest: at ±25 m you cannot tell any sooner.
     */
    detectSpeedMs: 1.0
  },

  autoPause: {
    /**
     * On by default, and overridable per activity. A MANUAL pause always wins
     * over whatever this decides.
     */
    enabled: true,
    /**
     * How long without an accurate fix before the tracker pauses itself.
     *
     * SIGNAL, NOT STILLNESS. Auto-pause used to fire when the movement detector
     * reached `stopped`, and it was wrong far more often than it was right: the
     * detector reads "quiet" during the whole GPS acquisition, so a walk paused
     * itself within seconds of setting off, and every dip past the accuracy gate
     * — a row of tall buildings, a bridge — paused it again mid-stride. Standing
     * still is already handled where it belongs: `movingDuration` only advances
     * while the detector says moving, and no distance is banked while stopped.
     * Nothing was gained by flipping the status too, and a walk that says
     * "paused" while you are walking is the app calling you a liar.
     *
     * So the only thing that pauses a recording by itself now is not knowing
     * where you are — which is the one state where carrying on genuinely
     * records nothing.
     *
     * 40 s. The window used to be set by `deferredUpdatesInterval` — iOS held
     * background deliveries for fifteen seconds, so the newest fix in hand was
     * routinely that old through no fault of the signal, and anything near it
     * read a batched delivery as a blackout. Deferring is off now (see
     * `backgroundLocation.ts`) and fixes arrive as they are taken, so this is
     * measured against the signal alone: forty seconds without knowing where
     * the phone is, awake or asleep, is a genuine blackout.
     */
    signalLostAfterMs: 40_000
  },

  pace: {
    /**
     * The rolling window current pace is measured over.
     *
     * Two points is noise: one 8 m jitter over a second reads as 2:05/km. At
     * 20 s the number moves smoothly enough to watch while still reacting
     * inside half a block.
     */
    windowMs: 20_000,
    /** And a floor on the distance in that window, for the same reason. */
    windowMinM: 20,
    /** Below this covered distance, pace is not a number worth showing. */
    minDistanceM: 10
  },

  steps: {
    /**
     * Steps in the last window that corroborate GPS movement.
     *
     * The pedometer is evidence, never the measure: GPS says how far, steps say
     * whether it happened. A leg with movement but no steps at all is drift.
     */
    corroborationWindowMs: 20_000,
    minStepsForMovement: 5
  },

  gps: {
    /** Accuracy bands, in metres, for the signal indicator. */
    excellentM: 8,
    goodM: 20,
    weakM: 40,
    /** No fix for this long and the indicator drops to unavailable. */
    staleAfterMs: 15_000
  },

  smoothing: {
    /**
     * The tightest error bar a fix is believed at, in metres.
     *
     * A receiver that claims ±1 m is claiming better than consumer GPS gives,
     * and taking that at face value makes the filter chase every reading — which
     * is the same as not filtering. Five is about the honest best case outdoors.
     */
    minAccuracyM: 5,
    /** What a fix with no accuracy at all is assumed to be worth. */
    assumedAccuracyM: 20,
    /**
     * How hard the walker is allowed to change speed, in m/s². This is the
     * process noise of the constant-velocity model — see `smoothing.ts`.
     *
     * IT REPLACED A PLAIN DRIFT TERM, and the reason is the whole point of that
     * rewrite. The old model assumed you were standing still and charged the
     * walking itself to noise; the correction it applied was therefore always
     * behind, and at a ±10 m fix it moved the estimate only about a seventh of
     * the way to each reading — roughly eight metres of lag at walking pace,
     * with corners rounded off and cut across. Modelling the velocity removes
     * that lag entirely, so this number only has to describe how abruptly a
     * person can speed up, slow down or turn.
     *
     * 0.6 m/s² is a brisk change of pace over a second. Too low and a corner
     * takes several fixes to follow; too high and the filter chases noise again.
     */
    accelMs2: 0.6,
    /**
     * The longest gap the velocity is carried across, in ms.
     *
     * Beyond it the estimate keeps its position and forgets which way it was
     * going: a fix after a long silence says nothing about the heading before
     * it, and predicting forward from a stale velocity is exactly how a filter
     * invents a position nobody was at.
     */
    maxCarryMs: 8_000
  },

  elevation: {
    /**
     * How far the altitude must climb from the last reference before any of it
     * counts, in metres.
     *
     * GPS altitude is far noisier than position — ±10 m is ordinary, and it
     * wanders by several metres while standing still. Summing every rise would
     * report a few hundred metres of ascent for a walk along a flat seafront.
     * Only a sustained climb past this threshold banks, and the reference moves
     * with it, so a long hill still adds up while noise never does.
     */
    thresholdM: 4
  },

  battery: {
    /**
     * How the OS is asked for fixes while moving, and while stopped.
     *
     * The stopped profile is a real saving — a phone waking every two seconds
     * to confirm it is still outside a café is most of what a tracking app
     * costs — and it is safe because the movement detector has already decided
     * nothing is happening. It is deliberately NOT applied at
     * `possiblyStopped`: that state exists precisely because we are not sure
     * yet, and easing off there would cost the first few metres of every
     * restart, which is the accuracy that matters most.
     */
    movingIntervalMs: 1_000,
    /**
     * NO DISTANCE FILTER WHILE MOVING, which is the setting the drawn route
     * lives or dies by.
     *
     * A distance filter tells the receiver not to bother us until the phone has
     * moved that far, and the fix it finally delivers is the one at the END of
     * that stretch — so at 5 m a walk is sampled as a series of 5 m chords with
     * every curve between them cut off. Corners came back clipped, a bend in a
     * path came back as two straight lines, and no amount of smoothing puts
     * back a shape that was never sampled.
     *
     * Zero means every fix the receiver produces, about one a second, which is
     * what the smoother and the minimum leg are both tuned for. Standing still
     * is paid for by the stopped profile below rather than by throwing away the
     * detail of the walking.
     */
    movingDistanceM: 0,
    stoppedIntervalMs: 10_000,
    stoppedDistanceM: 15,
    /**
     * How long the movement detector has to have said `stopped` before the
     * sampling actually eases off.
     *
     * Changing profile means restarting location updates, and a restart costs a
     * fresh acquisition — the receiver drops its lock and the first fixes back
     * are the bad ones. At a crossing, a kerb or a shop window that is a price
     * paid several times a mile for a few seconds of radio each time, and it is
     * paid in exactly the places a route needs to be sharp.
     *
     * A minute of genuine stillness is a stop worth saving battery on. Anything
     * shorter is a walk.
     */
    stoppedSettleMs: 60_000
  },

  storage: {
    /**
     * How many raw fixes are kept in memory before the oldest are dropped.
     *
     * Raw points are kept for diagnostics, INCLUDING rejected ones, which is
     * what makes a bad recording explicable after the fact. At one fix a second
     * this is about three hours.
     */
    maxRawPoints: 12_000,
    /** How often the live activity is written to disk while tracking. */
    autosaveMs: 10_000
  },

  /**
   * The longest gap the clock will attribute to anything but elapsed time.
   *
   * When the app is suspended without background permission no ticks arrive,
   * and the delta on resume can be an hour. Elapsed time is wall-clock and
   * takes it; moving time must not, or a walk that sat in a pocket reports as
   * an hour of walking.
   */
  maxTickMs: 30_000
} as const;

/** The one ceiling. Kept as a function so call sites read the same as before. */
export function maxSpeed(): number {
  return TRACKING_CONFIG.speed.maxMs;
}
