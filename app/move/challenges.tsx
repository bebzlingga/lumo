import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { MilestoneCard, useMoveAccent } from "@/components/move/ChallengeUI";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { isFamilyLocked } from "@/lib/move/achievements";
import { MOVE_FAMILIES } from "@/lib/move/challengeDefs";

/**
 * Every milestone, as a card each.
 *
 * No filter by route (solo / timed / with friends): every family has one of
 * each, so a filter never removes a single card — it only ever changed which
 * variant was preselected on the next screen, which is a choice better made
 * there, looking at the three side by side.
 */
export default function MoveChallengesScreen() {
  const router = useRouter();
  const { palette } = useLumo();
  const accent = useMoveAccent();
  const move = useMove();

  return (
    /* The one screen whose bar scrolls. The list IS the page — seven cards and
       nothing else — and a pinned bar over a page with no other chrome read as
       a strip of empty canvas above it. */
    <Screen contentStyle={styles.content} pinHeader={false}>
      <ScreenHeader title="Challenges" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      <View style={styles.list}>
        {MOVE_FAMILIES.map((family) => (
          <MilestoneCard
            key={family.id}
            family={family}
            achievements={move.achievements}
            active={move.progress}
            locked={isFamilyLocked(move.achievements, family)}
            onPress={() => router.push({ pathname: "/move/[milestone]", params: { milestone: family.id } })}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl
  },
  list: {
    gap: spacing.xs,
    // Clears the header by more than the page's own stack gap: the first card's
    // shadow was landing right under the bar.
    paddingTop: spacing.xs
  }
});
