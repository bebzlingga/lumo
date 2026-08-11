import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type NativeEventSubscription } from "react-native";
import { ensureSignedIn, isSupabaseConfigured, supabase } from "@/lib/supabase";
import { loadWalkState, saveWalkState } from "@/lib/walkStorage";
import {
  dueJobs,
  emptyWalkQueue,
  normalizeWalkQueue,
  routeBatches,
  walkRow,
  withFailure,
  withJob,
  withoutJob,
  type WalkJob,
  type WalkQueue
} from "@/lib/walkSync";

/**
 * The effects half of walk sync: storage, the network, and the lifecycle
 * listeners that decide when to try.
 *
 * Split from `lib/walkSync.ts` so that module can stay pure and testable — the
 * repo's convention is that a model module never touches storage or the clock,
 * and everything the queue DECIDES lives over there. What is left here is the
 * part that can only be exercised on a device.
 *
 * The rule that outranks the rest: **a completed walk is never discarded
 * because sync failed.** Nothing in this file deletes a local record. The
 * queue retries forever, and a walk that never reaches a server is still a walk
 * you took.
 */

const QUEUE_KEY = "@lumo/tools/walkSync";

// --- storage ----------------------------------------------------------------

export async function loadWalkQueue(): Promise<WalkQueue> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);

    return raw ? normalizeWalkQueue(JSON.parse(raw)) : emptyWalkQueue;
  } catch {
    return emptyWalkQueue;
  }
}

async function saveWalkQueue(queue: WalkQueue): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // The walk is still in the local store, so a lost queue costs a retry
    // rather than the walk — `reconcileWalkQueue` finds it again on launch.
  }
}

/** Puts a walk in line to sync. Safe to call more than once for the same walk. */
export async function enqueueWalk(walkId: string): Promise<void> {
  await saveWalkQueue(withJob(await loadWalkQueue(), walkId));
}

/**
 * Takes a deleted walk out of the queue, and off the server if it got there.
 *
 * Best-effort on the remote half, and worth being precise about why that is
 * enough today: sync is push-only — nothing ever reads walks back from the
 * server — so a row stranded by a delete made offline is invisible to the user
 * rather than something that reappears in their history. If a pull is ever
 * added, this needs a tombstone queue rather than a fire-and-forget call.
 *
 * The queue half is NOT best-effort: the job goes first, so a walk deleted
 * while it was still waiting to sync cannot be uploaded afterwards.
 */
export async function forgetWalk(walkId: string): Promise<void> {
  await saveWalkQueue(withoutJob(await loadWalkQueue(), walkId));

  if (!isSupabaseConfigured) {
    return;
  }

  try {
    const userId = await ensureSignedIn();

    if (userId) {
      // Route batches go with it — the foreign key cascades.
      await supabase.from("walk_sessions").delete().eq("id", walkId).eq("user_id", userId);
    }
  } catch {
    // See above: a row left behind is not visible to the user.
  }
}

// --- the upload -------------------------------------------------------------

type SyncOutcome = "synced" | "gone" | "failed";

/**
 * Uploads one walk: the session row, then its route in batches.
 *
 * The payload is read from the store HERE rather than carried on the job, so a
 * note added after the walk was queued goes up with it, and a walk deleted
 * before it synced drops its job instead of resurrecting itself on the server.
 */
async function syncOne(job: WalkJob, userId: string, now: number): Promise<{ outcome: SyncOutcome; batchesDone: number }> {
  const state = await loadWalkState();
  const record = state.history.find((entry) => entry.id === job.walkId);

  if (!record) {
    return { outcome: "gone", batchesDone: 0 };
  }

  const { error } = await supabase.from("walk_sessions").upsert(walkRow(record, userId, now));

  if (error) {
    return { outcome: "failed", batchesDone: job.batchesDone };
  }

  const batches = routeBatches(record.route);
  // Clamped in case a shorter route replaced a longer one under the job.
  let done = Math.min(job.batchesDone, batches.length);

  for (let seq = done; seq < batches.length; seq += 1) {
    const { error: batchError } = await supabase.from("walk_route_batches").upsert({
      walk_id: record.id,
      seq,
      points: batches[seq]
    });

    if (batchError) {
      // Resume from here next time rather than re-sending what landed. A
      // re-sent batch would be harmless anyway — `(walk_id, seq)` makes it an
      // upsert — but a long route on a poor connection should make progress.
      return { outcome: "failed", batchesDone: done };
    }

    done = seq + 1;
  }

  return { outcome: "synced", batchesDone: done };
}

/** Flags a walk as synced in the local store, if it is still there. */
async function markSynced(walkId: string): Promise<void> {
  const state = await loadWalkState();
  const history = state.history.map((record) => (record.id === walkId ? { ...record, synced: true } : record));

  await saveWalkState({ ...state, history });
}

/**
 * One drain is enough.
 *
 * Both triggers — foregrounding and a reconnect — routinely fire within a
 * moment of each other, and two drains racing would double every request and
 * fight over the queue file.
 */
let draining = false;

export type DrainResult = { synced: number; failed: number; skipped: number };

/**
 * Works through whatever is due.
 *
 * Never throws: it is called from an AppState listener and a NetInfo listener,
 * neither of which has anywhere to put an error.
 */
export async function drainWalkQueue(now = Date.now()): Promise<DrainResult> {
  const result: DrainResult = { synced: 0, failed: 0, skipped: 0 };

  if (draining || !isSupabaseConfigured) {
    return result;
  }

  draining = true;

  try {
    const queue = await loadWalkQueue();
    const due = dueJobs(queue, now);

    if (due.length === 0) {
      return result;
    }

    const userId = await ensureSignedIn();

    if (!userId) {
      // Offline, or not configured. Nothing is marked failed and nothing backs
      // off — this is not the walk's fault, and pushing its next attempt out
      // would punish it for the network.
      result.skipped = due.length;

      return result;
    }

    let next = queue;

    for (const job of due) {
      try {
        const { outcome, batchesDone } = await syncOne(job, userId, now);

        if (outcome === "synced") {
          await markSynced(job.walkId);
          next = withoutJob(next, job.walkId);
          result.synced += 1;
        } else if (outcome === "gone") {
          next = withoutJob(next, job.walkId);
          result.skipped += 1;
        } else {
          next = withFailure(next, job.walkId, now, batchesDone);
          result.failed += 1;
        }
      } catch {
        next = withFailure(next, job.walkId, now);
        result.failed += 1;
      }
    }

    await saveWalkQueue(next);

    return result;
  } catch {
    return result;
  } finally {
    draining = false;
  }
}

/**
 * Re-queues walks the store has but the queue does not.
 *
 * The safety net for the one gap the queue cannot cover itself: a crash between
 * filing a walk and writing its job. Cheap enough to run on every launch — a
 * scan of at most `WALK_HISTORY_LIMIT` local records with no network in it,
 * enqueuing nothing when everything is already synced.
 */
export async function reconcileWalkQueue(): Promise<number> {
  const [state, queue] = await Promise.all([loadWalkState(), loadWalkQueue()]);
  const queued = new Set(queue.jobs.map((job) => job.walkId));
  const missing = state.history.filter((record) => !record.synced && !queued.has(record.id));

  if (missing.length === 0) {
    return 0;
  }

  await saveWalkQueue({
    jobs: [...queue.jobs, ...missing.map((record) => ({ walkId: record.id, attempts: 0, nextAttemptAt: 0, batchesDone: 0 }))]
  });

  return missing.length;
}

// --- when to try ------------------------------------------------------------

/**
 * NetInfo is behind the deferred-require pattern from `lib/orientation.ts`: it
 * is a native module, and a top-level import would crash any build made before
 * it was linked. Without it the app still syncs — just on foregrounding alone.
 */
type NetInfoModule = typeof import("@react-native-community/netinfo");

let netInfoModule: NetInfoModule | null | undefined;

function loadNetInfo(): NetInfoModule | null {
  if (netInfoModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      netInfoModule = require("@react-native-community/netinfo") as NetInfoModule;
    } catch {
      netInfoModule = null;
    }
  }

  return netInfoModule;
}

/** True when a reconnect can wake the queue, rather than only foregrounding. */
export function canWatchConnectivity(): boolean {
  return loadNetInfo() !== null;
}

/**
 * Starts the queue and returns a stop function. Called once, from the root
 * layout.
 *
 * Two triggers, the same self-healing shape the app already uses for profile
 * sync and entitlements:
 *
 *  - **Foregrounding.** The ordinary case: the walk finished, the phone went in
 *    a pocket with no signal, and the app is opened again at home.
 *  - **Reconnecting.** The app already open when the signal comes back, which
 *    foregrounding alone would leave waiting out the backoff.
 */
export function startWalkSync(): () => void {
  // Reconcile before the first drain, so a walk whose job was lost to a crash
  // goes up in the same pass rather than waiting for the next launch.
  void reconcileWalkQueue()
    .then(() => drainWalkQueue())
    .catch(() => undefined);

  const appStateSubscription: NativeEventSubscription = AppState.addEventListener("change", (next) => {
    if (next === "active") {
      void drainWalkQueue().catch(() => undefined);
    }
  });

  const netInfo = loadNetInfo();
  let unsubscribeNetInfo: (() => void) | null = null;

  if (netInfo) {
    /**
     * `isInternetReachable` rather than `isConnected`: a phone joined to a wifi
     * network it has not authenticated with is "connected" and cannot reach
     * anything, and draining into that burns an attempt and doubles the backoff.
     */
    let reachable = false;

    unsubscribeNetInfo = netInfo.addEventListener((state) => {
      const nowReachable = state.isInternetReachable === true;

      // Only the transition, not every state event — NetInfo emits while
      // connected too, and each one would start another drain.
      if (nowReachable && !reachable) {
        void drainWalkQueue().catch(() => undefined);
      }

      reachable = nowReachable;
    });
  }

  return () => {
    appStateSubscription.remove();
    unsubscribeNetInfo?.();
  };
}
