import React, { useState } from "react";
import { Animated, Easing, LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Rect, Stop } from "react-native-svg";
import { fontFamilies, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { completionCount, dailyTarget, isDoneOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { AppText } from "./ui";

const RING_SIZE = 64;
const RING_STROKE = 13;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
  return "Start with one habit.";
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
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const onCardLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCardSize((current) => (current.width === width && current.height === height ? current : { width, height }));
  };

  const total = habits.length;
  const done = habits.filter((habit) => isDoneOnDate(habit, dateKey)).length;
  // Ring reflects partial progress within each habit — a habit with a "3× per
  // day" goal and 1 done contributes 1/3, so multi-step habits fill the ring
  // gradually rather than only counting once fully complete.
  const completedFraction = habits.reduce((sum, habit) => {
    const target = dailyTarget(habit);
    const count = completionCount(habit, dateKey);
    return sum + (target > 0 ? Math.min(count, target) / target : 0);
  }, 0);
  const progress = total > 0 ? Math.min(1, completedFraction / total) : 0;
  const percent = Math.round(progress * 100);

  // Theme-derived gradient: the accent's medium tone into its dark tone
  // (greenDark is dark in light themes, greenSoft is dark in dark themes), so
  // the card follows the active palette while keeping white text readable.
  const cardDark = isDark ? palette.greenSoft : palette.greenDark;
  const gradientStops = [palette.green, cardDark];
  // The accent's light tone, blended further toward white so it reads as a
  // bright, pale tint of the theme on the dark card.
  const ringColor = palette.white;
  const titleColor = palette.white;
  const subColor = "rgba(255,255,255,0.82)";

  // Animate both fill (progress up) and unfill (undo) toward the new value.
  const progressAnim = React.useRef(new Animated.Value(progress)).current;
  React.useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [progress, progressAnim]);
  const ringOffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0]
  });

  return (
    <View style={[styles.card, { backgroundColor: gradientStops[1] }, style]} onLayout={onCardLayout}>
      {cardSize.width > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={cardSize.width} height={cardSize.height}>
          <Defs>
            <LinearGradient id="dailyProgressFill" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={gradientStops[0]} />
              <Stop offset="1" stopColor={gradientStops[1]} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={cardSize.width} height={cardSize.height} fill="url(#dailyProgressFill)" />
          {/* Darkening overlay to deepen the card while keeping the theme hue. */}
          <Rect x="0" y="0" width={cardSize.width} height={cardSize.height} fill="rgba(0,0,0,0.34)" />
          {/* Soft light blobs for depth */}
          <Ellipse cx={cardSize.width * 0.88} cy={cardSize.height * 0.04} rx={60} ry={60} fill="rgba(255,255,255,0.12)" />
          <Ellipse cx={cardSize.width * 0.12} cy={cardSize.height * 1.02} rx={78} ry={78} fill="rgba(255,255,255,0.08)" />
        </Svg>
      ) : null}

      {total === 0 ? (
        <View style={styles.emptyContent}>
          <AppText variant="titleSmall" color={titleColor} style={styles.title}>
            Nothing scheduled for this day.
          </AppText>
          <AppText variant="caption" color={subColor} style={styles.statLabel}>
            Enjoy the rest, or swipe to another day.
          </AppText>
        </View>
      ) : (
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
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={ringColor}
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
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 30,
    overflow: "hidden",
    padding: spacing.lg,
    height: 150,
    justifyContent: "center"
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  emptyContent: {
    gap: spacing.xs
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
});
