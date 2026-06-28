import { useRouter } from "expo-router";
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { badgesByTier, earnedBadgeCount, badges as allBadges, type BadgeProgress } from "@/lib/badges";
import { alpha } from "@/lib/color";
import { bestStreakAcrossHabits } from "@/lib/habitMath";

export default function BadgesScreen() {
  const router = useRouter();
  const { habits, isReady, palette } = useLumo();
  const bestStreak = React.useMemo(() => bestStreakAcrossHabits(habits), [habits]);
  const tiers = React.useMemo(() => badgesByTier(bestStreak), [bestStreak]);
  const earned = earnedBadgeCount(bestStreak);

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
              <BadgeCell key={badge.threshold} badge={badge} accent={tier.accent} />
            ))}
          </View>
        </View>
      ))}

      {isReady && bestStreak === 0 ? (
        <AppText variant="bodySmall" color={palette.subtle} style={styles.emptyNote}>
          Complete a habit a few days in a row to light up your first badge.
        </AppText>
      ) : null}
    </Screen>
  );
}

function BadgeCell({ badge, accent }: { badge: BadgeProgress; accent: string }) {
  const { palette } = useLumo();

  return (
    <View style={styles.cell}>
      <Image source={badge.source} style={styles.badgeImage} resizeMode="contain" />
      <View style={styles.statusRow}>
        <Icon
          name={badge.earned ? "checkCircle" : "minusCircle"}
          size={14}
          color={badge.earned ? palette.greenDark : palette.muted}
          weight="bulk"
        />
        <AppText variant="caption" color={badge.earned ? palette.greenDark : palette.muted} style={styles.statusText}>
          {badge.earned ? "EARNED" : "LOCKED"}
        </AppText>
      </View>
      <AppText variant="bodySmall" color={badge.earned ? palette.ink : palette.subtle} numberOfLines={1} style={styles.cellTitle}>
        {badge.threshold}-Day Streak
      </AppText>
      <View style={[styles.tierChip, { backgroundColor: alpha(accent, "26") }]}>
        <AppText variant="caption" color={accent} style={styles.tierChipText}>
          {badge.tier.toUpperCase()}
        </AppText>
      </View>
    </View>
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
  badgeImage: {
    width: "82%",
    maxWidth: 96,
    aspectRatio: 1
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs
  },
  statusText: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 10,
    letterSpacing: 0.6
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
  }
});
