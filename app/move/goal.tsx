import { useRouter } from "expo-router";
import React from "react";
import { Alert, StyleSheet, View } from "react-native";
import { DistanceSlider } from "@/components/move/DistanceSlider";
import { MoveOptionGroup, MoveOptionRow } from "@/components/move/MoveOptionRow";
import { useMoveAccent } from "@/components/move/ChallengeUI";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Button, Screen } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { formatShortDate } from "@/lib/date";
import {
  DEFAULT_GOAL_TARGET,
  GOAL_PERIODS,
  GOAL_RANGE,
  clampToRange,
  describeGoal,
  periodLabel,
  periodResetsOn,
  type MoveGoalPeriod
} from "@/lib/move/goal";

/**
 * Setting, changing and ending a personal distance goal.
 *
 * ## Why this is a page and not a sheet
 *
 * It asks two questions — how often, and how far — and the second one's answers
 * depend on the first: 5 km is a fair day and a poor month. A sheet that
 * reshuffles its own options as you tap is a sheet you cannot read ahead of, so
 * the two questions get a page with room to be laid out one under the other.
 *
 * It is also where a goal is ENDED, which is the one thing about a goal that has
 * no other home — see `lib/move/goal.ts` for why nothing else ever ends one.
 *
 * ## What it does not do
 *
 * It does not start a walk. Setting a goal and going out are different
 * decisions, and a page that did both would make the goal feel like something
 * you can only have while walking. The route row on the start screen points
 * here; this points back.
 */
export default function MoveGoalScreen() {
  const router = useRouter();
  const { palette } = useLumo();
  const accent = useMoveAccent();
  const move = useMove();

  const existing = move.goal;
  /**
   * The two answers, seeded from the goal in force.
   *
   * Editing an existing goal opens on ITS numbers rather than the defaults —
   * someone coming here to nudge 40 km up to 45 should not have to find their
   * way back to where they already were.
   */
  const [period, setPeriod] = React.useState<MoveGoalPeriod>(existing?.period ?? "weekly");
  const [targetM, setTargetM] = React.useState<number>(existing?.targetM ?? DEFAULT_GOAL_TARGET.weekly);
  /**
   * Whether the distance was chosen for THIS period, or is left over from the
   * one before it.
   *
   * Switching daily → monthly with 5 km still on the slider would leave someone
   * with a month's target they could miss by strolling. So a period change
   * re-seeds the distance to that period's default, unless the reader has
   * already moved the handle since arriving — in which case they mean it, and it
   * is only clamped into the new range.
   */
  const [targetTouched, setTargetTouched] = React.useState(false);
  /**
   * True while the slider's handle is held.
   *
   * The page stops scrolling for the duration — a horizontal drag on a control
   * inside a scroller otherwise turns into a page scroll the moment the finger
   * wanders off the horizontal, and the number jumps back. The same arrangement
   * the Focus screen has with its dial.
   */
  const [dragging, setDragging] = React.useState(false);

  function choosePeriod(next: MoveGoalPeriod) {
    setPeriod(next);
    /**
     * Untouched, the distance follows the period. Touched, it is kept — but
     * still CLAMPED, because the ranges do not overlap end to end: 250 km is a
     * fine week and off the top of the daily scale, and a slider whose handle
     * sat past its own maximum would be showing a number it could not return to.
     */
    setTargetM((current) => (targetTouched ? clampToRange(current, next) : DEFAULT_GOAL_TARGET[next]));
  }

  function chooseTarget(km: number) {
    setTargetTouched(true);
    setTargetM(km * 1000);
  }

  const range = GOAL_RANGE[period];
  const draft = { targetM, period, startedAt: new Date().toISOString(), hitPeriods: [] };
  const resetsOn = periodResetsOn(period, move.todayKey);
  const unchanged = existing?.period === period && existing?.targetM === targetM;

  function save() {
    move.setGoal({ targetM, period });
    router.back();
  }

  /**
   * Ending it, behind a confirmation.
   *
   * A goal is the only thing in Move that cannot be got back: its record of hit
   * periods goes with it, and setting the same numbers again starts a fresh run
   * (see `setGoal`). That is worth one tap of friction.
   */
  function end() {
    Alert.alert(
      "End this goal?",
      `${describeGoal(existing ?? draft)} stops being tracked. Your walks and your total are untouched — only the goal goes.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "End goal",
          style: "destructive",
          onPress: () => {
            move.clearGoal();
            router.back();
          }
        }
      ]
    );
  }

  return (
    <Screen contentStyle={styles.content} scrollEnabled={!dragging}>
      <ScreenHeader
        title={existing ? "Your goal" : "Set a goal"}
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
      />

      {/* The goal as one sentence, above the controls that build it. It changes
          as they are tapped, so the page always shows the thing being decided
          rather than only the parts of it. */}
      <View style={styles.hero}>
        <AppText color={palette.ink} style={styles.heroValue} numberOfLines={1}>
          {Number((targetM / 1000).toFixed(1))}
          <AppText color={palette.ink} style={styles.heroUnit}> km</AppText>
        </AppText>
        <AppText variant="bodySmall" color={palette.body} style={styles.heroCaption}>
          {GOAL_PERIODS.find((entry) => entry.value === period)?.every}, starting over on {formatShortDate(resetsOn)}
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
          How often
        </AppText>

        <MoveOptionGroup>
          {GOAL_PERIODS.map((entry, index) => (
            <MoveOptionRow
              key={entry.value}
              icon={entry.value === "daily" ? "walk" : entry.value === "weekly" ? "calendar" : "target"}
              title={entry.label}
              subtitle={
                entry.value === "daily"
                  ? "A fresh target every morning."
                  : entry.value === "weekly"
                    ? "Monday to Sunday. The week is yours to plan."
                    : "The whole calendar month to make it."
              }
              selected={period === entry.value}
              onPress={() => choosePeriod(entry.value)}
              last={index === GOAL_PERIODS.length - 1}
            />
          ))}
        </MoveOptionGroup>
      </View>

      <View style={styles.section}>
        <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
          How far, {periodLabel(period).toLowerCase()}
        </AppText>

        {/* A slider, and whole kilometres only. The reader is choosing an
            intention rather than calibrating an instrument, so the scale steps in
            round numbers — and the figure it is setting is already shown, large,
            at the top of the page, which is what lets the control itself stay
            this quiet. Its range follows the period; see `GOAL_RANGE`. */}
        <DistanceSlider
          value={Math.round(targetM / 1000)}
          onChange={chooseTarget}
          min={Math.round(range.min / 1000)}
          max={Math.round(range.max / 1000)}
          accent={accent.glyph}
          onDragChange={setDragging}
          label={`How far, ${GOAL_PERIODS.find((entry) => entry.value === period)?.every}`}
        />

        {/* The rule, said once, where it is decided rather than after the fact. */}
        <AppText variant="caption" color={palette.subtle} style={styles.note}>
          Reaching it does not end it — the figure keeps climbing, and {periodLabel(period).toLowerCase()} starts over on{" "}
          {formatShortDate(resetsOn)}. The goal runs until you end it here.
        </AppText>
      </View>

      <View style={styles.actions}>
        <Button
          label={existing ? (unchanged ? "Keep this goal" : "Update goal") : "Set this goal"}
          icon="target"
          onPress={unchanged ? () => router.back() : save}
        />

        {existing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="End this goal"
            onPress={end}
            style={({ pressed }) => [styles.end, { opacity: pressed ? 0.7 : 1 }]}
          >
            <AppText variant="bodySmall" color={palette.danger} style={styles.endLabel}>
              End this goal
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg
  },
  /**
   * The figure being set, on the page rather than in a tinted block.
   *
   * It had a wash behind it, which made it read as a CARD — one more panel in a
   * page of panels, and the same weight as the two lists of controls below it.
   * It is not a panel; it is the answer the controls are building, and standing
   * it on bare canvas is what tells the two apart.
   *
   * Only the vertical inset is left, and less of it than a card needed: the air
   * is now doing the whole job of separating the figure from the header above
   * and the first section below.
   */
  hero: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingVertical: spacing.sm
  },
  heroValue: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 46,
    lineHeight: 54
  },
  // Half the figure, as everywhere else in Move the two sit together.
  heroUnit: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 23
  },
  heroCaption: {
    textAlign: "center"
  },
  section: {
    gap: spacing.sm
  },
  sectionTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  note: {
    lineHeight: 18
  },
  actions: {
    gap: spacing.sm
  },
  end: {
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  endLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  }
});
