import AsyncStorage from "@react-native-async-storage/async-storage";
import { toDateKey } from "@/lib/date";
import { countableDays, foldIntoTotals, mergeSummaries } from "@/lib/move/movement";
import { movementProvider } from "@/lib/move/movementProvider";
import { emptyMoveState, normalizeMoveState, syncRange, type MoveState } from "@/lib/move/state";
import type { MoveTotals } from "@/lib/move/types";

/**
 * Move's persistence and its sync — the half that needs a device.
 *
 * Its own AsyncStorage key, NOT the `@lumo/state/v1` blob: that one is
 * re-serialized in full on every change, and folding a day of health data into
 * it would rewrite every habit, completion and journal entry alongside. This
 * key holds Move and nothing else, and no habit record is ever read or written
 * from this file.
 *
 * Everything this module DECIDES — the sync window, how state is narrowed, what
 * gets trimmed — lives in `lib/move/state.ts`, which is pure and tested.
 */
const STORAGE_KEY = "@lumo/move/v1";

export async function loadMoveState(): Promise<MoveState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);

    return raw ? normalizeMoveState(JSON.parse(raw)) : emptyMoveState;
  } catch {
    return emptyMoveState;
  }
}

export async function saveMoveState(state: MoveState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The in-memory state is still correct and the next save carries it.
  }
}

export type SyncOutcome = {
  state: MoveState;
  /** Whether anything was actually read. False leaves the UI on its cached view. */
  synced: boolean;
};

/**
 * Reads what has happened since the last sync and folds it in.
 *
 * Safe to call as often as you like — that is the whole design:
 *
 *  - `mergeSummaries` replaces a day rather than appending, so a day read twice
 *    is stored once.
 *  - `foldIntoTotals` skips any day already counted, so the cumulative ledger
 *    cannot be inflated by a refresh.
 *  - only days STRICTLY BEFORE today are folded, so today can keep growing.
 *
 * Deliberately does NOT decide whether a challenge is finished. Completion is
 * derived from the summaries on every read (`challengeProgress`), so there is
 * no second copy of the answer here that could disagree with the screen.
 *
 * Returns the same state object when nothing was read, so a caller can skip a
 * render and a write.
 */
export async function syncMovement(state: MoveState, now = new Date()): Promise<SyncOutcome> {
  const provider = movementProvider();
  const todayKey = toDateKey(now);

  if (!provider) {
    return { state, synced: false };
  }

  const range = syncRange(state, todayKey);
  const fresh = await provider.getMovementSummary(range.start, range.end);

  if (!fresh) {
    return { state, synced: false };
  }

  const summaries = mergeSummaries(state.summaries, fresh);
  const totals: MoveTotals = foldIntoTotals(state.totals, countableDays(summaries, todayKey));

  return { state: { ...state, summaries, totals, lastSyncedDate: todayKey }, synced: true };
}
