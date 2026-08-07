import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState } from "@/components/states";
import { TrophyDialog } from "@/components/TrophyDialog";
import { TrophyImage } from "@/components/TrophyImage";
import { AppText, Screen } from "@/components/ui";
import {
  countWonChallenges,
  groupChallengeTierMeta,
  groupTrophies,
  trophyEarned,
  type GroupTrophy,
  type GroupTrophyMetrics
} from "@/constants/groupChallenges";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { friendsService, type Group } from "@/lib/friends";

// Temporary preview flag — renders every trophy as earned so the full shelf can
// be reviewed. Set back to false to restore real earned/locked states.
const PREVIEW_ALL_UNLOCKED = false;

/** Three across, matching the streak-badge shelf. */
const GRID_COLUMNS = 3;
/** The air the grid leaves between columns. Everything else is the trophy. */
const GRID_GUTTER = spacing.sm;
/** The art draws a little inside its column rather than edge to edge, so the
 *  awards read as a row of objects with room around them. */
const TROPHY_ART_SCALE = 0.72;

export default function GroupTrophiesScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useLumo();
  const { width } = useWindowDimensions();
  const [group, setGroup] = React.useState<Group | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [selected, setSelected] = React.useState<GroupTrophy | null>(null);
  /**
   * Measured, not a percentage: a percentage column plus a gap can add past
   * 100% of the row and drop the last tile onto a line of its own. A column is
   * whatever is left of the screen once the gutters are taken out, and the
   * trophy art fills it. (The streak-badge grid is sized the same way.)
   */
  const cellWidth = Math.floor((width - layout.screenPaddingX * 2 - GRID_GUTTER * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

  const reload = React.useCallback(async () => {
    if (typeof id !== "string") {
      setLoaded(true);
      return;
    }

    const loadedGroup = await friendsService.getGroup(id);
    setGroup(loadedGroup);
    setLoaded(true);
  }, [id]);

  // Reload on focus so a trophy earned since the last visit shows as unlocked
  // when we come back (the sibling Challenges screen does the same).
  useFocusEffect(
    React.useCallback(() => {
      reload();
    }, [reload])
  );

  if (!loaded) {
    return (
      <View style={[styles.loading, { backgroundColor: palette.canvas }]}>
        <ActivityIndicator color={palette.greenDark} />
      </View>
    );
  }

  if (!group) {
    return (
      <Screen contentStyle={styles.missing}>
        <ScreenHeader title="Trophies" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />
        <EmptyState icon="award" title="Group not found" body="This group is no longer available." />
      </Screen>
    );
  }

  const metrics: GroupTrophyMetrics = {
    members: group.members.length,
    completions: group.progress,
    streak: group.streak,
    rollCallStreak: group.rollCallStreak,
    challengesWon: countWonChallenges(group.habits, group.completedDaysByHabit)
  };
  const isEarned = (trophy: GroupTrophy) => PREVIEW_ALL_UNLOCKED || trophyEarned(trophy, metrics);

  return (
    // The app's own trophies plate (08_trophies.png) on the app's own canvas.
    // This screen was the last one running a bespoke dark theme — a literal
    // #0A1330 sky with white-alpha text that ignored light/dark entirely, so it
    // stayed night-time even with the rest of the app in light mode.
    <Screen backgroundVariant="trophies" backgroundIntensity="medium" contentStyle={styles.content}>
      <ScreenHeader title="Trophies" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      <AppText variant="bodySmall" color={palette.subtle} style={styles.intro}>
        Sixteen awards across four tiers — each one earned by the whole group, not by any one member.
      </AppText>

      {/* One shelf in ladder order, not four labelled sections. Each award
          wears its own tier, so the headings were saying four times over what
          sixteen chips already say — and they broke a shelf into paragraphs. */}
      <View style={styles.grid}>
        {groupTrophies.map((trophy) => (
          <TrophyTile
            key={trophy.id}
            trophy={trophy}
            earned={isEarned(trophy)}
            size={cellWidth}
            onPress={() => setSelected(trophy)}
          />
        ))}
        {/* The grid is `space-between`, which spreads a short final row to the
            edges — sixteen awards over three columns would leave the last one
            stranded on the right. Empty cells pack it from the left instead. */}
        {Array.from({ length: (GRID_COLUMNS - (groupTrophies.length % GRID_COLUMNS)) % GRID_COLUMNS }, (_, index) => (
          <View key={`filler-${index}`} style={{ width: cellWidth }} />
        ))}
      </View>

      {/* Locked trophies open too, unlike the badge grid's: a tile at a third of
          the screen truncates the requirement, and what it takes is exactly
          what you tapped a locked one to find out. */}
      <TrophyDialog
        trophy={selected}
        earned={selected ? isEarned(selected) : false}
        current={selected ? metrics[selected.metric] : 0}
        onClose={() => setSelected(null)}
      />
    </Screen>
  );
}

/**
 * One award on the shelf: the art, its tier, its name, and what it takes.
 *
 * Nothing here tints or dims the art. The illustrations carry both states
 * themselves — coloured when earned, greyed with a padlock when not — the same
 * rule the streak badges follow, so what is still ahead reads as a real object
 * you haven't got yet rather than as a ghost of one.
 */
function TrophyTile({
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
  const accent = groupChallengeTierMeta[trophy.tier].accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${trophy.name}. ${trophy.requirement}. ${earned ? "Earned. Tap to share." : "Locked. Tap for what it takes."}`}
      onPress={onPress}
      style={({ pressed }) => [styles.trophy, { width: size, opacity: pressed ? 0.7 : 1 }]}
    >
      <TrophyImage id={trophy.id} earned={earned} size={Math.round(size * TROPHY_ART_SCALE)} />
      {/* Above the name, not under it: with no section headings left, the tier
          is what tells you where on the ladder this award sits, so it wants to
          be read before the title rather than as a footnote to it. */}
      <View style={[styles.tierChip, { backgroundColor: alpha(accent, "26") }]}>
        <AppText variant="caption" color={accent} style={styles.tierChipText}>
          {groupChallengeTierMeta[trophy.tier].label.toUpperCase()}
        </AppText>
      </View>
      {/* Ink in BOTH states. A locked trophy is a real award you haven't got
          yet, and greying its name on top of art that is already grey and
          padlocked said "absent" twice — the art carries the state on its own. */}
      <AppText variant="bodySmall" color={palette.ink} numberOfLines={2} style={styles.trophyName}>
        {trophy.name}
      </AppText>
      {/* The requirement here, not the description — a third of the screen is
          room for what it takes, and what it MEANS is what the card is for. */}
      <AppText variant="caption" color={earned ? palette.subtle : palette.muted} numberOfLines={3} style={styles.trophyCaption}>
        {trophy.requirement}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.md
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  missing: {
    gap: spacing.md
  },
  intro: {
    lineHeight: 20,
    textAlign: "center",
    alignSelf: "center",
    maxWidth: 320,
    // Pulls up under the header's own margin so the line reads as the page's
    // opening sentence rather than a floating paragraph.
    marginTop: -spacing.xs
  },
  // The intro line is the page's opening sentence; the shelf below it is a new
  // thing rather than the next paragraph of one, so it starts well clear.
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    // `space-between` distributes the leftover between the MEASURED columns, so
    // nothing can overflow a row the way a percentage column plus a gap can.
    justifyContent: "space-between",
    rowGap: spacing.ml,
    marginTop: spacing.ml
  },
  // The streak-badge grid's tier chip, a size down — it labels one award here
  // rather than heading a whole section of them.
  tierChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    marginTop: 1
  },
  tierChipText: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 9,
    lineHeight: 13,
    letterSpacing: 0.5
  },
  // Width is measured per screen and passed in, so it is not set here.
  trophy: {
    alignItems: "center",
    gap: 2
  },
  trophyName: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 13,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 1
  },
  // A step down from the name and tighter — at a quarter of the screen these
  // requirements need every line they can get before they start truncating.
  trophyCaption: {
    fontFamily: fontFamilies.lexend,
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center"
  }
});
