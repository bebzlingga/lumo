import { Platform } from "react-native";

/**
 * The note on the lock screen while a walk is being recorded.
 *
 * ## Why it exists
 *
 * A walk records with the screen off and the phone in a pocket, which is the
 * point — but it also means the app has nothing to say for itself for half an
 * hour. There is no way to tell a walk that is quietly recording from one that
 * died when the screen locked, and the honest answer to that is not a promise in
 * the UI; it is something visible on the lock screen the whole time.
 *
 * It doubles as the way back in: tapping it opens Lumo on the walk.
 *
 * ## iOS only, deliberately
 *
 * Android already has one. `expo-location`'s foreground service posts an ongoing
 * notification for the life of the recording — it is REQUIRED to, which is what
 * makes background location legal there without "Allow all the time" — and a
 * second Lumo notification beside it would be the same fact told twice.
 *
 * iOS has no equivalent. It shows the blue location pill in the status bar,
 * which says something is using location and not what, and nothing at all on the
 * lock screen. So this fills the gap on the platform that has one.
 *
 * ## Why not a Live Activity
 *
 * Because it needs a widget extension, a whole second UI, and a native rebuild,
 * and it would say the same two numbers. A notification that updates in place
 * gets the distance and the clock onto the lock screen today. If a Live Activity
 * is built later this is the thing it replaces.
 *
 * ## Permission
 *
 * Asked for ONCE, at the first walk, and never insisted on: no permission means
 * no note and a walk that records exactly as well. The prompt lands at the only
 * moment it can be explained by what is on screen — a walk that has just started
 * — rather than at launch, which is where notification prompts go to be refused.
 */

type NotificationsModule = typeof import("expo-notifications");

let notificationsModule: NotificationsModule | null | undefined;

function loadNotifications(): NotificationsModule | null {
  if (notificationsModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      notificationsModule = require("expo-notifications") as NotificationsModule;
    } catch {
      notificationsModule = null;
    }
  }

  return notificationsModule;
}

/**
 * One identifier for the life of the app.
 *
 * Re-scheduling under the same one REPLACES the notification rather than adding
 * another, which is what makes this a single line that updates rather than a
 * walk's worth of banners.
 */
const IDENTIFIER = "lumo-move-recording";

/** How often the note may be rewritten. See `update`. */
const MIN_UPDATE_MS = 20_000;

export type RecordingNote = {
  title: string;
  /** The line under it — distance and the clock, normally. */
  body: string;
};

let permitted: boolean | null = null;
let lastShownAt = 0;
let lastBody: string | null = null;
let visible = false;

/**
 * Whether a note can be posted, asking at most once.
 *
 * `null` means not yet determined; after the first call it is a settled yes or
 * no for the life of the process, so a walk never asks twice.
 */
async function canPost(notifications: NotificationsModule): Promise<boolean> {
  if (permitted !== null) {
    return permitted;
  }

  try {
    const current = await notifications.getPermissionsAsync();

    permitted = current.granted || (await notifications.requestPermissionsAsync()).granted;
  } catch {
    permitted = false;
  }

  return permitted;
}

/**
 * Settles the permission question while the app is still on screen.
 *
 * Called when a walk starts, and the timing is the whole reason it exists as its
 * own function. The note is only ever POSTED once the app has been left, and a
 * permission request made from the background does not appear until the app is
 * opened again — so asking lazily meant the prompt ambushed somebody on their
 * way back from a locked screen, about a notification they had already missed.
 * Asking here puts it at the top of the walk, where the walk is what explains
 * it, and it is asked at most once for the life of the install.
 */
export async function primeRecordingNote(): Promise<void> {
  if (Platform.OS !== "ios") {
    return;
  }

  const notifications = loadNotifications();

  if (notifications) {
    await canPost(notifications);
  }
}

/**
 * Puts the note up, or rewrites the one already there.
 *
 * Throttled twice over: not more than once every `MIN_UPDATE_MS`, and not at all
 * unless the words actually changed. Re-posting is what makes the figures live,
 * but each one moves the notification back to the top of the list, and a walk
 * that did that every second would be unusable.
 */
export async function showRecordingNote(note: RecordingNote): Promise<void> {
  if (Platform.OS !== "ios") {
    return;
  }

  const notifications = loadNotifications();

  if (!notifications || !(await canPost(notifications))) {
    return;
  }

  const line = `${note.title}\n${note.body}`;
  const now = Date.now();

  if (visible && (line === lastBody || now - lastShownAt < MIN_UPDATE_MS)) {
    return;
  }

  lastBody = line;
  lastShownAt = now;
  visible = true;

  try {
    await notifications.scheduleNotificationAsync({
      identifier: IDENTIFIER,
      content: {
        title: note.title,
        body: note.body,
        // Silent and unobtrusive: this is a status line, not an alert, and it is
        // rewritten every twenty seconds. `passive` keeps it off the screen of a
        // locked phone and out of the way of everything else.
        sound: false,
        interruptionLevel: "passive",
        data: { kind: "move-recording" }
      },
      trigger: null
    });
  } catch {
    // A note is a nicety. A walk that cannot post one still records.
  }
}

/** Takes the note down. Safe to call when there is none. */
export async function clearRecordingNote(): Promise<void> {
  if (Platform.OS !== "ios") {
    return;
  }

  const notifications = loadNotifications();

  if (!notifications) {
    return;
  }

  visible = false;
  lastBody = null;
  lastShownAt = 0;

  try {
    await notifications.dismissNotificationAsync(IDENTIFIER);
    // Dismissing clears what is on screen; cancelling clears the request behind
    // it. Both, because either one left alone can put the note back.
    await notifications.cancelScheduledNotificationAsync(IDENTIFIER);
  } catch {
    // Nothing further to try, and nothing depends on it.
  }
}
