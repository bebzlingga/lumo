import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { HabitCategory } from "@/types/habit";
import { HabitIcon } from "./HabitIcon";
import { IconName } from "./Icon";

const ICON_GLYPH_SIZE = 24;
const ICON_SIZE = 22;

export const categoryIconOptions: Record<HabitCategory, IconName[]> = {
  General: ["sparkle", "star", "taskSquare", "note", "calendar", "checkCircle", "grid", "elementPlus"],
  Health: ["health", "pill", "heart", "drop", "milk", "glass", "moon", "sun"],
  Fitness: ["weight", "activity", "fire", "zap", "trophy", "heart", "timer", "award"],
  Mind: ["brain", "moon", "smiley", "sun", "sparkle", "tree", "heart", "star"],
  Focus: ["target", "eye", "timer", "clock", "taskSquare", "chart", "zap", "note"],
  Learning: ["book", "note", "edit", "award", "headphone", "chart", "taskSquare", "star"],
  Social: ["friends", "emojiHappy", "heart", "smiley", "coffee", "headphone", "messages", "sparkle"],
  Home: ["home", "broom", "tree", "coffee", "milk", "drop", "note", "sun"],
  Money: ["money", "chart", "trophy", "award", "star", "calendar", "taskSquare", "archive"],
  Creative: ["brush", "edit", "sparkle", "note", "headphone", "star", "drop", "coffee"]
};

/**
 * Horizontal, scrollable row of selectable habit icons for the given category.
 */
export function IconPicker({
  category,
  value,
  onChange
}: {
  category: HabitCategory;
  value: IconName;
  onChange: (icon: IconName) => void;
}) {
  const { palette } = useLumo();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {categoryIconOptions[category].map((iconName) => {
        const isSelected = value === iconName;

        return (
          <Pressable
            key={iconName}
            accessibilityRole="button"
            accessibilityLabel={iconName}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(iconName)}
            style={[styles.chip, { backgroundColor: isSelected ? alpha(palette.greenDark, "1F") : "transparent" }]}
          >
            <View style={styles.glyph}>
              <HabitIcon value={iconName} color={isSelected ? palette.greenDark : palette.subtle} size={ICON_SIZE} />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    paddingRight: spacing.lg
  },
  chip: {
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: radius.xl
  },
  glyph: {
    alignItems: "center",
    justifyContent: "center",
    width: ICON_GLYPH_SIZE,
    height: ICON_GLYPH_SIZE
  }
});
