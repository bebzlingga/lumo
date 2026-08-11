import { TRACKING_CONFIG } from "@/lib/move/tracking/config";
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
};

export type MovementOutcome = { state: MovementState; since: number; lastMovementAt: number };

export function stepMovement(input: MovementInput): MovementOutcome {
  const { movement } = TRACKING_CONFIG;
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

  if (quietFor >= movement.stoppedAfterMs) {
    return input.state === "stopped"
      ? { state: "stopped", since: input.since, lastMovementAt }
      : { state: "stopped", since: input.now, lastMovementAt };
  }

  if (quietFor >= movement.possiblyStoppedAfterMs) {
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
export function isMovement(input: { legM: number; elapsedMs: number; stepping?: boolean }): boolean {
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
