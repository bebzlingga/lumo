import { contrastRatio, readableOn } from '../../lib/color'
import { habitColorOption, lightPalette, darkPalette } from '../theme'
import { DEFAULT_ACTIVITY, FOCUS_ACTIVITIES, activityAccent, focusActivity, normalizeActivity } from '../focusActivities'

/**
 * The Focus screen wears the selected activity's colour: the dial arc, the
 * Start button, the selected chips. That only works if every swatch can be
 * walked into something a white label sits on — `brand.gold` raw is about 1.9:1
 * under white and unreadable — so this is the guard on adding a new activity.
 */
describe('focus activities', () => {
	it.each(FOCUS_ACTIVITIES)('$label carries white text once walked to a fill', (activity) => {
		for (const isDark of [false, true]) {
			const fill = readableOn(activityAccent(activity, isDark), lightPalette.white, 4.5)

			expect(contrastRatio(fill, lightPalette.white)).toBeGreaterThanOrEqual(4.5)
		}
	})

	// Asserts what the screen actually draws: the habit accent WALKED to 3:1
	// against the card. The raw accents do not clear it on their own — orange,
	// amber and coral all land near 2:1 on the light card, and the deep violet
	// near 2:2 on the dark one — which is why the walk is not optional.
	it.each(FOCUS_ACTIVITIES)('$label stays legible as a glyph on a card, light and dark', (activity) => {
		for (const [palette, isDark] of [
			[lightPalette, false],
			[darkPalette, true],
		] as const) {
			const glyph = readableOn(activityAccent(activity, isDark), palette.card, 3)

			expect(contrastRatio(glyph, palette.card)).toBeGreaterThanOrEqual(3)
		}
	})

	it('draws every colour from the habit palette', () => {
		for (const activity of FOCUS_ACTIVITIES) {
			expect(habitColorOption(activity.color)).toBeDefined()
		}
	})

	it('has unique ids and labels', () => {
		const ids = FOCUS_ACTIVITIES.map((activity) => activity.id)
		const labels = FOCUS_ACTIVITIES.map((activity) => activity.label)

		expect(new Set(ids).size).toBe(ids.length)
		expect(new Set(labels).size).toBe(labels.length)
	})

	// A blob written by a build with an activity this one no longer has must
	// still open, and `other` must stay last since it is the fallback rather
	// than a choice.
	it('falls back to a real activity', () => {
		expect(normalizeActivity('writing')).toBe('writing')
		expect(normalizeActivity('napping')).toBe(DEFAULT_ACTIVITY)
		expect(normalizeActivity(undefined)).toBe(DEFAULT_ACTIVITY)
		expect(focusActivity('nope' as never)).toBe(FOCUS_ACTIVITIES[0])
		expect(FOCUS_ACTIVITIES[FOCUS_ACTIVITIES.length - 1].id).toBe('other')
	})
})
