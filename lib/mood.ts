import { IconName } from "@/components/Icon";
import { LumoPalette } from "@/constants/theme";
import { JournalMood } from "@/types/habit";

export const moodOptions: { value: JournalMood; icon: IconName; label: string }[] = [
  { value: "happy", icon: "emojiHappy", label: "Good" },
  { value: "neutral", icon: "emojiNormal", label: "Okay" },
  { value: "sad", icon: "emojiSad", label: "Tough" }
];

export function moodColor(palette: LumoPalette, mood: JournalMood) {
  switch (mood) {
    case "happy":
      return palette.green;
    case "sad":
      return palette.danger;
    default:
      return palette.subtle;
  }
}

export function moodIcon(mood: JournalMood): IconName {
  return moodOptions.find((option) => option.value === mood)?.icon ?? "emojiNormal";
}
