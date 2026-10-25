import { AppState, type AppStateStatus } from "react-native";
import { TRACKING_CONFIG } from "@/lib/move/tracking/config";
import {
  currentFix,
  lastKnownFix,
  setLiveFixSink,
  setSamplingProfile,
  startTracking,
  stopTracking,
  watchForeground,
  type BackgroundStartResult,
  type FixWatch
} from "@/lib/move/tracking/backgroundLocation";
import { clearRecordingNote, primeRecordingNote, showRecordingNote } from "@/lib/move/tracking/liveNotification";
import { formatDistance, formatDuration } from "@/lib/move/tracking/pace";
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
  /**
   * Recent pedometer readings, trimmed to the corroboration window.
   *
   * A LIST RATHER THAN A TIMESTAMP, because "has the pedometer fired lately" is
   * not the same question as "is this person walking". Shifting your feet at a
   * crossing fires it, and on the strength of one such step the tracker treated
   * the next twenty seconds as corroborated movement — which is exactly the
   * evidence a bad-signal stretch now leans on, so it had to be worth leaning
   * on. Keeping the readings makes `minStepsForMovement` real: a walker puts
   * forty steps in the window, a fidget puts two.
   */
  private stepSamples: { at: number; steps: number }[] = [];
  /** Last write to disk, so a burst of background fixes is not a burst of writes. */
  private lastSaveAt = 0;
  /** Last attempt to re-arm the receiver during an auto-pause. */
  private lastRepairAt = 0;
  /** The drain in flight, so the next one queues behind it. */
  private draining: Promise<void> = Promise.resolve();
  /** The pedometer's previous total, so steps taken while paused can be skipped. */
  private lastStepTotal: number | null = null;
  private appStateWatch: { remove: () => void } | null = null;
  /** In flight while the fix sources are being opened — see `startFixSources`. */
  private startingFixSources: Promise<void> | null = null;
  private stepsStarting = false;

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
    this.state = next;
    this.emit();

    if (!next) {
      return;
    }

    /**
     * Battery: ease the sampling rate off once the tracker is SURE nothing is
     * happening, and restore it the instant that changes.
     *
     * Only at `stopped` — never at `possiblyStopped`, which exists precisely
     * because we are not sure yet — and only after it has been `stopped` for a
     * while. That last part is `stoppedSettleMs`, and it is there because
     * changing profile RESTARTS the receiver: a walk through a town centre hits
     * `stopped` at every crossing, and re-acquiring GPS at each one costs the
     * corner it was standing on. A minute of stillness is a stop; twelve seconds
     * is a red light.
     *
     * Going back to the moving profile has no such delay, on purpose: the first
     * metres after setting off again are the ones worth having.
     */
    const stoppedFor = next.movement === "stopped" ? next.lastTickAt - next.movementSince : 0;

    void setSamplingProfile(stoppedFor >= TRACKING_CONFIG.battery.stoppedSettleMs ? "stopped" : "moving");

    void this.refreshRecordingNote();
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
     * A foreground watch ALWAYS, alongside the OS task rather than instead of it.
     *
     * The two overlapping is fine, and deliberate. Distance is accumulated leg
     * by leg along a path, so more points on the same path do not add up to more
     * kilometres, and the filter drops duplicates and jitter before either can.
     * What the second source buys is a fix every second while the app is open
     * even when the task's own delivery is quiet — which is what stops a badge
     * reading "Searching" with a perfect lock behind it.
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
   * Starts an activity, in the acquisition phase.
   *
   * It does NOT start the clock. The activity opens in `preparing` and promotes
   * itself the moment the receiver has a fix worth recording — see
   * `maybeBeginTracking`. Nobody is asked to press anything for that: the
   * decision to go out was made on the page before this one, and "wait, then
   * press start again" is a chore with a wrong answer.
   *
   * Going straight to `active` was the old behaviour and it is what made walks
   * pause themselves on the doorstep: the first fixes after a cold start fail
   * the accuracy gate, the movement detector reads a minute of that as standing
   * still, and the walk auto-paused before it had gone anywhere.
   */
  async start(options: { autoPause?: boolean; companions?: string[] } = {}): Promise<void> {
    const now = Date.now();

    if (this.prepare.permission === null) {
      await this.beginPrepare();
    }

    // Anything the acquisition phase queued belongs to nobody.
    await clearQueue();

    this.set(
      createActivity({
        activityId: createWalkId(),
        now,
        autoPause: options.autoPause,
        companions: options.companions
      })
    );

    await this.startFixSources();
    this.startTimers();
    void saveActivity(this.state!);
  }

  /**
   * Leaves the acquisition phase, by itself.
   *
   * Two ways out, and the second one matters as much as the first: a fix good
   * enough to record, or the wait running out. Indoors, in a car park, under a
   * canopy, a phone can search for minutes — and a tracker that refuses to
   * start until it is happy is a tracker that misses the first half of the
   * walk. Starting on a poor signal costs a rough opening to the route; not
   * starting costs the walk.
   *
   * The wait is judged on the ACTIVITY's own readings, never on the ones
   * `beginPrepare` collected before it existed: those can be minutes old by the
   * time somebody sets off, and beginning on a stale lock is the same mistake
   * as beginning on none. The foreground watch delivers every second, so a
   * receiver that is already warm loses nothing by being asked again.
   */
  private maybeBeginTracking(now: number): void {
    const state = this.state;

    if (!state || state.status !== "preparing") {
      return;
    }

    const { location } = TRACKING_CONFIG;
    // Freshness comes from the quality band, which goes `unavailable` once the
    // newest fix is stale — an accurate reading from a minute ago is not a lock.
    const acquired =
      state.gpsQuality !== "unavailable" && state.lastAccuracyM !== null && state.lastAccuracyM <= location.startupAccuracyM;

    if (!acquired && now - state.startedAt < location.startupTimeoutMs) {
      return;
    }

    this.set(beginTracking(state, now));
    void saveActivity(this.state!);
  }

  /** A fix from any source — background queue, foreground watch, or a test. */
  onFix(fix: PendingFix): void {
    if (!this.state) {
      this.onPrepareFix(fix);

      return;
    }

    const now = Date.now();
    const result = processLocation(this.state, fix, {
      now,
      steppingRecently: this.steppingRecently()
    });

    this.set(result.state);
    // Checked after the fix has landed, so it is judged on the reading that
    // just arrived rather than the one before it.
    this.maybeBeginTracking(now);
  }

  /**
   * Takes everything the background task collected and runs it through the
   * engine in order.
   *
   * Called when the app comes back to the foreground and on every clock tick,
   * because the OS may hand the task a batch at any moment — including while
   * the app is visible.
   */
  drainBackground(): Promise<void> {
    /**
     * One drain at a time, in order. A drain that has already taken fixes off
     * the queue but not yet processed them would otherwise land them AFTER a
     * pause or resume that started later — fixes walked before the tap get
     * thrown away as paused, or fixes from the pause open the new segment.
     */
    this.draining = this.draining.then(() => this.drainOnce()).catch(() => undefined);

    return this.draining;
  }

  private async drainOnce(): Promise<void> {
    /**
     * NOTHING IS TAKEN OFF THE QUEUE UNTIL THERE IS SOMEWHERE TO PUT IT.
     *
     * `drainFixes` removes what it reads, so the old order — read, then check
     * whether an activity exists — deleted every fix the background task had
     * collected whenever it ran a moment too early. And it did run too early, on
     * the ordinary path: coming back to the app fires the drain from an AppState
     * listener, while the activity is still being read off disk by the recovery
     * that has not finished yet. A walk recorded across a locked screen arrived
     * home with the queue already emptied into nothing.
     */
    if (!this.state) {
      return;
    }

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

    /**
     * Throttled, because this now runs on every background delivery rather than
     * once a second from a timer that was asleep anyway. The autosave interval
     * is the same promise it always was — at most ten seconds of a walk is ever
     * at risk — and it is kept here rather than left to the timer because the
     * timer does not run while the app is suspended, which is exactly when the
     * process is most likely to be killed.
     */
    const now = Date.now();

    if (now - this.lastSaveAt >= TRACKING_CONFIG.storage.autosaveMs) {
      this.lastSaveAt = now;
      void saveActivity(this.state!);
    }
  }

  async pause(): Promise<void> {
    // Fixes taken before the tap belong before the pause, not after it.
    await this.drainBackground();

    if (!this.state) {
      return;
    }

    this.set(pauseActivity(this.state, Date.now()));
    void saveActivity(this.state!);
  }

  /**
   * Picks a recording back up from the pause the USER set.
   *
   * An auto-pause is not resumable and the screen does not offer it — see
   * `resumeActivity`, and `repairWhileAutoPaused` for what happens instead.
   * `resumeActivity` returns the state untouched for one, so a stray tap costs
   * nothing, but nothing should be producing that tap.
   *
   * The device is re-armed as well as the state, because a walk can be paused
   * across a long enough gap for the OS to have dropped the updates. Starting
   * them again is cheap when they are already running (`startTracking` checks)
   * and is the whole repair when they are not.
   */
  async resume(): Promise<void> {
    // And fixes taken during the pause must not open the resumed segment.
    await this.drainBackground();

    if (!this.state || this.state.status !== "paused") {
      return;
    }

    this.set(resumeActivity(this.state, Date.now()));
    void saveActivity(this.state!);
    void this.startFixSources();
  }

  /**
   * Puts the receiver back together while the tracker has paused itself.
   *
   * AN AUTO-PAUSE IS NOW THE ONLY WAY OUT OF AN AUTO-PAUSE — the walker cannot
   * resume one — so the one repair that used to hide behind the Resume button
   * has to happen by itself. The reason fixes stopped arriving is sometimes the
   * signal and sometimes the OS having quietly dropped our updates, and the
   * second kind never recovers on its own: nothing else in the loop restarts
   * location once it is running, so the walk would sit paused forever with a
   * perfectly good receiver beside it.
   *
   * Cheap and idempotent — every part of `startFixSources` checks whether it is
   * already running — but not free, so it is spaced out rather than run on every
   * one-second tick.
   */
  private repairWhileAutoPaused(now: number): void {
    if (this.state?.status !== "autoPaused") {
      this.lastRepairAt = 0;

      return;
    }

    if (now - this.lastRepairAt < TRACKING_CONFIG.autoPause.signalLostAfterMs) {
      return;
    }

    this.lastRepairAt = now;
    void this.startFixSources();
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
    await this.stopFixSources();
    await clearRecordingNote();
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
    await this.stopFixSources();
    await clearRecordingNote();

    this.prepare = { quality: "unavailable", accuracyM: null, ready: false, permission: null };
    this.emitPrepare();
  }

  /** Throws the activity away, and stops the device with it. */
  async discard(): Promise<void> {
    this.stopTimers();
    await this.stopFixSources();
    await clearRecordingNote();
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

    if (!stored) {
      return null;
    }

    /**
     * A FINISHED-BUT-UNSAVED WALK IS ADOPTED, NOT JUST RETURNED.
     *
     * Killed on the summary screen (Finish tapped, Save not), the walk used to
     * come back as a return value only — `state` stayed null, so the screen's
     * auto-start began a fresh activity and `saveActivity` overwrote the finished
     * one on disk. Held in memory, the screen shows its summary and Save again.
     */
    if (stored.status === "finished") {
      this.set(stored);

      return stored;
    }

    const restored = restoreActivity(stored, Date.now());

    this.set(restored);
    await saveActivity(restored);
    /**
     * Drained HERE, before anything else can feed the walk. The screen opens the
     * foreground watch (`beginPrepare`) alongside recovery, so live fixes reach
     * `onFix` while the "Keep it / Discard" prompt is still up — and every queued
     * fix is older than the first live one, so draining later rejected the whole
     * crash-time queue as duplicate/stale. Discarding clears the queue anyway.
     */
    await this.drainBackground();

    return this.state;
  }

  /**
   * Picks up a recovered activity and starts recording again.
   *
   * Goes through `startFixSources` like every other way into a recording, which
   * it did not before: it called `startTracking` alone and then `startTimers`,
   * whose first act was to tear the foreground watch down. A recovered walk was
   * therefore recording from one source where a fresh one had two — and on a
   * build with no background permission at all, from none.
   */
  async continueRecovered(): Promise<void> {
    if (!this.state) {
      return;
    }

    await this.startFixSources();
    this.startTimers();
    /**
     * Whatever the background task collected while the app was gone belongs to
     * this walk, and this is the first moment there is anywhere to put it —
     * `drainBackground` refuses to touch the queue without an activity, which is
     * what kept these fixes safe until now.
     *
     * Drained BEFORE the resume, so they land in the segment they were recorded
     * in rather than on the far side of the break the resume opens.
     */
    await this.drainBackground();

    /**
     * Resume only what was running when the app died. A walk the user had paused
     * comes back paused, and one still acquiring GPS stays in that phase —
     * forcing every recovery to "active" restarted both behind the user's back.
     */
    const status = this.state?.status;

    if (status === "active" || status === "autoPaused") {
      this.set(resumeActivity({ ...this.state!, status: "paused" }, Date.now()));
    }
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

      const now = Date.now();

      this.set(tick(this.state, now));
      // The acquisition phase's only other way out: nothing has arrived, and
      // the wait is up. Without a timer this would hang on a fix that never
      // comes, which is the case it exists for.
      this.maybeBeginTracking(now);
      this.repairWhileAutoPaused(now);
      void this.drainBackground();
    }, 1000);

    this.autosave = setInterval(() => {
      if (this.state) {
        void saveActivity(this.state);
      }
    }, TRACKING_CONFIG.storage.autosaveMs);
  }

  /**
   * Stops the CLOCKS. Not the location, and that separation is the point.
   *
   * This used to stop everything: the display timer, the autosave, the
   * pedometer AND the foreground location watch. `startTimers` begins by
   * calling it, so the first thing starting a walk did was tear down the watch
   * that `beginPrepare` had just set up — leaving the recording with whatever
   * the background task delivered and, on a phone that had refused the
   * background permission, with nothing at all. Which of the two won was down to
   * which promise resolved first.
   *
   * Timers are about the display and the disk. Location is about the recording,
   * it is started and stopped by `startFixSources` and `stopFixSources`, and it
   * outlives every timer in here.
   */
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
  }

  // --- where fixes come from ------------------------------------------------

  /**
   * Turns on every source of fixes there is, and keeps them on.
   *
   * THREE of them, and each covers what the others cannot:
   *
   *  - the OS location task, which is the only one with
   *    `allowsBackgroundLocationUpdates` and therefore the only one that
   *    survives the screen locking;
   *  - a foreground watch, which delivers every second while the app is open so
   *    the indicator is honest and the map keeps up while somebody stands still;
   *  - the live sink, which lets the location task hand a background delivery
   *    straight to the pipeline instead of leaving it on disk for a timer that
   *    does not run while the app is suspended.
   *
   * Safe to call repeatedly. Every part checks whether it is already running,
   * which is what lets `resume` use it as a repair.
   */
  private async startFixSources(): Promise<void> {
    /**
     * One at a time, and the guard has to be a PROMISE rather than a flag.
     *
     * Every check in here — "is there already a watch", "is there already a step
     * counter" — reads a field that its own `await` sets several ticks later, so
     * two overlapping calls both see nothing running and both start one. Resume
     * can land on top of a start, and a second foreground watch is a second
     * subscription nothing ever stops.
     */
    if (this.startingFixSources) {
      return this.startingFixSources;
    }

    this.startingFixSources = this.openFixSources().finally(() => {
      this.startingFixSources = null;
    });

    return this.startingFixSources;
  }

  private async openFixSources(): Promise<void> {
    setLiveFixSink(() => void this.drainBackground());

    await startTracking();

    if (!this.foregroundWatch) {
      this.foregroundWatch = await watchForeground((fix) => this.onFix(fix));
    }

    await this.startSteps();
    this.watchAppState();
    // Settled here, in the foreground, so the prompt never arrives out of
    // nowhere on the way back from a locked screen. See `primeRecordingNote`.
    void primeRecordingNote();
  }

  /** And off again. Called on every path out of a recording. */
  private async stopFixSources(): Promise<void> {
    /**
     * A start still in flight is waited out first.
     *
     * Both subscriptions are assigned when their promise resolves, so tearing
     * down while one is opening clears a field that is about to be filled in
     * again — and the watch that lands afterwards has nothing left holding a
     * reference to it. That is a location subscription running for the rest of
     * the process, on a walk that has finished.
     */
    await this.startingFixSources?.catch(() => undefined);

    setLiveFixSink(null);

    this.foregroundWatch?.stop();
    this.foregroundWatch = null;
    this.stepWatch?.stop();
    this.stepWatch = null;
    this.stepBaseline = null;
    this.lastStepTotal = null;
    this.stepSamples = [];
    this.lastStepAt = 0;
    this.stepsStarting = false;

    this.appStateWatch?.remove();
    this.appStateWatch = null;

    await stopTracking();
  }

  // --- the note on the lock screen -----------------------------------------

  /**
   * Watches the app leave and come back, for the sake of the lock-screen note.
   *
   * The note only makes sense while Lumo is NOT the thing being looked at: on
   * screen it would be a banner over the very numbers it repeats. So it goes up
   * when the app leaves and comes down when it returns — and the return also
   * drains whatever arrived in between, which is belt and braces beside the live
   * sink.
   */
  private watchAppState(): void {
    if (this.appStateWatch) {
      return;
    }

    this.appStateWatch = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        void clearRecordingNote();
        void this.drainBackground();

        return;
      }

      void this.refreshRecordingNote();
    });
  }

  /**
   * Puts the walk's own figures on the lock screen, or takes them off.
   *
   * Called on every state change; `showRecordingNote` is what throttles it down
   * to something a lock screen can live with.
   */
  private async refreshRecordingNote(): Promise<void> {
    const state = this.state;

    if (!state || state.status === "finished" || AppState.currentState === "active") {
      return;
    }

    const paused = state.status === "paused" || state.status === "autoPaused";

    await showRecordingNote({
      title: paused
        ? state.status === "autoPaused"
          ? "Walk paused — no signal"
          : "Walk paused"
        : "Lumo is recording your walk",
      // Moving time, as the screen shows — elapsed kept ticking under "Walk paused".
      body: `${formatDistance(state.distanceMeters)} · ${formatDuration(state.movingDuration)}`
    });
  }

  /**
   * The pedometer, which counts THIS activity's steps.
   *
   * The platform reports a running total since the subscription opened; the
   * baseline offsets it by a recovered walk's steps and by anything counted
   * while paused.
   */
  private async startSteps(): Promise<void> {
    // `stepWatch` is only assigned once the watch resolves, so a second call in
    // the meantime would start a second counter against the same baseline.
    if (this.stepWatch || this.stepsStarting) {
      return;
    }

    this.stepsStarting = true;

    await watchSteps((steps) => {
      if (!this.state) {
        return;
      }

      /**
       * `watchStepCount` counts from 0 at SUBSCRIPTION, so the first reading is
       * already this walk's steps — subtracting it (the old baseline) dropped them
       * on every start and recovery. `state.steps` carries a recovered walk's
       * count over the restart. Only a first reading that lands while paused or
       * still acquiring belongs to nobody, and is absorbed into the baseline.
       */
      if (this.stepBaseline === null) {
        const idle = this.state.status === "paused" || this.state.status === "preparing";

        this.stepBaseline = (idle ? steps : 0) - (this.state.steps ?? 0);
      }

      // Steps taken while paused are not this walk's.
      if (this.lastStepTotal !== null && (this.state.status === "paused" || this.state.status === "preparing")) {
        this.stepBaseline += steps - this.lastStepTotal;
      }

      this.lastStepTotal = steps;

      const at = Date.now();

      this.lastStepAt = at;
      this.stepSamples = trimStepSamples([...this.stepSamples, { at, steps }], at);
      this.set(setSteps(this.state, Math.max(0, steps - this.stepBaseline)));
    })
      .then((watch) => {
        this.stepWatch = watch;
      })
      .finally(() => {
        this.stepsStarting = false;
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
    // No pedometer, or none of its readings yet: no opinion. "false" now vetoes
    // a speed-less leg as drift (see `isMovement`), so it has to mean the
    // pedometer is reporting and saw nobody walking — not that it is still
    // warming up at the start of the walk.
    if (!this.stepWatch || this.lastStepAt === 0) {
      return undefined;
    }

    const now = Date.now();

    if (now - this.lastStepAt > TRACKING_CONFIG.steps.corroborationWindowMs) {
      return false;
    }

    const opened = now - TRACKING_CONFIG.steps.corroborationWindowMs;
    const latest = this.stepSamples[this.stepSamples.length - 1];

    if (!latest) {
      return false;
    }

    /**
     * The pedometer reports a RUNNING TOTAL, so the steps in the window are the
     * newest reading minus whatever it stood at when the window opened.
     *
     * The anchor is the last reading from BEFORE the window — kept for exactly
     * this by `trimStepSamples` — because the first reading inside it already
     * includes its own burst, and subtracting that would undercount the window
     * by however many steps opened it. With no such reading the walk itself is
     * younger than the window, and its opening count is the baseline.
     */
    const anchor = [...this.stepSamples].reverse().find((sample) => sample.at < opened);
    const from = anchor?.steps ?? this.stepBaseline ?? latest.steps;

    return latest.steps - from >= TRACKING_CONFIG.steps.minStepsForMovement;
  }
}

/**
 * Drops pedometer readings that can no longer bear on the current window.
 *
 * Everything inside the window, plus ONE reading from before it: that one is
 * the anchor the window's step count is measured from, and dropping it is what
 * would make a burst of steps look like no steps at all.
 */
function trimStepSamples(samples: { at: number; steps: number }[], now: number): { at: number; steps: number }[] {
  const opened = now - TRACKING_CONFIG.steps.corroborationWindowMs;
  const anchorIndex = samples.reduce((found, sample, index) => (sample.at < opened ? index : found), -1);

  return anchorIndex <= 0 ? samples : samples.slice(anchorIndex);
}

/**
 * One controller for the app.
 *
 * A module singleton rather than something a screen creates, because a
 * recording outlives every screen that looks at it — navigating away from the
 * walk must not end it.
 */
export const activityTracker = new ActivityTrackerController();
