import React from 'react'
import { Animated, AppState, StyleSheet, View, useWindowDimensions } from 'react-native'
import {
	HOME_BACKGROUND_ASPECT,
	HOME_PLATE_FIT,
	homeBackgroundAsset,
	homePeriodForHour,
	type HomePeriod,
} from '@/constants/backgroundAssets'
import { useLumo } from '@/context/LumoContext'

/**
 * The home screen's full-bleed backdrop: Lumo's scene for the current time of
 * day, drawn behind the whole page.
 *
 * Sized to the plate's own 1:3 aspect at full screen width and anchored to the
 * TOP, so the sky and Lumo land in the header/greeting band. That makes the
 * plate roughly three screen-widths tall — taller than any phone — so the
 * bottom foliage crops off below the fold. The crop lands in the plate's flat
 * cream middle, where there is nothing to see, so it leaves no seam.
 *
 * Drawn at full strength in light mode — the plate IS the canvas here, and the
 * art is already pitched to be sat on. Dark mode is the one exception: the
 * plates are all warm cream, so at any real weight they would erase the navy
 * canvas the rest of the dark theme is built against.
 */
const PLATE_OPACITY = {
	light: 1,
	dark: 0.16,
} as const

/**
 * How far the page scrolls before the plate reaches its faded weight, and what
 * that weight is — the same treatment the group page's backdrop uses.
 *
 * Roughly the height of the greeting the plate sits behind: by the time Lumo
 * has scrolled away, the art has finished getting out of the cards' way. It
 * does not fade to nothing, because a backdrop that vanishes reads as a
 * loading glitch and leaves the lower page as flat canvas.
 */
const FADE_DISTANCE = 300
const FADED_OPACITY = 0.3

/**
 * Preview override — pins the home screen to one time of day so a plate can be
 * looked at without waiting for the clock to reach it.
 *
 * `null` follows the real hour, which is how this ships. Kept as a single
 * constant rather than a setting precisely so it is obvious when it is not
 * null: pinned, the home screen would show one scene forever.
 */
const FORCED_PERIOD: HomePeriod | null = null

export function HomeBackground({ period, scrollY }: { period: HomePeriod; scrollY?: Animated.Value }) {
	const { isDark } = useLumo()
	const { width } = useWindowDimensions()
	const fit = HOME_PLATE_FIT[period]
	const plateWidth = width * fit.scale
	const plateHeight = plateWidth / HOME_BACKGROUND_ASPECT
	const restOpacity = isDark ? PLATE_OPACITY.dark : PLATE_OPACITY.light
	// Scaled FROM the resting weight rather than toward a fixed number, so dark
	// mode — already at 0.16 — recedes by the same proportion instead of getting
	// brighter on the way down.
	const opacity = scrollY
		? scrollY.interpolate({
				inputRange: [0, FADE_DISTANCE],
				outputRange: [restOpacity, restOpacity * FADED_OPACITY],
				extrapolate: 'clamp',
			})
		: restOpacity

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents='none'>
			<Animated.Image
				source={homeBackgroundAsset(period)}
				style={{
					position: 'absolute',
					top: -plateHeight * fit.shiftY,
					left: 0,
					width: plateWidth,
					height: plateHeight,
					opacity,
				}}
				resizeMode='cover'
			/>
		</View>
	)
}

/**
 * How far down the screen Lumo's scene reaches, in points — what the home
 * screen's greeting block reserves so the first card clears the art.
 *
 * Takes the period because a plate that is overscaled sideways is taller too,
 * which moves its scene down the screen.
 */
export function homeSceneBottom(width: number, period: HomePeriod) {
	const fit = HOME_PLATE_FIT[period]
	const plateHeight = (width * fit.scale) / HOME_BACKGROUND_ASPECT

	return plateHeight * (fit.sceneBottom - fit.shiftY)
}

/**
 * The time of day the home screen is currently showing.
 *
 * Owned by the screen rather than by the backdrop, because the greeting's
 * tagline is written per period too — read from two places they would drift
 * apart across a boundary, and the words would end up describing a scene that
 * is no longer on screen.
 *
 * A phone left open across a boundary, or overnight, catches up when it comes
 * back to the foreground. No ticking interval: nothing here is worth one, and
 * a period change nobody is watching does not need to be instant.
 */
export function useHomePeriod(): HomePeriod {
	const [period, setPeriod] = React.useState<HomePeriod>(() => homePeriodForHour(new Date().getHours()))

	React.useEffect(() => {
		const subscription = AppState.addEventListener('change', (state) => {
			if (state === 'active') {
				setPeriod(homePeriodForHour(new Date().getHours()))
			}
		})

		return () => subscription.remove()
	}, [])

	// The override wins here rather than inside the backdrop, so the greeting's
	// tagline moves with the plate — previewing a scene against the wrong words
	// would be worse than not previewing it.
	return FORCED_PERIOD ?? period
}
