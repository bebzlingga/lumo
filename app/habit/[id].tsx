import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React from "react";
import { Alert, StyleSheet, View } from "react-native";
import { ConsistencyHeatmap } from "@/components/ConsistencyHeatmap";
import { CompletionTimeChart, ProgressLineChart } from "@/components/HabitCharts";
import { HabitIcon } from "@/components/HabitIcon";
import { Icon, type IconName } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { AppText, Button, Card, LoadingState, Screen } from "@/components/ui";
import { fontFamilies, habitAccent, habitColorOption, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha, readableOn } from "@/lib/color";
import { daysBetween, parseDateKey, toDateKey } from "@/lib/date";
import { habitSummary, scheduledWeekdays, totalCompletions } from "@/lib/habitMath";
import {
  averagePerWeek,
  completedDays,
  completionTimeHistogram,
  daysTracked,
  formatHourLabel,
  lastCompletedKey,
  progressSeries
} from "@/lib/habitInsights";
import type { Habit } from "@/types/habit";

/**
 * Friendly names for the screens a habit is reachable from. Anything not listed
 * falls back to "Habits", which is where the habit lives.
 */
const SCREEN_LABELS: Record<string, string> = {
  today: "Today",
  habits: "Habits",
  journal: "Journal",
  profile: "Profile",
  friends: "Friends",
  settings: "Settings",
  templates: "Starter packs"
};

const DEFAULT_BACK_LABEL = "Habits";

type NavRoute = { name: string; state?: { index?: number; routes?: NavRoute[] } };

/**
 * The active leaf under a stack entry. A single entry can be a whole nested
 * navigator — "(tabs)" on its own doesn't say which tab you came from — so this
 * walks down until there is nothing nested left.
 */
function leafRouteName(route: NavRoute): string {
  const routes = route.state?.routes;

  if (!routes?.length) {
    return route.name;
  }

  const index = route.state?.index ?? routes.length - 1;

  return leafRouteName(routes[index] ?? routes[routes.length - 1]);
}

function goalLabel(habit: Habit) {
  switch (habit.goal.type) {
    case "multiple":
      return `${habit.goal.count}x a day`;
    case "weekly":
      return `${habit.goal.target}x a week`;
    case "monthly":
      return `${habit.goal.target}x a month`;
    default:
      return "Once a day";
  }
}

function scheduleLabel(habit: Habit) {
  switch (habit.repeatSchedule.type) {
    case "weekdays":
      return "Weekdays";
    case "weekends":
      return "Weekends";
    case "specific":
      return `${scheduledWeekdays(habit).length} days a week`;
    case "interval":
      return `Every ${habit.repeatSchedule.every} days`;
    default:
      return "Daily";
  }
}

function reminderLabelFor(habit: Habit) {
  if (!habit.reminderEnabled) {
    return "No reminder";
  }

  return habit.reminderMode === "interval"
    ? `Every ${habit.reminderIntervalValue} ${habit.reminderIntervalUnit === "hours" ? "hr" : "min"}`
    : habit.reminderTime;
}

/** "5 Jun 2026" — assembled locally so the detail rows keep a stable width
 *  rather than inheriting a long locale format. */
function formatDateKey(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function relativeDayLabel(dateKey: string | null, todayKey: string) {
  if (!dateKey) {
    return "Never";
  }

  const elapsed = daysBetween(dateKey, todayKey);

  if (elapsed <= 0) {
    return "Today";
  }

  return elapsed === 1 ? "Yesterday" : `${elapsed} days ago`;
}

export default function HabitDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { habits, isReady } = useLumo();
  const habit = habits.find((item) => item.id === id);

  if (!isReady) {
    return <LoadingState />;
  }

  if (!habit) {
    return (
      <Screen>
        <AppText variant="title">Habit not found</AppText>
        <Button label="Back to today" icon="back" onPress={() => router.replace("/(tabs)/today")} />
      </Screen>
    );
  }

  // Rendered as its own component so every hook below runs unconditionally —
  // the lookup above can't be resolved before hooks without this split.
  return <HabitDetail habit={habit} />;
}

function HabitDetail({ habit }: { habit: Habit }) {
  const router = useRouter();
  const navigation = useNavigation();
  const { isDark, palette, pauseHabit, resumeHabit, archiveHabit, recoverHabit, deleteHabit } = useLumo();
  // Name the screen the back arrow actually returns to. Read once — the stack
  // beneath this screen cannot change while it is mounted.
  const backLabel = React.useMemo(() => {
    const state = navigation.getState() as unknown as { index: number; routes: NavRoute[] } | undefined;
    const previous = state && state.index > 0 ? state.routes[state.index - 1] : undefined;

    return (previous ? SCREEN_LABELS[leafRouteName(previous)] : undefined) ?? DEFAULT_BACK_LABEL;
  }, [navigation]);

  const todayKey = toDateKey();
  // Every derivation reads the habit as active, so pausing or archiving takes it
  // off today's list without erasing the record behind these charts.
  const displayHabit = React.useMemo<Habit>(() => ({ ...habit, status: "active" }), [habit]);
  const summary = React.useMemo(() => habitSummary(displayHabit), [displayHabit]);
  // Fixed at three months — 13 weekly points, which is enough to show a trend
  // without crowding the plot. One agreed window also reads more honestly than
  // a range picker you have to interpret before trusting the line.
  const series = React.useMemo(() => progressSeries(displayHabit, "90D", todayKey), [displayHabit, todayKey]);
  const times = React.useMemo(() => completionTimeHistogram(habit), [habit]);
  const doneDays = React.useMemo(() => completedDays(displayHabit, todayKey), [displayHabit, todayKey]);
  const lastDone = React.useMemo(() => lastCompletedKey(habit), [habit]);
  const perWeek = React.useMemo(() => averagePerWeek(displayHabit, todayKey), [displayHabit, todayKey]);
  const tracked = daysTracked(habit, todayKey);

  // Habits with a colour theme carry it through the screen; legacy habits keep
  // the app theme's greens.
  const habitColor = habitColorOption(habit.color);
  const accentColor = habitAccent(habit.color, isDark) ?? palette.greenDark;
  const iconTint = habitColor ? readableOn(habitColor.color, palette.card) : palette.greenDark;

  function confirmDelete() {
    Alert.alert("Delete habit?", "This removes the habit and its local history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteHabit(habit.id);
          router.replace("/(tabs)/habits");
        }
      }
    ]);
  }

  function confirmArchive() {
    Alert.alert("Mark as complete?", "This marks the habit as completed and moves it out of your active list. You can recover it anytime.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Complete",
        onPress: async () => {
          await archiveHabit(habit.id);
          router.replace("/(tabs)/habits");
        }
      }
    ]);
  }

  function confirmRecover() {
    Alert.alert("Recover habit?", "This moves the habit back to your active habits list.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Recover",
        onPress: async () => {
          await recoverHabit(habit.id);
          router.replace("/(tabs)/habits");
        }
      }
    ]);
  }

  function openOverflow() {
    const options: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [
      { text: "Edit habit", onPress: () => router.push(`/habit/edit/${habit.id}`) }
    ];

    if (habit.status === "archived") {
      options.push({ text: "Recover", onPress: confirmRecover });
    } else {
      options.push({
        text: habit.status === "paused" ? "Resume" : "Pause",
        onPress: () => (habit.status === "paused" ? resumeHabit(habit.id) : pauseHabit(habit.id))
      });
      options.push({ text: "Mark as complete", onPress: confirmArchive });
    }

    options.push({ text: "Delete", style: "destructive", onPress: confirmDelete });
    options.push({ text: "Cancel", style: "cancel" });

    Alert.alert(habit.name, undefined, options);
  }

  const statusLabel = habit.status === "paused" ? "Paused" : habit.status === "archived" ? "Completed" : null;

  // The chart's read-out lives in its caption rather than a panel beside it, so
  // the peak and the average have to be stated rather than pointed at.
  const timeBlurb =
    times.bestHour === null
      ? "Log this habit a few times and the times of day you keep it will show up here."
      : `Each bar is a two-hour slot — the share of your logs that landed in it. You keep this most often around ${formatHourLabel(
          times.bestHour
        )}${times.averageLabel ? `, averaging ${times.averageLabel}` : ""}.`;

  return (
    <Screen contentStyle={styles.content}>
      {/* Same shape as the journal editor and Habits list: outlined icon on
          each side, title centred between them. */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${backLabel}`}
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.topBarButton, { borderColor: palette.hairline, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="arrowLeft" size={20} color={palette.ink} weight="bold" />
        </Pressable>
        <View style={styles.topBarCopy}>
          <AppText color={palette.ink} numberOfLines={1} style={styles.backLabel}>
            {backLabel}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Habit options"
          onPress={openOverflow}
          hitSlop={10}
          style={({ pressed }) => [styles.topBarButton, { borderColor: palette.hairline, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="dotsThree" size={20} color={palette.ink} weight="bold" />
        </Pressable>
      </View>

      {/* The icon top-aligns with the title rather than centring on the whole
          block, so it stays put whether the name runs to one line or three. */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: habitColor ? alpha(habitColor.color, "24") : palette.greenSoft }]}>
          <HabitIcon value={habit.emoji} color={iconTint} size={28} weight="fill" />
        </View>
        <View style={styles.headerCopy}>
          <AppText color={palette.ink} numberOfLines={3} style={styles.title}>
            {habit.name}
          </AppText>
          {statusLabel ? (
            <View style={[styles.statusBadge, { backgroundColor: alpha(palette.chartPartial, "26"), borderColor: alpha(palette.chartPartial, "73") }]}>
              <AppText variant="caption" color={palette.chartPartial} style={styles.statusBadgeText}>
                {statusLabel}
              </AppText>
            </View>
          ) : null}

          <View style={styles.chipRow}>
            <MetaChip icon="calendar" label={scheduleLabel(habit)} />
            <MetaChip icon="refresh" label={goalLabel(habit)} />
            <MetaChip icon="clock" label={reminderLabelFor(habit)} />
          </View>
        </View>
      </View>

      {/* One card, not five — the same shape Profile's figures take: the two
          live numbers lead at display size, the rest sit in a compact strip
          under a rule. It was five separate tiles on a sideways scroller, which
          hid two of the five off the right edge and gave "Total logs" exactly
          the same weight as the streak you are actually here to look at. */}
      <View style={[styles.statsCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
        <View style={styles.statsHero}>
          <View style={styles.statsHeroItem}>
            <View style={styles.statsHeroValueRow}>
              <AppText color={palette.ink} style={styles.statsHeroValue}>
                {summary.currentStreak}
              </AppText>
              <AppText color={palette.subtle} style={styles.statsHeroUnit}>
                {summary.currentStreak === 1 ? "day" : "days"}
              </AppText>
            </View>
            <View style={styles.statsHeroLabelRow}>
              {/* The habit's own colour, not the app accent — this card belongs
                  to one habit, and the colour is how it identifies itself
                  everywhere else on the screen. */}
              <Icon name="fire" size={13} color={accentColor} weight="bulk" />
              <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.statsHeroLabel}>
                Current streak
              </AppText>
            </View>
          </View>

          <View style={styles.statsHeroItem}>
            <View style={styles.statsHeroValueRow}>
              <AppText color={palette.ink} style={styles.statsHeroValue}>
                {summary.completionRate}
              </AppText>
              {/* A percent sign belongs to the number, so it takes the ink
                  colour, more of the figure's size, and no gap before it. */}
              <AppText color={palette.ink} style={[styles.statsHeroUnit, styles.statsHeroUnitTight]}>
                %
              </AppText>
            </View>
            <View style={styles.statsHeroLabelRow}>
              <Icon name="chart2" size={13} color={accentColor} weight="bulk" />
              <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.statsHeroLabel}>
                Success rate
              </AppText>
            </View>
          </View>
        </View>

        <View style={[styles.statsRule, { backgroundColor: palette.hairline }]} />

        <View style={styles.statsStrip}>
          {[
            { label: "Longest streak", value: `${summary.bestStreak}` },
            { label: "Days completed", value: `${doneDays}` },
            { label: "Total logs", value: `${totalCompletions(habit)}` }
          ].map((stat, index, all) => (
            <View
              key={stat.label}
              style={[
                styles.statsStripCell,
                index < all.length - 1 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: palette.hairline }
              ]}
            >
              <AppText color={palette.ink} style={styles.statsStripValue}>
                {stat.value}
              </AppText>
              <AppText variant="caption" color={palette.subtle} numberOfLines={2} style={styles.statsStripLabel}>
                {stat.label}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      {/* The grid carries its own month axis and colour ramp, so it needs no
          heading or legend around it. */}
      <Card style={styles.card}>
        <ConsistencyHeatmap habit={habit} accentColor={accentColor} />
      </Card>

      <Card style={styles.card}>
        <AppText variant="titleSmall" color={palette.ink} style={styles.cardTitle}>
          Progress Over Time
        </AppText>

        <ProgressLineChart points={series.points} accentColor={accentColor} />

        {/* Reads as a footnote to the chart rather than a preamble you have to
            get through before seeing it. */}
        <AppText variant="caption" color={palette.muted} style={styles.cardBlurb}>
          Each point is one week of the last three months — the share of its scheduled days you completed, so a dip means missed days rather than
          fewer of them.
        </AppText>
      </Card>

      <Card style={styles.card}>
        <AppText variant="titleSmall" color={palette.ink} style={styles.cardTitle}>
          Completion Time
        </AppText>

        {times.total > 0 ? <CompletionTimeChart bins={times.bins} accentColor={accentColor} /> : null}

        <AppText variant="caption" color={palette.muted} style={styles.cardBlurb}>
          {timeBlurb}
        </AppText>
      </Card>

      <Card style={styles.detailCard}>
        <View style={styles.detailHead}>
          <AppText variant="titleSmall" color={palette.ink} style={styles.cardTitle}>
            Details
          </AppText>
        </View>
        <DetailRow label="Goal" value={goalLabel(habit)} />
        <DetailRow label="Repeats" value={scheduleLabel(habit)} />
        <DetailRow label="Reminder" value={reminderLabelFor(habit)} />
        <DetailRow label="Category" value={habit.category} />
        <DetailRow label="Started" value={formatDateKey(habit.createdAt)} />
        <DetailRow label="Days tracked" value={`${tracked}`} />
        <DetailRow label="Last completed" value={relativeDayLabel(lastDone, todayKey)} />
        <DetailRow label="Average" value={`${perWeek} a week`} />
        {habit.skips?.length ? <DetailRow label="Days skipped" value={`${habit.skips.length}`} /> : null}
      </Card>
    </Screen>
  );
}

function MetaChip({ icon, label }: { icon: IconName; label: string }) {
  const { palette } = useLumo();

  return (
    // A wash of the ink colour rather than a palette surface: `surface` is a
    // whisper away from the canvas and `surfaceStrong` reads heavy. At 8% it
    // lifts off the cream and off the dark canvas by the same amount, because
    // `ink` inverts with the theme.
    <View style={[styles.chip, { backgroundColor: alpha(palette.ink, "14") }]}>
      <Icon name={icon} size={12} color={palette.subtle} weight="bulk" />
      <AppText variant="caption" color={palette.body} numberOfLines={1} style={styles.chipLabel}>
        {label}
      </AppText>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { palette } = useLumo();

  return (
    <View style={styles.detailRow}>
      {/* The label is the question, the value is the answer — keeping it lighter
          lets the column of values carry the row. */}
      <AppText variant="bodySmall" color={palette.muted} style={styles.detailLabel}>
        {label}
      </AppText>
      <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.detailValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.sm
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  topBarCopy: {
    flex: 1,
    alignItems: "center"
  },
  backLabel: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 19,
    lineHeight: 25
  },
  // Outlined circle, matching the journal editor's back/preview buttons.
  topBarButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  // Stacks on the screen's own 12pt rhythm, so these margins give the title
  // block ~24pt of air above and below it.
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm
  },
  headerIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center"
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
    alignItems: "flex-start"
  },
  title: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 27,
    lineHeight: 33
  },
  statusBadge: {
    minHeight: 22,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs
  },
  statusBadgeText: {
    fontSize: 11,
    lineHeight: 14
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "stretch",
    gap: 6,
    marginTop: 2
  },
  // Compact by design: these repeat what the Details rows already spell out, so
  // they read as trailing metadata rather than a third heading level.
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3
  },
  chipLabel: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 11,
    lineHeight: 15
  },
  // A step above the habit-list rows (`spacing.md`): these cards hold charts and
  // stat rows rather than a single line, so they need slightly more air.
  card: {
    borderRadius: radius.card,
    padding: spacing.ml,
    gap: spacing.sm
  },
  cardTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 14,
    lineHeight: 20
  },
  cardBlurb: {
    fontFamily: fontFamilies.lexend,
    lineHeight: 17
  },
  // No padding of its own — the two bands inset themselves, so the rule between
  // them runs edge to edge. No `overflow: hidden` either: on iOS it would mask
  // this shadow away, and nothing here needs the clip.
  statsCard: {
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.075,
    shadowRadius: 18,
    elevation: 3
  },
  statsHero: {
    flexDirection: "row",
    paddingHorizontal: spacing.ml,
    paddingVertical: spacing.md
  },
  statsHeroItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2
  },
  statsHeroValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 3
  },
  statsHeroValue: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 30,
    lineHeight: 36
  },
  statsHeroUnit: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 14,
    lineHeight: 20
  },
  statsHeroUnitTight: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 20,
    lineHeight: 26,
    marginLeft: -2
  },
  statsHeroLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs
  },
  statsHeroLabel: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendMedium,
    textAlign: "center"
  },
  statsRule: {
    height: StyleSheet.hairlineWidth
  },
  statsStrip: {
    flexDirection: "row",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md
  },
  // The row owns the vertical padding, so each cell's right hairline is inset
  // well clear of the card's corners.
  statsStripCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 1,
    paddingHorizontal: spacing.xxs
  },
  statsStripValue: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 17,
    lineHeight: 23
  },
  statsStripLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamilies.lexendMedium,
    textAlign: "center"
  },
  detailCard: {
    borderRadius: radius.card,
    padding: spacing.ml
  },
  detailHead: {
    paddingBottom: spacing.xs
  },
  // No rules between rows: the label/value columns already separate them, and
  // hairlines at this row height read as clutter.
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: 5
  },
  // A step above the habit list's meta line (12/16), which read a touch small
  // for a column you scan top to bottom.
  detailLabel: {
    fontSize: 13,
    lineHeight: 18
  },
  detailValue: {
    flexShrink: 1,
    textAlign: "right",
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 13,
    lineHeight: 18
  },
});
