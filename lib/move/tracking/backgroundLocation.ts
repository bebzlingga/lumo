import { TRACKING_CONFIG } from "@/lib/move/tracking/config";
import { enqueueFixes, type PendingFix } from "@/lib/move/tracking/storage";

/**
 * Location that keeps arriving when the app does not.
 *
 * ## How it works
 *
 * `expo-location` can deliver fixes to a task registered with
 * `expo-task-manager`. The OS wakes that task in a JS context that may have no
 * React tree, no context providers and no in-memory tracker — so the task does
 * the one thing that is always safe: it appends the raw samples to a queue on
 * disk. The controller drains that queue the moment it is alive and runs every
 * fix through the same engine, in order. One pipeline, one set of rules,
 * whether the phone was in a hand or a pocket.
 *
 * Anything cleverer in here — processing, distance, state — would be a second
 * implementation of the tracker that only runs when nobody is watching, and
 * therefore the one that never gets tested.
 *
 * ## Native modules
 *
 * Both are behind the deferred-require pattern (`lib/orientation.ts`): the JS
 * bundle reloads instantly and the native binary does not, so a build made
 * before these were linked must lose the feature rather than the app.
 *
 * ## Privacy
 *
 * Updates are started when an activity starts and stopped when it ends —
 * including when it is abandoned or recovered and discarded. `stopTracking` is
 * safe to call at any time and is called on every path out of an activity.
 */

type LocationModule = typeof import("expo-location");
type TaskManagerModule = typeof import("expo-task-manager");

let locationModule: LocationModule | null | undefined;
let taskModule: TaskManagerModule | null | undefined;

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

function loadTaskManager(): TaskManagerModule | null {
  if (taskModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      taskModule = require("expo-task-manager") as TaskManagerModule;
    } catch {
      taskModule = null;
    }
  }

  return taskModule;
}

/** The task's name is a contract with the OS: it must never change. */
export const MOVE_LOCATION_TASK = "lumo-move-location";

/** Whether this build can record in the background at all. */
export function canTrackInBackground(): boolean {
  return loadLocation() !== null && loadTaskManager() !== null;
}

/**
 * Registers the task, once per JS context.
 *
 * Called at module scope from the app's entry point rather than from a screen:
 * when the OS relaunches the app to deliver a fix, the task has to already be
 * defined before any navigation happens, or the delivery is dropped.
 */
let defined = false;

export function defineMoveLocationTask(): void {
  const tasks = loadTaskManager();

  if (!tasks || defined) {
    return;
  }

  defined = true;

  tasks.defineTask(MOVE_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      // Nothing to recover here — the OS decides whether to keep delivering.
      // The queue simply stays as it was and the walk keeps whatever it had.
      return;
    }

    const locations = (data as { locations?: LocationSample[] } | undefined)?.locations;

    if (!locations || locations.length === 0) {
      return;
    }

    await enqueueFixes(locations.map(toPendingFix));
  });
}

type LocationSample = {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
};

/** The platform's shape, flattened to ours. Nothing is judged here. */
export function toPendingFix(sample: LocationSample): PendingFix {
  return {
    latitude: sample.coords.latitude,
    longitude: sample.coords.longitude,
    altitude: sample.coords.altitude,
    altitudeAccuracy: sample.coords.altitudeAccuracy,
    horizontalAccuracy: sample.coords.accuracy,
    speed: sample.coords.speed,
    heading: sample.coords.heading,
    timestamp: sample.timestamp
  };
}

export type BackgroundStartResult = "started" | "foreground-only" | "unavailable";

/**
 * Starts OS location updates for an activity.
 *
 * Returns what it managed to get rather than throwing, because every outcome is
 * usable: with background permission the walk survives a locked screen; with
 * only foreground permission it records while the app is open and the UI says
 * so. Refusing to start at all would be the worst of the three.
 */
/** Which sampling profile the OS is currently on. */
export type SamplingProfile = "moving" | "stopped";

let currentProfile: SamplingProfile = "moving";

/**
 * Eases the sampling rate off while the tracker is sure nothing is happening,
 * and puts it back the moment it is not.
 *
 * Restarting updates with new options is the only way to change them, so this
 * does nothing at all unless the profile actually changed — an activity that
 * flickered between the two would restart location twice a minute, which costs
 * more than it saves and drops fixes each time.
 */
export async function setSamplingProfile(profile: SamplingProfile): Promise<void> {
  if (profile === currentProfile) {
    return;
  }

  currentProfile = profile;

  const location = loadLocation();

  if (!location) {
    return;
  }

  try {
    const running = await location.hasStartedLocationUpdatesAsync(MOVE_LOCATION_TASK);

    if (!running) {
      return;
    }

    await location.startLocationUpdatesAsync(MOVE_LOCATION_TASK, locationOptions(location, profile));
  } catch {
    // The previous profile is still running, which is the safe failure.
  }
}

function locationOptions(location: LocationModule, profile: SamplingProfile) {
  const battery = TRACKING_CONFIG.battery;
  const stopped = profile === "stopped";

  return {
    accuracy: location.Accuracy.BestForNavigation,
    // Distance and time filters together: the OS coalesces its own deliveries
    // and this is what keeps a stationary phone from waking us every second.
    distanceInterval: stopped ? battery.stoppedDistanceM : battery.movingDistanceM,
    timeInterval: stopped ? battery.stoppedIntervalMs : battery.movingIntervalMs,
    // iOS batches deliveries when the app is suspended; deferring lets it hold
    // a handful of fixes and hand them over together, which is far cheaper on
    // battery than waking for each one.
    deferredUpdatesDistance: 25,
    deferredUpdatesInterval: 15_000,
    pausesUpdatesAutomatically: false,
    activityType: location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      // Android only, and required there: a foreground service with a visible
      // notification is the only way to keep location alive, and being told
      // your walk is recording is the honest version of that anyway.
      notificationTitle: "Lumo is recording your walk",
      notificationBody: "Tap to return to Lumo",
      notificationColor: "#648A4C"
    }
  };
}

export async function startTracking(): Promise<BackgroundStartResult> {
  const location = loadLocation();
  const tasks = loadTaskManager();

  if (!location || !tasks) {
    return "unavailable";
  }

  defineMoveLocationTask();

  try {
    const foreground = await location.requestForegroundPermissionsAsync();

    if (!foreground.granted) {
      return "unavailable";
    }

    const background = await location.requestBackgroundPermissionsAsync();

    if (!background.granted) {
      return "foreground-only";
    }

    const already = await location.hasStartedLocationUpdatesAsync(MOVE_LOCATION_TASK);

    if (already) {
      return "started";
    }

    currentProfile = "moving";
    await location.startLocationUpdatesAsync(MOVE_LOCATION_TASK, locationOptions(location, "moving"));

    return "started";
  } catch {
    return "unavailable";
  }
}

/**
 * Stops OS location updates.
 *
 * Called on finish, on discard, and on recovery-then-discard. Safe to call when
 * nothing is running, which is what makes it safe to call everywhere — location
 * left running after an activity is the privacy failure that matters most here.
 */
export async function stopTracking(): Promise<void> {
  const location = loadLocation();

  if (!location) {
    return;
  }

  try {
    const running = await location.hasStartedLocationUpdatesAsync(MOVE_LOCATION_TASK);

    if (running) {
      await location.stopLocationUpdatesAsync(MOVE_LOCATION_TASK);
    }
  } catch {
    // Nothing further to try. The task stops with the process at the latest.
  }
}

/** Whether the OS is currently delivering fixes to our task. */
export async function isTracking(): Promise<boolean> {
  const location = loadLocation();

  if (!location) {
    return false;
  }

  try {
    return await location.hasStartedLocationUpdatesAsync(MOVE_LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * A single fix, for the acquisition phase.
 *
 * The screen needs a reading before the activity exists, to show the signal
 * indicator and decide when it is worth starting. This never enters the
 * pipeline — it only ever sets the indicator.
 */
export async function currentFix(): Promise<PendingFix | null> {
  const location = loadLocation();

  if (!location) {
    return null;
  }

  try {
    /**
     * `High`, not `BestForNavigation`, for the FIRST fix.
     *
     * BestForNavigation asks the receiver for its finest answer and will sit
     * there for tens of seconds getting it — which is the right trade once a
     * walk is under way and quite the wrong one while somebody is standing on
     * the doorstep watching a badge say "Searching". High is a few metres
     * coarser and arrives in a fraction of the time; the watch that follows is
     * still BestForNavigation, so the route itself loses nothing.
     */
    const sample = await location.getCurrentPositionAsync({ accuracy: location.Accuracy.High });

    return toPendingFix(sample as unknown as LocationSample);
  } catch {
    return null;
  }
}

/**
 * Whatever the OS already has, instantly.
 *
 * Costs nothing and returns whatever any app last asked for — often seconds
 * old, sometimes minutes. Far too coarse to record, and it never enters the
 * pipeline: its only job is to give the map somewhere to point before the first
 * real fix lands, instead of opening on the whole country.
 */
export async function lastKnownFix(): Promise<PendingFix | null> {
  const location = loadLocation();

  if (!location) {
    return null;
  }

  try {
    const sample = await location.getLastKnownPositionAsync();

    return sample ? toPendingFix(sample as unknown as LocationSample) : null;
  } catch {
    return null;
  }
}

/** A foreground watch. Runs whenever the app is on screen — see the controller. */
export type FixWatch = { stop: () => void };

export async function watchForeground(
  onFix: (fix: PendingFix) => void,
  options: { distanceInterval?: number; timeInterval?: number } = {}
): Promise<FixWatch | null> {
  const location = loadLocation();

  if (!location) {
    return null;
  }

  try {
    const subscription = await location.watchPositionAsync(
      {
        accuracy: location.Accuracy.BestForNavigation,
        /**
         * Zero distance by default, and that is the fix for "Searching" that
         * never resolves.
         *
         * A distance filter tells the OS not to bother us until we have MOVED
         * that far — so standing still, waiting to set off, no fixes arrive at
         * all, the last one goes stale after fifteen seconds and the indicator
         * drops to Searching while the receiver is sitting there with a perfect
         * lock. Time-based delivery keeps the reading honest while stationary;
         * the engine throws away what does not move, which is where standing
         * still is supposed to be handled.
         */
        distanceInterval: options.distanceInterval ?? 0,
        timeInterval: options.timeInterval ?? 1000
      },
      (sample) => onFix(toPendingFix(sample as unknown as LocationSample))
    );

    return { stop: () => subscription.remove() };
  } catch {
    return null;
  }
}

/** The accuracy the acquisition phase waits for, exported for the screen. */
export const STARTUP_ACCURACY_M = TRACKING_CONFIG.location.startupAccuracyM;
