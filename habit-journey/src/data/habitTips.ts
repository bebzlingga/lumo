import type { IconName, Milestone } from "@/types";

/** Which milestone the user is currently on (before it = done, after = locked). */
export const CURRENT_INDEX = 5;

interface HabitSeed {
  title: string;
  description: string;
  icon: IconName;
}

/**
 * Curated pool of realistic habit tips. The roadmap cycles through these with a
 * deterministic offset so scrolling feels endless without ever storing a giant
 * array. Icons are chosen to stay relevant to each habit.
 */
const HABIT_POOL: HabitSeed[] = [
  { title: "Drink Water", description: "Start your morning with one full glass.", icon: "water" },
  { title: "Stretch", description: "Loosen up for two easy minutes.", icon: "wind" },
  { title: "Read One Page", description: "Just one page — momentum does the rest.", icon: "book" },
  { title: "Meditate", description: "Sit and follow five slow breaths.", icon: "lotus" },
  { title: "Walk", description: "Take a short lap around the block.", icon: "footprints" },
  { title: "Journal", description: "Write one honest line about today.", icon: "pen" },
  { title: "Practice Gratitude", description: "Name one thing you're thankful for.", icon: "heart" },
  { title: "Eat Fruit", description: "Swap one snack for something fresh.", icon: "apple" },
  { title: "Sleep Earlier", description: "Wind down fifteen minutes sooner.", icon: "moon" },
  { title: "Deep Breathing", description: "Inhale for four, exhale for six.", icon: "wind" },
  { title: "Review Goals", description: "Glance at what matters most this week.", icon: "target" },
  { title: "Smile", description: "Give one genuine smile to someone.", icon: "smile" },
  { title: "Learn Something", description: "Pick up one new word or idea.", icon: "bulb" },
  { title: "Walk 500 Steps", description: "Small steps, quietly compounding.", icon: "shoe" },
  { title: "Clean Your Desk", description: "Clear the surface, clear the mind.", icon: "sparkle" },
  { title: "No Phone 30m", description: "Give your focus a half-hour of quiet.", icon: "moon" },
  { title: "Plan Tomorrow", description: "Note the one thing that must get done.", icon: "target" },
  { title: "Take Deep Breaths", description: "Three deep breaths, shoulders down.", icon: "wind" },
  { title: "Water a Plant", description: "Tend something small and growing.", icon: "leaf" },
  { title: "Stand & Move", description: "Rise and shake out the stiffness.", icon: "footprints" },
  { title: "Write a Thank-You", description: "Send one kind, unexpected message.", icon: "heart" },
  { title: "Learn a Word", description: "Teach your brain one new thing.", icon: "brain" },
  { title: "Morning Sunlight", description: "Catch a few minutes of daylight.", icon: "sun" },
  { title: "Tidy One Corner", description: "Reset a single messy spot.", icon: "sparkle" },
  { title: "Stretch Your Back", description: "Roll your shoulders and lengthen.", icon: "wind" },
  { title: "Reflect", description: "Ask what went well, and why.", icon: "brain" },
  { title: "Drink Herbal Tea", description: "Trade one coffee for something calmer.", icon: "water" },
  { title: "Set an Intention", description: "Choose the tone for your day.", icon: "star" },
  { title: "Read Before Bed", description: "Pages instead of a glowing screen.", icon: "book" },
  { title: "Celebrate a Win", description: "Notice progress, however small.", icon: "trophy" }
];

const XP_STEPS = [10, 15, 20, 25, 30, 40];

/** Deterministic pseudo-random in [0, 1) from an integer seed. */
function seeded(index: number): number {
  const x = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Build the milestone for any index — pure and stable, enabling infinite scroll. */
export function getMilestone(index: number): Milestone {
  const seed = HABIT_POOL[index % HABIT_POOL.length];
  const completed = index < CURRENT_INDEX;
  const current = index === CURRENT_INDEX;

  return {
    id: `milestone-${index}`,
    index,
    title: seed.title,
    description: seed.description,
    icon: seed.icon,
    completed,
    current,
    locked: index > CURRENT_INDEX,
    xp: XP_STEPS[index % XP_STEPS.length],
    // Streaks only make sense on the trail you've actually walked.
    streak: completed || current ? 2 + Math.floor(seeded(index) * 18) : 0
  };
}

/** Convenience: the first `count` milestones. */
export function getMilestones(count: number): Milestone[] {
  return Array.from({ length: count }, (_unused, index) => getMilestone(index));
}
