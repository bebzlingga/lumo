import { IconName } from "@/components/Icon";
import { LumoPalette } from "@/constants/theme";
import { JournalMood } from "@/types/habit";

export const moodOptions: { value: JournalMood; icon: IconName; label: string }[] = [
  { value: "happy", icon: "moodGreat", label: "Great" },
  { value: "good", icon: "emojiHappy", label: "Good" },
  { value: "neutral", icon: "emojiNormal", label: "Okay" },
  { value: "sad", icon: "emojiSad", label: "Down" },
  { value: "struggling", icon: "moodStruggling", label: "Struggling" }
];

export function moodColor(palette: LumoPalette, mood: JournalMood) {
  switch (mood) {
    case "happy":
      return palette.accent;
    case "good":
      return palette.green;
    case "sad":
      return palette.chartPartial;
    case "struggling":
      return palette.danger;
    default:
      return palette.subtle;
  }
}

export function moodLabel(mood: JournalMood) {
  return moodOptions.find((option) => option.value === mood)?.label ?? "Okay";
}

export function moodIcon(mood: JournalMood): IconName {
  return moodOptions.find((option) => option.value === mood)?.icon ?? "emojiNormal";
}

/**
 * The tag vocabulary offered in the journal editor. A fixed set rather than
 * free text, so entries stay groupable and the chips do not sprawl.
 */
export const journalTags: { value: string; label: string; icon: IconName }[] = [
  { value: "gratitude", label: "Gratitude", icon: "heart" },
  { value: "reflection", label: "Reflection", icon: "tree" },
  { value: "selfCare", label: "Self-care", icon: "health" },
  { value: "wellness", label: "Wellness", icon: "sparkle" },
  { value: "win", label: "Small win", icon: "trophy" },
  { value: "goals", label: "Goals", icon: "target" },
  { value: "work", label: "Work", icon: "taskSquare" },
  { value: "study", label: "Study", icon: "book" },
  { value: "family", label: "Family", icon: "home" },
  { value: "friends", label: "Friends", icon: "friends" },
  { value: "energy", label: "Energy", icon: "zap" },
  { value: "rest", label: "Rest", icon: "moon" },
  { value: "movement", label: "Movement", icon: "activity" },
  { value: "food", label: "Food", icon: "coffee" },
  { value: "outdoors", label: "Outdoors", icon: "sun" },
  { value: "creative", label: "Creative", icon: "brush" },
  { value: "ideas", label: "Ideas", icon: "brain" },
  { value: "money", label: "Money", icon: "money" },
  { value: "stress", label: "Stress", icon: "drop" },
  { value: "milestone", label: "Milestone", icon: "star" }
];
