import type { ActivityType } from "@/lib/move/tracking/config";
import type { SmoothingState } from "@/lib/move/tracking/smoothing";

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
  /**
   * Where the tracker believes this fix actually was — see `smoothing.ts`.
   *
   * SEPARATE FIELDS RATHER THAN CORRECTING THE ONES ABOVE. The filter judges
   * the RAW fix; distance, current pace and the drawn line all use THESE,
   * because raw fixes zigzag several metres either side of a street that was
   * straight and every zig is counted as distance.
   *
   * Both are true of the same fix: one is what the receiver said, the other is
   * the best estimate of where the phone was when it said it. Neither is allowed
   * to overwrite the other.
   *
   * Absent on rejected fixes and on anything recorded before smoothing existed,
   * so every reader falls back to the raw pair.
   */
  drawLatitude?: number;
  drawLongitude?: number;
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
 * indicator, and nothing counts. `autoPaused` is the tracker's own decision,
 * taken only when it cannot locate you, and it lifts itself the moment it can;
 * `paused` is the user's and only they can lift it.
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
  /**
   * The same distance, split by how fast each leg was covered.
   *
   * Kept as the activity runs rather than derived at the end, because it is a
   * property of each LEG and the route alone cannot say which legs were run —
   * a fix every fifteen seconds averages a sprint and a stroll into the same
   * line. The two always sum to `distanceMeters`.
   */
  walkingMeters: number;
  runningMeters: number;

  /** Steps as reported by the pedometer, or null where there is none. */
  steps: number | null;

  movement: MovementState;
  /** When the CANDIDATE state began — what hysteresis is measured from. */
  movementSince: number;
  /** The last fix that showed real movement. */
  lastMovementAt: number;
  /**
   * While stopped: when the current unbroken run of moving fixes began, so a
   * resume is judged on how long movement has LASTED. Cleared by any quiet fix.
   */
  resumingSince?: number;

  gpsQuality: GpsQuality;
  /** Accuracy of the most recent fix, for the indicator and the debug overlay. */
  lastAccuracyM: number | null;
  /**
   * The last instant the tracker knew where it was — a fix inside the accuracy
   * gate, whether or not the leg it made was counted.
   *
   * What auto-pause is measured from. Rejected-for-accuracy fixes deliberately
   * do NOT count: a reading we would not put in the route is not a location.
   * Jitter does count — standing still with a perfect lock is not lost.
   *
   * Reset whenever tracking (re)starts, so a resume, a recovery and a fresh
   * start all get the same grace before the tracker concludes anything.
   */
  lastLocatedAt: number;

  segments: ActivitySegment[];
  /** Every fix, accepted or not, newest last. Bounded — see the config. */
  rawPoints: RawLocationPoint[];
  /**
   * The position estimate the route is drawn from — see `smoothing.ts`.
   *
   * Undefined before the first fix, and cleared at every segment break: the
   * point of a break is that we do not know what happened across it, and an
   * estimate carried over one would drag the first fix of the new segment back
   * toward where the old one ended.
   */
  smoothing?: SmoothingState;

  /**
   * Who set out with you, by display name.
   *
   * Names and nothing else, on purpose. A plain move has no row on the server
   * and no session anybody joins, so there is no honest way to know how far a
   * companion has walked — storing an id here would only invite a figure to be
   * invented for it later. What this supports is "you went with Ana and Sam",
   * which is true, and which the summary and the share card can both say.
   */
  companions?: string[];

  /** Set when the user pauses by hand. Only they can lift that one. */
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
