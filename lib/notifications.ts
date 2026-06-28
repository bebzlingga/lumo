import * as Notifications from "expo-notifications";
import { Habit, RepeatSchedule, Weekday } from "@/types/habit";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

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

  const { hour, minute } = parseReminderTime(habit.reminderTime);
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
      trigger: { seconds, repeats: true } as Notifications.NotificationTriggerInput
    });

    return [id];
  }

  if (!days) {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { hour, minute, repeats: true } as Notifications.NotificationTriggerInput
    });

    return [id];
  }

  const ids: string[] = [];

  for (const day of days) {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { weekday: expoWeekday(day), hour, minute, repeats: true } as Notifications.NotificationTriggerInput
    });
    ids.push(id);
  }

  return ids;
}

export async function cancelHabitReminders(notificationIds?: string[]) {
  if (!notificationIds?.length) {
    return;
  }

  await Promise.all(notificationIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}
