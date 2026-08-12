import type { ImageSourcePropType } from 'react-native'
import type { ThemeId } from '@/constants/theme'

/**
 * Central registry for the pastel landscape backdrops.
 *
 * Each screen category maps to a variant so backgrounds stay part of one
 * illustration family. Variants without their own art fall back to the closest
 * available hue rather than rendering nothing.
 */
export type BackgroundVariant =
	| 'onboarding'
	| 'today'
	| 'habits'
	| 'habitDetail'
	| 'insights'
	| 'journal'
	| 'friends'
	| 'groups'
	| 'challenges'
	| 'challengeDetail'
	| 'trophies'
	| 'levels'
	| 'profile'
	| 'avatarCreator'
	| 'themes'
	| 'walkDone'
	| 'walking'
	| 'settings'
	| 'notifications'
	| 'reminders'
	| 'backup'
	| 'trash'
	| 'plus'
	| 'subscription'
	| 'empty'
	| 'loading'
	| 'success'
	| 'error'
	| 'offline'
	| 'syncing'
	| 'permission'
	| 'splash'
	| 'widget'

/**
 * Intrinsic aspect ratio (width / height) shared by every plate — they are all
 * exported at 853 × 1844. Use it to size a full-bleed backdrop without
 * distorting the art (e.g. bottom-anchored so the hills stay visible).
 */
export const BACKGROUND_ASPECT = 853 / 1844

/** The eight landscape plates that exist today. */
const art = {
	onboarding: require('../assets/bg/01_onboarding.webp') as ImageSourcePropType,
	today: require('../assets/bg/02_today.webp') as ImageSourcePropType,
	habits: require('../assets/bg/03_habits.webp') as ImageSourcePropType,
	habitDetail: require('../assets/bg/04_habit_details.webp') as ImageSourcePropType,
	insights: require('../assets/bg/05_insights.webp') as ImageSourcePropType,
	journal: require('../assets/bg/06_journal.webp') as ImageSourcePropType,
	challenge: require('../assets/bg/07_challenge.webp') as ImageSourcePropType,
	trophies: require('../assets/bg/08_trophies.webp') as ImageSourcePropType,
	// Move brings its own plates rather than borrowing — see assets/walk. Both
	// are SCENES with Lumo drawn in, so they are fitted by `WalkBackground`
	// rather than washed by `LumoBackground`.
	walking: require('../assets/walk/LumoWalking.webp') as ImageSourcePropType,
	walkDone: require('../assets/walk/LumoWalked.webp') as ImageSourcePropType,
}

/**
 * Variants beyond the eight plates reuse the nearest matching hue, chosen so
 * the mapping still reads intentionally (e.g. success → mint habits plate,
 * error/notifications → coral journal plate).
 */
const registry: Record<BackgroundVariant, ImageSourcePropType> = {
	onboarding: art.onboarding,
	today: art.today,
	habits: art.habits,
	habitDetail: art.habitDetail,
	insights: art.insights,
	journal: art.journal,
	friends: art.today,
	groups: art.habits,
	challenges: art.challenge,
	challengeDetail: art.habitDetail,
	trophies: art.trophies,
	levels: art.insights,
	profile: art.habits,
	avatarCreator: art.journal,
	themes: art.onboarding,
	walking: art.walking,
	walkDone: art.walkDone,
	settings: art.habitDetail,
	notifications: art.journal,
	reminders: art.trophies,
	backup: art.habits,
	trash: art.habitDetail,
	plus: art.insights,
	subscription: art.trophies,
	empty: art.onboarding,
	loading: art.habitDetail,
	success: art.habits,
	error: art.journal,
	offline: art.habitDetail,
	syncing: art.habitDetail,
	permission: art.trophies,
	splash: art.today,
	widget: art.habits,
}

/**
 * The home screen's own backdrop family — a different kind of plate from the
 * eight above.
 *
 * These are FULL-BLEED scenes rather than a wash: Lumo and the sky live in the
 * top third, the middle is open cream for the cards to sit on, and foliage
 * closes the bottom. Because Lumo is baked into the art, the home screen must
 * not draw a mascot of its own over them.
 */
export type HomePeriod = 'earlyMorning' | 'morning' | 'lunch' | 'afternoon' | 'lateAfternoon' | 'evening'

/** Every home plate is exported at 863 × 1822. */
export const HOME_BACKGROUND_ASPECT = 863 / 1822

/**
 * How each plate is fitted to the screen.
 *
 * One row per plate, because the five are not framed alike — Lumo starts at a
 * different height and reaches a different distance in from the left on each
 * of them — and matching them up is a matter of tuning these three against one
 * another. The early-morning plate is the reference the rest are fitted to.
 *
 * `scale` — plate width as a multiple of the screen's, anchored at the LEFT
 * edge. This is what moves a scene right and what sizes Lumo: everything in a
 * plate sits at a fixed fraction of its width, so drawing it wider slides each
 * element outward in proportion. A plain offset would move it too, but would
 * leave an unpainted strip down the left that the plate's own sky gradient
 * cannot be faked into with a flat colour. The plate grows taller with it.
 *
 * `shiftY` — how far the plate is pulled up past the top of the screen, as a
 * fraction of its own height. Every plate opens on a band of empty sky;
 * cropping it brings Lumo up under the header instead of leaving him stranded
 * down in the greeting. Safe to crop because the plate is around three
 * screen-heights tall, so nothing is exposed at the bottom. Tune against one
 * rule: the tip of Lumo's hair lands just below the header, never behind it.
 *
 * `sceneBottom` — where the first card starts, as a fraction of the plate,
 * measured BEFORE `shiftY` is taken off. Set a little short of where Lumo
 * actually ends, so the card crosses the foot of the scene rather than
 * clearing it — which reads as the card sitting in FRONT of the art.
 *
 * Note that lowering `sceneBottom` stops moving the cards once the reserve
 * drops under the greeting's own height; past that the copy sets it.
 */
export type HomePlateFit = {
	scale: number
	shiftY: number
	sceneBottom: number
}

/**
 * ONE fit for all six, unlike the set before them.
 *
 * The old plates were drawn at different framings and each needed its own three
 * numbers tuned against the others. This set is exported to a single template —
 * same 863 × 1822 frame, Lumo top right at the same size, the scene ending at
 * the same height — so a per-period row would be six copies of one row and six
 * places to forget when the art is re-cut.
 *
 * `scale` does all the work here, and it is the only lever that moves the scene
 * WITHOUT opening a gap.
 *
 * The plate is anchored top-left, so drawing it larger slides every element in
 * it both right and down in proportion — Lumo sits about a sixth of the way
 * down the art, so a 30% larger plate puts him 30% further from the top. The
 * art still starts at y=0 and still reaches past the foot of the screen, so
 * there is nothing above it and nothing below it to see.
 *
 * `shiftY` lifts the plate by a fraction of its own height — 0.022 is about
 * 20pt on a phone, which is what this is set to. It is a fraction rather than a
 * point value so `homeSceneBottom` moves with it: the greeting's reserve is
 * measured from the same number, and the content follows the art up rather than
 * leaving a gap where it used to end.
 *
 * There is room to lift because the plate stands about 2.3 screen-widths tall —
 * far past the foot of any phone. Push it much further and the bottom edge
 * arrives, and with it a strip of bare canvas under the art.
 *
 * `sceneBottom` comes down as `scale` goes up: it is a fraction of the plate's
 * height, and the plate is now taller than the screen. The two always move
 * together, or the first card follows Lumo down the page.
 *
 * `scale` is the ONLY lever, and it moves the scene diagonally: the plate is
 * anchored top-left, so enlarging it slides every element in the art both right
 * and down in proportion. Right and down cannot be asked for separately here.
 *
 * 1.0 is the floor — the plate exactly the width of the screen. Below it the
 * art stops covering the width and a strip of canvas opens at the side; the
 * art's own left edge is a warmer cream than the canvas, so that strip shows as
 * a seam rather than blending. Moving Lumo right without also moving him down
 * would mean drawing the plate offset with that strip exposed, which is why
 * there is no `shiftX`.
 */
const HOME_FIT: HomePlateFit = { scale: 1.1, shiftY: 0.022, sceneBottom: 0.26 }

export const HOME_PLATE_FIT: Record<HomePeriod, HomePlateFit> = {
	earlyMorning: HOME_FIT,
	morning: HOME_FIT,
	lunch: HOME_FIT,
	afternoon: HOME_FIT,
	lateAfternoon: HOME_FIT,
	evening: HOME_FIT,
}

const homeArt: Record<HomePeriod, ImageSourcePropType> = {
	earlyMorning: require('../assets/bg-home/LumoEarlyMorning.webp') as ImageSourcePropType,
	morning: require('../assets/bg-home/LumoMorning.webp') as ImageSourcePropType,
	lunch: require('../assets/bg-home/LumoLunch.webp') as ImageSourcePropType,
	afternoon: require('../assets/bg-home/LumoAfternoon.webp') as ImageSourcePropType,
	lateAfternoon: require('../assets/bg-home/LumoLateAfternoon.webp') as ImageSourcePropType,
	evening: require('../assets/bg-home/LumoEvening.webp') as ImageSourcePropType,
}

/**
 * Which plate the clock calls for. A boundary hour belongs to the period it
 * opens — 12:00 is lunch, 15:00 afternoon, 18:00 evening — and the midnight
 * hour, which the schedule leaves unnamed, keeps the early-morning scene
 * rather than falling through to a default.
 */
export function homePeriodForHour(hour: number): HomePeriod {
	if (hour >= 18) {
		return 'evening'
	}
	if (hour >= 16) {
		return 'lateAfternoon'
	}
	if (hour >= 13) {
		return 'afternoon'
	}
	// Lunch is the one short period: the hour of noon and nothing either side.
	if (hour === 12) {
		return 'lunch'
	}
	if (hour >= 6) {
		return 'morning'
	}
	return 'earlyMorning'
}

/**
 * Per-theme home plates. Same contract as `themeArt`: override what exists,
 * fall back to the cream scene for the rest.
 *
 * Note the home plates carry per-period fitting numbers in HOME_PLATE_FIT that
 * are tuned to THESE images. A theme supplying its own home art needs its own
 * fitting pass, or Lumo lands in the wrong place on the hill.
 */
const themeHomeArt: Partial<Record<ThemeId, Partial<Record<HomePeriod, ImageSourcePropType>>>> = {
	// forest: { morning: require('../assets/bg/forest/HomeMorning.webp') as ImageSourcePropType, ... },
}

export function homeBackgroundAsset(period: HomePeriod, themeId: ThemeId = 'cream'): ImageSourcePropType {
	return themeHomeArt[themeId]?.[period] ?? homeArt[period] ?? homeArt.morning
}

/**
 * The plate every screen falls back to.
 *
 * Single source of truth so a future theme picker can swap the app's backdrop
 * in one place, rather than per screen.
 */
export const DEFAULT_BACKGROUND: BackgroundVariant = 'today'

/**
 * Per-theme plate overrides.
 *
 * The eight plates above are the CREAM set — warm illustrations drawn for the
 * brand canvas. A theme may ship its own art for any subset of variants; what
 * it does not override falls back to the cream plate, so a half-finished set is
 * a partial improvement rather than a broken screen.
 *
 * Until a theme has art here, `themePlateOpacity` in constants/theme.ts is what
 * keeps the cream plates from clashing with a cooler canvas — that opacity step
 * is a stopgap, and a theme with a full set here can raise it back to 1.
 *
 * To add a set: drop the plates in assets/bg/<theme>/ and list them below.
 */
const themeArt: Partial<Record<ThemeId, Partial<Record<BackgroundVariant, ImageSourcePropType>>>> = {
	// forest: { today: require('../assets/bg/forest/02_today.webp') as ImageSourcePropType, ... },
}

export function backgroundAsset(variant: BackgroundVariant, themeId: ThemeId = 'cream'): ImageSourcePropType {
	return themeArt[themeId]?.[variant] ?? registry[variant] ?? art.onboarding
}

/** True once a theme brings its own plate for this variant — see `themeArt`. */
export function hasThemeArt(variant: BackgroundVariant, themeId: ThemeId): boolean {
	return Boolean(themeArt[themeId]?.[variant])
}

/** Variants still borrowing another screen's plate — art is outstanding. */
export const backgroundVariantsAwaitingArt: BackgroundVariant[] = (
	Object.keys(registry) as BackgroundVariant[]
).filter((variant) => !(variant in art))
