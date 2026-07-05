import { useRouter } from 'expo-router'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AppState, FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import ConfettiCannon from 'react-native-confetti-cannon'
import { fontFamilies, layout, radius, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import { alpha } from '@/lib/color'
import { addDays, formatHeaderDateParts, parseDateKey, toDateKey } from '@/lib/date'
import { bestStreakAcrossHabits, isDoneOnDate, isScheduledOnDate } from '@/lib/habitMath'
import { Habit } from '@/types/habit'
import { Avatar } from '@/components/Avatar'
import { DailyProgressCard } from '@/components/DailyProgressCard'
import { Icon, IconName } from '@/components/Icon'
import { QuickDoneWidgets } from '@/components/QuickDoneWidgets'
import { AppText, LoadingState, Screen } from '@/components/ui'

type RecentProgress = {
	completeDays: number
	missedDays: number
	trackedDays: number
}

function progressForDay(habits: Habit[], dateKey: string): 'complete' | 'missed' | 'none' {
	const scheduledHabits = habits.filter((habit) => isScheduledOnDate(habit, dateKey))

	if (!scheduledHabits.length) {
		return 'none'
	}

	return scheduledHabits.every((habit) => isDoneOnDate(habit, dateKey)) ? 'complete' : 'missed'
}

function recentProgress(habits: Habit[], dateKey: string, todayKey: string): RecentProgress {
	const anchorKey = dateKey > todayKey ? todayKey : dateKey
	const anchorDate = parseDateKey(anchorKey)
	const progress: RecentProgress = {
		completeDays: 0,
		missedDays: 0,
		trackedDays: 0,
	}

	for (let index = 1; index <= 5; index += 1) {
		const previousKey = addDays(anchorKey, -index)
		const previousDate = parseDateKey(previousKey)

		if (previousDate.getMonth() !== anchorDate.getMonth() || previousDate.getFullYear() !== anchorDate.getFullYear()) {
			continue
		}

		const dayProgress = progressForDay(habits, previousKey)

		if (dayProgress === 'none') {
			continue
		}

		progress.trackedDays += 1

		if (dayProgress === 'complete') {
			progress.completeDays += 1
		} else {
			progress.missedDays += 1
		}
	}

	return progress
}

function monthlyHeaderMessage(dateKey: string, habits: Habit[], todayKey: string) {
	const date = parseDateKey(dateKey)
	const day = date.getDate()
	const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
	const daysLeft = lastDay - day
	const progress = recentProgress(habits, dateKey, todayKey)

	const recoveryMessages = [
		'Fresh start,\none habit today counts.',
		"Missed days happen,\nlet's show up today.",
		'Reset gently,\none habit gets you moving.',
		'A red day is not the end,\ntoday can turn green.',
		'Still in the game,\nchoose one habit now.',
		'Almost there,\nfinish with one win.',
	]

	const momentumMessages = [
		'Green days already,\nkeep the spark going.',
		'Nice rhythm,\nkeep stacking wins.',
		'Momentum is building,\nstay with it.',
		'Your habits are showing,\nkeep them glowing.',
		'Strong month,\nkeep protecting the streak.',
		'Almost there,\nbring it home.',
	]

	const neutralMessages = [
		'Fresh month,\nstart with one small win.',
		'Nice start,\nfind your rhythm today.',
		'Momentum can start here,\none habit at a time.',
		'Halfway energy,\nshow up for one habit.',
		"Keep stacking wins,\nyou're getting close.",
		'Almost there,\nfinish strong.',
	]

	const phaseIndex = daysLeft <= 4 ? 5 : Math.min(4, Math.floor((day - 1) / 5))

	if (progress.missedDays > 0) {
		return recoveryMessages[phaseIndex]
	}

	if (progress.completeDays > 0) {
		return momentumMessages[phaseIndex]
	}

	return neutralMessages[phaseIndex]
}

// Days available in the swipeable progress carousel. Only the past is reachable —
// today is the last (rightmost) card, so you can't swipe into the future.
const PAST_DAYS = 15
const FUTURE_DAYS = 0
const SCREEN_PADDING = spacing.lg
// Peek carousel: a sliver of the neighboring card shows on each side.
const CARD_GAP = 10
const CARD_PEEK = 12
const CARD_SIDE = CARD_GAP + CARD_PEEK

// NativeWind's css-interop drops function-valued `style` props on Pressable,
// so pressed state is tracked manually and the style is passed as a plain array.
function ResourceCard({ icon, label, description, onPress }: { icon: IconName; label: string; description: string; onPress: () => void }) {
	const { palette, isDark } = useLumo()
	const [pressed, setPressed] = useState(false)

	return (
		<Pressable
			accessibilityRole='button'
			accessibilityLabel={`${label}. ${description}`}
			onPress={onPress}
			onPressIn={() => setPressed(true)}
			onPressOut={() => setPressed(false)}
			style={[
				styles.resourceCard,
				{ backgroundColor: palette.card, shadowColor: palette.shadow, shadowOpacity: isDark ? 0.32 : 0.09, opacity: pressed ? 0.85 : 1 },
			]}
		>
			<Icon name={icon} size={22} color={palette.greenDark} weight='bulk' />
			<AppText variant='bodySmall' color={palette.ink} style={styles.resourceLabel}>
				{label}
			</AppText>
			<AppText variant='caption' color={palette.subtle} style={styles.resourceDescription}>
				{description}
			</AppText>
		</Pressable>
	)
}

export default function TodayScreen() {
	const router = useRouter()
	const { width } = useWindowDimensions()
	const { habits, isReady, nickname, palette, avatar } = useLumo()
	const todayKey = toDateKey()
	const [selectedDateKey, setSelectedDateKey] = useState(todayKey)
	const activeHabits = habits.filter((habit) => habit.status === 'active')
	const bestStreak = bestStreakAcrossHabits(habits)
	const selectedHabits = activeHabits.filter((habit) => isScheduledOnDate(habit, selectedDateKey))

	// Page-wide confetti when every habit for the selected day gets completed.
	// Only fires on the transition to all-done while staying on the same day —
	// swiping onto an already-completed day stays quiet. The cannon is only
	// mounted while firing; when idle it would otherwise render its pieces
	// statically at the origin.
	const [showConfetti, setShowConfetti] = useState(false)
	const allDone = selectedHabits.length > 0 && selectedHabits.every((habit) => isDoneOnDate(habit, selectedDateKey))
	const prevAllDoneRef = useRef({ dateKey: selectedDateKey, allDone })
	useEffect(() => {
		const previous = prevAllDoneRef.current
		if (previous.dateKey === selectedDateKey && allDone && !previous.allDone) {
			setShowConfetti(true)
		}
		prevAllDoneRef.current = { dateKey: selectedDateKey, allDone }
	}, [allDone, selectedDateKey])

	const carouselRef = useRef<FlatList<string>>(null)
	// A window of day keys ending on today; today sits at index PAST_DAYS.
	const dateKeys = useMemo(() => {
		const start = addDays(todayKey, -PAST_DAYS)
		return Array.from({ length: PAST_DAYS + FUTURE_DAYS + 1 }, (_, index) => addDays(start, index))
	}, [todayKey])
	const todayIndex = PAST_DAYS
	// Each card is narrower than the screen so neighbors peek; pages snap by card + gap.
	const cardWidth = width - CARD_SIDE * 2
	const snapInterval = cardWidth + CARD_GAP

	// Always open on today, and snap back to it whenever the app returns to foreground.
	useEffect(() => {
		setSelectedDateKey(todayKey)
		carouselRef.current?.scrollToIndex({ index: todayIndex, animated: false })

		const subscription = AppState.addEventListener('change', (state) => {
			if (state === 'active') {
				setSelectedDateKey(toDateKey())
				carouselRef.current?.scrollToIndex({ index: todayIndex, animated: false })
			}
		})

		return () => subscription.remove()
	}, [todayKey, todayIndex])

	function onCarouselSettled(event: NativeSyntheticEvent<NativeScrollEvent>) {
		const index = Math.round(event.nativeEvent.contentOffset.x / snapInterval)
		const nextKey = dateKeys[index]

		if (nextKey && nextKey !== selectedDateKey) {
			setSelectedDateKey(nextKey)
		}
	}

	if (!isReady) {
		return <LoadingState />
	}

	return (
		<Screen contentStyle={styles.content}>
			<View style={styles.checkInPanel}>
				<View style={styles.header}>
					<View style={styles.topRow}>
						<View style={styles.profileRow}>
							<Pressable
								accessibilityRole='button'
								accessibilityLabel='Customize avatar'
								onPress={() => router.push('/avatar')}
								style={({ pressed }) => [styles.avatarFrame, { opacity: pressed ? 0.75 : 1 }]}
							>
								<View style={[styles.avatarCircle, { backgroundColor: alpha(palette.greenDark, '10') }]} pointerEvents='none' />
								<Avatar config={avatar} size={54} rounded={false} />
							</Pressable>
							<View style={styles.nameBlock}>
								<AppText variant='titleSmall' color={palette.ink} numberOfLines={1} style={styles.nickname}>
									{nickname?.trim() || 'there'}
								</AppText>
								<AppText variant='bodySmall' color={palette.subtle} numberOfLines={1} style={styles.dateText}>
									{formatHeaderDateParts(selectedDateKey).weekday}, {formatHeaderDateParts(selectedDateKey).date}
								</AppText>
							</View>
						</View>
						<Pressable
							accessibilityRole='button'
							accessibilityLabel='Open settings'
							onPress={() => router.push('/(tabs)/settings')}
							style={({ pressed }) => [styles.settingsButton, { opacity: pressed ? 0.75 : 1 }]}
						>
							<Icon
								name='settings'
								size={26}
								color={palette.ink}
								weight='bulk'
							/>
						</Pressable>
					</View>
				</View>
			</View>

			<FlatList
				ref={carouselRef}
				data={dateKeys}
				keyExtractor={(item) => item}
				horizontal
				showsHorizontalScrollIndicator={false}
				bounces={false}
				alwaysBounceHorizontal={false}
				overScrollMode='never'
				initialScrollIndex={todayIndex}
				getItemLayout={(_, index) => ({ length: snapInterval, offset: snapInterval * index, index })}
				initialNumToRender={3}
				maxToRenderPerBatch={3}
				windowSize={3}
				snapToInterval={snapInterval}
				snapToAlignment='start'
				disableIntervalMomentum
				decelerationRate='fast'
				contentContainerStyle={styles.carouselContent}
				onMomentumScrollEnd={onCarouselSettled}
				onScrollToIndexFailed={({ index }) => {
					carouselRef.current?.scrollToOffset({ offset: index * snapInterval, animated: false })
				}}
				style={styles.carousel}
				renderItem={({ item }) => {
					const dayHabits = activeHabits.filter((habit) => isScheduledOnDate(habit, item))
					return (
						<View style={[styles.progressPage, { width: cardWidth }]}>
							<DailyProgressCard
								habits={dayHabits}
								dateKey={item}
								streak={bestStreak}
							/>
						</View>
					)
				}}
			/>

			<QuickDoneWidgets
				habits={selectedHabits}
				dateKey={selectedDateKey}
			/>

			<View style={styles.resourceSection}>
				<AppText
					variant='titleSmall'
					color={palette.ink}
					style={styles.resourceHeader}
				>
					Explore
				</AppText>
				<View style={styles.resourceCards}>
					<ResourceCard icon='sparkle' label='Habit Journey' description='Habit science, made simple' onPress={() => router.push('/tips')} />
					<ResourceCard icon='note' label='FAQs' description='Quick answers about Lumo' onPress={() => router.push('/faqs')} />
				</View>
			</View>

			{showConfetti ? (
				<View
					style={StyleSheet.absoluteFill}
					pointerEvents='none'
				>
					<ConfettiCannon
						count={140}
						origin={{ x: width / 2, y: -12 }}
						autoStart
						fadeOut
						explosionSpeed={380}
						fallSpeed={2800}
						onAnimationEnd={() => setShowConfetti(false)}
					/>
				</View>
			) : null}
		</Screen>
	)
}

const styles = StyleSheet.create({
	content: {
		paddingBottom: layout.tabScreenBottomPadding,
	},
	checkInPanel: {
		gap: spacing.md,
	},
	carousel: {
		marginTop: spacing.md,
		marginBottom: spacing.sm,
		// Break out of the screen's horizontal padding so cards can span edge to edge.
		marginHorizontal: -SCREEN_PADDING,
	},
	carouselContent: {
		// Inset the first/last card so the focused card is centered and neighbors peek.
		paddingHorizontal: CARD_SIDE,
	},
	progressPage: {
		marginRight: CARD_GAP,
		justifyContent: 'center',
	},
	header: {
		gap: spacing.xs,
	},
	topRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: spacing.md,
	},
	profileRow: {
		flex: 1,
		minWidth: 0,
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.md,
	},
	avatarFrame: {
		alignItems: 'center',
		justifyContent: 'center',
	},
	avatarCircle: {
		position: 'absolute',
		width: 46,
		height: 46,
		borderRadius: 23,
	},
	nameBlock: {
		flex: 1,
		minWidth: 0,
		gap: 1,
	},
	nickname: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 18,
		lineHeight: 23,
	},
	dateText: {
		fontSize: 13,
		lineHeight: 17,
	},
	settingsButton: {
		width: 44,
		height: 44,
		marginRight: -10,
		alignItems: 'center',
		justifyContent: 'center',
	},
	questionTitle: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 22,
		lineHeight: 29,
		marginTop: spacing.xs,
	},
	resourceSection: {
		marginTop: spacing.xs,
		gap: spacing.sm,
	},
	resourceHeader: {
		fontFamily: fontFamilies.lexendSemiBold,
		marginBottom: spacing.xxs,
	},
	resourceCards: {
		flexDirection: 'row',
		gap: spacing.sm,
	},
	resourceCard: {
		flex: 1,
		alignItems: 'flex-start',
		gap: spacing.xxs,
		padding: spacing.md,
		borderRadius: radius.xl,
		shadowOffset: { width: 0, height: 7 },
		shadowRadius: 22,
		elevation: 4,
	},
	resourceLabel: {
		fontFamily: fontFamilies.lexendSemiBold,
		fontSize: 15,
		lineHeight: 20,
		marginTop: spacing.xxs,
	},
	resourceDescription: {
		fontFamily: fontFamilies.lexend,
		fontSize: 12,
		lineHeight: 16,
	},
})
