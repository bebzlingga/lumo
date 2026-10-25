import { AppState } from "react-native";
import { TRACKING_CONFIG } from "@/lib/move/tracking/config";
import { requestBackgroundLocationConsent } from "@/lib/move/tracking/disclosure";
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

    /**
     * And tell the controller, IF there is one in this JS context.
     *
     * The queue is still written first and unconditionally — that is what makes
     * a fix survive the app being killed between deliveries. But when the app is
     * merely backgrounded, the tracker is very much alive in this same context
     * and simply was not being told: the drain ran off a `setInterval`, and iOS
     * does not run timers in a suspended app. So a walk in a pocket accumulated
     * nothing until the screen came back on, which meant the clock, the
     * auto-pause and anything watching them were all working from a state
     * minutes out of date.
     *
     * Nothing is DECIDED here. It is a nudge to drain, and the drain is the same
     * pipeline a foreground fix goes through.
     */
    liveSink?.();
  });
}

/**
 * Somewhere for the task to hand fixes on to, when the tracker is in this
 * process.
 *
 * A registered callback rather than an import, because the controller imports
 * this module and the cycle would be real. Null whenever there is no tracker —
 * a cold relaunch for a single background delivery — and the queue covers that
 * case on its own.
 */
let liveSink: (() => void) | null = null;

export function setLiveFixSink(sink: (() => void) | null): void {
  liveSink = sink;
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

/**
 * What the OS agreed to.
 *
 * THE DISTINCTION IS NOT "does it record with the screen off" — the first two
 * both do. It is what happens to a recording when Lumo itself is gone:
 *
 *  - `always`: the OS may relaunch Lumo to hand over a fix, so a walk survives
 *    the app being force-quit or evicted under memory pressure.
 *  - `while-running`: updates were started from the foreground and keep coming
 *    with the screen locked and the app in the background — Apple's
 *    user-initiated foreground service, and Android's location foreground
 *    service with its notification. This is the ordinary case and it is enough
 *    for a walk; what it cannot survive is Lumo being killed outright.
 *  - `unavailable`: no location at all.
 */
export type BackgroundStartResult = "always" | "while-running" | "unavailable";

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

  const location = loadLocation();

  if (!location) {
    return;
  }

  /**
   * Never while the app is away, and Android is the reason.
   *
   * Changing the profile means re-registering the task, and re-registering it
   * means starting the foreground service again — which Android forbids from
   * the background and `LocationModule.kt` throws for. On iOS the restart is
   * legal but not free either: a new `CLLocationManager` is built and the
   * receiver re-acquires, so the first fixes back are the coarse ones. Neither
   * is worth doing to a phone in a pocket, and the profile it is already on is
   * always a working one.
   */
  if (AppState.currentState !== "active") {
    return;
  }

  currentProfile = profile;

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
    /**
     * NO DISTANCE TERM IN THE DEFERRAL, and that zero is what decides whether a
     * walk records with the screen off.
     *
     * `expo-location` holds background deliveries back until BOTH the deferred
     * interval has elapsed AND the deferred distance has been covered — an AND,
     * identically in `EXLocationTaskConsumer.shouldReportDeferredLocations` and
     * `LocationTaskConsumer.shouldReportDeferredLocations` — and it applies that
     * ONLY while the app is not active. Set to 25 m, a walk in a pocket was
     * handed over in 25 m lumps at best, and a slow or stationary stretch was
     * held indefinitely with no lower bound. The route came back as a few
     * corners joined by straight lines, standing at a crossing was
     * indistinguishable from the app having died, and none of it happened with
     * the app open — which is exactly why walking with the screen on looked fine
     * and everything else did not.
     *
     * With the distance at zero the condition collapses to the time one, which
     * is the good half of the feature: fixes are BATCHED for five seconds and
     * then handed over in full, so nothing is dropped and the JS context is
     * woken a fifth as often. Five seconds of lag on a background delivery is
     * invisible against a forty-second signal-lost window.
     */
    deferredUpdatesDistance: 0,
    deferredUpdatesInterval: 5_000,
    pausesUpdatesAutomatically: false,
    activityType: location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      /**
       * Android only, and required there twice over.
       *
       * A foreground service with a visible notification is the only way to keep
       * location alive with the screen off — and, per `LocationModule.kt`, it is
       * also what makes `startLocationUpdatesAsync` legal WITHOUT the
       * "Allow all the time" permission. Being told your walk is recording, on
       * the lock screen, is the honest version of that anyway.
       */
      notificationTitle: "Lumo is recording your walk",
      notificationBody: "Tap to return to Lumo",
      notificationColor: "#648A4C",
      // The recording outlives the Activity: swiping Lumo out of the recents
      // list must not silently end a walk that is still being tracked.
      killServiceOnDestroy: false
    }
  };
}

/**
 * Starts OS location updates for an activity.
 *
 * Returns what it managed to get rather than throwing, because every outcome is
 * usable and the difference is worth saying out loud on screen.
 */
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

    /**
     * UPDATES ARE STARTED ON THE FOREGROUND PERMISSION ALONE, AND THIS IS THE
     * FIX FOR "IT ONLY RECORDS WHILE THE APP IS OPEN".
     *
     * What used to happen: "Allow all the time" was demanded first, and without
     * it this returned early and never called `startLocationUpdatesAsync` at
     * all. The only source left was `watchPositionAsync` — which
     * `BaseLocationProvider` explicitly configures with
     * `allowsBackgroundLocationUpdates = false` — so the route stopped dead the
     * instant the screen locked. And "Allow all the time" is a permission both
     * platforms make very hard to get: iOS defers its Always prompt and answers
     * "denied" in the meantime, and Android 11+ shows no dialog at all, it sends
     * you to the Settings app. Most people therefore never had it, and every one
     * of them had a walk that could not survive a locked screen.
     *
     * Both platforms say plainly, in the source of the very function being
     * called, that this is not required: a task started from the foreground WITH
     * a foreground-service notification is a "user-initiated foreground service"
     * and needs only the when-in-use permission. That is the same thing every
     * fitness app does, and it is what the blue location pill on iOS and the
     * notification on Android are FOR.
     *
     * Started BEFORE the background permission is requested, deliberately.
     * Android refuses to start a foreground service from the background, and
     * `requestBackgroundPermissionsAsync` on Android 11+ leaves the app to go to
     * Settings — so asking first is how the start would fail.
     */
    const already = await location.hasStartedLocationUpdatesAsync(MOVE_LOCATION_TASK);

    if (!already) {
      currentProfile = "moving";
      await location.startLocationUpdatesAsync(MOVE_LOCATION_TASK, locationOptions(location, "moving"));
    }

    return (await ensureBackgroundPermission(location)) ? "always" : "while-running";
  } catch {
    return "unavailable";
  }
}

/**
 * Whether the OS may wake Lumo for location once Lumo is gone.
 *
 * Worth having and never worth blocking on: it is the difference between a walk
 * that survives being force-quit and one that does not, and the recording is
 * already running either way by the time this is asked.
 *
 * Google Play requires a prominent disclosure BEFORE the system dialog, so the
 * already-granted case is checked first — nobody who has said yes is
 * re-explained to — and a decline means the dialog is not shown at all.
 */
async function ensureBackgroundPermission(location: LocationModule): Promise<boolean> {
  try {
    const current = await location.getBackgroundPermissionsAsync();

    if (current.granted) {
      return true;
    }

    /**
     * Asked once per launch, not once per walk.
     *
     * Neither platform answers "granted" the moment somebody agrees — iOS defers
     * its Always prompt, Android hands over to Settings — so without this the
     * disclosure and the dialog would come back at the start of every single
     * walk, which is how a permission gets refused for good. A fresh launch asks
     * again, and the disclosure still comes first every time it does, which is
     * what the policy is actually about.
     */
    if (askedForBackgroundThisLaunch) {
      return false;
    }

    askedForBackgroundThisLaunch = true;

    if (!(await requestBackgroundLocationConsent())) {
      return false;
    }

    return (await location.requestBackgroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

let askedForBackgroundThisLaunch = false;

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
