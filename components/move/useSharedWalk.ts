import React from "react";
import { challengeClient } from "@/lib/move/challengeClient";
import { MOVE_WITH_FRIENDS_ENABLED } from "@/lib/move/gating";
import type { ActivityType } from "@/lib/move/tracking/config";
import type { useActivityTracker } from "@/lib/move/tracking/useActivityTracker";
import { clearWalkSession, loadWalkSession } from "@/lib/move/walkSession";

/**
 * How often a shared move publishes its distance and reads the other side's.
 * Two people watching each other's kilometres do not need it faster.
 */
const WALK_SYNC_MS = 10_000;

export type WalkPeer = { userId: string; distanceM: number };

type TrackerController = ReturnType<typeof useActivityTracker>["controller"];

/**
 * The social side of a recording: presence ("out on a move") for friends'
 * pickers, and on a shared walk, publishing this device's distance and reading
 * the others'. Inert while `MOVE_WITH_FRIENDS_ENABLED` is off.
 */
export function useSharedWalk({
  recording,
  activityType,
  controller
}: {
  recording: boolean;
  activityType: ActivityType | undefined;
  controller: TrackerController;
}) {
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [peers, setPeers] = React.useState<WalkPeer[]>([]);

  // Keyed on recording alone: a pause is still being out, and flickering the
  // presence row on every autopause would be writes that say nothing.
  React.useEffect(() => {
    if (!recording || !MOVE_WITH_FRIENDS_ENABLED) {
      return;
    }

    void challengeClient.beginPresence(activityType === "run" ? "run" : "walk").catch(() => undefined);

    return () => {
      void challengeClient.endPresence().catch(() => undefined);
    };
  }, [recording, activityType]);

  /**
   * The session this walk belongs to. Read on mount and on a short retry: the
   * start page writes it in the same tick this screen opens, so one read usually
   * misses it. No session within two seconds means a solo walk.
   */
  React.useEffect(() => {
    if (!MOVE_WITH_FRIENDS_ENABLED) {
      return;
    }

    let active = true;
    let attempts = 0;
    const read = async () => {
      const stored = await loadWalkSession();

      if (!active) {
        return;
      }

      if (stored?.sessionId) {
        setSessionId(stored.sessionId);

        return;
      }

      attempts += 1;

      if (attempts < 4) {
        setTimeout(() => void read(), 500);
      }
    };

    void read();

    return () => {
      active = false;
    };
  }, []);

  /**
   * Publish-then-read on a timer (and on realtime pings), so the pair on screen
   * is never your stale number beside their fresh one. A timer rather than an
   * effect on distance, which moves with every fix.
   */
  React.useEffect(() => {
    if (!sessionId || !recording) {
      return;
    }

    let cancelled = false;
    const tick = async () => {
      await challengeClient.publishWalkDistance(sessionId, controller.getState()?.distanceMeters ?? 0);
      const others = await challengeClient.fetchWalkPeers(sessionId);

      if (!cancelled) {
        setPeers(others);
      }
    };
    const run = () => void tick().catch(() => undefined);

    run();
    const timer = setInterval(run, WALK_SYNC_MS);
    const unsubscribe = challengeClient.subscribeToWalkSession(sessionId, run);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
    };
  }, [sessionId, recording, controller]);

  /**
   * Leaves the shared walk and clears its pairing — from STORAGE, always.
   *
   * Reading the copy loaded at mount raced the start page's write: the session
   * outlived the walk, armed "Move Now" to skip the start page, and every walk
   * re-created it. Clearing a key that is already empty costs nothing.
   */
  const endSharedWalk = React.useCallback(async () => {
    void challengeClient.endPresence().catch(() => undefined);
    const stored = await loadWalkSession();

    if (stored?.sessionId) {
      void challengeClient.leaveWalkTogether(stored.sessionId).catch(() => undefined);
    }

    await clearWalkSession();
    setSessionId(null);
  }, []);

  return { peers, endSharedWalk };
}
