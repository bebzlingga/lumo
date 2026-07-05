import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { badges, badgeTierMeta, type Badge } from "@/lib/badges";
import { bestStreakAcrossHabits } from "@/lib/habitMath";
import { BadgeArt } from "./BadgeArt";
import { AppText } from "./ui";

/**
 * Watches the best streak across habits and pops a congratulatory card the
 * moment it crosses a badge threshold. Only fires on in-session transitions —
 * on app start the current streak is taken as the baseline, so historical
 * badges never re-celebrate.
 */
export function BadgeUnlockCelebration() {
  const router = useRouter();
  const { habits, isReady, isDark, palette } = useLumo();
  const bestStreak = bestStreakAcrossHabits(habits);
  const previousStreak = React.useRef<number | null>(null);
  const [unlocked, setUnlocked] = React.useState<Badge | null>(null);

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
        setUnlocked(newlyUnlocked[newlyUnlocked.length - 1]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
    }
  }, [bestStreak, isReady]);

  const tier = unlocked ? badgeTierMeta[unlocked.tier] : null;
  const cardBackground = isDark ? palette.surfaceStrong : palette.greenDark;
  const cardText = isDark ? palette.ink : palette.white;
  const cardMuted = isDark ? palette.muted : palette.greenSoft;

  function close() {
    setUnlocked(null);
  }

  return (
    <Modal visible={Boolean(unlocked)} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} accessibilityLabel="Close" onPress={close} />
        {unlocked && tier ? (
          <View style={styles.content} pointerEvents="box-none">
            <View style={[styles.card, { backgroundColor: cardBackground }]}>
              <AppText variant="caption" color={cardMuted} style={styles.kicker}>
                BADGE UNLOCKED
              </AppText>
              <BadgeArt threshold={unlocked.threshold} tier={unlocked.tier} accent={tier.accent} earned size={140} />
              <AppText color={cardText} style={styles.title}>
                {unlocked.threshold}-Day Streak!
              </AppText>
              <AppText variant="bodySmall" color={cardMuted} style={styles.subtitle}>
                You just earned a {tier.name} badge. Keep the light glowing.
              </AppText>
            </View>
            <View style={styles.actions}>
              <CelebrationButton
                label="See my badges"
                background={palette.green}
                color={palette.white}
                onPress={() => {
                  close();
                  router.push("/badges");
                }}
              />
              <CelebrationButton label="Keep going" background={palette.greenSoft} color={palette.greenDark} onPress={close} />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

// NativeWind's css-interop drops function-valued `style` props on Pressable,
// so pressed state is tracked manually and the style is passed as a plain array.
function CelebrationButton({ label, background, color, onPress }: { label: string; background: string; color: string; onPress: () => void }) {
  const [pressed, setPressed] = React.useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.button, { backgroundColor: background, opacity: pressed ? 0.8 : 1 }]}
    >
      <AppText variant="button" color={color}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  content: {
    width: "100%",
    maxWidth: 340,
    gap: spacing.md
  },
  card: {
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.nav,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg
  },
  kicker: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 1.5
  },
  title: {
    fontFamily: "Lexend-Black",
    fontSize: 26,
    lineHeight: 32
  },
  subtitle: {
    fontFamily: fontFamilies.lexendMedium,
    textAlign: "center"
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  button: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md
  }
});
