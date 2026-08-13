import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { MoveBadge } from "@/components/move/MoveBadge";
import { PlusBadge } from "@/components/PlusBadge";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { MOVE_ACCENT } from "@/constants/tools";
import { CTA_FILL, fontFamilies, radius, rowRadius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { ME } from "@/context/MoveContext";
import { alpha, readableOn } from "@/lib/color";
import { friendsService, type Friendship } from "@/lib/friends";
import { formatInstant } from "@/lib/date";
import { describeFamilyProgress, familyEarnedAt, hasMilestone, previousFamily, type MoveAchievement } from "@/lib/move/achievements";
import {
  activeParticipants,
  type ActiveMoveChallenge,
  type ChallengeProgress,
  type MoveParticipant,
  type TeamGoal
} from "@/lib/move/activeChallenge";
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
  /**
   * A rung you are RUNNING is never shut, whatever the ladder says.
   *
   * This is the invitee's case. The ladder unlocks in order off your own badges, and
   * somebody invited onto a friend's 25K may not have earned the 10K — so the card
   * for the challenge they are actually walking came up locked, greyed out, saying
   * "earn the 10K badge first", and could not even be opened to see how it was
   * going. The invitation is a legitimate way onto a rung, and the challenge in
   * progress outranks the ladder that would not have offered it.
   *
   * `locked` is still what the caller computed; this only decides what the card
   * DOES with it.
   */
  const shut = locked && !running;

  // A challenge under way outranks everything else: what is happening now is
  // more use than what has been banked, and the bar underneath repeats it.
  const summary = shut
    ? `Earn the ${previousFamily(family)?.title ?? "previous"} badge first`
    : running
    ? `${formatDistance(running.currentM)} of ${formatDistance(running.targetM)}`
    : earnedAt
      ? `Earned ${formatInstant(earnedAt)}`
      : (routes ?? family.subtitle);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: shut }}
      accessibilityLabel={`${family.title}. ${shut ? summary : `${summary}. ${earned ? "Earned" : "Not yet earned"}`}`}
      disabled={shut}
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
        <View style={shut ? styles.cardLocked : null}>
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

        <View style={[styles.cardText, shut ? styles.cardLocked : null]}>
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
                offer, not a fault. Shown on every Plus rung whether or not the
                reader has subscribed — hiding it from subscribers would leave
                them unable to see what they are getting.

                The shared badge, not a chip of its own: this is the same mark
                Move's start screen puts on company, and two hand-built gold
                pills would drift the first time one was tuned. (`family.pro`
                keeps its name — see components/PlusBadge.tsx.) */}
            {family.pro ? <PlusBadge /> : null}
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
  withNames = [],
  /** How the team splits it, so the last line describes the walk they chose. */
  teamGoal = "each"
}: {
  variant: MoveChallengeVariant;
  family: MoveMilestoneFamily;
  withNames?: string[];
  teamGoal?: TeamGoal;
}) {
  const { palette } = useLumo();

  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: "target", label: "Goal", value: formatDistance(variant.targetM) },
    { icon: "calendar", label: "Duration", value: describeVariantDuration(variant) },
    { icon: "friends", label: "Challenge type", value: describeVariantKind(variant) },
    { icon: "sun", label: "Starts", value: "Today" },
    { icon: "trophy", label: "Reward", value: `${family.title} badge` }
  ];

  return (
    <MoveSummaryCard rows={rows}>

      {withNames.length > 0 ? (
        <AppText variant="caption" color={palette.subtle} style={styles.summaryWith}>
          With {withNames.join(", ")}.{" "}
          {teamGoal === "shared"
            ? `${formatDistance(variant.targetM)} between the ${withNames.length + 1} of you.`
            : `You each cover ${formatDistance(variant.targetM)}.`}
        </AppText>
      ) : null}
    </MoveSummaryCard>
  );
}

/**
 * A card of labelled facts.
 *
 * Pulled out of `ChallengeSummary` so the plain-move screen can say what it is
 * about to do in the same shape — a card that answers "what am I taking on"
 * should not look like two different cards depending on whether a badge is at
 * the end of it.
 *
 * The page and the card are the same colour, so the shadow is the only thing
 * that makes this a card. Matches `MoveOptionGroup` exactly.
 */
export function MoveSummaryCard({
  rows,
  /** Anything that belongs under the rows — a note about who is coming, say. */
  children
}: {
  rows: { icon: IconName; label: string; value: string }[];
  children?: React.ReactNode;
}) {
  const { palette, isDark } = useLumo();

  return (
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
      {children}
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
 * Who is ahead, and by how far.
 *
 * A ranked list, ordered by distance covered. It replaced a row of faces that
 * was deliberately unranked — "company, not a leaderboard" — because a team
 * challenge is a race often enough that pretending otherwise only hid the one
 * number everybody was already working out for themselves. The ordering was
 * always by contribution; this just says so.
 *
 * The softer parts of that original idea are kept: your own row is marked so a
 * glance finds it, and anybody who has covered their share is green whatever
 * position they are in — being there matters more than being first.
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
  // Already sorted biggest-first, which is the running order.
  const roster = activeParticipants(challenge);
  const leader = roster[0]?.contributionM ?? 0;

  return (
    <View style={styles.team}>
      {roster.map((participant, index) => {
        const member = byId.get(participant.userId);
        const mine = participant.userId === meId;
        const name = mine ? "You" : (member?.name ?? participant.name);
        // Against the SHARE, not the whole target: on a split challenge those
        // are different numbers, and the share is what this person owes.
        const done = participant.contributionM >= progress.shareM;
        /**
         * The bar behind each row, measured against the LEADER rather than the
         * target.
         *
         * Early on every bar against a 100 km target is a sliver and the list
         * reads as empty; against the leader it shows the gap, which is the
         * thing a ranked list is for.
         */
        const ratio = leader > 0 ? Math.min(1, participant.contributionM / leader) : 0;

        return (
          <View
            key={participant.userId}
            accessible
            accessibilityLabel={`${index + 1}. ${name}, ${formatKilometres(participant.contributionM)}`}
            style={[styles.rankRow, mine ? { backgroundColor: alpha(accent.glyph, "14") } : null]}
          >
            {/* The bar sits UNDER the row's content rather than beside it, so a
                long name never squeezes it to nothing. */}
            <View pointerEvents="none" style={[styles.rankFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: alpha(done ? palette.greenDark : accent.glyph, "1F") }]} />

            <AppText variant="caption" color={index === 0 ? palette.ink : palette.muted} style={styles.rankNumber}>
              {index + 1}
            </AppText>

            {member?.avatar ? (
              <Avatar config={member.avatar} size={28} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: alpha(palette.hairline, "80") }]}>
                <Icon name="user" size={14} color={palette.muted} weight="bulk" />
              </View>
            )}

            <AppText variant="caption" color={palette.ink} numberOfLines={1} style={styles.rankName}>
              {name}
            </AppText>

            <AppText variant="caption" color={done ? palette.greenDark : palette.body} numberOfLines={1} style={styles.rankValue}>
              {formatKilometres(participant.contributionM)}
            </AppText>
          </View>
        );
      })}
    </View>
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
    alignSelf: "stretch",
    gap: spacing.xxs,
    paddingTop: spacing.sm
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: rowRadius(44),
    overflow: "hidden"
  },
  rankFill: {
    ...StyleSheet.absoluteFillObject,
    right: undefined
  },
  rankNumber: {
    width: 14,
    fontFamily: fontFamilies.lexendBold,
    textAlign: "center"
  },
  rankName: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 13,
    lineHeight: 18
  },
  rankValue: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: radius.pill
  }
});
