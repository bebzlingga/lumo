import React from "react";
import { StyleSheet, View } from "react-native";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { addDays, dateRange, parseDateKey, toDateKey } from "@/lib/date";
import { summarizeDays } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { Icon } from "./Icon";
import { AppText } from "./ui";

/** A rolling seven days, not a calendar week — "this week" here means the week
 *  just gone, so the comparison is always against a full seven days. */
const SPAN = 7;

/**
 * One figure with its change against the week before.
 *
 * A fall is drawn in the muted ink rather than in the danger red: Lumo's voice
 * never scolds, and a quieter week is information, not an error.
 */
function Stat({ value, label, delta, suffix }: { value: number; label: string; delta: number | null; suffix?: string }) {
  const { palette } = useLumo();
  const rose = delta !== null && delta > 0;
  const deltaColor = rose ? palette.greenDark : palette.subtle;

  return (
    <View style={styles.stat}>
      {/* Figure over label, one word each. The unit used to sit BESIDE the
          number with the label under it, which read as one broken sentence —
          "7 check-ins / Completed" — rather than as a number and its name. */}
      <AppText color={palette.ink} style={styles.value}>
        {value}
        {suffix ?? ""}
      </AppText>
      <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.label}>
        {label}
      </AppText>
      {delta === null ? null : (
        <View style={[styles.delta, { backgroundColor: alpha(deltaColor, "14") }]}>
          {delta === 0 ? null : <Icon name={rose ? "arrowUp" : "arrowDown"} size={11} color={deltaColor} weight="bulk" />}
          <AppText variant="caption" color={deltaColor} numberOfLines={1} style={styles.deltaText}>
            {delta === 0 ? "Level" : `${Math.abs(delta)}${suffix ?? ""}`}
          </AppText>
        </View>
      )}
    </View>
  );
}

/**
 * The profile's week-over-week panel: what the last seven days came to, and
 * how that compares with the seven before them.
 *
 * This is the whole of what used to be a screen of its own. A full "Your week"
 * page repeated figures the profile already carried — the streak, the
 * completion rate, the perfect-day count — and the one thing it added that
 * nothing else said was the comparison against last week. So that is what
 * survived, and it lives here beside the other numbers rather than a tap away
 * from them.
 */
export function WeekSummaryCard({ habits }: { habits: Habit[] }) {
  const { palette, isDark } = useLumo();
  const todayKey = toDateKey();

  const summary = React.useMemo(() => {
    const active = habits.filter((habit) => habit.status === "active");
    const thisWeek = summarizeDays(active, dateRange(SPAN, todayKey));
    const lastWeek = summarizeDays(active, dateRange(SPAN, addDays(todayKey, -SPAN)));
    // Nothing was due last week, so there is no comparison to draw — better to
    // say so than to report a rise from a week that never happened.
    const comparable = lastWeek.scheduled > 0;

    return {
      thisWeek,
      lastWeek,
      doneDelta: comparable ? thisWeek.done - lastWeek.done : null,
      rateDelta: comparable ? thisWeek.rate - lastWeek.rate : null,
      perfectDelta: comparable ? thisWeek.perfectDays - lastWeek.perfectDays : null,
      comparable
    };
  }, [habits, todayKey]);

  const span = dateRange(SPAN, todayKey);
  const format = (dateKey: string) => parseDateKey(dateKey).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <View style={[styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      <View style={styles.header}>
        <AppText color={palette.ink} numberOfLines={1} style={styles.title}>
          This week
        </AppText>
        <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.range}>
          {format(span[0])} – {format(span[span.length - 1])}
        </AppText>
      </View>

      <View style={styles.stats}>
        <Stat value={summary.thisWeek.done} label="Check-ins" delta={summary.doneDelta} />
        <View style={[styles.divider, { backgroundColor: palette.hairline }]} />
        <Stat value={summary.thisWeek.rate} suffix="%" label="Completion" delta={summary.rateDelta} />
        <View style={[styles.divider, { backgroundColor: palette.hairline }]} />
        <Stat value={summary.thisWeek.perfectDays} label="Perfect days" delta={summary.perfectDelta} />
      </View>

      <AppText variant="caption" color={alpha(palette.subtle, "CC")} numberOfLines={1} style={styles.footnote}>
        {summary.comparable
          ? `Last week: ${summary.lastWeek.done} check-ins · ${summary.lastWeek.rate}%`
          : "No habits were due last week — nothing to compare yet."}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  // Padding and lift both match the cards this sits between on Profile — the
  // journey card above and the two chart cards below. It was carrying the
  // app's lighter default shadow, so it read as sitting flatter than its
  // neighbours in a stack that is meant to be one family of surfaces.
  card: {
    gap: spacing.sm,
    padding: spacing.ml,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.075,
    shadowRadius: 18,
    elevation: 3
  },
  // The extra margin drops the figures clear of the heading. It sits here
  // rather than on the card's own gap, which also spaces the stats from the
  // footnote — and that pair reads better close together.
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.xs
  },
  // A step under the app's section-heading size, matching the habits card's
  // own heading: this one sits INSIDE the card it names rather than above a
  // group of them, and at the full step it outweighed the figures beneath it.
  title: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendBold,
    fontSize: 14,
    lineHeight: 19
  },
  range: {
    flexShrink: 0,
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 11,
    lineHeight: 15
  },
  stats: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  stat: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch"
  },
  // Leading pulled in under the font size, which is safe only because these
  // strings are digits: numerals carry no descenders, so the room a font
  // reserves for them under every line is pure empty box.
  value: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 26,
    lineHeight: 28
  },
  label: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center"
  },
  delta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: spacing.xxs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2
  },
  deltaText: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 10,
    lineHeight: 14
  },
  footnote: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center"
  }
});
