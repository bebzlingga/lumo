import React from 'react'
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { BACKGROUND_ASPECT, backgroundAsset, type BackgroundVariant } from '@/constants/backgroundAssets'
import { useLumo } from '@/context/LumoContext'

/**
 * Pastel landscape backdrop, matching the treatment used through onboarding.
 *
 * The plate is sized to its own aspect ratio at full screen width and anchored
 * to the BOTTOM, so the hills and foliage always stay in frame and any overflow
 * crops off the (empty) sky instead of squashing the art. It is then held well
 * back so content always wins.
 *
 * Render behind content, inside a container that fills the screen:
 *   <View style={StyleSheet.absoluteFill}><LumoBackground variant="today" /></View>
 */
const INTENSITY_OPACITY = {
	/**
	 * App default — a warm hint of landscape behind content.
	 *
	 * Raised from 0.14 once home moved to its own full-strength plate: at the
	 * old weight the landscape was so far washed out that every screen past
	 * home read as flat cream, and the backdrop was doing nothing but costing
	 * a draw.
	 */
	subtle: 0.24,
	/** More present; for screens with lighter content. */
	medium: 0.26,
	/** Hero treatment for intro/splash-style screens. */
	full: 0.6,
	/**
	 * The plate at nearly full strength — the artwork IS the background rather
	 * than a wash behind it. For screens built around their scene (the group
	 * challenges pair). Content on top has to sit on an opaque card; anything
	 * placed straight on the canvas will struggle at this weight.
	 */
	deep: 0.92,
} as const

export type BackgroundIntensity = keyof typeof INTENSITY_OPACITY

export function LumoBackground({
	variant,
	intensity = 'subtle',
}: {
	variant: BackgroundVariant
	intensity?: BackgroundIntensity
}) {
	const { isDark, palette } = useLumo()
	const { width } = useWindowDimensions()
	// Dark mode: the plates are pastel-light, so they're dimmed hard to keep the
	// deep-navy canvas dominant.
	const opacity = INTENSITY_OPACITY[intensity] * (isDark ? 0.35 : 1)
	const plateHeight = width / BACKGROUND_ASPECT

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents='none'>
			<Image
				source={backgroundAsset(variant)}
				style={{
					position: 'absolute',
					bottom: 0,
					width,
					height: plateHeight,
					opacity,
				}}
				resizeMode='cover'
			/>
			{/* The hills and foliage sit at the BOTTOM of every plate, so that edge
			    is the densest part of the art. This washes it back into the canvas
			    so the lower third of a screen stays as light as the top. */}
			<Svg
				width={width}
				height={plateHeight * 0.55}
				style={{ position: 'absolute', bottom: 0 }}
			>
				<Defs>
					<LinearGradient id='lumoBgFade' x1='0' y1='0' x2='0' y2='1'>
						<Stop offset='0' stopColor={palette.canvas} stopOpacity='0' />
						<Stop offset='0.55' stopColor={palette.canvas} stopOpacity='0.55' />
						<Stop offset='1' stopColor={palette.canvas} stopOpacity='0.92' />
					</LinearGradient>
				</Defs>
				<Rect x='0' y='0' width={width} height={plateHeight * 0.55} fill='url(#lumoBgFade)' />
			</Svg>
		</View>
	)
}
