import React from "react";
import { StyleSheet, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { radius, spacing, THEME_IDS, THEMES, type ThemeId } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";

/**
 * One theme: its three brand colours stacked into a tile, named underneath.
 *
 * Selection is a ring around the tile rather than a tick inside it — the same
 * call the habit-colour picker makes, and for the same reason: a glyph laid over
 * the swatch hides the one thing the control exists to show.
 *
 * The swatch colours come from the theme's LIGHT palette in both modes. A chip
 * that restyles itself with the mode stops being recognisable as the thing you
 * picked, and the point is naming a hue family, not previewing a surface.
 */
function ThemeSwatch({ themeId, selected, onPress }: { themeId: ThemeId; selected: boolean; onPress: () => void }) {
  const { palette } = useLumo();
  const theme = THEMES[themeId];

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${theme.label} theme`}
      onPress={onPress}
      style={({ pressed }) => [styles.swatch, { opacity: pressed ? 0.76 : 1 }]}
    >
      <View
        style={[
          styles.tile,
          {
            borderColor: selected ? palette.greenDark : palette.hairline,
            // 2pt when selected so the ring reads at a glance; the hairline
            // resting state keeps the tiles the same size either way, so nothing
            // shifts when the selection moves.
            borderWidth: selected ? 2 : StyleSheet.hairlineWidth
          }
        ]}
      >
        {theme.swatch.map((color, index) => (
          <View key={color} style={[styles.band, { backgroundColor: color }, index === 0 && styles.bandFirst]} />
        ))}
      </View>
      <AppText variant="caption" color={selected ? palette.ink : palette.subtle} numberOfLines={1}>
        {theme.label}
      </AppText>
    </Pressable>
  );
}

/**
 * The full row of themes. Shared by Settings and Focus setup so the two can
 * never drift — and so picking a theme means the same thing in both places.
 */
export function ThemePicker({ value, onChange }: { value: ThemeId; onChange: (id: ThemeId) => void }) {
  return (
    // radiogroup, so a screen reader announces this as one control with four
    // choices rather than four unrelated buttons.
    <View accessibilityRole="radiogroup" style={styles.row}>
      {THEME_IDS.map((id) => (
        <ThemeSwatch key={id} themeId={id} selected={id === value} onPress={() => onChange(id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm
  },
  swatch: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs
  },
  tile: {
    width: "100%",
    height: 48,
    borderRadius: radius.lg,
    // The bands are square-cornered rectangles clipped by the tile's radius,
    // which is what gives the stack one continuous rounded edge.
    overflow: "hidden",
    flexDirection: "column"
  },
  band: {
    flex: 1
  },
  // The lightest band takes the most room, so a tile reads as "a light surface
  // with two accents" — which is what the theme actually looks like in use.
  bandFirst: {
    flex: 2
  }
});
