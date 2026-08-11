import type { WalkPoint } from "@/lib/walk";
import type { StepWatch, WalkWatch } from "@/lib/walkTracking";

/**
 * A fake walk, so the feature can be worked on without going outside.
 *
 * This exists because nothing GPS-related runs in a simulator: `expo-location`
 * reports a single fixed coordinate there, so the route, the distance, the pace
 * and every screen that reads them stay at zero forever. Rather than leaving
 * that untestable until someone walks around the block with a dev build, the
 * walk screen can drive itself off this instead.
 *
 * **It is `__DEV__`-only, checked here rather than only at the call site.**
 * Both entry points return `null` in a release build — the same "capability
 * missing" shape as `lib/walkTracking.ts`, so a production build cannot start a
 * simulated walk even if a call to one survives into the bundle.
 */

/**
 * Where the fake walk sets out from — Rizal Park, Manila.
 *
 * Arbitrary but deliberate: a real place with real streets, so the route drawn
 * over the map looks like a walk rather than a scribble over open water.
 */
const ORIGIN = { lat: 14.5826, lon: 120.9787 };

/** How often a fix arrives. Roughly what `watchWalkLocation` produces walking. */
const STEP_MS = 3_000;

/**
 * 1.35 m/s — an unhurried walking pace, and chosen to land between the model's
 * two thresholds: 4.05m per fix clears `MIN_LEG_M` (3m) so no leg is discarded
 * as jitter, and it is far under `VEHICLE_SPEED_MS` (6 m/s) so none is banked
 * as a car ride. A simulator that produced points the model threw away would
 * test nothing.
 */
const SPEED_MS = 1.35;

/** Metres per degree of latitude. Longitude is scaled by cos(lat) below. */
const LAT_SCALE = 111_320;

/** Steps per second at the pace above, for the fake pedometer. */
const STEPS_PER_SECOND = 1.8;

/** True when a simulated walk is available at all. Release builds get false. */
export function canSimulateWalks(): boolean {
  return __DEV__;
}

/**
 * Emits a wandering route from a fixed origin.
 *
 * The heading turns a little on every fix and drifts on a slow sine, which is
 * what makes the track curve like a walk around a block instead of running off
 * in a dead straight line. No randomness: the same route every time is easier
 * to recognise as wrong when something breaks.
 */
export function startSimulatedWalk(onPoint: (point: WalkPoint) => void): WalkWatch | null {
  if (!__DEV__) {
    return null;
  }

  let tick = 0;
  let lat = ORIGIN.lat;
  let lon = ORIGIN.lon;

  const emit = () => {
    const heading = tick * 0.12 + Math.sin(tick / 7) * 0.9;
    const metres = SPEED_MS * (STEP_MS / 1000);

    lat += (metres * Math.cos(heading)) / LAT_SCALE;
    lon += (metres * Math.sin(heading)) / (LAT_SCALE * Math.cos((lat * Math.PI) / 180));
    tick += 1;

    onPoint({
      lat,
      lon,
      at: Date.now(),
      // Good enough to clear MAX_ACCURACY_M with room to spare.
      accuracy: 8,
      speed: SPEED_MS
    });
  };

  // One immediately, so the map has somewhere to be rather than sitting on a
  // zoomed-out world view for the first three seconds.
  emit();

  const id = setInterval(emit, STEP_MS);

  return { stop: () => clearInterval(id) };
}

/**
 * A fake pedometer, counting from zero the way the real one does.
 *
 * Separate from the route on purpose: a device can have location without a
 * pedometer, and pairing them here would hide that case from the screen that
 * has to handle it.
 */
export function startSimulatedSteps(onSteps: (steps: number) => void): StepWatch | null {
  if (!__DEV__) {
    return null;
  }

  let elapsedMs = 0;

  const id = setInterval(() => {
    elapsedMs += STEP_MS;
    onSteps(Math.round((elapsedMs / 1000) * STEPS_PER_SECOND));
  }, STEP_MS);

  return { stop: () => clearInterval(id) };
}
