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

/** "6:24 /km", or a dash when there is nothing worth showing. */
export function formatPace(paceMsPerKm: PaceMsPerKm | null): string {
  if (paceMsPerKm === null || !Number.isFinite(paceMsPerKm) || paceMsPerKm <= 0) {
    return "—";
  }

  const totalSeconds = Math.round(paceMsPerKm / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

/** "5.4 km/h". */
export function formatSpeed(metresPerSecond: number | null): string {
  if (metresPerSecond === null || !Number.isFinite(metresPerSecond) || metresPerSecond < 0) {
    return "—";
  }

  return `${((metresPerSecond * 3600) / 1000).toFixed(1)} km/h`;
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

    distanceM += calculateDistance(
      { lat: older.latitude, lon: older.longitude },
      { lat: newer.latitude, lon: newer.longitude }
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

/** "1.24 km" / "840 m". */
export function formatDistance(metres: number): string {
  const safe = Math.max(0, metres);

  return safe < 1000 ? `${Math.round(safe)} m` : `${(safe / 1000).toFixed(2)} km`;
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
