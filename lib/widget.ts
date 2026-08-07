import { Platform } from "react-native";
import SharedGroupPreferences from "react-native-shared-group-preferences";
import { reloadAllTimelines } from "react-native-widgetkit";
import { habitColorOption } from "@/constants/theme";
import { isDoneOnDate, isScheduledOnDate } from "@/lib/habitMath";
import { parseDateKey, toDateKey } from "@/lib/date";
import { Habit } from "@/types/habit";

// Must match the App Group in app.json + targets/widget/expo-target.config.js,
// and the keys the Swift widget reads (targets/widget/index.swift).
const APP_GROUP = "group.com.lumo.habits";
const SNAPSHOT_KEY = "todaySnapshot";
// The widget appends optimistic completions here; we apply and clear them.
const PENDING_KEY = "pendingToggles";

// Colours the widget uses so it matches the app's active theme. All hex strings.
export type WidgetTheme = {
  background: string;
  card: string;
  accent: string;
  onAccent: string;
  text: string;
  subtle: string;
};

// A completion the widget's Complete button applied while the app was closed.
export type PendingToggle = { id: string; done: boolean };

// The app's habit icons are custom (Phosphor) glyphs SwiftUI can't render, so we
// map each to the nearest SF Symbol for the widget. Keep in sync with the icon
// names in components/IconPicker.tsx (categoryIconOptions).
const SF_SYMBOL_FOR_ICON: Record<string, string> = {
  sparkle: "sparkles",
  star: "star.fill",
  taskSquare: "checkmark.square.fill",
  note: "note.text",
  calendar: "calendar",
  checkCircle: "checkmark.circle.fill",
  grid: "square.grid.2x2.fill",
  elementPlus: "plus.square.fill",
  health: "heart.text.square.fill",
  heart: "heart.fill",
  drop: "drop.fill",
  milk: "cup.and.saucer.fill",
  glass: "waterbottle.fill",
  moon: "moon.fill",
  sun: "sun.max.fill",
  weight: "dumbbell.fill",
  activity: "figure.walk",
  fire: "flame.fill",
  zap: "bolt.fill",
  trophy: "trophy.fill",
  timer: "timer",
  award: "rosette",
  eye: "eye.fill",
  clock: "clock.fill",
  chart: "chart.bar.fill",
  book: "book.fill",
  edit: "pencil",
  headphone: "headphones",
  emojiHappy: "face.smiling",
  smiley: "face.smiling",
  coffee: "cup.and.saucer.fill",
  facebook: "person.2.fill",
  home: "house.fill",
  broom: "wind",
  tree: "leaf.fill",
  money: "dollarsign.circle.fill",
  brush: "paintbrush.fill",
  archive: "archivebox.fill"
};

function symbolFor(iconName: string): string {
  return SF_SYMBOL_FOR_ICON[iconName] ?? "circle.fill";
}

/**
 * Pushes today's habits (icon, colour, progress) and the active theme to the
 * home-screen widget's App Group container and asks WidgetKit to redraw. No-ops
 * off iOS and never throws (the native modules are absent until the app is
 * rebuilt with the widget target).
 */
export async function updateTodayWidget(habits: Habit[], theme?: WidgetTheme, dateKey = toDateKey()): Promise<void> {
  if (Platform.OS !== "ios") {
    return;
  }

  const accentBg = theme?.accent ?? "#E8EADF";
  const accentFg = theme?.onAccent ?? "#20211E";

  const due = habits.filter((habit) => habit.status === "active" && isScheduledOnDate(habit, dateKey));
  const items = due.map((habit) => {
    // Match the app's habit-row icon badge: the habit's colour, or the theme
    // accent when the habit uses a legacy/untinted colour.
    const colorOption = habitColorOption(habit.color);
    return {
      id: habit.id,
      name: habit.name,
      done: isDoneOnDate(habit, dateKey),
      symbol: symbolFor(habit.emoji),
      color: colorOption ? colorOption.color : accentBg,
      onColor: colorOption ? colorOption.onColor : accentFg
    };
  });

  const snapshot = {
    dateLabel: parseDateKey(dateKey).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    doneCount: items.filter((item) => item.done).length,
    totalCount: items.length,
    habits: items,
    theme: theme ?? null
  };

  try {
    // Stored as a JSON string so the Swift side reads it via string(forKey:).
    await SharedGroupPreferences.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot), APP_GROUP);
    reloadAllTimelines();
  } catch {
    // Widget not built into this binary yet — safe to ignore.
  }
}

/**
 * Reads (and clears) the completions the widget applied optimistically via its
 * Complete button, so the app can reconcile them into real habit state. Returns
 * an empty list off iOS, when nothing is pending, or when the widget module
 * isn't in this binary yet.
 */
export async function readPendingWidgetToggles(): Promise<PendingToggle[]> {
  if (Platform.OS !== "ios") {
    return [];
  }

  try {
    const raw = await SharedGroupPreferences.getItem(PENDING_KEY, APP_GROUP);
    // getItem returns the raw JSON string the widget wrote (or null/undefined).
    const parsed = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
    const toggles: PendingToggle[] = Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.id === "string" && typeof item.done === "boolean")
      : [];

    if (toggles.length > 0) {
      // Clear so we don't re-apply on the next foreground.
      await SharedGroupPreferences.setItem(PENDING_KEY, "[]", APP_GROUP);
    }

    return toggles;
  } catch {
    return [];
  }
}
