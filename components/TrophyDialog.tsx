import React from "react";
import { AwardDialog } from "@/components/AwardDialog";
import { TrophyImage } from "@/components/TrophyImage";
import { groupChallengeTierMeta, type GroupTrophy, type GroupTrophyMetric } from "@/constants/groupChallenges";

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
  onClose
}: {
  trophy: GroupTrophy | null;
  earned: boolean;
  /** The group's live value for this trophy's metric. */
  current: number;
  onClose: () => void;
}) {
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
              lockLabel: `${Math.min(current, trophy.target)} / ${trophy.target} ${METRIC_UNIT[trophy.metric]}`,
              renderArt: (size) => <TrophyImage id={trophy.id} earned={earned} size={size} />
            }
          : null
      }
      onClose={onClose}
    />
  );
}
