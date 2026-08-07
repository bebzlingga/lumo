import { useLocalSearchParams, useRouter } from 'expo-router'
import React from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/Icon'
import { ScreenHeader } from '@/components/ScreenHeader'
import { AppText, Button, Screen } from '@/components/ui'
import { fontFamilies, radius, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import { defaultAvatar } from '@/lib/avatar'
import { friendsService, type FriendProfile } from '@/lib/friends'
import { formatLumoId } from '@/lib/lumoId'

/**
 * Landing screen for `lumo://add-friend?id=…` deep links (QR scans and invite
 * messages). Looks the Lumo ID up in the directory so the person's nickname and
 * avatar are shown before you send the request, then sends it through the
 * backend.
 */
export default function AddFriendScreen() {
	const router = useRouter()
	const { palette, lumoIdSuffix } = useLumo()
	const params = useLocalSearchParams<{ id?: string }>()
	const friendId = typeof params.id === 'string' ? params.id : ''
	const syncOffline = friendsService.status() === 'offline'
	const isSelf = friendId === formatLumoId(lumoIdSuffix)
	const [profile, setProfile] = React.useState<FriendProfile | null>(null)
	const [looking, setLooking] = React.useState(Boolean(friendId) && !syncOffline)
	const [sending, setSending] = React.useState(false)
	const [sent, setSent] = React.useState(false)

	// Resolve the Lumo ID to a real profile so we can show who's being added and
	// only enable "Send" for an ID that actually exists.
	React.useEffect(() => {
		if (!friendId || syncOffline) {
			setLooking(false)
			return
		}

		let active = true
		setLooking(true)
		friendsService.findByLumoId(friendId).then((found) => {
			if (active) {
				setProfile(found)
				setLooking(false)
			}
		})

		return () => {
			active = false
		}
	}, [friendId, syncOffline])

	const notFound = !looking && !syncOffline && Boolean(friendId) && !profile
	const canSend = Boolean(profile) && !isSelf && !sent
	const displayName = sent ? 'Request sent!' : profile?.nickname?.trim() || 'Add a friend'

	async function sendRequest() {
		if (sending) {
			return
		}
		setSending(true)
		try {
			const ok = await friendsService.sendRequest(friendId)
			if (ok) {
				setSent(true)
			} else {
				Alert.alert("Couldn't send request", "You're already friends with them, or the request couldn't be sent. Please try again.")
			}
		} finally {
			setSending(false)
		}
	}

	function subtitle() {
		if (!friendId) {
			return 'This invite link is missing a Lumo ID. Ask your friend to share it again.'
		}
		if (isSelf) {
			return "That's your own Lumo ID — share it with a friend instead."
		}
		if (sent) {
			return "We'll let them know. Once they accept, you'll see each other on the Friends tab."
		}
		if (syncOffline) {
			return "You're offline. Save this ID and add each other once you're back online."
		}
		if (looking) {
			return 'Looking up this Lumo ID…'
		}
		if (notFound) {
			return 'No Lumo user was found with this ID. Double-check it with your friend.'
		}
		return `Send ${profile?.nickname?.trim() || 'them'} a friend request to start sharing goals together.`
	}

	return (
		<Screen contentStyle={styles.content}>
			<ScreenHeader leftAction={{ icon: 'back', label: 'Back', onPress: () => router.back() }} />

			{/* The avatar is the largest thing on the page: this screen exists to
			    answer "is this the right person?", and the face is the answer. */}
			<View style={styles.hero}>
				{profile && !sent ? (
					<Avatar
						config={profile.avatar ?? defaultAvatar()}
						size={132}
					/>
				) : (
					<View style={[styles.badge, { backgroundColor: palette.greenSoft }]}>
						<Icon
							name={sent ? 'checkCircle' : notFound ? 'close' : 'friends'}
							size={30}
							color={palette.greenDark}
							weight='bulk'
						/>
					</View>
				)}
				<AppText
					color={palette.ink}
					style={styles.title}
				>
					{displayName}
				</AppText>
				{friendId ? (
					<View style={[styles.idPill, { backgroundColor: palette.card, shadowColor: palette.shadow }]}>
						<AppText
							color={palette.greenDark}
							style={styles.idText}
						>
							{friendId}
						</AppText>
					</View>
				) : null}
				<AppText
					variant='bodySmall'
					color={palette.subtle}
					style={styles.subtitle}
				>
					{subtitle()}
				</AppText>
			</View>

			<View style={styles.spacer} />

			{canSend ? (
				<Button
					label={sending ? 'Sending…' : 'Send friend request'}
					variant='primary'
					shape='pill'
					disabled={sending}
					onPress={sendRequest}
					className='py-5 px-6'
					labelStyle={styles.submitLabel}
				/>
			) : looking ? (
				<Button
					label='Looking up…'
					variant='primary'
					shape='pill'
					disabled
					onPress={() => undefined}
					className='py-5 px-6'
					labelStyle={styles.submitLabel}
				/>
			) : (
				<Button
					label='Done'
					variant='primary'
					shape='pill'
					onPress={() => router.back()}
					className='py-5 px-6'
					labelStyle={styles.submitLabel}
				/>
			)}
		</Screen>
	)
}

const styles = StyleSheet.create({
	content: {
		paddingBottom: spacing.xxl,
		gap: spacing.xl,
		flexGrow: 1,
	},
	spacer: {
		flex: 1,
	},
	hero: {
		alignItems: 'center',
		gap: spacing.sm,
		marginTop: spacing.lg,
	},
	badge: {
		width: 72,
		height: 72,
		borderRadius: radius.pill,
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: {
		fontFamily: 'Lexend-Black',
		fontSize: 28,
		lineHeight: 34,
		textAlign: 'center',
	},
	idPill: {
		borderRadius: radius.pill,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.06,
		shadowRadius: 10,
		elevation: 2,
	},
	idText: {
		fontFamily: fontFamilies.lexendBold,
		fontSize: 18,
		lineHeight: 24,
	},
	// The margin stacks on the hero's own spacing.sm row gap for 24pt above,
	// which separates the explanation from the identity block it follows — name,
	// ID and this line were reading as one run of three centred paragraphs.
	subtitle: {
		textAlign: 'center',
		maxWidth: 300,
		lineHeight: 20,
		marginTop: spacing.sm,
	},
	submitLabel: {
		textTransform: 'capitalize',
	},
})
