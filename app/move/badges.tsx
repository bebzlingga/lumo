import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useMoveAccent } from "@/components/move/ChallengeUI";
import { MoveBadge } from "@/components/move/MoveBadge";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { describeFamilyProgress, hasMilestone } from "@/lib/move/achievements";
import { MOVE_FAMILIES } from "@/lib/move/challengeDefs";
import { formatDistance } from "@/lib/move/movement";

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
  const accent = useMoveAccent();
  const move = useMove();

  const earned = MOVE_FAMILIES.filter((entry) => hasMilestone(move.achievements, entry.id)).length;

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader title="Move Badges" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      <View style={styles.head}>
        <AppText color={accent.glyph} style={styles.total} numberOfLines={1}>
          {formatDistance(move.totalDistanceM)}
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.headBlurb}>
          moved with Lumo · {earned} of {MOVE_FAMILIES.length} badges
        </AppText>
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
                size={76}
              />
              <AppText variant="caption" color={unlocked ? palette.ink : palette.muted} numberOfLines={1} style={styles.cellName}>
                {family.title}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.list}>
        {MOVE_FAMILIES.map((family) => {
          const routes = describeFamilyProgress(move.achievements, family);

          return (
            <View key={family.id} style={styles.listRow}>
              <AppText variant="bodySmall" color={routes ? palette.ink : palette.body} numberOfLines={1}>
                {family.title}
              </AppText>
              <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.listDetail}>
                {routes ?? family.subtitle}
              </AppText>
            </View>
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
  head: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingVertical: spacing.sm
  },
  total: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 38,
    lineHeight: 46
  },
  headBlurb: {
    fontFamily: fontFamilies.lexend
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  cell: {
    alignItems: "center",
    gap: spacing.xxs,
    width: "31%",
    paddingVertical: spacing.sm
  },
  cellName: {
    fontFamily: fontFamilies.lexendSemiBold,
    textAlign: "center"
  },
  list: {
    gap: spacing.sm
  },
  listRow: {
    gap: 2
  },
  listDetail: {
    fontFamily: fontFamilies.lexend
  }
});
