import { useFocusEffect, useRouter, type Href } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, AppState, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import ConfettiCannon from 'react-native-confetti-cannon'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fontFamilies, layout, radius, spacing } from '@/constants/theme'
import { TOOLS } from '@/constants/tools'
import { MoveHomeCard } from '@/components/move/MoveCards'
import { useMove } from '@/context/MoveContext'
import { addDays, startOfWeekMonday } from '@/lib/date'
import { sumMetric } from '@/lib/move/movement'
import { useLumo } from '@/context/LumoContext'
import { alpha, readableOn } from '@/lib/color'
import { toDateKey } from '@/lib/date'
import { friendsService, onGroupMembershipChanged } from '@/lib/friends'
import { greetingFor, reflectionPromptFor, taglineFor } from '@/lib/homeCopy'
import { isDoneOnDate, isScheduledOnDate } from '@/lib/habitMath'
import { HomeBackground, homeSceneBottom, useHomePeriod } from '@/components/HomeBackground'
import { Avatar } from '@/components/Avatar'
import { DailyReflectionCard } from '@/components/DailyReflectionCard'
import { DatePill } from '@/components/DatePill'
import { Icon, IconName } from '@/components/Icon'
import { QuickDoneWidgets } from '@/components/QuickDoneWidgets'
import { StreakCard } from '@/components/StreakCard'
import { AppText, Card, LoadingState, Screen } from '@/components/ui'
import { Pressable } from '@/components/Pressable'

/** The header row's height — the avatar and bell buttons set it. */
const HEADER_HEIGHT = 42
/**
 * Row gap between the stacked cards. Tighter than the 20 `Screen` gives every
 * other page: home carries seven surfaces in a column, and at 20 they read as
 * seven separate pages rather than one dashboard.
 */
const CONTENT_GAP = spacing.xs
/** What actually separates the header from the greeting: the row gap above,
 *  plus the extra top margin the greeting block drops by. */
const HERO_TOP_GAP = CONTENT_GAP + spacing.xl
/**
 * The avatar's ring carries the card colour, but semi-transparent — it sits
 * directly on the backdrop plate's sky, and a solid fill up there reads as a
 * chip pasted over the artwork. Matches the day selector beside it. The
 * settings button stays a bare outline: it holds a glyph rather than a
 * portrait, so it has nothing to sit on.
 */
const HEADER_FILL_ALPHA = 'A6'

/**
 * One hue per destination, sampled from that screen's own art.
 *
 * Deliberately NOT palette tokens and NOT theme-dependent — the same call
 * `badgeAccent` makes. These are wayfinding: the gold tile means Badges the way
 * a sign's colour means a line on a map, and a tile that changed hue with the
 * theme would stop being the thing you learned to reach for. Each is walked to
 * 3:1 against the current card before it is drawn, so they stay legible in
 * every theme without giving up the identity.
 */
const EXPLORE_ACCENT = {
	tips: '#74BC97',
	faqs: '#B390F3',
	badges: '#FAD686',
	featureBoard: '#AE8FFB',
} as const

/**
 * One row in a Goodies or Explore card.
 *
 * Both sections use this, so they read as the same kind of list and cannot
 * drift apart. `divided` draws the hairline above — every row but the first.
 */
function ResourceRow({
	icon,
	label,
	description,
	accent,
	divided,
	disabled = false,
	onPress,
}: {
	icon: IconName
	label: string
	description: string
	accent: string
	divided: boolean
	/** Dims the row and drops the chevron — for a tool that has not shipped. */
	disabled?: boolean
	onPress: () => void
}) {
	const { palette, isDark } = useLumo()
	const [pressed, setPressed] = useState(false)
	// Several of these hues are pastels that vanish as a glyph on a light tile,
	// so the sampled colour is walked toward the surface's opposite until it
	// clears 3:1 — as much adjustment as needed and no more, so the hue holds.
	const glyph = readableOn(accent, palette.card, 3)

	return (
		<Pressable
			accessibilityRole='button'
			accessibilityLabel={disabled ? `${label}. ${description}. Coming soon.` : `${label}. ${description}`}
			accessibilityState={{ disabled }}
			disabled={disabled}
			onPress={onPress}
			onPressIn={() => setPressed(true)}
			onPressOut={() => setPressed(false)}
			style={[
				styles.resourceRow,
				divided ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha(palette.hairline, '80') } : null,
				{ opacity: disabled ? 0.55 : pressed ? 0.7 : 1 },
			]}
		>
			{/* The same rounded-square tile the habit rows wear, so the two lists
			    on this screen read as the same kind of list. */}
			<View style={[styles.resourceIcon, { backgroundColor: alpha(accent, isDark ? '2E' : '24') }]}>
				<Icon name={icon} size={20} color={glyph} weight='bulk' />
			</View>
			<View style={styles.resourceText}>
				<AppText variant='titleSmall' color={palette.ink} numberOfLines={1} style={styles.resourceLabel}>
					{label}
				</AppText>
				<AppText variant='caption' color={palette.muted} numberOfLines={1} style={styles.resourceDescription}>
					{description}
				</AppText>
			</View>
			{disabled ? (
				<View style={[styles.resourceSoon, { backgroundColor: alpha(palette.muted, '1F') }]}>
					<AppText variant='caption' color={palette.subtle} numberOfLines={1}>
						Soon
					</AppText>
				</View>
			) : (
				<Icon name='forward' size={15} color={alpha(palette.muted, 'CC')} weight='bold' />
			)}
		</Pressable>
	)
}

export default function TodayScreen() {
	const router = useRouter()
	const { width } = useWindowDimensions()
	const insets = useSafeAreaInsets()
	const { habits, isReady, nickname, palette, isDark, avatar } = useLumo()
	/**
	 * Move's own state, read straight from its provider.
	 *
	 * Deliberately not threaded through `useLumo` — Move is standalone, and the
	 * Home card is the one place the two features meet.
	 */
	const move = useMove()
	const moveToday = move.today
	const moveWeekMeters = React.useMemo(() => {
		const start = startOfWeekMonday(move.todayKey)

		return sumMetric(move.state.summaries, 'distance', start, addDays(start, 6))
	}, [move.state.summaries, move.todayKey])
	const todayKey = toDateKey()
	const [selectedDateKey, setSelectedDateKey] = useState(todayKey)
	const activeHabits = habits.filter((habit) => habit.status === 'active')
	const selectedHabits = activeHabits.filter((habit) => isScheduledOnDate(habit, selectedDateKey))
	const isToday = selectedDateKey === todayKey
	const greeting = greetingFor(new Date().getHours())
	// Drives BOTH the backdrop plate and the tagline under the greeting, so the
	// words and the scene behind them never describe different times of day.
	const period = useHomePeriod()
	/**
	 * Drives the backdrop's fade — see HomeBackground.
	 *
	 * The JS driver: `Screen` renders a plain ScrollView, which has nothing for
	 * `useNativeDriver` to attach to. One interpolated opacity per frame is
	 * cheap enough that reshaping `Screen` for it would be the wrong trade.
	 */
	const scrollY = React.useRef(new Animated.Value(0)).current
	const handleScroll = React.useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => scrollY.setValue(event.nativeEvent.contentOffset.y),
		[scrollY],
	)
	const firstName = nickname?.trim() || 'there'
	// The backdrop plate draws Lumo into the top of the screen, so the greeting
	// block holds a minimum height that keeps the first card off his face and
	// torso. Everything above the greeting (safe area, the screen's own top
	// padding, the header, the gap under it) comes off the reserve. No floor
	// beyond zero: the greeting's own three lines are taller than this on a
	// normal phone, and a floor above them would only push the cards back down.
	const heroMinHeight = Math.max(0, homeSceneBottom(width, period) - insets.top - spacing.lg - HEADER_HEIGHT - HERO_TOP_GAP)

	// Home no longer lists the user's groups, but a habit that belongs to one
	// still carries a small marker on its row — so the ids are all this screen
	// needs from the friends service.
	const [groupHabitIds, setGroupHabitIds] = useState<Set<string>>(() => new Set())
	const refreshGroupHabitIds = useCallback(() => {
		friendsService.listGroups().then((loadedGroups) => {
			setGroupHabitIds(new Set(loadedGroups.flatMap((group) => group.habits.map((habit) => habit.id))))
		})
	}, [])
	// Refreshed on focus, and live whenever group membership changes — leaving a
	// group has to take its markers with it.
	useFocusEffect(refreshGroupHabitIds)
	useEffect(() => onGroupMembershipChanged(refreshGroupHabitIds), [refreshGroupHabitIds])

	// Page-wide confetti when every habit for the selected day gets completed.
	// Only fires on the transition to all-done while staying on the same day —
	// jumping to an already-completed day stays quiet. The cannon is only
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

	// Always open on today, and snap back to it whenever the app returns to the
	// foreground — otherwise a phone left overnight still shows yesterday.
	useEffect(() => {
		setSelectedDateKey(todayKey)

		const subscription = AppState.addEventListener('change', (state) => {
			if (state === 'active') {
				setSelectedDateKey(toDateKey())
			}
		})

		return () => subscription.remove()
	}, [todayKey])

	if (!isReady) {
		return <LoadingState />
	}

	return (
		// The home plate replaces the shared landscape wash entirely — two
		// backdrops would just muddy each other.
		<Screen
			contentStyle={styles.content}
			backgroundVariant={null}
			backgroundNode={<HomeBackground period={period} scrollY={scrollY} />}
			onScroll={handleScroll}
			scrollEventThrottle={16}
		>
			{/* Header: profile · day selector · notifications. Both sides reserve
			    the same width so the selector centres on the SCREEN, not on
			    whatever space is left beside the avatar. */}
			<View style={styles.header}>
				<View style={styles.headerSide}>
					<Pressable
						accessibilityRole='button'
						accessibilityLabel='Open profile'
						onPress={() => router.push('/(tabs)/profile')}
						hitSlop={8}
						style={({ pressed }) => [
							styles.avatarButton,
							{ backgroundColor: alpha(palette.card, HEADER_FILL_ALPHA), opacity: pressed ? 0.7 : 1 },
						]}
					>
						<Avatar config={avatar} size={42} backgroundColor={palette.greenSoft} />
					</Pressable>
				</View>
				<View style={styles.headerCenter}>
					<DatePill value={selectedDateKey} onChange={setSelectedDateKey} max={todayKey} />
				</View>
				<View style={[styles.headerSide, styles.headerSideRight]}>
					<Pressable
						accessibilityRole='button'
						accessibilityLabel='Open settings'
						onPress={() => router.push('/(tabs)/settings')}
						hitSlop={10}
						style={({ pressed }) => [
							styles.headerButton,
							{ borderColor: alpha(palette.ink, '2E'), opacity: pressed ? 0.6 : 1 },
						]}
					>
						{/* Ink glyph, but only a tint of it on the ring. Full ink on both
						    made the outline as loud as the icon inside it — and this
						    button sits beside an avatar with no ring at all, so a heavy
						    one read as the odd control out. The glyph stays ink because
						    it sits on the backdrop plate's sky, where the warm hairline
						    the rest of the app's chrome uses all but disappears. */}
						<Icon name='settings' size={20} color={palette.ink} weight='bulk' />
					</Pressable>
				</View>
			</View>

			{/* Hero. No mascot component here on purpose — Lumo is painted into
			    the backdrop plate, so the copy column stays out of his half of
			    the screen and the greeting simply sits beside him. The minimum
			    height is what keeps the first card off his feet. */}
			<View style={[styles.hero, { minHeight: heroMinHeight }]}>
				{/* Outside the column below it, and deliberately so: this line sits
				    level with Lumo's HEAD, which is the narrowest part of him, so it
				    gets more of the screen than the lines under it can have. */}
				<AppText color={palette.ink} style={styles.heroGreeting}>
					{greeting},
				</AppText>
				<View style={styles.heroLower}>
					<View style={styles.heroCopy}>
						<AppText color={palette.ink} numberOfLines={2} style={styles.heroName}>
							{firstName}! 💛
						</AppText>
						<AppText variant='bodySmall' color={alpha(palette.ink, 'CC')} style={styles.heroTagline}>
							{taglineFor(selectedDateKey, period)}
						</AppText>
					</View>
					{/* Reserved, not decorative: below the head Lumo widens out to
					    roughly the right half of every plate, and copy running under
					    his hoodie would be unreadable. */}
					<View style={styles.heroArtReserve} />
				</View>
			</View>

			<View style={styles.streakSection}>
				<StreakCard habits={activeHabits} dateKey={selectedDateKey} />
			</View>

			<QuickDoneWidgets
				habits={selectedHabits}
				dateKey={selectedDateKey}
				groupHabitIds={groupHabitIds}
				title={isToday ? 'Today’s Habits' : 'Habits'}
			/>

			<DailyReflectionCard
				prompt={reflectionPromptFor(selectedDateKey)}
				onPress={() => router.push(`/journal/${selectedDateKey}`)}
			/>

			{/* Lumo Move gets its own section — NOT a habit card and not a Goodies
			    row. It is a major feature with its own tab, and burying it in a
			    list of tools would say otherwise. Hidden entirely until there is
			    something to report, so a brand-new account is not handed an empty
			    dashboard. */}
			{moveWeekMeters > 0 || moveToday ? (
				<View style={styles.moveSection}>
					<AppText variant='titleSmall' color={palette.ink} style={styles.sectionTitle}>
						Lumo Move
					</AppText>
					<MoveHomeCard
						today={moveToday}
						weekMeters={moveWeekMeters}
						progress={move.progress}
						totalDistanceM={move.totalDistanceM}
					/>
				</View>
			) : null}

			{/* Two cards, same shape as the habits card above them. Things you DO
			    on top, things you read below. */}
			<View style={styles.toolsSection}>
				<AppText variant='titleSmall' color={palette.ink} style={styles.sectionTitle}>
					Goodies
				</AppText>
				<Card style={styles.resourceCard}>
					{TOOLS.map((tool, index) => (
						<ResourceRow
							key={tool.slug}
							accent={tool.accent}
							icon={tool.icon}
							label={tool.name}
							description={tool.tagline}
							divided={index > 0}
							disabled={!tool.available}
							onPress={() => router.push(tool.route as Href)}
						/>
					))}
				</Card>
			</View>

			<View style={styles.exploreSection}>
				<AppText variant='titleSmall' color={palette.ink} style={styles.sectionTitle}>
					Explore
				</AppText>
				<Card style={styles.resourceCard}>
					<ResourceRow accent={EXPLORE_ACCENT.tips} icon='sparkle' label='Habit Journey' description='Habit science, made simple' divided={false} onPress={() => router.push('/tips')} />
					<ResourceRow accent={EXPLORE_ACCENT.faqs} icon='note' label='FAQs' description='Quick answers about Lumo' divided onPress={() => router.push('/faqs')} />
					<ResourceRow accent={EXPLORE_ACCENT.badges} icon='award' label='Badges' description='Celebrate your milestones' divided onPress={() => router.push('/badges')} />
					{/* Feature Board entry hidden for now — restore when the feature ships.
					<ResourceRow accent={EXPLORE_ACCENT.featureBoard} icon='star' label="What's next" description='Vote on what we build' divided onPress={() => router.push('/feature-soon')} />
					*/}
				</Card>
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
	// CONTENT_GAP is what separates the stacked cards, overriding the wider row
	// gap `Screen` applies by default; only the hero sets a margin of its own.
	content: {
		gap: CONTENT_GAP,
		paddingBottom: layout.tabScreenBottomPadding,
	},
	streakSection: {
		marginTop: spacing.lg,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
	},
	headerSide: {
		width: 42,
		height: 42,
		justifyContent: 'center',
	},
	headerSideRight: {
		alignItems: 'flex-end',
	},
	headerCenter: {
		flex: 1,
		minWidth: 0,
		alignItems: 'center',
		justifyContent: 'center',
	},
	// No outline — the portrait fills the circle edge to edge, and a ring round
	// it read as a second frame drawn over the avatar's own.
	avatarButton: {
		width: 42,
		height: 42,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: radius.pill,
		overflow: 'hidden',
	},
	headerButton: {
		width: 38,
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: radius.pill,
		borderWidth: StyleSheet.hairlineWidth,
	},
	hero: {
		// Dropped clear of the header so the greeting opens the scene rather
		// than crowding the controls above it. Paired with HERO_TOP_GAP, which
		// feeds the same number into the art's height reservation.
		marginTop: spacing.xl,
		// And clear of the first card below it: at the screen's tight 8pt row
		// gap the tagline sat right on the streak card's edge.
		marginBottom: spacing.sm,
	},
	heroLower: {
		flexDirection: 'row',
		// Top-aligned: the copy sits level with Lumo's chest rather than being
		// centred against the space his art reserves.
		alignItems: 'flex-start',
	},
	heroCopy: {
		flex: 1,
		minWidth: 0,
	},
	// Serif, like the name under it: the two lines are ONE headline broken over
	// two sizes, not a label introducing a title.
	//
	// The cap is what keeps it off the art. "Good afternoon," is the longest of
	// the three greetings, and at this size it runs right up to where Lumo's
	// head starts on the tightest of the five plates.
	heroGreeting: {
		fontFamily: fontFamilies.serifBold,
		fontSize: 30,
		lineHeight: 38,
		// Sits level with Lumo's HEAD, the narrowest part of him, so it gets more
		// of the screen than the lines under it can have — and more again since
		// the plates were re-cut with him further right.
		maxWidth: '74%',
	},
	// The screen's one display-size line. Wraps to a second line for a long
	// nickname rather than shrinking — the column is only about half the screen
	// wide, since Lumo owns the other half of every backdrop plate.
	heroName: {
		fontFamily: fontFamilies.serifBlack,
		fontSize: 40,
		lineHeight: 48,
	},
	heroTagline: {
		fontSize: 14,
		lineHeight: 20,
		marginTop: spacing.sm,
	},
	/**
	 * What the copy column leaves to Lumo.
	 *
	 * His leftmost pixels sit at ~0.50 of the plate's width, but what is out
	 * there is the pale edge of his cushion or his lunchbox — cream on cream,
	 * which ink text reads over perfectly well, especially with the halo the
	 * hero text carries. The line worth respecting is his black hoodie, which
	 * would swallow anything written on it.
	 *
	 * 36% since the plates were re-cut and scaled: the new art puts Lumo further
	 * right, so the copy can take back a little of the column without reaching
	 * the hoodie.
	 */
	heroArtReserve: {
		width: '36%',
	},
	// The same rhythm as Explore and Goodies, so the three read as one column.
	moveSection: {
		gap: spacing.sm,
	},
	toolsSection: {
		// Matches Explore's heading gap, so the two sections sit on one rhythm.
		gap: spacing.ml,
		// Top is larger than Explore's: this is the first section heading after
		// the day's cards, so it carries the break between "today's work" and
		// everything else. The BOTTOM matches Explore exactly.
		marginTop: spacing.xl,
		marginBottom: spacing.md,
	},
	exploreSection: {
		gap: spacing.ml,
		marginBottom: spacing.md,
	},
	// The rows carry their own vertical padding, so the card only insets
	// horizontally and adds a hair top and bottom.
	resourceCard: {
		paddingHorizontal: spacing.ml,
		paddingVertical: spacing.xs,
	},
	resourceRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
		minHeight: 58,
		paddingVertical: spacing.sm,
	},
	resourceIcon: {
		width: 40,
		height: 40,
		borderRadius: radius.xl,
		alignItems: 'center',
		justifyContent: 'center',
	},
	resourceText: {
		flex: 1,
		minWidth: 0,
		gap: 1,
	},
	resourceLabel: {
		flexShrink: 1,
		fontFamily: fontFamilies.lexendSemiBold,
		fontSize: 14,
		lineHeight: 21,
	},
	// Regular weight, against `caption`'s semibold: the label above it is the
	// thing being scanned, and at the same weight the two lines competed.
	resourceDescription: {
		fontFamily: fontFamilies.lexend,
		fontSize: 12,
		lineHeight: 16,
	},
	// Sits where the chevron would, since a row that cannot be opened should not
	// promise somewhere to go.
	resourceSoon: {
		minHeight: 24,
		justifyContent: 'center',
		paddingHorizontal: spacing.xs,
		borderRadius: radius.pill,
	},
	// The app's list-section heading, matching Habits and the journal's month
	// headings.
	sectionTitle: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 16,
		lineHeight: 22,
	},
})
