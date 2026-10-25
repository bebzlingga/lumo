import { TRACKING_CONFIG } from "@/lib/move/tracking/config";
import { minimumLegM } from "@/lib/move/tracking/filter";
import type { GpsQuality, MovementState } from "@/lib/move/tracking/types";

/**
 * Is the person moving?
 *
 * A three-state machine rather than a boolean, with time thresholds between the
 * states — which is the whole point. A boolean flips on every fix: waiting at a
 * crossing would toggle a walk in and out of pause several times a minute, and
 * each toggle is a segment boundary and a jump in the pace readout.
 *
 *   moving ──quiet 6s──▶ possiblyStopped ──quiet 12s──▶ stopped
 *      ▲                        │                          │
 *      └──── movement ──────────┴───── movement 3s ────────┘
 *
 * Coming back is deliberately slower than leaving: one drifting fix should not
 * restart a walk that has genuinely stopped, so movement has to persist for
 * `resumeAfterMs` before `stopped` lifts. Going the other way, `possiblyStopped`
 * is entered on the first quiet stretch because nothing depends on it — it is
 * the state that decides nothing, and exists so `stopped` can be slow.
 *
 * THE 6 s AND 12 s ABOVE ARE FLOORS, NOT FIXED WINDOWS. They are scaled by the
 * accuracy of the fixes actually arriving, because "quiet" here means "no
 * accepted leg", and how long a walker takes to produce one is set by the
 * accuracy-scaled minimum leg. See `movementThresholds`.
 */

export type MovementInput = {
  state: MovementState;
  /** When the current state was entered. */
  since: number;
  /** The last instant real movement was seen. */
  lastMovementAt: number;
  now: number;
  /**
   * Whether THIS fix was movement: an accepted leg at more than a stroll's
   * speed, or steps in the window on a device that counts them.
   */
  moved: boolean;
  /**
   * The accuracy the receiver is currently claiming, which sets how long the
   * detector must wait before quiet means anything. Undefined leaves the flat
   * floors in place — see `movementThresholds`.
   */
  accuracyM?: number | null;
  /** Whether the pedometer is corroborating, which halves the minimum leg. */
  stepping?: boolean;
};

export type MovementOutcome = { state: MovementState; since: number; lastMovementAt: number };

/**
 * How long quiet has to last, at the accuracy currently on offer.
 *
 * The detector hears about movement only through accepted legs, and a leg is
 * accepted once it clears `minimumLegM` — which grows with the claimed error.
 * So the wait before quiet is evidence of anything has to grow with it too, or
 * a walker under trees is called stopped for the crime of being measured badly.
 * `detectSpeedMs` turns that distance into the time a slow walker needs for one
 * leg; the flat floors still apply wherever they are the longer of the two.
 */
export function movementThresholds(accuracyM?: number | null, stepping = false): { possiblyStoppedAfterMs: number; stoppedAfterMs: number } {
  const { movement } = TRACKING_CONFIG;
  /**
   * A fix outside the accuracy gate gets the FLAT floors, not a stretched one.
   *
   * The scaling answers "how long does a walker take to produce a leg this
   * receiver would accept", and past the gate the answer is never — no leg is
   * accepted at any length. Reading its claimed error as a longer minimum leg
   * would stretch the thresholds on the strength of a fix that told us nothing,
   * so a walk that lost the signal entirely would go on calling itself moving
   * for the better part of a minute.
   */
  const usable = typeof accuracyM === "number" && accuracyM > TRACKING_CONFIG.location.rejectAccuracyAboveM ? null : accuracyM;
  const detectMs = (minimumLegM(usable, stepping) / movement.detectSpeedMs) * 1000;

  return {
    possiblyStoppedAfterMs: Math.max(movement.possiblyStoppedAfterMs, detectMs),
    // Twice the detection window before a stop is called: one missed leg is a
    // slow patch, two in a row is somebody who has actually stopped walking.
    stoppedAfterMs: Math.max(movement.stoppedAfterMs, detectMs * 2)
  };
}

export function stepMovement(input: MovementInput): MovementOutcome {
  const { movement } = TRACKING_CONFIG;
  const thresholds = movementThresholds(input.accuracyM, input.stepping === true);
  const lastMovementAt = input.moved ? input.now : input.lastMovementAt;
  const quietFor = input.now - lastMovementAt;

  if (input.moved) {
    // Movement while stopped has to persist before it counts: `since` is when
    // the current stopped state began, and only sustained movement lifts it.
    if (input.state === "stopped") {
      const movingFor = input.now - Math.max(input.since, input.lastMovementAt);

      return movingFor >= movement.resumeAfterMs
        ? { state: "moving", since: input.now, lastMovementAt }
        : { state: "stopped", since: input.since, lastMovementAt };
    }

    return input.state === "moving"
      ? { state: "moving", since: input.since, lastMovementAt }
      : { state: "moving", since: input.now, lastMovementAt };
  }

  if (quietFor >= thresholds.stoppedAfterMs) {
    return input.state === "stopped"
      ? { state: "stopped", since: input.since, lastMovementAt }
      : { state: "stopped", since: input.now, lastMovementAt };
  }

  if (quietFor >= thresholds.possiblyStoppedAfterMs) {
    return input.state === "possiblyStopped"
      ? { state: "possiblyStopped", since: input.since, lastMovementAt }
      : { state: "possiblyStopped", since: input.now, lastMovementAt };
  }

  return { state: input.state, since: input.since, lastMovementAt };
}

/**
 * Whether an accepted fix counts as movement.
 *
 * Speed is the primary signal and steps are corroboration — never the other way
 * round. `stepping` is `undefined` on a phone with no pedometer, and that must
 * read as "no opinion": a device without one has to track exactly as well, with
 * only the GPS to go on.
 */
export function isMovement(input: { legM: number; elapsedMs: number; stepping?: boolean; platformSpeedMs?: number | null }): boolean {
  /**
   * The receiver's own speed wins when it gives one.
   *
   * It is Doppler, not position differencing, so it stays near zero while the
   * position wanders metres a second around a phone on a table — the drift that
   * otherwise reads as a slow walk and banks distance. iOS reports -1 and
   * Android null when it has no figure, which falls through to the leg.
   */
  if (typeof input.platformSpeedMs === "number" && Number.isFinite(input.platformSpeedMs) && input.platformSpeedMs >= 0) {
    return input.platformSpeedMs >= TRACKING_CONFIG.movement.stillSpeedMs || (input.stepping === true && input.legM > 0);
  }

  if (input.elapsedMs <= 0) {
    return false;
  }

  const speedMs = input.legM / (input.elapsedMs / 1000);

  if (speedMs >= TRACKING_CONFIG.movement.stillSpeedMs) {
    return true;
  }

  // Below walking speed by GPS, but the pedometer is counting — a slow shuffle
  // in a bad signal reads exactly like this, and it is movement.
  return input.stepping === true && input.legM >= TRACKING_CONFIG.distance.minLegM;
}

/** The signal indicator, from the newest fix's accuracy and how old it is. */
export function gpsQualityFrom(input: { accuracyM: number | null; lastFixAt: number | null; now: number }): GpsQuality {
  const { gps } = TRACKING_CONFIG;

  if (input.lastFixAt === null || input.accuracyM === null) {
    return "unavailable";
  }

  // A good fix from a minute ago says nothing about now.
  if (input.now - input.lastFixAt > gps.staleAfterMs) {
    return "unavailable";
  }

  if (input.accuracyM <= gps.excellentM) {
    return "excellent";
  }

  if (input.accuracyM <= gps.goodM) {
    return "good";
  }

  return input.accuracyM <= gps.weakM ? "weak" : "poor";
}

/** Whether the signal is good enough to start on. */
export function isReadyToStart(quality: GpsQuality): boolean {
  return quality === "excellent" || quality === "good";
}
