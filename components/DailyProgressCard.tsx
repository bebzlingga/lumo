import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Rect, Stop } from "react-native-svg";
import { fontFamilies, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { isDoneOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { AppText } from "./ui";

const RING_SIZE = 96;
const RING_STROKE = 9;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function headline(percent: number) {
  if (percent >= 100) {
    return "All done for today!";
  }
  if (percent >= 60) {
    return "You're almost done!";
  }
  if (percent > 0) {
    return "Nice start, keep going.";
  }
  return "Let's begin today.";
}

export function DailyProgressCard({
  habits,
  dateKey,
  streak,
  style
}: {
  habits: Habit[];
  dateKey: string;
  streak: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette, isDark } = useLumo();

  if (!habits.length) {
    return null;
  }

  const total = habits.length;
  const done = habits.filter((habit) => isDoneOnDate(habit, dateKey)).length;
  const progress = Math.min(1, done / total);
  const percent = Math.round(progress * 100);

  // Fixed greens (not the light/dark tokens) so white text always has contrast.
  const gradientStops = isDark ? ["#2F6B45", "#16331F"] : ["#6FB07A", "#2F6B43"];
  const titleColor = palette.white;
  const subColor = "rgba(255,255,255,0.82)";
  const ringOffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <View style={[styles.card, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="dailyProgressFill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradientStops[0]} />
            <Stop offset="1" stopColor={gradientStops[1]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#dailyProgressFill)" />
        {/* Soft light blobs for depth */}
        <Ellipse cx="88%" cy="2%" rx="60" ry="60" fill="rgba(255,255,255,0.12)" />
        <Ellipse cx="12%" cy="108%" rx="78" ry="78" fill="rgba(255,255,255,0.08)" />
      </Svg>

      <View style={styles.content}>
        <View style={styles.left}>
          <AppText variant="titleSmall" color={titleColor} style={styles.title}>
            {headline(percent)}
          </AppText>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <AppText variant="titleSmall" color={titleColor} style={styles.statValue}>
                {done}/{total}
              </AppText>
              <AppText variant="caption" color={subColor} style={styles.statLabel}>
                {total === 1 ? "Habit" : "Habits"}
              </AppText>
            </View>
            <View style={styles.stat}>
              <AppText variant="titleSmall" color={titleColor} style={styles.statValue}>
                {streak}
              </AppText>
              <AppText variant="caption" color={subColor} style={styles.statLabel}>
                {streak === 1 ? "Day streak" : "Days streak"}
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} stroke="rgba(255,255,255,0.28)" strokeWidth={RING_STROKE} fill="none" />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={palette.glow}
              strokeWidth={RING_STROKE}
              strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              strokeDashoffset={ringOffset}
              strokeLinecap="round"
              fill="none"
              originX={RING_SIZE / 2}
              originY={RING_SIZE / 2}
              rotation="-90"
            />
          </Svg>
          <View style={styles.ringCenter} pointerEvents="none">
            <AppText variant="titleSmall" color={titleColor} style={styles.percent}>
              {percent}%
            </AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 30,
    overflow: "hidden",
    padding: spacing.lg,
    minHeight: 150,
    justifyContent: "center"
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  left: {
    flex: 1,
    gap: spacing.md
  },
  title: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 20,
    lineHeight: 26
  },
  stats: {
    flexDirection: "row",
    gap: spacing.lg
  },
  stat: {
    gap: 2
  },
  statValue: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 22,
    lineHeight: 27
  },
  statLabel: {
    fontFamily: fontFamilies.lexendMedium
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center"
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  percent: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 20,
    lineHeight: 24
  }
});
