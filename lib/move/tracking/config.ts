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
    /** Consistent movement for this long promotes STOPPED back to MOVING. */
    resumeAfterMs: 3_000,
    /** Quiet for this long demotes MOVING to POSSIBLY_STOPPED. */
    possiblyStoppedAfterMs: 6_000,
    /** Still quiet this long after that, and it is a stop. */
    stoppedAfterMs: 12_000
  },

  autoPause: {
    /**
     * On by default, and overridable per activity. A walk that waits at three
     * sets of lights should not report the waiting as walking — but somebody
     * who wants the raw clock can say so, and a MANUAL pause always wins over
     * whatever this decides.
     */
    enabled: true
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
    movingIntervalMs: 2_000,
    movingDistanceM: 5,
    stoppedIntervalMs: 10_000,
    stoppedDistanceM: 15
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
