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
import { MoveBadge } from "@/components/move/MoveBadge";
import { TrophyDialog } from "@/components/TrophyDialog";
import { TrophyImage } from "@/components/TrophyImage";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import {
  countWonChallenges,
  groupChallengeTierMeta,
  groupTrophies,
  trophyEarned,
  type GroupTrophy,
  type GroupTrophyMetrics
} from "@/constants/groupChallenges";
import { badgeTierMeta, earnedBadgeCount, habitBadges, type BadgeProgress } from "@/lib/badges";
import { friendsService, type Group } from "@/lib/friends";
import { alpha } from "@/lib/color";
import { hasMilestone, routesRequired, routesToBadge } from "@/lib/move/achievements";
import { MOVE_FAMILIES, type MoveMilestoneFamily } from "@/lib/move/challengeDefs";

const GRID_COLUMNS = 4;
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

  const move = useMove();
  const movesEarned = MOVE_FAMILIES.filter((family) => hasMilestone(move.achievements, family.id)).length;

  /**
   * Group trophies are earned by a GROUP, and this page belongs to a person —
   * so a trophy counts here if any one of your groups has earned it. Taking the
   * best figure per metric across every group says exactly that, because each
   * trophy tests a single metric.
   */
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [selectedTrophy, setSelectedTrophy] = React.useState<GroupTrophy | null>(null);

  React.useEffect(() => {
    let active = true;

    friendsService
      .listGroups()
      .then((list) => {
        if (active) {
          setGroups(list);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const groupMetrics: GroupTrophyMetrics = groups.reduce<GroupTrophyMetrics>(
    (best, group) => ({
      members: Math.max(best.members, group.members.length),
      completions: Math.max(best.completions, group.progress),
      streak: Math.max(best.streak, group.streak),
      rollCallStreak: Math.max(best.rollCallStreak, group.rollCallStreak),
      challengesWon: Math.max(best.challengesWon, countWonChallenges(group.habits, group.completedDaysByHabit))
    }),
    { members: 0, completions: 0, streak: 0, rollCallStreak: 0, challengesWon: 0 }
  );
  const trophiesEarned = groupTrophies.filter((trophy) => trophyEarned(trophy, groupMetrics)).length;



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

      {/* Move's badges live here as well as on their own screen. Somebody
          looking for "my badges" comes to this page, and a collection that is
          missing half of itself reads as a bug rather than a second home.

          The extra air above is what separates the two collections now the rule
          between them is gone — without it they read as one long grid. */}
      <View style={[styles.hero, styles.secondHero]}>
        <AppText color={palette.ink} style={styles.title}>
          Journey Badges
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
          Walk or run it your own way, against the clock, and alongside friends. Do all three and the badge is yours.
        </AppText>
        <View style={[styles.progressPill, { backgroundColor: palette.greenSoft }]}>
          <Icon name="walk" size={14} color={palette.greenDark} weight="bulk" />
          <AppText variant="caption" color={palette.greenDark} style={styles.progressText}>
            {movesEarned} of {MOVE_FAMILIES.length} unlocked
          </AppText>
        </View>
      </View>

      <View style={styles.grid}>
        {MOVE_FAMILIES.map((family) => (
          <MoveCell
            key={family.id}
            family={family}
            unlocked={hasMilestone(move.achievements, family.id)}
            routes={{ done: routesRequired(family) - routesToBadge(move.achievements, family), total: routesRequired(family) }}
            size={cellWidth}
            onPress={() => router.push({ pathname: "/move/[milestone]", params: { milestone: family.id } })}
          />
        ))}
        {Array.from({ length: (GRID_COLUMNS - (MOVE_FAMILIES.length % GRID_COLUMNS)) % GRID_COLUMNS }, (_, index) => (
          <View key={`move-filler-${index}`} style={[styles.cell, { width: cellWidth }]} />
        ))}
      </View>

      {/* Group awards, last: they are the only ones somebody else has a hand
          in, and the two collections above are yours alone. */}
      <View style={[styles.hero, styles.secondHero]}>
        <AppText color={palette.ink} style={styles.title}>
          Together
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
          Earned by a whole group, not by any one member. A trophy counts here once any group you are in has it.
        </AppText>
        <View style={[styles.progressPill, { backgroundColor: palette.greenSoft }]}>
          <Icon name="friends" size={14} color={palette.greenDark} weight="bulk" />
          <AppText variant="caption" color={palette.greenDark} style={styles.progressText}>
            {trophiesEarned} of {groupTrophies.length} unlocked
          </AppText>
        </View>
      </View>

      <View style={styles.grid}>
        {groupTrophies.map((trophy) => (
          <TrophyCell
            key={trophy.id}
            trophy={trophy}
            earned={trophyEarned(trophy, groupMetrics)}
            size={cellWidth}
            onPress={() => setSelectedTrophy(trophy)}
          />
        ))}
        {Array.from({ length: (GRID_COLUMNS - (groupTrophies.length % GRID_COLUMNS)) % GRID_COLUMNS }, (_, index) => (
          <View key={`trophy-filler-${index}`} style={[styles.cell, { width: cellWidth }]} />
        ))}
      </View>

      <BadgeDialog badge={selectedBadge} onClose={() => setSelectedBadge(null)} />

      {/* Locked trophies open too, unlike the streak grid's: what it takes is
          exactly what you tapped a locked one to find out. */}
      <TrophyDialog
        trophy={selectedTrophy}
        earned={selectedTrophy ? trophyEarned(selectedTrophy, groupMetrics) : false}
        current={selectedTrophy ? groupMetrics[selectedTrophy.metric] : 0}
        onClose={() => setSelectedTrophy(null)}
      />
    </Screen>
  );
}


/**
 * One Move milestone in the grid.
 *
 * Tappable whether or not it is earned, unlike a streak badge: a locked one
 * leads to the three routes that would unlock it, which is the whole point of
 * showing it. A streak badge has nowhere to send anybody.
 */
function MoveCell({
  family,
  unlocked,
  routes,
  size,
  onPress
}: {
  family: MoveMilestoneFamily;
  unlocked: boolean;
  /** How many of the milestone's routes are done, of how many there are. */
  routes: { done: number; total: number };
  size: number;
  onPress: () => void;
}) {
  const { palette } = useLumo();
  const [pressed, setPressed] = React.useState(false);
  // "3/3" at a quarter of the screen — the spelled-out version needs two lines
  // there, and the tally is the part that carries the meaning.
  const detail = unlocked ? "Earned" : `${routes.done}/${routes.total}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${family.title}. ${routes.done} of ${routes.total} routes done. ${unlocked ? "Earned" : "Not yet earned"}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.cell, { width: size, opacity: pressed ? 0.7 : 1 }]}
    >
      <MoveBadge
        progress={{
          milestone: { id: family.id, title: family.title, description: "", target: family.distanceM, metric: "distance", tier: "bronze" },
          progress: unlocked ? family.distanceM : 0,
          target: family.distanceM,
          ratio: unlocked ? 1 : 0,
          unlocked,
          unlockedAt: null
        }}
        // Short of the full column, unlike a streak badge: Move art fills ~90%
        // of its canvas where the streak badges leave a wide margin, so at the
        // same column width it reads as the bigger of the two collections.
        size={Math.round(size * 0.78)}
      />
      <AppText variant="bodySmall" color={unlocked ? palette.ink : palette.subtle} numberOfLines={1} style={styles.cellTitle}>
        {family.title}
      </AppText>
      <AppText variant="caption" color={unlocked ? palette.greenDark : palette.muted} numberOfLines={1} style={styles.cellDetail}>
        {detail}
      </AppText>
    </Pressable>
  );
}

/** One group trophy in the grid. Locked ones are tappable — see the note above. */
function TrophyCell({
  trophy,
  earned,
  size,
  onPress
}: {
  trophy: GroupTrophy;
  earned: boolean;
  size: number;
  onPress: () => void;
}) {
  const { palette } = useLumo();
  const [pressed, setPressed] = React.useState(false);
  const accent = groupChallengeTierMeta[trophy.tier].accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${trophy.name}. ${trophy.requirement}. ${earned ? "Earned" : "Locked"}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.cell, { width: size, opacity: pressed ? 0.7 : 1 }]}
    >
      {/* Nothing here tints or dims the art: the illustrations carry both
          states themselves, coloured when earned and greyed with a padlock when
          not — the same rule the streak badges follow. */}
      <TrophyImage id={trophy.id} earned={earned} size={Math.round(size * 0.86)} />
      <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.cellTitle}>
        {trophy.name}
      </AppText>
      <View style={[styles.tierChip, { backgroundColor: alpha(accent, "26") }]}>
        <AppText variant="caption" color={accent} style={styles.tierChipText}>
          {groupChallengeTierMeta[trophy.tier].label.toUpperCase()}
        </AppText>
      </View>
    </Pressable>
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
    // Three collections deep now, and the last row of trophies sat right on the
    // floating tab bar.
    paddingBottom: spacing.xxl * 2,
    gap: spacing.lg
  },
  hero: {
    alignItems: "center",
    gap: spacing.sm
  },
  secondHero: {
    paddingTop: spacing.xl
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
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center"
  },
  cellDetail: {
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
