import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from "react-native";
import { LumoWordmark } from "@/components/LumoWordmark";
import { fontFamilies } from "@/constants/theme";

/**
 * The plate's own cream. Must match app.json's splash `backgroundColor` so the
 * native → JS hand-off stays one continuous colour — it was #FFF8EB against the
 * config's #FCF4E4, which flashed a shade lighter for a frame at launch.
 */
const SPLASH_BG = "#FCF4E4";
const INK = "#453213";
const TOTAL_MS = 2600;
/** The plate's own proportions, 941 × 1672. */
const SPLASH_ASPECT = 941 / 1672;
/**
 * The brand line, which onboarding's hero already opens with — so the splash
 * and the first screen after it now say the same thing. Revealed a line at a
 * time, so it arrives rather than appearing.
 */
const TITLE_LINES = ["Small habits,", "brighter days."];

/**
 * Brand splash: the Splash.png scene, with the wordmark dropping in and the
 * brand line landing a line at a time over it. Dismisses itself after
 * TOTAL_MS — the whole thing runs in about 1.3s, so the rest is a brief hold.
 *
 * This renders OUTSIDE LumoProvider (see app/_layout.tsx), so nothing in here
 * may call useLumo() — that includes AppText. Use plain <Text> with the fixed
 * brand colours above instead. `fontFamilies` is a plain constant, not a hook,
 * so it is safe; fonts are already loaded by the time this mounts.
 */
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { width, height } = useWindowDimensions();
  /**
   * Sized to the screen's HEIGHT, so the scene runs top to bottom with no strip
   * of background anywhere.
   *
   * Fitting it to the width instead left the plate short of the top, and the
   * gap could not be filled: the plate's top edge is a gold-to-cream gradient
   * with grain in it, so a flat colour banded and even a 48-stop gradient still
   * drifted ~12/255 — the join stayed visible either way. Overflowing the sides
   * is the honest trade, and the plate is composed for it: the mascot, journal
   * and title all sit centred.
   */
  const artHeight = height;
  const artWidth = height * SPLASH_ASPECT;
  const finishedRef = React.useRef(false);
  const wordmark = React.useRef(new Animated.Value(0)).current;
  const lines = React.useRef(TITLE_LINES.map(() => new Animated.Value(0))).current;

  const finish = React.useCallback(() => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    onFinish();
  }, [onFinish]);

  React.useEffect(() => {
    // Drop the native splash to reveal this branded one.
    SplashScreen.hideAsync().catch(() => undefined);
    // Held back a beat: the artwork is already on screen from the native
    // splash, so the copy arriving is the only thing that should read as a
    // change.
    Animated.sequence([
      Animated.delay(220),
      // The name lands first — it is what the screen is introducing; the line
      // under it is the promise that follows.
      Animated.timing(wordmark, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.stagger(
        160,
        lines.map((line) =>
          Animated.timing(line, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true })
        )
      )
    ]).start();

    const timer = setTimeout(finish, TOTAL_MS);
    return () => clearTimeout(timer);
  }, [wordmark, lines, finish]);


  return (
    <View style={[StyleSheet.absoluteFill, styles.container]}>
      <StatusBar style="dark" />

      {/* Centred on the horizontal overflow, so what gets cropped is taken
          evenly off both sides rather than all off one. */}
      <Image
        source={require("../assets/Splash.webp")}
        style={[styles.art, { width: artWidth, height: artHeight, left: (width - artWidth) / 2 }]}
        resizeMode="cover"
      />

      {/* The name, held at the very top so the brand is the first thing read
          and the headline below it is not competing for the same spot. */}
      <Animated.View
        style={[
          styles.wordmarkWrap,
          {
            opacity: wordmark,
            transform: [{ translateY: wordmark.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }]
          }
        ]}
        pointerEvents="none"
      >
        <LumoWordmark size={26} color={INK} />
      </Animated.View>

      {/* Sits in the open cream above the mascot, which the artwork leaves
          clear for exactly this. */}
      <View style={styles.textWrap}>
        {TITLE_LINES.map((line, index) => (
          <Animated.Text
            key={line}
            maxFontSizeMultiplier={1}
            // At 42pt "brighter days." is close to the gutter on a narrow
            // phone. These two make it shrink to fit rather than wrap, which
            // would break the two-line composition into three.
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              styles.title,
              {
                opacity: lines[index],
                transform: [
                  { translateY: lines[index].interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
                  { scale: lines[index].interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }
                ]
              }
            ]}
          >
            {line}
          </Animated.Text>
        ))}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: SPLASH_BG,
    alignItems: "center",
    // Anchored to the top rather than centred: the lower half of the plate is
    // the mascot's desk, so the copy has to stay out of it.
    justifyContent: "flex-start",
    // The plate's mascot starts at 51.7% of its height (measured), and the art
    // is sized to the screen's height — so this is the headline sitting just
    // into the top of that space rather than floating in the empty cream.
    paddingTop: "50%",
    // Tighter than the app's usual gutter — at 42pt "brighter days." needs the
    // room, and the plate has nothing near the edges up here to crowd.
    paddingHorizontal: 20,
    zIndex: 999
  },
  // Size and horizontal offset are measured at the call site; only the vertical
  // anchoring lives here.
  art: {
    position: "absolute",
    bottom: 0
  },
  // Percentage rather than a fixed inset so it clears the notch on a tall phone
  // without sitting oddly low on a short one.
  wordmarkWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "20%",
    alignItems: "center"
  },
  textWrap: {
    alignItems: "center"
  },
  // Each line is its own <Text> so it can animate separately — which also means
  // the break is set by the copy rather than by wrapping, and can't reflow.
  title: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 42,
    // Tight for the size: two lines of a headline should read as one block,
    // and 42pt at a normal 1.3 ratio opens a gap between them.
    lineHeight: 50,
    textAlign: "center",
    color: INK
  },
});
