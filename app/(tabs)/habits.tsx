import { useRouter } from 'expo-router'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { SegmentedControl } from '@/components/controls'
import { HabitCard } from '@/components/HabitCard'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/states'
import { AppText, Card, LoadingState, Screen } from '@/components/ui'
import { fontFamilies, layout, radius, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import { Pressable } from '@/components/Pressable'

type HabitFilter = 'active' | 'paused' | 'completed'

// Two controls, not one: "Active" is the day-to-day view, while Paused and
// Completed are habits set aside — so they read as separate groups.
const ACTIVE_FILTER: { label: string; value: HabitFilter }[] = [{ label: 'Active', value: 'active' }]

const SET_ASIDE_FILTERS: { label: string; value: HabitFilter }[] = [
	{ label: 'Paused', value: 'paused' },
	{ label: 'Completed', value: 'completed' },
]

export default function HabitsScreen() {
	const router = useRouter()
	const { habits, isReady, palette } = useLumo()
	const [addPressed, setAddPressed] = React.useState(false)
	const [packsPressed, setPacksPressed] = React.useState(false)
	const [filter, setFilter] = React.useState<HabitFilter>('active')

	const activeHabits = habits.filter((habit) => habit.status === 'active')
	const pausedHabits = habits.filter((habit) => habit.status === 'paused')
	const archivedHabits = habits.filter((habit) => habit.status === 'archived')
	const hasNoHabits = !activeHabits.length && !pausedHabits.length && !archivedHabits.length

	const filteredHabits = filter === 'completed' ? archivedHabits : filter === 'paused' ? pausedHabits : activeHabits

	// "My Habits" always leads. Friends' shared habits will append as further
	// sections below it, so the list stays a stack of labelled groups rather
	// than one unlabelled run.
	const SECTIONS: { key: string; title?: string; items: typeof habits; dimmed?: boolean }[] = [
		{ key: filter, title: 'My Habits', items: filteredHabits, dimmed: filter !== 'active' },
	]

	if (!isReady) {
		return <LoadingState />
	}

	return (
		<Screen contentStyle={{ paddingBottom: layout.tabScreenBottomPadding }}>
			{/* Same shape as the journal editor's top bar: outlined icon on each
			    side, title and its line centred between them. */}
			<View style={styles.screenHeader}>
				<Pressable
					accessibilityRole='button'
					accessibilityLabel='Browse starter packs'
					onPress={() => router.push('/templates')}
					onPressIn={() => setPacksPressed(true)}
					onPressOut={() => setPacksPressed(false)}
					hitSlop={10}
					style={[styles.headerButton, { borderColor: palette.hairline, opacity: packsPressed ? 0.6 : 1 }]}
				>
					<Icon
						name='bookmark'
						size={20}
						color={palette.ink}
						weight='bulk'
					/>
				</Pressable>
				<View style={styles.headerCopy}>
					<AppText
						color={palette.ink}
						style={styles.screenTitle}
						numberOfLines={1}
					>
						Habits
					</AppText>
				</View>
				<Pressable
					accessibilityRole='button'
					accessibilityLabel='Add habit'
					onPress={() => router.push('/habit/new')}
					onPressIn={() => setAddPressed(true)}
					onPressOut={() => setAddPressed(false)}
					hitSlop={10}
					style={[styles.headerButton, { borderColor: palette.hairline, opacity: addPressed ? 0.6 : 1 }]}
				>
					<Icon
						name='plus'
						size={20}
						color={palette.ink}
						weight='bold'
					/>
				</Pressable>
			</View>

			{hasNoHabits ? null : (
				<View style={styles.filterRow}>
					<SegmentedControl options={ACTIVE_FILTER} value={filter} onChange={setFilter} style={styles.filterActive} />
					<SegmentedControl options={SET_ASIDE_FILTERS} value={filter} onChange={setFilter} style={styles.filterSetAside} />
				</View>
			)}

			<View style={styles.categoryList}>
				{hasNoHabits ? (
					<Card style={styles.emptyCard}>
						{/* No buttons — the two header icons are the way in, and a pair
						    of CTAs here duplicated both of them a few points lower. The
						    copy names the icons so the path is still obvious on a first
						    run, when the bar has nothing else to explain it. */}
						<EmptyState
							title='Start with a pack'
							body='Tap the bookmark above for a ready-made routine, or + to build your own from scratch.'
						/>
					</Card>
				) : null}

				{!hasNoHabits && !filteredHabits.length ? (
					<View style={styles.emptyState}>
						<EmptyState
							quiet
							icon={filter === 'completed' ? 'award' : filter === 'paused' ? 'pause' : 'taskSquare'}
							title={
								filter === 'completed' ? 'Nothing completed yet' : filter === 'paused' ? 'Nothing paused' : 'No active habits'
							}
							body={
								filter === 'completed'
									? 'Habits you finish and archive will collect here.'
									: filter === 'paused'
										? 'Habits you put on hold will wait here until you resume them.'
										: 'Nothing running right now — resume a paused habit, or add something new.'
							}
						/>
					</View>
				) : null}

				{SECTIONS.map((section) => {
					const items = section.items
					if (!items.length) {
						return null
					}

					return (
						<View key={section.key} style={styles.section}>
							{section.title ? (
								<View style={styles.sectionHeader}>
									<AppText variant='titleSmall' color={palette.ink} style={styles.sectionTitle}>
										{section.title}
									</AppText>
									<AppText variant='caption' color={palette.muted} style={styles.sectionCount}>
										{items.length} {items.length === 1 ? 'Habit' : 'Habits'}
									</AppText>
								</View>
							) : null}
							<View style={[styles.habitStack, section.dimmed && styles.sectionDimmed]}>
								{items.map((habit) => (
									<HabitCard key={habit.id} habit={habit} compact disabledActions={section.dimmed} />
								))}
							</View>
						</View>
					)
				})}
			</View>

		</Screen>
	)
}

const styles = StyleSheet.create({
	categoryList: {
		gap: spacing.lg,
	},
	// No marginBottom: the Screen's own stack gap already separates the header
	// from the filters. Carrying both put 36pt between them, which read as a
	// gap the page had left for something it forgot to put there.
	screenHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
	},
	headerCopy: {
		flex: 1,
		alignItems: 'center',
	},
	// Outlined circle, matching the journal editor's back/preview buttons.
	headerButton: {
		width: 38,
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: radius.pill,
		borderWidth: StyleSheet.hairlineWidth,
	},
	filterRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.xs,
		marginBottom: spacing.xs,
	},
	filterActive: {
		flexShrink: 0,
		// `segment` is flex:1 (flexBasis:0), so in a single-option control with no
		// width the pill would collapse to its padding. Give it an explicit floor.
		minWidth: 88,
	},
	filterSetAside: {
		flex: 1,
	},
	// Serif display at the journal editor's top-bar size, since the title now
	// sits between two buttons rather than filling the row.
	screenTitle: {
		fontFamily: fontFamilies.serifBlack,
		fontSize: 19,
		lineHeight: 25,
	},
	section: {
		gap: spacing.sm,
	},
	sectionHeader: {
		flexDirection: 'row',
		alignItems: 'baseline',
		justifyContent: 'space-between',
		gap: spacing.sm,
	},
	sectionTitle: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 16,
		lineHeight: 22,
	},
	// Deliberately light — a count, not a second heading.
	sectionCount: {
		fontFamily: fontFamilies.lexend,
	},
	habitStack: {
		gap: spacing.xs,
	},
	// Completed habits are history — present, but visually retired.
	sectionDimmed: {
		opacity: 0.6,
	},
	emptyState: {
		alignItems: 'center',
		paddingVertical: spacing.xl,
	},
	emptyCard: {
		alignItems: 'center',
		gap: spacing.xs,
		padding: spacing.lg,
		marginTop: spacing.sm,
	},
})
