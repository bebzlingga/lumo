import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AnimatedSplash } from "@/components/AnimatedSplash";
// Badge feature hidden for now — restore this import alongside the
// <BadgeUnlockCelebration /> mount below when it ships.
// import { BadgeUnlockCelebration } from "@/components/BadgeUnlockCelebration";
import { LumoProvider, useLumo } from "@/context/LumoContext";
import "../global.css";

// Hold the native (OS) splash until the video splash takes over, so there's no
// gap between them. AnimatedSplash calls hideAsync() once the video is ready.
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
      />
      {/* <BadgeUnlockCelebration /> */}
    </>
  );
}

export default function Layout() {
  const [fontsLoaded] = useFonts({
    "Lexend-Regular": require("../assets/fonts/Lexend-Regular.ttf"),
    "Lexend-Medium": require("../assets/fonts/Lexend-Medium.ttf"),
    "Lexend-SemiBold": require("../assets/fonts/Lexend-SemiBold.ttf"),
    "Lexend-Bold": require("../assets/fonts/Lexend-Bold.ttf"),
    "Lexend-Black": require("../assets/fonts/Lexend-Black.ttf")
  });
  const [splashDone, setSplashDone] = React.useState(false);

  // Keep the OS splash up (return null, no loading view) until fonts are ready,
  // then hand straight off to the video splash — no flash in between.
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
