import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import React from 'react'
import { Alert, Animated, StyleSheet, View } from 'react-native'
import { Icon } from '@/components/Icon'
import { AppText, LoadingState, Screen } from '@/components/ui'
import { fontFamilies, radius, rowRadius, spacing, tileRadius } from '@/constants/theme'
import { starterPacks, templateToDraft, type HabitTemplate, type StarterPack } from '@/constants/habitTemplates'
import { useLumo } from '@/context/LumoContext'
import { alpha, readableOn } from '@/lib/color'
import { totalCompletions } from '@/lib/habitMath'
import { Pressable } from '@/components/Pressable'

function templateKey(pack: StarterPack, template: HabitTemplate) {
	return `${pack.id}::${template.name}`
}

export default function TemplatesScreen() {
	const router = useRouter()
	const { habits, isReady, palette, createHabit, permanentlyDeleteHabit, canCreateHabit, habitLimit, ownedHabitCount, isUnlimited } = useLumo()
	// Habits already in the app (by name) count as "added" so the same routine
	// can't be duplicated from a pack.
	const existingNames = React.useMemo(() => new Set(habits.map((habit) => habit.name.trim().toLowerCase())), [habits])
	const [added, setAdded] = React.useState<Set<string>>(() => new Set())

	const isAdded = React.useCallback(
		(pack: StarterPack, template: HabitTemplate) => existingNames.has(template.name.trim().toLowerCase()) || added.has(templateKey(pack, template)),
		[existingNames, added],
	)

	// The live habit behind a template row, so cancelling can check its progress.
	const habitByName = React.useMemo(() => {
		const byName = new Map<(typeof habits)[number]['name'], (typeof habits)[number]>()
		habits.forEach((habit) => byName.set(habit.name.trim().toLowerCase(), habit))
		return byName
	}, [habits])

	if (!isReady) {
		return <LoadingState />
	}

	/**
	 * The free cap has to be enforced here as well as on the habit form: packs
	 * call `createHabit` directly, so gating only the form would have left a
	 * door where a free account could add five habits at a time.
	 */
	function blockedByLimit() {
		if (canCreateHabit) {
			return false
		}

		Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined)
		Alert.alert(
			'Habit limit reached',
			`Free accounts keep up to ${habitLimit} habits. Unlock unlimited habits and journal entries to add more.`,
			[
				{ text: 'Not now', style: 'cancel' },
				{ text: 'See options', onPress: () => router.push('/habit/new') },
			],
		)

		return true
	}

	async function addOne(pack: StarterPack, template: HabitTemplate) {
		if (isAdded(pack, template) || blockedByLimit()) {
			return
		}
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined)
		await createHabit(templateToDraft(template, pack.color))
		setAdded((current) => new Set(current).add(templateKey(pack, template)))
	}

	// Long-press undoes an add. Guarded on progress: a habit you have already
	// logged against is real history, so it stays and has to be removed from its
	// own screen instead.
	async function cancelOne(pack: StarterPack, template: HabitTemplate) {
		const habit = habitByName.get(template.name.trim().toLowerCase())

		if (!habit) {
			return
		}

		if (totalCompletions(habit) > 0) {
			Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined)
			Alert.alert('Already underway', `You have logged progress on "${habit.name}", so it stays in your habits. You can archive or delete it from the habit itself.`)
			return
		}

		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined)
		await permanentlyDeleteHabit(habit.id)
		setAdded((current) => {
			const next = new Set(current)
			next.delete(templateKey(pack, template))
			return next
		})
	}

	async function addPack(pack: StarterPack) {
		const pending = pack.habits.filter((template) => !isAdded(pack, template))
		if (pending.length === 0 || blockedByLimit()) {
			return
		}

		// A pack can be bigger than the room left, so it is trimmed to fit
		// rather than refused outright — adding three of five is more use than
		// adding none, and the wall is met on the next tap.
		const room = isUnlimited ? pending.length : Math.max(0, habitLimit - ownedHabitCount)
		const adding = pending.slice(0, room)

		Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
		for (const template of adding) {
			await createHabit(templateToDraft(template, pack.color))
		}
		setAdded((current) => {
			const next = new Set(current)
			adding.forEach((template) => next.add(templateKey(pack, template)))
			return next
		})
	}

	return (
		<Screen contentStyle={styles.content}>
			{/* Same shape as the Habits header: outlined icon on each side, title
			    centred between them. Only one action here, so the right slot is a
			    spacer that balances the back button. */}
			<View style={styles.topBar}>
				<Pressable
					accessibilityRole='button'
					accessibilityLabel='Back to Habits'
					onPress={() => router.back()}
					hitSlop={10}
					style={({ pressed }) => [styles.headerButton, { borderColor: palette.hairline, opacity: pressed ? 0.6 : 1 }]}
				>
					<Icon name='arrowLeft' size={20} color={palette.ink} weight='bold' />
				</Pressable>
				<View style={styles.headerCopy}>
					<AppText color={palette.ink} style={styles.title} numberOfLines={1}>
						Starter packs
					</AppText>
				</View>
				<View style={styles.headerSpacer} />
			</View>

			{/* No blanket description. It said the same thing about all six packs
			    — "ready-made routines you can add in a tap" — which the screen
			    already demonstrates, and pushed the first pack down a line. Each
			    pack now says who it is for instead. */}
			<View style={styles.packs}>
				{starterPacks.map((pack) => {
					const packAdded = pack.habits.every((template) => isAdded(pack, template))

					return (
						<View key={pack.id} style={styles.packSection}>
							<View style={styles.packHeader}>
								<AppText variant='titleSmall' color={palette.ink} style={styles.packTitle}>
									{pack.title}
								</AppText>
								<AppText variant='bodySmall' color={palette.subtle} style={styles.packDescription}>
									{pack.description}
								</AppText>
							</View>

							<View style={styles.habitList}>
								{pack.habits.map((template) => (
									<TemplateHabitRow
										key={template.name}
										pack={pack}
										template={template}
										done={isAdded(pack, template)}
										onAdd={() => addOne(pack, template)}
										onCancel={() => cancelOne(pack, template)}
										palette={palette}
									/>
								))}
							</View>

							{/* <Pressable
								accessibilityRole='button'
								accessibilityLabel={packAdded ? `${pack.title} added` : `Add all ${pack.habits.length} habits from ${pack.title}`}
								disabled={packAdded}
								onPress={() => addPack(pack)}
								style={({ pressed }) => [
									styles.addAll,
									{
										backgroundColor: packAdded ? palette.greenSoft : pack.color,
										opacity: pressed && !packAdded ? 0.85 : 1,
									},
								]}
							>
								<Icon
									name={packAdded ? 'checkCircle' : 'elementPlus'}
									size={18}
									color={packAdded ? palette.greenDark : '#FFFFFF'}
									weight='bulk'
								/>
								<AppText
									variant='button'
									color={packAdded ? palette.greenDark : '#FFFFFF'}
								>
									{packAdded ? 'Pack added' : `Add all ${pack.habits.length}`}
								</AppText>
							</Pressable> */}
						</View>
					)
				})}
			</View>
		</Screen>
	)
}

function TemplateHabitRow({
	pack,
	template,
	done,
	onAdd,
	onCancel,
	palette,
}: {
	pack: StarterPack
	template: HabitTemplate
	done: boolean
	onAdd: () => void
	/** Long-press on an added row. Refuses if the habit already has progress. */
	onCancel: () => void
	palette: ReturnType<typeof useLumo>['palette']
}) {
	const scale = React.useRef(new Animated.Value(1)).current
	const prevDone = React.useRef(done)

	// Pop the control when the habit flips to added (single tap or "Add all").
	React.useEffect(() => {
		if (done && !prevDone.current) {
			scale.setValue(0.4)
			Animated.spring(scale, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }).start()
		}
		prevDone.current = done
	}, [done, scale])

	const tint = readableOn(pack.color, palette.card)

	return (
		<Pressable
			accessibilityRole='button'
			accessibilityState={{ selected: done }}
			accessibilityLabel={done ? `${template.name} added` : `Add ${template.name}`}
			accessibilityHint={done ? 'Double tap and hold to remove it again' : undefined}
			onPress={done ? onCancel : onAdd}
			onLongPress={done ? onCancel : undefined}
			style={({ pressed }) => [
				styles.habitRow,
				{ backgroundColor: palette.card },
				done ? { borderColor: palette.hairlineStrong } : null,
				{ opacity: pressed && !done ? 0.85 : 1 },
			]}
		>
			<View style={[styles.habitIcon, { backgroundColor: alpha(pack.color, '24') }]}>
				<Icon
					name={template.emoji}
					size={18}
					color={tint}
					weight='bulk'
				/>
			</View>
			<AppText
				variant='bodySmall'
				color={done ? palette.subtle : palette.ink}
				numberOfLines={1}
				style={styles.habitName}
			>
				{template.name}
			</AppText>
			{/* Bare glyph — no tinted box behind it. */}
			<Animated.View style={{ transform: [{ scale }] }}>
				<Icon
					name={done ? 'checkCircle' : 'plus'}
					size={done ? 18 : 13}
					color={done ? tint : palette.subtle}
					weight={done ? 'bulk' : 'bold'}
				/>
			</Animated.View>
		</Pressable>
	)
}

const styles = StyleSheet.create({
	content: {
		paddingBottom: spacing.xxl,
	},
	// No marginBottom: the Screen's own stack gap already separates the bar from
	// the first pack. Carrying both, plus the section's old marginTop, put 56pt
	// of nothing under the title.
	topBar: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
	},
	headerCopy: {
		flex: 1,
		alignItems: 'center',
	},
	// Outlined circle, matching the Habits and journal editor header buttons.
	headerButton: {
		width: 38,
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: radius.pill,
		borderWidth: StyleSheet.hairlineWidth,
	},
	headerSpacer: {
		width: 38,
	},
	// The Habits header's size, now that the title lives in the bar.
	title: {
		fontFamily: fontFamilies.serifBlack,
		fontSize: 19,
		lineHeight: 25,
	},
	// This View is ONE child of Screen, so the Screen's gap never applied
	// between the sections inside it — they were only as far apart as the
	// marginTop each carried, and the comment claiming ~40 was wrong. The
	// separation is stated here now, in one place.
	packs: {
		gap: spacing.xl,
	},
	// A pack is a section, not a card — the habits inside it are the cards. The
	// gap is what separates the pack's copy from its habit list, so it runs
	// wider than the 4pt holding the title and description together.
	packSection: {
		gap: spacing.ml,
	},
	// Title and its description are one block, so the section's own gap keeps
	// the habit list clear of the copy rather than of the title alone.
	packHeader: {
		gap: spacing.xxs,
	},
	packTitle: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 16,
		lineHeight: 22,
	},
	packDescription: {
		lineHeight: 20,
	},
	habitList: {
		gap: spacing.xxs,
	},
	// Onboarding's selection row: card surface, 2pt border that is transparent
	// until selected so adding doesn't shift the layout.
	habitRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: spacing.sm,
		borderWidth: 1,
		borderColor: 'transparent',
		borderRadius: rowRadius(58),
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		minHeight: 58,
	},
	habitIcon: {
		width: 34,
		height: 34,
		borderRadius: tileRadius(34),
		alignItems: 'center',
		justifyContent: 'center',
	},
	habitName: {
		flex: 1,
		fontFamily: fontFamilies.lexendMedium,
	},
})
