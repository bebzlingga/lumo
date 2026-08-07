import { brand } from "./theme";
import type { IconName } from "@/components/Icon";

/**
 * Lumo's daily nudges — the "Want a little nudge?" step of onboarding, and the
 * same four rows in Settings.
 *
 * One definition for both. They were previously declared inside `app/index.tsx`
 * as a display-only list, which is why the toggles there were decorative: the
 * step knew the words "8:00 AM" but nothing ever read an hour off them.
 */
export type CheckInKey = "morning" | "lunch" | "afternoon" | "evening";

export type CheckIn = {
  key: CheckInKey;
  label: string;
  icon: IconName;
  tint: string;
  /**
   * When it fires unless the user has moved it, as "HH:MM" in 24h — the same
   * shape `habit.reminderTime` uses and the one `WheelTimePicker` reads and
   * writes, so a time never has to be converted between formats on its way to
   * or from the picker.
   */
  defaultTime: string;
  /** What the notification itself says. Lumo's voice: an invitation, never a telling-off. */
  title: string;
  body: string;
};

export const CHECK_INS: CheckIn[] = [
  {
    key: "morning",
    label: "Morning check-in",
    icon: "sun",
    tint: brand.gold,
    defaultTime: "06:00",
    title: "Good morning",
    body: "A fresh page. What is the one habit worth starting the day with?"
  },
  {
    key: "lunch",
    label: "Lunch check-in",
    icon: "coffee",
    tint: brand.coral,
    defaultTime: "12:00",
    title: "Midday pause",
    body: "Half the day is yours already. Anything you can tick off now?"
  },
  {
    key: "afternoon",
    label: "Afternoon check-in",
    icon: "activity",
    tint: brand.blue,
    defaultTime: "15:00",
    title: "Afternoon nudge",
    body: "Still time to move something forward. One habit is enough."
  },
  {
    key: "evening",
    label: "Evening reflection",
    icon: "moon",
    tint: brand.lavender,
    defaultTime: "19:00",
    title: "Evening reflection",
    body: "How did today go? Log what you managed, and let the rest go."
  }
];

export type CheckInSchedule = Record<CheckInKey, boolean>;

/** All off. A nudge is something you ask for, not something that arrives. */
export const defaultCheckIns: CheckInSchedule = {
  morning: false,
  lunch: false,
  afternoon: false,
  evening: false
};

/**
 * Times the user has moved, as "HH:MM". Sparse on purpose: a key is only
 * present once it has been changed, so a check-in left alone keeps following
 * its `defaultTime` — including if that default is ever retuned in a later
 * build, which a fully-populated copy would silently freeze.
 */
export type CheckInTimes = Partial<Record<CheckInKey, string>>;

/** No overrides — every check-in sits at its default hour. */
export const defaultCheckInTimes: CheckInTimes = {};

/** When this check-in actually fires: the user's time if they set one. */
export function checkInTimeFor(checkIn: CheckIn, times?: CheckInTimes): string {
  return times?.[checkIn.key] ?? checkIn.defaultTime;
}

/** "HH:MM" → the hour and minute a notification trigger wants. */
export function parseCheckInTime(time: string): { hour: number; minute: number } {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return { hour: 9, minute: 0 };
  }

  return {
    hour: Math.min(23, Math.max(0, Number(match[1]))),
    minute: Math.min(59, Math.max(0, Number(match[2])))
  };
}

/** "18:30" → "6:30 PM", the form the rows display. */
export function formatCheckInTime(time: string) {
  const { hour, minute } = parseCheckInTime(time);
  const suffix = hour < 12 ? "AM" : "PM";

  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** The label for a check-in's row — its own time, or the default. */
export function checkInTimeLabel(checkIn: CheckIn, times?: CheckInTimes) {
  return formatCheckInTime(checkInTimeFor(checkIn, times));
}

/** Tolerates a partial or absent stored value — every missing key falls back to off. */
export function normalizeCheckIns(value?: Partial<CheckInSchedule>): CheckInSchedule {
  return {
    morning: value?.morning ?? defaultCheckIns.morning,
    lunch: value?.lunch ?? defaultCheckIns.lunch,
    afternoon: value?.afternoon ?? defaultCheckIns.afternoon,
    evening: value?.evening ?? defaultCheckIns.evening
  };
}

/**
 * Keeps only well-formed "HH:MM" entries for keys that still exist. A stored
 * time from an older build (or a hand-edited backup) that no longer parses
 * falls back to the default rather than scheduling a notification at NaN.
 */
export function normalizeCheckInTimes(value?: Partial<CheckInTimes>): CheckInTimes {
  const keys: CheckInKey[] = ["morning", "lunch", "afternoon", "evening"];
  const times: CheckInTimes = {};

  for (const key of keys) {
    const stored = value?.[key];

    if (typeof stored === "string" && /^\d{1,2}:\d{2}$/.test(stored)) {
      const { hour, minute } = parseCheckInTime(stored);
      times[key] = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  return times;
}
