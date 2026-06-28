import type { ThemeColorScheme } from "@/constants/theme";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RepeatSchedule =
  | { type: "daily" }
  | { type: "weekdays" }
  | { type: "weekends" }
  | { type: "specific"; days: Weekday[] }
  | { type: "interval"; every: number };

export type GoalType =
  | { type: "once" }
  | { type: "multiple"; count: number }
  | { type: "weekly"; target: number }
  | { type: "monthly"; target: number };

export type ReminderMode = "time" | "interval";

export type ReminderIntervalUnit = "minutes" | "hours";

export type HabitStatus = "active" | "paused" | "archived";

export const habitCategories = [
  "General",
  "Health",
  "Fitness",
  "Mind",
  "Focus",
  "Learning",
  "Social",
  "Home",
  "Money",
  "Creative"
] as const;

export type HabitCategory = (typeof habitCategories)[number];

export type CompletionEntry = {
  date: string;
  count: number;
  completedAt: string;
};

export type Habit = {
  id: string;
  name: string;
  category: HabitCategory;
  emoji: string;
  color: string;
  reminderEnabled: boolean;
  reminderMode: ReminderMode;
  reminderTime: string;
  reminderIntervalValue: number;
  reminderIntervalUnit: ReminderIntervalUnit;
  repeatSchedule: RepeatSchedule;
  goal: GoalType;
  createdAt: string;
  completions: CompletionEntry[];
  status: HabitStatus;
  notificationIds?: string[];
};

export type HabitDraft = {
  name: string;
  category: HabitCategory;
  emoji: string;
  color: string;
  createdAt: string;
  reminderEnabled: boolean;
  reminderMode: ReminderMode;
  reminderTime: string;
  reminderIntervalValue: number;
  reminderIntervalUnit: ReminderIntervalUnit;
  repeatSchedule: RepeatSchedule;
  goal: GoalType;
};

export type ThemeMode = "system" | "light" | "dark";

export type BackupFrequency = "daily" | "weekly" | "monthly";

export type AppSettings = {
  themeMode: ThemeMode;
  colorScheme: ThemeColorScheme;
  notificationStatus: "unknown" | "granted" | "denied" | "undetermined";
  notificationsEnabled: boolean;
  autoBackupEnabled: boolean;
  backupFrequency: BackupFrequency;
  lastBackupAt?: string;
};
