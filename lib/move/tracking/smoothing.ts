import { TRACKING_CONFIG } from "@/lib/move/tracking/config";

/**
 * Where the phone probably is, as opposed to where the last fix said it was.
 *
 * ## The problem this solves
 *
 * A GPS fix is a guess with an error bar, and the receiver tells you how wide
 * that bar is. Drawn raw, a walk down a straight street is a zigzag: consecutive
 * fixes scatter within their own uncertainty, so the line wanders several metres
 * either side of a path that was straight. Every stage downstream inherits it —
 * the route on the map looks drunk, the leg lengths are inflated by the wander,
 * and the pace window jumps.
 *
 * ## Why a Kalman filter and not an average
 *
 * A moving average treats every fix as equally trustworthy, which is exactly
 * what they are not: a ±5 m fix and a ±35 m fix arriving one after the other
 * carry very different amounts of information, and averaging them throws that
 * away. It also lags — an average over the last few fixes is by construction
 * behind the walker, which on the live map reads as the dot trailing you.
 *
 * A Kalman filter weights each new fix by how confident it claims to be against
 * how confident the estimate already is. A tight fix pulls the estimate almost
 * all the way to itself; a vague one barely moves it.
 *
 * ## Why it models VELOCITY, which is the change that mattered
 *
 * The first version of this modelled position only: it predicted that you had
 * not moved since the last fix, and charged the walking itself to process
 * noise. That is a fine model of a phone on a table and a bad one of a walk, and
 * it failed in the way position-only trackers always fail — it LAGGED. Working
 * it through at the numbers it shipped with: a ±10 m fix once a second gave a
 * gain of about 0.14, so each reading moved the estimate a seventh of the way,
 * and the estimate settled roughly EIGHT METRES behind the walker. On a straight
 * road that is invisible. On a corner it is not: the line rounds the turn off,
 * cuts the pavement, and comes back onto the street half a block late. "The
 * route is drawn but it is not accurate" is precisely what that looks like.
 *
 * Modelling velocity fixes it at the root rather than by loosening the filter.
 * The prediction now carries the walker forward at the speed they were last seen
 * going, so a steady walk is predicted almost perfectly and the correction only
 * has to absorb NOISE — which means the filter can stay tight and still have no
 * lag at all. Two states per axis, position and velocity, driven by how hard a
 * person can change speed (`accelMs2`).
 *
 * ## What it is NOT allowed to do
 *
 * Invent a position nobody was at. A velocity model can, by construction,
 * predict past the newest reading — so the result is clamped to lie between the
 * previous estimate and the fix that has just arrived. The estimate is therefore
 * always somewhere two real readings bracket, and a smoothed route cannot leave
 * the corridor the raw one walked. Raw fixes are still stored untouched, which
 * is what keeps a bad recording explicable after the fact.
 *
 * Nor may it carry a heading across a silence: past `maxCarryMs` the velocity is
 * dropped and the estimate holds still until the fixes say otherwise. Predicting
 * forward from where somebody was going four minutes ago is exactly how a filter
 * puts a route down a street nobody walked.
 */

/** Metres per degree of latitude. Near enough anywhere a person walks. */
const M_PER_DEG_LAT = 111_320;

/**
 * Metres per degree of longitude at a given latitude.
 *
 * Floored rather than allowed to reach zero: at the poles the conversion is
 * degenerate and a division by it would take the estimate to infinity. Nobody
 * walks there, and a metre of nonsense beats a NaN in the route.
 */
function metresPerDegreeLon(latitude: number): number {
  return Math.max(1, M_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180));
}

export type SmoothingState = {
  latitude: number;
  longitude: number;
  /** Estimated velocity, metres per second, north and east. */
  northMs: number;
  eastMs: number;
  /** The estimate's own position error, in metres SQUARED. */
  varianceM2: number;
  /**
   * How position error and velocity error move together, m²/s.
   *
   * The term that does the real work: it is what lets a run of fixes that all
   * land ahead of the estimate teach the filter that the walker is MOVING,
   * rather than being absorbed as noise one at a time.
   */
  covarianceM2S: number;
  /** The velocity estimate's own error, in (m/s) squared. */
  velocityM2S2: number;
  /** Epoch ms of the fix this estimate was last updated by. */
  at: number;
};

export type SmoothingSample = {
  latitude: number;
  longitude: number;
  horizontalAccuracy?: number | null;
  timestamp: number;
};

/**
 * The velocity error a fresh estimate starts with, in (m/s)².
 *
 * Deliberately wide. A first fix says where somebody is and nothing whatsoever
 * about which way they are going, so the filter has to be told it knows nothing
 * — otherwise a confident zero velocity would hold the estimate still for the
 * first several fixes of every walk and of every segment after a gap.
 */
function initialVelocityVariance(): number {
  return (TRACKING_CONFIG.smoothing.accelMs2 * 10) ** 2;
}

/** Keeps a value between two bounds given in either order. */
function clamp(value: number, a: number, b: number): number {
  return Math.min(Math.max(value, Math.min(a, b)), Math.max(a, b));
}

/**
 * Folds one fix into the estimate.
 *
 * Returns the state to keep AND the position to use. Pass `null` for the first
 * fix of a walk or of a segment: there is nothing to blend it with, so it is
 * taken as read and becomes the estimate.
 */
export function smoothFix(state: SmoothingState | null, sample: SmoothingSample): SmoothingState {
  const { smoothing } = TRACKING_CONFIG;
  /**
   * How much to believe this fix, as a variance.
   *
   * A missing accuracy is treated as the middle of the band rather than as
   * perfect or as hopeless — Android omits it, and a phone that omits it must
   * still track. Floored, because a receiver claiming ±1 m is claiming more than
   * consumer GPS delivers, and taking it at its word would make the filter chase
   * every fix and do nothing at all.
   */
  const claimed =
    typeof sample.horizontalAccuracy === "number" && Number.isFinite(sample.horizontalAccuracy)
      ? sample.horizontalAccuracy
      : smoothing.assumedAccuracyM;
  const measurementM2 = Math.max(smoothing.minAccuracyM, claimed) ** 2;

  if (!state) {
    return {
      latitude: sample.latitude,
      longitude: sample.longitude,
      northMs: 0,
      eastMs: 0,
      varianceM2: measurementM2,
      covarianceM2S: 0,
      velocityM2S2: initialVelocityVariance(),
      at: sample.timestamp
    };
  }

  const elapsedMs = Math.max(0, sample.timestamp - state.at);
  /**
   * A silence longer than `maxCarryMs` costs the heading but not the position.
   *
   * Where somebody was is still the best guess of where they are; which way they
   * were going stops being evidence long before that. So the estimate stays put
   * and its velocity is thrown away, wide open, for the next few fixes to
   * rebuild.
   */
  const carries = elapsedMs <= smoothing.maxCarryMs;
  const dt = Math.min(elapsedMs, smoothing.maxCarryMs) / 1000;

  const northMs = carries ? state.northMs : 0;
  const eastMs = carries ? state.eastMs : 0;

  const perDegLon = metresPerDegreeLon(state.latitude);

  // --- predict: carry the walker forward at the speed they were last going ---
  const predictedLat = state.latitude + (northMs * dt) / M_PER_DEG_LAT;
  const predictedLon = state.longitude + (eastMs * dt) / perDegLon;

  /**
   * The prediction's own uncertainty grows with how hard a person could have
   * changed speed in the gap — the standard constant-velocity process noise.
   */
  const q = smoothing.accelMs2 ** 2;
  const priorVelocityM2S2 = carries ? state.velocityM2S2 : initialVelocityVariance();
  const priorCovarianceM2S = carries ? state.covarianceM2S : 0;

  const pp = state.varianceM2 + 2 * priorCovarianceM2S * dt + priorVelocityM2S2 * dt * dt + (q * dt ** 4) / 4;
  const pv = priorCovarianceM2S + priorVelocityM2S2 * dt + (q * dt ** 3) / 2;
  const vv = priorVelocityM2S2 + q * dt * dt;

  // --- correct: how far the fix disagrees with the prediction, in metres ------
  const innovationNorth = (sample.latitude - predictedLat) * M_PER_DEG_LAT;
  const innovationEast = (sample.longitude - predictedLon) * perDegLon;

  /**
   * The gains: the share of the disagreement taken into position, and into
   * velocity.
   *
   * Position lands where the two error bars say it should — a fix three times
   * tighter than the prediction pulls about nine tenths of the way, a fix three
   * times vaguer about a tenth. Velocity moves only in so far as position and
   * velocity error are correlated, which is what stops a single stray fix being
   * read as a change of direction.
   */
  const innovationM2 = pp + measurementM2;
  const positionGain = pp / innovationM2;
  const velocityGain = pv / innovationM2;

  const correctedLat = predictedLat + (positionGain * innovationNorth) / M_PER_DEG_LAT;
  const correctedLon = predictedLon + (positionGain * innovationEast) / perDegLon;

  return {
    /**
     * Bracketed by two real readings, and never outside them.
     *
     * The one thing a velocity model can do that a position-only one cannot is
     * run ahead of the evidence — predict past the newest fix and put the line
     * somewhere nobody has been yet. Clamping between the previous estimate and
     * this fix costs nothing when the prediction was good (it already lands
     * between them) and is the whole safety net when it was not.
     */
    latitude: clamp(correctedLat, state.latitude, sample.latitude),
    longitude: clamp(correctedLon, state.longitude, sample.longitude),
    northMs: northMs + velocityGain * innovationNorth,
    eastMs: eastMs + velocityGain * innovationEast,
    // Having taken a reading, the estimate is more certain than it was.
    varianceM2: (1 - positionGain) * pp,
    covarianceM2S: (1 - positionGain) * pv,
    velocityM2S2: Math.max(0, vv - velocityGain * pv),
    at: sample.timestamp
  };
}

/**
 * How far the smoother moved a fix, in metres — for the diagnostics panel.
 *
 * Worth watching on a real walk: a correction of a few metres is the filter
 * doing its job, and one of tens of metres is it fighting the receiver rather
 * than reading it.
 */
export function smoothingShiftM(
  raw: { latitude: number; longitude: number },
  drawn: { latitude: number; longitude: number }
): number {
  const north = (drawn.latitude - raw.latitude) * M_PER_DEG_LAT;
  const east = (drawn.longitude - raw.longitude) * metresPerDegreeLon(raw.latitude);

  return Math.sqrt(north * north + east * east);
}
