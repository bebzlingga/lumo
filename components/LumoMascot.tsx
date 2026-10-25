import { useLumo } from '@/context/LumoContext'
import React from 'react'
import { AccessibilityInfo, Animated, Easing, Image, StyleProp, ViewStyle } from 'react-native'
import { mascotAspect, mascotAsset, mascotSizes, type MascotMood, type MascotSize } from '@/constants/mascotAssets'

/**
 * The LUMO mascot — a glowing spark in a navy hoodie.
 *
 * Art comes from the central registry (`constants/mascotAssets.ts`), never a
 * direct require, so screens stay stable as the illustration set grows.
 *
 * `animated` adds a slow idle float. It respects the OS reduce-motion setting.
 */
export function LumoMascot({
	mood = 'happy',
	size = 'md',
	width,
	animated = false,
	style,
	accessibilityLabel,
}: {
	mood?: MascotMood
	size?: MascotSize
	/** Explicit width in px; overrides the `size` step when provided. */
	width?: number
	animated?: boolean
	style?: StyleProp<ViewStyle>
	/** Defaults to decorative (hidden from screen readers). */
	accessibilityLabel?: string
}) {
	const { settings } = useLumo()
	const renderWidth = width ?? mascotSizes[size]
	// Height follows THIS mood's artwork, not a shared constant — poses are
	// exported at different orientations.
	const renderHeight = Math.round(renderWidth / mascotAspect(mood))
	const float = React.useRef(new Animated.Value(0)).current
	const [reduceMotion, setReduceMotion] = React.useState(false)

	React.useEffect(() => {
		let active = true
		AccessibilityInfo.isReduceMotionEnabled()
			.then((enabled) => {
				if (active) {
					setReduceMotion(enabled)
				}
			})
			.catch(() => undefined)
		const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
		return () => {
			active = false
			subscription.remove()
		}
	}, [])

	React.useEffect(() => {
		if (!animated || reduceMotion) {
			float.stopAnimation()
			float.setValue(0)
			return
		}

		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(float, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
				Animated.timing(float, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
			]),
		)
		loop.start()
		return () => loop.stop()
	}, [animated, reduceMotion, float])

	const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] })

	// Minimal mode (Settings): no mascot. After every hook, so flipping it never changes the hook order.
	if (settings.minimalMode) return null
	return (
		<Animated.View style={[{ transform: [{ translateY }] }, style]} pointerEvents='none'>
			<Image
				source={mascotAsset(mood)}
				style={{ width: renderWidth, height: renderHeight }}
				resizeMode='contain'
				accessible={Boolean(accessibilityLabel)}
				accessibilityRole={accessibilityLabel ? 'image' : undefined}
				accessibilityLabel={accessibilityLabel}
				accessibilityElementsHidden={!accessibilityLabel}
				importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
			/>
		</Animated.View>
	)
}
