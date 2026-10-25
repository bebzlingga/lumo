import React from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { backgroundAsset, darkBackgroundAsset } from "@/constants/backgroundAssets";
import { spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";

/**
 * The Move screens' backdrop.
 *
 * Its own component rather than `LumoBackground`, because the walk plates are a
 * different KIND of art from the eight landscape washes that component was
 * built for. Those are a flat gradient of hills that any screen can sit on at
 * 24% opacity; these are SCENES — Lumo is drawn into them, on a path, with open
 * cream left below for the content. They are the home plates' family, not the
 * wash family.
 *
 * Three things follow, and they are the whole reason this file exists.
 *
 * **No bottom fade.** `LumoBackground` washes the lower half of its plate back
 * into the canvas, because on a wash plate that edge is the densest part of the
 * art. On these it is already flat cream, so the gradient was fading nothing
 * into itself and only greying the path Lumo walks on.
 *
 * **Full strength.** Holding a scene back to a quarter opacity leaves a ghost
 * of a mascot rather than a backdrop. `HomeBackground` draws its scenes at full
 * weight for the same reason. Dark mode still dims — that is legibility, not
 * the fade being removed here.
 *
 * **The content starts below the scene.** Lumo is baked into the art, so a
 * screen that simply began at the top would write its heading across him. See
 * `useWalkSceneInset`.
 */

export type WalkPlate = "walking" | "walkDone";

/**
 * How each plate is fitted, one row per plate — the same shape and reasoning as
 * `HOME_PLATE_FIT`, because it is the same problem: Lumo stands somewhere
 * different in each scene, and one set of numbers cannot frame them all.
 *
 * `aspect` — the plate's own width / height. NOT shared, and NOT
 * `BACKGROUND_ASPECT`: these two are cut to different frames from each other
 * and from the eight washes, and assuming any one of them stretches the rest.
 *
 * `scale` — plate width as a multiple of the screen's, drawn CENTRED so the
 * overflow splits evenly either side. Raising it enlarges everything in the
 * scene in proportion, because every element sits at a fixed fraction of the
 * plate's width, and leaves whatever is centred in the art centred on screen.
 *
 * Centred rather than pinned left, which is what an earlier version did: the
 * left pin pushed a centred mascot rightward as the scale went up, so growing
 * him and keeping him where he was became one adjustment fighting another.
 * There is no unpainted strip either way as long as `scale >= 1`.
 *
 * `sceneBottom` — where the content may start, as a fraction of the plate's
 * height. Set a little SHORT of where Lumo actually ends, so the first element
 * crosses the foot of the scene rather than clearing it — which reads as the
 * content sitting in front of the art rather than beneath a picture.
 *
 * Both plates put their scene in the top band with cream below, so both are
 * pinned to the top. A plate framed the other way round — sky above, Lumo at
 * the foot — would need pinning to the bottom instead; there is none in use, so
 * there is no switch for it.
 */
type PlateFit = {
  aspect: number;
  scale: number;
  sceneBottom: number;
  /**
   * How far DOWN the screen the plate starts, as a share of its own height.
   *
   * Opens a strip above the art — which is only safe because `PLATE_TINT` is
   * painted across the whole background underneath, so the strip is the plate's
   * own colour rather than bare canvas. Sample the tint from the art's TOP band
   * when using this, or the seam shows.
   */
  shiftDown?: number;
};

const PLATE_FIT: Record<WalkPlate, PlateFit> = {
  /**
   * Lumo walking toward you up a park path, 822 × 1913.
   *
   * `scale` is 1.25 to draw Lumo a quarter larger — he is small in this frame
   * at natural size, and on a phone the scene reads as a distant smudge.
   *
   * `sceneBottom` is 0.30, which is BELOW Lumo's feet (about 0.28 of the
   * plate) rather than the little short of them the other plate uses. That is a
   * deliberate departure from the crossing-the-foot-of-the-scene rule: at 1.25
   * he is large enough that a card overlapping him reads as covering him up
   * rather than as sitting in front of him.
   *
   * It costs vertical space, and there is no way around that — a bigger mascot
   * with nothing written across him needs the room. Lower this toward 0.24 to
   * buy the space back at the price of the overlap returning.
   */
  walking: { aspect: 822 / 1913, scale: 1.34, sceneBottom: 0.3 },
  /**
   * Waving, at the end of an outing, 941 × 1672 (`LumoWalked`). A WIDER frame
   * than the walking plate, so at the same scale Lumo lands smaller — 1.22 is
   * what brings him back to the size the old 853 × 1844 art read at.
   *
   * `sceneBottom` is lower than the walking plate's because this scene ends
   * higher in its own frame, and the summary opens on figures rather than on a
   * mascot: the sooner the numbers start, the better this screen reads.
   */
  walkDone: { aspect: 941 / 1672, scale: 1.05, sceneBottom: 0.24, shiftDown: 0.16 }
};

/**
 * What sits above the content before it starts: the screen's own top padding,
 * the page bar, and the gap under it. Subtracted from where the scene ends to
 * work out how much further the content still has to be pushed down.
 */
const HEADER_BAND = spacing.lg + 38 + spacing.md;

/**
 * Each plate's own average tone, sampled from the artwork.
 *
 * Painted UNDER the image at the same opacity, so the moment before the plate
 * has decoded shows the plate's colour rather than the app canvas. Without it
 * that moment reads as the background loading late — cream, then a jump to
 * warm yellow. With it there is nothing to see.
 *
 * Re-sample these if the art is replaced; a stale tint is worse than none,
 * because it swaps one visible jump for a different one.
 */
const PLATE_TINT: Record<WalkPlate, string> = {
  walking: "#FEE29A",
  // Sampled from the TOP band of the art rather than its average, because this
  // plate is shifted down and the tint has to meet its top edge invisibly.
  walkDone: "#FDEEC4"
};

/** The same, sampled from the top band of each dark cut. */
const PLATE_TINT_DARK: Record<WalkPlate, string> = {
  walking: "#191E22",
  walkDone: "#0C1535"
};

/**
 * How far a screen's first element must be pushed down to clear the scene.
 *
 * Includes `shiftDown`, since a plate pushed down the screen takes everything
 * drawn on it down too.
 *
 * Returned in points rather than applied here, because this component draws
 * behind the content and cannot reach it. Callers put it on the first thing
 * below the page bar. Floored at zero, so a short plate on a tall device never
 * pulls content upward.
 */
export function useWalkSceneInset(plate: WalkPlate): number {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const fit = PLATE_FIT[plate];
  const plateHeight = (width * fit.scale) / fit.aspect;

  return Math.max(0, Math.round(plateHeight * (fit.sceneBottom + (fit.shiftDown ?? 0))) - (insets.top + HEADER_BAND));
}

/**
 * How far the page scrolls before the plate reaches its faded weight, and what
 * that weight is.
 *
 * It does NOT fade to nothing: a backdrop that vanishes reads as a loading
 * glitch and leaves the rest of the page as flat canvas. Same treatment and the
 * same numbers as `HomeBackground`, so a scroll behaves the same wherever art
 * sits behind content.
 */
const FADE_DISTANCE = 260;
const FADED_OPACITY = 0.35;

export function WalkBackground({ plate, scrollY }: { plate: WalkPlate; scrollY?: Animated.Value }) {
  const { isDark, themeId } = useLumo();
  const { width } = useWindowDimensions();

  const fit = PLATE_FIT[plate];
  const plateWidth = width * fit.scale;
  const plateHeight = plateWidth / fit.aspect;
  // Half the overflow, taken off the left, so the plate sits centred.
  const left = -(plateWidth - width) / 2;

  // The plates are pastel-light and the dark canvas is deep navy, so at full
  // weight they would be the brightest thing on a dark screen and every card
  // would sit in a pool of daylight. This is legibility, not the bottom fade
  // this component exists to drop.
  const darkPlate = isDark ? darkBackgroundAsset(plate, themeId) : undefined;
  const restOpacity = isDark && !darkPlate ? 0.32 : 1;

  /**
   * Fades as the page scrolls DOWN over it, and comes back on the way up —
   * interpolating the offset gives both directions from one expression, since
   * the offset falls again as the reader returns to the top.
   *
   * Scaled FROM the resting weight rather than toward a fixed number, so dark
   * mode recedes by the same proportion instead of brightening on the way down.
   */
  const opacity = scrollY
    ? scrollY.interpolate({
        inputRange: [0, FADE_DISTANCE],
        outputRange: [restOpacity, restOpacity * FADED_OPACITY],
        extrapolate: "clamp"
      })
    : restOpacity;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The plate's own colour, under it and at its opacity — see PLATE_TINT.
          Both fade together on scroll because they share `opacity`. */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: darkPlate ? PLATE_TINT_DARK[plate] : PLATE_TINT[plate], opacity }]} />
      <Animated.Image
        source={darkPlate ?? backgroundAsset(plate, themeId)}
        style={{
          position: "absolute",
          left,
          top: plateHeight * (fit.shiftDown ?? 0),
          width: plateWidth,
          height: plateHeight,
          opacity
        }}
        resizeMode="cover"
      />
    </View>
  );
}
