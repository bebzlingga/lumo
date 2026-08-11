import type { IconName } from "@/components/Icon";
import { habitAccent } from "@/constants/theme";

/**
 * What a focus session is FOR — the cards across the top of the setup screen.
 *
 * Deliberately coarse. These are not tasks and not habits; they are the kind of
 * work, which is the one thing worth knowing about a block of time after the
 * fact. Each has to be a word someone would actually use about their own
 * afternoon, so there is no "Productivity" and no "Deep Work" — and no two that
 * a person would have to think about choosing between.
 *
 * The row scrolls, so length is cheap. Ordered by how often they are likely to
 * be picked rather than alphabetically: the first two should cover most
 * sessions without a scroll, and `other` closes the list because it is the
 * fallback rather than a choice.
 *
 * `color` is a swatch from `habitColorOptions` — the SAME palette a habit is
 * given. A focus category and a habit are both "a kind of thing you are working
 * on", and drawing them from one set is what stops the app having two unrelated
 * ideas of what colour means. It also inherits that palette's work: each swatch
 * already ships a contrast-tuned `accent`, and a separate `accentDark` where
 * the light one would vanish on a dark canvas.
 *
 * Fixed per activity and NOT theme-dependent — the same call the Explore rows
 * make. It is wayfinding: the card you reach for should look the same whichever
 * theme is on.
 */
export type FocusActivityId =
  | "study"
  | "work"
  | "writing"
  | "creative"
  | "learning"
  | "move"
  | "unwind"
  | "chores"
  | "planning"
  | "other";

export type FocusActivity = {
  id: FocusActivityId;
  label: string;
  icon: IconName;
  /** A `color` from `habitColorOptions`, which is what resolves its accent. */
  color: string;
};

/**
 * The contrast-tuned accent for this activity, per mode.
 *
 * Goes through `habitAccent` so a focus category and a habit wearing the same
 * swatch resolve identically — including the dark-mode substitution the near
 * black "Ink" swatch needs to stay visible.
 */
export function activityAccent(activity: FocusActivity, isDark: boolean): string {
  return habitAccent(activity.color, isDark) ?? activity.color;
}

export const FOCUS_ACTIVITIES: FocusActivity[] = [
  { id: "study", label: "Study", icon: "book", color: "#1D74E4" },
  { id: "work", label: "Work", icon: "taskSquare", color: "#17A38F" },
  { id: "writing", label: "Writing", icon: "note", color: "#F9941E" },
  { id: "creative", label: "Creative", icon: "brush", color: "#5A4B9C" },
  { id: "learning", label: "Learning", icon: "brain", color: "#74CDC4" },
  { id: "move", label: "Move", icon: "activity", color: "#FC7A5E" },
  { id: "unwind", label: "Unwind", icon: "tree", color: "#A29FC9" },
  { id: "chores", label: "Chores", icon: "broom", color: "#FBB25C" },
  { id: "planning", label: "Planning", icon: "calendar", color: "#D0405E" },
  { id: "other", label: "Other", icon: "grid", color: "#2F302B" }
];

export const DEFAULT_ACTIVITY: FocusActivityId = "study";

export function focusActivity(id: FocusActivityId): FocusActivity {
  return FOCUS_ACTIVITIES.find((activity) => activity.id === id) ?? FOCUS_ACTIVITIES[0];
}

/** Narrows anything stored to a real activity — an older build may name one this doesn't have. */
export function normalizeActivity(value: unknown): FocusActivityId {
  return FOCUS_ACTIVITIES.some((activity) => activity.id === value) ? (value as FocusActivityId) : DEFAULT_ACTIVITY;
}
