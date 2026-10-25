import React from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Icon } from "@/components/Icon";
import { MoveInviteCard } from "@/components/move/MoveInviteCard";
import type { MoveInvitations } from "@/components/move/useMoveInvitations";
import { WalkInviteCard } from "@/components/move/WalkInviteCard";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";

/**
 * How much of the neighbouring invitation shows past the centred one — enough to
 * read as a card rather than a stripe, the only hint a second one exists.
 */
const INVITE_PEEK = 28;

/**
 * "Notifications are off", for someone with friends who could be invited.
 * A row rather than a card: it is chrome about the app, not content.
 */
export function NotificationsOffPrompt({ onPress }: { onPress: () => void }) {
  const { palette, isDark } = useLumo();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Turn on notifications for invitations"
      onPress={onPress}
      style={({ pressed }) => [styles.notify, { backgroundColor: alpha(palette.accent, isDark ? "26" : "1A"), opacity: pressed ? 0.75 : 1 }]}
    >
      <Icon name="notifications" size={18} color={palette.ink} weight="bulk" />
      <View style={styles.notifyText}>
        <AppText variant="caption" color={palette.ink} style={styles.notifyTitle}>
          Notifications are off
        </AppText>
        <AppText variant="caption" color={palette.subtle} numberOfLines={2}>
          Turn them on to hear when a friend invites you to move or asks you along.
        </AppText>
      </View>
      <Icon name="forward" size={15} color={palette.subtle} weight="bold" />
    </Pressable>
  );
}

/** Both kinds of invitation as cards, walks first. */
function InvitationCardList({ inv, width }: { inv: MoveInvitations; width?: number }) {
  return (
    <>
      {inv.walkInvites.map((invite) => (
        <View key={invite.inviteId} style={width ? { width } : undefined}>
          <WalkInviteCard
            invite={invite}
            senderName={inv.friendName(invite.senderId)}
            senderAvatar={inv.friendAvatar(invite.senderId)}
            busy={inv.answering === invite.inviteId}
            onToggle={() => void inv.toggleWalkInvite(invite)}
            onDismiss={() => void inv.dismissWalkInvite(invite)}
          />
        </View>
      ))}
      {inv.invites.map((invite) => (
        <View key={invite.challengeId} style={width ? { width } : undefined}>
          <MoveInviteCard
            invite={invite}
            inviterName={inv.friendName(invite.inviterId)}
            inviterAvatar={inv.friendAvatar(invite.inviterId)}
            busy={inv.answering === invite.challengeId}
            onJoin={() => void inv.answerInvite(invite, true)}
            onDecline={() => void inv.answerInvite(invite, false)}
          />
        </View>
      ))}
    </>
  );
}

/**
 * Stacked cards — the fallback placement, used wherever the deck is not on screen
 * (a challenge running, or the Overall tab). Never both at once.
 */
export function InvitationStack({ inv }: { inv: MoveInvitations }) {
  return <InvitationCardList inv={inv} />;
}

/**
 * The invitations as a swipeable deck: one card centred, its neighbours peeking.
 * A deck rather than a column so three invitations cannot bury "Move Now".
 */
export function InvitationDeck({ inv }: { inv: MoveInvitations }) {
  const { palette } = useLumo();
  const { width: screenWidth } = useWindowDimensions();
  // Width and side padding are one calculation: they must agree or every card
  // lands off-centre by the difference.
  const cardWidth = Math.max(240, screenWidth - (INVITE_PEEK + spacing.xs) * 2);
  const sidePad = Math.max(0, (screenWidth - cardWidth) / 2);

  return (
    <View style={styles.deck}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + spacing.xs}
        decelerationRate="fast"
        disableIntervalMomentum
        style={styles.deckScroll}
        contentContainerStyle={[styles.deckContent, { paddingHorizontal: sidePad }]}
      >
        <InvitationCardList inv={inv} width={cardWidth} />
      </ScrollView>

      {inv.invitationCount > 1 ? (
        <AppText variant="caption" color={palette.muted} style={styles.deckHint}>
          {inv.invitationCount} invitations · swipe
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notify: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.card
  },
  notifyText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  notifyTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  deck: {
    gap: spacing.xs,
    marginTop: spacing.sm,
    alignSelf: "stretch"
  },
  // Full-bleed: escapes the gutter so a card swipes in from the edge.
  deckScroll: {
    marginHorizontal: -layout.screenPaddingX
  },
  deckContent: {
    flexDirection: "row",
    gap: spacing.xs
  },
  deckHint: {
    textAlign: "center"
  }
});
