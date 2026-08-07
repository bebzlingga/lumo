import React from "react";
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { completionCount, dailyTarget, isDoneOnDate } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { Icon } from "./Icon";
import { AppText } from "./ui";

const BAR_HEIGHT = 10;

/**
 * The day's completion at a glance: how many habits are done, a filling bar,
 * and the percentage.
 *
 * The bar reflects PARTIAL progress within each habit — a "3× per day" habit
 * with one logged contributes a third — so multi-step habits move the bar
 * gradually rather than only when fully complete. The "x of y" count beside it
 * still counts whole habits, which is the number people quote to themselves.
 */
export function DailyProgressCard({
  habits,
  dateKey,
  style
}: {
  habits: Habit[];
  dateKey: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette, isDark } = useLumo();

  const total = habits.length;
  const done = habits.filter((habit) => isDoneOnDate(habit, dateKey)).length;
  const completedFraction = habits.reduce((sum, habit) => {
    const target = dailyTarget(habit);
    const count = completionCount(habit, dateKey);
    return sum + (target > 0 ? Math.min(count, target) / target : 0);
  }, 0);
  const progress = total > 0 ? Math.min(1, completedFraction / total) : 0;
  const percent = Math.round(progress * 100);
  const allDone = total > 0 && done === total;

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
  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"]
  });

  return (
    <View style={[styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }, style]}>
      <View style={[styles.iconWrap, { backgroundColor: alpha(palette.glow, isDark ? "2E" : "3D") }]}>
        <Icon name={allDone ? "checkCircle" : "sun"} size={22} color={isDark ? palette.glow : palette.ink} weight="bulk" />
      </View>

      <View style={styles.body}>
        <AppText variant="bodySmall" color={palette.subtle} numberOfLines={1} style={styles.summary}>
          {total === 0 ? (
            "Nothing scheduled today"
          ) : (
            <>
              <AppText variant="bodySmall" color={palette.ink} style={styles.summaryStrong}>
                {done} of {total}
              </AppText>{" "}
              {total === 1 ? "habit" : "habits"} completed
            </>
          )}
        </AppText>
        <View style={[styles.track, { backgroundColor: palette.chartTrack }]}>
          <Animated.View style={[styles.fill, { width: barWidth, backgroundColor: palette.glow }]} />
        </View>
      </View>

      <View style={[styles.percentPill, { backgroundColor: palette.glowSoft }]}>
        <AppText variant="caption" color={isDark ? palette.glow : palette.ink} style={styles.percentText}>
          {percent}%
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.ml,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs
  },
  summary: {
    lineHeight: 20
  },
  summaryStrong: {
    fontFamily: fontFamilies.lexendBold
  },
  track: {
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
    overflow: "hidden"
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill
  },
  percentPill: {
    minWidth: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  percentText: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 14,
    lineHeight: 18
  }
});
