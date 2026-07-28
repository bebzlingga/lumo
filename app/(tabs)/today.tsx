import { useFocusEffect, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import ConfettiCannon from 'react-native-confetti-cannon'
import Svg, { Circle as SvgCircle, Path as SvgPath } from 'react-native-svg'
import { fontFamilies, layout, radius, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import { alpha } from '@/lib/color'
import { addDays, formatHeaderDateParts, parseDateKey, toDateKey } from '@/lib/date'
import { friendsService, onGroupMembershipChanged, type Group } from '@/lib/friends'
import { bestCurrentStreakAcrossHabits, isDoneOnDate, isScheduledOnDate } from '@/lib/habitMath'
import { buildGroupAvatarSvg } from '@/lib/avatar'
import { formatLumoId } from '@/lib/lumoId'
import { Habit } from '@/types/habit'
import { Avatar } from '@/components/Avatar'
import { DailyProgressCard } from '@/components/DailyProgressCard'
import { FireIcon } from '@/components/FireIcon'
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

type ResourceMotif = 'journey' | 'faqs' | 'next'

function sparklePath(cx: number, cy: number, size: number) {
	const waist = size * 0.28

	return `M${cx} ${cy - size} L${cx + waist} ${cy - waist} L${cx + size} ${cy} L${cx + waist} ${cy + waist} L${cx} ${cy + size} L${cx - waist} ${cy + waist} L${cx - size} ${cy} L${cx - waist} ${cy - waist} Z`
}

/** Soft decorative shapes anchored to the card's right edge, tinted from the
 * active palette so they follow theme and dark mode. */
function ResourceCardBackdrop({ motif }: { motif: ResourceMotif }) {
	const { palette } = useLumo()
	const soft = alpha(palette.greenSoft, '4D')
	const softer = alpha(palette.greenSoft, '2E')
	const glowTint = alpha(palette.glow, '59')

	return (
		<View
			style={[StyleSheet.absoluteFill, styles.resourceBackdrop]}
			pointerEvents='none'
		>
			<Svg
				width={160}
				height={150}
			>
				{motif === 'journey' ? (
					<>
						<SvgCircle cx={165} cy={150} r={72} fill={softer} />
						<SvgCircle cx={165} cy={150} r={46} fill={soft} />
						<SvgPath
							d='M18 118 C 58 100, 74 58, 128 34'
							stroke={glowTint}
							strokeWidth={3}
							strokeDasharray='1 11'
							strokeLinecap='round'
							fill='none'
						/>
						<SvgPath d={sparklePath(136, 28, 9)} fill={palette.glow} opacity={0.75} />
					</>
				) : null}
				{motif === 'faqs' ? (
					<>
						<SvgCircle cx={148} cy={6} r={58} fill={alpha(palette.glowSoft, '66')} />
						<SvgCircle cx={104} cy={104} r={34} fill={softer} />
						<SvgCircle cx={64} cy={34} r={9} fill={glowTint} />
						<SvgCircle cx={148} cy={116} r={14} fill={soft} />
					</>
				) : null}
				{motif === 'next' ? (
					<>
						<SvgCircle cx={168} cy={140} r={54} fill={softer} />
						<SvgPath d={sparklePath(122, 40, 15)} fill={glowTint} />
						<SvgPath d={sparklePath(88, 96, 9)} fill={soft} />
						<SvgPath d={sparklePath(146, 92, 6)} fill={palette.glow} opacity={0.55} />
					</>
				) : null}
			</Svg>
		</View>
	)
}

// NativeWind's css-interop drops function-valued `style` props on Pressable,
// so pressed state is tracked manually and the style is passed as a plain array.
function ResourceCard({
	icon,
	label,
	description,
	width,
	motif,
	onPress,
}: {
	icon: IconName
	label: string
	description: string
	width: number
	motif: ResourceMotif
	onPress: () => void
}) {
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
				{ width, backgroundColor: palette.card, shadowColor: isDark ? 'transparent' : palette.shadow, opacity: pressed ? 0.85 : 1 },
			]}
		>
			<ResourceCardBackdrop motif={motif} />
			<Icon name={icon} size={24} color={palette.green} weight='bulk' />
			<AppText variant='bodySmall' color={palette.ink} style={styles.resourceLabel}>
				{label}
			</AppText>
			<AppText variant='caption' color={palette.subtle} style={styles.resourceDescription}>
				{description}
			</AppText>
		</Pressable>
	)
}

// Full-width group card for the home screen's horizontal group row — matches
// the date card's width and rounding. Two columns (avatar · details), centered,
// with the important bit up front: how many activities you still owe today.
function HomeGroupCard({ group, width, myLumoId, onPress }: { group: Group; width: number; myLumoId: string; onPress: () => void }) {
	const { palette, isDark } = useLumo()
	const [pressed, setPressed] = useState(false)
	const avatarSvg = useMemo(() => buildGroupAvatarSvg(group.avatarSeed ?? group.id), [group.avatarSeed, group.id])
	const me = group.members.find((member) => member.profile.lumoId === myLumoId)
	const remaining = me ? group.habits.filter((habit) => !me.completedTodayHabitIds.includes(habit.id)).length : group.habits.length
	const allDone = remaining === 0

	return (
		<Pressable
			accessibilityRole='button'
			accessibilityLabel={`Open group ${group.name}, ${allDone ? 'all activities done today' : `${remaining} activities to complete today`}`}
			onPress={onPress}
			onPressIn={() => setPressed(true)}
			onPressOut={() => setPressed(false)}
			style={[styles.homeGroupCard, { width, backgroundColor: palette.card, shadowColor: isDark ? 'transparent' : palette.shadow, opacity: pressed ? 0.85 : 1 }]}
		>
			<View style={[styles.homeGroupAvatar, { backgroundColor: alpha(palette.greenDark, '10') }]}>
				<Avatar svg={avatarSvg} size={52} rounded={false} />
			</View>
			<View style={styles.homeGroupInfo}>
				<View style={styles.homeGroupNameRow}>
					<AppText variant='titleSmall' color={palette.ink} numberOfLines={1} style={styles.homeGroupName}>
						{group.name}
					</AppText>
					{group.streak >= 3 ? (
						<View style={[styles.homeGroupStreak, { backgroundColor: palette.glowSoft }]}>
							<FireIcon size={11} />
							<AppText variant='caption' color={palette.ink} style={styles.homeGroupStreakText}>
								{group.streak}d
							</AppText>
						</View>
					) : null}
				</View>
				<AppText variant='caption' color={alpha(palette.subtle, 'AA')} numberOfLines={1}>
					{group.members.length} {group.members.length === 1 ? 'member' : 'members'} · {group.habits.length}{' '}
					{group.habits.length === 1 ? 'activity' : 'activities'}
				</AppText>
			</View>
			<View style={[styles.homeGroupTodo, { backgroundColor: alpha(palette.greenDark, '12') }]}>
				<Icon name={allDone ? 'checkCircle' : 'chart2'} size={13} color={palette.greenDark} weight='bulk' />
				{allDone ? (
					<AppText variant='caption' color={palette.greenDark} numberOfLines={1} style={styles.homeGroupTodoDone}>
						All done
					</AppText>
				) : (
					<AppText variant='caption' color={palette.greenDark} numberOfLines={1} style={styles.homeGroupTodoNumber}>
						{remaining}
					</AppText>
				)}
			</View>
		</Pressable>
	)
}

export default function TodayScreen() {
	const router = useRouter()
	const { width } = useWindowDimensions()
	const { habits, isReady, nickname, palette, avatar, lumoIdSuffix, isPro } = useLumo()
	const myLumoId = formatLumoId(lumoIdSuffix)
	const todayKey = toDateKey()
	const [selectedDateKey, setSelectedDateKey] = useState(todayKey)
	const activeHabits = habits.filter((habit) => habit.status === 'active')
	const selectedHabits = activeHabits.filter((habit) => isScheduledOnDate(habit, selectedDateKey))
	const resourceCardWidth = (width - SCREEN_PADDING * 2) * 0.7

	// The user's friends groups, shown as a horizontal card row below. Habits
	// that belong to a group also get a small marker on their cards.
	const [groups, setGroups] = useState<Group[]>([])
	const [groupHabitIds, setGroupHabitIds] = useState<Set<string>>(() => new Set())
	const refreshGroups = useCallback(() => {
		friendsService.listGroups().then((loadedGroups) => {
			setGroups(loadedGroups)
			setGroupHabitIds(new Set(loadedGroups.flatMap((group) => group.habits.map((habit) => habit.id))))
		})
	}, [])
	// Refresh on focus, and live whenever group membership changes (e.g. leaving
	// or deleting a group) so the "Your groups" row updates in real time.
	useFocusEffect(refreshGroups)
	useEffect(() => onGroupMembershipChanged(refreshGroups), [refreshGroups])

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
								accessibilityLabel='Open profile'
								onPress={() => router.push('/profile')}
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
								streak={bestCurrentStreakAcrossHabits(activeHabits, item)}
							/>
						</View>
					)
				}}
			/>

			<QuickDoneWidgets
				habits={selectedHabits}
				dateKey={selectedDateKey}
				groupHabitIds={groupHabitIds}
			/>

			{isPro && groups.length > 0 ? (
				<View style={styles.groupSection}>
					<AppText variant='titleSmall' color={palette.ink} style={styles.groupSectionHeader}>
						Your groups
					</AppText>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						snapToInterval={snapInterval}
						snapToAlignment='start'
						disableIntervalMomentum
						decelerationRate='fast'
						style={styles.groupScroller}
						contentContainerStyle={styles.groupCards}
					>
						{groups.map((group) => (
							<View key={group.id} style={styles.groupCardPage}>
								<HomeGroupCard group={group} width={cardWidth} myLumoId={myLumoId} onPress={() => router.push(`/group/${group.id}`)} />
							</View>
						))}
					</ScrollView>
				</View>
			) : null}

			<View style={styles.resourceSection}>
				<AppText
					variant='titleSmall'
					color={palette.ink}
					style={styles.resourceHeader}
				>
					Explore
				</AppText>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={styles.resourceScroller}
					contentContainerStyle={styles.resourceCards}
				>
					<ResourceCard width={resourceCardWidth} motif='journey' icon='sparkle' label='Habit Journey' description='Habit science, made simple' onPress={() => router.push('/tips')} />
					<ResourceCard width={resourceCardWidth} motif='faqs' icon='note' label='FAQs' description='Quick answers about Lumo' onPress={() => router.push('/faqs')} />
					{/* Badges entry hidden for now — restore when the badge feature ships.
					<ResourceCard width={resourceCardWidth} motif='next' icon='award' label='Badges' description='Celebrate your milestones' onPress={() => router.push('/badges')} />
					*/}
					{/* Feature Board entry hidden for now — restore when the feature ships.
					<ResourceCard width={resourceCardWidth} motif='next' icon='star' label="What's next" description='Vote on what we build' onPress={() => router.push('/feature-soon')} />
					*/}
				</ScrollView>
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
		top: 0,
		left: 0,
		width: 54,
		height: 54,
		borderRadius: 27,
	},
	nameBlock: {
		flex: 1,
		minWidth: 0,
		gap: 1,
	},
	nickname: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 21,
		lineHeight: 26,
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
	resourceScroller: {
		marginHorizontal: -SCREEN_PADDING,
		marginVertical: -spacing.lg,
	},
	// Generous vertical padding (offset by the negative margins above) keeps
	// the soft card shadows from clipping at the scroll view bounds.
	resourceCards: {
		gap: spacing.sm,
		paddingHorizontal: SCREEN_PADDING,
		paddingVertical: spacing.lg,
	},
	groupSection: {
		marginTop: spacing.xs,
		gap: spacing.sm,
	},
	groupSectionHeader: {
		fontFamily: fontFamilies.lexendSemiBold,
		marginBottom: spacing.xxs,
	},
	// Break out of the screen padding and inset by CARD_SIDE so the cards line up
	// exactly with the date carousel above (same width + edges). Generous vertical
	// padding (cancelled by the negative margin) keeps the card shadow from
	// clipping at the scroll bounds.
	groupScroller: {
		marginHorizontal: -SCREEN_PADDING,
		marginVertical: -spacing.xl,
	},
	groupCards: {
		paddingHorizontal: CARD_SIDE,
		paddingVertical: spacing.xl,
	},
	groupCardPage: {
		marginRight: CARD_GAP,
	},
	homeGroupCard: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.md,
		borderRadius: 30,
		padding: spacing.lg,
		shadowOffset: { width: 0, height: 7 },
		shadowOpacity: 0.09,
		shadowRadius: 22,
		elevation: 4,
	},
	homeGroupAvatar: {
		width: 52,
		height: 52,
		borderRadius: radius.pill,
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
	},
	homeGroupInfo: {
		flex: 1,
		minWidth: 0,
		gap: spacing.xxs,
	},
	homeGroupNameRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.xs,
	},
	homeGroupName: {
		flexShrink: 1,
		fontFamily: fontFamilies.lexendSemiBold,
	},
	homeGroupStreak: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 3,
		paddingHorizontal: spacing.xs,
		paddingVertical: 2,
		borderRadius: radius.pill,
	},
	homeGroupStreakText: {
		fontFamily: fontFamilies.lexendSemiBold,
		fontSize: 11,
	},
	homeGroupTodo: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.xs,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		borderRadius: radius.pill,
	},
	homeGroupTodoDone: {
		textTransform: 'capitalize',
	},
	homeGroupTodoNumber: {
		fontFamily: 'Lexend-Black',
	},
	resourceCard: {
		flex: 1,
		alignItems: 'flex-start',
		gap: spacing.xxs,
		padding: spacing.lg,
		borderRadius: radius.xl,
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.08,
		shadowRadius: 10,
		elevation: 2,
	},
	// Clips the decorative shapes to the card's rounded corners. The clip
	// lives here instead of on the card so the iOS shadow isn't masked away.
	resourceBackdrop: {
		alignItems: 'flex-end',
		borderRadius: radius.xl,
		overflow: 'hidden',
	},
	resourceLabel: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 17,
		lineHeight: 22,
		marginTop: spacing.xxs,
	},
	resourceDescription: {
		fontFamily: fontFamilies.lexend,
		fontSize: 12,
		lineHeight: 16,
	},
})
