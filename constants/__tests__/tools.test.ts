import { contrastRatio, readableOn } from '../../lib/color'
import { lightPalette, darkPalette } from '../theme'
import { TOOLS } from '../tools'

/**
 * A tool's accent is fixed per tool and does NOT follow the theme — it is
 * wayfinding, so the tile you reach for looks the same whichever theme is on.
 * That only works if the one swatch survives both, which is what this asserts.
 *
 * The same guard as `focusActivities.test.ts`, for the same reason: a raw
 * swatch under a white label is routinely around 2:1 and unreadable, so the
 * `readableOn` walk at the draw site is not optional. This is the test that
 * catches a new tool added with a colour that cannot be walked far enough.
 */
describe('tools', () => {
	it.each(TOOLS)('$name carries white text once walked to a fill', (tool) => {
		const fill = readableOn(tool.accent, lightPalette.white, 4.5)

		expect(contrastRatio(fill, lightPalette.white)).toBeGreaterThanOrEqual(4.5)
	})

	it.each(TOOLS)('$name stays legible as a glyph on a card, light and dark', (tool) => {
		for (const palette of [lightPalette, darkPalette]) {
			const glyph = readableOn(tool.accent, palette.card, 3)

			expect(contrastRatio(glyph, palette.card)).toBeGreaterThanOrEqual(3)
		}
	})

	// Slugs key nothing persisted today, but routes are what the tile pushes —
	// two tools sharing one would silently make a tile open the wrong screen.
	it('has unique slugs and routes', () => {
		const slugs = TOOLS.map((tool) => tool.slug)
		const routes = TOOLS.map((tool) => tool.route)

		expect(new Set(slugs).size).toBe(slugs.length)
		expect(new Set(routes).size).toBe(routes.length)
	})

	// Every route is absolute. A relative one resolves against whatever screen
	// the strip happens to be rendered on, which is Today now and need not be.
	it('points at absolute routes', () => {
		for (const tool of TOOLS) {
			expect(tool.route.startsWith('/')).toBe(true)
		}
	})
})
