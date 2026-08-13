import React from "react";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { defaultAvatar, type AvatarConfig } from "@/lib/avatar";
import type { WalkInvite } from "@/lib/move/challengeClient";

/**
 * "Naj is out for a walk" — one invitation, as a row you tick.
 *
 * ## Why the card IS the control
 *
 * It carried Join / Not now, then Accept / Undo, then a radio — and each of them
 * was a smaller version of the same mistake: putting the decision in a widget on
 * the row rather than in the row. Coming along on a friend's walk is not a
 * commitment to be signed or an item to be checked off. It is one card in front of
 * you, and either you are in or you are not.
 *
 * So the card is the button and the card is the state: tap anywhere to be in, tap
 * again to be out, and the whole thing washes green when you are.
 *
 * ## What ticking it actually does
 *
 * Takes a place on their walk, and nothing more. It does not start a recording:
 * "Move Now" under the deck still does that, and it still does it for a walk on
 * your own. Ticked, that button publishes to this walk as well; unticked, it goes
 * out alone.
 *
 * ## The cross, and one selection at a time
 *
 * The only widget left is the cross, because there are two different noes. Leaving
 * a card unselected is "not right now" and needs no gesture at all — the invitation
 * expires with their walk. The cross is "take this off my screen", for the walk you
 * already know you are not joining, and it declines the invitation for good.
 *
 * Selection behaves as a RADIO across the deck, not a checkbox per card: you can
 * only be on one walk at a time, so selecting a second invitation deselects the
 * first (see `toggleWalkInvite` on the Move tab). Two selected cards would promise
 * something the one stored session cannot keep.
 */
export function WalkInviteCard({
  invite,
  senderName,
  senderAvatar,
  busy,
  onToggle,
  onDismiss
}: {
  invite: WalkInvite;
  /** Resolved from the friend list — names are not stored server-side. */
  senderName: string;
  senderAvatar?: AvatarConfig;
  busy: boolean;
  /** Ticks it when unticked, takes it back when ticked. */
  onToggle: () => void;
  /** Clears it off the deck for good. */
  onDismiss: () => void;
}) {
  const { palette, isDark } = useLumo();

  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(invite.startedAt)) / 60_000));
  const started = minutes < 1 ? "just now" : minutes === 1 ? "1 min ago" : `${minutes} mins ago`;
  const verb = invite.activityType === "run" ? "run" : "walk";
  /**
   * Whether distance can be SHARED, which is not the same as whether it can be
   * ticked.
   *
   * Every invitation is tickable. A sessionless one — the friend's device could not
   * open a session, or the row predates them — still means "I am going out with
   * you", and ticking it still puts their name on the walk. What it cannot do is
   * carry each other's kilometres, because there is no row on either side to write
   * them to. The row says which of the two it is rather than refusing the tap:
   * disabled, it read as broken.
   */
  const joinable = invite.sessionId !== null;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: invite.accepted, disabled: busy }}
      accessibilityLabel={`${senderName} is out for a ${verb}, set out ${started}`}
      accessibilityHint={
        joinable
          ? "Ticks you in. Move Now then shares your progress with them."
          : "Ticks you in. Move Now goes out with them, without sharing distance."
      }
      disabled={busy}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.row,
        {
          /**
           * THE WHOLE CARD IS THE STATE — a fill and an edge, no tick.
           *
           * There was a radio at the end of the row, and it was the wrong shape for
           * what this is: a radio belongs in a list you are working down, where the
           * rows are alike and one mark tells them apart. Here there is one card in
           * view at a time, and the question is about that card — so the card
           * answers it. Tapping anywhere on it toggles, and being chosen is
           * something it LOOKS, not something it wears.
           *
           * Two cues rather than one, because the wash has to stay faint: this sits
           * on backdrop art, and a green solid enough to read on its own would
           * shout across the screen. The border carries the rest.
           */
          backgroundColor: invite.accepted ? alpha(palette.greenDark, isDark ? "26" : "17") : alpha(palette.card, "A6"),
          borderColor: invite.accepted ? alpha(palette.greenDark, "8C") : palette.hairline,
          borderWidth: invite.accepted ? 1.5 : StyleSheet.hairlineWidth,
          // A row with nothing to tick is dimmed, not silently inert: it is
          // `disabled` below, and a control that ignores a tap while looking
          // perfectly live is the one thing worse than not having it.
          opacity: busy ? 0.5 : pressed ? 0.7 : 1
        }
      ]}
    >
      <Avatar config={senderAvatar ?? defaultAvatar()} size={34} />

      <View style={styles.text}>
        <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.title}>
          {senderName} is out for a {verb}
        </AppText>
        <AppText variant="caption" color={invite.accepted ? palette.greenDark : palette.subtle} numberOfLines={1}>
          {invite.accepted
            ? joinable
              ? "You're in · Move Now shares your progress"
              : "You're in · Move Now goes out with them"
            : `Set out ${started} · tick to join them`}
        </AppText>
      </View>

      {/* Its own press target inside the row's, which is why it carries `hitSlop`
          rather than padding: a 22pt cross wants a 44pt reach, and growing the box
          to get one would push the radio off the end of the row. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Dismiss ${senderName}'s ${verb}`}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        hitSlop={10}
        onPress={onDismiss}
        style={({ pressed }) => [styles.dismiss, { opacity: busy ? 0.4 : pressed ? 0.5 : 0.75 }]}
      >
        <Icon name="close" size={15} color={palette.muted} weight="bulk" />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * No card and no shadow: a hairline-edged row.
   *
   * This sits in a deck inside the page's own invitation block, and a raised card
   * in there was a panel inside a panel — the same mistake the group activity rows
   * made before they were flattened. The alpha fill is the date pill's, so it reads
   * as a control ON the backdrop rather than a surface over it.
   */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    // Roomier than a list row, because it is not in a list: one of these sits alone
    // in the middle of the screen with a headline above and the day's one button
    // below, and at a list row's inset it read as a strip somebody had dropped in
    // rather than as the invitation the page is currently about.
    minHeight: 72,
    paddingHorizontal: spacing.ml,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  title: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  // Held back at 0.75 even at rest: it is the quietest thing on the row, and a
  // full-strength cross beside a tick reads as the two being a pair of choices.
  dismiss: {
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22
  }
});
