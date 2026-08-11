import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { MoveBadge } from "@/components/move/MoveBadge";
import { MoveProgressBar } from "@/components/move/MoveProgressBar";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { MOVE_ACCENT } from "@/constants/tools";
import { CTA_FILL, fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha, readableOn } from "@/lib/color";
import { formatInstant } from "@/lib/date";
import { describeFamilyProgress, familyEarnedAt, hasMilestone, previousFamily, type MoveAchievement } from "@/lib/move/achievements";
import { activeParticipants, type ActiveMoveChallenge, type ChallengeProgress } from "@/lib/move/activeChallenge";
import { describeVariantDuration, describeVariantKind, type MoveChallengeVariant, type MoveMilestoneFamily } from "@/lib/move/challengeDefs";
import { formatDistance } from "@/lib/move/movement";
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
function ChallengeRing({ ratio, size, accent, track }: { ratio: number; size: number; accent: string; track: string }) {
  const stroke = 5;
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
 * One statement: how far, of how much, and how long is left. Everything else on
 * that screen is smaller than this.
 */
export function ChallengeHeadline({ progress }: { progress: ChallengeProgress }) {
  const { palette } = useLumo();
  const accent = useMoveAccent();

  const covered = progress.currentM / 1000;

  return (
    <View style={styles.headline}>
      <AppText variant="bodySmall" color={palette.body}>
        {progress.variant.title}
      </AppText>

      <View style={styles.headlineRow}>
        <AppText color={palette.ink} style={styles.headlineValue} numberOfLines={1}>
          {covered < 10 ? covered.toFixed(1) : Math.round(covered)}
        </AppText>
        <AppText color={palette.body} style={styles.headlineUnit}>
          / {progress.targetM / 1000} km
        </AppText>
      </View>

      <MoveProgressBar
        ratio={progress.ratio}
        accent={accent.fill}
        label={`${progress.variant.title}, ${formatDistance(progress.currentM)} of ${formatDistance(progress.targetM)}`}
      />

      <AppText variant="caption" color={palette.subtle}>
        {progress.complete
          ? "Complete"
          : `${formatDistance(progress.remainingM)} to go${progress.daysLeft === null ? "" : ` · ${progress.daysLeft} ${progress.daysLeft === 1 ? "day" : "days"} left`}`}
      </AppText>
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
            <Icon name={fact.icon} size={16} color={palette.subtle} weight="bulk" />
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

/**
 * Who else is on it, and how they are doing.
 *
 * Ordered by contribution but deliberately unnumbered — no places, no medals.
 * Everyone is walking the same distance; this is company, not a leaderboard.
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
    <View style={styles.team}>
      <View style={styles.teamHead}>
        <AppText variant="bodySmall" color={palette.ink} style={styles.rowTitle}>
          Together
        </AppText>
        <AppText variant="caption" color={palette.subtle}>
          {formatDistance(progress.teamM)} · {progress.teamDone} of {progress.teamSize} there
        </AppText>
      </View>

      {roster.map((participant) => {
        const member = byId.get(participant.userId);
        const name = participant.userId === meId ? "You" : (member?.name ?? participant.name);
        const done = participant.contributionM >= progress.targetM;

        return (
          <View key={participant.userId} style={styles.member}>
            {member?.avatar ? (
              <Avatar config={member.avatar} size={28} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: alpha(palette.hairline, "80") }]}>
                <Icon name="user" size={14} color={palette.muted} weight="bulk" />
              </View>
            )}

            <View style={styles.memberText}>
              <AppText variant="caption" color={palette.ink} numberOfLines={1}>
                {name}
              </AppText>
              <MoveProgressBar
                ratio={Math.min(1, participant.contributionM / Math.max(1, progress.targetM))}
                accent={done ? palette.greenDark : accent.glyph}
                height={4}
                label={`${name}, ${formatDistance(participant.contributionM)}`}
              />
            </View>

            <AppText variant="caption" color={done ? palette.greenDark : palette.body}>
              {formatDistance(participant.contributionM)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rowTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
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
    gap: spacing.xs
  },
  headlineRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs
  },
  headlineValue: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 52,
    lineHeight: 60
  },
  headlineUnit: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 20
  },
  facts: {
    flexDirection: "row",
    alignItems: "center",
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
    gap: spacing.sm
  },
  teamHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  member: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: radius.pill
  },
  memberText: {
    flex: 1,
    gap: spacing.xxs
  }
});
