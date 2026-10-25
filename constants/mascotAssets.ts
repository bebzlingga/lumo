import type { ImageSourcePropType } from 'react-native'

/**
 * Central registry for LUMO mascot art.
 *
 * Layouts must never `require()` a mascot PNG directly — they ask for a mood
 * and get whatever art is currently available. That keeps every call site
 * stable while the illustration set is still being produced.
 */
export type MascotMood =
	| 'happy'
	| 'excited'
	| 'proud'
	| 'cheering'
	| 'thinking'
	| 'sad'
	| 'celebrating'
	| 'encouraging'
	| 'reminder'
	| 'watering'
	| 'holdingCheck'
	| 'holdingSign'
	| 'holdingTrophy'
	| 'holdingBell'
	// Activity poses — what Lumo is doing, used for feature illustrations.
	| 'tracking'
	| 'progress'
	| 'journaling'
	| 'together'
	| 'trophy'
	| 'time'

export type MascotSize = 'sm' | 'md' | 'lg' | 'xl'

/** Rendered width in px per size step; height follows the art's aspect ratio. */
export const mascotSizes: Record<MascotSize, number> = {
	sm: 72,
	md: 120,
	lg: 180,
	xl: 240,
}

/**
 * Intrinsic aspect ratio (width / height) per render. These are NOT uniform —
 * the celebrate pose is exported landscape (1536×1024) while the rest are
 * portrait (1024×1536), so a single shared constant would squash it.
 */
const PORTRAIT = 1024 / 1536
const SQUARE = 1
const LANDSCAPE = 1536 / 1024

/** Default, for callers that just need a sensible box before art resolves. */
export const MASCOT_ASPECT = PORTRAIT

// --- the renders that exist today ------------------------------------------
const happy = require('../assets/mascot/Lumo_Happy.webp') as ImageSourcePropType
const excited = require('../assets/mascot/Lumo_Excited.webp') as ImageSourcePropType
const proud = require('../assets/mascot/Lumo_Proud.webp') as ImageSourcePropType
const sad = require('../assets/mascot/Lumo_Sad.webp') as ImageSourcePropType
const celebrate = require('../assets/mascot/Lumo_Celebrate.webp') as ImageSourcePropType
const track = require('../assets/mascot/Lumo_Track.webp') as ImageSourcePropType
const progress = require('../assets/mascot/Lumo_Progress.webp') as ImageSourcePropType
const journal = require('../assets/mascot/Lumo_JournalWritingLeft.webp') as ImageSourcePropType
const together = require('../assets/mascot/Lumo_Together.webp') as ImageSourcePropType
const trophy = require('../assets/mascot/Lumo_Trophy.webp') as ImageSourcePropType
const time = require('../assets/mascot/Lumo_Time.webp') as ImageSourcePropType

/**
 * Moods without their own artwork point at the nearest render that exists,
 * rather than crashing or showing an empty box. Swap an entry the moment its
 * art lands and every screen picks it up.
 */
const registry: Record<MascotMood, ImageSourcePropType> = {
	happy,
	excited,
	proud,
	sad,
	celebrating: celebrate,
	// Cheering someone else on is the same energy as celebrating.
	cheering: celebrate,
	holdingTrophy: trophy,
	tracking: track,
	progress,
	journaling: journal,
	together,
	trophy,
	time,
	// A finished task reads closest to "proud".
	holdingCheck: proud,
	// Lumo holding a bell is the reminder pose.
	reminder: time,
	// No dedicated art yet — the neutral happy pose stands in.
	thinking: happy,
	encouraging: happy,
	watering: happy,
	holdingSign: happy,
	holdingBell: happy,
}

const aspectByMood: Partial<Record<MascotMood, number>> = {
	celebrating: LANDSCAPE,
	cheering: LANDSCAPE,
	holdingTrophy: LANDSCAPE,
	progress: LANDSCAPE,
	together: LANDSCAPE,
	trophy: LANDSCAPE,
	tracking: SQUARE,
	time: SQUARE,
	reminder: SQUARE,
}

/** Aspect ratio (width / height) for a mood's current artwork. */
export function mascotAspect(mood: MascotMood = 'happy'): number {
	return aspectByMood[mood] ?? PORTRAIT
}

/** Moods still borrowing another pose — art is outstanding. */
export const mascotMoodsAwaitingArt: MascotMood[] = ['thinking', 'encouraging', 'watering', 'holdingSign', 'holdingBell']

export function mascotAsset(mood: MascotMood = 'happy'): ImageSourcePropType {
	return registry[mood] ?? happy
}

/**
 * Full-screen scenes: complete illustrations (Lumo *and* the setting around
 * her), exported at phone proportions rather than the poses' fixed aspects.
 * They fill a screen behind its copy — an empty state, say — so they carry
 * their own aspect ratio instead of borrowing MASCOT_ASPECT.
 */
const sceneArt = {
	journalToday: {
		source: require('../assets/mascot/Lumo_JournalToday.webp') as ImageSourcePropType,
		darkSource: require('../assets/mascot/Lumo_JournalTodayDark.webp') as ImageSourcePropType,
		aspect: 941 / 1672,
	},
	/** Lumo having finished a walk — the celebration on the complete screen. */
	walkDone: {
		source: require('../assets/walk/LumoWalked.webp') as ImageSourcePropType,
		aspect: 941 / 1672,
	},
	/** Wide banner: Lumo writing on the right, open cream on the left for copy. */
	journalAdd: {
		source: require('../assets/mascot/Lumo_JournalAdd 1.webp') as ImageSourcePropType,
		darkSource: require('../assets/mascot/Lumo_JournalAdd 1Dark.webp') as ImageSourcePropType,
		aspect: 2172 / 724,
	},
} as const

export type SceneName = keyof typeof sceneArt

/** `isDark` swaps in the scene's dark cut (scripts/dark-plates.py) when it has one. */
export function sceneAsset(name: SceneName, isDark = false) {
	const art: { source: ImageSourcePropType; darkSource?: ImageSourcePropType; aspect: number } = sceneArt[name]
	return { source: (isDark && art.darkSource) || art.source, aspect: art.aspect }
}
