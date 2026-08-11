/**
 * The Lumo journey — cumulative distance as a walk through changing scenery.
 *
 * Calm and illustrative, not a game map. There is no route to choose, nothing
 * to unlock in the wrong order and no way to go backwards: you move, and the
 * landscape around you changes. The whole model is one number compared against
 * a list of thresholds.
 *
 * Deliberately coarser than the milestone ladder. Milestones are the badges you
 * collect; the journey is the feeling of having gone somewhere, and hitting a
 * new one every week would make it read as another progress bar.
 */

export type JourneyStage = {
  id: string;
  name: string;
  /** Cumulative metres at which this stage begins. The first is 0. */
  fromMeters: number;
  /** One line of scene-setting, present tense. */
  blurb: string;
  /**
   * A single emoji standing in for the stage.
   *
   * A PLACEHOLDER, and marked as one: the journey is meant to be illustrated
   * with Lumo-style environment art. Emoji are here so the feature is complete
   * and legible before that art exists, and so the slot is obvious to whoever
   * draws it. See `assets/move/README.md`.
   */
  glyph: string;
};

export const JOURNEY_STAGES: JourneyStage[] = [
  { id: "park", name: "Park", fromMeters: 0, blurb: "A loop around the park. Everyone starts here.", glyph: "🌳" },
  { id: "neighborhood", name: "Neighborhood", fromMeters: 5000, blurb: "Streets you know, seen at walking pace.", glyph: "🏘️" },
  { id: "forest", name: "Forest", fromMeters: 15_000, blurb: "Out past the houses, under the trees.", glyph: "🌲" },
  { id: "hills", name: "Hills", fromMeters: 40_000, blurb: "The ground starts to rise. So does the view.", glyph: "🌄" },
  { id: "mountains", name: "Mountains", fromMeters: 80_000, blurb: "High ground, earned a kilometre at a time.", glyph: "⛰️" },
  { id: "coast", name: "Coast", fromMeters: 150_000, blurb: "Down the far side, and there is the sea.", glyph: "🌊" },
  { id: "trail", name: "Adventure Trail", fromMeters: 250_000, blurb: "Off the map. Wherever you like, from here.", glyph: "🧭" }
];

export type JourneyPosition = {
  stage: JourneyStage;
  /** The stage after this one, or null at the end of the road. */
  next: JourneyStage | null;
  /** 0–1 through the CURRENT stage, not through the whole journey. */
  stageRatio: number;
  /** Metres to the next stage, 0 at the end. */
  remainingMeters: number;
  /** Index into `JOURNEY_STAGES`, for drawing Lumo on the trail. */
  index: number;
};

/**
 * Where someone is.
 *
 * `stageRatio` is progress through the current stage rather than the whole
 * journey, because that is the number that moves at a human pace — overall
 * progress toward 250 km barely twitches after a walk, and a bar that never
 * visibly moves is worse than no bar.
 */
export function journeyPosition(totalDistanceM: number): JourneyPosition {
  const safe = Math.max(0, totalDistanceM);
  let index = 0;

  for (let i = 0; i < JOURNEY_STAGES.length; i += 1) {
    if (safe >= JOURNEY_STAGES[i].fromMeters) {
      index = i;
    }
  }

  const stage = JOURNEY_STAGES[index];
  const next = JOURNEY_STAGES[index + 1] ?? null;

  if (!next) {
    return { stage, next: null, stageRatio: 1, remainingMeters: 0, index };
  }

  const span = next.fromMeters - stage.fromMeters;

  return {
    stage,
    next,
    stageRatio: span > 0 ? Math.min(1, (safe - stage.fromMeters) / span) : 1,
    remainingMeters: Math.max(0, next.fromMeters - safe),
    index
  };
}

/**
 * Stages crossed by a change in total.
 *
 * Same shape as the milestone check and for the same reason: compare before
 * against after, so a stage reached last week is never re-announced.
 */
export function journeyStagesReached(beforeM: number, afterM: number): JourneyStage[] {
  return JOURNEY_STAGES.filter((stage) => stage.fromMeters > 0 && beforeM < stage.fromMeters && afterM >= stage.fromMeters);
}
