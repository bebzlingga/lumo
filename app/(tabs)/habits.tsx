import { useRouter } from 'expo-router'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { HabitCard } from '@/components/HabitCard'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/states'
import { AppText, Card, LoadingState, Screen } from '@/components/ui'
import { fontFamilies, layout, radius, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import { Pressable } from '@/components/Pressable'

type Section = {
	key: 'active' | 'paused' | 'completed'
	title: string
	items: ReturnType<typeof useLumo>['habits']
	/** Set-aside habits: dimmed, actions off, and folded away until opened. */
	setAside: boolean
}

export default function HabitsScreen() {
	const router = useRouter()
	const { habits, isReady, palette } = useLumo()
	const [addPressed, setAddPressed] = React.useState(false)
	const [packsPressed, setPacksPressed] = React.useState(false)
	// One page, no tabs: My Habits leads, the set-aside groups follow below and
	// start folded — they are history and parking, not the day's list.
	const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})

	const activeHabits = habits.filter((habit) => habit.status === 'active')
	const pausedHabits = habits.filter((habit) => habit.status === 'paused')
	const archivedHabits = habits.filter((habit) => habit.status === 'archived')
	const hasNoHabits = !activeHabits.length && !pausedHabits.length && !archivedHabits.length

	// "My Habits" always leads; empty set-aside groups are left out entirely.
	const SECTIONS: Section[] = [
		{ key: 'active', title: 'My Habits', items: activeHabits, setAside: false },
		{ key: 'paused', title: 'Paused', items: pausedHabits, setAside: true },
		{ key: 'completed', title: 'Completed', items: archivedHabits, setAside: true },
	]

	if (!isReady) {
		return <LoadingState />
	}

	return (
		<Screen
			contentStyle={{ paddingBottom: layout.tabScreenBottomPadding }}
			// Pinned, like every other page bar in the app: the way to add a
			// habit should not be something you scroll back up to find.
			// Same shape as the journal editor's top bar: outlined icon on each
			// side, title and its line centred between them.
			stickyHeader={
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
			}
		>
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

				{!hasNoHabits && !activeHabits.length ? (
					<View style={styles.emptyState}>
						<EmptyState
							quiet
							icon='taskSquare'
							title='No active habits'
							body='Nothing running right now — resume a paused habit below, or add something new.'
						/>
					</View>
				) : null}

				{SECTIONS.map((section) => {
					const items = section.items
					if (!items.length) {
						return null
					}

					const open = !section.setAside || Boolean(expanded[section.key])
					const count = `${items.length} ${items.length === 1 ? 'Habit' : 'Habits'}`
					const heading = (
						<>
							<AppText variant='titleSmall' color={palette.ink} style={styles.sectionTitle}>
								{section.title}
							</AppText>
							<View style={styles.sectionMeta}>
								<AppText variant='caption' color={palette.muted} style={styles.sectionCount}>
									{count}
								</AppText>
								{section.setAside ? (
									<Icon
										name='chevronDown'
										size={16}
										color={palette.muted}
										weight='bold'
										style={open ? styles.chevronOpen : undefined}
									/>
								) : null}
							</View>
						</>
					)

					return (
						<View key={section.key} style={styles.section}>
							{section.setAside ? (
								<Pressable
									accessibilityRole='button'
									accessibilityLabel={`${section.title}, ${count}`}
									accessibilityState={{ expanded: open }}
									onPress={() => setExpanded((current) => ({ ...current, [section.key]: !open }))}
									hitSlop={8}
									style={({ pressed }) => [styles.sectionHeader, { opacity: pressed ? 0.6 : 1 }]}
								>
									{heading}
								</Pressable>
							) : (
								<View style={styles.sectionHeader}>{heading}</View>
							)}
							{open ? (
								<View style={[styles.habitStack, section.setAside && styles.sectionDimmed]}>
									{items.map((habit) => (
										<HabitCard key={habit.id} habit={habit} compact disabledActions={section.setAside} />
									))}
								</View>
							) : null}
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
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: spacing.sm,
	},
	sectionMeta: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.xxs,
	},
	chevronOpen: {
		transform: [{ rotate: '180deg' }],
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
	// Paused and completed habits are set aside — present, but visually retired.
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
