import { useFonts } from "expo-font";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AnimatedSplash } from "@/components/AnimatedSplash";
import { BadgeUnlockCelebration } from "@/components/BadgeUnlockCelebration";
import { MoveCelebration } from "@/components/move/MoveCelebration";
import { LumoProvider, useLumo } from "@/context/LumoContext";
import { defineMoveLocationTask } from "@/lib/move/tracking/backgroundLocation";
import { MoveProvider } from "@/context/MoveContext";
import { lockPortrait } from "@/lib/orientation";
import { preloadBackgroundArt } from "@/lib/preloadArt";
import { startWalkSync } from "@/lib/walkSyncRunner";
import "../global.css";

/**
 * At module scope, deliberately.
 *
 * When the OS relaunches the app to hand over background location, the task has
 * to already be defined before anything renders — a definition inside a
 * component runs too late and the delivery is dropped.
 */
defineMoveLocationTask();

// Hold the native (OS) splash until the branded mascot splash takes over, so
// there's no gap between them. AnimatedSplash calls hideAsync() on mount.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * The app is portrait everywhere except Focus mode.
 *
 * `app.json` had to open the orientation up to `default` — and the iOS plist
 * with it — because a device that does not PERMIT landscape cannot be rotated
 * into it at runtime, however the app asks. Pinning it back here means that
 * permission buys exactly one screen the ability to rotate, and nothing else
 * starts tipping over sideways.
 *
 * Focus mode unlocks this for itself and restores it on the way out.
 *
 * Goes through `lib/orientation`, which no-ops when the native module is not in
 * the binary — importing `expo-screen-orientation` directly here would crash
 * every build made before it was added, and the root layout is the one place a
 * crash has nowhere to fall back to.
 */
lockPortrait();

/**
 * Warms the background plates behind the splash. Fire-and-forget — see
 * `preloadBackgroundArt`.
 */
preloadBackgroundArt();

/**
 * Pins the root stack's entry point to `app/index.tsx`.
 *
 * Without this the app booted into the Trophies screen. Declaring ANY explicit
 * `<Stack.Screen>` child makes the first declared one the navigator's initial
 * route, and the only child below is `group/levels` — which exists purely to
 * give that screen a dark transition background, not to be where the app
 * starts.
 *
 * So: adding a `<Stack.Screen>` here to set options silently moves the app's
 * front door unless this stays in place. If another screen ever needs custom
 * options, add it below rather than above, and leave this alone.
 */
export const unstable_settings = {
  initialRouteName: "index"
};

function RootStack() {
  const { palette, isDark } = useLumo();

  /**
   * The walk sync queue, started once for the life of the app.
   *
   * Here rather than in `LumoContext` because walks are deliberately not part
   * of the main state blob — a GPS route must not be re-serialized alongside
   * every habit and journal entry — and pulling them into the context to get a
   * lifecycle hook would undo that.
   */
  React.useEffect(() => startWalkSync(), []);

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          animation: "slide_from_right",
          headerShown: false,
          contentStyle: { backgroundColor: palette.canvas }
        }}
      >
        {/* Declared first so it, not the screen below, is what `unstable_settings`
            is pinning — and so the app's entry point is visible right here rather
            than only in the export above. */}
        <Stack.Screen name="index" />
        {/* Themed screens keep their own dark background during the transition so
            there's no white flash before their content mounts. `group/challenges`
            is no longer one of them — it runs on the app canvas now. */}
        <Stack.Screen name="group/levels" options={{ contentStyle: { backgroundColor: "#120E24" } }} />
      </Stack>
      {/* Mounted at the root, above the Stack, so an unlock lands wherever the
          user happens to be — a check-in from Home or from the habit detail
          both cross the threshold, and neither screen should have to know. */}
      <BadgeUnlockCelebration />
      <MoveCelebration />
    </>
  );
}

/**
 * Expo Router renders this in place of the whole app when a render throws, so
 * without it any such throw is a permanent blank screen with no way back.
 *
 * It sits OUTSIDE `LumoProvider` — the provider is part of what it replaces —
 * so it can't read the palette or `AppText`, and every colour and font here is
 * a literal on purpose. It also can't assume the fonts loaded, which is why the
 * type is left to the system.
 *
 * `retry` re-mounts the subtree. That is genuinely enough for a transient
 * failure, and for anything worse it at least gets the user off a dead screen.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errorRoot}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorBody}>
        Lumo hit an unexpected problem and couldn&rsquo;t finish drawing this screen. Your habits and journals are safe on
        this device.
      </Text>
      {/* The message, not the stack: it is the one thing that makes a bug
          report actionable, and it is short enough to read out loud. */}
      <Text style={styles.errorDetail} numberOfLines={4}>
        {error.message}
      </Text>
      <Pressable accessibilityLabel="Try again" accessibilityRole="button" onPress={retry} style={styles.errorButton}>
        <Text style={styles.errorButtonLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
    backgroundColor: "#F8F4EB"
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1B2436",
    textAlign: "center"
  },
  errorBody: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5A6478",
    textAlign: "center"
  },
  errorDetail: {
    fontSize: 12,
    lineHeight: 18,
    color: "#5A6478",
    textAlign: "center",
    opacity: 0.75
  },
  errorButton: {
    marginTop: 8,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: "#6E8F5A"
  },
  errorButtonLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#F8F4EB"
  }
});

export default function Layout() {
  const [fontsLoaded, fontError] = useFonts({
    "Lexend-Regular": require("../assets/fonts/Lexend-Regular.ttf"),
    "Lexend-Medium": require("../assets/fonts/Lexend-Medium.ttf"),
    "Lexend-SemiBold": require("../assets/fonts/Lexend-SemiBold.ttf"),
    "Lexend-Bold": require("../assets/fonts/Lexend-Bold.ttf"),
    "Lexend-Black": require("../assets/fonts/Lexend-Black.ttf"),
    // Serif display face used for headline copy (see fontFamilies.serif*).
    "KohSantepheap-Regular": require("../assets/fonts/KohSantepheap-Regular.ttf"),
    "KohSantepheap-Bold": require("../assets/fonts/KohSantepheap-Bold.ttf"),
    "KohSantepheap-Black": require("../assets/fonts/KohSantepheap-Black.ttf")
  });
  const [splashDone, setSplashDone] = React.useState(false);

  // Keep the OS splash up (return null, no loading view) until fonts are ready,
  // then hand straight off to the mascot splash — no flash in between.
  //
  // `fontError` is checked as well as `fontsLoaded`, and that is the whole
  // point: a font that fails to load never flips `fontsLoaded`, so waiting on
  // it alone left the app returning null forever behind a held native splash —
  // an unrecoverable launch hang out of one bad asset. Carrying on without the
  // custom faces gives system type and a working app, which is strictly better
  // than a screen that never arrives.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LumoProvider>
        {/* Inside `LumoProvider` because Move's cards read the theme, and
            deliberately a SEPARATE provider: Move keeps its own storage key and
            its own state, so a step count arriving never re-renders anything
            that reads habits. */}
        <MoveProvider>
          <RootStack />
        </MoveProvider>
      </LumoProvider>
      {splashDone ? null : <AnimatedSplash onFinish={() => setSplashDone(true)} />}
    </GestureHandlerRootView>
  );
}
