import React from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import { brand, fontFamilies } from '@/constants/theme'

/**
 * The LUMO wordmark — plain text in Lexend Black (900).
 *
 * Deliberately NOT an SVG. The O used to be a hand-drawn ring cradling a
 * sparkle, which never matched the surrounding letterforms: a geometric circle
 * reads smaller than flat-topped caps unless it overshoots the cap line, and
 * the stroke weight had to be re-tuned at every size. Real type stays
 * consistent for free and scales correctly.
 *
 * Uses a plain RN <Text> rather than AppText on purpose: colour and size are
 * always passed explicitly, and staying free of useLumo() lets the wordmark
 * render outside LumoProvider (e.g. on the splash screen).
 */
export function LumoWordmark({
	size = 34,
	color = brand.navy,
	style,
}: {
	size?: number
	color?: string
	style?: StyleProp<TextStyle>
}) {
	return (
		<Text
			maxFontSizeMultiplier={1}
			style={[
				{
					fontFamily: fontFamilies.lexendBlack,
					fontSize: size,
					lineHeight: size * 1.2,
					color,
					letterSpacing: size * 0.02,
				},
				style,
			]}
		>
			LUMO
		</Text>
	)
}
