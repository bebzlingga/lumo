import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useColorScheme } from "react-native";
import { getPalette, LumoPalette, ThemeColorScheme } from "@/constants/theme";
import { toDateKey } from "@/lib/date";
import { completionCount } from "@/lib/habitMath";
import {
  cancelHabitReminders,
  getNotificationStatus,
  requestNotificationPermissions,
  scheduleHabitReminder
} from "@/lib/notifications";
import { AppSettings, BackupFrequency, CompletionEntry, Habit, HabitCategory, habitCategories, HabitDraft } from "@/types/habit";

const STORAGE_KEY = "@lumo/state/v1";
const BACKUP_DIRECTORY_NAME = "Lumo/Backup/";
const BACKUP_INTERVAL_MS: Record<BackupFrequency, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000
};
const BACKUP_START_HOUR = 23;
const BACKUP_START_MINUTE = 59;
const BACKUP_CHECK_INTERVAL_MS = 60 * 1000;

const messages = [
  "Nice, one dot brighter.",
  "Small win recorded.",
  "Your streak is glowing.",
  "Done for today.",
  "Keep the light going."
];

type StoredState = {
  habits: Habit[];
  settings: AppSettings;
  hasOnboarded: boolean;
  nickname: string;
};

type LumoContextValue = StoredState & {
  isReady: boolean;
  isDark: boolean;
  palette: LumoPalette;
  lastMessage: string;
  setHasOnboarded: (value: boolean) => void;
  setNickname: (value: string) => void;
  setThemeMode: (mode: AppSettings["themeMode"]) => void;
  setColorScheme: (colorScheme: ThemeColorScheme) => void;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  setAutoBackupEnabled: (enabled: boolean) => Promise<void>;
  setBackupFrequency: (frequency: BackupFrequency) => void;
  refreshNotificationStatus: () => Promise<void>;
  requestNotifications: () => Promise<void>;
  createHabit: (draft: HabitDraft) => Promise<Habit>;
  updateHabit: (id: string, draft: HabitDraft) => Promise<void>;
  completeHabit: (id: string, dateKey?: string) => void;
  undoHabit: (id: string, dateKey?: string) => void;
  pauseHabit: (id: string) => Promise<void>;
  resumeHabit: (id: string) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  recoverHabit: (id: string) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  exportData: () => string;
  createDataBackup: () => Promise<string>;
  importData: (json: string) => Promise<void>;
};

const defaultSettings: AppSettings = {
  themeMode: "system",
  colorScheme: "green",
  notificationStatus: "unknown",
  notificationsEnabled: true,
  autoBackupEnabled: false,
  backupFrequency: "weekly"
};

const defaultState: StoredState = {
  habits: [],
  settings: defaultSettings,
  hasOnboarded: false,
  nickname: ""
};

const LumoContext = createContext<LumoContextValue | null>(null);

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const legacyCategoryMap: Record<string, HabitCategory> = {
  Wellness: "Health",
  Movement: "Fitness"
};

function normalizeCategory(category?: string): HabitCategory {
  if (!category) {
    return "General";
  }

  const mapped = legacyCategoryMap[category] ?? category;
  return (habitCategories as readonly string[]).includes(mapped) ? (mapped as HabitCategory) : "General";
}

function normalizeHabit(habit: Habit): Habit {
  return {
    ...habit,
    category: normalizeCategory(habit.category),
    reminderMode: habit.reminderMode ?? "time",
    reminderTime: habit.reminderTime ?? "09:00",
    reminderIntervalValue: habit.reminderIntervalValue ?? 1,
    reminderIntervalUnit: habit.reminderIntervalUnit ?? "hours",
    notificationIds: habit.notificationIds ?? []
  };
}

function normalizeState(parsed: StoredState): StoredState {
  const settings = { ...defaultSettings, ...parsed.settings };

  if (!["daily", "weekly", "monthly"].includes(settings.backupFrequency)) {
    settings.backupFrequency = defaultSettings.backupFrequency;
  }

  return {
    hasOnboarded: parsed.hasOnboarded ?? false,
    nickname: parsed.nickname ?? "",
    settings,
    habits: (parsed.habits ?? []).map(normalizeHabit)
  };
}

function withCompletionOnDate(habit: Habit, dateKey = toDateKey()) {
  const target = habit.goal.type === "multiple" ? habit.goal.count : 1;
  const existing = habit.completions.find((entry) => entry.date === dateKey);
  const completions = habit.completions.filter((entry) => entry.date !== dateKey);
  const nextCount = habit.goal.type === "multiple" ? Math.min((existing?.count ?? 0) + 1, target) : 1;

  return {
    ...habit,
    completions: [
      ...completions,
      {
        date: dateKey,
        count: nextCount,
        completedAt: new Date().toISOString()
      }
    ].sort((a, b) => a.date.localeCompare(b.date))
  };
}

function withoutCompletionOnDate(habit: Habit, dateKey = toDateKey()) {
  const current = completionCount(habit, dateKey);

  if (current <= 1) {
    return {
      ...habit,
      completions: habit.completions.filter((entry) => entry.date !== dateKey)
    };
  }

  return {
    ...habit,
    completions: habit.completions.map((entry): CompletionEntry => {
      if (entry.date !== dateKey) {
        return entry;
      }

      return {
        ...entry,
        count: current - 1,
        completedAt: new Date().toISOString()
      };
    })
  };
}

function clearHabitNotificationIds(habit: Habit) {
  return habit.notificationIds?.length ? { ...habit, notificationIds: [] } : habit;
}

async function scheduleHabitReminderIfEnabled(habit: Habit, notificationsEnabled: boolean) {
  if (!notificationsEnabled || habit.status !== "active") {
    return [];
  }

  return scheduleHabitReminder(habit);
}

async function rebuildHabitNotifications(habits: Habit[], notificationsEnabled: boolean) {
  await Promise.all(habits.map((habit) => cancelHabitReminders(habit.notificationIds)));

  if (!notificationsEnabled) {
    return habits.map(clearHabitNotificationIds);
  }

  return Promise.all(
    habits.map(async (habit) => {
      const notificationIds = await scheduleHabitReminderIfEnabled(clearHabitNotificationIds(habit), notificationsEnabled);
      return { ...habit, notificationIds };
    })
  );
}

function getBackupDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error("Document storage is not available on this device.");
  }

  return `${FileSystem.documentDirectory}${BACKUP_DIRECTORY_NAME}`;
}

function backupFileName(date: Date) {
  return `lumo-backup-${date.toISOString().replace(/[:.]/g, "-")}.json`;
}

async function writeStateBackup(state: StoredState) {
  const directory = getBackupDirectory();
  const createdAt = new Date().toISOString();
  const uri = `${directory}${backupFileName(new Date(createdAt))}`;

  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(state, null, 2), {
    encoding: FileSystem.EncodingType.UTF8
  });

  return { createdAt, directory, uri };
}

async function ensureBackupDirectory() {
  await FileSystem.makeDirectoryAsync(getBackupDirectory(), { intermediates: true });
}

function isBackupDue(settings: AppSettings, now = new Date()) {
  if (!settings.autoBackupEnabled) {
    return false;
  }

  if (!settings.lastBackupAt) {
    return true;
  }

  const lastBackupTime = new Date(settings.lastBackupAt).getTime();

  if (Number.isNaN(lastBackupTime)) {
    return true;
  }

  return now.getTime() - lastBackupTime >= BACKUP_INTERVAL_MS[settings.backupFrequency];
}

function isBackupStartTime(now = new Date()) {
  return now.getHours() === BACKUP_START_HOUR && now.getMinutes() >= BACKUP_START_MINUTE;
}

function shouldRunScheduledBackup(settings: AppSettings, now = new Date()) {
  return isBackupStartTime(now) && isBackupDue(settings, now);
}

function parseImportedState(json: string) {
  const parsed = JSON.parse(json) as Partial<StoredState>;

  if (!Array.isArray(parsed.habits)) {
    throw new Error("This does not look like a Lumo backup file.");
  }

  return normalizeState(parsed as StoredState);
}

export function LumoProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [state, setState] = useState<StoredState>(defaultState);
  const [isReady, setIsReady] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const [backupTick, setBackupTick] = useState(0);
  const backupInFlightRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const isDark = state.settings.themeMode === "dark" || (state.settings.themeMode === "system" && systemScheme === "dark");
  const colorScheme = state.settings.colorScheme ?? "green";
  const palette = useMemo(() => getPalette(isDark, colorScheme), [colorScheme, isDark]);

  useEffect(() => {
    async function hydrate() {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);

      if (raw) {
        setState(normalizeState(JSON.parse(raw) as StoredState));
      }

      setIsReady(true);
    }

    hydrate().catch(() => setIsReady(true));
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [isReady, state]);

  useEffect(() => {
    if (!isReady || !state.settings.autoBackupEnabled) {
      return;
    }

    const intervalId = setInterval(() => {
      setBackupTick((current) => current + 1);
    }, BACKUP_CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isReady, state.settings.autoBackupEnabled]);

  useEffect(() => {
    // Driven by the minute `backupTick`, not by `state`, so routine habit edits
    // don't re-run the backup check. The latest state is read through stateRef.
    const snapshot = stateRef.current;

    if (!isReady || !shouldRunScheduledBackup(snapshot.settings) || backupInFlightRef.current) {
      return;
    }

    backupInFlightRef.current = true;

    writeStateBackup(snapshot)
      .then(({ createdAt }) => {
        setState((current) => ({
          ...current,
          settings: { ...current.settings, lastBackupAt: createdAt }
        }));
      })
      .catch(() => undefined)
      .finally(() => {
        backupInFlightRef.current = false;
      });
  }, [backupTick, isReady]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    getNotificationStatus()
      .then((status) => {
        setState((current) => ({
          ...current,
          settings: {
            ...current.settings,
            notificationStatus: status,
            notificationsEnabled: status === "granted" ? current.settings.notificationsEnabled : false
          }
        }));
      })
      .catch(() => undefined);
  }, [isReady]);

  const value = useMemo<LumoContextValue>(() => {
    return {
      ...state,
      isReady,
      isDark,
      palette,
      lastMessage,
      setHasOnboarded(value) {
        setState((current) => ({ ...current, hasOnboarded: value }));
      },
      setNickname(value) {
        setState((current) => ({ ...current, nickname: value }));
      },
      setThemeMode(mode) {
        setState((current) => ({
          ...current,
          settings: { ...current.settings, themeMode: mode }
        }));
      },
      setColorScheme(colorScheme) {
        setState((current) => ({
          ...current,
          settings: { ...current.settings, colorScheme }
        }));
      },
      async setNotificationsEnabled(enabled) {
        if (!enabled) {
          const habits = await rebuildHabitNotifications(state.habits, false);

          setState((current) => ({
            ...current,
            habits,
            settings: { ...current.settings, notificationsEnabled: false }
          }));
          return;
        }

        const status = await requestNotificationPermissions();

        if (status !== "granted") {
          setState((current) => ({
            ...current,
            settings: { ...current.settings, notificationStatus: status, notificationsEnabled: false }
          }));
          return;
        }

        const habits = await rebuildHabitNotifications(state.habits, true);

        setState((current) => ({
          ...current,
          habits,
          settings: { ...current.settings, notificationStatus: status, notificationsEnabled: true }
        }));
      },
      async refreshNotificationStatus() {
        const status = await getNotificationStatus();
        setState((current) => ({
          ...current,
          settings: {
            ...current.settings,
            notificationStatus: status,
            notificationsEnabled: status === "granted" ? current.settings.notificationsEnabled : false
          }
        }));
      },
      async requestNotifications() {
        const status = await requestNotificationPermissions();

        if (status !== "granted") {
          setState((current) => ({
            ...current,
            settings: { ...current.settings, notificationStatus: status, notificationsEnabled: false }
          }));
          return;
        }

        const habits = await rebuildHabitNotifications(state.habits, true);

        setState((current) => ({
          ...current,
          habits,
          settings: { ...current.settings, notificationStatus: status, notificationsEnabled: true }
        }));
      },
      async setAutoBackupEnabled(enabled) {
        if (!enabled) {
          setState((current) => ({
            ...current,
            settings: { ...current.settings, autoBackupEnabled: false }
          }));
          return;
        }

        await ensureBackupDirectory();

        setState((current) => ({
          ...current,
          settings: { ...current.settings, autoBackupEnabled: true }
        }));
      },
      setBackupFrequency(frequency) {
        setState((current) => ({
          ...current,
          settings: { ...current.settings, backupFrequency: frequency }
        }));
      },
      async createHabit(draft) {
        const habit: Habit = {
          ...draft,
          id: createId(),
          createdAt: draft.createdAt,
          completions: [],
          status: "active",
          notificationIds: []
        };
        const notificationIds = await scheduleHabitReminderIfEnabled(habit, state.settings.notificationsEnabled);
        const nextHabit = { ...habit, notificationIds };

        setState((current) => ({
          ...current,
          hasOnboarded: true,
          habits: [...current.habits, nextHabit]
        }));

        return nextHabit;
      },
      async updateHabit(id, draft) {
        const existing = state.habits.find((habit) => habit.id === id);

        if (existing) {
          await cancelHabitReminders(existing.notificationIds);
        }

        const nextBase = existing
          ? { ...existing, ...draft }
          : {
              ...draft,
              id,
              createdAt: draft.createdAt,
              completions: [],
              status: "active" as const
            };
        const notificationIds = await scheduleHabitReminderIfEnabled(nextBase, state.settings.notificationsEnabled);

        setState((current) => ({
          ...current,
          habits: current.habits.map((habit) => (habit.id === id ? { ...nextBase, notificationIds } : habit))
        }));
      },
      completeHabit(id, dateKey = toDateKey()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        setLastMessage(messages[Math.floor(Math.random() * messages.length)]);
        setState((current) => ({
          ...current,
          habits: current.habits.map((habit) => (habit.id === id ? withCompletionOnDate(habit, dateKey) : habit))
        }));
      },
      undoHabit(id, dateKey = toDateKey()) {
        setLastMessage("");
        setState((current) => ({
          ...current,
          habits: current.habits.map((habit) => (habit.id === id ? withoutCompletionOnDate(habit, dateKey) : habit))
        }));
      },
      async pauseHabit(id) {
        const habit = state.habits.find((item) => item.id === id);
        await cancelHabitReminders(habit?.notificationIds);

        setState((current) => ({
          ...current,
          habits: current.habits.map((habit) => (habit.id === id ? { ...habit, status: "paused", notificationIds: [] } : habit))
        }));
      },
      async resumeHabit(id) {
        const habit = state.habits.find((item) => item.id === id);
        const notificationIds = habit ? await scheduleHabitReminderIfEnabled({ ...habit, status: "active" }, state.settings.notificationsEnabled) : [];

        setState((current) => ({
          ...current,
          habits: current.habits.map((habit) => (habit.id === id ? { ...habit, status: "active", notificationIds } : habit))
        }));
      },
      async archiveHabit(id) {
        const habit = state.habits.find((item) => item.id === id);
        await cancelHabitReminders(habit?.notificationIds);
        setState((current) => ({
          ...current,
          habits: current.habits.map((habit) => (habit.id === id ? { ...habit, status: "archived", notificationIds: [] } : habit))
        }));
      },
      async recoverHabit(id) {
        const habit = state.habits.find((item) => item.id === id);

        if (!habit) {
          return;
        }

        const recoveredHabit = { ...habit, status: "active" as const, notificationIds: [] };
        const notificationIds = await scheduleHabitReminderIfEnabled(recoveredHabit, state.settings.notificationsEnabled);

        setState((current) => ({
          ...current,
          habits: current.habits.map((habit) => (habit.id === id ? { ...recoveredHabit, notificationIds } : habit))
        }));
      },
      async deleteHabit(id) {
        const habit = state.habits.find((item) => item.id === id);
        await cancelHabitReminders(habit?.notificationIds);
        setState((current) => ({
          ...current,
          habits: current.habits.filter((item) => item.id !== id)
        }));
      },
      exportData() {
        return JSON.stringify(state, null, 2);
      },
      async createDataBackup() {
        const backup = await writeStateBackup(state);
        return backup.uri;
      },
      async importData(json) {
        const imported = parseImportedState(json);
        const notificationStatus = await getNotificationStatus().catch(() => state.settings.notificationStatus);
        const settings: AppSettings = {
          ...imported.settings,
          notificationStatus,
          notificationsEnabled: notificationStatus === "granted" ? imported.settings.notificationsEnabled : false
        };

        await Promise.all(state.habits.map((habit) => cancelHabitReminders(habit.notificationIds)));

        const habits = await rebuildHabitNotifications(imported.habits.map(clearHabitNotificationIds), settings.notificationsEnabled);

        setLastMessage("");
        setState({
          ...imported,
          habits,
          settings
        });
      }
    };
  }, [isDark, isReady, lastMessage, palette, state]);

  return <LumoContext.Provider value={value}>{children}</LumoContext.Provider>;
}

export function useLumo() {
  const context = useContext(LumoContext);

  if (!context) {
    throw new Error("useLumo must be used within LumoProvider");
  }

  return context;
}
