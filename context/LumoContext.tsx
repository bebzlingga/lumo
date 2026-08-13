import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, useColorScheme } from "react-native";
import { APPEARANCE_ENABLED, DEFAULT_THEME_ID, getPalette, LumoPalette, normalizeThemeId, type ThemeId } from "@/constants/theme";
import { toDateKey } from "@/lib/date";
import { bestActivityStreak, completionCount } from "@/lib/habitMath";
import {
  cancelHabitReminders,
  getNotificationStatus,
  requestNotificationPermissions,
  scheduleHabitReminder,
  syncCheckInReminders
} from "@/lib/notifications";
import {
  defaultCheckIns,
  defaultCheckInTimes,
  normalizeCheckIns,
  normalizeCheckInTimes,
  type CheckInKey,
  type CheckInSchedule
} from "@/constants/checkIns";
import { AvatarConfig, defaultAvatar, normalizeAvatar } from "@/lib/avatar";
import { friendsService } from "@/lib/friends";
import { createId } from "@/lib/id";
import { journalHasContent } from "@/lib/journal";
import {
  fetchServerEntitlement,
  purchaseFriendsSubscription,
  purchaseUnlimited as purchaseUnlimitedUnlock,
  restoreFriendsSubscription,
  restoreUnlimited
} from "@/lib/iap";
import { formatLumoId, generateLumoSuffix } from "@/lib/lumoId";
import { getExpoPushToken } from "@/lib/notifications";
import { subscribeToUserNotifications } from "@/lib/realtime";
import { ensureSignedIn } from "@/lib/supabase";
import { readPendingWidgetToggles, updateTodayWidget } from "@/lib/widget";
import { AppSettings, BackupFrequency, CompletionEntry, FeatureRequest, Habit, HabitCategory, habitCategories, HabitDraft, HabitMeasurement, JournalEntry, JournalMood, MAX_JOURNALS_PER_DAY, TextSize } from "@/types/habit";

// Persisted local state key. Do not change — it would orphan existing
// installs' local data.
const STORAGE_KEY = "@lumo/state/v1";
// Where an unreadable blob is copied before anything else touches storage, so a
// truncated or partially-written state can still be recovered by hand. Nothing
// reads this back automatically — it exists so a bad read is not a lost account.
const QUARANTINE_KEY = "@lumo/state/v1/unreadable";
// What a free account can keep. Both caps are lifted by the one-off unlimited
// unlock (₱149) — NOT by the Friends subscription, which buys a different
// thing entirely.
export const FREE_HABIT_LIMIT = 3;
export const FREE_JOURNAL_LIMIT = 3;
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
  /**
   * Freemium entitlements + gating. Two independent purchases, and the field
   * names predate what they are CALLED to the reader:
   *
   *  - `isPro` / `isPlus` — the ₱49 monthly subscription, sold as **Plus**. Buys
   *    the shared side of the app: friends, groups, the social half of Move.
   *  - `isUnlimited` — the ₱149 one-off, sold as **Pro**. Lifts the habit and
   *    journal caps for good.
   *
   * `isPlus` is the same value as `isPro`, exposed under the name the product
   * actually has. The old name stays because it is a PERSISTED settings key (and
   * a live database column, `move_challenges.is_pro`) — renaming either would be
   * a migration on every device for a word. New code reads `isPlus`; screens say
   * "Plus" and "Pro" per the products above. See `components/PlusBadge.tsx`.
   */
  isPro: boolean;
  isPlus: boolean;
  isUnlimited: boolean;
  habitLimit: number;
  ownedHabitCount: number;
  canCreateHabit: boolean;
  journalLimit: number;
  journalCount: number;
  canCreateJournal: boolean;
  purchasePro: () => Promise<boolean>;
  purchaseUnlimited: () => Promise<boolean>;
  /** Restores both products. True when anything was restored. */
  restorePurchases: () => Promise<boolean>;
  setProUnlocked: (value: boolean) => void;
  // Feature request board. Visible to all; submitting/voting is Pro-only.
  /**
   * Held back from this release — every route into the board is commented out
   * (Settings, and home's Explore list). Kept wired rather than deleted so the
   * feature can be turned back on by restoring those two entries.
   */
  canUseFeatureBoard: boolean;
  submitFeatureRequest: (title: string, description?: string, photoUri?: string) => void;
  toggleFeatureVote: (id: string) => void;
  setHasOnboarded: (value: boolean) => void;
  setNickname: (value: string) => void;
  setEmail: (value: string) => void;
  setAvatar: (config: AvatarConfig) => void;
  setThemeMode: (mode: AppSettings["themeMode"]) => void;
  /** Which colour family the app wears. Independent of light/dark. */
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  /** Turn one of Lumo's daily nudges on or off, rescheduling it immediately. */
  setCheckInEnabled: (key: CheckInKey, enabled: boolean) => Promise<void>;
  /** Set the whole set at once — what onboarding saves on finish. */
  setCheckIns: (schedule: CheckInSchedule) => Promise<void>;
  /** Move one nudge to a different hour, as "HH:MM". Reschedules immediately. */
  setCheckInTime: (key: CheckInKey, time: string) => Promise<void>;
  setAutoBackupEnabled: (enabled: boolean) => Promise<void>;
  setBackupFrequency: (frequency: BackupFrequency) => void;
  setTextSize: (size: TextSize) => void;
  refreshNotificationStatus: () => Promise<void>;
  requestNotifications: () => Promise<void>;
  createHabit: (draft: HabitDraft) => Promise<Habit>;
  updateHabit: (id: string, draft: HabitDraft) => Promise<void>;
  completeHabit: (id: string, dateKey?: string) => void;
  undoHabit: (id: string, dateKey?: string) => void;
  /** Marks a day as not expected, so it neither breaks a streak nor counts as missed. */
  skipHabitOnDate: (id: string, dateKey: string) => Promise<void>;
  setHabitNotes: (id: string, notes: string) => Promise<void>;
  pauseHabit: (id: string) => Promise<void>;
  resumeHabit: (id: string) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  recoverHabit: (id: string) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  restoreHabit: (id: string) => Promise<void>;
  permanentlyDeleteHabit: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  saveJournal: (id: string, date: string, content: string, photoUri?: string, mood?: JournalMood, title?: string, tags?: string[]) => void;
  deleteJournal: (id: string) => void;
  exportData: () => string;
  createDataBackup: () => Promise<string>;
  importData: (json: string) => Promise<void>;
};

const defaultSettings: AppSettings = {
  // Fresh installs start light (warm cream + navy + sage, the LUMO brand);
  // users can switch to dark or follow the system in Settings.
  themeMode: "light",
  themeId: DEFAULT_THEME_ID,
  notificationStatus: "unknown",
  notificationsEnabled: true,
  autoBackupEnabled: false,
  backupFrequency: "weekly",
  textSize: "default",
  isPro: false,
  isUnlimited: false,
  bestStreakEver: 0,
  checkIns: defaultCheckIns,
  checkInTimes: defaultCheckInTimes
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

/**
 * `measurement` arrived after habits did, so most stored habits will not have
 * it. Anything malformed becomes `undefined` rather than a zero target — a
 * habit that silently requires 0 metres would auto-complete itself every day.
 */
function normalizeMeasurement(value: unknown): HabitMeasurement | undefined {
  const raw = value as Partial<HabitMeasurement> | undefined;

  if (!raw || (raw.kind !== "duration" && raw.kind !== "distance" && raw.kind !== "steps")) {
    return undefined;
  }

  return Number.isFinite(raw.target) && (raw.target as number) > 0 ? { kind: raw.kind, target: raw.target as number } : undefined;
}

function normalizeHabit(habit: Habit): Habit {
  return {
    ...habit,
    measurement: normalizeMeasurement(habit.measurement),
    category: normalizeCategory(habit.category),
    reminderMode: habit.reminderMode ?? "time",
    reminderTime: habit.reminderTime ?? "09:00",
    reminderIntervalValue: habit.reminderIntervalValue ?? 1,
    reminderIntervalUnit: habit.reminderIntervalUnit ?? "hours",
    skips: habit.skips ?? [],
    notificationIds: habit.notificationIds ?? []
  };
}

/**
 * Entries written before a day could hold two had no id of their own — the date
 * was the key, so it becomes the id. Anything past the per-day cap (only
 * reachable through an edited export) is dropped, oldest kept.
 */
function normalizeJournals(entries: JournalEntry[]): JournalEntry[] {
  const perDay = new Map<string, number>();

  return entries
    .filter((entry) => entry && typeof entry.date === "string")
    // Placeholders left by older builds hold nothing but a default mood. They
    // never showed anywhere, yet they occupied their day and blocked a real
    // entry from being written there.
    .filter(journalHasContent)
    .filter((entry) => {
      const count = perDay.get(entry.date) ?? 0;

      if (count >= MAX_JOURNALS_PER_DAY) {
        return false;
      }

      perDay.set(entry.date, count + 1);
      return true;
    })
    .map((entry) => (entry.id ? entry : { ...entry, id: entry.date }));
}

function normalizeState(parsed: StoredState): StoredState {
  const settings = { ...defaultSettings, ...parsed.settings };
  const habits = (parsed.habits ?? []).map(normalizeHabit);

  if (!["daily", "weekly", "monthly"].includes(settings.backupFrequency)) {
    settings.backupFrequency = defaultSettings.backupFrequency;
  }

  // Until onboarding completes the user never chose a theme — any stored
  // values are stale defaults, so keep pre-onboarding installs on the current
  // default look (light black).
  //
  // `themeId` deliberately does NOT join this reset. `themeMode`'s stored value
  // can be a stale default from a build whose default differed; `themeId` has
  // no such history, so resetting it could only ever throw away a deliberate
  // choice — including one made from a future theme step in onboarding.
  if (!(parsed.hasOnboarded ?? false)) {
    settings.themeMode = defaultSettings.themeMode;
  }

  // Falls back to cream for anything unrecognised: a blob written by a build
  // with a theme this one no longer has must still open.
  settings.themeId = normalizeThemeId(settings.themeId);

  // Seed the high-water mark from the habits being loaded. This is what
  // migrates installs saved before the field existed, and it is also the floor
  // for anything a corrupt value could have written.
  //
  // The stored value stays in the Math.max, which is what stops the move to an
  // activity streak from ever REVOKING a badge: a thrice-weekly habit kept for
  // a month scores 12 under the old per-habit rule and 1 under this one, so an
  // install that already banked the higher number keeps it.
  settings.bestStreakEver = Math.max(
    Number.isFinite(settings.bestStreakEver) ? settings.bestStreakEver : 0,
    bestActivityStreak(habits)
  );

  // Absent on every install saved before check-ins existed, and partial on any
  // saved mid-way through adding one.
  settings.checkIns = normalizeCheckIns(settings.checkIns);
  // Same story, and it also drops any stored time that no longer parses rather
  // than handing NaN to a notification trigger.
  settings.checkInTimes = normalizeCheckInTimes(settings.checkInTimes);

  return {
    hasOnboarded: parsed.hasOnboarded ?? false,
    nickname: parsed.nickname ?? "",
    lumoIdSuffix: parsed.lumoIdSuffix ?? generateLumoSuffix(),
    email: parsed.email ?? "",
    settings,
    habits,
    journals: normalizeJournals(parsed.journals ?? []),
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

  // Same pin for the mode. Hiding the Light/Dark control without pinning would
  // strand anyone already on dark — the card that would let them switch back is
  // the one being hidden — and would leave a "system" install following the
  // device into a dark palette nobody can leave.
  const isDark =
    APPEARANCE_ENABLED &&
    (state.settings.themeMode === "dark" || (state.settings.themeMode === "system" && systemScheme === "dark"));
  // Pinned to cream while `APPEARANCE_ENABLED` is false — see the note on that
  // flag. Deliberately overrides the stored value rather than rewriting it, so
  // an install that already chose a theme gets it back when the picker returns.
  const themeId = APPEARANCE_ENABLED ? (state.settings.themeId ?? DEFAULT_THEME_ID) : DEFAULT_THEME_ID;
  const palette = useMemo(() => getPalette(themeId, isDark), [themeId, isDark]);

  /**
   * Hydration has three outcomes, and only one of them may be written back.
   *
   * "loaded" covers both a good read and a fresh install (nothing stored yet) —
   * the in-memory state is the truth, so persisting it is correct.
   *
   * "blocked" is a stored blob we could not read: the bytes are still on disk
   * and may well be recoverable by hand, so writing over them is the one thing
   * that turns a bad read into permanent loss. Persisting stays off for the
   * whole session; the user is told, and the unreadable bytes are copied aside
   * before anything else touches storage.
   */
  const [hydration, setHydration] = useState<"pending" | "loaded" | "blocked">("pending");

  useEffect(() => {
    async function hydrate() {
      let raw: string | null = null;

      try {
        raw = await AsyncStorage.getItem(STORAGE_KEY);
      } catch {
        // The read itself failed, so we know nothing about what is on disk.
        // Assume there is something worth keeping.
        return "blocked" as const;
      }

      if (!raw) {
        return "loaded" as const;
      }

      try {
        setState(normalizeState(JSON.parse(raw) as StoredState));
        return "loaded" as const;
      } catch {
        // Keep the unreadable bytes under a key nothing else writes, so a
        // truncated-but-mostly-intact blob can still be recovered.
        await AsyncStorage.setItem(QUARANTINE_KEY, raw).catch(() => undefined);
        return "blocked" as const;
      }
    }

    hydrate()
      .catch(() => "blocked" as const)
      .then((outcome) => {
        setHydration(outcome);
        setIsReady(true);

        if (outcome === "blocked") {
          Alert.alert(
            "Couldn't open your Lumo data",
            "Your saved habits and journals could not be read, so Lumo has started empty. Nothing has been deleted — a copy of the unreadable data is kept on this device. To avoid overwriting it, changes made now will not be saved. Reopening the app may fix it; if it doesn't, please get in touch before reinstalling."
          );
        }
      });
  }, []);

  useEffect(() => {
    // Never `hydration !== "loaded"` — see the note on the state above. A
    // blocked read must not be written over, and "pending" would race the
    // hydrate itself.
    if (hydration !== "loaded") {
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [hydration, state]);

  // Raise the badge high-water mark whenever a streak beats it. Keyed on the
  // habits themselves so a check-in moves it the moment it lands, and it only
  // ever goes up — deleting the habit that set the record does not undo it.
  //
  // Measured on ACTIVITY — consecutive days with any check-in at all — not on
  // the best run of a single habit. Badges are for turning up in Lumo, so a
  // week of checking in on a different habit each day is a seven-day streak,
  // where the old per-habit rule scored it as one.
  useEffect(() => {
    if (!isReady) {
      return;
    }

    const best = bestActivityStreak(state.habits);

    if (best <= state.settings.bestStreakEver) {
      return;
    }

    setState((current) => ({
      ...current,
      settings: { ...current.settings, bestStreakEver: Math.max(current.settings.bestStreakEver, best) }
    }));
  }, [isReady, state.habits, state.settings.bestStreakEver]);

  /**
   * The single owner of what the OS actually has scheduled for the daily
   * nudges. The setters below only write the preference; this reconciles.
   *
   * Also runs on launch, which is the point: a reinstall, a restored backup, or
   * permission granted from system settings all leave the stored preference and
   * the OS schedule disagreeing, and only a reconcile on open can catch that.
   *
   * The master notifications switch is read here rather than handled in its own
   * setter, so turning it off cancels the nudges without ERASING which ones
   * were chosen — flipping it back on restores exactly the previous set.
   */
  useEffect(() => {
    if (!isReady) {
      return;
    }

    syncCheckInReminders(
      state.settings.notificationsEnabled ? state.settings.checkIns : defaultCheckIns,
      state.settings.checkInTimes
    );
    // `checkInTimes` is a dependency too, or moving a nudge would write the
    // preference and leave the OS holding the old hour.
  }, [isReady, state.settings.checkIns, state.settings.checkInTimes, state.settings.notificationsEnabled]);

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

    // Gated on `hydration`, not `isReady`: after an unreadable read the snapshot
    // is the empty default, and backing that up would bury the real backups
    // under timestamped empties.
    if (hydration !== "loaded" || !shouldRunScheduledBackup(snapshot.settings) || backupInFlightRef.current) {
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
  }, [backupTick, hydration]);

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

    Promise.all([fetchServerEntitlement(), restoreFriendsSubscription(), restoreUnlimited()]).then(([server, store, unlimited]) => {
      setState((current) => {
        // Each entitlement is only touched when something actually answered;
        // both unknown (offline, native module not built) leaves it as-is.
        const isPro = server === null && store === null ? current.settings.isPro : server === true || store === true;
        const isUnlimited = unlimited === null ? current.settings.isUnlimited : unlimited;

        if (current.settings.isPro === isPro && current.settings.isUnlimited === isUnlimited) {
          return current;
        }

        return { ...current, settings: { ...current.settings, isPro, isUnlimited } };
      });
    });
  }, [isReady]);

  // Keep the iOS home-screen widget in sync with today's habits/completions,
  // and let it follow the app's active theme.
  useEffect(() => {
    if (isReady) {
      updateTodayWidget(state.habits, {
        background: palette.canvas,
        card: palette.card,
        accent: palette.greenDark,
        onAccent: palette.canvas,
        text: palette.ink,
        subtle: palette.subtle
      });
    }
  }, [isReady, state.habits, palette]);

  // Apply completions made from the widget's Complete button while the app was
  // closed, then the effect above rewrites the authoritative snapshot. Runs on
  // launch and each time the app returns to the foreground.
  useEffect(() => {
    if (!isReady) {
      return;
    }

    const reconcile = async () => {
      const pending = await readPendingWidgetToggles();
      if (pending.length === 0) {
        return;
      }

      const dateKey = toDateKey();
      const before = stateRef.current.habits;

      setState((current) => ({
        ...current,
        habits: current.habits.map((habit) => {
          const toggle = pending.find((item) => item.id === habit.id);
          if (!toggle) {
            return habit;
          }
          return toggle.done ? withCompletionOnDate(habit, dateKey) : withoutCompletionOnDate(habit, dateKey);
        })
      }));

      // Mirror to the group backend (no-op for personal habits).
      pending.forEach((toggle) => {
        const habit = before.find((item) => item.id === toggle.id);
        if (!habit) {
          return;
        }
        const next = toggle.done ? withCompletionOnDate(habit, dateKey) : withoutCompletionOnDate(habit, dateKey);
        friendsService.syncCompletion(toggle.id, dateKey, completionCount(next, dateKey)).catch(() => undefined);
      });
    };

    reconcile();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        reconcile();
      }
    });

    return () => subscription.remove();
  }, [isReady]);

  // Push + realtime notifications: register this device's push token (so the
  // server can notify when the app is closed) and subscribe to live in-app
  // banners for friend requests / group invites / cheers while it's open.
  useEffect(() => {
    if (!isReady) {
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      const userId = await ensureSignedIn();
      if (!active || !userId) {
        return;
      }

      /**
       * Realtime FIRST, then the push token.
       *
       * The order matters more than it looks: `getExpoPushToken` prompts for
       * permission and talks to Expo's servers, and anything that threw in there
       * — no project id, a simulator, a refused prompt followed by a bad
       * `savePushToken` — landed in the catch below and the subscription was never
       * made. In-app banners then failed for a reason that had nothing to do with
       * them, and silently.
       *
       * They are independent: realtime needs a signed-in user and nothing else,
       * and push needs a token. Neither should be able to take the other down.
       */
      unsubscribe = subscribeToUserNotifications(userId);

      const token = await getExpoPushToken();
      if (token) {
        friendsService.savePushToken(token);
      }
    })().catch(() => {
      // Push is a nicety: no token means no notifications, and the app is
      // otherwise unaffected. Caught rather than left to float — an unhandled
      // rejection here reads as a crash in development for a phone that simply
      // has no network.
    });

    // Tapping any of our notifications deep-links to the relevant screen.
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      if (typeof route === "string") {
        router.push(route as Parameters<typeof router.push>[0]);
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
      tapSub.remove();
    };
  }, [isReady]);

  const value = useMemo<LumoContextValue>(() => {
    // Active + paused habits count toward the free limit; archived and trashed
    // habits don't occupy a slot.
    const ownedHabitCount = state.habits.filter(
      (habit) => habit.status === "active" || habit.status === "paused"
    ).length;
    const isPro = state.settings.isPro;
    const isUnlimited = state.settings.isUnlimited;

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
      themeId,
      lastMessage,
      isPro,
      // The same entitlement under the name the product is sold as — see the
      // note on the context type.
      isPlus: isPro,
      isUnlimited,
      habitLimit: FREE_HABIT_LIMIT,
      ownedHabitCount,
      // The caps bite on CREATION only. An account that is already over the
      // limit — bought unlimited and lapsed, or restored a backup — keeps
      // everything it has; deleting a habit someone tracked for months to
      // enforce a price change would be indefensible.
      canCreateHabit: isUnlimited || ownedHabitCount < FREE_HABIT_LIMIT,
      journalLimit: FREE_JOURNAL_LIMIT,
      journalCount: state.journals.length,
      canCreateJournal: isUnlimited || state.journals.length < FREE_JOURNAL_LIMIT,
      canUseFeatureBoard: isPro,
      submitFeatureRequest(title, description, photoUri) {
        const cleanTitle = title.trim();
        // Submitting is Pro-only; the UI routes free users to the paywall.
        // Reads the same entitlement the gate does — checking anything looser
        // here would leave the board open but inert.
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
      // Apple IAP (lib/iap.ts). Both entitlements persist locally in settings
      // and are re-checked against the store on launch.
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
      async purchaseUnlimited() {
        const purchased = await purchaseUnlimitedUnlock();

        if (purchased) {
          setState((current) => ({
            ...current,
            settings: { ...current.settings, isUnlimited: true }
          }));
        }

        return purchased;
      },
      /**
       * Restores BOTH products in one pass — Apple's "Restore Purchases" is one
       * button to the user, and asking them which of two things they are
       * restoring would be asking them to know the shape of our price list.
       *
       * A null from either check means the store was unreachable, and that
       * entitlement is left exactly as it was rather than being revoked on the
       * strength of a failed network call.
       */
      async restorePurchases() {
        const [pro, unlimited] = await Promise.all([restoreFriendsSubscription(), restoreUnlimited()]);

        setState((current) => ({
          ...current,
          settings: {
            ...current.settings,
            isPro: pro === null ? current.settings.isPro : pro,
            isUnlimited: unlimited === null ? current.settings.isUnlimited : unlimited
          }
        }));

        const settings = stateRef.current.settings;

        return (pro === null ? settings.isPro : pro) || (unlimited === null ? settings.isUnlimited : unlimited);
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
      setThemeId(id) {
        setState((current) => ({
          ...current,
          settings: { ...current.settings, themeId: id }
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
      // Both of these only write the preference. Scheduling is done by the
      // effect that watches `settings.checkIns`, so there is exactly one place
      // that decides what the OS is holding — see the note on it above.
      async setCheckIns(schedule) {
        setState((current) => ({
          ...current,
          settings: { ...current.settings, checkIns: schedule }
        }));
      },
      async setCheckInEnabled(key, enabled) {
        setState((current) => ({
          ...current,
          settings: { ...current.settings, checkIns: { ...current.settings.checkIns, [key]: enabled } }
        }));
      },
      async setCheckInTime(key, time) {
        setState((current) => ({
          ...current,
          settings: { ...current.settings, checkInTimes: { ...current.settings.checkInTimes, [key]: time } }
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
      setTextSize(size) {
        setState((current) => ({
          ...current,
          settings: { ...current.settings, textSize: size }
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
      async skipHabitOnDate(id, dateKey) {
        setState((current) => ({
          ...current,
          habits: current.habits.map((item) => {
            if (item.id !== id) {
              return item;
            }

            const skips = item.skips ?? [];
            // Toggle: tapping again un-skips the day.
            return {
              ...item,
              skips: skips.includes(dateKey) ? skips.filter((key) => key !== dateKey) : [...skips, dateKey]
            };
          })
        }));
      },
      async setHabitNotes(id, notes) {
        setState((current) => ({
          ...current,
          habits: current.habits.map((item) => (item.id === id ? { ...item, notes: notes.trim() || undefined } : item))
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
      saveJournal(id, date, content, photoUri, mood, title, tags) {
        const trimmed = content.trim();
        const trimmedTitle = title?.trim() || undefined;

        setState((current) => {
          // An entry with no title, text, photo, or mood is removed entirely.
          if (!trimmed && !trimmedTitle && !photoUri && !mood) {
            return { ...current, journals: current.journals.filter((entry) => entry.id !== id) };
          }

          const now = new Date().toISOString();
          const existing = current.journals.find((entry) => entry.id === id);

          // A day holds at most MAX_JOURNALS_PER_DAY written entries. The
          // editor only opens when there is room, so this just keeps a stale
          // screen from writing one too many.
          if (!existing && current.journals.filter((entry) => entry.date === date && journalHasContent(entry)).length >= MAX_JOURNALS_PER_DAY) {
            return current;
          }

          const cleanTags = tags?.length ? tags : undefined;
          // `date` is written on update too: an entry can be re-filed under
          // another day from the editor, and spreading `existing` alone would
          // quietly keep the day it was created on.
          const nextEntry: JournalEntry = existing
            ? { ...existing, date, title: trimmedTitle, content, photoUri, mood, tags: cleanTags, updatedAt: now }
            : { id, date, title: trimmedTitle, content, photoUri, mood, tags: cleanTags, createdAt: now, updatedAt: now };

          return {
            ...current,
            journals: [...current.journals.filter((entry) => entry.id !== id), nextEntry]
          };
        });
      },
      deleteJournal(id) {
        setState((current) => ({
          ...current,
          journals: current.journals.filter((entry) => entry.id !== id)
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
  }, [isDark, isReady, lastMessage, palette, themeId, state]);

  return <LumoContext.Provider value={value}>{children}</LumoContext.Provider>;
}

export function useLumo() {
  const context = useContext(LumoContext);

  if (!context) {
    throw new Error("useLumo must be used within LumoProvider");
  }

  return context;
}
