import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { FireIcon } from "@/components/FireIcon";
import { HabitIcon } from "@/components/HabitIcon";
import { HeaderTabs, type HeaderTabOption } from "@/components/HeaderTabs";
import { ScreenHeader } from "@/components/ScreenHeader";
import { chartTrackColor } from "@/components/StatisticsViews";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, habitAccent, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { formatShortDate, toDateKey } from "@/lib/date";
import { currentActivityStreak, periodAnalytics, type AnalyticsPeriod } from "@/lib/habitMath";

const PERIODS: HeaderTabOption<AnalyticsPeriod>[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" }
];

const PREVIOUS: Record<AnalyticsPeriod, string> = { week: "last week", month: "last month", year: "last year" };

/**
 * Where the home screen's streak card leads: how this week, month and year are
 * going so far. Every figure comes from `periodAnalytics`.
 */
export default function AnalyticsScreen() {
  const router = useRouter();
  const { habits, palette, isDark } = useLumo();
  const [period, setPeriod] = React.useState<AnalyticsPeriod>("week");
  const todayKey = toDateKey();
  // Same set the streak card counts from, so the two numbers agree.
  const active = React.useMemo(() => habits.filter((habit) => habit.status === "active"), [habits]);
  const data = React.useMemo(() => periodAnalytics(active, period, todayKey), [active, period, todayKey]);
  const streak = React.useMemo(() => currentActivityStreak(active, todayKey), [active, todayKey]);

  const delta = data.previousRate === null || data.scheduled === 0 ? null : data.rate - data.previousRate;
  const cardStyle = [styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }];
  const track = chartTrackColor(palette, isDark);

  return (
    <Screen contentStyle={styles.content} backgroundVariant="insights">
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        centerContent={<HeaderTabs options={PERIODS} value={period} onChange={setPeriod} hitSlop={8} minSegmentWidth={64} />}
      />

      <AppText variant="caption" color={palette.subtle} style={styles.range}>
        {data.startKey === data.endKey ? formatShortDate(data.endKey) : `${formatShortDate(data.startKey)} – ${formatShortDate(data.endKey)}`}
      </AppText>

      <View style={cardStyle}>
        <View style={styles.headline}>
          <View>
            <AppText color={palette.ink} style={styles.bigValue}>
              {data.rate}%
            </AppText>
            <AppText variant="caption" color={palette.subtle} style={styles.label}>
              Completion
            </AppText>
          </View>
          {delta === null ? null : (
            <AppText variant="caption" color={delta > 0 ? palette.greenDark : palette.subtle} style={styles.delta}>
              {delta === 0 ? `Level with ${PREVIOUS[period]}` : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs ${PREVIOUS[period]}`}
            </AppText>
          )}
        </View>

        <View style={[styles.grid, { borderTopColor: palette.hairline }]}>
          <Stat label="Check-ins" value={String(data.done)} />
          <Stat label="Perfect days" value={String(data.perfectDays)} />
          <Stat label="Active days" value={`${data.activeDays}/${data.elapsedDays}`} />
          <Stat label="Best run" value={String(data.bestRun)} />
        </View>

        <View style={[styles.streakRow, { borderTopColor: palette.hairline }]}>
          <FireIcon size={18} />
          <AppText variant="bodySmall" color={palette.ink} style={styles.streakText}>
            Current streak: {streak} {streak === 1 ? "day" : "days"}
          </AppText>
        </View>
      </View>

      <View style={cardStyle}>
        <AppText color={palette.ink} style={styles.cardTitle}>
          {period === "year" ? "By month" : "By day"}
        </AppText>
        <View style={styles.chart}>
          {data.buckets.map((bucket, index) => (
            <View key={bucket.key} style={styles.barSlot}>
              <View style={[styles.barTrack, { backgroundColor: track }]}>
                {bucket.rate ? (
                  <View style={[styles.barFill, { height: `${Math.max(6, bucket.rate)}%`, backgroundColor: palette.greenDark }]} />
                ) : null}
              </View>
              {/* A month has up to 31 bars; label every seventh so the numbers fit. */}
              <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.barLabel}>
                {period !== "month" || index % 7 === 0 ? bucket.label : " "}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={cardStyle}>
        <AppText color={palette.ink} style={styles.cardTitle}>
          Habits
        </AppText>
        {data.habits.length === 0 ? (
          <AppText variant="bodySmall" color={palette.subtle}>
            Nothing was due this {period} yet.
          </AppText>
        ) : (
          data.habits.map(({ habit, done, scheduled, rate }) => {
            const accent = habitAccent(habit.color, isDark) ?? palette.greenDark;

            return (
              <View key={habit.id} style={styles.habitRow}>
                <HabitIcon value={habit.emoji} color={accent} size={18} />
                <View style={styles.habitBody}>
                  <View style={styles.habitTop}>
                    <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.habitName}>
                      {habit.name}
                    </AppText>
                    <AppText variant="caption" color={palette.subtle}>
                      {done}/{scheduled} · {rate}%
                    </AppText>
                  </View>
                  <View style={[styles.habitTrack, { backgroundColor: track }]}>
                    <View style={[styles.habitFill, { width: `${rate}%`, backgroundColor: alpha(accent, "CC") }]} />
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { palette } = useLumo();

  return (
    <View style={styles.stat}>
      <AppText color={palette.ink} style={styles.statValue}>
        {value}
      </AppText>
      <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl * 2
  },
  range: {
    textAlign: "center",
    fontFamily: fontFamilies.lexendMedium
  },
  card: {
    gap: spacing.sm,
    padding: spacing.ml,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.075,
    shadowRadius: 18,
    elevation: 3
  },
  headline: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  bigValue: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 40,
    lineHeight: 42
  },
  delta: {
    flexShrink: 1,
    textAlign: "right",
    fontFamily: fontFamilies.lexendSemiBold,
    marginBottom: spacing.xxs
  },
  grid: {
    flexDirection: "row",
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  stat: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2
  },
  statValue: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 22,
    lineHeight: 24
  },
  label: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 11,
    lineHeight: 15
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  streakText: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  cardTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 14,
    lineHeight: 19
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: 140
  },
  barSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: spacing.xxs,
    height: "100%"
  },
  barTrack: {
    flex: 1,
    width: "100%",
    maxWidth: 28,
    borderRadius: radius.xs,
    justifyContent: "flex-end",
    overflow: "hidden"
  },
  barFill: {
    width: "100%",
    borderRadius: radius.xs
  },
  barLabel: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 10,
    lineHeight: 13,
    width: 24,
    textAlign: "center"
  },
  habitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  habitBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs
  },
  habitTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.xs
  },
  habitName: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendSemiBold
  },
  habitTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden"
  },
  habitFill: {
    height: "100%",
    borderRadius: radius.pill
  }
});
