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
export type HomePeriod = 'earlyMorning' | 'morning' | 'lunch' | 'afternoon' | 'evening'

/** Every home plate is exported at 724 × 2172 — a much taller 1:3 frame. */
export const HOME_BACKGROUND_ASPECT = 724 / 2172

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

export const HOME_PLATE_FIT: Record<HomePeriod, HomePlateFit> = {
	// The reference. Lumo's head lands ~116pt down the screen, his cushion
	// ~331pt, and the first card ~290pt — crossing the cushion by about 40pt.
	earlyMorning: { scale: 1.1, shiftY: 0.075, sceneBottom: 0.3 },
	// Fitted to the above: `shiftY` holds this pose's head at the same y as the
	// reference's and `sceneBottom` holds the first card at the same y, so only
	// `scale` is really being chosen here.
	//
	// It is a compromise, and worth knowing which way. This Lumo carries a
	// lunchbox out to his side, so he reaches further in from the left than the
	// sitting pose — 0.495 of the plate against 0.562. Scaling until the two
	// leading edges line up takes 1.25, which renders him 12% larger than the
	// reference and buries his feet behind the first card. 1.16 splits the
	// difference: he lands ~17pt short of the reference's edge and only ~4%
	// oversized.
	morning: { scale: 1.16, shiftY: 0.047, sceneBottom: 0.26 },
	// Sitting cross-legged with a book, so the framing is close to the
	// reference's and the fit comes out clean: matching his rendered height
	// lands his head, his base and the first card all within a point or two of
	// the early-morning plate's. He reaches to 0.525 of the plate against the
	// reference's 0.562, so his leading edge still sits ~10pt further left.
	lunch: { scale: 1.13, shiftY: 0.072, sceneBottom: 0.291 },
	// Sitting with a laptop. The pull here is between two scales: 1.07 matches
	// his rendered height, 1.20 matches the leading edge, and 1.13 splits them
	// — ~6% oversized with his edge ~14pt short of the reference's.
	//
	// Note WHAT the leading edge is on this one. It is the laptop, not Lumo:
	// a flat grey lid, the only thing across the five plates that the greeting
	// could overlap onto that is neither cream nor open sky. If a tagline line
	// ever reaches it, that is the plate it will show on first.
	afternoon: { scale: 1.13, shiftY: 0.062, sceneBottom: 0.281 },
	// Sitting with a book. The odd one out: the art is 887x1774 against the
	// other four's 724x2172, so `cover` scales it to the box's height and crops
	// ~17% off each side. Do NOT "fix" the aspect — rendering it at its true 1:2
	// would shrink Lumo by a third, and all three numbers here would need
	// refitting.
	//
	// `sceneBottom` is the one that matters, and it is fitted to the SAME rule
	// as the other four rather than to this plate's own art: every plate lands
	// the first card at 290pt on a 390pt screen (319pt at 430). Left at a round
	// 0.3 this one put the card at 361pt, which is the gap under the greeting.
	//
	// `shiftY` drops from 0.02 to 0.01 so Lumo's head lands at 124pt, matching
	// morning's exactly.
	//
	// `scale` stays at 1, and that is a compromise worth knowing. This Lumo is
	// framed smaller in a wider plate, so he renders 218pt tall against
	// morning's 254pt. Matching that height takes scale 1.165 — which puts his
	// right edge 83pt past the screen and cuts the plant and table off
	// entirely. Being 14% short is the better of the two.
	evening: { scale: 1, shiftY: 0.01, sceneBottom: 0.257 },
}

const homeArt: Record<HomePeriod, ImageSourcePropType> = {
	earlyMorning: require('../assets/bg/HomeEarlyMorning.webp') as ImageSourcePropType,
	morning: require('../assets/bg/HomeMorning.webp') as ImageSourcePropType,
	lunch: require('../assets/bg/HomeLunch.webp') as ImageSourcePropType,
	afternoon: require('../assets/bg/HomeAfternoon.webp') as ImageSourcePropType,
	evening: require('../assets/bg/HomeEvening.webp') as ImageSourcePropType,
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
	if (hour >= 15) {
		return 'afternoon'
	}
	if (hour >= 12) {
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
