import React from "react";
import { Animated, StyleSheet, useWindowDimensions, View } from "react-native";
import { useLumo } from "@/context/LumoContext";

const PLATE = require("../assets/GroupBG.webp");
/** The plate's own proportions (941 × 1672). */
const PLATE_ASPECT = 941 / 1672;
/** Where the mascot and the table edge he leans on finish, down the plate. */
const SUBJECT_END = 0.35;
/**
 * Drawn this much larger than the screen it has to fill — the one dial for how
 * big Lumo sits on this page.
 *
 * At 1 the plate exactly fills the screen and nothing is cropped. Above it the
 * scene is pushed in closer and the overhang is trimmed, evenly off both sides
 * now that the plate is centred, so winding this up eats into the art at the
 * edges as well as enlarging the mascot.
 */
const PLATE_ZOOM = 1;

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

/** The plate is sized to fill the screen; short screens get a taller crop. */
function usePlateHeight() {
  const { width, height } = useWindowDimensions();

  return Math.max(width / PLATE_ASPECT, height) * PLATE_ZOOM;
}

/**
 * The window-space y at which the mascot stops — what the group page starts its
 * identity block below, so the avatar and name sit under him rather than on him.
 */
export function useGroupBackdropSubjectBottom() {
  return usePlateHeight() * SUBJECT_END;
}

/**
 * The group page's backdrop: Lumo leaning in over the top-right with a mug.
 *
 * WHY THIS ISN'T A `backgroundVariant`
 * The eight registry plates are interchangeable landscapes — same 853 × 1844
 * proportions, subject at the BOTTOM, which is why `LumoBackground` anchors
 * them to the bottom edge and washes that edge back into the canvas. This one
 * is neither: different aspect, and its subject is the mascot at the TOP. Run
 * through the variant system it would be stretched and then faded out at the
 * wrong end.
 *
 * It is also drawn at full strength rather than at an `intensity`. The plates
 * are wallpaper at 14–26% behind content; the mascot is a character, and a
 * character at 20% reads as a printing fault.
 *
 * Nothing is drawn OVER it — no gradient, no wash. Instead the plate fades
 * itself out as the page scrolls: pass `scrollY` and the art recedes as the
 * cards climb over it. A fixed gradient could only guess where the content
 * would be; this tracks it.
 */
export function GroupBackdrop({ scrollY }: { scrollY?: Animated.Value }) {
  const { isDark } = useLumo();
  const { width } = useWindowDimensions();
  // Centred: the plate is drawn wider than the screen and the overhang is
  // trimmed evenly off both sides, so the scene sits in the middle of the page
  // rather than pinned to one edge.
  const plateHeight = usePlateHeight();
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
        style={{ position: "absolute", top: 0, left: (width - plateWidth) / 2, width: plateWidth, height: plateHeight, opacity }}
        resizeMode="cover"
      />
    </View>
  );
}
