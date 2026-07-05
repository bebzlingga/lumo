import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { HabitCategory, habitCategories } from "@/types/habit";
import { Icon, IconName } from "./Icon";
import { AppText } from "./ui";

const CHIP_GLYPH_SIZE = 32;
const CHIP_ICON_SIZE = 30;

export const categoryIcons: Record<HabitCategory, IconName> = {
  General: "sparkle",
  Health: "heart",
  Fitness: "weight",
  Mind: "smiley",
  Focus: "eye",
  Learning: "book",
  Social: "emojiHappy",
  Home: "home",
  Money: "money",
  Creative: "brush"
};

export const categoryNamePlaceholders: Record<HabitCategory, string> = {
  General: "Drink water",
  Health: "Take vitamins",
  Fitness: "Go for a run",
  Mind: "Meditate 10 minutes",
  Focus: "Deep work session",
  Learning: "Read 10 pages",
  Social: "Call a friend",
  Home: "Tidy up the space",
  Money: "Track today's spending",
  Creative: "Sketch for 15 minutes"
};

/**
 * Horizontal, scrollable row of selectable category chips (icon + label). The
 * row bleeds to its container's edges via a negative margin equal to
 * `edgePadding` (the parent's horizontal padding) so the chips can scroll edge
 * to edge.
 */
export function CategoryChips({
  value,
  onChange,
  edgePadding = spacing.lg
}: {
  value: HabitCategory;
  onChange: (category: HabitCategory) => void;
  edgePadding?: number;
}) {
  const { palette } = useLumo();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -edgePadding }}
      contentContainerStyle={[styles.row, { paddingHorizontal: edgePadding }]}
    >
      {habitCategories.map((category) => {
        const isSelected = value === category;

        return (
          <Pressable
            key={category}
            accessibilityRole="button"
            accessibilityLabel={category}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(category)}
            style={[styles.chip, { backgroundColor: isSelected ? alpha(palette.greenDark, "1F") : "transparent" }]}
          >
            <View style={styles.glyph}>
              <Icon name={categoryIcons[category]} size={CHIP_ICON_SIZE} color={isSelected ? palette.greenDark : palette.subtle} weight="bulk" />
            </View>
            <AppText variant="caption" color={isSelected ? palette.greenDark : palette.subtle} numberOfLines={1} style={styles.label}>
              {category}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "flex-start"
  },
  chip: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    width: 92,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl
  },
  glyph: {
    alignItems: "center",
    justifyContent: "center",
    width: CHIP_GLYPH_SIZE,
    height: CHIP_GLYPH_SIZE
  },
  label: {
    textAlign: "center"
  }
});
