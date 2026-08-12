import React from 'react'
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { brand, fontFamilies, radius, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import { alpha } from '@/lib/color'
import { AppText } from './ui'
import { Icon, type IconName } from './Icon'
import { FireIcon } from './FireIcon'
import { Pressable } from '@/components/Pressable'

/**
 * Shared controls that were previously re-implemented per screen. Each reads
 * from the active palette so light/dark and the brand accent stay consistent.
 */

/** Slim determinate progress bar (0–1). */
export function ProgressBar({
	value,
	trackColor,
	fillColor,
	height = 8,
	style,
	accessibilityLabel,
}: {
	value: number
	trackColor?: string
	fillColor?: string
	height?: number
	style?: StyleProp<ViewStyle>
	accessibilityLabel?: string
}) {
	const { palette } = useLumo()
	const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
	const percent = Math.round(clamped * 100)

	return (
		<View
			accessibilityRole='progressbar'
			accessibilityLabel={accessibilityLabel}
			accessibilityValue={{ min: 0, max: 100, now: percent }}
			style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor ?? palette.chartTrack }, style]}
		>
			<View
				style={{
					width: `${percent}%`,
					height: '100%',
					borderRadius: height / 2,
					backgroundColor: fillColor ?? palette.greenDark,
				}}
			/>
		</View>
	)
}

/**
 * Streak flame + day count. Only meaningful once a streak reaches 3 days —
 * callers decide, but `minimum` keeps that rule in one place.
 */
export function StreakBadge({
	days,
	minimum = 3,
	size = 'md',
}: {
	days: number
	minimum?: number
	size?: 'sm' | 'md'
}) {
	const { palette } = useLumo()

	if (days < minimum) {
		return null
	}

	const small = size === 'sm'

	return (
		<View
			accessibilityLabel={`${days} day streak`}
			style={[styles.streak, { backgroundColor: palette.glowSoft, paddingHorizontal: small ? spacing.xs : spacing.sm }]}
		>
			<FireIcon size={small ? 11 : 14} />
			<AppText variant='caption' color={palette.ink} style={[styles.streakText, small && styles.streakTextSmall]}>
				{days}d
			</AppText>
		</View>
	)
}

/** Overlapping avatar row with an optional "+N" overflow chip. */
export function AvatarStack({
	children,
	max = 4,
	overflow,
	size = 32,
}: {
	children: React.ReactNode
	max?: number
	/** Explicit overflow count; defaults to however many children exceed `max`. */
	overflow?: number
	size?: number
}) {
	const { palette } = useLumo()
	const items = React.Children.toArray(children)
	const shown = items.slice(0, max)
	const extra = overflow ?? Math.max(0, items.length - max)

	return (
		<View style={styles.stack}>
			{shown.map((child, index) => (
				<View
					key={index}
					style={[
						styles.stackItem,
						{
							width: size,
							height: size,
							borderRadius: size / 2,
							borderColor: palette.card,
							marginLeft: index === 0 ? 0 : -size * 0.3,
							zIndex: shown.length - index,
						},
					]}
				>
					{child}
				</View>
			))}
			{extra > 0 ? (
				<View
					style={[
						styles.stackItem,
						styles.stackOverflow,
						{
							width: size,
							height: size,
							borderRadius: size / 2,
							borderColor: palette.card,
							backgroundColor: palette.greenSoft,
							marginLeft: -size * 0.3,
						},
					]}
				>
					<AppText variant='caption' color={palette.greenDark} style={styles.stackOverflowText}>
						+{extra}
					</AppText>
				</View>
			) : null}
		</View>
	)
}

/** Generic segmented control — replaces the per-screen tab copies. */
export function SegmentedControl<T extends string>({
	options,
	value,
	onChange,
	style,
}: {
	/** Give an option an `icon` and it draws the glyph instead of the label —
	 *  the label is still what a screen reader announces, so an icon-only
	 *  control is never nameless. */
	options: { label: string; value: T; icon?: IconName }[]
	value: T
	onChange: (value: T) => void
	style?: StyleProp<ViewStyle>
}) {
	const { palette } = useLumo()

	return (
		<View style={[styles.segmented, { backgroundColor: palette.surface, borderColor: palette.hairline }, style]}>
			{options.map((option) => {
				const selected = option.value === value

				return (
					<Pressable
						key={option.value}
						accessibilityRole='tab'
						accessibilityState={{ selected }}
						accessibilityLabel={option.label}
						onPress={() => onChange(option.value)}
						style={({ pressed }) => [
							styles.segment,
							selected && { backgroundColor: palette.card },
							{ opacity: pressed && !selected ? 0.7 : 1 },
						]}
					>
						{option.icon ? (
							<Icon name={option.icon} size={20} color={selected ? palette.ink : palette.subtle} weight='bulk' />
						) : (
							<AppText
								variant='caption'
								color={selected ? palette.ink : palette.subtle}
								numberOfLines={1}
								style={selected ? styles.segmentTextActive : styles.segmentText}
							>
								{option.label}
							</AppText>
						)}
					</Pressable>
				)
			})}
		</View>
	)
}

/**
 * A button wearing the SegmentedControl's clothes: the same recessed track with
 * one raised segment inside it. For an action that sits BESIDE a real segmented
 * control and has to line up with it exactly — the avatar editor's shuffle next
 * to its category tabs, matching how the Habits filter row splits "Active" off
 * from "Paused / Completed".
 *
 * It shares `segmented` and `segment` with the control above rather than
 * restating them, so the two tracks can never drift apart.
 */
export function SegmentedButton({
	icon,
	label,
	onPress,
	style,
}: {
	icon: IconName
	label: string
	onPress: () => void
	style?: StyleProp<ViewStyle>
}) {
	const { palette } = useLumo()

	return (
		<View style={[styles.segmented, { backgroundColor: palette.surface, borderColor: palette.hairline }, style]}>
			<Pressable
				accessibilityRole='button'
				accessibilityLabel={label}
				onPress={onPress}
				style={({ pressed }) => [styles.segment, { backgroundColor: palette.card, opacity: pressed ? 0.7 : 1 }]}
			>
				<Icon name={icon} size={20} color={palette.ink} weight='bulk' />
			</Pressable>
		</View>
	)
}

/** Themed on/off switch with an animated thumb. */
export function Toggle({
	value,
	onValueChange,
	accessibilityLabel,
	disabled = false,
	onColor,
	offColor,
}: {
	value: boolean
	onValueChange: (next: boolean) => void
	accessibilityLabel: string
	disabled?: boolean
	/** Overrides for screens that run a fixed palette (e.g. onboarding). */
	onColor?: string
	offColor?: string
}) {
	const { palette, isDark } = useLumo()
	const progress = React.useRef(new Animated.Value(value ? 1 : 0)).current

	React.useEffect(() => {
		Animated.timing(progress, {
			toValue: value ? 1 : 0,
			duration: 160,
			easing: Easing.out(Easing.quad),
			useNativeDriver: true,
		}).start()
	}, [value, progress])

	const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 18] })
	const offTrack = offColor ?? (isDark ? alpha(palette.subtle, '2E') : palette.chartTrack)

	return (
		<Pressable
			accessibilityRole='switch'
			accessibilityState={{ checked: value, disabled }}
			accessibilityLabel={accessibilityLabel}
			disabled={disabled}
			onPress={() => onValueChange(!value)}
			hitSlop={8}
			style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.76 : 1 }]}
		>
			{/* Same fill as a primary button — sage-strong at 80% — so an "on"
			    switch and a CTA read as the same green. */}
			<View style={[styles.toggleTrack, { backgroundColor: value ? onColor ?? alpha(brand.sageStrong, "CC") : offTrack }]}>
				<Animated.View style={[styles.toggleThumb, { transform: [{ translateX }] }]} />
			</View>
		</Pressable>
	)
}

const styles = StyleSheet.create({
	track: {
		width: '100%',
		overflow: 'hidden',
	},
	streak: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 3,
		paddingVertical: 2,
		borderRadius: radius.pill,
	},
	streakText: {
		fontFamily: fontFamilies.lexendSemiBold,
	},
	streakTextSmall: {
		fontSize: 11,
	},
	stack: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	stackItem: {
		borderWidth: 2,
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
	},
	stackOverflow: {
		alignItems: 'center',
		justifyContent: 'center',
	},
	stackOverflowText: {
		fontFamily: fontFamilies.lexendSemiBold,
		fontSize: 11,
	},
	// Fully rounded, track and segments alike. A pill is what a switch between
	// two or three views looks like everywhere else; at a card radius this read
	// as a small panel that happened to have buttons in it.
	segmented: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: radius.pill,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 4,
		gap: 4,
	},
	segment: {
		flex: 1,
		minHeight: 36,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: radius.pill,
		paddingHorizontal: spacing.xs,
	},
	segmentText: {
		fontFamily: fontFamilies.lexendMedium,
		fontSize: 14,
		lineHeight: 18,
	},
	segmentTextActive: {
		fontFamily: fontFamilies.lexendSemiBold,
		fontSize: 14,
		lineHeight: 18,
	},
	toggleTrack: {
		width: 44,
		height: 26,
		borderRadius: radius.pill,
		padding: 3,
		justifyContent: 'center',
	},
	toggleThumb: {
		width: 20,
		height: 20,
		borderRadius: radius.pill,
		backgroundColor: '#FFFFFF',
	},
})
