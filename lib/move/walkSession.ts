import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The shared move this device is currently on, if any.
 *
 * ## Why it is stored rather than held in state
 *
 * A walk outlives the screen that started it: the tracker keeps recording with
 * the app backgrounded, and the recording can be recovered after a crash (see
 * `lib/move/tracking/storage.ts`). The session id has to survive all of that or a
 * walk resumes as a solo one, publishing nothing, while the friend who joined
 * watches a number that stopped moving.
 *
 * ## Why it is not part of the tracker's own state
 *
 * The tracker is deliberately offline and knows nothing about friends, accounts
 * or Supabase — it records movement. This is one id belonging to the social layer,
 * kept beside it rather than inside it, and the tracker runs identically whether
 * it is set or not.
 *
 * Every read fails to `null`, which reads as "walking alone" — the right answer
 * for a device that has never shared a walk and for one whose storage is
 * unreadable.
 */
const SESSION_KEY = "lumo.move.walkSession.v1";

type StoredSession = {
  /**
   * The shared session, or null for a walk paired only locally.
   *
   * Null when the friend's device could not open one — their app was offline, or a
   * database without the sessions migration. The walk still goes out WITH them:
   * their name rides along on the recording exactly as it does when you pick
   * somebody on the start page. What is missing is only the live exchange of
   * distance, which needs a row on both sides to write to.
   */
  sessionId: string | null;
  /** True when this device opened the session, false when it joined one. */
  owner: boolean;
  /**
   * Who it is with, for the button that starts the walk.
   *
   * Kept HERE rather than looked up when needed: the name comes from the friend
   * list, which the Move tab has and the track screen does not, and "Move with
   * Naj" has to survive a relaunch mid-session like everything else in this file.
   */
  withName?: string;
  /** ISO. Only for sanity: a session id older than the staleness window is dropped. */
  startedAt: string;
};

/** As in `challengeClient`: nothing shared lives longer than a day's walk. */
const STALE_MS = 6 * 60 * 60 * 1000;

export async function saveWalkSession(session: { sessionId: string | null; owner: boolean; withName?: string }): Promise<void> {
  try {
    const stored: StoredSession = { ...session, startedAt: new Date().toISOString() };

    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  } catch {
    // A walk that cannot record its session id still records the walk.
  }
}

export async function loadWalkSession(): Promise<StoredSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredSession;

    // A leftover pairing from a walk that was never closed — the app was killed, or
    // the finish never ran. Publishing to it would revive a walk from yesterday.
    // `sessionId` may legitimately be null; `startedAt` is what decides staleness.
    if (!parsed?.startedAt || Date.now() - Date.parse(parsed.startedAt) > STALE_MS) {
      await clearWalkSession();

      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function clearWalkSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to do: a stale id is dropped on read by the staleness check above.
  }
}
