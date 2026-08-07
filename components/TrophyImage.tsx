import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { trophyArtFor } from "@/constants/trophyAssets";

/**
 * One group trophy, coloured when earned and greyed-and-padlocked when not —
 * the art carries both states, so nothing here tints or dims it. Sibling of
 * `BadgeImage`, minus the per-file normalising table: these illustrations are
 * already exported at a common extent inside square canvases (see
 * `constants/trophyAssets`), so `contain` is the whole job.
 */
export function TrophyImage({ id, earned, size }: { id: string; earned: boolean; size: number }) {
  const source = trophyArtFor(id, earned);

  if (!source) {
    return <View style={{ width: size, height: size }} />;
  }

  return (
    // The shadow sits on a view with no background, so iOS casts it from the
    // artwork's own alpha — it follows the trophy's silhouette rather than
    // boxing it. Scaled with `size`, because a drop that reads right under a
    // 96pt trophy is far too heavy under a 56pt one.
    //
    // Earned only: a locked trophy is deliberately flat and grey, and lifting
    // it off the page would undo that.
    <View
      style={[
        earned && styles.shadow,
        earned && { shadowOffset: { width: 0, height: size * 0.045 }, shadowRadius: size * 0.09 },
        { width: size, height: size }
      ]}
    >
      <Image source={source} resizeMode="contain" style={{ width: size, height: size }} />
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    // Android draws elevation from the view's box, and this one is transparent,
    // so the shadow is an iOS treatment; the trophy reads fine without it.
    elevation: 0
  }
});
