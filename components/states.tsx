import React, { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { fontFamilies, radius, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import type { MascotMood } from '@/constants/mascotAssets'
import { AppText } from './ui'
import { Icon, type IconName } from './Icon'
import { LumoMascot } from './LumoMascot'
import { Pressable } from '@/components/Pressable'

/**
 * Shared screen states. Every screen should reach for these instead of
 * hand-rolling an empty/error block, so the copy, spacing, and mascot usage
 * stay consistent (see the "no duplicated screen-specific styles" rule).
 */

type Action = { label: string; onPress: () => void }

function StateShell({
	children,
	title,
	body,
	action,
	secondaryAction,
	quiet = false,
	compact = false,
}: {
	children?: ReactNode
	title: string
	body?: string
	action?: Action
	secondaryAction?: Action
	/** Recedes the whole block — for "nothing here yet" that isn't a problem. */
	quiet?: boolean
	/**
	 * Steps the body copy down a point, for a state inside a sheet or a card
	 * rather than on a page of its own — where the shell's own copy is the only
	 * thing in a small frame, and 14 across three lines fills it.
	 *
	 * Separate from `quiet`, which is about colour: a state can be the ordinary
	 * one AND on a full page, or urgent AND in a sheet.
	 */
	compact?: boolean
}) {
	const { palette, isDark } = useLumo()

	return (
		<View style={styles.shell}>
			{children}
			<AppText variant='titleSmall' color={quiet ? palette.subtle : palette.ink} style={styles.title}>
				{title}
			</AppText>
			{body ? (
				<AppText
					variant='bodySmall'
					color={quiet ? palette.muted : palette.subtle}
					style={[styles.body, compact ? styles.bodyCompact : null]}
				>
					{body}
				</AppText>
			) : null}
			{action ? (
				<Pressable
					accessibilityRole='button'
					accessibilityLabel={action.label}
					onPress={action.onPress}
					style={({ pressed }) => [
						styles.cta,
						{ backgroundColor: isDark ? palette.green : palette.greenDark, opacity: pressed ? 0.85 : 1 },
					]}
				>
					<AppText variant='button' color={palette.onGreen}>
						{action.label}
					</AppText>
				</Pressable>
			) : null}
			{secondaryAction ? (
				<Pressable
					accessibilityRole='button'
					accessibilityLabel={secondaryAction.label}
					onPress={secondaryAction.onPress}
					style={({ pressed }) => [styles.ghost, { opacity: pressed ? 0.7 : 1 }]}
				>
					<AppText variant='button' color={palette.greenDark}>
						{secondaryAction.label}
					</AppText>
				</Pressable>
			) : null}
		</View>
	)
}

/**
 * "Nothing here yet" — always encouraging, never a dead end. Leads with the
 * mascot by default; pass `icon` for denser contexts where art is too heavy.
 *
 * Deliberately takes NO action. Every screen that showed one was duplicating a
 * control already on its own header a few points higher, and a filled green
 * button gave the emptiest part of the page the loudest thing on it. Say where
 * to go in `body` instead. `ErrorState` and `OfflineState` keep their action —
 * a retry is not a call to action, it is the only way out of the state.
 */
export function EmptyState({
	title,
	body,
	mood = 'happy',
	icon,
	quiet = false,
	compact = false,
	art = true,
}: {
	title: string
	body?: string
	mood?: MascotMood
	icon?: IconName
	/**
	 * Recedes the icon and copy. For places where "empty" is an ordinary state
	 * rather than something to fix — e.g. a Paused tab with nothing paused.
	 */
	quiet?: boolean
	/** Steps the body copy down a point, for a state inside a sheet or a card. */
	compact?: boolean
	/**
	 * Draw the icon (or the mascot) above the copy. Pass false for a state that
	 * wants neither — a small frame where the art outweighs the two lines it sits
	 * over, and where the glyph would be repeating a control already on screen.
	 *
	 * Note this is not the same as omitting `icon`, which falls back to the
	 * mascot: that is a bigger piece of art, not none.
	 */
	art?: boolean
}) {
	const { palette } = useLumo()
	/**
	 * One step lighter than the title it sits above, taken from the text ramp
	 * rather than the brand green. An empty state describes an absence — a
	 * saturated green disc gave it the weight of a call to action and pulled the
	 * eye to the one thing on screen with nothing behind it.
	 */
	const iconTone = quiet ? palette.muted : palette.subtle

	return (
		<StateShell title={title} body={body} quiet={quiet} compact={compact}>
			{!art ? null : icon ? (
				<View style={styles.iconCircle}>
					<Icon name={icon} size={30} color={iconTone} weight='bulk' />
				</View>
			) : (
				<LumoMascot mood={mood} width={128} />
			)}
		</StateShell>
	)
}

/** Something went wrong — states the problem plainly and offers a retry. */
export function ErrorState({
	title = 'Something went wrong',
	body = 'Please try again in a moment.',
	action,
}: {
	title?: string
	body?: string
	action?: Action
}) {
	const { palette } = useLumo()

	return (
		<StateShell title={title} body={body} action={action}>
			<View style={styles.iconCircle}>
				<Icon name='close' size={30} color={palette.danger} weight='bulk' />
			</View>
		</StateShell>
	)
}

/** No connection — core habit tracking still works, so the copy says so. */
export function OfflineState({ action }: { action?: Action }) {
	const { palette } = useLumo()

	return (
		<StateShell
			title="You're offline"
			body='Your habits still work offline — anything social will sync once you reconnect.'
			action={action}
		>
			<View style={styles.iconCircle}>
				<Icon name='cloudPlus' size={30} color={palette.subtle} weight='bulk' />
			</View>
		</StateShell>
	)
}

const styles = StyleSheet.create({
	shell: {
		alignItems: 'center',
		gap: spacing.xs,
		paddingVertical: spacing.xl,
		paddingHorizontal: spacing.lg,
	},
	iconCircle: {
		width: 60,
		height: 60,
		borderRadius: radius.pill,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: spacing.xxs,
	},
	// Lexend, not the serif. The serif is the app's *headline* face — on a page
	// heading it announces a section, but on an empty state it made "No groups
	// yet" read as louder than the content it was standing in for. Stepped up a
	// point and to bold so it still leads the body copy without it.
	title: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 15,
		lineHeight: 21,
		textAlign: 'center',
	},
	body: {
		textAlign: 'center',
		lineHeight: 20,
		maxWidth: 280,
	},
	// One point off `bodySmall`, with the leading brought down to match — dropping
	// the size alone leaves the lines further apart than the type is tall.
	bodyCompact: {
		fontSize: 13,
		lineHeight: 18,
	},
	cta: {
		alignSelf: 'stretch',
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: 48,
		borderRadius: radius.pill,
		marginTop: spacing.xs,
	},
	ghost: {
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: spacing.xs,
	},
})
