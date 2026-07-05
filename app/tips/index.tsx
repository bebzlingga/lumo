import { Href, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Icon } from '@/components/Icon'
import { ScreenHeader } from '@/components/ScreenHeader'
import { AppText, Screen } from '@/components/ui'
import { fontFamilies, radius, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import { TIP_SECTIONS, TipSection } from '@/lib/tips'

// NativeWind's css-interop drops function-valued `style` props on Pressable
// (it spreads the function into `{}`), so pressed state is tracked manually
// and the style is passed as a plain array.
function TipCard({ section, onPress }: { section: TipSection; onPress: () => void }) {
	const { palette, isDark } = useLumo()
	const [pressed, setPressed] = useState(false)

	return (
		<Pressable
			accessibilityRole='button'
			accessibilityLabel={`${section.title}. ${section.focus}`}
			onPress={onPress}
			onPressIn={() => setPressed(true)}
			onPressOut={() => setPressed(false)}
			style={[
				styles.card,
				{
					backgroundColor: palette.card,
					shadowColor: isDark ? 'transparent' : palette.shadow,
					opacity: pressed ? 0.85 : 1,
				},
			]}
		>
			<Icon
				name={section.icon}
				size={22}
				color={palette.greenDark}
				weight='bulk'
			/>
			<View style={styles.cardText}>
				<AppText
					variant='titleSmall'
					color={palette.ink}
					style={styles.cardTitle}
				>
					{section.title}
				</AppText>
				<AppText
					variant='bodySmall'
					color={palette.subtle}
					numberOfLines={1}
					style={styles.cardFocus}
				>
					{section.focus}
				</AppText>
			</View>
			<Icon
				name='forward'
				size={17}
				color={palette.subtle}
				weight='bulk'
			/>
		</Pressable>
	)
}

export default function TipsScreen() {
	const router = useRouter()
	const { palette } = useLumo()

	return (
		<Screen contentStyle={styles.content}>
			<ScreenHeader leftAction={{ icon: 'back', label: 'Back', onPress: () => router.back() }} />

			<View style={styles.intro}>
				<AppText
					variant='displaySmall'
					color={palette.ink}
					style={styles.title}
				>
					Your Habit Journey
				</AppText>
				<AppText
					variant='bodySmall'
					color={palette.subtle}
					style={styles.dek}
				>
					Decades of habit science, distilled into a single path. We've gathered the most proven ideas from the books people trust most — <AppText style={styles.bookTitle}>Atomic Habits</AppText>,{' '}
					<AppText style={styles.bookTitle}>The Power of Habit</AppText>, <AppText style={styles.bookTitle}>Tiny Habits</AppText>, <AppText style={styles.bookTitle}>Better Than Before</AppText> and{' '}
					<AppText style={styles.bookTitle}>The Willpower Instinct</AppText> — and shaped them into five short chapters that build on one another.{'\n\n'}Whether you're forming your very first routine
					or making one stick for good, start with the part that matches where you are today. Each takes just a few minutes to read.
				</AppText>
			</View>

			<View style={styles.cards}>
				{TIP_SECTIONS.map((section) => (
					<TipCard
						key={section.slug}
						section={section}
						onPress={() => router.push(`/tips/${section.slug}` as Href)}
					/>
				))}
			</View>
		</Screen>
	)
}

const styles = StyleSheet.create({
	content: {
		paddingBottom: spacing.xxl,
	},
	intro: {
		marginTop: -spacing.xs,
		marginBottom: spacing.lg,
	},
	title: {
		fontFamily: 'Lexend-Black',
		fontSize: 54,
		lineHeight: 58,
	},
	dek: {
		fontFamily: 'Lexend-Regular',
		fontSize: 15,
		lineHeight: 22,
		marginTop: spacing.xs + 10,
	},
	bookTitle: {
		fontFamily: fontFamilies.lexendSemiBold,
		fontStyle: 'italic',
	},
	cards: {
		gap: spacing.sm,
	},
	card: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.md,
		padding: spacing.lg,
		borderRadius: radius.nav,
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.05,
		shadowRadius: 10,
		elevation: 2,
	},
	cardText: {
		flex: 1,
		minWidth: 0,
		gap: 1,
	},
	cardTitle: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 15,
		lineHeight: 20,
	},
	cardFocus: {
		fontFamily: 'Lexend-Regular',
		lineHeight: 18,
	},
})
