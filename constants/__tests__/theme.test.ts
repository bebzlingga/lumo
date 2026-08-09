import { contrastRatio } from '../../lib/color'
import {
	DEFAULT_THEME_ID,
	THEME_IDS,
	THEMES,
	darkPalette,
	getPalette,
	lightPalette,
	normalizeThemeId,
	themePlateOpacity,
	type LumoPalette,
	type ThemeId,
} from '../theme'

/**
 * Contrast floors every theme has to clear, in both modes.
 *
 * These are not aspirational — each is set at or below what the shipped cream
 * palette already measures, so the rule is "no theme is less readable than the
 * one we launched with". The measured cream values are noted per row; if a
 * change here starts failing, the palette moved, not the standard.
 */
const FLOORS: { fg: keyof LumoPalette; bg: keyof LumoPalette; min: number; why: string }[] = [
	// Body text. Cream measures 11.13 light / 16.87 dark, so 7 (WCAG AAA) is a
	// floor with room to spare.
	{ fg: 'ink', bg: 'canvas', min: 7, why: 'body text on the page' },
	{ fg: 'ink', bg: 'card', min: 7, why: 'body text on a card' },
	{ fg: 'ink', bg: 'surface', min: 7, why: 'body text on a recessed surface' },
	// `body` is the softer copy tone. Cream dark measures 9.58 — the tightest of
	// the four — so this stays at AAA too.
	{ fg: 'body', bg: 'card', min: 7, why: 'secondary copy on a card' },
	// Supporting text: AA for small text. Cream measures 5.47 light.
	{ fg: 'subtle', bg: 'canvas', min: 4.5, why: 'supporting text' },
	// `muted` is placeholder/decorative weight, never load-bearing copy. Cream
	// light measures 2.82, so holding it to 4.5 would fail the palette we ship.
	{ fg: 'muted', bg: 'canvas', min: 2.5, why: 'placeholder text' },
	// A label sitting on the accent fill. Cream measures 6.74 in both modes.
	{ fg: 'onAccent', bg: 'accent', min: 4.5, why: 'label on an accent fill' },
	// Non-text UI (3:1). Cream light measures 3.40 — the tightest pair in the
	// whole system, and the reason this floor is 3 rather than 4.5.
	{ fg: 'greenDark', bg: 'greenSoft', min: 3, why: 'glyph on a soft green chip' },
]

/**
 * One case per theme × mode × pair, so a failure names itself — "ocean dark:
 * subtle on canvas" beats "expected 4.2 to be >= 4.5" from an anonymous loop.
 */
const CASES = THEME_IDS.flatMap((themeId) =>
	[false, true].flatMap((isDark) =>
		FLOORS.map(({ fg, bg, min, why }) => ({
			name: `${themeId} ${isDark ? 'dark' : 'light'}: ${fg} on ${bg} (${why})`,
			themeId,
			isDark,
			fg,
			bg,
			min,
		}))
	)
)

describe('theme palettes', () => {
	it.each(CASES)('$name clears its contrast floor', ({ themeId, isDark, fg, bg, min }) => {
		const palette = getPalette(themeId, isDark)

		expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(min)
	})

	it('gives every theme all the tokens, with no empty values', () => {
		const tokens = Object.keys(lightPalette) as (keyof LumoPalette)[]

		for (const themeId of THEME_IDS) {
			for (const isDark of [false, true]) {
				const palette = getPalette(themeId, isDark)

				for (const token of tokens) {
					expect(palette[token]).toMatch(/^#[0-9A-Fa-f]{6}$/)
				}
			}
		}
	})

	// The whole migration rests on this: an install that never opens the picker
	// has to render exactly as it did before themes existed.
	it('leaves the default theme identical to the original palettes', () => {
		expect(DEFAULT_THEME_ID).toBe('cream')
		expect(getPalette('cream', false)).toBe(lightPalette)
		expect(getPalette('cream', true)).toBe(darkPalette)
	})

	it('falls back to cream rather than crashing on an unknown theme', () => {
		expect(normalizeThemeId('forest')).toBe('forest')
		expect(normalizeThemeId('a-theme-from-a-later-build')).toBe('cream')
		expect(normalizeThemeId(undefined)).toBe('cream')
		expect(normalizeThemeId(null)).toBe('cream')
		expect(normalizeThemeId(7)).toBe('cream')

		// An unknown id must still resolve to a usable palette, since this is the
		// path a downgraded install takes.
		expect(getPalette('nope' as ThemeId, false)).toBe(lightPalette)
	})

	it('keeps plate opacity within a range that still shows the art', () => {
		for (const themeId of THEME_IDS) {
			for (const isDark of [false, true]) {
				const opacity = themePlateOpacity(themeId, isDark)

				// A plate faded past ~0.5 stops reading as art and starts reading as
				// a smudge; above 1 is meaningless.
				expect(opacity).toBeGreaterThanOrEqual(0.5)
				expect(opacity).toBeLessThanOrEqual(1)
			}
		}

		// Cream's plates were drawn for cream, so they never recede.
		expect(themePlateOpacity('cream', false)).toBe(1)
		expect(themePlateOpacity('cream', true)).toBe(1)
	})

	it('gives every theme a label and a three-colour swatch', () => {
		for (const themeId of THEME_IDS) {
			const theme = THEMES[themeId]

			expect(theme.label.length).toBeGreaterThan(0)
			expect(theme.swatch).toHaveLength(3)
			// Swatches must be distinguishable, or the picker shows four identical chips.
			expect(new Set(theme.swatch).size).toBe(3)
		}

		// Two themes sharing a label would be unpickable.
		const labels = THEME_IDS.map((id) => THEMES[id].label)
		expect(new Set(labels).size).toBe(labels.length)
	})
})
