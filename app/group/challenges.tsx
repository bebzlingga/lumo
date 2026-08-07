import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Icon } from '@/components/Icon'
import { ScreenHeader } from '@/components/ScreenHeader'
import { AppText, Card, Screen } from '@/components/ui'
import {
	challengeDifficultyMeta,
	challengeDifficultyOrder,
	challengeDurationLabel,
	challengeProgressFor,
	productivityChallenges,
	type ChallengeProgress,
	type ProductivityChallenge,
} from '@/constants/groupChallenges'
import { fontFamilies, radius, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import { alpha } from '@/lib/color'
import { friendsService, type Group } from '@/lib/friends'
import { Pressable } from '@/components/Pressable'

export default function GroupChallengesScreen() {
	const router = useRouter()
	const { id } = useLocalSearchParams<{ id: string }>()
	const { palette } = useLumo()
	const [group, setGroup] = React.useState<Group | null>(null)
	const [loaded, setLoaded] = React.useState(false)

	const reload = React.useCallback(async () => {
		if (typeof id !== 'string') {
			setLoaded(true)
			return
		}
		const loadedGroup = await friendsService.getGroup(id)
		setGroup(loadedGroup)
		setLoaded(true)
	}, [id])

	// Reload on focus so a challenge started from the detail page shows as active
	// when we return here.
	useFocusEffect(
		React.useCallback(() => {
			reload()
		}, [reload]),
	)

	function openChallenge(challenge: ProductivityChallenge, isLocked: boolean) {
		router.push(`/group/challenge?id=${id}&challengeId=${challenge.id}&locked=${isLocked ? '1' : '0'}`)
	}

	if (!loaded) {
		return (
			<View style={[styles.loading, { backgroundColor: palette.canvas }]}>
				<ActivityIndicator color={palette.greenDark} />
			</View>
		)
	}

	if (!group) {
		return (
			<Screen contentStyle={styles.missing}>
				<ScreenHeader leftAction={{ icon: 'back', label: 'Back', onPress: () => router.back() }} />
				<AppText
					variant='bodySmall'
					color={palette.subtle}
				>
					This group is no longer available.
				</AppText>
			</Screen>
		)
	}

	const habitFor = (challenge: ProductivityChallenge) => group.habits.find((habit) => habit.name.trim().toLowerCase() === challenge.name.trim().toLowerCase())
	const isAdded = (challenge: ProductivityChallenge) => Boolean(habitFor(challenge))
	const progressFor = (challenge: ProductivityChallenge) => {
		const habit = habitFor(challenge)
		const daysDone = habit ? (group.completedDaysByHabit[habit.id]?.length ?? 0) : 0
		return challengeProgressFor(challenge, daysDone)
	}

	// Difficulty tiers unlock in order: a tier opens once at least
	// COMPLETE_TO_UNLOCK of the tier below it are *completed* (capped at its size).
	// Easy is always open.
	const COMPLETE_TO_UNLOCK = 3
	const isTierComplete = (difficulty: ProductivityChallenge['difficulty']) => {
		const tier = productivityChallenges.filter((challenge) => challenge.difficulty === difficulty)
		const done = tier.filter((challenge) => progressFor(challenge).complete).length
		return done >= Math.min(COMPLETE_TO_UNLOCK, tier.length)
	}
	const isDifficultyUnlocked = (difficulty: ProductivityChallenge['difficulty']) => {
		const index = challengeDifficultyOrder.indexOf(difficulty)
		return index <= 0 || isTierComplete(challengeDifficultyOrder[index - 1])
	}

	return (
		// The app's own background plate at the app's own canvas, instead of the
		// bespoke #2E1409 scene with a hand-drawn backdrop this screen used to
		// run — it was the only screen that did not follow light/dark, and every
		// colour in it was a literal.
		//
		// The TROPHIES plate, and at the trophies screen's own intensity: these
		// two are siblings, opened from the pair of tiles on the group page, and
		// they were arriving under different skies at different weights.
		<Screen
			backgroundVariant='trophies'
			backgroundIntensity='medium'
			contentStyle={styles.content}
		>
			<ScreenHeader
				title='Challenges'
				leftAction={{ icon: 'back', label: 'Back', onPress: () => router.back() }}
			/>

			<AppText
				variant='bodySmall'
				color={palette.subtle}
				style={styles.intro}
			>
				Each is a timed challenge — the group logs it together until you hit the goal.
			</AppText>

			<View style={styles.list}>
				{[...productivityChallenges]
					.sort((a, b) => challengeDifficultyOrder.indexOf(a.difficulty) - challengeDifficultyOrder.indexOf(b.difficulty))
					.map((challenge) => (
						<ChallengeRow
							key={challenge.id}
							challenge={challenge}
							added={isAdded(challenge)}
							progress={progressFor(challenge)}
							locked={!isDifficultyUnlocked(challenge.difficulty)}
							onOpen={() => openChallenge(challenge, !isDifficultyUnlocked(challenge.difficulty))}
						/>
					))}
			</View>
		</Screen>
	)
}

function ChallengeRow({
	challenge,
	added,
	progress,
	locked,
	onOpen,
}: {
	challenge: ProductivityChallenge
	added: boolean
	progress: ChallengeProgress
	locked: boolean
	onOpen: () => void
}) {
	const { palette } = useLumo()
	const meta = challengeDifficultyMeta[challenge.difficulty]
	const accent = meta.accent

	return (
		<Pressable
			accessibilityRole='button'
			accessibilityLabel={`Open ${challenge.name}`}
			onPress={onOpen}
			style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
		>
			<Card style={styles.card}>
			<View style={[styles.cardIcon, locked && styles.lockedContent, { backgroundColor: alpha(accent, '16') }]}>
				<Icon
					name={challenge.icon}
					size={20}
					color={accent}
					weight='bulk'
				/>
			</View>
			<View style={[styles.cardText, locked && styles.lockedContent]}>
				<View style={styles.titleRow}>
					<AppText
						variant='bodySmall'
						color={palette.ink}
						numberOfLines={1}
						style={styles.cardName}
					>
						{challenge.name}
					</AppText>
					<View style={[styles.diffBadge, { backgroundColor: alpha(accent, '1F') }]}>
						<AppText
							variant='caption'
							color={accent}
							style={styles.diffBadgeText}
						>
							{meta.label}
						</AppText>
					</View>
				</View>
				<AppText
					variant='caption'
					numberOfLines={1}
					color={palette.subtle}
					style={styles.descLine}
				>
					<AppText
						variant='caption'
						color={accent}
						style={styles.descDays}
					>
						{challengeDurationLabel(challenge)}
					</AppText>
					{`  ·  ${challenge.description}`}
				</AppText>
			</View>
			{locked ? (
				<View style={styles.lockBtn}>
					<Icon
						name='lock'
						size={18}
						color={palette.muted}
						weight='bulk'
					/>
				</View>
			) : progress.complete ? (
				<View style={[styles.tick, { shadowColor: accent }]}>
					<Icon
						name='checkCircle'
						size={28}
						color={accent}
						weight='bulk'
					/>
				</View>
			) : added ? (
				<ProgressRing
					pct={progress.pct}
					color={accent}
				/>
			) : (
				<View style={styles.chevron}>
					{/* 16 and `bold`, the chevron every other row in the app uses —
					    settings, tips, FAQs, the journal. At 18 and `bulk` it drew
					    as a filled duotone arrow rather than a thin stroke. */}
					<Icon
						name='forward'
						size={16}
						color={palette.muted}
						weight='bold'
					/>
				</View>
			)}
			</Card>
		</Pressable>
	)
}

// Circular progress showing how many of the challenge's days the group has logged.
function ProgressRing({ pct, color }: { pct: number; color: string }) {
	const size = 26
	const stroke = 5
	const r = (size - stroke) / 2
	const circ = 2 * Math.PI * r
	const clamped = Math.max(0, Math.min(1, pct))

	return (
		<View style={styles.ring}>
			<Svg
				width={size}
				height={size}
			>
				<Circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					stroke={alpha(color, '2E')}
					strokeWidth={stroke}
					fill='none'
				/>
				<Circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					stroke={color}
					strokeWidth={stroke}
					fill='none'
					strokeDasharray={circ}
					strokeDashoffset={circ * (1 - clamped)}
					strokeLinecap='round'
					transform={`rotate(-90 ${size / 2} ${size / 2})`}
				/>
			</Svg>
		</View>
	)
}

const styles = StyleSheet.create({
	intro: {
		lineHeight: 20,
		// Pulls up under the header's own margin so the line reads as the page's
		// opening sentence rather than a floating paragraph.
		marginTop: -spacing.xs,
		// ...and stands well clear of the list below it. With the figures card
		// gone the sentence sat right on top of the first challenge row, reading
		// as that row's caption rather than as the page's opening line.
		marginBottom: spacing.sm,
	},
	content: {
		paddingBottom: spacing.xxl,
		gap: spacing.md,
	},
	loading: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	missing: {
		gap: spacing.md,
	},
	list: {
		gap: spacing.xs,
	},
	card: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.md,
	},
	lockedContent: {
		opacity: 0.5,
	},
	// Rounded square, not a circle — the same shape the habit and activity
	// pickers give an icon on a tinted bubble.
	cardIcon: {
		width: 40,
		height: 40,
		borderRadius: radius.lg,
		alignItems: 'center',
		justifyContent: 'center',
	},
	cardText: {
		flex: 1,
		gap: 3,
	},
	titleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.xs,
	},
	cardName: {
		flexShrink: 1,
		fontFamily: fontFamilies.lexendSemiBold,
	},
	diffBadge: {
		borderRadius: radius.pill,
		paddingHorizontal: spacing.xs,
		paddingVertical: 1,
	},
	diffBadgeText: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 10,
		letterSpacing: 0.3,
	},
	descLine: {
		fontFamily: fontFamilies.lexend,
	},
	descDays: {
		fontFamily: fontFamilies.lexend,
	},
	tick: {
		width: 36,
		height: 36,
		alignItems: 'center',
		justifyContent: 'center',
		// Green glow around the check (shadowColor is set per-difficulty inline).
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.9,
		shadowRadius: 7,
		elevation: 8,
	},
	// Height only, like the chevron and the padlock below. At a fixed 36 wide the
	// 26pt ring carried 5pt of dead space each side, so an in-progress row's
	// circle sat in from the card's edge while the arrow on the row under it sat
	// flush — the same misalignment those two were already fixed for.
	ring: {
		height: 36,
		alignItems: 'center',
		justifyContent: 'center',
	},
	// Height only. At a fixed 36 wide it padded a 16pt glyph with 10pt of dead
	// space on each side, so the arrow floated well in from the card's edge —
	// the height still matches the ring so rows stay the same height.
	chevron: {
		height: 36,
		alignItems: 'center',
		justifyContent: 'center',
	},
	// Height only, like the chevron it stands in for. At a fixed 36 wide it
	// padded an 18pt padlock with 9pt of dead space each side, so a locked row's
	// glyph sat noticeably further in from the card's edge than an open row's
	// arrow — two trailing controls in the same list, not aligned with each other.
	lockBtn: {
		height: 36,
		alignItems: 'center',
		justifyContent: 'center',
	},
})
