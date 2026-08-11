import React from "react";
import { StyleSheet, View } from "react-native";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { toDateKey, weekRangeMonday } from "@/lib/date";
import { currentActivityStreak, dayCompletionState, type DayCompletionState } from "@/lib/habitMath";
import { Habit } from "@/types/habit";
import { FireIcon, FIRE_COLOR } from "./FireIcon";
import { Icon } from "./Icon";
import { AppText } from "./ui";

/** Monday-first initials, to match the strip's Monday-first week. */
const WEEK_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/**
 * Deliberately well short of the ~24pt each day cell gets once the gutter, the
 * card padding and the divider are taken out of a 390pt phone. The letters
 * above the dots carry the week; the dots only have to say done or not, and at
 * anything near the full cell width they crowd into each other.
 */
const DOT_SIZE = 18;

/**
 * Lumo's voice under the number, once there is something to remark on.
 *
 * Silent below three days — including at zero. A run that short is already
 * plain from the number itself, and a line of praise for having shown up twice
 * reads as hollow. Nothing here nags an empty streak either: the rest of the
 * screen is one long invitation to tick something off, and the card's job is
 * to report, not to prompt.
 */
function streakLine(streak: number) {
  if (streak >= 30) {
    return "Unstoppable! 🔥";
  }
  if (streak >= 7) {
    return "You're on fire! 🔥";
  }
  // Nothing at three. The number has just become worth remarking on, and
  // "Building momentum!" was the app saying so on its own behalf — the first
  // line worth reading is the one at a week.
  return "";
}

/** One day in the week strip: its initial above a state dot. */
function WeekDot({
  initial,
  state,
  isFuture,
  isSelected
}: {
  initial: string;
  state: DayCompletionState;
  isFuture: boolean;
  isSelected: boolean;
}) {
  const { palette } = useLumo();
  const complete = state === "complete";
  const partial = state === "partial";

  return (
    <View style={styles.weekDay}>
      {/* A completed day's letter goes bold and full-ink — the strip then reads
          at a glance from the labels alone, not only from the dots under them. */}
      <AppText
        variant="caption"
        color={complete ? palette.ink : isFuture ? alpha(palette.muted, "99") : palette.subtle}
        style={[styles.weekInitial, complete ? styles.weekInitialDone : null]}
      >
        {initial}
      </AppText>
      <View
        style={[
          styles.dot,
          {
            // An empty day is a light well rather than a hole in the card —
            // with only an outline the row read as seven gaps.
            backgroundColor: complete ? palette.glow : partial ? alpha(palette.glow, "3D") : palette.surface,
            // The selected day gets a heavier edge so the strip says which day
            // the rest of the screen is describing.
            borderColor: complete ? palette.glow : isSelected ? palette.hairlineStrong : palette.hairline,
            borderWidth: isSelected && !complete ? 2 : StyleSheet.hairlineWidth,
            opacity: isFuture ? 0.5 : 1
          }
        ]}
      >
        {/* `onAccent` — the deep ink the system already uses for content on a
            gold fill. A white check on this gold only reaches ~1.9:1. */}
        {complete ? <Icon name="check" size={11} color={palette.onAccent} weight="bold" /> : null}
      </View>
    </View>
  );
}

/**
 * The home screen's streak panel: the running count with its encouragement,
 * then the selected day's week.
 *
 * Two columns on one row, and a tight fit: seven day cells and the streak
 * column have to share a 390pt phone once the screen gutter, the card's own
 * padding and the divider are taken out. That is why the type in here runs a
 * step smaller than the app's usual steps and the leading is pulled in close —
 * slack in either one pushes the week strip narrower than its dots.
 *
 * Streaks here are ACTIVITY streaks — days you checked something in — not any
 * single habit's run, so adding a new habit never resets the number.
 */
export function StreakCard({ habits, dateKey }: { habits: Habit[]; dateKey: string }) {
  const { palette, isDark } = useLumo();
  const todayKey = toDateKey();
  const streak = React.useMemo(() => currentActivityStreak(habits, todayKey), [habits, todayKey]);
  const message = streakLine(streak);
  const week = React.useMemo(() => weekRangeMonday(dateKey), [dateKey]);
  const weekStates = React.useMemo(() => week.map((dayKey) => dayCompletionState(habits, dayKey)), [habits, week]);

  return (
    <View style={[styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      <View style={styles.streakSide}>
        <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.eyebrow}>
          CURRENT STREAK
        </AppText>
        {/* Two nested rows, not one.
            The number and its unit want to sit on a shared baseline, but the
            flame is an SVG in a plain View and Yoga hands such a view a
            "baseline" of its own bottom edge. In one flat baseline row that
            makes the flame the tallest thing above the baseline, so the text
            gets pushed down to meet it and the row grows a band of empty box
            underneath. Keeping the flame in a centre-aligned OUTER row leaves
            the baseline arithmetic to the two pieces of text that can actually
            take part in it. */}
        <View style={styles.streakValueRow}>
          <View style={styles.flame}>
            <FireIcon size={26} />
          </View>
          <View style={styles.streakValueText}>
            <AppText color={palette.ink} style={styles.streakValue}>
              {streak}
            </AppText>
            <AppText variant="bodySmall" color={palette.subtle} style={styles.streakUnit}>
              {streak === 1 ? "day" : "days"}
            </AppText>
          </View>
        </View>
        {message ? (
          <AppText variant="caption" color={streak >= 3 ? FIRE_COLOR : palette.subtle} numberOfLines={2} style={styles.streakLine}>
            {message}
          </AppText>
        ) : null}
      </View>

      <View style={[styles.divider, { backgroundColor: palette.hairline }]} />

      <View style={styles.weekRow}>
        {week.map((dayKey, index) => (
          <WeekDot
            key={dayKey}
            initial={WEEK_INITIALS[index]}
            state={weekStates[index]}
            isFuture={dayKey > todayKey}
            isSelected={dayKey === dateKey}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Two columns, one row: the count on the left, the week on the right.
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    // An even gutter all round. The vertical padding was cut back for a while
    // because the streak number's line box was padding the card's foot on its
    // own; with that leading pulled in tight (see `streakValue`) the card's
    // real padding carries the space instead.
    paddingVertical: spacing.ml,
    paddingHorizontal: spacing.ml,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  /**
   * A share of the card rather than its natural width: the encouragement line
   * is the widest thing in here and its length swings with the streak, so left
   * to itself this column would resize the week strip beside it every time the
   * message changed. 36% is the balance struck against the week strip beside
   * it, which needs the rest: enough for the eyebrow's fourteen capitals and
   * for flame-plus-two-digits on one line, with a three-digit streak wrapping
   * its "days" underneath.
   */
  streakSide: {
    width: "36%",
    gap: 1
  },
  // 9/0.5 rather than 10/0.7: "CURRENT STREAK" is fourteen tracked capitals and
  // at the larger step it ran past its column and truncated mid-word.
  eyebrow: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.5
  },
  // Dropped clear of the eyebrow above it. The label and the count are two
  // separate things to read, and set solid they came across as one wrapped
  // line — the tighter type in this card made that worse, not better.
  // Centre-aligned, so the flame's height is all this row asks of it — see the
  // note at the call site for why it cannot sit in a baseline row.
  streakValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    marginTop: spacing.xs
  },
  /**
   * Optical nudge upward. Centring the flame against the digits' LINE BOX
   * leaves it sitting a touch low against the digits themselves, whose glyphs
   * do not fill that box. `top` on a relatively positioned view shifts it
   * without moving anything beside it — so this stays a purely visual tweak
   * and the row's height is still the flame's own.
   */
  flame: {
    top: -2
  },
  // The baseline pairing lives here, between the two pieces of text that have
  // real baselines. Wrapping puts "days" on its own line when a three-digit
  // streak leaves no room for it beside the flame.
  streakValueText: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: spacing.xxs
  },
  /**
   * Line height set BELOW the font size, which is only safe because of what is
   * in here: digits and nothing else. A font reserves room under every line for
   * descenders — the tails on g, p, y — and numerals have none, so that room is
   * pure empty box hanging under the streak count. Left at the type's natural
   * leading it put a visible blank strip between the number and the foot of the
   * card, and the whole streak column read as sitting high.
   */
  streakValue: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 28,
    lineHeight: 26
  },
  streakUnit: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 13,
    lineHeight: 18
  },
  streakLine: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 11,
    lineHeight: 14
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch"
  },
  /**
   * The inset is what keeps Monday off the divider.
   *
   * Sunday's breathing room on the other end comes from the card's own
   * horizontal padding. This sits a little under that — the strip needs the
   * width more than it needs a measured match, and a hard vertical line reads
   * as a tighter edge than a rounded card corner does anyway.
   */
  weekRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    paddingLeft: spacing.sm
  },
  // Each day takes an equal share of whatever the week column is given, with
  // the dot centred inside it. Sizing the cells off the dots instead would
  // overflow the column on a narrow phone rather than just tightening up.
  //
  // The letter sits close over its dot: the two are one mark to read, and the
  // slack between them was what made the strip look shorter than it needed to
  // be against the streak column beside it.
  weekDay: {
    flex: 1,
    alignItems: "center",
    gap: 2
  },
  // Leading set to the glyphs themselves — the line box's own padding was
  // adding a couple of points above and below every letter in the row.
  weekInitial: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 12,
    lineHeight: 13
  },
  weekInitialDone: {
    fontFamily: fontFamilies.lexendBold
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
});
