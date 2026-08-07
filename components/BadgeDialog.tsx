import React from "react";
import { AwardDialog } from "@/components/AwardDialog";
import { BadgeImage } from "@/components/BadgeImage";
import { useLumo } from "@/context/LumoContext";
import { badgeTierMeta, type BadgeProgress } from "@/lib/badges";

/**
 * The streak-badge card, opened from the Badges screen, Profile, and the unlock
 * celebration.
 *
 * All the card itself is `AwardDialog`, which the group-trophy card also uses —
 * this is the badge's copy and art, not a second card. Everything a badge says
 * that a trophy doesn't is right here: the day-count kicker, and a lock chip
 * that counts the best streak up towards the milestone.
 */
export function BadgeDialog({
  badge,
  onClose,
  celebrate = false,
  footer
}: {
  badge: BadgeProgress | null;
  onClose: () => void;
  /** Just-earned: confetti, a pulsing halo, and the unlock kicker. */
  celebrate?: boolean;
  /** Extra controls under the card — the celebration's "Show All Badges". */
  footer?: React.ReactNode;
}) {
  const { settings } = useLumo();
  // The persisted high-water mark — what the lock chip counts up towards.
  const bestStreak = settings.bestStreakEver;
  const tier = badge ? badgeTierMeta[badge.tier] : null;

  return (
    <AwardDialog
      content={
        badge && tier
          ? {
              id: `badge-${badge.threshold}`,
              kicker: celebrate ? "BADGE UNLOCKED" : `${tier.name.toUpperCase()} BADGE`,
              title: badge.name,
              description: badge.description,
              earned: badge.earned,
              accent: tier.accent,
              // How far along, not just the toll: "30 day streak to unlock" was
              // the same sentence at day 0 and at day 29.
              lockLabel: `${Math.min(bestStreak, badge.threshold)} / ${badge.threshold} day streak`,
              renderArt: (size) => <BadgeImage threshold={badge.threshold} earned={badge.earned} size={size} />
            }
          : null
      }
      onClose={onClose}
      celebrate={celebrate}
      footer={footer}
    />
  );
}
