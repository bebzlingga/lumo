import { TRACKING_CONFIG, maxSpeed } from "@/lib/move/tracking/config";
import type { RawLocationPoint, RejectionReason } from "@/lib/move/tracking/types";
import { calculateDistance } from "@/lib/walk";

/**
 * Whether a fix may join the route, and if not, why.
 *
 * Pure, and the reason is part of the answer rather than a boolean: "standing
 * still" and "the receiver jumped a block" are different facts, the UI says
 * different things about them, and the stored reason is what makes a bad
 * recording explicable afterwards.
 *
 * Order matters. Cheap structural checks first, then the ones that need the
 * previous point, then the ones that need two. A fix rejected for accuracy is
 * never also examined for teleporting, because its distance is meaningless.
 */

export type FilterInput = {
  point: { latitude: number; longitude: number; timestamp: number; horizontalAccuracy?: number | null };
  /** The last fix that was ACCEPTED, in the current segment. Null starts one. */
  previous: RawLocationPoint | null;
  /** The one before that. Only used to spot a teleport-and-return. */
  beforePrevious?: RawLocationPoint | null;
  /** The newest timestamp processed so far, for staleness. */
  newestAt: number;
  /**
   * Whether the pedometer saw steps recently.
   *
   * Undefined on a device with no pedometer, and treated as "no opinion" —
   * never as "no steps". A phone without a step counter must track exactly as
   * well as one with, only with less corroboration.
   */
  steppingRecently?: boolean;
};

export type FilterVerdict = { accepted: true; distanceM: number } | { accepted: false; reason: RejectionReason; distanceM: 0 };

export function filterLocationPoint(input: FilterInput): FilterVerdict {
  const { point, previous } = input;
  const config = TRACKING_CONFIG.location;

  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || !Number.isFinite(point.timestamp)) {
    return { accepted: false, reason: "impossible", distanceM: 0 };
  }

  // Accuracy first: a fix we do not believe cannot be measured against.
  if (typeof point.horizontalAccuracy === "number" && point.horizontalAccuracy > config.rejectAccuracyAboveM) {
    return { accepted: false, reason: "accuracy", distanceM: 0 };
  }

  // Out of order, or from a previous life of this activity.
  if (point.timestamp < input.newestAt - config.maxAgeMs) {
    return { accepted: false, reason: "stale", distanceM: 0 };
  }

  // The first fix of a segment has nothing to be measured against, so it is
  // accepted on its own merits and contributes no distance.
  if (!previous) {
    return { accepted: true, distanceM: 0 };
  }

  const elapsedMs = point.timestamp - previous.timestamp;

  // Non-monotonic within the segment: a duplicate delivery, or a clock that
  // went backwards. Either way there is no leg here.
  if (elapsedMs <= 0) {
    return { accepted: false, reason: "duplicate", distanceM: 0 };
  }

  const legM = calculateDistance(
    { lat: previous.latitude, lon: previous.longitude },
    { lat: point.latitude, lon: point.longitude }
  );

  if (legM < config.duplicateM) {
    return { accepted: false, reason: "duplicate", distanceM: 0 };
  }

  // Faster than anybody moves on foot. Not a fast runner — a receiver jumping.
  const speedMs = legM / (elapsedMs / 1000);

  if (speedMs > maxSpeed()) {
    return { accepted: false, reason: "impossible", distanceM: 0 };
  }

  /**
   * Teleport-and-return: A → B → BAD → C, where BAD sits far off a route that
   * A, B and C otherwise make sense of.
   *
   * Caught by comparing the leg against the distance from the point BEFORE the
   * previous one. If stepping back two fixes is dramatically shorter than
   * stepping forward one, the previous fix was the excursion — and this one is
   * the route resuming. The fix itself is fine; what it must not do is carry
   * the round trip's distance.
   */
  const before = input.beforePrevious;

  if (before) {
    const throughM = calculateDistance(
      { lat: before.latitude, lon: before.longitude },
      { lat: point.latitude, lon: point.longitude }
    );
    const excursionM = calculateDistance(
      { lat: before.latitude, lon: before.longitude },
      { lat: previous.latitude, lon: previous.longitude }
    );

    // The detour has to be both large in absolute terms and disproportionate,
    // so an ordinary corner — where going round is genuinely longer than the
    // straight line — is not mistaken for a jump.
    if (excursionM > TRACKING_CONFIG.distance.minLegM * 4 && throughM * 3 < excursionM + legM) {
      return { accepted: false, reason: "teleport", distanceM: 0 };
    }
  }

  /**
   * Under the minimum leg: real, but too small to tell from drift.
   *
   * The pedometer softens this rather than switching it off. Steps in the window
   * are good evidence somebody is walking, so a short leg is more likely a slow
   * walker than a phone on a table — but they say nothing about WHERE, and a
   * four-metre hop measured at ±30 m is drift whether or not its owner happens
   * to be walking. Halving the floor keeps the case the pedometer exists for
   * (the slow walker with a decent fix) without handing a bad fix a free pass.
   */
  const floorM = minimumLegM(point.horizontalAccuracy, input.steppingRecently === true);

  if (legM < floorM) {
    return { accepted: false, reason: "jitter", distanceM: 0 };
  }

  /**
   * A leg long enough to be a break in tracking rather than a stretch of
   * walking: a tunnel, a lost fix, a suspended app. The point is accepted —
   * it is where you are — but the gap is not distance, and the caller starts a
   * new segment so nothing draws a line across it.
   */
  if (legM > TRACKING_CONFIG.distance.segmentBreakM || elapsedMs > TRACKING_CONFIG.distance.segmentBreakMs) {
    return { accepted: true, distanceM: 0 };
  }

  return { accepted: true, distanceM: legM };
}

/**
 * The shortest leg this fix is allowed to count, given what it admits about
 * itself.
 *
 * The flat minimum when the receiver is confident or says nothing at all
 * (Android leaves accuracy null, and a missing number must never be read as a
 * bad one); scaled up with the claimed error otherwise, capped so the gate can
 * never shut on a real walk. See `accuracyLegFactor` for the whole argument.
 */
export function minimumLegM(accuracyM: number | null | undefined, stepping = false): number {
  const { distance } = TRACKING_CONFIG;

  if (typeof accuracyM !== "number" || !Number.isFinite(accuracyM)) {
    return distance.minLegM;
  }

  const scaled = Math.min(distance.accuracyLegMaxM, accuracyM * distance.accuracyLegFactor);

  return Math.max(distance.minLegM, stepping ? scaled / 2 : scaled);
}

/** Whether this leg should end the segment it belongs to. */
export function breaksSegment(previous: RawLocationPoint | null, point: { latitude: number; longitude: number; timestamp: number }): boolean {
  if (!previous) {
    return false;
  }

  const legM = calculateDistance(
    { lat: previous.latitude, lon: previous.longitude },
    { lat: point.latitude, lon: point.longitude }
  );

  return legM > TRACKING_CONFIG.distance.segmentBreakM || point.timestamp - previous.timestamp > TRACKING_CONFIG.distance.segmentBreakMs;
}
