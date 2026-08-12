import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon } from "@/components/Icon";
import { MoveBadge } from "@/components/move/MoveBadge";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { hasMilestone } from "@/lib/move/achievements";
import { MOVE_FAMILIES } from "@/lib/move/challengeDefs";

/**
 * The badge collection.
 *
 * One badge per milestone, whatever route earned it — so the grid has seven
 * faces and never twenty-one. The record underneath is where the variant shows
 * up: "Completed together in 6 days".
 */
export default function MoveBadgesScreen() {
  const router = useRouter();
  const { palette } = useLumo();
  const move = useMove();

  const earned = MOVE_FAMILIES.filter((entry) => hasMilestone(move.achievements, entry.id)).length;

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader title="Move Badges" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      {/* What the shelf is, said once at the top.
          The figure that used to sit here — total distance moved — belongs to
          the Stats tab; on a page of badges it answered a question nobody had
          come to ask. This answers the one they did: what are these, and how do
          I get one. */}
      <View style={styles.intro}>
        <AppText variant="bodySmall" color={palette.body} style={styles.introBody}>
          One badge for each distance, from your first kilometre to three hundred. Each is earned by finishing a challenge at that
          distance — alone, against the clock, or with friends. Any one of the three earns it.
        </AppText>
        {/* The Stats tab's own pill, verbatim — one collection's count should
            not be a chip on one screen and a sentence on another. */}
        <View style={[styles.introBadge, { backgroundColor: palette.greenSoft }]}>
          <Icon name="trophy" size={14} color={palette.greenDark} weight="bulk" />
          <AppText variant="caption" color={palette.greenDark} style={styles.introCount}>
            {earned} of {MOVE_FAMILIES.length} earned
          </AppText>
        </View>
      </View>

      <View style={styles.grid}>
        {MOVE_FAMILIES.map((family) => {
          const unlocked = hasMilestone(move.achievements, family.id);

          return (
            <Pressable
              key={family.id}
              accessibilityRole="button"
              accessibilityLabel={`${family.title}, ${unlocked ? "earned" : "not yet earned"}`}
              onPress={() => router.push({ pathname: "/move/[milestone]", params: { milestone: family.id } })}
              style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.7 : 1 }]}
            >
              <MoveBadge
                progress={{
                  milestone: {
                    id: family.id,
                    title: family.title,
                    description: "",
                    target: family.distanceM,
                    metric: "distance",
                    tier: "bronze"
                  },
                  progress: unlocked ? family.distanceM : 0,
                  target: family.distanceM,
                  ratio: unlocked ? 1 : 0,
                  unlocked,
                  unlockedAt: null
                }}
                size={104}
              />
              <AppText variant="caption" color={unlocked ? palette.ink : palette.muted} numberOfLines={1} style={styles.cellName}>
                {family.title}
              </AppText>
            </Pressable>
          );
        })}
      </View>

    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl
  },
  intro: {
    alignItems: "center",
    gap: spacing.md,
    // Air on both sides, so the explanation reads as its own passage rather
    // than as a caption stuck between the page bar and the shelf.
    paddingTop: spacing.md,
    paddingBottom: spacing.lg
  },
  introBody: {
    // Regular against the app's semibold caption: this is prose, not a label.
    fontFamily: fontFamilies.lexend,
    lineHeight: 21,
    textAlign: "center"
  },
  introBadge: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill
  },
  introCount: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 0.4
  },
  // Centred, not space-between. Seven badges two to a row leaves a lone last
  // one, and space-between stranded it against the left edge as if a partner
  // had failed to load.
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center"
  },
  // Two to a row: at 104pt three no longer fit, and a badge is the thing this
  // page is for — bigger and fewer beats smaller and tidier.
  cell: {
    alignItems: "center",
    gap: spacing.xxs,
    width: "48%",
    paddingVertical: spacing.sm
  },
  cellName: {
    fontFamily: fontFamilies.lexendSemiBold,
    textAlign: "center"
  }
});
