import type { WalkPoint, WalkRecord } from "@/lib/walk";

/**
 * The walk sync queue's decisions — what to send, when to retry, what a walk
 * looks like as a row. The app's first real queue.
 *
 * Every other network write in Lumo is fire-and-forget with a `.catch(() =>
 * undefined)`, which is fine for a habit completion (the local copy is the
 * truth and the next launch re-runs the sync) and not fine for a walk: a walk
 * is recorded once, cannot be re-created, and the whole point of the feature is
 * that it survives being made in airplane mode halfway up a hill.
 *
 * Three rules hold the design together.
 *
 * **A completed walk is never discarded because sync failed.** The record lives
 * in the local store no matter what happens here. `synced` is a flag on it, not
 * a condition of its existence, and a walk that never reaches a server is still
 * a walk you took.
 *
 * **A job names a walk; it does not copy one.** The payload is read from the
 * store at drain time, so a note added after the walk was queued goes up with
 * it, and a walk deleted before it synced quietly drops its job instead of
 * resurrecting itself on the server.
 *
 * **Every write is an upsert on a key the client minted.** `walk_sessions.id`
 * comes from the device and `walk_route_batches` is keyed `(walk_id, seq)`, so
 * a retry after a timeout that actually succeeded is a no-op rather than a
 * duplicate. That is what makes retrying safe enough to do forever.
 */

/**
 * Route points per batch.
 *
 * Small enough that a bad connection can land one, large enough that an hour's
 * simplified route is a handful of requests rather than dozens. The route
 * stored on a record is already simplified — a few hundred points at most.
 */
export const BATCH_SIZE = 100;

/**
 * Backoff, doubling from ten seconds and capped at an hour.
 *
 * Capped rather than unbounded because the common failure is "no signal", which
 * ends the moment the phone finds a network — and a queue that has backed off
 * to six hours would sit idle through the whole evening it came back online.
 * `AppState` and NetInfo both kick the drain anyway; this only paces retries
 * within a single stretch of being awake.
 */
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts));
}

/**
 * One walk waiting to reach the server.
 *
 * `batchesDone` is how a half-uploaded route resumes rather than restarting.
 * It is only ever advanced after a batch is confirmed, so the worst case is
 * re-sending one batch that already landed — which the `(walk_id, seq)` key
 * makes free.
 */
export type WalkJob = {
  walkId: string;
  attempts: number;
  /** Epoch ms before which this job is not retried. */
  nextAttemptAt: number;
  batchesDone: number;
};

export type WalkQueue = { jobs: WalkJob[] };

export const emptyWalkQueue: WalkQueue = { jobs: [] };

/**
 * Narrows whatever storage hands back.
 *
 * A malformed job is dropped rather than repaired: the walk it names is still
 * in the local store, so the cost of losing a job is one un-synced walk that
 * the next reconciliation pass picks up again.
 */
export function normalizeWalkQueue(value: unknown): WalkQueue {
  if (!value || typeof value !== "object") {
    return emptyWalkQueue;
  }

  const raw = (value as Partial<WalkQueue>).jobs;

  if (!Array.isArray(raw)) {
    return emptyWalkQueue;
  }

  const seen = new Set<string>();
  const jobs: WalkJob[] = [];

  for (const entry of raw) {
    const job = entry as Partial<WalkJob> | undefined;

    if (!job || typeof job.walkId !== "string" || !job.walkId || seen.has(job.walkId)) {
      continue;
    }

    seen.add(job.walkId);
    jobs.push({
      walkId: job.walkId,
      attempts: Number.isFinite(job.attempts) ? Math.max(0, job.attempts as number) : 0,
      nextAttemptAt: Number.isFinite(job.nextAttemptAt) ? (job.nextAttemptAt as number) : 0,
      batchesDone: Number.isFinite(job.batchesDone) ? Math.max(0, job.batchesDone as number) : 0
    });
  }

  return { jobs };
}

/** One job per walk. Re-queuing a walk already in line resets its backoff. */
export function withJob(queue: WalkQueue, walkId: string): WalkQueue {
  return { jobs: [...queue.jobs.filter((job) => job.walkId !== walkId), { walkId, attempts: 0, nextAttemptAt: 0, batchesDone: 0 }] };
}

export function withoutJob(queue: WalkQueue, walkId: string): WalkQueue {
  return { jobs: queue.jobs.filter((job) => job.walkId !== walkId) };
}

/** Records a failure and pushes the job out by its backoff. */
export function withFailure(queue: WalkQueue, walkId: string, now: number, batchesDone?: number): WalkQueue {
  return {
    jobs: queue.jobs.map((job) =>
      job.walkId === walkId
        ? {
            ...job,
            attempts: job.attempts + 1,
            nextAttemptAt: now + backoffMs(job.attempts),
            batchesDone: batchesDone ?? job.batchesDone
          }
        : job
    )
  };
}

/** The jobs due now, oldest first. */
export function dueJobs(queue: WalkQueue, now: number): WalkJob[] {
  return queue.jobs.filter((job) => job.nextAttemptAt <= now);
}

/** Splits a route into the batches it will be uploaded in. */
export function routeBatches(route: WalkPoint[], size = BATCH_SIZE): WalkPoint[][] {
  const batches: WalkPoint[][] = [];

  for (let index = 0; index < route.length; index += size) {
    batches.push(route.slice(index, index + size));
  }

  return batches;
}

/**
 * Everything the tracker knows that a `WalkRecord` has no field for.
 *
 * Passed alongside rather than folded into the record, because the record is
 * the app's own shape — history lists, habit ticking, the route drawing — and
 * none of them care about paused time or an integrity verdict. This is the
 * server's extra, and it is optional: a walk recorded before the tracker
 * existed simply has none of it.
 */
export type ActivityFacts = {
  type?: "walk" | "run";
  elapsedMs?: number;
  pausedMs?: number;
  averagePaceMsPerKm?: number | null;
  averageSpeedMs?: number | null;
  caloriesEstimate?: number | null;
  segmentCount?: number;
  integrityOk?: boolean;
  integrityReason?: string | null;
};

/** The row a record becomes. `now` stamps `updated_at`; the module reads no clock. */
export function walkRow(record: WalkRecord, userId: string, now: number, facts: ActivityFacts = {}) {
  return {
    id: record.id,
    user_id: userId,
    started_at: new Date(record.startedAt).toISOString(),
    ended_at: new Date(record.endedAt).toISOString(),
    active_ms: Math.round(record.activeMs),
    // On foot only. Whatever was thrown out as vehicle travel rides in its own
    // column so the server sees the same two numbers the device does.
    distance_m: record.distanceM,
    vehicle_m: record.vehicleM,
    // Null rather than 0 when the device had no pedometer — the column is
    // nullable for exactly this distinction.
    steps: record.steps,
    mood: record.mood ?? null,
    note: record.note ?? null,
    habit_ids: record.habitIds,
    activity_type: facts.type ?? "walk",
    // Falls back to the moving time for a walk recorded before the tracker:
    // the two were the same thing then, and a zero would read as an activity
    // that took no time at all.
    elapsed_ms: Math.round(facts.elapsedMs ?? record.activeMs),
    paused_ms: Math.round(facts.pausedMs ?? 0),
    average_pace_ms_per_km: facts.averagePaceMsPerKm ?? null,
    average_speed_ms: facts.averageSpeedMs ?? null,
    calories_estimate: facts.caloriesEstimate ?? null,
    segment_count: facts.segmentCount ?? 1,
    integrity_ok: facts.integrityOk !== false,
    integrity_reason: facts.integrityReason ?? null,
    updated_at: new Date(now).toISOString()
  };
}
