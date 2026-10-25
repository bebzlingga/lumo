import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { MilestoneBadge } from "@/components/MilestoneBadge";
import { moveBadgeArt } from "@/constants/moveBadgeAssets";
import type { MoveMilestoneFamily } from "@/lib/move/challengeDefs";
import type { MoveMilestoneProgress } from "@/lib/move/types";

/**
 * One Move badge, drawn from its illustration.
 *
 * Two states, two files — `assets/move/badges/{locked,unlocked}`. The locked
 * art is the same badge in greyscale with a padlock, so the shape someone is
 * working toward is legible long before they earn it, which is the whole point
 * of showing a locked badge at all.
 *
 * Falls back to the drawn hexagon (`MilestoneBadge`) when a rung has no art
 * yet, so the ladder can grow without shipping a broken tile.
 *
 * ## Why the box is square
 *
 * Every file is normalised to a 600 x 600 canvas with the SOLID badge shape
 * scaled to the same height (86% of the canvas), so a fixed square box renders
 * them all at one size. That normalisation had to happen to the assets rather
 * than here: the originals arrived in three different frames — 1536x1024,
 * 1024x1536 and 1254x1254 — several with the badge off-centre inside them, so
 * `contain` fitted some by width and others by height and the unlocked ones
 * came out about a third smaller than the locked. No amount of styling fixes
 * that; the frames had to agree first. See `assets/move/README.md`.
 */
export function MoveBadge({ progress, size = 62 }: { progress: MoveMilestoneProgress; size?: number }) {
  const art = moveBadgeArt(progress.milestone.id, progress.unlocked);

  if (!art) {
    return (
      <MilestoneBadge
        milestone={{
          id: progress.milestone.id,
          name: progress.milestone.title,
          short: progress.milestone.id.toUpperCase(),
          targetM: progress.target,
          tier: progress.milestone.tier,
          blurb: progress.milestone.description
        }}
        earned={progress.unlocked}
        size={size}
      />
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      // §48: the state is in the LABEL, not carried by the greyscale alone.
      accessibilityLabel={`${progress.milestone.title}, ${progress.unlocked ? "unlocked" : "locked"}`}
      /**
       * The shadow belongs on THIS view and only while it has no background of
       * its own: iOS then casts it from the image's alpha, so it follows the
       * badge's silhouette instead of boxing the square. Give this wrapper a
       * backgroundColor and the shadow squares off immediately. Same treatment
       * as `BadgeImage`. Android's elevation is bounds-based with no such
       * escape, so it stays off there.
       *
       * Scaled with `size` — a drop that reads under a 148pt hero badge is far
       * too heavy under a 48pt one in a list.
       */
      style={[
        styles.wrap,
        { width: size, height: size, shadowOffset: { width: 0, height: size * 0.04 }, shadowRadius: size * 0.09 },
        // Locked badges recede so the earned ones lead the shelf.
        !progress.unlocked && styles.locked
      ]}
    >
      <Image source={art} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    elevation: 0
  },
  locked: {
    opacity: 0.45
  },
  image: {
    width: "100%",
    height: "100%"
  }
});

/**
 * A challenge family's badge, earned or not.
 *
 * Every screen that shows the badge shelf drew it by building the same stand-in
 * progress object by hand; this is that object, once.
 */
export function FamilyBadge({ family, unlocked, size }: { family: MoveMilestoneFamily; unlocked: boolean; size?: number }) {
  return (
    <MoveBadge
      progress={{
        milestone: { id: family.id, title: family.title, description: "", target: family.distanceM, metric: "distance", tier: "bronze" },
        progress: unlocked ? family.distanceM : 0,
        target: family.distanceM,
        ratio: unlocked ? 1 : 0,
        unlocked,
        unlockedAt: null
      }}
      size={size}
    />
  );
}
