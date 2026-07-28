import { useRouter } from 'expo-router'
import React, { useState } from 'react'
import { LayoutAnimation, Linking, Platform, Pressable, StyleSheet, UIManager, View } from 'react-native'
import { Icon } from '@/components/Icon'
import { ScreenHeader } from '@/components/ScreenHeader'
import { AppText, Card, Screen } from '@/components/ui'
import { fontFamilies, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
	UIManager.setLayoutAnimationEnabledExperimental(true)
}

const LUMO_FACEBOOK_URL = 'https://www.facebook.com/lumo.habittracker/'

type Faq = { question: string; answer: string }

const FAQS: Faq[] = [
	{
		question: 'What is Lumo?',
		answer:
			'Lumo is a gentle, private habit tracker. It helps you keep small daily habits visible, capture how each day went in a journal, and watch your progress build over time — without pressure or noise.',
	},
	{
		question: 'Where is my data stored?',
		answer:
			'Everything stays on this device by default. If you enable Share with Friends, only your nickname, avatar, and progress numbers sync — your habits, journal entries, and photos never leave your device.',
	},
	{
		question: 'How do I create a habit?',
		answer:
			'Open the Habits tab and tap the plus button. Give the habit a name, pick an icon and category, choose how often it should happen, and set an optional reminder. You can edit or delete it any time.',
	},
	{
		question: 'How much does Lumo cost?',
		answer:
			'Habits, journals, stats, and themes are all free with no caps. Only the social features — like Friends — need a ₱49/month subscription, which covers their server costs. Cancel anytime in the App Store.',
	},
	{
		question: 'How do streaks work?',
		answer:
			'A streak counts the consecutive days you complete a habit on schedule. Miss a scheduled day and the streak resets, but your overall history stays intact so you can always start a new run.',
	},
	{
		question: 'Can I complete a habit more than once a day?',
		answer: "Yes. When you set a habit's goal to a daily target (for example, drink water three times), Lumo tracks each completion and fills your daily progress ring gradually as you go.",
	},
	{
		question: 'What is the journal for?',
		answer:
			'The journal gives you one entry per day to reflect. Add a title and note, set a mood, attach a photo, or dictate with your voice. It is a quiet place to record how the day actually felt.',
	},
	{
		question: 'How do reminders work?',
		answer: 'Enable notifications in Settings, then add a reminder time to any habit. Lumo schedules a gentle local prompt at that time. Reminders live on your device and never leave it.',
	},
	{
		question: 'How do I back up or move my data?',
		answer:
			'In Settings under Data you can export a backup file, import one onto a new device, or turn on automatic backups. Because your data is local, keeping a backup is the best way to protect it.',
	},
	{
		question: 'What happens when I delete a habit?',
		answer: 'Deleted habits move to Trash rather than disappearing immediately. From there you can restore a habit or remove it permanently once you are sure you no longer need it.',
	},
	{
		question: 'Can I change how Lumo looks?',
		answer: 'Yes. Settings lets you switch between light and dark mode and choose an accent color that carries across the whole app, so Lumo can match your taste and the light you are in.',
	},
]

export default function FaqsScreen() {
	const router = useRouter()
	const { palette } = useLumo()
	const [openIndices, setOpenIndices] = useState<Set<number>>(() => new Set())

	function toggle(index: number) {
		LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
		setOpenIndices((current) => {
			const next = new Set(current)
			if (next.has(index)) {
				next.delete(index)
			} else {
				next.add(index)
			}
			return next
		})
	}

	function openCommunity() {
		Linking.openURL(LUMO_FACEBOOK_URL).catch(() => undefined)
	}

	return (
		<Screen contentStyle={styles.content}>
			<ScreenHeader
				leftAction={{ icon: 'back', label: 'Back', onPress: () => router.back() }}
				centerContent={
					<AppText
						variant='titleSmall'
						color={palette.ink}
						style={styles.headerTitle}
					>
						FAQs
					</AppText>
				}
			/>

			<AppText
				variant='bodySmall'
				color={palette.subtle}
				style={styles.intro}
			>
				Curious about something? Tap any question to unfold the answer — and if it's not covered here, the Lumo community is always happy to help.
			</AppText>

			<View style={styles.list}>
				{FAQS.map((item, index) => {
					const expanded = openIndices.has(index)

					return (
						<Card
							key={item.question}
							style={styles.card}
						>
							<Pressable
								accessibilityRole='button'
								accessibilityState={{ expanded }}
								accessibilityLabel={item.question}
								onPress={() => toggle(index)}
								style={({ pressed }) => [styles.cardHeader, { opacity: pressed ? 0.75 : 1 }]}
							>
								<View style={styles.questionCol}>
									<AppText
										variant='bodySmall'
										color={palette.ink}
										style={styles.question}
									>
										{item.question}
									</AppText>

									<AppText style={[styles.iconCol, { transform: [{ rotate: expanded ? '180deg' : '0deg' }] }]}>
										<Icon
											name='chevronDown'
											size={18}
											color={palette.subtle}
											weight='bulk'
										/>
									</AppText>
								</View>
							</Pressable>
							{expanded ? (
								<AppText
									variant='bodySmall'
									color={palette.subtle}
									style={styles.answer}
								>
									{item.answer}
								</AppText>
							) : null}
						</Card>
					)
				})}
			</View>

			<Pressable
				accessibilityRole='link'
				accessibilityLabel='Visit the Lumo community'
				onPress={openCommunity}
				style={({ pressed }) => [styles.footer, { opacity: pressed ? 0.75 : 1 }]}
			>
				<AppText
					variant='bodySmall'
					color={palette.subtle}
					style={styles.footerText}
				>
					Still have questions? Please visit the{' '}
					<AppText
						variant='bodySmall'
						color={palette.greenDark}
						style={styles.footerLink}
					>
						community
					</AppText>
					.
				</AppText>
			</Pressable>
		</Screen>
	)
}

const styles = StyleSheet.create({
	content: {
		paddingBottom: spacing.xxl,
	},
	headerTitle: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 22,
		lineHeight: 28,
		transform: [{ translateY: -9 }],
	},
	intro: {
		fontSize: 15,
		lineHeight: 21,
		marginTop: -spacing.xs,
		marginBottom: spacing.sm,
	},
	list: {
		gap: spacing.sm,
	},
	card: {
		gap: spacing.xs,
	},
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: spacing.md,
	},
	questionCol: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		minWidth: 0,
	},
	question: {
		fontFamily: fontFamilies.lexendSemiBold,
		fontSize: 15,
		lineHeight: 21,
	},
	iconCol: {
		width: 24,
		alignItems: 'center',
		justifyContent: 'center',
	},
	answer: {
		lineHeight: 20,
		fontSize: 15,
	},
	footer: {
		marginTop: spacing.xl,
		alignItems: 'center',
	},
	footerText: {
		textAlign: 'center',
		lineHeight: 20,
		marginTop: 20,
	},
	footerLink: {
		fontFamily: fontFamilies.lexendSemiBold,
	},
})
