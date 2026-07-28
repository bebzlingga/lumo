import React from "react";
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A circular progress ring that fills clockwise as `progress` animates 0 -> 1.
 * Used to visualise a press-and-hold: overlay it on the element being held so
 * the user can see how far along the hold is (and that a hold is happening at
 * all). The whole ring fades out at rest so it leaves no mark when progress is
 * 0. Drive `progress` with the React Native `Animated` API (useNativeDriver
 * must be false — SVG stroke props animate on the JS thread).
 */
export function HoldProgressRing({
  progress,
  size,
  stroke = 3,
  color,
  trackColor,
  style
}: {
  /** 0 (idle) -> 1 (hold complete). */
  progress: Animated.Value;
  size: number;
  stroke?: number;
  color: string;
  /** Optional faint full-circle track shown behind the sweeping arc. */
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0]
  });
  // Fade the ring in the instant the hold starts and out again at rest, so
  // completed habits don't carry a permanent ring around their icon.
  const opacity = progress.interpolate({
    inputRange: [0, 0.02, 1],
    outputRange: [0, 1, 1]
  });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { opacity }, style]}>
      <Svg width={size} height={size}>
        {trackColor ? (
          <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
        ) : null}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          originX={center}
          originY={center}
          rotation={-90}
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center"
  }
});
