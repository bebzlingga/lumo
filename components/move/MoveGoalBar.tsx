import React from "react";
import { StyleSheet, View } from "react-native";
import { useMoveAccent } from "@/components/move/ChallengeUI";
import { MoveProgressBar, MoveProgressRow } from "@/components/move/MoveProgressBar";
import { Icon } from "@/components/Icon";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { dayInitials, formatShortDate, parseDateKey } from "@/lib/date";
import { describeGoal, periodLabel, periodResetsOn, type MoveGoalProgress } from "@/lib/move/goal";
import { kmValue } from "@/lib/move/movement";

/**
 * A goal's standing, as the bar Move uses for every other target.
 *
 * This was a dial, on the argument that a bar is a journey with an end while a
 * goal comes back round. It reads better as a bar anyway: the figure is no
 * longer boxed inside a circle competing with it for the middle of the screen,
 * the fill is a length that can be compared at a glance from across a room, and
 * it is `MoveProgressBar` — the same shape the today card, milestones, the
 * journey and group challenges all use, which is one design instead of a dial
 * and a bar arguing about which is the house style.
 *
 * ## What is on it
 *
 * The distance WALKED, large, and the target beside it. Not the percentage:
 * somebody who has done 27 km wants to know they have done 27 km, and the
 * proportion is what the bar is for.
 *
 * Past the target the bar stays full and the figure keeps climbing — see
 * `lib/move/goal.ts`, rule 2. A bar that stopped at the top would quietly
 * delete the best walking somebody did all week.
 *
 * ## One reading, at the resolution the period deserves
 *
 * A weekly or monthly goal draws the day chart; a daily goal draws the bar.
 * They are alternatives rather than a stack, because they answer the same
 * question — how much of the target is done — and the columns answer it with
 * more in the answer: WHICH days did it. "40 km, mostly on Sunday" and "40 km,
 * six a day" are different weeks and a bar cannot tell them apart. Over a
 * single day there is nothing to tell apart, so the bar is the honest shape.
 *
 * The proportion survives the swap because the columns are scaled to the daily
 * share — see `GoalDays`. A full column is a day's worth, so a week that is
 * short still LOOKS short, which is the job the bar was doing.
 */
export function MoveGoalBar({
  progress,
  /** Today, so the chart can stop at it rather than at the period's end. */
  todayKey,
  /**
   * One row instead of the block — for a page that already has a headline.
   *
   * A goal and a challenge can both be running; they measure different things
   * from the same walk and neither takes from the other. What they cannot both
   * be is the HEADLINE. Two big figures over two charts, with nothing saying
   * which one the page is about, is the whole of that conflict — so where a
   * challenge holds the top, the goal says the same thing in a line and the
   * ranking becomes obvious.
   *
   * The full reading is still one tap away on the goal's own screen.
   */
  compact = false,
  /**
   * The walked figure's type size. A card can ask for something smaller.
   *
   * 46, which is the page's headline weight — the serif pitch this block
   * replaces opens at 34, and this has to hold the same slot without a headline
   * beside it. The unit and the target scale off it, so one number moves the
   * whole header together.
   */
  size = 46
}: {
  progress: MoveGoalProgress;
  todayKey: string;
  compact?: boolean;
  size?: number;
}) {
  const { palette, isDark } = useLumo();
  const accent = useMoveAccent();
  const resetsOn = periodResetsOn(progress.goal.period, progress.days[progress.days.length - 1]?.dateKey ?? "");
  /**
   * The unwalked ground behind the bar — INK, not the accent.
   *
   * A tint of the same green the fill is painted in made the empty half read as
   * walking too, only fainter: two greens on one bar, and the eye has to work
   * out which of them is the figure. Ink has no such claim on it — it is the
   * page's own dark, so the track reads as ground the fill has not reached yet
   * and the only green on the bar is the distance actually covered.
   *
   * `palette.ink` flips with the theme, so this is a dark tint on cream and a
   * light one on navy without a second value to keep in step.
   *
   * Held at about a tenth: enough that the length of the bar is legible as a
   * shape from across a room, light enough that it never competes with the
   * fill. Ink is the strongest colour on the page, and a track much past this
   * stops being ground and starts being a second reading.
   */
  const wash = alpha(palette.ink, isDark ? "1A" : "12");
  /**
   * A period with days in it gets the chart; a daily goal gets the bar.
   *
   * The bar and the columns say the same thing at different resolutions — how
   * much of the target is done — so only one of them is ever drawn. Over a week
   * or a month the columns say it better, because they also say WHICH days did
   * it, and "40 km, mostly on Sunday" is a different week from "40 km, six
   * kilometres a day". A single day has no such shape to show: there is one
   * column, and a column on its own is a bar with extra steps.
   */
  const charted = progress.days.length > 1;

  /**
   * EVERY HOOK IS ABOVE THIS LINE. `useLumo` and `useMoveAccent` are the only
   * two, and both run before this returns — see the note in
   * `app/move/[milestone].tsx` for what happens when that stops being true.
   */
  if (compact) {
    return (
      <MoveProgressRow
        label={periodLabel(progress.goal.period)}
        // Made it, rather than "40 / 40 km" — a row has space for one fact and
        // the target being reached is the better one to spend it on.
        value={
          progress.hit
            ? `${kmValue(progress.walkedM)} km · made it`
            : `${kmValue(progress.walkedM)} / ${kmValue(progress.targetM)} km`
        }
        ratio={progress.ratio}
        accent={accent.glyph}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      {/* Walked and target on one line, sat on the same baseline: the pair is a
          fraction, and stacking them made the target look like a caption on the
          figure rather than the other half of it. */}
      <View style={styles.head}>
        <AppText color={palette.ink} numberOfLines={1} style={[styles.walked, { fontSize: size, lineHeight: Math.round(size * 1.16) }]}>
          {kmValue(progress.walkedM)}
          <AppText color={palette.ink} style={[styles.walkedUnit, { fontSize: Math.round(size * 0.5) }]}>
            {" km"}
          </AppText>
        </AppText>
        <AppText variant="bodySmall" color={palette.muted} numberOfLines={1}>
          of {kmValue(progress.targetM)} km
        </AppText>
      </View>

      {charted ? (
        <GoalDays progress={progress} accent={accent.glyph} todayKey={todayKey} />
      ) : (
        /* Thicker than the bar's default, because on a daily goal this is the
           whole reading rather than a line inside a card. */
        <MoveProgressBar
          ratio={progress.ratio}
          accent={accent.glyph}
          track={wash}
          height={12}
          label={`${kmValue(progress.walkedM)} of ${kmValue(progress.targetM)} km`}
        />
      )}

      {/* One line under the chart, and which sentence it is depends on where the
          period has got to. What is LEFT matters while there is still time to
          walk it; once the target is made, the only thing left to say is when
          the slate is wiped. */}
      {progress.hit ? (
        <View style={[styles.made, { backgroundColor: alpha(palette.greenDark, isDark ? "26" : "14") }]}>
          <Icon name="checkCircle" size={14} color={palette.greenDark} weight="bulk" />
          <AppText variant="caption" color={palette.greenDark} style={styles.madeLabel}>
            {describeGoal(progress.goal)} — made it
          </AppText>
        </View>
      ) : (
        <AppText variant="bodySmall" color={palette.muted} style={styles.caption}>
          {kmValue(progress.remainingM)} km to go {periodLabel(progress.goal.period).toLowerCase()} · {progress.daysLeft}{" "}
          {progress.daysLeft === 1 ? "day" : "days"} left
        </AppText>
      )}

      {progress.hit ? (
        <AppText variant="caption" color={palette.subtle} style={styles.caption}>
          Keep going — {periodLabel(progress.goal.period).toLowerCase()} starts over on {formatShortDate(resetsOn)}
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * How tall a column may stand, and the line its figure sits on.
 *
 * 96 is within a dozen points of the Stats chart's own plot, and the columns
 * earned the room by being the goal block's whole reading rather than a strip
 * under one: at 34 they were a sparkline, where a 2 km day and a 4 km day
 * differed by seventeen points — a difference you have to look for rather than
 * see. Past a hundred or so they start reading as a dashboard panel, and this
 * block is not one.
 */
const PLOT_HEIGHT = 96;
const VALUE_HEIGHT = 13;

/**
 * The period day by day — one column per day, oldest first.
 *
 * ## Why it is scaled to the daily share and not to the best day
 *
 * A chart scaled to its own best day always looks like a good week: walk 300 m
 * a day toward a 40 km week and every column is full height, because the tallest
 * one defines the top. Scaling to whichever is greater of the best day and the
 * DAILY SHARE — the target spread over the days that count — makes a full column
 * mean something: that day was a day's worth. Under-pace days are visibly short,
 * which is the reading somebody opens this for, and it is what lets these
 * columns replace the progress bar rather than sit beside it.
 *
 * ## Every day keeps its place, walked or not
 *
 * A rest day and a day still to come both hold a column's width with nothing
 * drawn in it. A chart that closed the gaps would show a week of solid walking
 * with the quiet days edited out, and the empty ones are half the record — on a
 * Wednesday, the four blanks to the right of today ARE the rest of the week you
 * still have.
 *
 * ## A week and a month are the same chart at two densities
 *
 * A month draws all thirty-one columns. What it drops is the per-column type:
 * thirty-one initials and thirty-one figures across a phone are texture rather
 * than an axis, so the dense version names the two ends underneath instead and
 * lets the shape do the talking. The columns tighten their gap to match, because
 * a 3pt gutter between 7pt columns is more gutter than chart.
 */
function GoalDays({
  progress,
  accent,
  todayKey
}: {
  progress: MoveGoalProgress;
  accent: string;
  todayKey: string;
}) {
  const { palette } = useLumo();
  // Never zero — an untouched period would divide by it, and every column
  // belongs on the floor in that case anyway.
  const ceiling = Math.max(1, progress.dailyShareM, ...progress.days.map((day) => day.metres));
  // Initials and figures stop being legible past a week's worth of columns.
  const labelled = progress.days.length <= 7;
  const first = progress.days[0];
  const last = progress.days[progress.days.length - 1];

  return (
    <View style={styles.chart}>
      <View style={[styles.days, labelled ? null : styles.daysDense]}>
        {progress.days.map((day) => {
          const future = day.dateKey > todayKey;
          const ratio = Math.min(1, day.metres / ceiling);

          return (
            <View key={day.dateKey} style={styles.day}>
              {/* No ground behind the column. The plot keeps its full height so
                  every day is measured against the same ceiling, but an unwalked
                  day is empty space rather than a tinted rail — a row of washed
                  columns reads as seven half-finished bars, where blanks read as
                  what they are. The day's letter underneath is what holds the
                  place.

                  The figure rides on its own bar's shoulder, so a number and the
                  height it describes are one object. It is laid out ABOVE the
                  fill in a column pinned to the floor, rather than positioned
                  over it — which is why the bar is measured in points here and
                  not as a percentage: a percentage would resolve against the
                  headroom too, and the tallest day would push its own label off
                  the top of the chart. */}
              <View style={styles.dayTrack}>
                {labelled && day.metres > 0 ? (
                  <AppText variant="caption" color={palette.body} numberOfLines={1} style={styles.dayValue}>
                    {kmValue(day.metres)}
                  </AppText>
                ) : null}

                {day.metres > 0 ? (
                  <View
                    accessible
                    accessibilityLabel={`${day.dateKey}, ${kmValue(day.metres)} km`}
                    style={[
                      styles.dayFill,
                      {
                        // A floor on the height, so a 200 m stroll is a mark
                        // rather than a sliver with a number floating off it.
                        height: Math.max(4, Math.round(ratio * PLOT_HEIGHT)),
                        backgroundColor: accent
                      }
                    ]}
                  />
                ) : null}
              </View>

              {labelled ? (
                <AppText
                  variant="caption"
                  // Today named in ink among muted neighbours: it is the column
                  // that can still change, and the only one worth finding fast.
                  color={day.dateKey === todayKey ? palette.ink : future ? palette.muted : palette.subtle}
                  numberOfLines={1}
                  style={styles.dayLabel}
                >
                  {dayInitials[parseDateKey(day.dateKey).getDay()]}
                </AppText>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* The dense chart's axis: both ends named, nothing between them — the
          same answer `MoveActivityChart` reaches for the same reason. */}
      {labelled ? null : (
        <View style={styles.axis}>
          <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.dayLabel}>
            {formatShortDate(first.dateKey)}
          </AppText>
          <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.dayLabel}>
            {formatShortDate(last.dateKey)}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * The figures sit at the bar's two ends; everything under it is centred.
   *
   * Which is the split that matters: the walked figure and the target are the
   * ends of the fill and belong over them, while the line beneath is about the
   * whole thing and has no end to sit at. Left-aligning it stranded a short
   * sentence against one edge of a full-width bar.
   */
  wrap: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: spacing.xs
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    alignSelf: "stretch",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  walked: {
    fontFamily: fontFamilies.lexendBlack
  },
  // Half the figure, as every other paired readout in Move sets it.
  walkedUnit: {
    fontFamily: fontFamilies.lexendBlack
  },
  caption: {
    alignSelf: "stretch",
    textAlign: "center"
  },
  chart: {
    alignSelf: "stretch"
  },
  days: {
    flexDirection: "row",
    alignItems: "flex-end",
    alignSelf: "stretch",
    gap: 3
  },
  // A month's columns are about 7pt wide, where a 3pt gutter is nearly half as
  // wide again as the bar it separates.
  daysDense: {
    gap: 1.5
  },
  day: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xxs
  },
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.xxs
  },
  // Small, and a hair tighter than the caption default: it is a figure ON the
  // chart rather than a line of text under it. `VALUE_HEIGHT` is this, and the
  // two have to move together or a full-height bar clips its own number.
  dayValue: {
    fontSize: 10,
    lineHeight: VALUE_HEIGHT,
    textAlign: "center"
  },
  dayLabel: {
    fontSize: 11,
    lineHeight: 15
  },
  /**
   * The plot, plus the room a figure needs to sit on top of a full-height bar.
   *
   * Pinned to the floor, so a bar grows upward and its label rides up with it.
   * Nothing is clipped: the headroom is part of the box rather than something
   * the number overflows into, which is what keeps the tallest day's figure on
   * screen on Android as well as iOS.
   */
  dayTrack: {
    alignSelf: "stretch",
    height: PLOT_HEIGHT + VALUE_HEIGHT,
    justifyContent: "flex-end"
  },
  dayFill: {
    width: "100%",
    borderRadius: 4
  },
  made: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill
  },
  madeLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  }
});
