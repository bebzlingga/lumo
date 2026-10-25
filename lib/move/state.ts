import { addDays } from "@/lib/date";
import { normalizeAchievement, type MoveAchievement } from "@/lib/move/achievements";
import { normalizeActiveChallenge, type ActiveMoveChallenge } from "@/lib/move/activeChallenge";
import { normalizeGoal, type MoveGoal } from "@/lib/move/goal";
import { emptyTotals, mergeSummaries, normalizeSummary, normalizeTotals } from "@/lib/move/movement";
import type { MovementSummary, MoveTotals } from "@/lib/move/types";

/**
 * The shape of Move's persisted state, and every decision about it that does
 * not need a device.
 *
 * Split from `lib/move/store.ts` so this half stays pure and testable: the
 * repo's convention is that a model module never touches storage, the network
 * or the clock. What is left over there is the part that can only be exercised
 * on a device.
 */

/**
 * How much history the first sync pulls.
 *
 * Enough for the weekly summary and a believable starting total without
 * trawling years of Health on first open. Later syncs are incremental, so this
 * cost is paid once.
 */
export const INITIAL_SYNC_DAYS = 30;

/** Days always re-read, however recent the last sync. */
const REFRESH_WINDOW_DAYS = 2;

/**
 * How far back the daily cache is kept.
 *
 * A year covers every window Move measures and bounds the stored blob. Trimming
 * is safe BECAUSE the cumulative ledger is separate: dropping old summaries
 * loses the daily detail, never the total they contributed to.
 */
const CACHE_DAYS = 365;

export type MoveState = {
  /** True once the intro has been seen, so it shows exactly once. */
  onboarded: boolean;
  /**
   * The one challenge in progress, or null.
   *
   * Singular by type, which is the cheapest place to enforce the rule: there is
   * no array here that a bug could put a second entry into.
   */
  active: ActiveMoveChallenge | null;
  /** Badges earned, one per milestone, with a record of how. */
  achievements: MoveAchievement[];
  /** Daily movement cache, ascending by date. */
  summaries: MovementSummary[];
  /** The cumulative ledger the journey reads. */
  totals: MoveTotals;
  /** Local date key of the last successful sync, or null. */
  lastSyncedDate: string | null;
  /** Challenge ids already celebrated, so the finish screen fires once. */
  celebrated: string[];
  /**
   * The reader's own renewing distance target, or null.
   *
   * Singular, like `active` above and for the same reason: two goals at once is
   * two answers to "how much am I walking", and the type is the cheapest place
   * to say there is only one. It sits ALONGSIDE `active` rather than competing
   * with it — see `lib/move/goal.ts` for why a goal and a challenge are
   * different things that both run.
   */
  goal: MoveGoal | null;
};

export const emptyMoveState: MoveState = {
  onboarded: false,
  active: null,
  achievements: [],
  summaries: [],
  totals: emptyTotals,
  lastSyncedDate: null,
  celebrated: [],
  goal: null
};

/**
 * Narrows whatever storage hands back.
 *
 * Forward-only and field-by-field, the convention `normalizeHabit` established
 * — the app has no schema version, so every reader repairs what it can and
 * drops only what it cannot use.
 *
 * ## Migrating off the OLD goals
 *
 * A stored `goals` ARRAY from the system that predates challenges is DROPPED,
 * silently. Those goals were recurring targets with no milestone and no fixed
 * distance, so there was no honest challenge to turn one into — inventing a
 * mapping would have handed someone a challenge they never chose.
 *
 * The singular `goal` field read below is a different thing under a different
 * key, added after: one renewing distance target the reader sets for themselves
 * (see `lib/move/goal.ts`). A device carrying the old array gets `null` and sets
 * a new one if it wants; nothing is migrated between them, deliberately.
 *
 * What survives is the only thing that matters: `summaries` and `totals`. Every
 * metre ever recorded, the cumulative ledger, and therefore the journey are
 * untouched. Nobody loses movement history over this.
 */
export function normalizeMoveState(value: unknown): MoveState {
  if (!value || typeof value !== "object") {
    return emptyMoveState;
  }

  const raw = value as Partial<MoveState>;

  const summaries = Array.isArray(raw.summaries)
    ? raw.summaries.map(normalizeSummary).filter((entry): entry is MovementSummary => entry !== null)
    : [];

  /**
   * Badges from the OLD cumulative system, carried across.
   *
   * Someone who unlocked 10K by walking ten kilometres keeps it — taking a
   * badge back because the rules changed underneath them would be the worst
   * thing this migration could do. They are recorded as open, solo completions,
   * which is what they were.
   */
  const legacy: MoveAchievement[] = [];
  const legacyUnlocks = (raw as { milestonesUnlockedAt?: Record<string, string> }).milestonesUnlockedAt;

  if (legacyUnlocks && typeof legacyUnlocks === "object") {
    for (const [milestoneId, at] of Object.entries(legacyUnlocks)) {
      const carried = normalizeAchievement({
        milestoneId,
        variantId: `${milestoneId}-open`,
        completionType: "solo",
        completedAt: typeof at === "string" ? at : undefined,
        days: 1,
        withUserIds: []
      });

      if (carried) {
        legacy.push(carried);
      }
    }
  }

  const stored = Array.isArray(raw.achievements)
    ? raw.achievements.map(normalizeAchievement).filter((entry): entry is MoveAchievement => entry !== null)
    : [];
  const byMilestone = new Map<string, MoveAchievement>();

  for (const entry of [...legacy, ...stored]) {
    byMilestone.set(entry.milestoneId, entry);
  }

  return {
    onboarded: raw.onboarded === true,
    active: normalizeActiveChallenge(raw.active),
    achievements: [...byMilestone.values()],
    summaries: mergeSummaries([], summaries),
    totals: normalizeTotals(raw.totals),
    lastSyncedDate: typeof raw.lastSyncedDate === "string" ? raw.lastSyncedDate : null,
    celebrated: Array.isArray(raw.celebrated) ? raw.celebrated.filter((id): id is string => typeof id === "string") : [],
    goal: normalizeGoal(raw.goal)
  };
}

/**
 * The range a sync should ask for.
 *
 * Incremental. The first sync reaches back `INITIAL_SYNC_DAYS`; later ones ask
 * only for what has happened since, plus a two-day overlap.
 *
 * The overlap is not belt-and-braces. Health data arrives late: a watch syncs
 * hours after the walk, and a phone left behind backfills the next morning.
 * Re-reading the last couple of days is what picks that up — and it is safe to
 * do repeatedly because `mergeSummaries` REPLACES a day rather than adding.
 */
export function syncRange(state: MoveState, todayKey: string): { start: string; end: string } {
  if (!state.lastSyncedDate) {
    return { start: addDays(todayKey, -(INITIAL_SYNC_DAYS - 1)), end: todayKey };
  }

  const start = addDays(state.lastSyncedDate, -REFRESH_WINDOW_DAYS);

  // A clock that has gone backwards (travel, a manual change) must not produce
  // an inverted range that silently reads as nothing.
  return { start: start <= todayKey ? start : todayKey, end: todayKey };
}

export function trimSummaries(summaries: MovementSummary[], todayKey: string): MovementSummary[] {
  const cutoff = addDays(todayKey, -CACHE_DAYS);

  return summaries.filter((summary) => summary.date >= cutoff);
}
