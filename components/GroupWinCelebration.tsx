import * as Haptics from "expo-haptics";
import React from "react";
import { Modal, Pressable, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import { groupChallengeTierMeta, trophyVariantIcon, type GroupTrophy } from "@/constants/groupChallenges";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { Icon } from "@/components/Icon";
import { AppText } from "@/components/ui";

const CONFETTI_COLORS = ["#FFC94D", "#4BA97A", "#5B9BD5", "#E8871A", "#D0405E", "#FFFFFF"];

type Payload =
  | { kind: "trophy"; trophy: GroupTrophy }
  | { kind: "level"; level: number };

/**
 * Watches the group's trophy count and score level, and pops a confetti
 * celebration the moment either climbs. Only fires on in-session transitions —
 * the first render sets the baseline so historical wins never re-celebrate.
 * Mirrors BadgeUnlockCelebration's baseline-ref pattern.
 *
 * Trophies, not the milestone ladder this used to watch: that ladder is gone (see
 * the note at the top of `constants/groupChallenges.ts`), and the shelf tests the
 * same metrics. A group that would have seen "First Wins" now sees the trophy of
 * the same name, once.
 */
export function GroupWinCelebration({
  groupName,
  trophies,
  scoreLevel
}: {
  groupName: string;
  /** The group's earned trophies, in shelf order — best last. */
  trophies: GroupTrophy[];
  scoreLevel: number;
}) {
  const { palette, isDark } = useLumo();
  const { width } = useWindowDimensions();
  const [payload, setPayload] = React.useState<Payload | null>(null);

  const trophyCount = trophies.length;
  const previousTrophies = React.useRef<number | null>(null);
  const previousLevel = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (previousTrophies.current === null) {
      previousTrophies.current = trophyCount;
      previousLevel.current = scoreLevel;
      return;
    }

    const prevTrophies = previousTrophies.current;
    const prevLevel = previousLevel.current ?? scoreLevel;
    previousTrophies.current = trophyCount;
    previousLevel.current = scoreLevel;

    // A new trophy outranks a bare level-up when both land on the same tick.
    if (trophyCount > prevTrophies) {
      const newest = trophies[trophies.length - 1];
      if (newest) {
        setPayload({ kind: "trophy", trophy: newest });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
    } else if (scoreLevel > prevLevel) {
      setPayload({ kind: "level", level: scoreLevel });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    // `trophies` is intentionally read from the current closure, not a dep: it
    // changes identity every render, and trophyCount already captures the only
    // transition we care about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trophyCount, scoreLevel]);

  function close() {
    setPayload(null);
  }

  const accent = payload?.kind === "trophy" ? groupChallengeTierMeta[payload.trophy.tier].accent : palette.accent;
  const icon = payload?.kind === "trophy" ? trophyVariantIcon[payload.trophy.variant] : "crown1";
  const kicker = payload?.kind === "trophy" ? `${groupChallengeTierMeta[payload.trophy.tier].label.toUpperCase()} TROPHY` : "LEVEL UP";
  const title = payload?.kind === "trophy" ? payload.trophy.name : `Level ${payload?.level ?? ""}`;
  const subtitle =
    payload?.kind === "trophy"
      ? payload.trophy.requirement
      : `${groupName} just reached a new group level. Keep the momentum going!`;

  const cardBackground = isDark ? palette.surfaceStrong : palette.greenDark;
  const cardText = isDark ? palette.ink : palette.white;
  const cardMuted = isDark ? palette.muted : palette.greenSoft;

  async function share() {
    const line =
      payload?.kind === "trophy"
        ? `just unlocked "${title}"`
        : `just hit Level ${payload?.level ?? ""}`;
    await Share.share({ message: `🎉 Our group "${groupName}" on Lumo ${line}! Come climb with us.` }).catch(() => undefined);
  }

  return (
    <Modal visible={Boolean(payload)} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={close} />
        {payload ? (
          <>
            <ConfettiCannon
              count={140}
              origin={{ x: width / 2, y: -20 }}
              colors={CONFETTI_COLORS}
              fadeOut
              autoStart
              explosionSpeed={360}
              fallSpeed={2900}
            />
            <View style={styles.content} pointerEvents="box-none">
              <View style={[styles.card, { backgroundColor: cardBackground }]}>
                <AppText variant="caption" color={cardMuted} style={styles.kicker}>
                  {kicker}
                </AppText>
                <View style={[styles.badge, { backgroundColor: accent }]}>
                  <Icon name={icon} size={56} color="#FFFFFF" weight="bulk" />
                </View>
                <AppText color={cardText} style={styles.title}>
                  {title}
                </AppText>
                <AppText variant="bodySmall" color={cardMuted} style={styles.subtitle}>
                  {subtitle}
                </AppText>
              </View>
              <View style={styles.actions}>
                <CelebrationButton label="Share the win" background={palette.green} color={palette.white} onPress={share} />
                <CelebrationButton label="Nice!" background={palette.greenSoft} color={palette.greenDark} onPress={close} />
              </View>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

// NativeWind's css-interop drops function-valued `style` props on Pressable, so
// pressed state is tracked manually and the style is passed as a plain array.
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
    borderRadius: radius.dialog,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg
  },
  kicker: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 1.5
  },
  badge: {
    width: 108,
    height: 108,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.xs
  },
  title: {
    fontFamily: "Lexend-Black",
    fontSize: 26,
    lineHeight: 32,
    textAlign: "center"
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
