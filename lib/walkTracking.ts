import type { WalkPoint } from "@/lib/walk";

/**
 * The device side of Walk: location, permissions, steps, and a stable id.
 *
 * Every native module here is behind the deferred-require pattern from
 * `lib/orientation.ts` — `typeof import()` for the types, a three-state cache,
 * and `require()` inside a `try/catch`. Walk pulls in five native modules at
 * once, and a top-level import of any of them would crash the whole app on a
 * build made before they were added. The JS bundle reloads instantly; the native
 * binary does not, and the gap between them should cost a feature rather than
 * the app.
 *
 * The other rule, taken from `lib/iap.ts`: **absence returns null, never zero.**
 * "No pedometer" and "walked zero steps" are different facts, and rendering the
 * first as the second is a lie the whole walk is then built on.
 */

type LocationModule = typeof import("expo-location");
type SensorsModule = typeof import("expo-sensors");
type CryptoModule = typeof import("expo-crypto");

let locationModule: LocationModule | null | undefined;
let sensorsModule: SensorsModule | null | undefined;
let cryptoModule: CryptoModule | null | undefined;

function loadLocation(): LocationModule | null {
  if (locationModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      locationModule = require("expo-location") as LocationModule;
    } catch {
      locationModule = null;
    }
  }

  return locationModule;
}

function loadSensors(): SensorsModule | null {
  if (sensorsModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sensorsModule = require("expo-sensors") as SensorsModule;
    } catch {
      sensorsModule = null;
    }
  }

  return sensorsModule;
}

function loadCrypto(): CryptoModule | null {
  if (cryptoModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cryptoModule = require("expo-crypto") as CryptoModule;
    } catch {
      cryptoModule = null;
    }
  }

  return cryptoModule;
}

/** True when this build can actually record a walk. The UI hides Walk otherwise. */
export function canTrackWalks(): boolean {
  return loadLocation() !== null;
}

// --- permissions ------------------------------------------------------------

export type WalkPermission = "not_requested" | "granted_foreground" | "granted_background" | "denied" | "restricted";

/**
 * What we are allowed to do, without asking for anything.
 *
 * Read-only on purpose: the request itself is a separate call the user has to
 * trigger, because a permission sheet nobody asked for is the thing that gets
 * denied out of reflex.
 */
export async function walkPermissionStatus(): Promise<WalkPermission> {
  const location = loadLocation();

  if (!location) {
    return "restricted";
  }

  try {
    const foreground = await location.getForegroundPermissionsAsync();

    if (!foreground.granted) {
      // `canAskAgain: false` means the user turned it off in Settings and no
      // prompt will ever appear — a different situation from "not asked yet",
      // and the UI has to say so rather than offering a button that does
      // nothing.
      return foreground.canAskAgain ? "not_requested" : "denied";
    }

    const background = await location.getBackgroundPermissionsAsync();

    return background.granted ? "granted_background" : "granted_foreground";
  } catch {
    return "restricted";
  }
}

/**
 * Asks for location, foreground first and background only after.
 *
 * Two prompts in that order because iOS will not grant Always until When In Use
 * has been granted, and asking for the bigger one cold is how you get refused.
 * Foreground alone is a working walk — it just stops recording when the screen
 * locks, which the screen says out loud rather than under-recording in silence.
 */
export async function requestWalkPermission(): Promise<WalkPermission> {
  const location = loadLocation();

  if (!location) {
    return "restricted";
  }

  try {
    const foreground = await location.requestForegroundPermissionsAsync();

    if (!foreground.granted) {
      return foreground.canAskAgain ? "not_requested" : "denied";
    }

    const background = await location.requestBackgroundPermissionsAsync();

    return background.granted ? "granted_background" : "granted_foreground";
  } catch {
    return "restricted";
  }
}

// --- location ---------------------------------------------------------------

/** Handle returned by `watchWalkLocation`, so a caller can stop the watch. */
export type WalkWatch = { stop: () => void };

/**
 * Streams fixes while a walk runs.
 *
 * `Accuracy.Balanced` rather than `BestForNavigation`: navigation accuracy runs
 * the GPS chip flat out for a precision a walking route does not need, and
 * battery is the constraint that decides whether anyone finishes an hour-long
 * walk with the app still running. `distanceInterval` means a stationary phone
 * produces almost no callbacks at all.
 *
 * Returns null when the module is missing, so the caller can tell "not watching"
 * from "watching and receiving nothing".
 */
export async function watchWalkLocation(onPoint: (point: WalkPoint) => void): Promise<WalkWatch | null> {
  const location = loadLocation();

  if (!location) {
    return null;
  }

  try {
    const subscription = await location.watchPositionAsync(
      {
        accuracy: location.Accuracy.Balanced,
        // A walker covers 10m in roughly seven seconds; below that the extra
        // fixes are jitter the validator would reject anyway.
        distanceInterval: 10,
        timeInterval: 4000
      },
      (reading) => {
        onPoint({
          lat: reading.coords.latitude,
          lon: reading.coords.longitude,
          at: reading.timestamp,
          // `accuracy` is nullable on Android. Treating a missing value as
          // Infinity makes the validator reject it, which is the safe way
          // round — an unplaceable fix should not join the route.
          accuracy: reading.coords.accuracy ?? Number.POSITIVE_INFINITY,
          speed: reading.coords.speed ?? undefined,
          altitude: reading.coords.altitude ?? undefined
        });
      }
    );

    return { stop: () => subscription.remove() };
  } catch {
    return null;
  }
}

// --- steps ------------------------------------------------------------------

/** Handle for a running pedometer watch. */
export type StepWatch = { stop: () => void };

/**
 * Counts steps for the duration of a walk.
 *
 * Returns null when there is no pedometer — many Android devices, every
 * simulator, and any device where motion permission was refused. Callers keep
 * `steps: null` in that case rather than showing a zero.
 */
export async function watchSteps(onSteps: (steps: number) => void): Promise<StepWatch | null> {
  const sensors = loadSensors();

  if (!sensors) {
    return null;
  }

  try {
    if (!(await sensors.Pedometer.isAvailableAsync())) {
      return null;
    }

    const subscription = sensors.Pedometer.watchStepCount((result) => onSteps(result.steps));

    return { stop: () => subscription.remove() };
  } catch {
    return null;
  }
}

// --- ids --------------------------------------------------------------------

/**
 * A stable id for a walk, minted on the device before anything reaches a server.
 *
 * That is what lets a walk recorded in airplane mode sync later without the
 * server having to guess whether it already has it. Falls back to the app's own
 * `createId` when expo-crypto is missing — a weaker id, but the alternative is
 * refusing to start a walk, and any stable id serves the idempotency purpose.
 */
export function createWalkId(): string {
  const crypto = loadCrypto();

  if (crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through.
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("@/lib/id") as typeof import("@/lib/id")).createId();
}
