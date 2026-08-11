import { routePoints } from "@/lib/move/tracking/tracker";
import type { ActivityTrackingState } from "@/lib/move/tracking/types";
import type { WalkPoint, WalkRecord } from "@/lib/walk";

/**
 * The new tracker, in the shapes the rest of Lumo already speaks.
 *
 * The engine records far more than a finished walk needs — raw rejected fixes,
 * segments, three separate clocks — and none of that has to reach the history
 * list, the sync queue, the habit tick or the route drawing. Those all take a
 * `WalkRecord`, which already works, is already synced, and is already tested.
 *
 * So this is the seam: one function, one direction, at the moment an activity
 * finishes. Nothing downstream of it needs to know the tracker changed.
 */

/** Accepted fixes only, in the shape the map and route drawing take. */
export function toWalkPoints(state: ActivityTrackingState): WalkPoint[] {
  return routePoints(state).map((point) => ({
    lat: point.latitude,
    lon: point.longitude,
    at: point.timestamp,
    accuracy: point.horizontalAccuracy ?? 0,
    speed: point.speed ?? undefined,
    altitude: point.altitude ?? undefined
  }));
}

/**
 * A finished activity as a walk record.
 *
 * `activeMs` is MOVING time, not elapsed: it is what the history list, the
 * average pace and the habit measurement all mean by "how long the walk took",
 * and elapsed time would count the twenty minutes spent in a shop.
 *
 * `vehicleM` is zero. The old model banked vehicle-speed legs separately so it
 * could say "8.4 km of this was not on foot"; the new filter rejects them
 * outright as impossible for the activity, and a rejected fix contributes no
 * distance to anything. The field stays for the record's shape.
 */
export function toWalkRecordFromActivity(state: ActivityTrackingState, habitIds: string[] = []): WalkRecord | null {
  const route = toWalkPoints(state);

  if (state.distanceMeters <= 0 && route.length < 2) {
    return null;
  }

  return {
    // The activity's own id, carried through unchanged — it is what makes the
    // upload idempotent, and it was minted on the device before the first fix.
    id: state.activityId,
    startedAt: state.startedAt,
    endedAt: state.finishedAt ?? state.lastTickAt,
    activeMs: state.movingDuration,
    distanceM: state.distanceMeters,
    vehicleM: 0,
    steps: state.steps,
    route,
    habitIds,
    synced: false
  };
}

/**
 * Whether a finished activity is fit to count toward anything.
 *
 * Deliberately minimal, and deliberately separate from the tracker: the engine
 * decides what happened, and this decides whether what happened is plausible.
 * Structuring it as its own check is what lets an integrity score be added
 * later without unpicking the recording.
 *
 * A failure here does NOT delete the walk. It is kept, and only its claim on
 * challenge progress is withheld.
 */
export type IntegrityVerdict = { ok: true } | { ok: false; reason: string };

export function checkIntegrity(state: ActivityTrackingState): IntegrityVerdict {
  if (state.distanceMeters <= 0) {
    return { ok: false, reason: "No distance was recorded." };
  }

  if (state.movingDuration <= 0) {
    return { ok: false, reason: "No moving time was recorded." };
  }

  const speedMs = state.distanceMeters / (state.movingDuration / 1000);

  // 12 m/s sustained across a whole activity is world-record marathon pace. A
  // single leg that fast is already rejected by the filter; this catches an
  // activity assembled from somewhere other than the filter.
  if (speedMs > 12) {
    return { ok: false, reason: "The recorded pace is not possible." };
  }

  if (routePoints(state).length < 2) {
    return { ok: false, reason: "The route has too few points to be a walk." };
  }

  return { ok: true };
}
