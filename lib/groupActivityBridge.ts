import type { GroupHabit } from "@/lib/friends";

/**
 * Hand-off between the group form and the activity screen it pushes.
 *
 * An activity is edited on its own screen but belongs to a group that has not
 * been saved yet — it lives only in the form's React state, so there is nothing
 * to read it back from and nowhere to write it to.
 *
 * The form registers a handler and pushes; the screen reads the draft, and on
 * save calls the handler before popping. Safe because a pushed route leaves the
 * screen underneath MOUNTED, so the handler's closure is still live when the
 * activity screen calls it.
 *
 * Route params were the alternative and are worse here: an activity is a nested
 * object, so it would have to be JSON round-tripped through the URL in both
 * directions, and expo-router has no way to return a value to the screen that
 * pushed you.
 */
type SaveHandler = (activity: GroupHabit) => void;

type Session = {
  /** The activity being edited, or null when adding a new one. */
  draft: GroupHabit | null;
  /** Names already taken in the group, for the duplicate check. */
  taken: string[];
  onSave: SaveHandler;
};

let session: Session | null = null;

/** Called by the form immediately before pushing the activity screen. */
export function beginActivityEdit(draft: GroupHabit | null, taken: string[], onSave: SaveHandler) {
  session = { draft, taken, onSave };
}

/** Read once by the activity screen on mount. Null means it was opened without
 *  a session — a deep link, or a reload in development. */
export function readActivitySession() {
  return session;
}

/** Hands the finished activity back to the form. */
export function commitActivity(activity: GroupHabit) {
  session?.onSave(activity);
}

/** Cleared when the activity screen unmounts, so a stale handler from a form
 *  that has since been left can never be called. */
export function endActivityEdit() {
  session = null;
}
