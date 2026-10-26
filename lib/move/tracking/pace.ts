import { TRACKING_CONFIG } from "@/lib/move/tracking/config";
import type { ActivitySegment, RawLocationPoint } from "@/lib/move/tracking/types";
import { calculateDistance } from "@/lib/walk";

/**
 * Pace and speed.
 *
 * Everything internal is metres and metres per second; the conversions live
 * here so no screen ever writes `/ 1000 * 3600` again, and so a change of units
 * is one file.
 *
 * The one rule worth stating: **current pace is never two points.** A single
 * 8 m jitter over one second reads as 2:05/km, and a readout that swings
 * between that and 40:00/km is worse than no readout. It is measured over a
 * rolling window instead — long enough to be steady, short enough to react
 * inside a block.
 */

/** Milliseconds per kilometre — the unit pace is held in. */
export type PaceMsPerKm = number;

export function speedToPace(metresPerSecond: number): PaceMsPerKm | null {
  if (!Number.isFinite(metresPerSecond) || metresPerSecond <= 0) {
    return null;
  }

  return 1000 / metresPerSecond * 1000;
}

export function paceToSpeed(paceMsPerKm: PaceMsPerKm): number | null {
  if (!Number.isFinite(paceMsPerKm) || paceMsPerKm <= 0) {
    return null;
  }

  return 1_000_000 / paceMsPerKm;
}

/**
 * "6:24 /km", or a bare "0:00" when there is nothing to show yet.
 *
 * Zero rather than a dash: on a readout of four figures a row of dashes looked
 * like the tracker had failed, where a zero reads as "not yet". The VALUE stays
 * null — only its rendering is a number, and nothing downstream of this ever
 * sees a zero it did not measure.
 *
 * The unit goes with it. "0:00 /km" states a pace per kilometre for a walk that
 * has covered none; the bare figure is a placeholder and looks like one.
 */
export function formatPace(paceMsPerKm: PaceMsPerKm | null): string {
  if (paceMsPerKm === null || !Number.isFinite(paceMsPerKm) || paceMsPerKm <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.round(paceMsPerKm / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

/** "5.4 km/h", or a bare "0.0" before there is one — see `formatPace`. */
export function formatSpeed(metresPerSecond: number | null): string {
  if (metresPerSecond === null || !Number.isFinite(metresPerSecond) || metresPerSecond < 0) {
    return "0.0";
  }

  const value = ((metresPerSecond * 3600) / 1000).toFixed(1);

  return value === "0.0" ? value : `${value} km/h`;
}

/**
 * Pace over the last stretch of the route.
 *
 * Walks back through the accepted fixes from newest to oldest, accumulating
 * distance and time, and stops once BOTH the window's time and its minimum
 * distance are satisfied. Requiring both is what keeps it honest at either
 * extreme: 20 seconds of standing still is not a pace, and neither is 20 metres
 * covered in one suspicious hop.
 *
 * Only ever walks within one segment. Reaching across a pause would measure a
 * coffee break as a very slow kilometre.
 */
export function smoothedPace(segments: ActivitySegment[], now: number): PaceMsPerKm | null {
  const segment = segments[segments.length - 1];

  if (!segment || segment.points.length < 2) {
    return null;
  }

  const { windowMs, windowMinM } = TRACKING_CONFIG.pace;
  const points = segment.points;

  let distanceM = 0;
  let index = points.length - 1;

  while (index > 0) {
    const newer = points[index];
    const older = points[index - 1];

    // Fixes older than the window are only used if the window has not yet
    // covered enough ground to mean anything.
    if (now - older.timestamp > windowMs && distanceM >= windowMinM) {
      break;
    }

    // Smoothed positions, same as the distance total — raw legs read fast.
    distanceM += calculateDistance(
      { lat: older.drawLatitude ?? older.latitude, lon: older.drawLongitude ?? older.longitude },
      { lat: newer.drawLatitude ?? newer.latitude, lon: newer.drawLongitude ?? newer.longitude }
    );
    index -= 1;
  }

  const elapsedMs = points[points.length - 1].timestamp - points[index].timestamp;

  if (elapsedMs <= 0 || distanceM < TRACKING_CONFIG.pace.minDistanceM) {
    return null;
  }

  return (elapsedMs / distanceM) * 1000;
}

/**
 * Pace across the whole activity, measured against MOVING time.
 *
 * Moving rather than elapsed, so twenty minutes at a café does not make an
 * otherwise brisk walk look like a crawl. Elapsed time is still reported —
 * it is just not what pace means.
 */
export function averagePace(distanceM: number, movingMs: number): PaceMsPerKm | null {
  if (distanceM < TRACKING_CONFIG.pace.minDistanceM || movingMs <= 0) {
    return null;
  }

  return (movingMs / distanceM) * 1000;
}

export function averageSpeed(distanceM: number, movingMs: number): number | null {
  if (distanceM < TRACKING_CONFIG.pace.minDistanceM || movingMs <= 0) {
    return null;
  }

  return distanceM / (movingMs / 1000);
}

/**
 * "0.0 km" / "0.4 km" / "5.2 km" — always kilometres, always one decimal.
 *
 * A live readout that switches units mid-walk is the problem this solves: at
 * 999 m it read "999 m" and one step later "1.00 km", which is a jump in the
 * one number somebody is watching. Holding the unit means the figure only ever
 * climbs, and the first tenth arriving IS the feedback that it is working.
 *
 * `lib/move/movement.ts` keeps its own formatter, which does switch to metres —
 * that one writes sentences about totals and history, where "840 m" reads
 * better than "0.8 km".
 */
export function formatDistance(metres: number): string {
  return `${formatDistanceValue(metres)} km`;
}

/**
 * Just the number, for a readout that sets the unit in its own size.
 *
 * Kept beside `formatDistance` so the two can never round differently — a hero
 * reading 5.2 with a label saying 5.3 km would be the app disagreeing with
 * itself on one screen.
 */
export function formatDistanceValue(metres: number): string {
  return (Math.max(0, metres) / 1000).toFixed(1);
}

/**
 * Total ascent, in metres — the sum of the climbs, not the net height change.
 *
 * A loop that ends where it started has a net change of zero and may still have
 * gone up a hundred metres; ascent is what a walk actually cost.
 *
 * Hysteresis rather than a straight sum, for the reason in `TRACKING_CONFIG.
 * elevation`: GPS altitude wanders by metres while standing still, so only a
 * climb that clears the threshold banks, and the reference follows every dip so
 * a long steady hill still accumulates.
 *
 * Null when the platform gave no altitudes at all — distinct from a flat walk,
 * which is zero.
 */
export function elevationGain(segments: ActivitySegment[]): number | null {
  let gain = 0;
  let sawAltitude = false;

  for (const segment of segments) {
    let reference: number | null = null;

    for (const point of segment.points) {
      const altitude = point.altitude;

      if (typeof altitude !== "number" || !Number.isFinite(altitude)) {
        continue;
      }

      sawAltitude = true;

      if (reference === null) {
        reference = altitude;
        continue;
      }

      const delta = altitude - reference;

      if (delta >= TRACKING_CONFIG.elevation.thresholdM) {
        gain += delta;
        reference = altitude;
      } else if (delta < 0) {
        // Going down moves the mark with you, so the next climb is measured
        // from the bottom of the dip rather than from the top of the last one.
        reference = altitude;
      }
    }
  }

  return sawAltitude ? Math.round(gain) : null;
}

/** "120 m", or a bare "0" with no altitude to report — see `formatPace`. */
/** "12 m"; "0 m" for a genuinely flat walk; "—" when no fix carried altitude at all. */
export function formatElevation(metres: number | null): string {
  return metres === null ? "—" : `${metres} m`;
}

/** "14:22", or "1:14:22" once an activity passes the hour. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * A calorie ESTIMATE, and labelled as one wherever it is shown.
 *
 * MET-based: walking and running have well-published metabolic equivalents by
 * speed, and kcal ≈ MET × kg × hours. Without the user's weight it assumes
 * 70 kg, which is why this is an estimate of an estimate and why it lives
 * behind one function — a weight field or a HealthKit read improves it here and
 * nowhere else.
 */
export function estimateCalories(input: { distanceM: number; movingMs: number; weightKg?: number }): number | null {
  if (input.distanceM <= 0 || input.movingMs <= 0) {
    return null;
  }

  const hours = input.movingMs / 3_600_000;
  const speedKmh = input.distanceM / 1000 / hours;
  const weightKg = input.weightKg ?? 70;

  // Bands rather than a curve: the published tables are bands, and a smooth
  // function through them would imply a precision none of this has.
  const met = speedKmh < 4 ? 2.8 : speedKmh < 5.5 ? 3.5 : speedKmh < 6.5 ? 5 : speedKmh < 8 ? 7 : speedKmh < 11 ? 9.8 : 12.5;

  return Math.round(met * weightKg * hours);
}
