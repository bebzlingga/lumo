import React from "react";
import { Animated, StyleSheet, useWindowDimensions, View } from "react-native";
import { useLumo } from "@/context/LumoContext";

const PLATE = require("../assets/bg/GroupBG.webp");
/** The plate's own proportions (793 × 1983). */
const PLATE_ASPECT = 793 / 1983;
/**
 * Where the picnic finishes, down the plate.
 *
 * The three Lumos end around 0.30 and the blanket's front corner at 0.33; this
 * takes the blanket, so a page dropping its content to this line clears the
 * scene rather than stopping on the mat.
 */
const SUBJECT_END = 0.33;
/**
 * Drawn this much larger than the screen it has to fill — the one dial for how
 * big the picnic sits on these pages.
 *
 * At 1 the plate exactly fills the screen and nothing is cropped. Above it the
 * scene is pushed in closer and the overhang is trimmed, evenly off both sides
 * since the plate is centred, so winding this up eats into the art at the edges
 * (the hills and the path that frame the picnic) as well as enlarging the
 * mascots.
 */
const PLATE_ZOOM = 1;
/**
 * How far the plate is pulled up past the top of the screen, as a fraction of
 * its own height.
 *
 * The plate opens on a band of empty sky — sun, clouds, the skyline — and left
 * at the top of the screen that band lands under the page bar and strands the
 * picnic 60pt lower than the page it replaced. Cropping it brings the three of
 * them up under the header instead, and the content follows: the subject bottom
 * below is measured from the same number, so a page's first block rides up with
 * the art rather than leaving a gap where the scene used to end.
 *
 * Safe to crop because `usePlateHeight` sizes the plate for the lift — it is
 * drawn tall enough that the bottom edge still clears the foot of the screen,
 * cropping sideways instead (centred, so evenly).
 *
 * This is the default; a page can pass its own `lift` when its bar sits at a
 * different height. Don't wind it much past 0.07 — around there the tip of the
 * centre Lumo's flame reaches the page bar, and past it the three of them start
 * disappearing behind the chrome.
 */
export const GROUP_PLATE_LIFT = 0.06;

/**
 * How far the page has to scroll for the plate to reach its faded weight, and
 * what that weight is.
 *
 * The distance is roughly the height of the identity block the plate sits
 * behind: by the time the mascot has scrolled away, the art has finished
 * getting out of the cards' way. It does not fade to nothing — a backdrop that
 * vanishes reads as a loading glitch, and a trace of it keeps the page from
 * turning into flat canvas halfway down.
 */
const FADE_DISTANCE = 260;
const FADED_OPACITY = 0.25;

/**
 * The plate is sized to fill the screen with the lift already taken off, so
 * pulling it up never opens a strip of bare canvas at the foot; short screens
 * get a taller crop.
 */
function usePlateHeight(lift: number) {
  const { width, height } = useWindowDimensions();

  return Math.max(width / PLATE_ASPECT, height / (1 - lift)) * PLATE_ZOOM;
}

/**
 * The window-space y at which the scene stops — what a page drops its first
 * block below, so its content sits under the picnic rather than across it.
 *
 * In WINDOW space, not plate space: the lift is already subtracted, so a caller
 * can compare it straight against its own header's bottom edge. Pass the SAME
 * lift the backdrop is drawn with, or the content and the art part company.
 */
export function useGroupBackdropSubjectBottom(lift: number = GROUP_PLATE_LIFT) {
  return usePlateHeight(lift) * (SUBJECT_END - lift);
}

/**
 * The backdrop the social pages share: three Lumos at a picnic on the path out
 * of town. Used by the Friends tab and by a group's own page — one scene for
 * "the people you do this with", rather than a plate each.
 *
 * WHY THIS ISN'T A `backgroundVariant`
 * The eight registry plates are interchangeable landscapes — same 853 × 1844
 * proportions, subject at the BOTTOM, which is why `LumoBackground` anchors
 * them to the bottom edge and washes that edge back into the canvas. This one
 * is neither: different aspect, and its subject is the group at the TOP. Run
 * through the variant system it would be stretched and then faded out at the
 * wrong end.
 *
 * It is also drawn at full strength rather than at an `intensity`. The plates
 * are wallpaper at 14–26% behind content; these are characters, and a character
 * at 20% reads as a printing fault.
 *
 * Nothing is drawn OVER it — no gradient, no wash. Instead the plate fades
 * itself out as the page scrolls: pass `scrollY` and the art recedes as the
 * cards climb over it. A fixed gradient could only guess where the content
 * would be; this tracks it.
 */
export function GroupBackdrop({
  scrollY,
  lift = GROUP_PLATE_LIFT
}: {
  scrollY?: Animated.Value;
  /** Overrides `GROUP_PLATE_LIFT` for this page — see that constant. */
  lift?: number;
}) {
  const { isDark } = useLumo();
  const { width } = useWindowDimensions();
  // Centred: the plate is drawn wider than the screen and the overhang is
  // trimmed evenly off both sides, so the scene sits in the middle of the page
  // rather than pinned to one edge.
  const plateHeight = usePlateHeight(lift);
  const plateWidth = plateHeight * PLATE_ASPECT;
  // The art is warm cream. On the deep-navy canvas it has to come right back or
  // it lights the whole screen up — the same call LumoBackground makes.
  const restOpacity = isDark ? 0.3 : 1;
  // Scaled from the resting weight rather than fading to a fixed number, so
  // dark mode — which already sits at 0.3 — recedes by the same proportion
  // instead of getting brighter on the way down.
  const opacity = scrollY
    ? scrollY.interpolate({
        inputRange: [0, FADE_DISTANCE],
        outputRange: [restOpacity, restOpacity * FADED_OPACITY],
        extrapolate: "clamp"
      })
    : restOpacity;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.Image
        source={PLATE}
        style={{
          position: "absolute",
          top: -plateHeight * lift,
          left: (width - plateWidth) / 2,
          width: plateWidth,
          height: plateHeight,
          opacity
        }}
        resizeMode="cover"
      />
    </View>
  );
}
