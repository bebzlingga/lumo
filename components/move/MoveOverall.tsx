import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useMoveAccent } from "@/components/move/ChallengeUI";
import { MoveActivityChart } from "@/components/move/MoveActivityChart";
import { FamilyBadge } from "@/components/move/MoveBadge";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { addDays, formatRelativeDate, toDateKey } from "@/lib/date";
import { hasMilestone } from "@/lib/move/achievements";
import { MOVE_FAMILIES } from "@/lib/move/challengeDefs";
import { formatMinutes } from "@/lib/move/movement";
import { formatDistanceValue } from "@/lib/move/tracking/pace";
import type { WalkRecord } from "@/lib/walk";

/** A fortnight: long enough to have a shape, short enough for the days to read. */
const ACTIVITY_WINDOW_DAYS = 14;

/**
 * The Overall half of the Move tab: the all-time figure, three rolling windows,
 * a fortnight's line, the last seven days, and the badge shelf.
 *
 * Every distance comes from `move.dayDistance` — health data and tracked walks
 * reconciled in one place — so this view, the goal and the challenge can never
 * disagree about a day. Rolling windows rather than calendar ones, which reset to
 * nearly nothing on the 1st.
 */
export function MoveOverall() {
  const router = useRouter();
  const { palette } = useLumo();
  const accent = useMoveAccent();
  const move = useMove();
  const { dayDistance, todayKey } = move;

  const periods = React.useMemo(() => {
    const sum = (days: number) => Array.from({ length: days }, (_, index) => dayDistance(addDays(todayKey, -index))).reduce((a, b) => a + b, 0);

    return [
      { label: "Today", metres: dayDistance(todayKey) },
      { label: "Last 7 days", metres: sum(7) },
      { label: "Last 30 days", metres: sum(30) }
    ];
  }, [todayKey, dayDistance]);

  // Oldest first: a line reads left to right in time.
  const activityWindow = React.useMemo(
    () =>
      Array.from({ length: ACTIVITY_WINDOW_DAYS }, (_, index) => {
        const dateKey = addDays(todayKey, -(ACTIVITY_WINDOW_DAYS - 1 - index));

        return { dateKey, metres: dayDistance(dateKey) };
      }),
    [todayKey, dayDistance]
  );
  // A fortnight of rest is a flat line that reads as a broken chart; the list
  // below still spells those days out.
  const hasActivity = activityWindow.some((entry) => entry.metres > 0);

  /**
   * Today and the six days before, newest first — built from dates so a day with
   * nothing still gets a row. `walks` are the RECORDED walks (a route to open);
   * the figures cover every step, phone in hand or not.
   */
  const lastSevenDays = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = addDays(todayKey, -index);
        const summary = move.state.summaries.find((entry) => entry.date === date);
        const walks = move.walks.filter((record) => toDateKey(new Date(record.startedAt)) === date);
        const trackedMinutes = walks.reduce((total, record) => total + Math.max(0, record.activeMs) / 60_000, 0);

        return {
          date,
          distanceMeters: dayDistance(date),
          activeMinutes: Math.max(summary?.activeMinutes ?? 0, Math.round(trackedMinutes)),
          walks
        };
      }),
    [todayKey, move.state.summaries, move.walks, dayDistance]
  );

  const earnedCount = MOVE_FAMILIES.filter((entry) => hasMilestone(move.achievements, entry.id)).length;

  /** One walk opens it; several open the history rather than hiding the others. */
  function openDay(walks: WalkRecord[]) {
    router.push(walks.length === 1 ? `/walk/${walks[0].id}` : "/walk/history");
  }

  return (
    <>
      <View style={styles.totalHead}>
        <AppText color={palette.ink} style={styles.total} numberOfLines={1}>
          {formatDistanceValue(move.totalDistanceM)}
          <AppText color={palette.ink} style={styles.totalUnit}>
            {" km"}
          </AppText>
        </AppText>
        <AppText variant="bodySmall" color={palette.muted} style={styles.semibold}>
          All time
        </AppText>
      </View>

      <View style={styles.periods}>
        {periods.map((period) => (
          <View key={period.label} style={styles.period}>
            <AppText color={palette.ink} style={styles.periodValue} numberOfLines={1}>
              {formatDistanceValue(period.metres)}
              <AppText color={palette.ink} style={styles.periodUnit}>
                {" km"}
              </AppText>
            </AppText>
            <AppText variant="caption" color={palette.muted}>
              {period.label}
            </AppText>
          </View>
        ))}
      </View>

      {hasActivity ? (
        <View style={styles.section}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
            Daily distance
          </AppText>
          <View style={styles.inset}>
            <MoveActivityChart points={activityWindow} color={accent.glyph} todayKey={todayKey} />
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
          Last 7 days
        </AppText>

        {/* Rules rather than cards: the week is one thing, and a line between its
            days is all that tells them apart. */}
        <View style={styles.inset}>
          {lastSevenDays.map((day, index) => {
            const label = formatRelativeDate(day.date, todayKey);
            const rule = index === 0 ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline };
            const moved = day.distanceMeters > 0;
            const body = (
              <>
                <AppText
                  variant="bodySmall"
                  color={moved ? (day.date === todayKey ? palette.ink : palette.body) : palette.muted}
                  style={styles.dayDate}
                >
                  {label}
                </AppText>
                {moved ? (
                  <View style={[styles.dayBadge, { backgroundColor: accent.soft }]}>
                    <AppText variant="caption" color={accent.glyph} style={styles.semibold}>
                      {formatDistanceValue(day.distanceMeters)} km
                      {day.activeMinutes > 0 ? ` · ${formatMinutes(day.activeMinutes)}` : ""}
                    </AppText>
                  </View>
                ) : (
                  // A rest day is a fact, not a warning: quiet text, no red pill.
                  <AppText variant="caption" color={palette.muted}>
                    No activity
                  </AppText>
                )}
                {day.walks.length > 0 ? <Icon name="forward" size={12} color={palette.muted} weight="bold" /> : null}
              </>
            );

            if (day.walks.length === 0) {
              return (
                <View key={day.date} style={[styles.dayRow, rule]}>
                  {body}
                </View>
              );
            }

            return (
              <Pressable
                key={day.date}
                accessibilityRole="button"
                accessibilityLabel={day.walks.length === 1 ? `${label}, open the walk you recorded` : `${label}, ${day.walks.length} recorded walks`}
                onPress={() => openDay(day.walks)}
                style={({ pressed }) => [styles.dayRow, rule, { opacity: pressed ? 0.6 : 1 }]}
              >
                {body}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
          Milestones
        </AppText>
        <View style={[styles.badgeCount, { backgroundColor: palette.greenSoft }]}>
          <Icon name="trophy" size={14} color={palette.greenDark} weight="bulk" />
          <AppText variant="caption" color={palette.greenDark} style={styles.badgeCountLabel}>
            {earnedCount} of {MOVE_FAMILIES.length} unlocked
          </AppText>
        </View>
        {/* The shelf only — choosing a rung happens on the Challenges screen. */}
        <View style={styles.badgeGrid}>
          {MOVE_FAMILIES.map((family) => (
            <FamilyBadge key={family.id} family={family} unlocked={hasMilestone(move.achievements, family.id)} size={68} />
          ))}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs
  },
  sectionTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    textAlign: "center"
  },
  semibold: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  totalHead: {
    alignItems: "center",
    paddingTop: spacing.md
  },
  total: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 58,
    lineHeight: 68,
    textAlign: "center"
  },
  totalUnit: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 29
  },
  periods: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  period: {
    flex: 1,
    alignItems: "center",
    gap: 2
  },
  periodValue: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 26,
    lineHeight: 32
  },
  periodUnit: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 13
  },
  // One inset for the chart and the day list, so both start on one vertical.
  inset: {
    width: "88%",
    alignSelf: "center",
    paddingTop: spacing.xxs
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44
  },
  dayDate: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold
  },
  dayBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill
  },
  badgeCount: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xxs
  },
  badgeCountLabel: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 0.4
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: spacing.sm,
    rowGap: spacing.sm,
    paddingTop: spacing.xs
  }
});
