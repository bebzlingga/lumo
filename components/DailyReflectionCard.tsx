import React from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import { sceneAsset } from "@/constants/mascotAssets";
import { brand, fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { Icon } from "./Icon";
import { Pressable } from "./Pressable";
import { AppText } from "./ui";

const BANNER_ASPECT = sceneAsset("journalAdd").aspect;
const BANNER_MAX_HEIGHT = 132;
/** How far past the banner's right edge the art is drawn — see the note below. */
const ART_SHIFT_X = 28;

/**
 * The home screen's nudge into the journal: today's question, on the same
 * plate the journal's own "write today" banner uses.
 *
 * Shared art on purpose. This card and that banner are two doors into the same
 * place, and they should look like it — tapping either one lands the reader in
 * today's entry.
 */
export function DailyReflectionCard({ prompt, onPress }: { prompt: string; onPress: () => void }) {
  const { palette, isDark } = useLumo();
  const { width } = useWindowDimensions();
  const bannerWidth = width - layout.screenPaddingX * 2;
  const bannerHeight = Math.min(BANNER_MAX_HEIGHT, bannerWidth / BANNER_ASPECT);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Daily reflection. ${prompt}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          width: bannerWidth,
          height: bannerHeight,
          shadowColor: isDark ? "transparent" : palette.shadow,
          opacity: pressed ? 0.9 : 1
        }
      ]}
    >
      {/* Clipping lives on an inner box: iOS drops the shadow of a view that
          sets overflow: hidden. */}
      <View style={[styles.clip, { backgroundColor: palette.card }]}>
        {/* Drawn wider than the card and pinned to the left edge: everything in
            the plate — Lumo included — lands further right, and the overhang is
            clipped off the right rather than opening a gap on the left. */}
        <Image
          source={sceneAsset("journalAdd").source}
          style={[styles.art, { width: bannerWidth + ART_SHIFT_X, height: bannerHeight }]}
          resizeMode="cover"
        />
      </View>

      {/* Fixed brand ink, not the palette's: the plate is cream in either
          theme, so ink that flipped white in dark mode would vanish on it. */}
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Icon name="messageEdit" size={15} color={brand.navy} weight="bulk" />
          <AppText color={brand.navy} numberOfLines={1} style={styles.title}>
            Daily Reflection
          </AppText>
        </View>
        <AppText color={alpha(brand.navy, "B8")} numberOfLines={3} style={styles.prompt}>
          {prompt}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.045,
    shadowRadius: 8,
    elevation: 2
  },
  clip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.card,
    overflow: "hidden"
  },
  art: {
    position: "absolute",
    top: 0,
    left: 0
  },
  copy: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: spacing.ml,
    // Stops short of Lumo, who sits on the right of the plate.
    right: "42%",
    justifyContent: "center",
    gap: spacing.xxs
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs
  },
  title: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendBold,
    fontSize: 14,
    lineHeight: 19
  },
  // Tight leading — the question wraps to two or three lines in the narrow
  // column beside the mascot, and at the default they read as separate lines
  // rather than one sentence.
  prompt: {
    fontFamily: fontFamilies.lexend,
    fontSize: 12,
    lineHeight: 16
  }
});
