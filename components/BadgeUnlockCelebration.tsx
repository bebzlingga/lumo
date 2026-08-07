import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { badges, type BadgeProgress } from "@/lib/badges";
import { BadgeDialog } from "./BadgeDialog";
import { Button } from "./ui";

/** What the dialog is currently showing: which badge, and whether this is the
 *  moment it was earned. */
type Shown = { badge: BadgeProgress; celebrate: boolean };

/**
 * Watches the best-streak high-water mark and pops the badge card the moment it
 * crosses a threshold. Only fires on in-session transitions — on app start the
 * current mark is taken as the baseline, so historical badges never
 * re-celebrate.
 *
 * Reads the persisted mark rather than the live habits precisely because it
 * only ever rises: computing it from habits meant deleting one could drop the
 * number back below a threshold and celebrate the same badge twice.
 *
 * The card itself is `BadgeDialog` in celebrate mode — the same card the Badges
 * screen and Profile open, so a badge looks identical whether you just earned
 * it or tapped it a month later. It brings Share with it, which is worth having
 * at exactly this moment.
 */
export function BadgeUnlockCelebration() {
  const router = useRouter();
  const { settings, isReady, palette } = useLumo();
  const bestStreak = settings.bestStreakEver;
  const previousStreak = React.useRef<number | null>(null);
  const [shown, setShown] = React.useState<Shown | null>(null);

  React.useEffect(() => {
    if (!isReady) {
      return;
    }

    if (previousStreak.current === null) {
      previousStreak.current = bestStreak;
      return;
    }

    const previous = previousStreak.current;
    previousStreak.current = bestStreak;

    if (bestStreak > previous) {
      const newlyUnlocked = badges.filter((badge) => badge.threshold > previous && badge.threshold <= bestStreak);

      if (newlyUnlocked.length) {
        // Just crossed the threshold, so it is earned by definition — the card's
        // locked art would be nonsense on the celebration for it.
        setShown({ badge: { ...newlyUnlocked[newlyUnlocked.length - 1], earned: true }, celebrate: true });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
    }
  }, [bestStreak, isReady]);

  function close() {
    setShown(null);
  }

  return (
    <BadgeDialog
      badge={shown?.badge ?? null}
      onClose={close}
      celebrate={shown?.celebrate ?? false}
      footer={
        // One action. Dismissing already has two obvious routes — the backdrop
        // and the system back gesture — so a "Keep going" button was a second
        // way to do nothing, sitting at the same weight as the real one.
        <View style={styles.footer}>
          {/* Ghost, so it sits directly on the dimmed backdrop with no plate of
              its own and the card keeps every bit of the weight. Ghost's label
              is palette.ink, which is a dark brown on this overlay — overridden
              to white, since here the button is on the scrim, not on a card. */}
          <Button
            label="Show All Badges"
            variant="ghost"
            style={styles.footerButton}
            labelStyle={{ color: palette.white }}
            onPress={() => {
              close();
              router.push("/badges");
            }}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  // Sits below the card, on the dimmed overlay rather than on the art — the
  // card's own foot is already occupied by Share.
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  footerButton: {
    flex: 1
  }
});
