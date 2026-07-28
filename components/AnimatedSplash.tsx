import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import React from "react";
import { StyleSheet, View } from "react-native";

// Background behind the (letterboxed) video — also the native splash
// `backgroundColor` in app.json, so the hand-off native splash → video → app
// stays one continuous colour.
const SPLASH_BG = "#17140F";
// Safety net: if the end-of-playback event never fires (codec/error), don't
// trap the user on the splash forever.
const MAX_SPLASH_MS = 8000;

const SPLASH_SOURCE = require("../assets/logo/lumo-splash.mp4");

/**
 * Full-screen animated splash. The OS shows the static splash (the mark) while
 * the app boots; once mounted this plays the brand video over a matching
 * background, hides the native splash under it, and calls `onFinish` when the
 * video ends so the app can take over.
 */
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const finishedRef = React.useRef(false);
  const player = useVideoPlayer(SPLASH_SOURCE, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.play();
  });

  const finish = React.useCallback(() => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    onFinish();
  }, [onFinish]);

  React.useEffect(() => {
    const endSub = player.addListener("playToEnd", finish);
    // Drop the native splash once the first frame is ready; the shared
    // background means no flash even if the frame lands a beat later.
    const statusSub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") {
        SplashScreen.hideAsync().catch(() => undefined);
      }
    });
    // Fallbacks: reveal the video even if `readyToPlay` never arrives, and
    // finish even if `playToEnd` never fires.
    const revealTimer = setTimeout(() => SplashScreen.hideAsync().catch(() => undefined), 600);
    const maxTimer = setTimeout(finish, MAX_SPLASH_MS);

    return () => {
      endSub.remove();
      statusSub.remove();
      clearTimeout(revealTimer);
      clearTimeout(maxTimer);
    };
  }, [player, finish]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.container]}>
      {/* Light icons over the dark splash while it's showing. */}
      <StatusBar style="light" />
      {/* contain so the video keeps its native size (not expanded/cropped); the
          letterbox area shows SPLASH_BG. */}
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: SPLASH_BG,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999
  }
});
