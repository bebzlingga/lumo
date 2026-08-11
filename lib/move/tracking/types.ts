import type { ActivityType } from "@/lib/move/tracking/config";

/**
 * The shapes the tracker works in.
 *
 * Kept apart from the engines so the filter, the movement detector and the
 * tracker can all speak the same language without importing each other.
 */

/** Why a fix did not join the route. Stored, never thrown away. */
export type RejectionReason =
  | "accuracy"
  | "stale"
  | "duplicate"
  | "impossible"
  | "teleport"
  /** Real movement, but under the minimum leg — drift while standing still. */
  | "jitter"
  /** Arrived while the activity was paused, or before it began. */
  | "notTracking";

/**
 * One GPS sample, exactly as it arrived, plus what we decided about it.
 *
 * Rejected points are KEPT. A walk that recorded badly is unexplainable
 * without them, and every improvement to the filter has to be testable against
 * the fixes that provoked it. They never reach the route or the distance.
 */
export type RawLocationPoint = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  /** Metres. Larger is worse. Null when the platform did not say. */
  horizontalAccuracy?: number | null;
  /** The platform's own speed, m/s. Recorded, never trusted for distance. */
  speed?: number | null;
  heading?: number | null;
  /** Epoch ms the fix was taken, not when it was delivered. */
  timestamp: number;
  isAccepted: boolean;
  rejectionReason?: RejectionReason;
};

/**
 * A continuous stretch of tracking.
 *
 * Distance is only ever measured WITHIN a segment. A new one starts after a
 * manual resume, a long signal gap, or a restored session — which is what
 * stops the tracker drawing a straight line across a coffee break and calling
 * it four hundred metres.
 */
export type ActivitySegment = {
  id: string;
  startedAt: number;
  endedAt?: number;
  /** Accepted fixes only. The route is these, joined. */
  points: RawLocationPoint[];
};

export type MovementState = "moving" | "possiblyStopped" | "stopped";

export type GpsQuality = "excellent" | "good" | "weak" | "poor" | "unavailable";

/**
 * Where the activity is.
 *
 * `preparing` is the acquisition phase — fixes arrive and set the signal
 * indicator, and nothing counts. `autoPaused` is the tracker's own decision and
 * lifts itself; `paused` is the user's and only they can lift it.
 */
export type ActivityStatus = "preparing" | "active" | "autoPaused" | "paused" | "finished";

export type ActivityTrackingState = {
  /**
   * Client-generated and stable for the life of the activity, including across
   * a crash and a later upload. It is what makes syncing idempotent.
   */
  activityId: string;
  type: ActivityType;
  status: ActivityStatus;
  /** Epoch ms the activity began — after the countdown, not before it. */
  startedAt: number;
  /** Epoch ms of the last instant the clock was advanced to. */
  lastTickAt: number;
  finishedAt?: number;

  /** Wall clock since `startedAt`. Never stops, including while paused. */
  elapsedDuration: number;
  /** Time spent actually moving. What average pace is measured against. */
  movingDuration: number;
  /** Time spent paused, by hand or by the tracker. */
  pausedDuration: number;

  /** Metres, accumulated leg by leg from accepted fixes only. */
  distanceMeters: number;

  /** Steps as reported by the pedometer, or null where there is none. */
  steps: number | null;

  movement: MovementState;
  /** When the CANDIDATE state began — what hysteresis is measured from. */
  movementSince: number;
  /** The last fix that showed real movement. */
  lastMovementAt: number;

  gpsQuality: GpsQuality;
  /** Accuracy of the most recent fix, for the indicator and the debug overlay. */
  lastAccuracyM: number | null;

  segments: ActivitySegment[];
  /** Every fix, accepted or not, newest last. Bounded — see the config. */
  rawPoints: RawLocationPoint[];

  /** Set when the user takes over from auto-pause. Manual always wins. */
  manuallyPaused: boolean;
  autoPauseEnabled: boolean;
};

/** What one processed fix did, for the debug overlay and the tests. */
export type ProcessResult = {
  state: ActivityTrackingState;
  point: RawLocationPoint;
  /** Metres this fix added. Zero whenever it was not accepted. */
  distanceDeltaM: number;
};
