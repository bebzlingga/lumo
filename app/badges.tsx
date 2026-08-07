import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
// NOT react-native's Pressable: NativeWind's cssInterop collects a
// function-valued `style` into an array, so RN never calls it and the button
// renders completely unstyled. This wrapper resolves the callback first.
import { Pressable } from "@/components/Pressable";
import { BadgeDialog } from "@/components/BadgeDialog";
import { BadgeImage } from "@/components/BadgeImage";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { badgeTierMeta, earnedBadgeCount, habitBadges, type BadgeProgress } from "@/lib/badges";
import { alpha } from "@/lib/color";

const GRID_COLUMNS = 3;
/** The air the grid leaves between columns. Everything else is the badge. */
const GRID_GUTTER = spacing.sm;

export default function BadgesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { settings, isReady, palette } = useLumo();
  /**
   * Derived rather than the flat 88 it was, which left a third of each column
   * empty on the art the page is mostly made of. A column is whatever is left
   * of the screen once the gutters are taken out, and the badge fills it.
   *
   * Measured, not a percentage: at "31%" a fixed badge size has to be picked
   * for the narrowest screen it might meet, or it overflows its own cell there.
   */
  const cellWidth = Math.floor((width - layout.screenPaddingX * 2 - GRID_GUTTER * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
  // The persisted high-water mark, not the live habits — a badge stays earned
  // even after the habit that earned it is deleted.
  const bestStreak = settings.bestStreakEver;
  const allBadges = React.useMemo(() => habitBadges(bestStreak), [bestStreak]);
  const earned = earnedBadgeCount(bestStreak);
  const [selectedBadge, setSelectedBadge] = React.useState<BadgeProgress | null>(null);



  return (
    // The trophies plate, at `medium` rather than the app-wide `subtle` — this
    // screen is mostly badge art on open canvas, so the plate can carry more.
    <Screen contentStyle={styles.content} backgroundVariant="trophies" backgroundIntensity="medium">
      <ScreenHeader title="Badges" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      <View style={styles.hero}>
        <AppText color={palette.ink} style={styles.title}>
          Streak Badges
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
          Keep the spark glowing. Hit a milestone and the badge is yours to keep.
        </AppText>
        <View style={[styles.progressPill, { backgroundColor: palette.greenSoft }]}>
          <Icon name="trophy" size={14} color={palette.greenDark} weight="bulk" />
          <AppText variant="caption" color={palette.greenDark} style={styles.progressText}>
            {earned} of {allBadges.length} unlocked
          </AppText>
        </View>
      </View>

      {/* One grid in threshold order. The tier split put three or fewer badges
          under each of five headings, which read as more structure than there
          is — the art already says how far up the ladder a badge sits. */}
      <View style={styles.grid}>
        {allBadges.map((badge) => (
          <BadgeCell
            key={badge.threshold}
            badge={badge}
            accent={badgeTierMeta[badge.tier].accent}
            size={cellWidth}
            onPress={() => setSelectedBadge(badge)}
          />
        ))}
        {/* The grid is `space-between`, which spreads a short final row to the
            edges — eight badges would leave the last one stranded on the right.
            Empty cells fill the row so it packs from the left like the others. */}
        {Array.from({ length: (GRID_COLUMNS - (allBadges.length % GRID_COLUMNS)) % GRID_COLUMNS }, (_, index) => (
          <View key={`filler-${index}`} style={[styles.cell, { width: cellWidth }]} />
        ))}
      </View>

      {isReady && bestStreak === 0 ? (
        <AppText variant="bodySmall" color={palette.subtle} style={styles.emptyNote}>
          Check in a few days in a row to light up your first badge — any habit counts.
        </AppText>
      ) : null}

      <BadgeDialog badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
    </Screen>
  );
}


function BadgeCell({
  badge,
  accent,
  size,
  onPress
}: {
  badge: BadgeProgress;
  accent: string;
  /** Column width — the badge art fills it edge to edge. */
  size: number;
  onPress: () => void;
}) {
  const { palette } = useLumo();
  const [pressed, setPressed] = React.useState(false);

  return (
    <Pressable
      accessibilityRole={badge.earned ? "button" : undefined}
      accessibilityLabel={`${badge.name}, a ${badge.threshold}-day streak badge, ${badge.earned ? "earned. Tap to share." : "locked."}`}
      disabled={!badge.earned}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.cell, { width: size, opacity: pressed ? 0.7 : 1 }]}
    >
      <BadgeImage threshold={badge.threshold} earned={badge.earned} size={size} />
      <AppText variant="bodySmall" color={badge.earned ? palette.ink : palette.subtle} numberOfLines={1} style={styles.cellTitle}>
        {badge.name}
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
  title: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 32,
    lineHeight: 38,
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.lg
  },
  // Width is measured per screen and passed in, so it is not set here.
  cell: {
    alignItems: "center",
    gap: spacing.xxs
  },
  cellTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 13,
    lineHeight: 18,
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
