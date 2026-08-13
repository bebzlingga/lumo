import { TRACKING_CONFIG } from "@/lib/move/tracking/config";
import {
  currentFix,
  lastKnownFix,
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
  private prepareRetry: ReturnType<typeof setInterval> | null = null;
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

    /**
     * A foreground watch ALWAYS, not only when background permission was
     * refused.
     *
     * The background task is configured with a distance filter — it exists for
     * when the screen is off and the phone is in a pocket, and it is right that
     * it stays quiet while nothing moves. But that made the app appear broken
     * while somebody stood still with it open: no fixes, the last one stale
     * after fifteen seconds, and a badge reading "Searching" with a perfect
     * lock behind it.
     *
     * The two sources overlapping is fine. Distance is accumulated leg by leg
     * along a path, so more points on the same path do not add up to more
     * kilometres, and the filter drops duplicates and jitter before either can.
     */
    if (!this.foregroundWatch) {
      this.foregroundWatch = await watchForeground((fix) => this.onFix(fix));
    }

    // The OS usually has something already — instant, coarse, and enough to
    // point the map somewhere real while the receiver works.
    const known = await lastKnownFix();

    if (known) {
      this.seedFrame(known);
    }

    const fix = await currentFix();

    if (fix) {
      this.onPrepareFix(fix);
    } else {
      this.retryPrepare();
    }

    return permission;
  }

  /**
   * Asks again, on a timer, until a fix lands.
   *
   * `currentFix` fails outright indoors, in a lift, in a car park — and used to
   * fail once and never try again, leaving the screen searching forever with
   * nothing behind it doing anything. Stops as soon as anything arrives, from
   * here or from the watch.
   */
  private retryPrepare(): void {
    if (this.prepareRetry) {
      return;
    }

    const startedAt = Date.now();

    this.prepareRetry = setInterval(() => {
      const timedOut = Date.now() - startedAt > TRACKING_CONFIG.location.startupTimeoutMs * 4;

      if (this.prepare.accuracyM !== null || timedOut) {
        this.stopPrepareRetry();

        return;
      }

      void currentFix().then((fix) => {
        if (fix) {
          this.onPrepareFix(fix);
          this.stopPrepareRetry();
        }
      });
    }, 3000);
  }

  private stopPrepareRetry(): void {
    if (this.prepareRetry) {
      clearInterval(this.prepareRetry);
      this.prepareRetry = null;
    }
  }

  /**
   * Somewhere to point the map, from a fix too old to trust for anything else.
   *
   * Sets the position but NOT the quality: a two-minute-old reading says
   * nothing about the signal right now, and showing "Good" on the strength of
   * it would be the indicator lying about the one thing it is for.
   */
  private seedFrame(fix: PendingFix): void {
    if (this.state || this.prepare.accuracyM !== null) {
      return;
    }

    this.onFix(fix);
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
  async start(options: { autoPause?: boolean; companions?: string[] } = {}): Promise<void> {
    const now = Date.now();

    if (this.prepare.permission === null) {
      await this.beginPrepare();
    }

    // Anything the acquisition phase queued belongs to nobody.
    await clearQueue();

    const created = createActivity({
      activityId: createWalkId(),
      now,
      autoPause: options.autoPause,
      companions: options.companions
    });

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

  /**
   * Releases the device if no activity ever started.
   *
   * The acquisition phase turns the receiver ON — background updates and a
   * foreground watch — before there is anything to record, which is the point:
   * the first fixes after a cold start are the bad ones and they are best spent
   * before the clock. But nothing turned it back OFF again on the way out. Open
   * the screen, decline the permission or simply change your mind, and both
   * sources kept running for the life of the process: the location indicator
   * lit, the battery draining, for a walk nobody took.
   *
   * A no-op once an activity exists. Leaving a screen must never end a
   * recording — that is the whole reason the controller outlives the screen.
   */
  async releaseIfIdle(): Promise<void> {
    if (this.state) {
      return;
    }

    this.stopPrepareRetry();
    this.foregroundWatch?.stop();
    this.foregroundWatch = null;
    await stopTracking();

    this.prepare = { quality: "unavailable", accuracyM: null, ready: false, permission: null };
    this.emitPrepare();
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
    /**
     * AN ACTIVITY ALREADY IN MEMORY IS NOT A LEFTOVER.
     *
     * This controller outlives every screen — that is the whole reason it exists
     * outside React — so if `this.state` is set, this process never died and there
     * is nothing to recover.
     *
     * Without this guard, walking with the app open and returning to the tracking
     * screen re-entered recovery on the LIVE walk: `restoreActivity` closed the
     * open segment, charged the "gap" to elapsed time and dropped GPS quality to
     * unavailable, the screen asked "you have a walk in progress — discard or keep
     * it?" about the walk being recorded at that moment, and answering put it back
     * where it started. Every return to the screen asked again. The recording was
     * never lost, but it could not be got out of, and it was being quietly damaged
     * each time.
     */
    if (this.state) {
      return null;
    }

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

    this.stopPrepareRetry();
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
