import * as Haptics from 'expo-haptics'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect as SvgRect, Stop } from 'react-native-svg'
import { Icon } from '@/components/Icon'
import { Pressable } from '@/components/Pressable'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/states'
import { AppText, Screen } from '@/components/ui'
import {
	challengeDifficultyMeta,
	challengeDurationLabel,
	challengeProgressFor,
	challengeTarget,
	productivityChallenges,
	type ProductivityChallenge,
} from '@/constants/groupChallenges'
import { brand, control, fontFamilies, radius, spacing, tileRadius } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import { alpha, readableOn } from '@/lib/color'
import { friendsService, type Group, type GroupHabit } from '@/lib/friends'

export default function ChallengeDetailScreen() {
	const router = useRouter()
	const { id, challengeId, locked } = useLocalSearchParams<{ id: string; challengeId: string; locked?: string }>()
	const { palette, isDark } = useLumo()
	const insets = useSafeAreaInsets()

	const challenge = React.useMemo<ProductivityChallenge | undefined>(
		() => productivityChallenges.find((item) => item.id === challengeId),
		[challengeId],
	)

	const [group, setGroup] = React.useState<Group | null>(null)
	const [loaded, setLoaded] = React.useState(false)
	const [starting, setStarting] = React.useState(false)

	const reload = React.useCallback(async () => {
		if (typeof id !== 'string') {
			setLoaded(true)
			return
		}
		const loadedGroup = await friendsService.getGroup(id)
		setGroup(loadedGroup)
		setLoaded(true)
	}, [id])

	React.useEffect(() => {
		reload()
	}, [reload])

	const isLocked = locked === '1'

	const habit = React.useMemo(() => {
		if (!group || !challenge) {
			return undefined
		}
		return group.habits.find((item) => item.name.trim().toLowerCase() === challenge.name.trim().toLowerCase())
	}, [group, challenge])

	const added = Boolean(habit)
	const progress = challenge ? challengeProgressFor(challenge, habit ? (group?.completedDaysByHabit[habit.id]?.length ?? 0) : 0) : null

	async function startChallenge() {
		if (!group || !challenge || starting || isLocked) {
			return
		}
		setStarting(true)
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined)

		const activity: GroupHabit = {
			id: `act-${Date.now().toString(36)}`,
			name: challenge.name,
			icon: challenge.icon,
			repeatSchedule: { type: 'daily' },
			goal: { type: 'once' },
		}

		const result = await friendsService.addGroupActivity(group.id, activity)
		if (result.ok) {
			Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
			await reload()
		} else {
			Alert.alert("Couldn't start the challenge", result.reason)
		}
		setStarting(false)
	}

	const accent = challenge ? challengeDifficultyMeta[challenge.difficulty].accent : palette.green

	return (
		// The trophies plate at the trophies screen's own weight — the same sky
		// the Challenges list and the Trophies shelf now sit under, so moving
		// between the three never swaps the scene out from under you.
		<Screen
			backgroundVariant='trophies'
			backgroundIntensity='medium'
			scroll={false}
			contentStyle={styles.screen}
		>
			{/* `screen` zeroes the Screen's own gutter and top padding so the inner
			    ScrollView can own them — which left the header itself flush against
			    the left edge and the safe area, out of line with every row below
			    it. It carries its own inset here. The title names where Back goes,
			    the way the habit page's does. */}
			<ScreenHeader
				title='Challenges'
				leftAction={{ icon: 'back', label: 'Back', onPress: () => router.back() }}
				style={styles.header}
			/>

			{!loaded ? (
				<ChallengeSkeleton />
			) : !challenge ? (
				<View style={styles.missing}>
					<EmptyState
						icon='award'
						title='Challenge not found'
						body='This challenge is no longer available.'
					/>
				</View>
			) : (
				<>
					<ScrollView
						showsVerticalScrollIndicator={false}
						contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
					>
						{/* Identity on the canvas: the challenge's own glyph, its name in
						    the app's display serif, then the two facts about it. The name
						    was Lexend at 26 inside a card, which made this the only page
						    in the app whose headline was not the serif. */}
						<View style={styles.hero}>
							<View style={[styles.heroIcon, { backgroundColor: alpha(accent, '24') }]}>
								<Icon
									name={challenge.icon}
									size={30}
									color={accent}
									weight='bulk'
								/>
							</View>
							<AppText
								color={palette.ink}
								style={styles.heroTitle}
							>
								{challenge.name}
							</AppText>
							<View style={styles.heroMeta}>
								{/* Tinted, not filled — the list draws the difficulty this way,
								    and a solid block of accent on open canvas outshouted the
								    title above it. */}
								<View style={[styles.chip, { backgroundColor: alpha(accent, '1F') }]}>
									<AppText
										variant='caption'
										color={accent}
										style={styles.chipText}
									>
										{challengeDifficultyMeta[challenge.difficulty].label}
									</AppText>
								</View>
								<View style={[styles.chip, { backgroundColor: alpha(palette.ink, '14') }]}>
									<AppText
										variant='caption'
										color={palette.subtle}
										style={styles.chipText}
									>
										{challengeDurationLabel(challenge)}
									</AppText>
								</View>
							</View>
						</View>

						{/* No cards. Each block used to sit on its own opaque panel because
						    the plate ran at `deep` and warm ink on that mid-lavender scene
						    was both low-contrast and clashing. At `medium` the copy reads
						    straight off the canvas, so four stacked frames around four
						    paragraphs are just frames. */}
						{/* First, before the motivation: the terms. A group standing on
						    this page is deciding whether to commit, and "Monk Mode" over a
						    paragraph about focus never told them it meant no feeds, no junk
						    food and two hours of deep work — so each member started with a
						    different idea of what they had agreed to. */}
						<View style={styles.section}>
							<SectionHeading label='What counts as done' />
							{/* The number is part of the line, not a chip beside it — the same way
							    "How it works" below numbers its steps. A tinted badge per rule turned
							    a list of terms into a row of ornaments, and on 75 Hard that was ten of
							    them down the page. */}
							<View style={styles.steps}>
								{challenge.rules.map((rule, index) => (
									<InfoRow
										key={rule}
										label={`${index + 1}. ${rule}`}
									/>
								))}
							</View>
						</View>

						<View style={styles.section}>
							<SectionHeading label='Why it matters' />
							<AppText
								variant='bodySmall'
								color={palette.body}
								style={styles.bodyText}
							>
								{challenge.why}
							</AppText>
						</View>

						<View style={styles.section}>
							<SectionHeading label="What it'll help with" />
							<View style={styles.benefits}>
								{challenge.benefits.map((benefit) => (
									<View
										key={benefit}
										style={styles.benefitRow}
									>
										<Icon
											name='checkCircle'
											size={15}
											color={palette.greenDark}
											weight='bulk'
										/>
										<AppText
											variant='bodySmall'
											color={palette.body}
											style={styles.benefitText}
										>
											{benefit}
										</AppText>
									</View>
								))}
							</View>
						</View>

						<View style={styles.section}>
							<SectionHeading label='How it works' />
							<View style={styles.steps}>
								<InfoRow label='1. Everyone in the group takes on the challenge together.' />
								<InfoRow label='2. Log it each time you do it — every check counts.' />
								<InfoRow
									label={
										challenge.goalKind === 'once'
											? '3. Log it once to complete the challenge.'
											: `3. Complete all ${challengeTarget(challenge)} days to finish it.`
									}
								/>
							</View>
							{challenge.goalKind === 'once' ? null : (
								<View style={[styles.resetNote, { backgroundColor: alpha(isDark ? palette.accent : brand.goldInk, '14') }]}>
									<Icon
										name='fire'
										size={15}
										color={isDark ? palette.accent : brand.goldInk}
										weight='bulk'
									/>
									<AppText
										variant='caption'
										color={isDark ? palette.accent : brand.goldInk}
										style={styles.resetNoteText}
									>
										Do it every day — miss a day and progress resets to 0.
									</AppText>
								</View>
							)}
						</View>
					</ScrollView>

					<View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
						<View
							pointerEvents='none'
							style={StyleSheet.absoluteFill}
						>
							<Svg
								width='100%'
								height='100%'
							>
								<Defs>
									<SvgLinearGradient
										id='footerFade'
										x1='0'
										y1='0'
										x2='0'
										y2='1'
									>
										<Stop
											offset='0'
											stopColor={palette.canvas}
											stopOpacity='0'
										/>
										<Stop
											offset='0.55'
											stopColor={palette.canvas}
											stopOpacity='1'
										/>
										<Stop
											offset='1'
											stopColor={palette.canvas}
											stopOpacity='1'
										/>
									</SvgLinearGradient>
								</Defs>
								<SvgRect
									x='0'
									y='0'
									width='100%'
									height='100%'
									fill='url(#footerFade)'
								/>
							</Svg>
						</View>
						<StartButton
							accent={accent}
							isLocked={isLocked}
							added={added}
							starting={starting}
							progressLabel={
								progress && added
									? progress.complete
										? 'Completed'
										: challenge.goalKind === 'once'
											? 'Started'
											: `In progress · ${progress.daysDone}/${progress.target}`
									: null
							}
							onPress={startChallenge}
						/>
					</View>
				</>
			)}
		</Screen>
	)
}

function SectionHeading({ label }: { label: string }) {
	const { palette } = useLumo()

	return (
		<AppText
			variant='caption'
			color={palette.muted}
			style={styles.sectionLabel}
		>
			{label.toUpperCase()}
		</AppText>
	)
}

function InfoRow({ label }: { label: string }) {
	const { palette } = useLumo()

	return (
		<AppText
			variant='bodySmall'
			color={palette.body}
			style={styles.infoLabel}
		>
			{label}
		</AppText>
	)
}

function StartButton({
	accent,
	isLocked,
	added,
	starting,
	progressLabel,
	onPress,
}: {
	/** The challenge's difficulty colour. */
	accent: string
	isLocked: boolean
	added: boolean
	starting: boolean
	progressLabel: string | null
	onPress: () => void
}) {
	const { palette } = useLumo()
	/**
	 * The challenge's OWN colour, not the app green — the icon tile and the
	 * difficulty chip above already establish it as this page's accent, and a
	 * green CTA under an orange page belonged to neither.
	 *
	 * Run through `readableOn` against white first: the four difficulty accents
	 * are not equally dark, and white on the gold (#E0AE3A) is about 1.9:1. This
	 * shades whichever one it gets until the label clears 4.5:1, so an Easy and
	 * an Extreme button are the same button in two colours rather than one
	 * legible and one not.
	 */
	const fill = readableOn(accent, '#FFFFFF', 4.5)

	if (isLocked) {
		return (
			<View style={[styles.startBtn, styles.startBtnQuiet, { backgroundColor: palette.surface, borderColor: palette.hairline }]}>
				<Icon
					name='clock'
					size={18}
					color={palette.muted}
					weight='bulk'
				/>
				<AppText
					color={palette.muted}
					style={styles.startBtnText}
				>
					Complete more to unlock
				</AppText>
			</View>
		)
	}

	if (added) {
		return (
			<View style={[styles.startBtn, styles.startBtnQuiet, { backgroundColor: palette.greenSoft, borderColor: alpha(palette.greenDark, '2E') }]}>
				<Icon
					name='checkCircle'
					size={18}
					color={palette.greenDark}
					weight='bulk'
				/>
				<AppText
					color={palette.greenDark}
					style={styles.startBtnText}
				>
					{progressLabel ?? 'Started'}
				</AppText>
			</View>
		)
	}

	return (
		<Pressable
			accessibilityRole='button'
			accessibilityLabel='Start Challenge'
			disabled={starting}
			onPress={onPress}
			style={({ pressed }) => [styles.startBtn, { backgroundColor: fill, opacity: pressed || starting ? 0.7 : 1 }]}
		>
			<AppText
				color={palette.white}
				style={styles.startBtnText}
			>
				{starting ? 'Starting…' : 'Start Challenge'}
			</AppText>
		</Pressable>
	)
}

/** Mirrors the real layout: hero glyph, title and chips, then three blocks of
 *  heading-plus-copy. Uses the app's own Skeleton rather than a second pulsing
 *  block implementation. */
function ChallengeSkeleton() {
	return (
		<View style={[styles.content, styles.skeleton]}>
			<View style={styles.hero}>
				<Skeleton
					width={72}
					height={72}
					round
				/>
				<Skeleton
					width='66%'
					height={30}
					style={styles.skeletonGapSm}
				/>
				<Skeleton
					width={160}
					height={18}
					style={styles.skeletonGapXs}
				/>
			</View>
			{[0, 1, 2].map((row) => (
				<View
					key={row}
					style={styles.section}
				>
					<Skeleton
						width={110}
						height={11}
					/>
					<Skeleton
						width='92%'
						height={12}
					/>
					<Skeleton
						width='80%'
						height={12}
					/>
				</View>
			))}
		</View>
	)
}

const styles = StyleSheet.create({
	// The inner ScrollView carries the gutter and the gaps, so `Screen` clears
	// its own — otherwise every row is inset twice.
	screen: {
		flex: 1,
		paddingHorizontal: 0,
		paddingTop: 0,
		gap: 0,
	},
	// The gutter and top inset `screen` gives up, taken back for the one row
	// that sits outside the ScrollView.
	header: {
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.lg,
	},
	missing: {
		flex: 1,
		justifyContent: 'center',
		padding: spacing.xl,
	},
	// Wider gaps than the card layout needed: with no panel edges between the
	// blocks, the space IS what separates them.
	content: {
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.sm,
		gap: spacing.xl,
	},
	hero: {
		alignItems: 'center',
		gap: spacing.xs,
	},
	// The rounded-square tile the habit card and the challenge list both give an
	// icon: a soft tint carrying a saturated glyph.
	heroIcon: {
		width: 72,
		height: 72,
		borderRadius: tileRadius(72),
		alignItems: 'center',
		justifyContent: 'center',
	},
	heroTitle: {
		fontFamily: fontFamilies.serifBlack,
		fontSize: 27,
		lineHeight: 33,
		textAlign: 'center',
		marginTop: spacing.xxs,
	},
	heroMeta: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.xs,
		marginTop: spacing.xxs,
	},
	chip: {
		borderRadius: radius.pill,
		paddingHorizontal: spacing.sm,
		paddingVertical: 3,
	},
	chipText: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 11,
		letterSpacing: 0.3,
	},
	section: {
		alignItems: 'center',
		gap: spacing.xs,
	},
	sectionLabel: {
		fontFamily: 'Lexend-Black',
		letterSpacing: 0.6,
		textAlign: 'center',
	},
	bodyText: {
		fontFamily: fontFamilies.lexend,
		lineHeight: 21,
		textAlign: 'center',
	},
	benefits: {
		alignItems: 'center',
		gap: spacing.xs,
		marginTop: spacing.xxs,
	},
	benefitRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: spacing.xs,
	},
	benefitText: {
		fontFamily: fontFamilies.lexend,
		lineHeight: 21,
		textAlign: 'center',
	},
	steps: {
		alignItems: 'center',
		gap: spacing.xs,
		marginTop: spacing.xxs,
	},
	infoLabel: {
		fontFamily: fontFamilies.lexend,
		lineHeight: 21,
		textAlign: 'center',
	},
	// A tinted strip rather than a bare line — with the cards gone this is the
	// one warning on the page and it has to hold its own against open canvas.
	resetNote: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: spacing.xs,
		borderRadius: radius.lg,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.xs,
		marginTop: spacing.xs,
	},
	resetNoteText: {
		flexShrink: 1,
		fontFamily: fontFamilies.lexendSemiBold,
		lineHeight: 18,
		textAlign: 'center',
	},
	footer: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.xxl,
		zIndex: 20,
		elevation: 20,
	},
	startBtn: {
		height: control.height,
		borderRadius: radius.pill,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: spacing.xs,
	},
	// The two inert states — locked and already started — are outlined rather
	// than filled, so only the real action carries a solid button.
	startBtnQuiet: {
		borderWidth: StyleSheet.hairlineWidth,
	},
	startBtnText: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 14,
		lineHeight: 19,
	},
	skeleton: {
		flex: 1,
	},
	skeletonGapSm: {
		marginTop: spacing.sm,
	},
	skeletonGapXs: {
		marginTop: spacing.xs,
	},
})
