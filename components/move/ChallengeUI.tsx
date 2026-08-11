import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { MoveBadge } from "@/components/move/MoveBadge";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { MOVE_ACCENT } from "@/constants/tools";
import { CTA_FILL, fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { ME } from "@/context/MoveContext";
import { alpha, readableOn } from "@/lib/color";
import { friendsService, type Friendship } from "@/lib/friends";
import { formatInstant } from "@/lib/date";
import { describeFamilyProgress, familyEarnedAt, hasMilestone, previousFamily, type MoveAchievement } from "@/lib/move/achievements";
import { activeParticipants, type ActiveMoveChallenge, type ChallengeProgress, type MoveParticipant } from "@/lib/move/activeChallenge";
import { describeVariantDuration, describeVariantKind, type MoveChallengeVariant, type MoveMilestoneFamily } from "@/lib/move/challengeDefs";
import { formatDistance, formatKilometres } from "@/lib/move/movement";
import type { AvatarConfig } from "@/lib/avatar";

/**
 * The pieces the challenge screens are built from.
 *
 * Deliberately spare. The design brief rules out floating cards for everything,
 * so these are rows, dividers and whitespace — a card appears only where
 * something genuinely is one item among several.
 */

/** Move's colours. `primary` is every filled button; the rest are for data. */
export function useMoveAccent() {
  const { palette } = useLumo();

  return {
    primary: CTA_FILL,
    fill: readableOn(MOVE_ACCENT, palette.white, 4.5),
    glyph: readableOn(MOVE_ACCENT, palette.card, 3),
    soft: alpha(MOVE_ACCENT, "1F")
  };
}

/**
 * A static progress ring — how far a running challenge has got.
 *
 * Replaces the chevron on the card that is actually under way: an arrow says
 * "there is more this way", which every row already says, where the ring says
 * how far along this one is. Purely decorative to a screen reader; the same
 * number is in the row's label.
 */
export function ChallengeRing({
  ratio,
  size,
  accent,
  track,
  /** Thinner for small rings — 5 on a 30pt dial is a doughnut. */
  stroke = 5
}: {
  ratio: number;
  size: number;
  accent: string;
  track: string;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, ratio));

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={accent}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - clamped)}
        // Starts at the top rather than at three o'clock, which is where a
        // reader expects a dial to begin.
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

/**
 * A milestone as a card, for the browse list.
 *
 * The card's second line is the point of it: what this rung is *to you* right
 * now — how many of its three routes are done, how far the running one has
 * got, or the distance it asks for. A list of seven identical "Walk or run N
 * km" rows tells you nothing you could not read off the badge.
 */
export function MilestoneCard({
  family,
  achievements,
  active,
  locked = false,
  onPress
}: {
  family: MoveMilestoneFamily;
  achievements: MoveAchievement[];
  /** The running challenge, whichever milestone it belongs to. Null if none. */
  active: ChallengeProgress | null;
  /** Shut until the rung below is earned — see `isFamilyLocked`. */
  locked?: boolean;
  onPress: () => void;
}) {
  const { palette, isDark } = useLumo();
  const accent = useMoveAccent();
  const earned = hasMilestone(achievements, family.id);
  const routes = describeFamilyProgress(achievements, family);
  const earnedAt = familyEarnedAt(achievements, family);
  // Only the milestone the active challenge is actually working toward.
  const running = active && active.variant.milestoneId === family.id ? active : null;

  // A challenge under way outranks everything else: what is happening now is
  // more use than what has been banked, and the bar underneath repeats it.
  const summary = locked
    ? `Earn the ${previousFamily(family)?.title ?? "previous"} badge first`
    : running
    ? `${formatDistance(running.currentM)} of ${formatDistance(running.targetM)}`
    : earnedAt
      ? `Earned ${formatInstant(earnedAt)}`
      : (routes ?? family.subtitle);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      accessibilityLabel={`${family.title}. ${locked ? summary : `${summary}. ${earned ? "Earned" : "Not yet earned"}`}`}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        // Shadow alone, no edge. An earned rung used to carry an accent border;
        // the badge art already says earned, and a ring around the card said it
        // a second time in a place the eye reads as structure.
        { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow, opacity: pressed ? 0.75 : 1 }
      ]}
    >
      {/* Dimmed rather than hidden: a locked rung is a real thing further up
          the ladder, and seeing it is the point of listing it. */}
      <View style={styles.cardHead}>
        {/* Dimmed rather than hidden: a locked rung is a real thing further up
            the ladder, and seeing it is the point of listing it. */}
        <View style={locked ? styles.cardLocked : null}>
          <MoveBadge
            progress={{
              milestone: { id: family.id, title: family.title, description: "", target: family.distanceM, metric: "distance", tier: "bronze" },
              progress: earned ? family.distanceM : 0,
              target: family.distanceM,
              ratio: earned ? 1 : 0,
              unlocked: earned,
              unlockedAt: null
            }}
            size={48}
          />
        </View>

        <View style={[styles.cardText, locked ? styles.cardLocked : null]}>
          <View style={styles.cardTitleRow}>
            <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.cardTitle}>
              {family.title}
            </AppText>
            {/* Red, and the only red on the screen: it is a live marker rather
                than a warning, and it has to be findable in a list of seven
                rows that are otherwise all the same. `readableOn` keeps the
                label legible on the card in every theme. */}
            {running ? (
              <View style={[styles.activeChip, { backgroundColor: alpha(palette.danger, "1F") }]}>
                <AppText variant="caption" color={readableOn(palette.danger, palette.card, 4.5)} style={styles.activeChipLabel}>
                  Active
                </AppText>
              </View>
            ) : null}

            {/* Gold, and never red: a rung that needs a subscription is an
                offer, not a fault. Shown on every Pro rung whether or not the
                reader has paid — hiding it from subscribers would leave them
                unable to see what they are getting. */}
            {family.pro ? (
              <View style={[styles.activeChip, { backgroundColor: alpha(palette.accent, "26") }]}>
                <AppText variant="caption" color={readableOn(palette.accent, palette.card, 4.5)} style={styles.activeChipLabel}>
                  PRO
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText
            variant="caption"
            // Earned sits LIGHTEST, not green: it is settled business, and a
            // colour that shouts pulls the eye away from the rung being worked
            // on. Green stays for progress that is still moving.
            color={
              earned ? palette.muted : running ? readableOn(palette.danger, palette.card, 4.5) : routes ? palette.body : palette.subtle
            }
            numberOfLines={1}
            style={styles.cardSubtitle}
          >
            {summary}
          </AppText>
        </View>

        {locked ? (
          // Full strength while everything beside it is dimmed: the padlock is
          // the answer to "why can I not tap this", so it is the one thing on
          // the row that must not recede with the rest.
          <Icon name="lock" size={16} color={palette.subtle} weight="bulk" style={styles.cardArrow} />
        ) : running ? (
          // Green like every other progress reading in Move; only the chip and
          // the line under the title carry the red. A ring is a measure, and a
          // red measure reads as something being wrong with it.
          <ChallengeRing ratio={running.ratio} size={32} accent={accent.fill} track={alpha(accent.fill, "24")} />
        ) : (
          <Icon name="arrowRight" size={14} color={palette.muted} weight="bold" style={styles.cardArrow} />
        )}
      </View>

    </Pressable>
  );
}

/**
 * What starting this challenge signs you up for — goal, clock, company, badge.
 *
 * Lives beside the route list rather than on a page of its own. The choice and
 * its consequences belong on one screen: a separate confirmation made someone
 * navigate forward to find out what they had picked, and back again to change
 * it, for four lines that fit under the list they were already reading.
 */
export function ChallengeSummary({
  variant,
  family,
  /** Names of friends coming along. Empty on a solo route. */
  withNames = []
}: {
  variant: MoveChallengeVariant;
  family: MoveMilestoneFamily;
  withNames?: string[];
}) {
  const { palette, isDark } = useLumo();

  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: "target", label: "Goal", value: formatDistance(variant.targetM) },
    { icon: "calendar", label: "Duration", value: describeVariantDuration(variant) },
    { icon: "friends", label: "Challenge type", value: describeVariantKind(variant) },
    { icon: "sun", label: "Starts", value: "Today" },
    { icon: "trophy", label: "Reward", value: `${family.title} badge` }
  ];

  return (
    // The page and the card are the same colour now, so the shadow is the only
    // thing that makes this a card. Matches `MoveOptionGroup` above it exactly.
    <View style={[styles.summary, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      {rows.map((row, index) => (
        <View
          key={row.label}
          style={[
            styles.summaryRow,
            index === rows.length - 1 ? null : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline }
          ]}
        >
          <Icon name={row.icon} size={18} color={palette.subtle} weight="bulk" />
          <AppText variant="bodySmall" color={palette.body} style={styles.summaryLabel}>
            {row.label}
          </AppText>
          <AppText variant="bodySmall" color={palette.ink} style={styles.summaryValue}>
            {row.value}
          </AppText>
        </View>
      ))}

      {withNames.length > 0 ? (
        <AppText variant="caption" color={palette.subtle} style={styles.summaryWith}>
          With {withNames.join(", ")}. You each cover {formatDistance(variant.targetM)}.
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * The big number on the active challenge screen.
 *
 * One statement: how far, of how much. Everything else on that screen is
 * smaller than this — no bar and no countdown, because the figure and its
 * target already say both, and a second reading of the same thing under it just
 * asked to be checked against the first.
 */
export function ChallengeHeadline({ progress }: { progress: ChallengeProgress }) {
  const { palette } = useLumo();
  const accent = useMoveAccent();

  const covered = progress.currentM / 1000;

  return (
    <View style={styles.headline}>
      <View style={styles.headlineRow}>
        <AppText color={palette.ink} style={styles.headlineValue} numberOfLines={1}>
          {covered < 10 ? covered.toFixed(1) : Math.round(covered)}
        </AppText>
        <AppText color={palette.body} style={styles.headlineUnit}>
          / {progress.targetM / 1000} km
        </AppText>
      </View>

      {/* The route, as a badge rather than a line of text, and UNDER the figure
          rather than over it: the distance is what somebody opens this screen
          for, and the badge says what it is counting towards. Named in full,
          because "Go it alone" on its own never said what it was a way OF
          doing. */}
      <View style={[styles.routeChip, { backgroundColor: accent.soft }]}>
        <AppText variant="caption" color={accent.glyph} style={styles.routeChipLabel}>
          Active Challenge: {progress.variant.title}
        </AppText>
      </View>
    </View>
  );
}

/** Three passive numbers under the headline. Facts, not a dashboard. */
export function ChallengeFacts({ facts }: { facts: { icon: IconName; label: string }[] }) {
  const { palette } = useLumo();

  return (
    <View style={styles.facts}>
      {facts.map((fact, index) => (
        <React.Fragment key={fact.label}>
          {index > 0 ? <View style={[styles.divider, { backgroundColor: alpha(palette.hairline, "CC") }]} /> : null}
          <View style={styles.fact}>
            {/* Smaller than the caption beside it: these glyphs mark which
                figure is which, they are not the figure. */}
            <Icon name={fact.icon} size={13} color={palette.subtle} weight="bulk" />
            <AppText variant="caption" color={palette.body} numberOfLines={1} style={styles.factLabel}>
              {fact.label}
            </AppText>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

export type TeamMemberView = { userId: string; name: string; avatar?: AvatarConfig | null };

/** The outside of a member's progress ring, and the face that sits inside it. */
const AVATAR_RING = 58;
const AVATAR_FACE = 44;

/** A stable empty roster, so a screen with no challenge does not re-run the hook. */
const NO_PARTICIPANTS: MoveParticipant[] = [];

/**
 * Real faces for a team challenge.
 *
 * The roster stored on the challenge carries a name and nothing else — it is
 * written when the challenge starts so a team card reads correctly offline, and
 * a copied avatar would be frozen at that moment. So the picture is resolved at
 * display time: mine from the profile, everyone else's from the friend list,
 * keyed by the same profile id the invite flow picked them with.
 *
 * A friend who cannot be resolved keeps the fallback glyph and the stored name
 * rather than blocking the row — the distance is what the row is for.
 */
export function useTeamMembers(participants: MoveParticipant[] | undefined): TeamMemberView[] {
  const { avatar } = useLumo();
  const roster = participants ?? NO_PARTICIPANTS;
  const [friends, setFriends] = React.useState<Friendship[]>([]);
  /** Nobody but me on it means there is nothing to look up. */
  const needsFriends = roster.some((entry) => entry.userId !== ME);

  React.useEffect(() => {
    if (!needsFriends) {
      return;
    }

    let cancelled = false;

    friendsService
      .listFriends()
      .then((loaded) => {
        if (!cancelled) {
          setFriends(loaded);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [needsFriends]);

  return React.useMemo(() => {
    const byId = new Map(friends.filter((entry) => entry.profile.id).map((entry) => [entry.profile.id as string, entry.profile]));

    return roster.map((entry) => {
      if (entry.userId === ME) {
        return { userId: entry.userId, name: entry.name, avatar };
      }

      const profile = byId.get(entry.userId);

      return { userId: entry.userId, name: profile?.nickname ?? entry.name, avatar: profile?.avatar ?? null };
    });
  }, [roster, friends, avatar]);
}

/**
 * Who else is on it, and how they are doing.
 *
 * A row of faces, each ringed by its own progress, with the name and the
 * distance under it. Ordered by contribution but deliberately unnumbered — no
 * places, no medals. Everyone is walking the same distance; this is company,
 * not a leaderboard, which is also why there is no heading over it and no total
 * under it: both invited a comparison the ring already declines to make.
 */
export function TeamContributions({
  challenge,
  progress,
  members,
  meId
}: {
  challenge: ActiveMoveChallenge;
  progress: ChallengeProgress;
  members: TeamMemberView[];
  meId: string;
}) {
  const { palette } = useLumo();
  const accent = useMoveAccent();

  const byId = new Map(members.map((member) => [member.userId, member]));
  const roster = activeParticipants(challenge);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.team}
      /**
       * Grows to fill when the roster is short, so two or three faces sit in
       * the middle of the screen rather than pinned to its left edge — and
       * scrolls the moment there are more than fit.
       */
      contentContainerStyle={styles.teamRow}
    >
      {roster.map((participant) => {
        const member = byId.get(participant.userId);
        const name = participant.userId === meId ? "You" : (member?.name ?? participant.name);
        const done = participant.contributionM >= progress.targetM;

        return (
          <View
            key={participant.userId}
            accessible
            accessibilityLabel={`${name}, ${formatKilometres(participant.contributionM)} of ${formatKilometres(progress.targetM)}`}
            style={styles.member}
          >
            {/* The ring IS the bar: the same ratio, wrapped around the face it
                belongs to, so the person and their progress are one object
                instead of a row that has to be read left to right. */}
            <View style={styles.memberRing}>
              <ChallengeRing
                ratio={participant.contributionM / Math.max(1, progress.targetM)}
                size={AVATAR_RING}
                accent={done ? palette.greenDark : accent.glyph}
                track={alpha(palette.hairline, "80")}
              />

              <View style={styles.memberFace} pointerEvents="none">
                {member?.avatar ? (
                  <Avatar config={member.avatar} size={AVATAR_FACE} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: alpha(palette.hairline, "80") }]}>
                    <Icon name="user" size={20} color={palette.muted} weight="bulk" />
                  </View>
                )}
              </View>
            </View>

            <AppText variant="caption" color={palette.ink} numberOfLines={1} style={styles.memberName}>
              {name}
            </AppText>
            <AppText variant="caption" color={done ? palette.greenDark : palette.subtle} numberOfLines={1}>
              {formatKilometres(participant.contributionM)}
            </AppText>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 52
  },
  cardLocked: {
    opacity: 0.6
  },
  cardText: {
    flex: 1,
    gap: 2
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  activeChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.pill
  },
  activeChipLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 10,
    letterSpacing: 0.4
  },
  cardTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 14,
    lineHeight: 21
  },
  cardSubtitle: {
    fontFamily: fontFamilies.lexend,
    fontSize: 12,
    lineHeight: 16
  },
  cardArrow: {
    marginRight: spacing.xxs
  },
  summary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 46
  },
  summaryLabel: {
    flex: 1,
    fontFamily: fontFamilies.lexend
  },
  summaryValue: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  summaryWith: {
    fontFamily: fontFamilies.lexend,
    paddingTop: spacing.xs
  },
  headline: {
    gap: spacing.xs,
    // Centred as a block: the badge, the figure and the line under it are one
    // statement about the challenge, and left-aligning them made the badge read
    // as a heading for a list that isn't there.
    alignItems: "center"
  },
  routeChip: {
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill
  },
  routeChipLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    // Title case, so it reads as a name for the challenge rather than a
    // shouted label. The variant titles are sentence case in the data
    // ("Go it alone"), and this is the one place they are set as a heading.
    textTransform: "capitalize"
  },
  headlineRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs
  },
  headlineValue: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 52,
    lineHeight: 60
  },
  headlineUnit: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 20
  },
  facts: {
    flexDirection: "row",
    alignItems: "center",
    // Centred under the figure, which is centred too — the two read as one
    // stack rather than a heading with a caption tucked under its left edge.
    justifyContent: "center",
    gap: spacing.sm
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    flexShrink: 1
  },
  factLabel: {
    fontFamily: fontFamilies.lexend
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 2
  },
  team: {
    alignSelf: "stretch"
  },
  teamRow: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: spacing.sm,
    // Air above the ring, which the facts row above it has none of — without it
    // the two blocks touched and read as one.
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md
  },
  member: {
    alignItems: "center",
    gap: 2,
    width: AVATAR_RING + spacing.md
  },
  memberRing: {
    alignItems: "center",
    justifyContent: "center",
    width: AVATAR_RING,
    height: AVATAR_RING,
    marginBottom: spacing.xxs
  },
  memberFace: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center"
  },
  memberName: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 13,
    lineHeight: 18
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    width: AVATAR_FACE,
    height: AVATAR_FACE,
    borderRadius: radius.pill
  }
});
