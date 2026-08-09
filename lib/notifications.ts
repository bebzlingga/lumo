import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import {
  CHECK_INS,
  checkInTimeFor,
  parseCheckInTime,
  type CheckInKey,
  type CheckInSchedule,
  type CheckInTimes
} from "@/constants/checkIns";
import { Habit, RepeatSchedule, Weekday } from "@/types/habit";

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // When the app is foregrounded, Supabase Realtime already presents a local
    // banner for social events (lib/realtime.ts). Suppress the matching remote
    // push so the user doesn't see it twice; background pushes are shown by the
    // system directly (this handler isn't consulted then).
    const isRemotePush = (notification.request.trigger as { type?: string } | null)?.type === "push";
    const show = !(isRemotePush && AppState.currentState === "active");

    return {
      shouldPlaySound: show,
      shouldSetBadge: false,
      shouldShowBanner: show,
      shouldShowList: show
    };
  }
});

/**
 * Registers this device for Expo push and returns the token (to store
 * server-side). Returns null when permission is denied or the token can't be
 * fetched (simulator, missing EAS project id). Never throws.
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    const status = await requestNotificationPermissions();
    if (status !== "granted") {
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Lumo",
        importance: Notifications.AndroidImportance.DEFAULT
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

    return token.data;
  } catch {
    return null;
  }
}

/** Immediately shows a local banner (used for live in-app realtime events). */
export async function presentLocalNotification(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: null });
  } catch {
    // Notifications unavailable / not permitted — ignore.
  }
}

function parseReminderTime(time: string) {
  const [hour = "9", minute = "0"] = time.split(":");

  return {
    hour: Math.min(23, Math.max(0, Number(hour))),
    minute: Math.min(59, Math.max(0, Number(minute)))
  };
}

function weekdaysForSchedule(schedule: RepeatSchedule): Weekday[] | null {
  switch (schedule.type) {
    case "weekdays":
      return [1, 2, 3, 4, 5];
    case "weekends":
      return [0, 6];
    case "specific":
      return schedule.days;
    case "daily":
    case "interval":
      // `daily` reminds every day, as intended. `interval` ("every N days")
      // cannot be expressed by Expo's repeating calendar trigger, and one-off
      // dated notifications would not self-renew, so it also falls back to a
      // daily time reminder — the user is nudged each day and completes on due days.
      return null;
  }
}

function expoWeekday(day: Weekday) {
  return day === 0 ? 1 : day + 1;
}

export async function getNotificationStatus() {
  const permissions = await Notifications.getPermissionsAsync();
  return permissions.status;
}

export async function requestNotificationPermissions() {
  const existing = await Notifications.getPermissionsAsync();

  if (existing.granted) {
    return "granted" as const;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status;
}

export async function scheduleHabitReminder(habit: Habit) {
  if (!habit.reminderEnabled) {
    return [];
  }

  const status = await requestNotificationPermissions();

  if (status !== "granted") {
    return [];
  }

  const days = weekdaysForSchedule(habit.repeatSchedule);
  const content = {
    title: "Time for your habit",
    body: `Small habits, brighter days. Don't forget to complete: ${habit.name}`
  };

  if (habit.reminderMode === "interval") {
    const value = Math.max(1, habit.reminderIntervalValue || 1);
    const seconds = habit.reminderIntervalUnit === "hours" ? value * 60 * 60 : value * 60;
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: true }
    });

    return [id];
  }

  // "Multiple times per day" goals can carry several reminder times; everything
  // else fires once at the single `reminderTime`.
  const rawTimes =
    habit.goal.type === "multiple" && habit.reminderTimes?.length ? habit.reminderTimes : [habit.reminderTime];
  // De-duplicate so identical times don't schedule twice.
  const times = Array.from(new Set(rawTimes)).map(parseReminderTime);

  const ids: string[] = [];

  for (const { hour, minute } of times) {
    if (!days) {
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute }
      });
      ids.push(id);
      continue;
    }

    for (const day of days) {
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: expoWeekday(day), hour, minute }
      });
      ids.push(id);
    }
  }

  return ids;
}

/**
 * Deterministic id per check-in, so the reminders can be cancelled without
 * persisting anything. Expo lets us name a scheduled notification; naming them
 * means "turn the evening one off" is one call, with no id bookkeeping in
 * settings that could drift out of sync with what is actually scheduled.
 */
function checkInNotificationId(key: CheckInKey) {
  return `lumo-checkin-${key}`;
}

/**
 * Brings the OS schedule in line with `enabled`, which is the whole
 * implementation of Lumo's daily nudges.
 *
 * Cancel-then-reschedule rather than diffing: there are four of them, the calls
 * are cheap, and it is the only approach that self-heals. A notification left
 * over from a build with different times, or from a restore, is cleared by the
 * next sync rather than firing forever at an hour nothing in settings admits to.
 *
 * Never throws — a declined permission or an unavailable notification service
 * must not take a settings toggle or the end of onboarding down with it.
 */
export async function syncCheckInReminders(enabled: CheckInSchedule, times?: CheckInTimes) {
  try {
    await Promise.all(
      CHECK_INS.map((checkIn) =>
        Notifications.cancelScheduledNotificationAsync(checkInNotificationId(checkIn.key)).catch(() => undefined)
      )
    );

    const wanted = CHECK_INS.filter((checkIn) => enabled[checkIn.key]);

    if (!wanted.length) {
      return;
    }

    const status = await requestNotificationPermissions();

    if (status !== "granted") {
      return;
    }

    for (const checkIn of wanted) {
      // The user's own time when they've moved it, the built-in default when
      // they haven't. Every sync cancels first (above), so a retimed check-in
      // never leaves its old trigger behind.
      const { hour, minute } = parseCheckInTime(checkInTimeFor(checkIn, times));

      await Notifications.scheduleNotificationAsync({
        identifier: checkInNotificationId(checkIn.key),
        content: { title: checkIn.title, body: checkIn.body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute
        }
      });
    }
  } catch {
    // Notifications unavailable — the stored preference stands, and the next
    // sync (app launch, or the next toggle) will try again.
  }
}

export async function cancelHabitReminders(notificationIds?: string[]) {
  if (!notificationIds?.length) {
    return;
  }

  await Promise.all(notificationIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}
