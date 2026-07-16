import { Platform } from "react-native";
import SharedGroupPreferences from "react-native-shared-group-preferences";
import { reloadAllTimelines } from "react-native-widgetkit";
import { isDoneOnDate, isScheduledOnDate } from "@/lib/habitMath";
import { parseDateKey, toDateKey } from "@/lib/date";
import { Habit } from "@/types/habit";

// Must match the App Group in app.json + targets/widget/expo-target.config.js,
// and the key the Swift widget reads (targets/widget/index.swift).
const APP_GROUP = "group.com.lumo.habits";
const SNAPSHOT_KEY = "todaySnapshot";

/**
 * Pushes today's habits to the home-screen widget's App Group container and
 * asks WidgetKit to redraw. No-ops off iOS and never throws (the native
 * modules are absent until the app is rebuilt with the widget target).
 */
export async function updateTodayWidget(habits: Habit[], dateKey = toDateKey()): Promise<void> {
  if (Platform.OS !== "ios") {
    return;
  }

  const due = habits.filter((habit) => habit.status === "active" && isScheduledOnDate(habit, dateKey));
  const items = due.map((habit) => ({ id: habit.id, name: habit.name, done: isDoneOnDate(habit, dateKey) }));
  const snapshot = {
    dateLabel: parseDateKey(dateKey).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    doneCount: items.filter((item) => item.done).length,
    totalCount: items.length,
    habits: items
  };

  try {
    // Stored as a JSON string so the Swift side reads it via string(forKey:).
    await SharedGroupPreferences.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot), APP_GROUP);
    reloadAllTimelines();
  } catch {
    // Widget not built into this binary yet — safe to ignore.
  }
}
