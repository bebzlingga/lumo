import React from "react";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { SegmentedRing } from "@/components/QuickDoneWidgets";
import { chartTrackColor } from "@/components/StatisticsViews";
import { AppText } from "@/components/ui";
import { fontFamilies, habitAccent, habitColorOption, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { defaultAvatar } from "@/lib/avatar";
import { alpha, readableOn } from "@/lib/color";
import { parseDateKey } from "@/lib/date";
import type { Group, GroupMember } from "@/lib/friends";

// The expanded per-member grid shows the most recent slice of the (longer)
// gridDays window; the collapsed strip shows the whole window.
const PER_USER_DAYS = 14;
// One day in the expanded grid. Fixed rather than flexed to the column width,
// and close to the collapsed strip's 10pt box so the two views of the same
// history read as the same kind of mark.
const GRID_DOT_SIZE = 12;

// Day-of-month label for the history grid columns (14 columns leave no room
// for a month name).
function gridDayLabel(dateKey: string) {
  return String(parseDateKey(dateKey).getDate());
}

/**
 * 14-day per-member history for one activity: small colour-only squares (no
 * icons) so the whole window fits the card without scrolling.
 */
function HistoryGrid({
  habit,
  members,
  gridDays
}: {
  habit: Group["habits"][number];
  members: GroupMember[];
  gridDays: string[];
}) {
  const { palette, isDark } = useLumo();
  const accent = habitAccent(habit.color, isDark) ?? palette.greenDark;
  // Same empty as the collapsed strip and the share bar's track — see `emptyCell`
  // on the row itself.
  const emptyCell = chartTrackColor(palette, isDark);
  const offset = Math.max(0, gridDays.length - PER_USER_DAYS);
  const days = gridDays.slice(offset);

  return (
    <View style={styles.grid}>
      <View style={styles.weekHeader}>
        <View style={styles.weekAvatarSpacer} />
        {days.map((day) => (
          <AppText key={day} variant="caption" color={palette.muted} style={styles.weekDayLabel}>
            {gridDayLabel(day)}
          </AppText>
        ))}
      </View>
      {members.map((member) => {
        const history = member.historyByHabit?.[habit.id] ?? [];

        return (
          <View key={member.profile.lumoId} style={styles.weekRow}>
            <View style={styles.weekAvatar}>
              <Avatar config={member.profile.avatar ?? defaultAvatar()} size={30} />
            </View>
            {days.map((day, index) => {
              const status = history[offset + index] ?? "none";
              const background = status === "done" ? accent : status === "partial" ? alpha(accent, "66") : emptyCell;

              // The cell flexes so it stays under its day label; the dot inside
              // is a fixed square centred in it. Flexing the dot itself sized
              // it to whatever the column happened to be — around 17pt, which
              // made the grid read as a block of colour rather than a reading.
              return (
                <View key={day} style={styles.weekDotCell}>
                  <View style={[styles.weekDot, { backgroundColor: background }]} />
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/**
 * The row's check target — both states, one circle. The home quick-done rows'
 * check, scaled down for this denser row: empty and tinted to the habit while
 * pending, filled with the habit's colour carrying a knocked-out tick once done.
 *
 * ONE View for both, which is what keeps the two states the same size. Done
 * used to draw a `checkCircle` glyph instead: nominally the same size, but an
 * icon's disc is inset inside its own box, so it came out visibly smaller than
 * the ring it replaced and the slot appeared to shrink on check-in.
 *
 * Pending replaces a "TO DO" pill — a word, in the slot where every other list
 * in the app puts a circle you tick.
 */
function ActivityCheck({
  name,
  done,
  fill,
  glyph,
  border,
  onCheckIn,
  onUndo
}: {
  name: string;
  done: boolean;
  fill: string;
  glyph: string;
  border: string;
  onCheckIn: () => void;
  onUndo: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: done }}
      accessibilityLabel={done ? `${name} done today` : `Check in ${name}`}
      accessibilityHint={done ? "Press and hold to undo, then confirm" : undefined}
      onPress={done ? undefined : onCheckIn}
      onLongPress={done ? onUndo : undefined}
      // The circle is the whole target here, where on home the row is — 18pt on
      // its own is well under the 44pt minimum, so the slop makes up the rest.
      hitSlop={14}
      style={({ pressed }) => [
        styles.checkCircle,
        {
          backgroundColor: done ? fill : "transparent",
          borderColor: done ? fill : border,
          opacity: pressed ? 0.7 : 1
        }
      ]}
    >
      {/* 10, down with the circle: 1.5pt of border each side leaves 15 inside
          an 18pt ring, and home's 12 filled that corner to corner. */}
      {done ? <Icon name="check" size={10} color={glyph} weight="bold" /> : null}
    </Pressable>
  );
}

/**
 * One activity row in the group's Habits tab. Tapping checks in (or adds a rep);
 * a long press on the check-in control undoes, and the dialog it raises (onUndo)
 * is what confirms it.
 *
 * A plain long press, not the 1.5s hold with a ring filling around the icon this
 * row used to use: the hold made the gesture its own confirmation on top of the
 * dialog, and holding still for a second and a half inside a scroll view is easy
 * to lose to a stray finger.
 *
 * Wears HabitCard's icon tile: a soft tint carrying a saturated glyph rather
 * than a solid fill with a knocked-out white one.
 */
export function GroupActivityRow({
  habit,
  me,
  members,
  memberCount,
  gridDays,
  onCheckIn,
  onIncrement,
  onUndo
}: {
  habit: Group["habits"][number];
  me: GroupMember | undefined;
  members: GroupMember[];
  memberCount: number;
  gridDays: string[];
  onCheckIn: () => void;
  onIncrement: () => void;
  onUndo: () => void;
}) {
  const { palette, isDark } = useLumo();
  const [expanded, setExpanded] = React.useState(false);
  const colorOption = habitColorOption(habit.color);
  const accentColor = habitAccent(habit.color, isDark) ?? palette.greenDark;
  const iconBg = colorOption ? alpha(colorOption.color, "24") : palette.greenSoft;
  const iconColor = colorOption ? readableOn(colorOption.color, palette.card) : palette.greenDark;
  // The check's three colours, derived the way home derives them: the habit's
  // own hue as the fill, its paired `onColor` for the tick so it stays legible
  // on the pale swatches too, and a soft wash of the accent for the empty ring.
  const checkFill = colorOption ? colorOption.color : palette.greenDark;
  const checkGlyph = colorOption ? colorOption.onColor : palette.white;
  const checkEmptyBorder = alpha(accentColor, "4D");
  /**
   * The unfilled state for every meter on the row: the share bar's track and
   * the day boxes, both here and in the expanded per-member grid.
   *
   * One value, because they mean one thing — nothing recorded. The boxes used
   * to draw `greenSoft` at 24%, a pale sage that all but vanished on the card,
   * while the bar drew the sand wash; side by side, a row with no activity read
   * as a bar with an empty track above a strip of nothing at all.
   */
  const emptyCell = chartTrackColor(palette, isDark);

  const count = me?.todayCountByHabit?.[habit.id] ?? 0;
  const done = me ? me.completedTodayHabitIds.includes(habit.id) : false;
  const canUndo = count > 0;
  const doneToday = members.filter((member) => member.completedTodayHabitIds.includes(habit.id)).length;
  // The group's share of today, drawn under the row as a single bar — the same
  // "N of M" the caption states, in a form you can read without counting.
  const share = memberCount > 0 ? doneToday / memberCount : 0;

  function handleUndo() {
    if (!canUndo) {
      return;
    }
    onUndo();
  }

  return (
    <View style={styles.row}>
      <View style={styles.headerRow}>
        {/* Tap the icon to reveal the per-member breakdown. */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${habit.name} — tap to ${expanded ? "hide" : "show"} each member`}
          onPress={() => setExpanded((value) => !value)}
          style={({ pressed }) => [styles.iconBubble, { backgroundColor: iconBg, opacity: pressed ? 0.8 : 1 }]}
        >
          <Icon name={habit.icon} size={21} color={iconColor} weight="bulk" />
        </Pressable>

        <View style={styles.text}>
          <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.name}>
            {habit.name}
          </AppText>
          {/* Today's share as a bar under the name, where the "N of M done
              today" caption used to be. The two said the same thing, and the
              bar says it without counting — but the sentence is what a screen
              reader needs, so it moves onto the bar as its label. */}
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${doneToday} of ${memberCount} done today`}
            accessibilityValue={{ min: 0, max: memberCount, now: doneToday }}
            // The wash Profile's charts and the Stats tab's own bars use, not
            // `chartTrack` at full strength — the warm sand at 100% reads as a
            // second filled bar sitting behind a short one, so a group barely
            // started looked further along than it is.
            style={[styles.track, { backgroundColor: emptyCell }]}
          >
            <View style={[styles.trackFill, { width: `${Math.round(share * 100)}%`, backgroundColor: accentColor }]} />
          </View>
        </View>

        {me ? (
          <View style={styles.action}>
            {/* The habit's own colours throughout, never a fixed green: every
                other mark on the row — the icon glyph, its tint, the share bar,
                the day boxes — is drawn in the habit's colour, and a green tick
                among them read as a different kind of state. */}
            {done ? (
              <ActivityCheck
                name={habit.name}
                done
                fill={checkFill}
                glyph={checkGlyph}
                border={checkEmptyBorder}
                onCheckIn={onCheckIn}
                onUndo={handleUndo}
              />
            ) : habit.goal.type === "multiple" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Check in ${habit.name}, ${count} of ${habit.goal.count} today`}
                accessibilityHint={canUndo ? "Press and hold to undo one, then confirm" : undefined}
                onPress={onIncrement}
                onLongPress={handleUndo}
                // No wrapper box: the ring drew centred inside a 46pt square,
                // which held it 8pt in from the card's edge while the check
                // circle on every other row sat flush. The slop replaces the
                // touch area that box was providing.
                hitSlop={14}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <SegmentedRing total={habit.goal.count} filled={Math.min(count, habit.goal.count)} fillColor={accentColor} />
              </Pressable>
            ) : (
              <ActivityCheck
                name={habit.name}
                done={false}
                fill={checkFill}
                glyph={checkGlyph}
                border={checkEmptyBorder}
                onCheckIn={onCheckIn}
                onUndo={handleUndo}
              />
            )}
          </View>
        ) : null}
      </View>

      {/* The bar above answers "where is the group right now"; this strip of
          day boxes answers "has it been keeping this up". */}
      {expanded ? (
        <View style={[styles.expand, { borderTopColor: palette.hairline }]}>
          <HistoryGrid habit={habit} members={members} gridDays={gridDays} />
        </View>
      ) : (
        <View style={styles.boxes}>
          {gridDays.map((day, dayIndex) => {
            let doneCount = 0;
            let partialCount = 0;
            for (const member of members) {
              const status = member.historyByHabit?.[habit.id]?.[dayIndex];
              if (status === "done") {
                doneCount += 1;
              } else if (status === "partial") {
                partialCount += 1;
              }
            }
            const intensity = memberCount > 0 ? Math.min(1, (doneCount + partialCount * 0.5) / memberCount) : 0;
            const background =
              intensity > 0
                ? alpha(accentColor, Math.round((0.28 + 0.72 * intensity) * 255).toString(16).padStart(2, "0").toUpperCase())
                : emptyCell;

            return <View key={day} style={[styles.box, { backgroundColor: background }]} />;
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * The contents of one activity's card — the card itself is the caller's, and
   * so are the fill, radius, shadow and inset.
   *
   * No padding of its own, therefore, and no divider: this was a row in a
   * shared list once, and it carried both. Kept, the vertical padding would be
   * counted twice against the card's own.
   */
  row: {
    gap: spacing.xs
  },
  // 3-column header mirroring the home to-do rows: icon · text · status.
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  // HabitCard's tile at the group page's size: a 40pt rounded square, tinted,
  // carrying a saturated glyph. 40 rather than the card's 44 — it is the number
  // the challenges list and the Stats tab's week rows already use, so the three
  // icon bubbles a group shows all match. The glyph keeps its 21.
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center"
  },
  // Was two lines of text at a 1pt gap — tight leading, because that is what a
  // name over its own caption wants. The caption is a bar now, so it takes the
  // clearance a graphic does: text sits on its line's baseline, and a rule set
  // as close as a second line of type crowds the descenders above it.
  text: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs
  },
  name: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  action: {
    minWidth: 56,
    alignItems: "flex-end",
    justifyContent: "center"
  },
  // The home quick-done rows' check at the group row's size — 18pt rather than
  // home's 22, since this row is denser: a name, a share bar and a strip of day
  // boxes where home carries a name and a subtitle. Both states render THIS —
  // only the fill and border colour change — so the circle is the same size
  // ticked as unticked and the slot never resizes.
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center"
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden"
  },
  trackFill: {
    height: "100%",
    borderRadius: radius.pill
  },
  // Stands off the header above it by more than the row's own gap. The strip is
  // a different register from the name and its bar — a history rather than
  // today — and at the shared 8pt it read as a third line of the header block.
  boxes: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xxs
  },
  box: {
    width: 10,
    height: 10,
    borderRadius: 3
  },
  // The rule gets room on both sides: the row's 8pt gap plus this margin above
  // it, and a matching 12 below before the grid starts. Held to the bare gap it
  // sat right under the share bar, reading as that bar's baseline rather than
  // as the line separating today from the fortnight behind it.
  expand: {
    marginTop: spacing.xxs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  // Compact 14-day grid: small colour squares in flexed columns, no icons, fits
  // the card without scrolling.
  grid: {
    marginTop: spacing.xxs
  },
  weekHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  weekAvatarSpacer: {
    width: 30,
    marginRight: spacing.xs
  },
  weekDayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 8,
    lineHeight: 12
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5
  },
  weekAvatar: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: spacing.xs
  },
  weekDotCell: {
    flex: 1,
    alignItems: "center"
  },
  // A rounded square, not a disc. The radius has to be read against the size:
  // `radius.sm` is 6, which was a soft corner on the ~17pt square these used to
  // flex to and is exactly half of the fixed 12 they are now — a full circle.
  // 4 on 12 is the proportion the collapsed strip's box keeps at 3 on 10.
  weekDot: {
    width: GRID_DOT_SIZE,
    height: GRID_DOT_SIZE,
    borderRadius: radius.xs
  }
});
