import { IconName } from "@/components/Icon";
import { toDateKey } from "@/lib/date";
import { GoalType, HabitCategory, HabitDraft } from "@/types/habit";

// A single habit inside a starter pack. `goal` defaults to once-per-day; set a
// `multiple` goal for count-based habits (e.g. 8 glasses of water).
export type HabitTemplate = {
  name: string;
  category: HabitCategory;
  emoji: IconName;
  goal?: GoalType;
};

// A curated bundle of habits the user can add in one tap.
export type StarterPack = {
  id: string;
  title: string;
  /** Who the pack is for and why it works — the first line answers "is this me?"
   *  so a pack can be judged without reading its four habits. */
  description: string;
  icon: IconName;
  // A habitColorOptions swatch hex, so the icon badges tint to the pack colour.
  color: string;
  habits: HabitTemplate[];
};

export const starterPacks: StarterPack[] = [
  {
    id: "morning",
    title: "Morning Momentum",
    description: "For mornings that get away from you. Four small wins before anything else can make a claim on the day — and the sunlight sets your body clock for the night ahead.",
    icon: "sun",
    color: "#F9941E",
    habits: [
      { name: "Drink a glass of water", category: "Health", emoji: "drop" },
      { name: "Make the bed", category: "Home", emoji: "home" },
      { name: "5-minute stretch", category: "Fitness", emoji: "activity" },
      { name: "Step into sunlight", category: "Health", emoji: "sun" }
    ]
  },
  {
    id: "calm",
    title: "Calm Mind",
    description: "For when you feel wound up or reactive. Short, deliberate pauses spread through the day, with a phone-free first hour to protect the calm the others build.",
    icon: "moon",
    color: "#5A4B9C",
    habits: [
      { name: "Meditate 10 minutes", category: "Mind", emoji: "moon" },
      { name: "Three deep breaths", category: "Mind", emoji: "heart", goal: { type: "multiple", count: 3 } },
      { name: "Write one gratitude", category: "Mind", emoji: "sparkle" },
      { name: "Phone-free first hour", category: "Focus", emoji: "eye" }
    ]
  },
  {
    id: "move",
    title: "Move More",
    description: "For desk days that leave you stiff and flat. Movement that fits around work — no gym, no kit, nothing here needs more than fifteen minutes.",
    icon: "fire",
    color: "#FC7A5E",
    habits: [
      { name: "Walk 15 minutes", category: "Fitness", emoji: "activity" },
      { name: "20 push-ups", category: "Fitness", emoji: "weight", goal: { type: "multiple", count: 20 } },
      { name: "Take the stairs", category: "Fitness", emoji: "zap" },
      { name: "Stretch before bed", category: "Fitness", emoji: "timer" }
    ]
  },
  {
    id: "focus",
    title: "Deep Work",
    description: "For days that stay busy but end with nothing important done. Decide the three that matter before the day decides for you, then defend one block for them.",
    icon: "eye",
    color: "#1D74E4",
    habits: [
      { name: "Plan today's top 3", category: "Focus", emoji: "taskSquare" },
      { name: "One 25-minute focus block", category: "Focus", emoji: "timer" },
      { name: "Read 10 pages", category: "Learning", emoji: "book" },
      { name: "Inbox to zero", category: "Focus", emoji: "note" }
    ]
  },
  {
    id: "winddown",
    title: "Wind Down",
    description: "For nights that drift past midnight. Gives the evening a clear ending, and writing tomorrow's list down is what lets you stop turning it over.",
    icon: "moon",
    color: "#A29FC9",
    habits: [
      { name: "No screens after 10pm", category: "Focus", emoji: "eye" },
      { name: "Read before bed", category: "Learning", emoji: "book" },
      { name: "Note tomorrow's top 3", category: "Focus", emoji: "note" },
      { name: "Lights out by 11", category: "Health", emoji: "moon" }
    ]
  },
  {
    id: "hydrate",
    title: "Stay Healthy",
    description: "For covering the basics without a plan to follow. Nothing here needs thought or preparation, which makes it the easiest pack to keep on a bad day.",
    icon: "drop",
    color: "#17A38F",
    habits: [
      { name: "8 glasses of water", category: "Health", emoji: "drop", goal: { type: "multiple", count: 8 } },
      { name: "Take vitamins", category: "Health", emoji: "pill" },
      { name: "Eat a fruit", category: "Health", emoji: "heart" },
      { name: "Stand & move hourly", category: "Health", emoji: "activity", goal: { type: "multiple", count: 8 } }
    ]
  }
];

/** Turns a pack habit into a full HabitDraft, mirroring the onboarding form's
 * defaults (daily, no reminder). The pack colour tints the habit. */
export function templateToDraft(template: HabitTemplate, packColor: string): HabitDraft {
  return {
    name: template.name,
    category: template.category,
    emoji: template.emoji,
    color: packColor,
    createdAt: toDateKey(),
    reminderEnabled: false,
    reminderMode: "time",
    reminderTime: "09:00",
    reminderIntervalValue: 1,
    reminderIntervalUnit: "hours",
    repeatSchedule: { type: "daily" },
    goal: template.goal ?? { type: "once" }
  };
}
