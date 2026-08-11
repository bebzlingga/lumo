import type { ThemeId } from "@/constants/theme";

/**
 * Ambient loops for Focus, offered by colour theme.
 *
 * The theme decides WHICH three are on the menu; the user picks one of them, or
 * silence. So the sound follows the look of the app without the two ever
 * needing separate pickers.
 *
 * Two registries rather than one map of theme → files, because several themes
 * genuinely want the same recording — Cream's fireplace and Sunset's campfire
 * are one sound. Referencing a shared id keeps it a single asset instead of a
 * duplicate shipped twice under different names.
 */
export type SoundId =
  | "fireplace"
  | "rainWindow"
  | "cafe"
  | "birdsong"
  | "leaves"
  | "stream"
  | "waves"
  | "gulls"
  | "rainSea"
  | "crickets"
  | "breeze";

export type SoundDefinition = {
  label: string;
  /**
   * Passed straight to expo-audio's `useAudioPlayer`. `require` rather than a
   * URI so the loop is bundled and works with no network — the same call the
   * background plates make.
   */
  source: number;
};

/**
 * ⚠️ The audio files do not exist yet. Until they land, every entry points at
 * `PLACEHOLDER_SOURCE` and `SOUNDS_READY` is false, which is what the UI checks
 * before offering the picker — so the feature ships silent rather than broken.
 *
 * To add them: drop the loops in assets/audio/ (see the README there for the
 * encoding recipe), swap each `source` for its own `require`, and flip
 * `SOUNDS_READY` to true. Nothing else needs to change.
 */
export const SOUNDS_READY = false;

// Points at an existing bundled asset purely so the `require` graph resolves
// while the real loops are outstanding. Never played: `SOUNDS_READY` gates it.
const PLACEHOLDER_SOURCE = 0;

export const SOUNDS: Record<SoundId, SoundDefinition> = {
  fireplace: { label: "Fireplace", source: PLACEHOLDER_SOURCE },
  rainWindow: { label: "Rain on the window", source: PLACEHOLDER_SOURCE },
  cafe: { label: "Quiet café", source: PLACEHOLDER_SOURCE },
  birdsong: { label: "Birdsong", source: PLACEHOLDER_SOURCE },
  leaves: { label: "Wind in the leaves", source: PLACEHOLDER_SOURCE },
  stream: { label: "Forest stream", source: PLACEHOLDER_SOURCE },
  waves: { label: "Waves", source: PLACEHOLDER_SOURCE },
  gulls: { label: "Surf and gulls", source: PLACEHOLDER_SOURCE },
  rainSea: { label: "Rain at sea", source: PLACEHOLDER_SOURCE },
  crickets: { label: "Crickets", source: PLACEHOLDER_SOURCE },
  breeze: { label: "Evening breeze", source: PLACEHOLDER_SOURCE }
};

/** Three per theme, in picker order. */
export const THEME_SOUNDS: Record<ThemeId, SoundId[]> = {
  cream: ["fireplace", "rainWindow", "cafe"],
  forest: ["birdsong", "leaves", "stream"],
  ocean: ["waves", "gulls", "rainSea"],
  // Campfire is the fireplace recording under an evening name — one asset,
  // two homes.
  sunset: ["crickets", "fireplace", "breeze"]
};

/**
 * What sounds when the countdown reaches zero.
 *
 * A fixed list, NOT tied to the theme like the ambience is: a chime's job is to
 * be noticed and then stop, so its character has nothing to do with the mood of
 * the session it is ending. Tying these to the theme would also mean a user who
 * likes one chime loses it by changing their colours.
 */
export type EndSoundId = "chime" | "bell" | "marimba";

export const END_SOUNDS: Record<EndSoundId, SoundDefinition> = {
  chime: { label: "Gentle Chime", source: PLACEHOLDER_SOURCE },
  bell: { label: "Soft Bell", source: PLACEHOLDER_SOURCE },
  marimba: { label: "Marimba", source: PLACEHOLDER_SOURCE }
};

export const END_SOUND_IDS = Object.keys(END_SOUNDS) as EndSoundId[];

export function endSoundLabel(id: string | null): string | null {
  return id && id in END_SOUNDS ? END_SOUNDS[id as EndSoundId].label : null;
}

export function soundsForTheme(themeId: ThemeId): { id: SoundId; label: string }[] {
  return (THEME_SOUNDS[themeId] ?? THEME_SOUNDS.cream).map((id) => ({ id, label: SOUNDS[id].label }));
}

export function soundLabel(id: string | null): string | null {
  return id && id in SOUNDS ? SOUNDS[id as SoundId].label : null;
}

/**
 * True when this sound belongs to the given theme.
 *
 * Used to decide presentation, NOT to stop playback: changing theme mid-session
 * must not cut the sound a user is working to. The picker shows the new theme's
 * three; whatever is already playing keeps playing until they choose otherwise.
 */
export function isSoundInTheme(id: string | null, themeId: ThemeId): boolean {
  return Boolean(id && (THEME_SOUNDS[themeId] ?? []).includes(id as SoundId));
}
