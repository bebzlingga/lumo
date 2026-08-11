import type { ActivityType } from "@/lib/move/tracking/config";
import { TRACKING_CONFIG } from "@/lib/move/tracking/config";
import {
  currentFix,
  setSamplingProfile,
  startTracking,
  stopTracking,
  watchForeground,
  type BackgroundStartResult,
  type FixWatch
} from "@/lib/move/tracking/backgroundLocation";
import { gpsQualityFrom, isReadyToStart } from "@/lib/move/tracking/movement";
import { clearActivity, clearQueue, drainFixes, loadActivity, saveActivity, type PendingFix } from "@/lib/move/tracking/storage";
import {
  beginTracking,
  createActivity,
  finishActivity,
  pauseActivity,
  processLocation,
  restoreActivity,
  resumeActivity,
  setSteps,
  tick
} from "@/lib/move/tracking/tracker";
import type { ActivityTrackingState, GpsQuality } from "@/lib/move/tracking/types";
import { createWalkId, watchSteps, type StepWatch } from "@/lib/walkTracking";

/**
 * The thing that owns a recording.
 *
 * One object, outside React, holding the activity state and every subscription
 * that feeds it. Screens subscribe and render; they never decide anything. That
 * separation is what makes the tracker survive a re-render, a screen change,
 * and a navigation away — and it is why the engine underneath could be tested
 * without mounting a single component.
 *
 * Everything that DECIDES is in `tracker.ts` and is pure. This file is wiring:
 * timers, subscriptions, disk, and the order things happen in.
 */

export type TrackerListener = (state: ActivityTrackingState | null) => void;

export type PrepareState = {
  /** Null until the first fix of the acquisition phase lands. */
  quality: GpsQuality;
  accuracyM: number | null;
  ready: boolean;
  /** What we managed to get from the OS — see `startTracking`. */
  permission: BackgroundStartResult | null;
};

export type PrepareListener = (state: PrepareState) => void;

class ActivityTrackerController {
  private state: ActivityTrackingState | null = null;
  private prepare: PrepareState = { quality: "unavailable", accuracyM: null, ready: false, permission: null };

  private listeners = new Set<TrackerListener>();
  private prepareListeners = new Set<PrepareListener>();

  private clock: ReturnType<typeof setInterval> | null = null;
  private autosave: ReturnType<typeof setInterval> | null = null;
  private foregroundWatch: FixWatch | null = null;
  private stepWatch: StepWatch | null = null;
  /** Steps at the moment the activity began, so the count is this walk's own. */
  private stepBaseline: number | null = null;
  private lastStepAt = 0;

  // --- subscription ---------------------------------------------------------

  subscribe(listener: TrackerListener): () => void {
    this.listeners.add(listener);
    listener(this.state);

    return () => this.listeners.delete(listener);
  }

  subscribePrepare(listener: PrepareListener): () => void {
    this.prepareListeners.add(listener);
    listener(this.prepare);

    return () => this.prepareListeners.delete(listener);
  }

  getState(): ActivityTrackingState | null {
    return this.state;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private emitPrepare(): void {
    for (const listener of this.prepareListeners) {
      listener(this.prepare);
    }
  }

  private set(next: ActivityTrackingState | null): void {
    const wasStopped = this.state?.movement === "stopped";

    this.state = next;
    this.emit();

    /**
     * Battery: ease the sampling rate off once the tracker is SURE nothing is
     * happening, and restore it the instant that changes.
     *
     * Only on the transition, and only at `stopped` — never at
     * `possiblyStopped`, which exists precisely because we are not sure yet.
     * Easing off there would cost the first few metres of every restart.
     */
    if (next && next.movement === "stopped" && !wasStopped) {
      void setSamplingProfile("stopped");
    } else if (next && next.movement !== "stopped" && wasStopped) {
      void setSamplingProfile("moving");
    }
  }

  // --- acquisition ----------------------------------------------------------

  /**
   * Asks for permission and starts sampling, before any activity exists.
   *
   * The point is the first fixes after a cold start: they are routinely
   * hundreds of metres out, and a walk that opens with one has already recorded
   * a lie. Here they only ever set the signal indicator.
   */
  async beginPrepare(): Promise<BackgroundStartResult> {
    const permission = await startTracking();

    this.prepare = { ...this.prepare, permission };
    this.emitPrepare();

    if (permission === "unavailable") {
      return permission;
    }

    // Background delivery is the primary source; a foreground watch is only
    // added when background permission was refused, so the two never double up.
    if (permission === "foreground-only" && !this.foregroundWatch) {
      this.foregroundWatch = await watchForeground((fix) => this.onFix(fix));
    }

    const fix = await currentFix();

    if (fix) {
      this.onPrepareFix(fix);
    }

    return permission;
  }

  private onPrepareFix(fix: PendingFix): void {
    const accuracyM = fix.horizontalAccuracy ?? null;
    const quality = gpsQualityFrom({ accuracyM, lastFixAt: fix.timestamp, now: Date.now() });

    this.prepare = { ...this.prepare, quality, accuracyM, ready: isReadyToStart(quality) };
    this.emitPrepare();
  }

  // --- the activity ---------------------------------------------------------

  /**
   * Starts recording.
   *
   * Called after the countdown, never before it: the seconds spent counting
   * down are not walking, and the engine's clock starts at `beginTracking`.
   */
  async start(type: ActivityType, options: { autoPause?: boolean } = {}): Promise<void> {
    const now = Date.now();

    if (this.prepare.permission === null) {
      await this.beginPrepare();
    }

    // Anything the acquisition phase queued belongs to nobody.
    await clearQueue();

    const created = createActivity({ activityId: createWalkId(), type, now, autoPause: options.autoPause });

    this.set(beginTracking(created, now));
    this.startSteps();
    this.startTimers();
    void saveActivity(this.state!);
  }

  /** A fix from any source — background queue, foreground watch, or a test. */
  onFix(fix: PendingFix): void {
    if (!this.state) {
      this.onPrepareFix(fix);

      return;
    }

    const result = processLocation(this.state, fix, {
      now: Date.now(),
      steppingRecently: this.steppingRecently()
    });

    this.set(result.state);
  }

  /**
   * Takes everything the background task collected and runs it through the
   * engine in order.
   *
   * Called when the app comes back to the foreground and on every clock tick,
   * because the OS may hand the task a batch at any moment — including while
   * the app is visible.
   */
  async drainBackground(): Promise<void> {
    const fixes = await drainFixes();

    if (fixes.length === 0 || !this.state) {
      return;
    }

    let next = this.state;

    for (const fix of fixes) {
      next = processLocation(next, fix, { now: Math.max(fix.timestamp, next.lastTickAt), steppingRecently: this.steppingRecently() }).state;
    }

    // The queue's newest fix may be older than now — bring the clock forward.
    this.set(tick(next, Date.now()));
    void saveActivity(this.state!);
  }

  pause(): void {
    if (!this.state) {
      return;
    }

    this.set(pauseActivity(this.state, Date.now()));
    void saveActivity(this.state!);
  }

  resume(): void {
    if (!this.state) {
      return;
    }

    this.set(resumeActivity(this.state, Date.now()));
    void saveActivity(this.state!);
  }

  /**
   * Ends the recording and releases the device.
   *
   * Location stops HERE rather than when the summary is dismissed: the activity
   * is over, and everything after this is looking at what was recorded.
   */
  async finish(): Promise<ActivityTrackingState | null> {
    if (!this.state) {
      return null;
    }

    await this.drainBackground();
    this.set(finishActivity(this.state!, Date.now()));
    this.stopTimers();
    await stopTracking();
    await saveActivity(this.state!);

    return this.state;
  }

  /** Throws the activity away, and stops the device with it. */
  async discard(): Promise<void> {
    this.stopTimers();
    await stopTracking();
    await clearActivity();
    await clearQueue();
    this.prepare = { quality: "unavailable", accuracyM: null, ready: false, permission: null };
    this.set(null);
    this.emitPrepare();
  }

  /**
   * Looks for an activity left behind by a crash or a kill.
   *
   * Returns it WITHOUT resuming: what to do with it is the user's call, and
   * silently carrying on with a walk that ended when the app died would put
   * hours of elapsed time into it. `restoreActivity` attributes the gap to
   * elapsed only and opens a fresh segment.
   */
  async recover(): Promise<ActivityTrackingState | null> {
    const stored = await loadActivity();

    if (!stored || stored.status === "finished") {
      return stored;
    }

    const restored = restoreActivity(stored, Date.now());

    this.set(restored);
    await saveActivity(restored);

    return restored;
  }

  /** Picks up a recovered activity and starts recording again. */
  async continueRecovered(): Promise<void> {
    if (!this.state) {
      return;
    }

    await startTracking();
    this.startSteps();
    this.startTimers();
    this.set(resumeActivity({ ...this.state, status: "paused" }, Date.now()));
  }

  // --- device wiring --------------------------------------------------------

  private startTimers(): void {
    this.stopTimers();

    // The display clock. One second is what a stopwatch needs; nothing about
    // the recording depends on it, since every duration is derived from
    // instants rather than counted up here.
    this.clock = setInterval(() => {
      if (!this.state) {
        return;
      }

      this.set(tick(this.state, Date.now()));
      void this.drainBackground();
    }, 1000);

    this.autosave = setInterval(() => {
      if (this.state) {
        void saveActivity(this.state);
      }
    }, TRACKING_CONFIG.storage.autosaveMs);
  }

  private stopTimers(): void {
    if (this.clock) {
      clearInterval(this.clock);
      this.clock = null;
    }

    if (this.autosave) {
      clearInterval(this.autosave);
      this.autosave = null;
    }

    this.foregroundWatch?.stop();
    this.foregroundWatch = null;
    this.stepWatch?.stop();
    this.stepWatch = null;
    this.stepBaseline = null;
  }

  /**
   * The pedometer, which counts THIS activity's steps.
   *
   * The platform reports a running total, so the first reading becomes the
   * baseline and everything after is a delta. Without that, a walk would open
   * with however many steps the phone had counted since midnight.
   */
  private startSteps(): void {
    if (this.stepWatch) {
      return;
    }

    void watchSteps((steps) => {
      if (!this.state) {
        return;
      }

      if (this.stepBaseline === null) {
        this.stepBaseline = steps;
      }

      this.lastStepAt = Date.now();
      this.set(setSteps(this.state, Math.max(0, steps - this.stepBaseline)));
    }).then((watch) => {
      this.stepWatch = watch;
    });
  }

  /**
   * Whether the pedometer has seen anything lately.
   *
   * `undefined` on a device with no pedometer — never `false`. The filter reads
   * that as "no opinion", so a phone without a step counter tracks exactly as
   * well, with one fewer corroborating signal.
   */
  private steppingRecently(): boolean | undefined {
    if (!this.stepWatch) {
      return undefined;
    }

    return Date.now() - this.lastStepAt <= TRACKING_CONFIG.steps.corroborationWindowMs;
  }
}

/**
 * One controller for the app.
 *
 * A module singleton rather than something a screen creates, because a
 * recording outlives every screen that looks at it — navigating away from the
 * walk must not end it.
 */
export const activityTracker = new ActivityTrackerController();
