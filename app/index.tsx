import { useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
	AccessibilityInfo,
	Alert,
	Animated,
	BackHandler,
	Easing,
	Image,
	PanResponder,
	Pressable,
	ScrollView,
	StyleProp,
	StyleSheet,
	View,
	ViewStyle,
	useWindowDimensions,
} from 'react-native'
import { Icon, type IconName } from '@/components/Icon'
import { Toggle } from '@/components/controls'
import { LumoMascot } from '@/components/LumoMascot'
import { mascotAspect, type MascotMood } from '@/constants/mascotAssets'
import { LumoWordmark } from '@/components/LumoWordmark'
import { AppText, fieldShadow, LoadingState, LumoInput, Screen } from '@/components/ui'
import { BACKGROUND_ASPECT, backgroundAsset } from '@/constants/backgroundAssets'
import { CHECK_INS, checkInTimeLabel, defaultCheckIns, type CheckInSchedule } from '@/constants/checkIns'
import { templateToDraft, type HabitTemplate } from '@/constants/habitTemplates'
import { brand, fontFamilies, layout, lightPalette, radius, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import { alpha, shadeWithBlack } from '@/lib/color'

/**
 * Onboarding runs on a fixed light "LUMO" look — warm cream canvas, navy ink,
 * sage-green primary actions — rather than the stored theme, because no theme
 * has been chosen yet at this point in the flow.
 */
// Onboarding runs a warmer cream than the in-app canvas (brand.cream),
// so the intro reads softer than the tracking screens that follow.
const BG = brand.cream
const INK = brand.navy
const SUB = brand.slate
const SAGE = brand.sage
const SAGE_STRONG = brand.sageStrong
const SAGE_SOFT = brand.sageSoft
const SOFT = brand.creamSoft
const LINE = brand.border
// Pure white — only for content ON a coloured fill (button labels, the check
// glyph, switch thumbs), never for surfaces.
const WHITE = '#FFFFFF'
// Card surfaces. Pure white reads cold and glaring against the warm cream
// canvas; this shares the background's warmth while still lifting off it.
// Onboarding sits on the warmer cream, so its cards are a touch warmer too.
const CARD = '#FFFCF4'
// Warm amber outline shared by the text field and selected cards, so every
// bordered surface in onboarding uses one colour rather than a per-item hue.
const FIELD_BORDER = brand.borderWarm
// Selected cards carry the darkened edge — the same state a focused field
// shows, so selection and focus read alike across the app.
const FIELD_BORDER_ACTIVE = lightPalette.hairlineStrong
// Warm sand for inactive/off states. Deliberately NOT a gray — a neutral track
// reads cold and dirty against the cream canvas. 1.5:1 keeps it present without
// competing with the active sage.
const TRACK_OFF = brand.sand

type OnboardingStep = 'welcome' | 'about' | 'profile' | 'habits' | 'reminders' | 'ready'

/** Flow order — drives back navigation, swipes, and the step counter. */
const STEP_ORDER: OnboardingStep[] = ['welcome', 'about', 'profile', 'habits', 'reminders', 'ready']

/** A horizontal drag, not an incidental diagonal one while scrolling. */
function isHorizontalSwipe(dx: number, dy: number) {
	return Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.25
}

/** Counted setup steps. Welcome and Meet Lumo are intro screens and are
 * deliberately uncounted — the indicator only tracks real setup. */
const TOTAL_STEPS = 4

const GOALS: { label: string; icon: IconName; tint: string }[] = [
	{ label: 'Feel more consistent', icon: 'sparkle', tint: brand.sage },
	{ label: 'Take better care of myself', icon: 'health', tint: brand.coral },
	{ label: 'Build a routine with friends', icon: 'friends', tint: brand.blue },
	{ label: 'Improve my focus', icon: 'taskSquare', tint: brand.lavender },
	{ label: 'Sleep better', icon: 'moon', tint: brand.lavender },
	{ label: 'Learn something new', icon: 'book', tint: brand.gold },
]

/** Curated first habits shown as a 2-up grid; each maps to a real habit draft. */
const ONBOARDING_HABITS: { template: HabitTemplate; color: string; icon: IconName; tint: string }[] = [
	{ template: { name: 'Drink more water', category: 'Health', emoji: 'drop', goal: { type: 'multiple', count: 8 } }, color: '#17A38F', icon: 'drop', tint: brand.blue },
	{ template: { name: 'Exercise', category: 'Fitness', emoji: 'fire' }, color: '#FC7A5E', icon: 'fire', tint: brand.coral },
	{ template: { name: 'Read', category: 'Learning', emoji: 'book' }, color: '#1D74E4', icon: 'book', tint: brand.gold },
	{ template: { name: 'Sleep earlier', category: 'Health', emoji: 'moon' }, color: '#5A4B9C', icon: 'moon', tint: brand.lavender },
	{ template: { name: 'Meditate', category: 'Mind', emoji: 'sparkle' }, color: '#A29FC9', icon: 'sparkle', tint: brand.mint },
	{ template: { name: 'Learn something new', category: 'Learning', emoji: 'star' }, color: '#F9941E', icon: 'star', tint: brand.gold },
]



/** Shared art height for the intro carousel pages. */
const FEATURE_ART_HEIGHT = 340

/** What you can actually do with Lumo — the intro carousel, one page each. */
const LUMO_FEATURES: { mood: MascotMood; title: string; body: string }[] = [
	{
		mood: 'together',
		title: 'Do it together',
		body: 'Share habits with friends in a group, cheer each other on, and take on challenges as a team.',
	},
	{
		mood: 'tracking',
		title: 'Track habits',
		body: 'Build routines that fit your week — daily, weekdays, or a few times a month. Checking one off takes a single tap.',
	},
	{
		mood: 'progress',
		title: 'See progress',
		body: 'Streaks, completion rates, and a weekly recap that shows where you’re winning and which day trips you up.',
	},
	{
		mood: 'journaling',
		title: 'Keep a journal',
		body: 'Write a line about your day, add a photo, note how you felt. Look back whenever you need perspective.',
	},
	{
		mood: 'trophy',
		title: 'Earn trophies',
		body: 'Milestones worth chasing. Streaks unlock badges and trophies, from your first three days to a full year.',
	},
]


// ---------------------------------------------------------------------------

function TopBar({ counter, onBack }: { counter?: number; onBack?: () => void }) {
	return (
		<View style={styles.topBarWrap}>
			<View style={styles.topBar}>
				<View style={styles.topBarLeft}>
					{onBack ? (
						<Pressable
							accessibilityRole='button'
							accessibilityLabel='Go back'
							onPress={onBack}
							hitSlop={12}
							style={styles.backButton}
						>
							<Icon name='arrowLeft' size={18} color={INK} weight='bold' />
						</Pressable>
					) : null}
					<LumoWordmark size={20} color={INK} />
				</View>
				{counter ? (
					<View
						style={styles.progressTrack}
						accessibilityRole='progressbar'
						accessibilityLabel={`Step ${counter} of ${TOTAL_STEPS}`}
						accessibilityValue={{ min: 0, max: TOTAL_STEPS, now: counter }}
					>
						{Array.from({ length: TOTAL_STEPS }, (_, index) => (
							<View key={index} style={[styles.progressSegment, { backgroundColor: index < counter ? SAGE : TRACK_OFF }]} />
						))}
					</View>
				) : null}
			</View>
		</View>
	)
}

/**
 * Pressable with manually-tracked pressed state.
 *
 * NativeWind's css-interop drops function-valued `style` props on Pressable —
 * a `({ pressed }) => [...]` style silently renders with NO styling at all.
 * Every pressable in this file therefore takes a plain style array.
 */
function PressBox({
	children,
	onPress,
	style,
	disabled = false,
	pressedOpacity = 0.85,
	accessibilityLabel,
	selected,
}: {
	children: React.ReactNode
	onPress: () => void
	style: StyleProp<ViewStyle>
	disabled?: boolean
	pressedOpacity?: number
	accessibilityLabel?: string
	selected?: boolean
}) {
	const [pressed, setPressed] = useState(false)

	return (
		<Pressable
			accessibilityRole='button'
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ disabled, selected }}
			disabled={disabled}
			onPress={onPress}
			onPressIn={() => setPressed(true)}
			onPressOut={() => setPressed(false)}
			style={[style, { opacity: disabled ? 0.45 : pressed ? pressedOpacity : 1 }]}
		>
			{children}
		</Pressable>
	)
}

function CtaButton({
	label,
	onPress,
	disabled = false,
	tone = 'primary',
	large = false,
}: {
	label: string
	onPress: () => void
	disabled?: boolean
	tone?: 'primary' | 'soft'
	/** Taller button with a bigger label — used for the welcome hero CTA. */
	large?: boolean
}) {
	const primary = tone === 'primary'

	return (
		<PressBox
			onPress={onPress}
			disabled={disabled}
			pressedOpacity={0.88}
			accessibilityLabel={label}
			// 80% alpha on the FILL only (not the whole view), so the landscape
			// shows through the button while the label stays fully opaque.
			style={[styles.button, large && styles.buttonLarge, { backgroundColor: alpha(primary ? SAGE_STRONG : SOFT, 'CC') }]}
		>
			<AppText variant='button' color={primary ? WHITE : INK} style={large ? styles.buttonLabelLarge : undefined}>
				{label}
			</AppText>
		</PressBox>
	)
}

function Title({ children, center = false, hero = false }: { children: React.ReactNode; center?: boolean; hero?: boolean }) {
	return (
		<AppText color={INK} style={[styles.title, hero && styles.titleHero, center && styles.center]}>
			{children}
		</AppText>
	)
}

function Subtitle({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
	return (
		<AppText variant='body' color={SUB} style={[styles.subtitle, center && styles.center]}>
			{children}
		</AppText>
	)
}

/** Soft rounded tile holding a category icon, tinted per item. */
function IconTile({ icon, tint, size = 34 }: { icon: IconName; tint: string; size?: number }) {
	return (
		<View style={[styles.iconTile, { width: size, height: size, backgroundColor: `${tint}24` }]}>
			<Icon name={icon} size={size * 0.55} color={tint} weight='bulk' />
		</View>
	)
}

/** Sage check badge used on selected goals and habits. */
function CheckBadge({ selected }: { selected: boolean }) {
	if (!selected) {
		return <View style={[styles.checkEmpty, { borderColor: LINE }]} />
	}
	return (
		<View style={[styles.checkFilled, { backgroundColor: SAGE }]}>
			<Icon name='check' size={13} color={WHITE} weight='bold' />
		</View>
	)
}

export default function OnboardingScreen() {
	const router = useRouter()
	const { width: screenWidth } = useWindowDimensions()
	// Big and centred on the landscape, but capped so it never crowds the
	// header copy or the CTA on small screens.
	const mascotWidth = Math.min(screenWidth * 0.86, 340)
	// The celebrate pose is landscape with generous transparent margin, so it
	// needs to overflow the screen gutter to read at a hero scale. PAD * 2
	// cancels the screen's horizontal padding; the extra pushes it wider still.
	const celebrateWidth = Math.min(screenWidth + PAD * 2 + 60, 560)
	// Aliased: the local `setCheckIns` below is this step's draft state, and an
	// unaliased import would shadow it into a silent no-op at save time.
	const {
		createHabit,
		isReady,
		hasOnboarded,
		habitLimit,
		isUnlimited,
		nickname,
		setNickname,
		setNotificationsEnabled,
		setCheckIns: saveCheckIns,
	} = useLumo()
	// Read from the context rather than importing FREE_HABIT_LIMIT, so this
	// can't drift from the cap the rest of the app enforces. A fresh install
	// owns no habits, so the whole allowance is available here.
	const habitCap = isUnlimited ? ONBOARDING_HABITS.length : habitLimit
	const [step, setStep] = useState<OnboardingStep>('welcome')
	const [nicknameDraft, setNicknameDraft] = useState(nickname)
	const [goal, setGoal] = useState<string | null>(null)
	const [selected, setSelected] = useState<Set<string>>(() => new Set())
	// Pre-ticked, unlike the all-off default the rest of the app starts from:
	// this step is where the nudges are being offered, so the two most useful
	// slots come suggested rather than needing to be discovered.
	const [checkIns, setCheckIns] = useState<CheckInSchedule>({
		...defaultCheckIns,
		morning: true,
		evening: true,
	})
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		if (isReady && hasOnboarded) {
			router.replace('/(tabs)/today')
		}
	}, [hasOnboarded, isReady, router])

	// Android hardware back walks the flow backwards instead of leaving the app.
	useEffect(() => {
		const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
			const index = STEP_ORDER.indexOf(step)
			if (index > 0) {
				setStep(STEP_ORDER[index - 1])
				return true
			}
			return false
		})
		return () => subscription.remove()
	}, [step])

	// --- step slide transition -------------------------------------------------
	// Incoming step slides in from the side you're travelling toward, so back and
	// forward feel directional rather than identical.
	const slide = React.useRef(new Animated.Value(1)).current
	const slideFrom = React.useRef<'next' | 'previous'>('next')
	const [reduceMotion, setReduceMotion] = useState(false)

	useEffect(() => {
		let active = true
		AccessibilityInfo.isReduceMotionEnabled()
			.then((enabled) => {
				if (active) {
					setReduceMotion(enabled)
				}
			})
			.catch(() => undefined)
		const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
		return () => {
			active = false
			subscription.remove()
		}
	}, [])

	useEffect(() => {
		if (reduceMotion) {
			slide.setValue(1)
			return
		}
		slide.setValue(0)
		Animated.timing(slide, {
			toValue: 1,
			duration: 260,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: true,
		}).start()
	}, [step, reduceMotion, slide])

	const [featureIndex, setFeatureIndex] = useState(0)

	// One landscape backdrop across the whole flow, bottom-anchored and held
	// well back so it never competes with the content on top of it.
	const onboardingBackdrop = (
		<View style={StyleSheet.absoluteFill} pointerEvents='none'>
			<Image
				source={backgroundAsset('today')}
				style={{
					position: 'absolute',
					bottom: 0,
					width: screenWidth,
					height: screenWidth / BACKGROUND_ASPECT,
					opacity: 0.22,
				}}
				resizeMode='cover'
			/>
		</View>
	)

	// Leaving the intro unmounts the carousel, so it remounts scrolled to page 0
	// — but featureIndex would still hold the last page, leaving the dots out of
	// sync with what's on screen. Reset it whenever the step is entered.
	useEffect(() => {
		if (step === 'about') {
			setFeatureIndex(0)
		}
	}, [step])

	// Created once; reads the current handlers via ref so it never goes stale.
	const navRef = React.useRef({ back: () => {}, next: () => {} })
	const swipeResponder = React.useMemo(
		() =>
			PanResponder.create({
				onMoveShouldSetPanResponder: (_, gesture) => isHorizontalSwipe(gesture.dx, gesture.dy),
				onPanResponderRelease: (_, gesture) => {
					if (gesture.dx > 56 || gesture.vx > 0.6) {
						navRef.current.back()
					} else if (gesture.dx < -56 || gesture.vx < -0.6) {
						navRef.current.next()
					}
				},
				onPanResponderTerminationRequest: () => false,
			}),
		[],
	)

	if (!isReady || hasOnboarded) {
		return <LoadingState />
	}

	/**
	 * Selection is capped at what a free account can actually keep. Onboarding
	 * used to let all six be picked and then created them all, which handed new
	 * users double the free limit and left them permanently over it — the caps
	 * only bite on creation, so nothing ever pulled those extras back.
	 *
	 * Deselecting is never blocked, only adding past the cap.
	 */
	function toggleHabit(name: string) {
		setSelected((current) => {
			const next = new Set(current)
			if (next.has(name)) {
				next.delete(name)
				return next
			}
			if (next.size >= habitCap) {
				return current
			}
			next.add(name)
			return next
		})
	}

	function continueFromProfile() {
		const clean = nicknameDraft.trim()
		if (!clean) {
			Alert.alert('One quick thing', 'What should Lumo call you?')
			return
		}
		if (!goal) {
			Alert.alert('Pick a goal', 'Choose what you’d like to focus on.')
			return
		}
		setNickname(clean)
		navigate('habits')
	}

	// First word only — a full "Bebz Lingga" would push the title to four lines.
	const firstName = nicknameDraft.trim().split(/\s+/)[0]

	/** Single entry point for step changes, so direction is always recorded. */
	function navigate(next: OnboardingStep) {
		slideFrom.current = STEP_ORDER.indexOf(next) > STEP_ORDER.indexOf(step) ? 'next' : 'previous'
		setStep(next)
	}

	function goBack() {
		const index = STEP_ORDER.indexOf(step)
		if (index > 0) {
			navigate(STEP_ORDER[index - 1])
		}
	}

	/**
	 * Forward navigation runs the same guards as the CTA, so a swipe can never
	 * skip a required field. The final step is excluded on purpose — it commits
	 * habits and permissions, which shouldn't be triggerable by a stray gesture.
	 */
	function goNext() {
		switch (step) {
			case 'welcome':
				return navigate('about')
			case 'about':
				return navigate('profile')
			case 'profile':
				return continueFromProfile()
			case 'habits':
				return continueFromHabits()
			case 'reminders':
				return navigate('ready')
			default:
				return undefined
		}
	}

	navRef.current = { back: goBack, next: goNext }
	const canGoBack = STEP_ORDER.indexOf(step) > 0
	const slideStyle = {
		opacity: slide,
		transform: [
			{
				translateX: slide.interpolate({
					inputRange: [0, 1],
					outputRange: [slideFrom.current === 'next' ? screenWidth * 0.28 : -screenWidth * 0.28, 0],
				}),
			},
		],
	}

	function continueFromHabits() {
		if (selected.size === 0) {
			Alert.alert('Pick at least one', 'Choose a habit or two to get started — you can add more later.')
			return
		}
		navigate('reminders')
	}

	async function finish() {
		if (busy) {
			return
		}
		setBusy(true)
		try {
			// Save WHICH slots were picked, not just that some were. Before this
			// the four toggles only decided whether to ask for permission — the
			// times were never scheduled, so a nudge never actually arrived.
			// Storing them is enough: the provider reconciles the OS schedule
			// against this the moment it changes.
			await saveCheckIns(checkIns)

			if (Object.values(checkIns).some(Boolean)) {
				try {
					await setNotificationsEnabled(true)
				} catch {
					// Permission declined — carry on; they can enable it later.
				}
			}
			// Sliced as well as capped in the picker: `createHabit` enforces no
			// limit of its own, so this loop is the last thing standing between a
			// stale selection and an account that starts over its allowance.
			let created = 0
			for (const item of ONBOARDING_HABITS) {
				if (created >= habitCap) {
					break
				}
				if (selected.has(item.template.name)) {
					await createHabit(templateToDraft(item.template, item.color))
					created += 1
				}
			}
			router.replace('/(tabs)/today')
		} finally {
			setBusy(false)
		}
	}

	// 01 — Welcome
	if (step === 'welcome') {
		return (
			<Screen
				scroll={false}
				background={BG}
				contentStyle={[styles.screen, slideStyle]}
				gestureHandlers={swipeResponder.panHandlers}
				// The landscape IS the app background here — no scrim, no separate
				// header surface. Sized to the plate's own aspect at full width and
				// pinned to the BOTTOM, so the hills and foliage always stay in frame
				// and any overflow crops off the (empty) sky instead.
				backgroundNode={onboardingBackdrop}
			>
				<View style={styles.welcomeWordmark}>
					{/* True black + wide tracking so the wordmark reads as a logotype
					    here, not as another navy UI label. */}
					<LumoWordmark size={22} color='#000000' style={styles.welcomeWordmarkText} />
				</View>

				<View style={styles.welcomeCopy}>
					<Title center hero>{'Small habits,\nbrighter days.'}</Title>
					<Subtitle center>Build routines that feel good — and keep going with people you care about.</Subtitle>
				</View>

				<View style={styles.welcomeMascot}>
					<LumoMascot mood='happy' width={mascotWidth} animated />
				</View>

				<View style={styles.welcomeBottom}>
					<CtaButton label='Meet Lumo' onPress={() => navigate('about')} large />
				</View>
			</Screen>
		)
	}

	// 02 — Meet Lumo (intro, uncounted — same hero treatment as Welcome)
	if (step === 'about') {
		return (
			<Screen
				scroll={false}
				background={BG}
				contentStyle={[styles.screen, slideStyle]}
				// No step-swipe here: this screen's horizontal gesture belongs to the
				// feature carousel. The screen-level PanResponder refuses to yield
				// (onPanResponderTerminationRequest -> false), so attaching both means
				// the step always wins and the carousel never pages.
				backgroundNode={onboardingBackdrop}
			>
				<View style={styles.welcomeWordmark}>
					<LumoWordmark size={22} color='#000000' style={styles.welcomeWordmarkText} />
				</View>

				<View style={styles.welcomeCopy}>
					<Title center hero>Meet Lumo.</Title>
					<Subtitle center>Your little spark of motivation. Here’s what you can do together.</Subtitle>
				</View>

				{/* One feature per page. This ScrollView claims horizontal drags
				    before the screen-level step responder (child wins the RN
				    responder negotiation), so the two never fight. */}
				<ScrollView
					horizontal
					pagingEnabled
					showsHorizontalScrollIndicator={false}
					decelerationRate='fast'
					onMomentumScrollEnd={(event) => setFeatureIndex(Math.round(event.nativeEvent.contentOffset.x / screenWidth))}
					style={styles.featureCarousel}
				>
					{LUMO_FEATURES.map((feature, index) => (
						<View key={feature.title} style={[styles.featurePage, { width: screenWidth }]}>
							{/* Width is derived from each pose's own aspect so every page's
							    art lands at the same visual height. */}
							<View style={styles.featureArt}>
								{/* Only the page you're looking at animates — five idle loops
								    running off-screen is wasted work. */}
								<LumoMascot
									mood={feature.mood}
									width={FEATURE_ART_HEIGHT * mascotAspect(feature.mood)}
									animated={index === featureIndex}
								/>
							</View>
							<AppText color={INK} style={styles.featurePageTitle}>
								{feature.title}
							</AppText>
							<AppText variant='caption' color={SUB} style={styles.aboutBody}>
								{feature.body}
							</AppText>
						</View>
					))}
				</ScrollView>

				<View style={styles.featureDots}>
					{LUMO_FEATURES.map((feature, index) => (
						<View
							key={feature.title}
							style={[styles.featureDot, { backgroundColor: index === featureIndex ? SAGE : TRACK_OFF }]}
						/>
					))}
				</View>
				<View style={styles.welcomeBottom}>
					<CtaButton label='Get started' onPress={() => navigate('profile')} large />
				</View>
			</Screen>
		)
	}

	// 03 — Your profile
	if (step === 'profile') {
		return (
			<Screen
				scroll={false}
				background={BG}
				contentStyle={[styles.screen, slideStyle]}
				gestureHandlers={swipeResponder.panHandlers}
				backgroundNode={onboardingBackdrop}
			>
				<TopBar counter={1} onBack={canGoBack ? goBack : undefined} />
				<ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.body} keyboardShouldPersistTaps='handled'>
					<Title>Let’s get to know you.</Title>
					<Subtitle>This helps make Lumo feel a little more personal.</Subtitle>

					<View style={styles.field}>
						<AppText variant='caption' color={INK} style={styles.fieldLabel}>
							What should we call you?
						</AppText>
						<LumoInput
							value={nicknameDraft}
							onChangeText={setNicknameDraft}
							placeholder='Your name'
							autoCapitalize='words'
							autoFocus
							returnKeyType='done'
							style={[styles.input, styles.cardShadow]}
						/>
					</View>

					<View style={styles.field}>
						<AppText variant='caption' color={INK} style={styles.fieldLabel}>
							What’s your goal?
						</AppText>
						<View style={styles.optionList}>
							{GOALS.map((option) => {
								const active = goal === option.label
								return (
									<PressBox
										key={option.label}
										selected={active}
										accessibilityLabel={option.label}
										onPress={() => setGoal(option.label)}
										style={[styles.optionRow, styles.cardShadow, active && { borderColor: FIELD_BORDER_ACTIVE }]}
									>
										<IconTile icon={option.icon} tint={option.tint} />
										<AppText variant='bodySmall' color={INK} style={styles.optionText}>
											{option.label}
										</AppText>
										{active ? <Icon name='check' size={18} color={shadeWithBlack(option.tint, 0.55)} weight='bold' /> : null}
									</PressBox>
								)
							})}
						</View>
					</View>
				</ScrollView>
				<View style={styles.bottom}>
					<CtaButton label='Continue' onPress={continueFromProfile} disabled={!nicknameDraft.trim() || !goal} />
				</View>
			</Screen>
		)
	}

	// 04 — Choose habits
	if (step === 'habits') {
		return (
			<Screen
				scroll={false}
				background={BG}
				contentStyle={[styles.screen, slideStyle]}
				gestureHandlers={swipeResponder.panHandlers}
				backgroundNode={onboardingBackdrop}
			>
				<TopBar counter={2} onBack={canGoBack ? goBack : undefined} />
				<ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
					<Title>{firstName ? `${firstName}, what would you like to work on?` : 'What would you like to work on?'}</Title>
					<Subtitle>
						{selected.size >= habitCap
							? `That's your ${habitCap}. Deselect one to swap it, or add more later.`
							: `Pick up to ${habitCap}. You can always edit more later.`}
					</Subtitle>

					<View style={styles.chipGrid}>
						{ONBOARDING_HABITS.map((item) => {
							const active = selected.has(item.template.name)
							// Dim what can no longer be added, so the cap is visible before
							// a tap does nothing rather than only after.
							const blocked = !active && selected.size >= habitCap
							return (
								<PressBox
									key={item.template.name}
									selected={active}
									accessibilityLabel={item.template.name}
									disabled={blocked}
									onPress={() => toggleHabit(item.template.name)}
									style={[
										styles.chip,
										styles.cardShadow,
										active && { borderColor: FIELD_BORDER_ACTIVE },
										blocked && { opacity: 0.45 }
									]}
								>
									<IconTile icon={item.icon} tint={item.tint} />
									<AppText variant='bodySmall' color={INK} numberOfLines={1} style={styles.chipText}>
										{item.template.name}
									</AppText>
									<CheckBadge selected={active} />
								</PressBox>
							)
						})}
					</View>
				</ScrollView>
				<View style={styles.bottom}>
					<CtaButton label='Continue' onPress={continueFromHabits} disabled={selected.size === 0} />
				</View>
			</Screen>
		)
	}

	// 05 — Reminders
	if (step === 'reminders') {
		return (
			<Screen
				scroll={false}
				background={BG}
				contentStyle={[styles.screen, slideStyle]}
				gestureHandlers={swipeResponder.panHandlers}
				backgroundNode={onboardingBackdrop}
			>
				<TopBar counter={3} onBack={canGoBack ? goBack : undefined} />
				<ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
					<Title>Want a little nudge?</Title>
					<Subtitle>Pick the moments you want Lumo to check in. You can change these anytime.</Subtitle>

					<View style={styles.reminderList}>
						{CHECK_INS.map((checkIn) => (
							<View key={checkIn.key} style={[styles.reminderRow, styles.cardShadow]}>
								<IconTile icon={checkIn.icon} tint={checkIn.tint} />
								<View style={styles.reminderText}>
									<AppText variant='bodySmall' color={INK} style={styles.reminderName}>
										{checkIn.label}
									</AppText>
									<AppText variant='caption' color={SUB} style={styles.reminderTime}>
										{checkInTimeLabel(checkIn)}
									</AppText>
								</View>
								{/* The shared Toggle, not RN's Switch — the native iOS switch
								    renders translucent and reads as glass on this canvas. */}
								<Toggle
									value={checkIns[checkIn.key]}
									onValueChange={(next) => setCheckIns((current) => ({ ...current, [checkIn.key]: next }))}
									accessibilityLabel={checkIn.label}
									onColor={SAGE}
									offColor={TRACK_OFF}
								/>
							</View>
						))}
					</View>

				</ScrollView>
				<View style={styles.bottom}>
					<CtaButton label='Continue' onPress={() => navigate('ready')} />
				</View>
			</Screen>
		)
	}

	// 06 — Ready

	return (
		<Screen
			scroll={false}
			background={BG}
			contentStyle={[styles.screen, slideStyle]}
			gestureHandlers={swipeResponder.panHandlers}
			backgroundNode={onboardingBackdrop}
		>
			<TopBar counter={4} onBack={canGoBack ? goBack : undefined} />
			{/* Scrollable rather than a fixed centred column: the badge + mascot +
			    summary stack is tall enough to clip on smaller phones. */}
			<ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.readyBody}>
				<LumoMascot mood='celebrating' width={celebrateWidth} animated />
				<View style={styles.readyCopy}>
					<Title center hero>{'You’re ready\nto shine.'}</Title>
					<Subtitle center>Your first win is just one check-in away.</Subtitle>
				</View>
			</ScrollView>
			<View style={styles.bottom}>
				<CtaButton label={busy ? 'Setting up…' : 'Let’s go'} onPress={finish} disabled={busy} />
			</View>
		</Screen>
	)
}

/** Horizontal gutter for every onboarding step — roomier than the in-app
 * screens, so the flow reads as a wide, uncluttered intro. */
const PAD = layout.screenPaddingX

const styles = StyleSheet.create({
	screen: {
		flexGrow: 1,
		paddingHorizontal: PAD,
		paddingTop: spacing.md,
		paddingBottom: spacing.lg,
		gap: 0,
	},
	topBarWrap: {
		gap: spacing.sm,
		marginBottom: spacing.lg,
	},
	topBar: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		minHeight: 32,
	},
	topBarLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
	},
	backButton: {
		marginLeft: -spacing.xxs,
	},
	// Compact step indicator sitting where the "N of 5" label used to be —
	// five short pills rather than a full-width bar.
	progressTrack: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
	},
	progressSegment: {
		width: 14,
		height: 4,
		borderRadius: 2,
	},
	// The ScrollView clips content to its own frame, which would slice the card
	// shadows off at the edges. Bleed the scroller out past the screen gutter
	// and put that inset back on the content, so shadows have room to render.
	scroll: {
		flex: 1,
		marginHorizontal: -PAD,
		marginTop: -spacing.sm,
	},
	body: {
		gap: spacing.xs,
		paddingHorizontal: PAD,
		paddingTop: spacing.sm,
		paddingBottom: spacing.xl,
	},
	center: {
		textAlign: 'center',
	},
	// Koh Santepheap (serif) for headline copy — a deliberate contrast against
	// the rounded Lexend used for every other UI string.
	title: {
		fontFamily: fontFamilies.serifBlack,
		fontSize: 36,
		lineHeight: 41,
	},
	// The two intro screens carry a larger display size than the setup steps.
	titleHero: {
		fontSize: 42,
		lineHeight: 48,
	},
	subtitle: {
		fontSize: 15,
		lineHeight: 22,
		maxWidth: 340,
	},

	// --- welcome ---
	// The welcome step has no TopBar — the centred wordmark stands in for it.
	welcomeWordmarkText: {
		letterSpacing: 2,
	},
	welcomeWordmark: {
		alignItems: 'center',
		marginTop: spacing.md,
	},
	welcomeCopy: {
		gap: spacing.xs,
		alignItems: 'center',
		marginTop: spacing.lg,
	},
	welcomeMascot: {
		flex: 1,
		alignItems: 'center',
		// Biased below centre so the mascot stands on the hills rather than
		// floating in the middle of the sky.
		justifyContent: 'center',
		paddingTop: spacing.hero,
	},

	// Cards carry depth with a soft shadow instead of a hairline border.
	cardShadow: {
		shadowColor: INK,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.07,
		shadowRadius: 12,
		elevation: 2,
	},

	// --- meet lumo ---

	// --- meet lumo carousel ---
	// Bleeds past the screen gutter so each page is exactly one screen wide,
	// which is what makes `pagingEnabled` snap cleanly.
	featureCarousel: {
		flex: 1,
		marginHorizontal: -PAD,
		marginTop: spacing.lg,
	},
	// Art sits centred in the space above; the copy is pinned to the bottom so
	// every page's text baseline lines up as you swipe.
	featurePage: {
		alignItems: 'center',
		justifyContent: 'flex-end',
		gap: spacing.sm,
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.hero,
	},
	featureArt: {
		flex: 1,
		justifyContent: 'center',
	},
	// Serif, matching the screen headers rather than the UI sans.
	featurePageTitle: {
		fontFamily: fontFamilies.serifBlack,
		fontSize: 19,
		lineHeight: 25,
		textAlign: 'center',
	},
	featureDots: {
		flexDirection: 'row',
		alignSelf: 'center',
		gap: spacing.xs,
		marginTop: spacing.md,
	},
	featureDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	aboutBody: {
		fontFamily: fontFamilies.lexend,
		fontSize: 14,
		lineHeight: 21,
		textAlign: 'center',
		maxWidth: 300,
	},

	// --- shared controls ---
	field: {
		gap: spacing.sm,
		marginTop: spacing.lg,
	},
	// Form labels are navy and a step up in size/weight from caption, so they
	// read as headings for their field rather than muted helper text.
	fieldLabel: {
		fontFamily: fontFamilies.lexendSemiBold,
		fontSize: 15,
		lineHeight: 20,
	},
	input: {
		// Border colour is left to LumoInput: transparent at rest, the warm
		// darkened edge on focus.
		borderWidth: 1,
		borderRadius: radius.button,
		backgroundColor: CARD,
		paddingHorizontal: spacing.md,
		minHeight: 52,
		fontFamily: fontFamilies.lexendSemiBold,
		...fieldShadow,
	},
	iconTile: {
		borderRadius: radius.lg,
		alignItems: 'center',
		justifyContent: 'center',
	},
	optionList: {
		gap: spacing.xxs,
	},
	optionRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
		backgroundColor: CARD,
		// Border is always present, just transparent when unselected — otherwise
		// selecting a row would shift the layout by 2pt.
		borderWidth: 1,
		borderColor: 'transparent',
		borderRadius: radius.card,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
		minHeight: 66,
	},
	optionText: {
		flex: 1,
		fontFamily: fontFamilies.lexendMedium,
	},
	checkEmpty: {
		width: 20,
		height: 20,
		borderRadius: radius.pill,
		borderWidth: 2,
	},
	checkFilled: {
		width: 20,
		height: 20,
		borderRadius: radius.pill,
		alignItems: 'center',
		justifyContent: 'center',
	},

	// --- habits grid ---
	// One habit per row — matches the goal list on the previous step, and gives
	// longer names room instead of wrapping them inside a half-width tile.
	chipGrid: {
		gap: spacing.xxs,
		marginTop: spacing.lg,
	},
	chip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
		backgroundColor: CARD,
		borderWidth: 1,
		borderColor: 'transparent',
		borderRadius: radius.card,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
		minHeight: 66,
	},
	chipText: {
		flex: 1,
		fontFamily: fontFamilies.lexendMedium,
		fontSize: 15,
		lineHeight: 20,
	},


	// --- reminders ---
	// Each check-in is its own card, matching the goal and habit lists.
	reminderList: {
		gap: spacing.xxs,
		marginTop: spacing.lg,
	},
	reminderRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
		backgroundColor: CARD,
		borderRadius: radius.card,
		borderWidth: 1,
		borderColor: 'transparent',
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
	},
	reminderText: {
		flex: 1,
		gap: 2,
	},
	reminderName: {
		fontFamily: fontFamilies.lexendSemiBold,
	},
	// The time is supporting detail — held back so the label leads.
	reminderTime: {
		opacity: 0.65,
	},

	// --- ready ---
	// flexGrow + centred justify keeps the stack vertically centred on tall
	// screens while still scrolling when it runs out of room on short ones.
	readyBody: {
		flexGrow: 1,
		alignItems: 'center',
		justifyContent: 'center',
		gap: spacing.md,
		paddingBottom: spacing.lg,
	},
	readyCopy: {
		alignItems: 'center',
		gap: spacing.xs,
	},

	// --- bottom ---
	// Shared by steps 1–5. The bottom inset lifts the CTA clear of the screen
	// edge so it doesn't read as a docked footer bar.
	bottom: {
		gap: spacing.sm,
		paddingTop: spacing.lg,
		paddingBottom: spacing.sm,
	},
	// Welcome CTA sits higher than the other steps' so it clears the bottom
	// edge and reads as part of the hero rather than a docked footer. The extra
	// horizontal inset keeps it from spanning the full width like a form button.
	welcomeBottom: {
		gap: spacing.sm,
		paddingTop: spacing.lg,
		paddingBottom: spacing.xl,
		paddingHorizontal: spacing.md,
	},
	button: {
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: radius.pill,
		minHeight: 54,
		paddingHorizontal: spacing.xl,
	},
	buttonLarge: {
		minHeight: 62,
		borderRadius: radius.card,
	},
	buttonLabelLarge: {
		fontSize: 16,
		lineHeight: 21,
	},
})
