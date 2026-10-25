import AsyncStorage from "@react-native-async-storage/async-storage";
import { emptyWalkState, normalizeWalkState, type WalkState } from "@/lib/walk";

/**
 * Reading and writing the walk store.
 *
 * Three screens touch it — the walk itself, history, and a walk's details — and
 * a key repeated in three places is a key that eventually gets typed wrong in
 * one of them. It also puts `normalizeWalkState` on the only path in, so no
 * caller can forget it.
 */

/**
 * Its own key, NOT the `@lumo/state/v1` blob.
 *
 * That blob is re-serialized in full on every change. A GPS fix arriving every
 * few seconds would rewrite every habit, completion and journal entry with it,
 * for an hour at a time. This key holds walks and nothing else.
 */
export const WALK_STORAGE_KEY = "@lumo/tools/walk";

/**
 * The stored walks, or an empty store.
 *
 * Never throws. A store that cannot be read is a store that is empty as far as
 * the screen is concerned — the alternative is a walk screen that refuses to
 * open because of one bad character in storage.
 */
export async function loadWalkState(): Promise<WalkState> {
  try {
    const raw = await AsyncStorage.getItem(WALK_STORAGE_KEY);

    return raw ? normalizeWalkState(JSON.parse(raw)) : emptyWalkState;
  } catch {
    return emptyWalkState;
  }
}

/**
 * Listeners told whenever the store is written.
 *
 * Added because the walk store is read by things that are not screens: Move's
 * context reconciles tracked walks against health data for the goal, and a
 * context cannot use `useFocusEffect` to notice a walk that has just finished.
 * The same shape as `onMoveInvitesChanged` — a plain set, no dependency.
 */
const listeners = new Set<() => void>();

/** Subscribes to walk-store writes. Returns the unsubscribe. */
export function onWalksChanged(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Fire-and-forget, like every other local write in the app. */
export async function saveWalkState(state: WalkState): Promise<void> {
  try {
    await AsyncStorage.setItem(WALK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Nothing useful to do here — the in-memory state is still correct, and the
    // next save will carry it.
  }

  /**
   * Rung even when the write threw.
   *
   * A listener's job is to re-read, and the in-memory state is correct either
   * way — staying silent on a failed write would leave the goal reading a walk
   * short until something else happened to refresh it.
   */
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Drops one walk from history.
 *
 * Reads and writes rather than taking the caller's copy: the details screen
 * holds a snapshot from when it opened, and writing that back would undo
 * anything the walk screen filed in between.
 */
export async function deleteWalk(id: string): Promise<WalkState> {
  const state = await loadWalkState();
  const next: WalkState = { ...state, history: state.history.filter((record) => record.id !== id) };

  await saveWalkState(next);

  return next;
}
