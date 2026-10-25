import React from "react";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { PlusBadge } from "@/components/PlusBadge";
import { Pressable } from "@/components/Pressable";
import { AppText, Card } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha, readableOn } from "@/lib/color";
import { defaultAvatar, type AvatarConfig } from "@/lib/avatar";
import { findVariant } from "@/lib/move/challengeDefs";
import { formatDistance } from "@/lib/move/movement";
import type { MoveInvite } from "@/lib/move/challengeClient";

/**
 * "Naj invited you for a run" — an invitation to somebody else's challenge, at
 * the top of the Move tab.
 *
 * ## Why it sits on the page rather than in a sheet or a push
 *
 * An invite is a thing with a state, not a message: it waits until answered, it
 * can be declined, and a second device has to see the same one. A banner that
 * can be dismissed would lose it, and a modal would demand an answer at the
 * moment Move happens to be opened — which is usually a moment somebody is about
 * to go for a walk.
 *
 * ## What it has to say before either button makes sense
 *
 * The distance, the deadline and whether the target is each-of-you or shared
 * between you. "Join" on an unlabelled invitation is a signature on a blank
 * page: 100 km alone in a month is a different proposition from 100 km split
 * four ways, and the difference is one line of copy.
 */
export function MoveInviteCard({
  invite,
  inviterName,
  inviterAvatar,
  busy,
  onJoin,
  onDecline
}: {
  invite: MoveInvite;
  /** Resolved from the friend list — names are not stored server-side. */
  inviterName: string;
  inviterAvatar?: AvatarConfig;
  busy: boolean;
  onJoin: () => void;
  onDecline: () => void;
}) {
  const { palette, isDark } = useLumo();
  const variant = findVariant(invite.variantId);

  if (!variant) {
    // A challenge this build does not know about — a newer app invited us to a
    // rung that does not exist here. Silent rather than a broken card: there is
    // nothing this version can describe or join.
    return null;
  }

  const days = invite.endsAt ? Math.max(0, Math.ceil((Date.parse(invite.endsAt) - Date.now()) / 86_400_000)) : null;
  const shared = invite.teamGoal === "shared";
  const joinFill = isDark ? palette.green : palette.greenDark;

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Avatar config={inviterAvatar ?? defaultAvatar()} size={38} />
        <View style={styles.headText}>
          {/* The sentence carries the name and the verb, because that pair is
              what the card IS. Two lines rather than one: at one line a long
              nickname pushed the challenge's title off the end. */}
          <AppText variant="bodySmall" color={palette.ink} numberOfLines={2} style={styles.title}>
            {inviterName} invited you to {variant.title}
          </AppText>
          <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
            {variant.kind === "team" ? "Team challenge" : "Challenge"} · {formatDistance(variant.targetM)}
          </AppText>
        </View>
        {invite.needsPro ? <PlusBadge label="PRO" /> : null}
      </View>

      {/* The terms, one per line. Same shape as the summary on the challenge
          screen, so somebody who has started one of these recognises what they
          are being asked to agree to. */}
      <View style={styles.facts}>
        <Fact
          icon="target"
          label={shared ? `${formatDistance(variant.targetM)} between everyone` : `${formatDistance(variant.targetM)} each`}
        />
        <Fact icon="calendar" label={days === null ? "No deadline" : days === 1 ? "1 day left" : `${days} days left`} />
        <Fact icon="walk" label="Walking and running both count" />
      </View>

      <View style={styles.actions}>
        {/* Decline first in code, second on screen: the affirmative sits where a
            thumb lands, and it is the one carrying the fill. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decline ${variant.title}`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onDecline}
          style={({ pressed }) => [styles.decline, { borderColor: palette.hairline, opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}
        >
          <AppText variant="button" color={palette.subtle}>
            Decline
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Join ${variant.title}`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onJoin}
          style={({ pressed }) => [styles.join, { backgroundColor: joinFill, opacity: busy ? 0.5 : pressed ? 0.85 : 1 }]}
        >
          <AppText variant="button" color={readableOn(joinFill, palette.white, 4.5)}>
            Join
          </AppText>
        </Pressable>
      </View>

      {invite.needsPro ? (
        // Said before the tap, not after the refusal: joining a Pro rung takes
        // the joiner's OWN purchase (the database checks it — see the
        // participation policy), and the inviter's device cannot see whether this
        // one has it.
        <AppText variant="caption" color={alpha(palette.subtle, "E6")} style={styles.note}>
          This one needs Lumo Pro to join.
        </AppText>
      ) : null}
    </Card>
  );
}

function Fact({ icon, label }: { icon: "target" | "calendar" | "walk"; label: string }) {
  const { palette } = useLumo();

  return (
    <View style={styles.fact}>
      <Icon name={icon} size={14} color={palette.subtle} weight="bulk" />
      <AppText variant="caption" color={palette.body} numberOfLines={1} style={styles.factLabel}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    paddingHorizontal: spacing.ml,
    paddingVertical: spacing.md
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  headText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  title: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  facts: {
    gap: spacing.xxs
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  factLabel: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexend
  },
  actions: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xxs
  },
  // The pair share the row evenly, and both clear 44 — this is the one place in
  // Move where a tap commits you to somebody else's month.
  decline: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  join: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill
  },
  note: {
    fontFamily: fontFamilies.lexend,
    textAlign: "center"
  }
});
