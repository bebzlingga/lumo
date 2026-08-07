import React from "react";
import { Image, StyleSheet, View } from "react-native"
import { badgeArtFor } from "@/constants/badgeAssets";

/**
 * One streak badge, drawn at a size that matches every other badge.
 *
 * The illustrations sit at different sizes inside their own canvases, so
 * rendering the raw files at a common box makes some a third larger than
 * others. Each entry in `badgeAssets` carries the scale and offset measured
 * from its alpha bounds; this applies them and clips back to a square tile, so
 * `size` means the same thing for every badge.
 */
export function BadgeImage({ threshold, earned, size }: { threshold: number; earned: boolean; size: number }) {
  const art = badgeArtFor(threshold, earned);

  if (!art) {
    return <View style={{ width: size, height: size }} />;
  }

  return (
    // The shadow lives on this wrapper, NOT on the clipping frame: iOS drops the
    // shadow of any view that sets `overflow: hidden`. With no background of its
    // own, iOS casts the shadow from the artwork's alpha, so it follows the
    // badge's silhouette rather than boxing it.
    //
    // Scaled with `size`: a fixed drop that reads right under the 196pt badge in
    // the dialog is far too heavy under a 96pt one in a list.
    <View
      style={[
        styles.shadow,
        { width: size, height: size, shadowOffset: { width: 0, height: size * 0.05 }, shadowRadius: size * 0.1 }
      ]}
    >
      <View style={[styles.frame, { width: size, height: size }]}>
        <Image
          source={art.source}
          // `cover` fits the source height — both variants are at least as wide
          // as they are tall, so the empty side margins are what gets cropped.
          resizeMode="cover"
          style={{
            width: size * art.scale,
            height: size * art.scale,
            transform: [{ translateY: art.offsetY * size * art.scale }]
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    // Android draws elevation from the view's box, and this one is transparent,
    // so the shadow is an iOS treatment; the badge reads fine without it.
    elevation: 0
  },
  frame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  }
});
