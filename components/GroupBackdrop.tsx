import React from "react";
import { Animated, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
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
 * What the plate is worth before any scrolling, per scheme and per `weight`.
 *
 * The art is warm cream. On the deep-navy canvas it has to come right back or it
 * lights the whole screen up — the same call `LumoBackground` makes — hence the
 * per-scheme pair rather than one number.
 *
 * `full` is the plate as drawn: the Friends tab opens on the picnic with a short
 * list under it, so the scene is the page.
 *
 * `soft` is for a page whose content OVERLAPS the art rather than sitting below
 * it — a group's own page drops its identity block only part of the way down the
 * scene, then stacks tabs, stat cards and rows straight over the blanket. At full
 * weight the near-white cards and the warm plate sit close enough in value that a
 * card's edge all but disappears, and the text competes with the painting behind
 * it. Halving the plate blends it toward `palette.canvas` (the Screen paints that
 * behind this layer), which is exactly the ground those cards are designed to
 * stand out from — the picnic is still legibly there, just no longer arguing with
 * the words on top of it.
 *
 * Dark mode is scaled by less than half because it starts at 0.3: taking the same
 * proportion off would put it near 0.15, where the plate stops reading as art and
 * starts reading as a smudge on the navy.
 */
const REST_OPACITY = {
  full: { light: 1, dark: 0.3 },
  soft: { light: 0.5, dark: 0.2 }
} as const;

export type GroupBackdropWeight = keyof typeof REST_OPACITY;

/**
 * How far the wash takes to come in, as a fraction of the screen, and how strong it
 * gets.
 *
 * `WASH_RAMP` is deliberately short: over half a screen it reads as a haze someone
 * forgot to finish, and over a tenth it reads as a horizon — which is what the foot
 * of a picnic scene already is.
 *
 * `WASH_ALPHA` is where the judgement is. 0.78 in light mode leaves the plate's warmth
 * visible while pulling it back to something a near-white card can sit on; past about
 * 0.9 the backdrop stops being art and becomes a plain page, which is a different
 * design. Dark mode needs less of it — the plate is already well back there (see
 * `REST_OPACITY`), so the navy is doing most of this work already.
 *
 * Not varied by `weight`: this is the wash the plate needs at `full`, and over a
 * `soft` plate it simply lands on less to wash. Raising it for `soft` too would
 * take the foot of those pages to flat canvas.
 */
const WASH_RAMP = 0.12;
const WASH_ALPHA = { light: 0.78, dark: 0.45 } as const;

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
  const { settings } = useLumo();
  const plateHeight = usePlateHeight(lift);
  // Minimal mode draws no backdrop, so there is no scene to clear.
  return settings.minimalMode ? 0 : plateHeight * (SUBJECT_END - lift);
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
 * ## TWO things hold it back, and they do different jobs
 *
 * The plate fades as the page SCROLLS — pass `scrollY` and the art recedes as the
 * cards climb over it, which no fixed gradient could do because only the scroll
 * position knows where the content has got to.
 *
 * But that left the page at its worst before anybody had scrolled at all: the plate
 * at full strength is a warm, fairly saturated cream, the cards are a near-white
 * one, and the two sat close enough that a card's edge all but disappeared. So there
 * is now a WASH as well — a canvas-coloured gradient from the foot of the scene
 * downward, over the part of the plate that is flat backdrop rather than picture.
 *
 * The two are not alternatives. The wash makes the page readable at rest; the fade
 * gets the art out of the way once there is content over it.
 */
export function GroupBackdrop({
  scrollY,
  lift = GROUP_PLATE_LIFT,
  weight = "full"
}: {
  scrollY?: Animated.Value;
  /** Overrides `GROUP_PLATE_LIFT` for this page — see that constant. */
  lift?: number;
  /** How strongly the plate is drawn before scrolling — see `REST_OPACITY`. */
  weight?: GroupBackdropWeight;
}) {
  const { isDark, palette, settings } = useLumo();
  const { width, height } = useWindowDimensions();
  // Centred: the plate is drawn wider than the screen and the overhang is
  // trimmed evenly off both sides, so the scene sits in the middle of the page
  // rather than pinned to one edge.
  const plateHeight = usePlateHeight(lift);
  const plateWidth = plateHeight * PLATE_ASPECT;
  const restOpacity = REST_OPACITY[weight][isDark ? "dark" : "light"];
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

  /**
   * Where the wash starts, as a fraction of the SCREEN.
   *
   * The foot of the picnic, so the scene itself is untouched — washing Lumo would
   * be solving a contrast problem by spoiling the thing the page is decorated with.
   * Clamped well short of the bottom so there is always room for the ramp: on a
   * short screen the scene can reach a long way down.
   */
  const sceneEnd = Math.min(0.6, (plateHeight * (SUBJECT_END - lift)) / Math.max(1, height));

  // Minimal mode (Settings): no illustrated backdrop. After every hook, so flipping it never changes the hook order.
  if (settings.minimalMode) return null;
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

      {/* Drawn OVER the plate and under the content: it lightens the backdrop the
          cards sit on without touching the scene above them. `palette.canvas` and
          not white — the point is to bring the plate back to the colour the rest of
          the app's pages are, which is what the near-white cards are designed to
          stand out from. */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="groupPlateWash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.canvas} stopOpacity="0" />
            <Stop offset={`${sceneEnd}`} stopColor={palette.canvas} stopOpacity="0" />
            {/* The ramp: short enough to be a horizon rather than a haze. */}
            <Stop offset={`${Math.min(0.98, sceneEnd + WASH_RAMP)}`} stopColor={palette.canvas} stopOpacity={`${WASH_ALPHA[isDark ? "dark" : "light"]}`} />
            <Stop offset="1" stopColor={palette.canvas} stopOpacity={`${WASH_ALPHA[isDark ? "dark" : "light"]}`} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#groupPlateWash)" />
      </Svg>
    </View>
  );
}
