import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { AwardDialog } from "@/components/AwardDialog";
import { FamilyBadge } from "@/components/move/MoveBadge";
import { Button } from "@/components/ui";
import { MOVE_ACCENT } from "@/constants/tools";
import { spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { familyProgress } from "@/lib/move/achievements";
import { findFamily } from "@/lib/move/challengeDefs";

/**
 * The card that lands when a Move challenge is finished.
 *
 * `AwardDialog`, the same card the streak badges and group trophies use — so an
 * award looks identical whoever earned it and however. It brings the confetti,
 * the pulsing halo and Share with it, which is exactly what this moment wants
 * and none of which is worth a second implementation.
 *
 * Two moments, one card:
 *
 *  - a ROUTE finished, which is progress. Locked art, and the lock line counts
 *    the routes toward the badge.
 *  - the BADGE earned. Unlocked art and the confetti.
 *
 * Mounted at the root next to `BadgeUnlockCelebration`, above the Stack, so a
 * finish lands wherever the user happens to be — the walk that completes a
 * challenge is far more likely to be noticed from Home or a locked phone than
 * from the Move screen.
 */
export function MoveCelebration() {
  const router = useRouter();
  const { palette } = useLumo();
  const move = useMove();
  const celebration = move.celebration;

  // One buzz per celebration, on the transition rather than on every render.
  const buzzed = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!celebration || buzzed.current === celebration.milestoneId + celebration.title) {
      return;
    }

    buzzed.current = celebration.milestoneId + celebration.title;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [celebration]);

  const family = celebration ? findFamily(celebration.milestoneId) : undefined;
  const routes = family ? familyProgress(move.achievements, family) : null;

  return (
    <AwardDialog
      content={
        celebration && family
          ? {
              id: `move-${family.id}-${celebration.badgeEarned ? "badge" : "route"}`,
              kicker: celebration.badgeEarned ? "BADGE UNLOCKED" : "ROUTE COMPLETE",
              title: celebration.badgeEarned ? family.title : celebration.title,
              description: celebration.withNames.length
                ? `${celebration.body} With ${celebration.withNames.join(", ")}.`
                : celebration.body,
              earned: celebration.badgeEarned,
              accent: MOVE_ACCENT,
              lockLabel: routes ? `${routes.done} / ${routes.total} routes` : undefined,
              // Drawn short of the size the card offers. A Move badge fills
              // ~90% of its canvas where a streak badge leaves far more air, so
              // at the same nominal size it lands noticeably heavier than every
              // other award card in the app.
              renderArt: (size) => (
                <View style={styles.art}>
                  <FamilyBadge family={family} unlocked={celebration.badgeEarned} size={Math.round(size * 0.74)} />
                </View>
              )
            }
          : null
      }
      onClose={move.dismissCelebration}
      celebrate={celebration?.badgeEarned ?? false}
      footer={
        <View style={styles.footer}>
          {/* Ghost sits straight on the dimmed backdrop with no plate of its
              own, so the card keeps every bit of the weight. Its label is
              `ink` by default — a dark brown that disappears on the scrim. */}
          <Button
            label={celebration?.badgeEarned ? "Show All Badges" : "Keep Going"}
            variant="ghost"
            style={styles.footerButton}
            labelStyle={{ color: palette.white }}
            onPress={() => {
              move.dismissCelebration();

              if (celebration?.badgeEarned) {
                router.push("/move/badges");
              }
            }}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  // Air above and below the badge, added here rather than in `AwardDialog` so
  // the streak and trophy cards keep the spacing they were drawn to.
  art: {
    alignItems: "center",
    paddingVertical: spacing.md
  },
  footer: {
    alignItems: "center",
    paddingTop: spacing.xs
  },
  footerButton: {
    minWidth: 200
  }
});
