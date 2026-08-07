import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AnimatedSplash } from "@/components/AnimatedSplash";
import { BadgeUnlockCelebration } from "@/components/BadgeUnlockCelebration";
import { LumoProvider, useLumo } from "@/context/LumoContext";
import "../global.css";

// Hold the native (OS) splash until the branded mascot splash takes over, so
// there's no gap between them. AnimatedSplash calls hideAsync() on mount.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootStack() {
  const { palette, isDark } = useLumo();

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
        {/* Themed screens keep their own dark background during the transition so
            there's no white flash before their content mounts. `group/challenges`
            is no longer one of them — it runs on the app canvas now. */}
        <Stack.Screen name="group/levels" options={{ contentStyle: { backgroundColor: "#120E24" } }} />
      </Stack>
      {/* Mounted at the root, above the Stack, so an unlock lands wherever the
          user happens to be — a check-in from Home or from the habit detail
          both cross the threshold, and neither screen should have to know. */}
      <BadgeUnlockCelebration />
    </>
  );
}

export default function Layout() {
  const [fontsLoaded] = useFonts({
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
  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LumoProvider>
        <RootStack />
      </LumoProvider>
      {splashDone ? null : <AnimatedSplash onFinish={() => setSplashDone(true)} />}
    </GestureHandlerRootView>
  );
}
