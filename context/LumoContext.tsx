import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, useColorScheme } from "react-native";
import { getPalette, LumoPalette, ThemeColorScheme } from "@/constants/theme";
import { toDateKey } from "@/lib/date";
import { completionCount } from "@/lib/habitMath";
import {
  cancelHabitReminders,
  getNotificationStatus,
  requestNotificationPermissions,
  scheduleHabitReminder
} from "@/lib/notifications";
import { AvatarConfig, defaultAvatar, normalizeAvatar } from "@/lib/avatar";
import { friendsService } from "@/lib/friends";
import { fetchServerEntitlement, purchaseFriendsSubscription, restoreFriendsSubscription } from "@/lib/iap";
import { formatLumoId, generateLumoSuffix } from "@/lib/lumoId";
import { updateTodayWidget } from "@/lib/widget";
import { AppSettings, BackupFrequency, CompletionEntry, FeatureRequest, Habit, HabitCategory, habitCategories, HabitDraft, JournalEntry, JournalMood } from "@/types/habit";

// Persisted local state key. Do not change — it would orphan existing
// installs' local data.
const STORAGE_KEY = "@lumo/state/v1";
// DEV ONLY: when true, unlocks Friends + the Feature Board without a
// subscription. MUST stay false in production.
const BYPASS_SUBSCRIPTION = false;
// Free users can keep this many habits / journal entries; the one-time purchase
// lifts both caps.
export const FREE_HABIT_LIMIT = 3;
export const FREE_JOURNAL_LIMIT = 5;
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
  journals: JournalEntry[];
  settings: AppSettings;
  hasOnboarded: boolean;
  nickname: string;
  // Stable Lumo ID suffix (displayed as `nickname#SUFFIX`) and the optional
  // recovery email. Both stay local until the user enables Friends sync.
  lumoIdSuffix: string;
  email: string;
  featureRequests: FeatureRequest[];
  avatar: AvatarConfig;
};

// Seed board so it isn't empty on first open. A real backend would replace this.
const DEFAULT_FEATURE_REQUESTS: FeatureRequest[] = [
  {
    id: "seed-widgets",
    title: "Home screen widgets",
    description: "Quick-complete habits straight from an iOS/Android widget.",
    votes: 42,
    votedByMe: false,
    mine: false,
    status: "planned",
    createdAt: "2026-01-05T00:00:00.000Z"
  },
  {
    id: "seed-apple-health",
    title: "Apple Health sync",
    description: "Pull steps and workouts in to auto-complete fitness habits.",
    votes: 28,
    votedByMe: false,
    mine: false,
    status: "open",
    createdAt: "2026-02-11T00:00:00.000Z"
  },
  {
    id: "seed-cloud-sync",
    title: "Cloud sync across devices",
    description: "Keep habits and journals in sync between phone and tablet.",
    votes: 19,
    votedByMe: false,
    mine: false,
    status: "open",
    createdAt: "2026-03-02T00:00:00.000Z"
  }
];

type LumoContextValue = StoredState & {
  isReady: boolean;
  deletedHabits: Habit[];
  isDark: boolean;
  palette: LumoPalette;
  lastMessage: string;
  // Freemium entitlement + gating.
  isPro: boolean;
  habitLimit: number;
  ownedHabitCount: number;
  canCreateHabit: boolean;
  journalLimit: number;
  journalCount: number;
  canCreateJournal: boolean;
  purchasePro: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  setProUnlocked: (value: boolean) => void;
  // Feature request board. Visible to all; submitting/voting is Pro-only.
  canUseFeatureBoard: boolean;
  submitFeatureRequest: (title: string, description?: string, photoUri?: string) => void;
  toggleFeatureVote: (id: string) => void;
  setHasOnboarded: (value: boolean) => void;
  setNickname: (value: string) => void;
  setEmail: (value: string) => void;
  setAvatar: (config: AvatarConfig) => void;
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
  restoreHabit: (id: string) => Promise<void>;
  permanentlyDeleteHabit: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  saveJournal: (date: string, content: string, photoUri?: string, mood?: JournalMood, title?: string) => void;
  deleteJournal: (date: string) => void;
  exportData: () => string;
  createDataBackup: () => Promise<string>;
  importData: (json: string) => Promise<void>;
};

const defaultSettings: AppSettings = {
  // Fresh installs start on the light "black" look (monochrome onboarding);
  // users can switch mode and color scheme in Settings.
  themeMode: "light",
  colorScheme: "black",
  notificationStatus: "unknown",
  notificationsEnabled: true,
  autoBackupEnabled: false,
  backupFrequency: "weekly",
  isPro: false
};

const defaultState: StoredState = {
  habits: [],
  journals: [],
  settings: defaultSettings,
  hasOnboarded: false,
  nickname: "",
  lumoIdSuffix: generateLumoSuffix(),
  email: "",
  featureRequests: DEFAULT_FEATURE_REQUESTS,
  avatar: defaultAvatar()
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

  // Until onboarding completes the user never chose a theme — any stored
  // values are stale defaults, so keep pre-onboarding installs on the current
  // default look (light black).
  if (!(parsed.hasOnboarded ?? false)) {
    settings.themeMode = defaultSettings.themeMode;
    settings.colorScheme = defaultSettings.colorScheme;
  }

  return {
    hasOnboarded: parsed.hasOnboarded ?? false,
    nickname: parsed.nickname ?? "",
    lumoIdSuffix: parsed.lumoIdSuffix ?? generateLumoSuffix(),
    email: parsed.email ?? "",
    settings,
    habits: (parsed.habits ?? []).map(normalizeHabit),
    journals: (parsed.journals ?? []).filter((entry) => entry && typeof entry.date === "string"),
    featureRequests: parsed.featureRequests ?? DEFAULT_FEATURE_REQUESTS,
    avatar: normalizeAvatar(parsed.avatar)
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

  // Keep the cloud profile in sync for the Friends feature — fire-and-forget;
  // when Supabase is unconfigured or unreachable the app stays local-only.
  // Runs at launch, when profile fields change, and every time the app comes
  // back to the foreground so a failed sync (backend down, auth not yet
  // enabled) heals itself without an app restart.
  useEffect(() => {
    if (!isReady) {
      return;
    }

    const sync = () => {
      friendsService
        .syncProfile({
          lumoId: formatLumoId(stateRef.current.lumoIdSuffix),
          nickname: stateRef.current.nickname,
          avatar: stateRef.current.avatar,
          email: stateRef.current.email
        })
        .then((result) => {
          // Another user already claimed this Lumo ID (unique in the cloud) —
          // regenerate; the changed suffix re-triggers this effect to resync.
          if (result === "conflict") {
            setState((current) => ({ ...current, lumoIdSuffix: generateLumoSuffix() }));
          }
        })
        .catch(() => undefined);
    };

    sync();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        sync();
      }
    });

    return () => subscription.remove();
  }, [isReady, state.lumoIdSuffix, state.nickname, state.avatar, state.email]);

  // Re-check the subscription on launch: the server-verified entitlement
  // (Supabase, written by receipt validation) is authoritative, with the App
  // Store's own answer as fallback while the webhook hasn't caught up yet.
  // Both unknown (offline / native module not built) → leave the flag as-is.
  useEffect(() => {
    if (!isReady) {
      return;
    }

    Promise.all([fetchServerEntitlement(), restoreFriendsSubscription()]).then(([server, store]) => {
      if (server === null && store === null) {
        return;
      }

      const active = server === true || store === true;

      setState((current) =>
        current.settings.isPro === active ? current : { ...current, settings: { ...current.settings, isPro: active } }
      );
    });
  }, [isReady]);

  // Keep the iOS home-screen widget in sync with today's habits/completions.
  useEffect(() => {
    if (isReady) {
      updateTodayWidget(state.habits);
    }
  }, [isReady, state.habits]);

  const value = useMemo<LumoContextValue>(() => {
    // Active + paused habits count toward the free limit; archived and trashed
    // habits don't occupy a slot.
    const ownedHabitCount = state.habits.filter(
      (habit) => habit.status === "active" || habit.status === "paused"
    ).length;
    const isPro = state.settings.isPro || BYPASS_SUBSCRIPTION;

    return {
      ...state,
      // Hide soft-deleted habits from every consumer; the Trash screen reads
      // `deletedHabits` instead.
      habits: state.habits.filter((habit) => habit.status !== "deleted"),
      deletedHabits: state.habits.filter((habit) => habit.status === "deleted"),
      // Newest first for the journal list.
      journals: [...state.journals].sort((a, b) => b.date.localeCompare(a.date)),
      isReady,
      isDark,
      palette,
      lastMessage,
      isPro,
      habitLimit: FREE_HABIT_LIMIT,
      ownedHabitCount,
      // Core features are free for everyone; the subscription (`isPro`) only
      // gates the social features: Friends and the Feature Board.
      canCreateHabit: true,
      journalLimit: FREE_JOURNAL_LIMIT,
      journalCount: state.journals.length,
      canCreateJournal: true,
      canUseFeatureBoard: isPro,
      submitFeatureRequest(title, description, photoUri) {
        const cleanTitle = title.trim();
        // Submitting is Pro-only; the UI routes free users to the paywall.
        if (!cleanTitle || !stateRef.current.settings.isPro) {
          return;
        }
        const cleanDescription = description?.trim();
        const request: FeatureRequest = {
          id: createId(),
          title: cleanTitle,
          description: cleanDescription || undefined,
          photoUri: photoUri || undefined,
          votes: 1,
          votedByMe: true,
          mine: true,
          status: "open",
          createdAt: new Date().toISOString()
        };
        setState((current) => ({ ...current, featureRequests: [request, ...current.featureRequests] }));
      },
      toggleFeatureVote(id) {
        // Voting is Pro-only and yes-only (tapping again withdraws the vote).
        if (!stateRef.current.settings.isPro) {
          return;
        }
        setState((current) => ({
          ...current,
          featureRequests: current.featureRequests.map((request) => {
            if (request.id !== id) {
              return request;
            }
            const votedByMe = !request.votedByMe;
            return { ...request, votedByMe, votes: Math.max(0, request.votes + (votedByMe ? 1 : -1)) };
          })
        }));
      },
      setProUnlocked(unlocked) {
        setState((current) => ({
          ...current,
          settings: { ...current.settings, isPro: unlocked }
        }));
      },
      // Apple IAP: auto-renewable Friends subscription (lib/iap.ts). The
      // entitlement persists locally in settings.isPro and is re-checked
      // against the store on launch.
      async purchasePro() {
        const purchased = await purchaseFriendsSubscription();

        if (purchased) {
          setState((current) => ({
            ...current,
            settings: { ...current.settings, isPro: true }
          }));
        }

        return purchased;
      },
      async restorePurchases() {
        const active = await restoreFriendsSubscription();

        // Store unreachable — keep whatever entitlement we already have.
        if (active === null) {
          return stateRef.current.settings.isPro;
        }

        setState((current) => ({
          ...current,
          settings: { ...current.settings, isPro: active }
        }));

        return active;
      },
      setHasOnboarded(value) {
        setState((current) => ({ ...current, hasOnboarded: value }));
      },
      setNickname(value) {
        setState((current) => ({ ...current, nickname: value }));
      },
      setEmail(value) {
        setState((current) => ({ ...current, email: value.trim() }));
      },
      setAvatar(config) {
        setState((current) => ({ ...current, avatar: config }));
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

        // Mirror to the group backend (no-op for personal habits).
        const habit = stateRef.current.habits.find((item) => item.id === id);
        if (habit) {
          const next = withCompletionOnDate(habit, dateKey);
          friendsService.syncCompletion(id, dateKey, completionCount(next, dateKey)).catch(() => undefined);
        }
      },
      undoHabit(id, dateKey = toDateKey()) {
        setLastMessage("");
        setState((current) => ({
          ...current,
          habits: current.habits.map((habit) => (habit.id === id ? withoutCompletionOnDate(habit, dateKey) : habit))
        }));

        const habit = stateRef.current.habits.find((item) => item.id === id);
        if (habit) {
          const next = withoutCompletionOnDate(habit, dateKey);
          friendsService.syncCompletion(id, dateKey, completionCount(next, dateKey)).catch(() => undefined);
        }
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
        // Soft delete: move to Trash so it can be recovered.
        setState((current) => ({
          ...current,
          habits: current.habits.map((item) => (item.id === id ? { ...item, status: "deleted", notificationIds: [], deletedAt: new Date().toISOString() } : item))
        }));
      },
      async restoreHabit(id) {
        const habit = state.habits.find((item) => item.id === id);

        if (!habit) {
          return;
        }

        const restoredHabit = { ...habit, status: "active" as const, notificationIds: [] };
        const notificationIds = await scheduleHabitReminderIfEnabled(restoredHabit, state.settings.notificationsEnabled);

        setState((current) => ({
          ...current,
          habits: current.habits.map((item) => (item.id === id ? { ...restoredHabit, notificationIds } : item))
        }));
      },
      async permanentlyDeleteHabit(id) {
        const habit = state.habits.find((item) => item.id === id);
        await cancelHabitReminders(habit?.notificationIds);
        setState((current) => ({
          ...current,
          habits: current.habits.filter((item) => item.id !== id)
        }));
      },
      async emptyTrash() {
        await Promise.all(state.habits.filter((item) => item.status === "deleted").map((item) => cancelHabitReminders(item.notificationIds)));
        setState((current) => ({
          ...current,
          habits: current.habits.filter((item) => item.status !== "deleted")
        }));
      },
      saveJournal(date, content, photoUri, mood, title) {
        const trimmed = content.trim();
        const trimmedTitle = title?.trim() || undefined;

        setState((current) => {
          // An entry with no title, text, photo, or mood is removed entirely.
          if (!trimmed && !trimmedTitle && !photoUri && !mood) {
            return { ...current, journals: current.journals.filter((entry) => entry.date !== date) };
          }

          const now = new Date().toISOString();
          const existing = current.journals.find((entry) => entry.date === date);
          const nextEntry: JournalEntry = existing
            ? { ...existing, title: trimmedTitle, content, photoUri, mood, updatedAt: now }
            : { date, title: trimmedTitle, content, photoUri, mood, createdAt: now, updatedAt: now };

          return {
            ...current,
            journals: [...current.journals.filter((entry) => entry.date !== date), nextEntry]
          };
        });
      },
      deleteJournal(date) {
        setState((current) => ({
          ...current,
          journals: current.journals.filter((entry) => entry.date !== date)
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
