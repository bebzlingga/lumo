import type { HomePeriod } from "@/constants/backgroundAssets";
import { parseDateKey } from "./date";

/**
 * The rotating words on the home screen.
 *
 * Everything here is indexed by the DAY (and, for the tagline, the time of
 * day), never by a random draw: these lines sit on screen for hours at a
 * stretch, and a value that re-rolled on every render would change while the
 * reader was looking at it — a re-render happens on every habit tick.
 */

/**
 * The lines under the greeting, written for the hour they appear in — the same
 * five periods the backdrop plates are cut into, so the words and the scene
 * behind them are saying the same thing.
 *
 * Set as whole sentences and left to wrap. They are read in a column only
 * about half the screen wide (Lumo owns the other half on every plate), which
 * works out to roughly three lines each — pre-breaking them with newlines, as
 * an earlier pass did, only fixes the breaks to one screen width and one font
 * scale.
 */
const TAGLINES: Record<HomePeriod, string[]> = {
  earlyMorning: [
    "Up before the sun — the quietest hours of the day are yours alone.",
    "Nobody else is awake yet. Might as well take the head start.",
    "First light, first small win. The rest of the day tends to follow."
  ],
  morning: [
    "Small steps today, brighter days tomorrow. One habit at a time.",
    "Start light. One habit is plenty to get the whole day moving.",
    "Win the morning and the rest of it mostly looks after itself."
  ],
  lunch: [
    "Halfway through already. Pick one thing and let it count.",
    "A midday reset is allowed. Then one small win, and carry on.",
    "The morning is spent, the afternoon isn't. Plenty of day left."
  ],
  afternoon: [
    "Still plenty of day left to use. No rush — just one more.",
    "The afternoon dip is normal. One easy habit is usually enough to lift it.",
    "Finish what the morning started. You're closer than it feels."
  ],
  evening: [
    "Wind down gently. One last small win and the day is yours.",
    "Almost there. End the day proud of something, however small.",
    "Evenings are for finishing softly, not for catching up on everything."
  ]
};

const REFLECTION_PROMPTS = [
  "What's one small win from yesterday you're proud of?",
  "Which habit felt easiest today, and why do you think that is?",
  "What got in the way today — and what would make tomorrow smoother?",
  "Who or what made today a little better?",
  "If today had a headline, what would it say?",
  "What is one thing you want to carry into tomorrow?",
  "What did you do today that your future self will thank you for?"
];

/** Days since the epoch — a stable, monotonic index for a date key. */
function dayIndex(dateKey: string) {
  const date = parseDateKey(dateKey);

  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/**
 * The two-line encouragement under the greeting: written for the time of day,
 * and rotated within that period by the date so the same hour tomorrow does
 * not repeat today's line word for word.
 */
export function taglineFor(dateKey: string, period: HomePeriod) {
  const lines = TAGLINES[period];

  return lines[Math.abs(dayIndex(dateKey)) % lines.length];
}

/** The question on the Daily Reflection card. */
export function reflectionPromptFor(dateKey: string) {
  // Offset so the prompt and the tagline don't march in lockstep — with seven
  // entries each they would otherwise pair up the same way every week.
  return REFLECTION_PROMPTS[Math.abs(dayIndex(dateKey) + 3) % REFLECTION_PROMPTS.length];
}

/** "Good morning" / "Good afternoon" / "Good evening" for the given hour. */
export function greetingFor(hour: number) {
  if (hour < 12) {
    return "Good morning";
  }

  return hour < 17 ? "Good afternoon" : "Good evening";
}
