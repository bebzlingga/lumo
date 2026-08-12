import React from "react";
import { AwardDialog } from "@/components/AwardDialog";
import { TrophyImage } from "@/components/TrophyImage";
import { TROPHY_MIN_MEMBERS, groupChallengeTierMeta, type GroupTrophy, type GroupTrophyMetric } from "@/constants/groupChallenges";

/**
 * What each metric is counting, so a locked trophy's chip reads as a sentence
 * rather than as a bare fraction. "12 / 750" says nothing on its own; "12 / 750
 * completions" says what the group has to go and do.
 */
const METRIC_UNIT: Record<GroupTrophyMetric, string> = {
  completions: "completions",
  streak: "day group streak",
  members: "members",
  rollCallStreak: "day roll call",
  challengesWon: "challenges won"
};

/**
 * The group-trophy card. Same card as the streak badges' (`AwardDialog`) — this
 * is the trophy's copy and art. A trophy belongs to the whole group, so its
 * locked chip counts the GROUP's progress towards the target.
 */
export function TrophyDialog({
  trophy,
  earned,
  current,
  members,
  onClose
}: {
  trophy: GroupTrophy | null;
  earned: boolean;
  /** The group's live value for this trophy's metric. */
  current: number;
  /**
   * How many people are in the group. Required rather than optional: without it
   * a shelf held back by `TROPHY_MIN_MEMBERS` shows a full bar on a locked
   * trophy, and a caller would have no reason to notice.
   */
  members: number;
  onClose: () => void;
}) {
  /**
   * A trophy the group cannot reach at all yet, because it is one person.
   *
   * The fraction is the wrong thing to show here — a solo group with 20 of the
   * 14 completions would read "14 / 14" under a locked award, which looks like a
   * bug rather than like a rule. The `members` trophies are exempt: their own
   * target is above the floor, so counting towards it says the same thing.
   */
  const heldForMembers = trophy !== null && !earned && trophy.metric !== "members" && members < TROPHY_MIN_MEMBERS;

  return (
    <AwardDialog
      content={
        trophy
          ? {
              id: `trophy-${trophy.id}`,
              kicker: `${groupChallengeTierMeta[trophy.tier].label.toUpperCase()} TROPHY`,
              title: trophy.name,
              description: trophy.description,
              earned,
              accent: groupChallengeTierMeta[trophy.tier].accent,
              lockLabel: heldForMembers
                ? `Needs ${TROPHY_MIN_MEMBERS}+ members`
                : `${Math.min(current, trophy.target)} / ${trophy.target} ${METRIC_UNIT[trophy.metric]}`,
              renderArt: (size) => <TrophyImage id={trophy.id} earned={earned} size={size} />
            }
          : null
      }
      onClose={onClose}
    />
  );
}
