import { useRouter } from "expo-router";
import React from "react";
import { Modal, Pressable, RefreshControl, Share, StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/Skeleton";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { buildGroupAvatarSvg, defaultAvatar } from "@/lib/avatar";
import { alpha } from "@/lib/color";
import { friendsService, type FriendInvitation, type GroupInvitation } from "@/lib/friends";
import { formatLumoId, friendInviteLink } from "@/lib/lumoId";

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  return days === 1 ? "Yesterday" : `${days}d ago`;
}

// NativeWind's css-interop drops function-valued `style` props on Pressable,
// so pressed state is tracked manually and the style is passed as a plain array.
function ProfileButton({
  icon,
  label,
  accessibilityLabel,
  background,
  color,
  outline,
  compact = false,
  onPress
}: {
  icon: IconName;
  label?: string;
  accessibilityLabel?: string;
  background: string;
  color: string;
  outline?: string;
  compact?: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = React.useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        label ? (compact ? styles.actionButtonCompact : styles.actionButton) : styles.actionButtonIconOnly,
        outline ? { borderWidth: StyleSheet.hairlineWidth, borderColor: outline } : null,
        { backgroundColor: background, opacity: pressed ? 0.8 : 1 }
      ]}
    >
      <Icon name={icon} size={compact || !label ? 15 : 18} color={color} weight="bulk" />
      {label ? (
        <AppText variant="button" color={color} style={compact ? styles.actionButtonCompactLabel : undefined}>
          {label}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { palette, isDark, nickname, email, lumoIdSuffix, avatar, settings } = useLumo();
  const [qrVisible, setQrVisible] = React.useState(false);
  const [avatarPressed, setAvatarPressed] = React.useState(false);
  const [invitations, setInvitations] = React.useState<FriendInvitation[]>([]);
  const lumoId = formatLumoId(lumoIdSuffix);
  const inviteLink = friendInviteLink(lumoIdSuffix);
  // Same rule as the habit form CTA: greenDark is dark in light mode but light
  // in dark mode, so filled buttons use the medium green there instead.
  const buttonFill = isDark ? palette.green : palette.greenDark;

  const [refreshing, setRefreshing] = React.useState(false);
  const [invitationsLoading, setInvitationsLoading] = React.useState(true);
  const [groupInvitations, setGroupInvitations] = React.useState<GroupInvitation[]>([]);

  const loadInvitations = React.useCallback(async () => {
    const [friendInvites, groupInvites] = await Promise.all([
      friendsService.listInvitations(),
      friendsService.listGroupInvitations()
    ]);
    setInvitations(friendInvites);
    setGroupInvitations(groupInvites);
    setInvitationsLoading(false);
  }, []);

  React.useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  async function respondToInvitation(invitationId: string, accept: boolean) {
    await friendsService.respondToInvitation(invitationId, accept);
    setInvitations((current) => current.filter((invitation) => invitation.lumoId !== invitationId));
  }

  async function respondToGroupInvitation(groupId: string, accept: boolean) {
    setGroupInvitations((current) => current.filter((invitation) => invitation.groupId !== groupId));
    await friendsService.respondToGroupInvitation(groupId, accept);
  }

  async function shareInvite() {
    try {
      await Share.share({
        message: `Add me on Lumo! My Lumo ID is ${lumoId} — let's build habits together. ${inviteLink}`
      });
    } catch {
      // Sharing cancelled — nothing to do.
    }
  }

  return (
    <Screen
      contentStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={palette.greenDark}
          onRefresh={async () => {
            setRefreshing(true);
            await loadInvitations();
            setRefreshing(false);
          }}
        />
      }
    >
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        centerContent={
          <AppText variant="titleSmall" color={palette.ink} style={styles.headerTitle}>
            Profile
          </AppText>
        }
      />

      <View style={styles.hero}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Customize avatar"
          onPress={() => router.push("/avatar")}
          onPressIn={() => setAvatarPressed(true)}
          onPressOut={() => setAvatarPressed(false)}
          style={[styles.avatarFrame, { opacity: avatarPressed ? 0.8 : 1 }]}
        >
          <View style={[styles.avatarCircle, { backgroundColor: alpha(palette.greenDark, "10") }]} pointerEvents="none" />
          <Avatar config={avatar} size={110} rounded={false} />
          {/* greenDark flips light in dark mode, so use the filled-button green
              there to keep the white pencil legible. */}
          <View style={[styles.avatarEdit, { backgroundColor: buttonFill }]}>
            <Icon name="edit" size={14} color={palette.white} weight="bulk" />
          </View>
        </Pressable>
        <AppText color={palette.ink} style={styles.name}>
          {nickname || "You"}
        </AppText>
        {email ? (
          <AppText variant="bodySmall" color={palette.subtle}>
            {email}
          </AppText>
        ) : null}
      </View>

      <View style={[styles.identityCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
        <AppText variant="caption" color={palette.muted} style={styles.identityLabel}>
          LUMO ID
        </AppText>
        <AppText color={palette.ink} style={styles.identityId}>
          {lumoId}
        </AppText>
        <AppText variant="caption" color={palette.subtle} style={styles.identityHint}>
          Friends use this ID to find you on Lumo.
        </AppText>
        <View style={styles.identityActions}>
          <ProfileButton icon="grid" label="Show QR" background={buttonFill} color={palette.white} onPress={() => setQrVisible(true)} />
          <ProfileButton
            icon="upload"
            label="Share ID"
            background={settings.colorScheme === "green" ? alpha(palette.greenDark, "14") : palette.surface}
            color={palette.ink}
            outline={palette.hairline}
            onPress={shareInvite}
          />
        </View>
      </View>

      {invitationsLoading ? (
        <View style={[styles.invitationsCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
          <AppText variant="titleSmall" color={palette.ink} style={styles.invitationsTitle}>
            Invitations
          </AppText>
          {[0, 1].map((index) => (
            <View
              key={index}
              style={[styles.invitationRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }]}
            >
              <Skeleton width={42} height={42} round />
              <View style={styles.skeletonLines}>
                <Skeleton width="55%" height={13} />
                <Skeleton width="35%" height={10} />
              </View>
            </View>
          ))}
        </View>
      ) : invitations.length || groupInvitations.length ? (
        <View style={[styles.invitationsCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
          <AppText variant="titleSmall" color={palette.ink} style={styles.invitationsTitle}>
            Invitations
          </AppText>

          {groupInvitations.length ? (
            <>
              <AppText variant="caption" color={palette.muted} style={styles.invitationSectionLabel}>
                GROUPS
              </AppText>
              {groupInvitations.map((invitation, index) => (
                <View
                  key={invitation.groupId}
                  style={[
                    styles.invitationRow,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }
                  ]}
                >
                  <View style={[styles.invitationAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
                    <Avatar svg={buildGroupAvatarSvg(invitation.avatarSeed ?? invitation.groupId)} size={42} rounded={false} />
                  </View>
                  <View style={styles.invitationText}>
                    <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.invitationName}>
                      {invitation.groupName}
                    </AppText>
                    <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                      {invitation.invitedBy ? `Invited by ${invitation.invitedBy}` : "Group invitation"}
                    </AppText>
                    <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.invitationTime}>
                      {timeAgo(invitation.invitedAt)}
                    </AppText>
                  </View>
                  <ProfileButton
                    compact
                    icon="checkCircle"
                    label="Accept"
                    background={buttonFill}
                    color={palette.white}
                    onPress={() => respondToGroupInvitation(invitation.groupId, true)}
                  />
                  <ProfileButton
                    icon="close"
                    accessibilityLabel={`Decline invitation to ${invitation.groupName}`}
                    background={alpha(palette.danger, "1A")}
                    color={palette.danger}
                    onPress={() => respondToGroupInvitation(invitation.groupId, false)}
                  />
                </View>
              ))}
            </>
          ) : null}

          {invitations.length ? (
            <>
              <AppText variant="caption" color={palette.muted} style={styles.invitationSectionLabel}>
                FRIENDS
              </AppText>
              {invitations.map((invitation, index) => (
                <View
                  key={invitation.lumoId}
                  style={[
                    styles.invitationRow,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }
                  ]}
                >
                  <View style={[styles.invitationAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
                    <Avatar config={invitation.avatar ?? defaultAvatar()} size={38} rounded={false} />
                  </View>
                  <View style={styles.invitationText}>
                    <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.invitationName}>
                      {invitation.nickname || "Lumo user"}
                    </AppText>
                    <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                      {invitation.lumoId}
                    </AppText>
                    <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.invitationTime}>
                      {timeAgo(invitation.invitedAt)}
                    </AppText>
                  </View>
                  <ProfileButton
                    compact
                    icon="checkCircle"
                    label="Accept"
                    background={buttonFill}
                    color={palette.white}
                    onPress={() => respondToInvitation(invitation.lumoId, true)}
                  />
                  <ProfileButton
                    icon="close"
                    accessibilityLabel="Reject invitation"
                    background={alpha(palette.danger, "1A")}
                    color={palette.danger}
                    onPress={() => respondToInvitation(invitation.lumoId, false)}
                  />
                </View>
              ))}
            </>
          ) : null}
        </View>
      ) : (
        <View
          style={[
            styles.invitationsCard,
            styles.invitationsEmpty,
            { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }
          ]}
        >
          <AppText variant="titleSmall" color={palette.ink} style={styles.invitationsTitle}>
            Invitations
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle} style={styles.invitationsEmptyText}>
            No pending invitations. Friend requests and group invites show up here to accept or decline.
          </AppText>
        </View>
      )}

      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={styles.qrOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} accessibilityLabel="Close" onPress={() => setQrVisible(false)} />
          <View style={[styles.qrCard, { backgroundColor: palette.card }]}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.qrTitle}>
              {lumoId}
            </AppText>
            <View style={styles.qrCodeWrap}>
              <QRCode value={inviteLink} size={200} backgroundColor="transparent" color={isDark ? "#FFF7E6" : "#141413"} />
            </View>
            <AppText variant="caption" color={palette.subtle} style={styles.qrHint}>
              Friends can scan this to add you on Lumo.
            </AppText>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.lg
  },
  headerTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 22,
    lineHeight: 28,
    transform: [{ translateY: -7 }]
  },
  hero: {
    alignItems: "center",
    gap: spacing.xxs,
    marginTop: spacing.xs
  },
  avatarFrame: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs
  },
  avatarCircle: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 110,
    height: 110,
    borderRadius: 55
  },
  avatarEdit: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  name: {
    fontFamily: "Lexend-Black",
    fontSize: 28,
    lineHeight: 34
  },
  identityCard: {
    alignItems: "center",
    gap: spacing.xxs,
    borderRadius: radius.nav,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  invitationsCard: {
    gap: spacing.sm,
    borderRadius: radius.nav,
    padding: spacing.lg,
    marginTop: -spacing.xs,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  invitationsTitle: {
    fontFamily: fontFamilies.lexendBold
  },
  invitationSectionLabel: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 1.2,
    marginTop: spacing.xxs
  },
  invitationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm
  },
  invitationAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  invitationText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  invitationName: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  invitationsEmpty: {
    gap: spacing.sm,
    marginTop: -spacing.xs,
    alignItems: "center"
  },
  invitationsEmptyText: {
    lineHeight: 19,
    opacity: 0.8,
    textAlign: "center",
    paddingHorizontal: spacing.lg
  },
  identityLabel: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 1.5
  },
  identityId: {
    fontFamily: "Lexend-Black",
    fontSize: 28,
    lineHeight: 34
  },
  identityHint: {
    marginTop: spacing.xxs
  },
  identityActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    alignSelf: "stretch"
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.pill
  },
  actionButtonCompact: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm
  },
  actionButtonCompactLabel: {
    fontSize: 12,
    lineHeight: 16
  },
  actionButtonIconOnly: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill
  },
  invitationTime: {
    opacity: 0.7
  },
  skeletonLines: {
    flex: 1,
    gap: 6
  },
  qrOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  qrCard: {
    width: "100%",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.nav,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl
  },
  qrTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 18,
    lineHeight: 24
  },
  qrCodeWrap: {
    padding: spacing.sm
  },
  qrHint: {
    textAlign: "center",
    maxWidth: 220
  }
});
