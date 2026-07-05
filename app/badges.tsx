import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React from "react";
import { Alert, Modal, Pressable, StyleSheet, View } from "react-native";
import { BadgeArt } from "@/components/BadgeArt";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { badgesByTier, badgeTierMeta, earnedBadgeCount, badges as allBadges, type BadgeProgress } from "@/lib/badges";
import { alpha } from "@/lib/color";
import { bestStreakAcrossHabits } from "@/lib/habitMath";

export default function BadgesScreen() {
  const router = useRouter();
  const { habits, isReady, isDark, palette } = useLumo();
  const bestStreak = React.useMemo(() => bestStreakAcrossHabits(habits), [habits]);
  const tiers = React.useMemo(() => badgesByTier(bestStreak), [bestStreak]);
  const earned = earnedBadgeCount(bestStreak);
  const [selectedBadge, setSelectedBadge] = React.useState<BadgeProgress | null>(null);
  const shareCardRef = React.useRef<View>(null);
  const selectedTier = selectedBadge ? badgeTierMeta[selectedBadge.tier] : null;
  const cardBackground = isDark ? palette.surfaceStrong : palette.greenDark;
  const cardText = isDark ? palette.ink : palette.white;
  const cardMuted = isDark ? palette.muted : palette.greenSoft;

  // view-shot and media-library are required lazily: they're native modules,
  // and importing them at the top would crash this screen on app builds that
  // don't include them yet.
  async function captureCard(): Promise<string | null> {
    try {
      const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
      return await captureRef(shareCardRef, { format: "png", quality: 1 });
    } catch {
      Alert.alert("Almost there", "Badge sharing needs the latest app build. Rebuild the app to enable it.");
      return null;
    }
  }

  async function handleShare() {
    const uri = await captureCard();
    if (!uri) {
      return;
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your badge" });
      }
    } catch {
      Alert.alert("Sharing failed", "Could not share the badge image. Please try again.");
    }
  }

  async function handleDownload() {
    let MediaLibrary: typeof import("expo-media-library");

    try {
      MediaLibrary = require("expo-media-library");
    } catch {
      Alert.alert("Almost there", "Saving badges needs the latest app build. Rebuild the app to enable it.");
      return;
    }

    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow photo access in Settings to save your badge.");
        return;
      }
      const uri = await captureCard();
      if (!uri) {
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert("Saved", "Your badge card is in your photo library.");
    } catch {
      Alert.alert("Download failed", "Could not save the badge image. Please try again.");
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
      />

      <View style={styles.hero}>
        <View style={[styles.kicker, { backgroundColor: palette.card, shadowColor: palette.shadow }]}>
          <Icon name="sparkle" size={14} color={palette.glow} weight="bulk" />
          <AppText variant="caption" color={palette.subtle} style={styles.kickerText}>
            HABIT TRACKER · ACHIEVEMENTS
          </AppText>
        </View>
        <AppText color={palette.ink} style={styles.title}>
          Streak Badges
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
          Keep the spark glowing. Hit a milestone and the badge is yours to keep — climbing from Bronze all the way to Diamond.
        </AppText>
        <View style={[styles.progressPill, { backgroundColor: palette.greenSoft }]}>
          <Icon name="trophy" size={14} color={palette.greenDark} weight="bulk" />
          <AppText variant="caption" color={palette.greenDark} style={styles.progressText}>
            {earned} of {allBadges.length} unlocked
          </AppText>
        </View>
      </View>

      {tiers.map((tier) => (
        <View key={tier.key} style={styles.tierSection}>
          <View style={styles.tierHeader}>
            <View style={[styles.tierDot, { backgroundColor: tier.accent }]} />
            <AppText variant="titleSmall" color={palette.ink} style={styles.tierName}>
              {tier.name}
            </AppText>
            <AppText variant="bodySmall" color={palette.subtle}>
              · {tier.subtitle}
            </AppText>
          </View>
          <View style={styles.grid}>
            {tier.badges.map((badge) => (
              <BadgeCell key={badge.threshold} badge={badge} accent={tier.accent} onPress={() => setSelectedBadge(badge)} />
            ))}
          </View>
        </View>
      ))}

      {isReady && bestStreak === 0 ? (
        <AppText variant="bodySmall" color={palette.subtle} style={styles.emptyNote}>
          Complete a habit a few days in a row to light up your first badge.
        </AppText>
      ) : null}

      <Modal visible={Boolean(selectedBadge)} transparent animationType="fade" onRequestClose={() => setSelectedBadge(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} accessibilityLabel="Close" onPress={() => setSelectedBadge(null)} />
          {selectedBadge && selectedTier ? (
            <View style={styles.modalContent} pointerEvents="box-none">
              <View ref={shareCardRef} collapsable={false} style={[styles.shareCard, { backgroundColor: cardBackground }]}>
                <AppText variant="caption" color={cardMuted} style={styles.shareKicker}>
                  STREAK MILESTONE
                </AppText>
                <BadgeArt threshold={selectedBadge.threshold} tier={selectedBadge.tier} accent={selectedTier.accent} earned size={150} />
                <AppText color={cardText} style={styles.shareTitle}>
                  {selectedBadge.threshold}-Day Streak
                </AppText>
                <AppText variant="bodySmall" color={cardMuted} style={styles.shareSubtitle}>
                  {selectedTier.name} badge · earned with Lumo
                </AppText>
              </View>
              <View style={styles.shareActions}>
                <ShareActionButton icon="upload" label="Share" background={palette.green} color={palette.white} onPress={handleShare} />
                <ShareActionButton icon="download" label="Save" background={palette.greenSoft} color={palette.greenDark} onPress={handleDownload} />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

// NativeWind's css-interop drops function-valued `style` props on Pressable,
// so pressed state is tracked manually and the style is passed as a plain array.
function ShareActionButton({
  icon,
  label,
  background,
  color,
  onPress
}: {
  icon: "upload" | "download";
  label: string;
  background: string;
  color: string;
  onPress: () => void;
}) {
  const [pressed, setPressed] = React.useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.shareButton, { backgroundColor: background, opacity: pressed ? 0.8 : 1 }]}
    >
      <Icon name={icon} size={18} color={color} weight="bulk" />
      <AppText variant="button" color={color}>
        {label}
      </AppText>
    </Pressable>
  );
}

function BadgeCell({ badge, accent, onPress }: { badge: BadgeProgress; accent: string; onPress: () => void }) {
  const { palette } = useLumo();
  const [pressed, setPressed] = React.useState(false);

  return (
    <Pressable
      accessibilityRole={badge.earned ? "button" : undefined}
      accessibilityLabel={`${badge.threshold}-day streak badge, ${badge.earned ? "earned. Tap to share." : "locked."}`}
      disabled={!badge.earned}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.cell, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={{ opacity: badge.earned ? 1 : 0.45 }}>
        <BadgeArt threshold={badge.threshold} tier={badge.tier} accent={accent} earned size={88} />
      </View>
      <AppText variant="bodySmall" color={badge.earned ? palette.ink : palette.subtle} numberOfLines={1} style={styles.cellTitle}>
        {badge.threshold}-Day Streak
      </AppText>
      <View style={[styles.tierChip, { backgroundColor: alpha(accent, "26") }]}>
        <AppText variant="caption" color={accent} style={styles.tierChipText}>
          {badge.tier.toUpperCase()}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.lg
  },
  hero: {
    alignItems: "center",
    gap: spacing.sm
  },
  kicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2
  },
  kickerText: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 1
  },
  title: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 38,
    lineHeight: 44,
    textAlign: "center"
  },
  subtitle: {
    textAlign: "center",
    maxWidth: 340,
    lineHeight: 20
  },
  progressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xxs
  },
  progressText: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 0.4
  },
  tierSection: {
    gap: spacing.md
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs
  },
  tierDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill
  },
  tierName: {
    fontFamily: fontFamilies.lexendBold
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.lg
  },
  cell: {
    width: "31%",
    alignItems: "center",
    gap: spacing.xxs
  },
  cellTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center"
  },
  tierChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2
  },
  tierChipText: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 10,
    letterSpacing: 0.6
  },
  emptyNote: {
    textAlign: "center",
    lineHeight: 20
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  modalContent: {
    width: "100%",
    maxWidth: 340,
    gap: spacing.md
  },
  shareCard: {
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.nav,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg
  },
  shareKicker: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 1.5
  },
  shareTitle: {
    fontFamily: "Lexend-Black",
    fontSize: 26,
    lineHeight: 32
  },
  shareSubtitle: {
    fontFamily: fontFamilies.lexendMedium
  },
  shareActions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  shareButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.pill
  }
});
