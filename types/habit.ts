
import type { CheckInSchedule, CheckInTimes } from "@/constants/checkIns";

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

/**
 * An amount a habit is measured in, on top of its tap-count goal.
 *
 * Deliberately NOT folded into `GoalType`. `CompletionEntry.count` is a tally
 * of taps — `withCompletionOnDate` adds exactly 1 — and `HabitForm` spawns one
 * reminder time field per count, so encoding "30 minutes" as
 * `goal = { type: "multiple", count: 30 }` would render "Daily · 30x a day" and
 * ask for thirty reminder times. This is a separate, optional field, and the
 * amount itself is never stored on the habit: the walk store is the source of
 * truth and the day's total is summed from it, which is what makes two short
 * walks add up to one long target for free.
 *
 * Units match `WalkGoal` exactly — milliseconds, metres, steps — so nothing has
 * to convert between the two.
 */
export type HabitMeasurement = {
  kind: "duration" | "distance" | "steps";
  target: number;
};

export type ReminderMode = "time" | "interval";

export type ReminderIntervalUnit = "minutes" | "hours";

export type HabitStatus = "active" | "paused" | "archived" | "deleted";

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
  // Extra times of day for "multiple times per day" goals. The primary time
  // stays in `reminderTime`; this holds the full list when more than one.
  reminderTimes?: string[];
  reminderIntervalValue: number;
  reminderIntervalUnit: ReminderIntervalUnit;
  repeatSchedule: RepeatSchedule;
  goal: GoalType;
  /** Set when the habit is satisfied by a measured amount (a walk, so far). */
  measurement?: HabitMeasurement;
  createdAt: string;
  completions: CompletionEntry[];
  /**
   * Days deliberately skipped, as date keys. A skip is not a miss — it marks
   * the day as not expected, so the streak survives it.
   */
  skips?: string[];
  /** Free-text note the user keeps against the habit. */
  notes?: string;
  status: HabitStatus;
  notificationIds?: string[];
  // Set when the habit is soft-deleted (moved to Trash).
  deletedAt?: string;
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
  reminderTimes?: string[];
  reminderIntervalValue: number;
  reminderIntervalUnit: ReminderIntervalUnit;
  repeatSchedule: RepeatSchedule;
  goal: GoalType;
  measurement?: HabitMeasurement;
};

/**
 * Five-point mood scale. "happy" | "neutral" | "sad" are the original three and
 * are kept verbatim so entries saved before the scale widened still resolve —
 * they now read as Great / Okay / Down, with Good and Struggling added either
 * side of the middle.
 */
export type JournalMood = "happy" | "good" | "neutral" | "sad" | "struggling";

/**
 * How many entries a single day can hold. Entries carry their own id rather
 * than being keyed by date, so this can be raised without a migration — legacy
 * entries adopt their date as their id when they load.
 */
export const MAX_JOURNALS_PER_DAY = 1;

export type JournalEntry = {
  /** Stable per-entry id; a day holds up to `MAX_JOURNALS_PER_DAY` of them. */
  id: string;
  // The day the entry is filed under (YYYY-MM-DD).
  date: string;
  // Optional big header/title for the entry.
  title?: string;
  content: string;
  // Optional single photo attachment (local file URI).
  photoUri?: string;
  // Optional mood for the day.
  mood?: JournalMood;
  /** Free-form labels chosen from `journalTags`. */
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};

export type FeatureRequestStatus = "open" | "planned" | "in_progress" | "done";

export type FeatureRequestType = "feature" | "bug";

export type FeatureRequest = {
  id: string;
  title: string;
  description?: string;
  // Optional for legacy local entries; the board treats missing as "feature".
  type?: FeatureRequestType;
  // Optional attached screenshot (local file URI).
  photoUri?: string;
  // Total upvotes (seeded base + this user's vote when `votedByMe`).
  votes: number;
  // Whether this user has upvoted. Voting is yes-only; abstaining = no vote.
  votedByMe: boolean;
  // Whether this user submitted it (local stub; a real backend would use authorship).
  mine: boolean;
  status: FeatureRequestStatus;
  createdAt: string;
  // Submitter's nickname (missing when they haven't set one).
  authorName?: string;
};

export type ThemeMode = "system" | "light" | "dark";

export type BackupFrequency = "daily" | "weekly" | "monthly";

/**
 * Accessibility text size. Lumo caps the OS Dynamic Type multiplier (see
 * AppText's `maxFontSizeMultiplier`) so that a device's own Text Size setting
 * cannot distort the layout — which leaves this as the only way to get larger
 * type, so it has to exist.
 */
export type TextSize = "default" | "large" | "larger";

export type AppSettings = {
  themeMode: ThemeMode;
  /**
   * Which colour family the app wears. Orthogonal to `themeMode`: the theme
   * picks the hue, the mode picks light or dark within it. Typed as the string
   * union from constants/theme.ts rather than imported, so the type layer stays
   * free of a dependency on the token file.
   */
  themeId: "cream" | "forest" | "ocean" | "sunset";
  /** Points added to every type and icon size. See TEXT_SIZE_BUMP. */
  textSize: TextSize;
  /** Minimal look: no illustrated backgrounds and no mascot — just the canvas and content. */
  minimalMode: boolean;
  notificationStatus: "unknown" | "granted" | "denied" | "undetermined";
  notificationsEnabled: boolean;
  autoBackupEnabled: boolean;
  backupFrequency: BackupFrequency;
  /**
   * Friends subscription (₱49/month) — gates the social features: Friends,
   * groups, and the Feature Board.
   */
  isPro: boolean;
  /**
   * Unlimited unlock (₱149, once) — lifts the free caps on how many habits and
   * journal entries can be kept.
   *
   * A separate entitlement from `isPro`, not a tier above it: the two products
   * are sold independently, so someone can hold either, both, or neither. See
   * lib/iap.ts.
   */
  isUnlimited: boolean;
  lastBackupAt?: string;
  /**
   * High-water mark for the longest streak ever reached, across every habit.
   *
   * Badges are earned, not held: deriving them from the CURRENT habits meant
   * deleting the habit that earned a milestone silently took the badge back,
   * and so did importing a backup that no longer contained it. This only ever
   * rises.
   */
  bestStreakEver: number;
  /**
   * Which of Lumo's daily nudges are on (see constants/checkIns). Chosen during
   * onboarding and editable in Settings; each enabled key holds one repeating
   * local notification, keyed by `checkInNotificationId`.
   */
  checkIns: CheckInSchedule;
  /**
   * Times the user has moved a check-in to, keyed the same way. Sparse: a key
   * only appears once it has been changed, so anything left alone keeps
   * following the built-in `defaultTime`.
   */
  checkInTimes: CheckInTimes;
};
