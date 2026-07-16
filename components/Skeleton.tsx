import React from "react";
import { Animated, DimensionValue, Easing, StyleProp, ViewStyle } from "react-native";
import { radius } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";

/**
 * Pulsing placeholder block shown while a screen fetches its initial data.
 * Sized by the caller to roughly match the content it stands in for.
 */
export function Skeleton({
  width = "100%",
  height = 14,
  round = false,
  style
}: {
  width?: DimensionValue;
  height?: number;
  /** Fully rounded (avatars, pills). */
  round?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette, isDark } = useLumo();
  const pulse = React.useRef(new Animated.Value(0.5)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ])
    );

    loop.start();

    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: round ? height / 2 : radius.md,
          backgroundColor: isDark ? alpha(palette.subtle, "2E") : palette.chartTrack,
          opacity: pulse
        },
        style
      ]}
    />
  );
}
