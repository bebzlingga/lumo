import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Avatar } from "@/components/Avatar";
import { FireIcon } from "@/components/FireIcon";
import { Icon } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { defaultAvatar } from "@/lib/avatar";
import { alpha } from "@/lib/color";
import type { GroupMember } from "@/lib/friends";

// Small: the row is a band inside the figures card now, not a card of its own,
// so the faces are one line of it rather than the thing it is about. Sized down
// together — the ring's lead over the avatar is the breathing room the 3pt
// stroke sits in, and closing that would draw the ring onto the portrait.
const RING_SIZE = 46;
const AVATAR_SIZE = 38;
/** The done pip on the avatar's shoulder. */
const CHECK_SIZE = 17;

// Thin circular progress drawn around a roll-call avatar — everyone can see how
// far each member is through today's activities at a glance.
function AvatarProgressRing({
  progress,
  color,
  trackColor
}: {
  progress: number;
  color: string;
  trackColor: string;
}) {
  const strokeWidth = 3;
  const ringRadius = (RING_SIZE - strokeWidth) / 2;
  const circumference = 2 * Math.PI * ringRadius;

  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
      <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={ringRadius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      {progress > 0 ? (
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={ringRadius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - Math.min(1, progress))}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      ) : null}
    </Svg>
  );
}

/**
 * Who has shown up today — a row of faces along the bottom of the group's
 * figures card, under the hairline that divides it.
 *
 * No heading, no count: a titled panel around six avatars was announcing
 * something the avatars say by being there. Checked-in members carry a filled
 * tick on the shoulder; the others are drawn at full strength rather than
 * faded, so the row reads as the whole team with some of them done, not as a
 * team half missing.
 */
export function GroupRollCall({
  members,
  myLumoId,
  myCheers,
  cheersFor,
  progressFor,
  inset = layout.screenPaddingX,
  onMemberPress
}: {
  members: GroupMember[];
  myLumoId: string;
  myCheers: number;
  cheersFor: (member: GroupMember) => number;
  progressFor: (member: GroupMember) => number;
  /** The horizontal inset this row sits in, which its bleed has to cancel:
   *  the screen gutter by default, or a card's padding when nested. */
  inset?: number;
  onMemberPress: (member: GroupMember) => void;
}) {
  const { palette, isDark } = useLumo();
  const checkFill = isDark ? palette.green : palette.greenDark;

  return (
    <View style={styles.wrap}>
      {/* A scroller, not a wrapping grid. A big group used to stack into three
          or four rows of faces and push everything below it down the page; now
          it stays one row and runs off the edge. Full-bleed so that row starts
          at the screen's own margin and ends at the far edge rather than inside
          a gutter — `contentContainerStyle` puts the inset back on the content,
          which is what lets the last avatar scroll clear of the screen. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.scroll, { marginHorizontal: -inset }]}
        contentContainerStyle={[styles.row, { paddingHorizontal: inset }]}
      >
        {members.map((member) => {
          const memberCheers = cheersFor(member);
          const progress = progressFor(member);
          const isMe = member.profile.lumoId === myLumoId;

          return (
            <Pressable
              key={member.profile.lumoId}
              accessibilityRole="button"
              accessibilityLabel={`${member.profile.nickname || "Lumo user"}, ${
                member.checkedInToday ? "checked in" : "not checked in yet"
              }, ${Math.round(progress * 100)}% of today's activities done`}
              onPress={() => onMemberPress(member)}
              style={({ pressed }) => [styles.member, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={styles.avatarWrap}>
                <AvatarProgressRing
                  progress={progress}
                  color={palette.greenDark}
                  trackColor={isDark ? alpha(palette.subtle, "26") : palette.chartTrack}
                />
                <Avatar config={member.profile.avatar ?? defaultAvatar()} size={AVATAR_SIZE} />
                {member.checkedInToday ? (
                  // Filled, and ringed in the surface it sits on so it stays
                  // legible where it overlaps the progress stroke behind it.
                  // The card, not the canvas: the row lives inside the figures
                  // card, and the two are different creams in light mode — a
                  // canvas ring reads as a halo around every tick.
                  <View style={[styles.check, { backgroundColor: checkFill, borderColor: palette.card }]}>
                    <Icon name="check" size={10} color={palette.white} weight="bold" />
                  </View>
                ) : null}
              </View>
              <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.name}>
                {isMe ? "You" : member.profile.nickname || "Friend"}
              </AppText>
              {memberCheers > 0 ? (
                <View style={styles.cheerRow}>
                  <FireIcon size={10} />
                  <AppText variant="caption" color={palette.greenDark} style={styles.cheerCount}>
                    ×{memberCheers}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Cheers you've been sent today. A quiet line under the faces rather than
          the dismissible banner it used to be — a card you can close is a
          notification, and this is just part of today's picture. */}
      {myCheers > 0 ? (
        <AppText variant="caption" color={palette.subtle} style={styles.cheersLine}>
          You got {myCheers} {myCheers === 1 ? "cheer" : "cheers"} today — friends have your back.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A little more air above the faces than the card's own gap gives: the rule
  // sits right on top of the progress rings otherwise, and the row needs to
  // read as its own band rather than as a caption hanging off the divider.
  wrap: {
    gap: spacing.xs,
    paddingTop: spacing.xxs
  },
  // Escapes whatever inset the row sits in, so the faces run edge to edge —
  // the screen's gutter on its own, the card's padding when nested in one. Set
  // from `inset` rather than hardcoded, because the two are different numbers
  // and cancelling the wrong one leaves the first face indented or clipped.
  scroll: {},
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    // Tight: each face already reserves RING_SIZE and centres inside it, so
    // there is white space either side of every avatar before the gap is even
    // counted. At the previous 16 the row read as a scattering rather than a
    // group.
    gap: spacing.xs,
    // Centred while the faces fit, scrolling from the left once they do not.
    // `flexGrow` is what makes that switch by itself: the content container
    // stretches to the viewport when it is narrower, and `justifyContent` has
    // room to work; once the row overflows there is no slack left and it lays
    // out from the start as before.
    flexGrow: 1,
    justifyContent: "center"
  },
  member: {
    alignItems: "center",
    gap: spacing.xxs,
    width: RING_SIZE
  },
  avatarWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center"
  },
  // Top right, on the ring's shoulder — clear of the portrait's face.
  check: {
    position: "absolute",
    top: 0,
    right: 0,
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  name: {
    maxWidth: RING_SIZE,
    textAlign: "center",
    fontFamily: fontFamilies.lexendMedium
  },
  cheerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  cheerCount: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: fontFamilies.lexendSemiBold
  },
  // Left, like the faces above it now are.
  cheersLine: {
    fontFamily: fontFamilies.lexend,
    lineHeight: 17
  }
});
