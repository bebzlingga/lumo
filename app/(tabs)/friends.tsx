import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native"
/**
 * Aliased, because this file already has React Native's own `Animated` — the
 * hold-to-undo ring and the backdrop's scroll fade both run on it, and neither
 * has any reason to move. Reanimated is here for ONE thing: the layout
 * animations, which RN's Animated has no equivalent for.
 */
import Reanimated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GroupBackdrop, useGroupBackdropSubjectBottom } from "@/components/GroupBackdrop";
import { HeaderTabs, type HeaderTabOption } from "@/components/HeaderTabs";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { HoldProgressRing } from "@/components/HoldProgressRing";
import { HOLD_REVEAL_DELAY_MS, SegmentedRing, UNDO_HOLD_DURATION_MS } from "@/components/QuickDoneWidgets";
import { EmptyState } from "@/components/states";
import { AppText, Card, Screen } from "@/components/ui";
import { control, fontFamilies, habitAccent, habitColorOption, layout, radius, spacing, tileRadius } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { Avatar } from "@/components/Avatar";
import { FireIcon } from "@/components/FireIcon";
import { Skeleton } from "@/components/Skeleton";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { buildGroupAvatarSvg, defaultAvatar, type AvatarConfig } from "@/lib/avatar";
import { alpha } from "@/lib/color";
import { timeAgo, toDateKey } from "@/lib/date";
import {
  friendsService,
  scheduledGroupHabitsOn,
  type FriendInvitation,
  type Friendship,
  type Group,
  type GroupHabit,
  type GroupInvitation
} from "@/lib/friends";
import { formatLumoId } from "@/lib/lumoId";
import { Pressable } from "@/components/Pressable"

/** Masks free typing into the `LUMO-XXXX-XX` ID format: the LUMO- prefix is
 * fixed (it restores itself if deletion reaches into it); the user only types
 * the code, which gets uppercased, filtered to the ID alphabet, and dashed. */
const LUMO_ID_PREFIX = "LUMO-";

/**
 * How much of the backdrop's picnic the first card may sit over, as a fraction
 * of the gap between the page bar and the foot of the scene.
 *
 * 0 clears the scene completely, which starts the card a third of the way down
 * the screen; 1 tucks it straight under the bar and across the three of them.
 * This lands its top edge on the blanket's front corner — the picnic's own
 * foreground, clear of the characters — so the page reads as sitting IN FRONT of
 * the scene rather than beginning after it.
 */
const SCENE_OVERLAP = 0.15;

/**
 * How a finished habit leaves the first card.
 *
 * A row here does not just get a tick — it is removed, and a list that reorders
 * itself the instant you touch it reads as a glitch rather than as progress. So
 * the row fades where it stood, and the rows under it slide up into the gap it
 * leaves.
 *
 * The shift runs a little longer than the fade so the movement is still going
 * when the row has gone; matched exactly, the list snapped shut on an empty space
 * at the end. Both stay under a beat — this happens on every check-in, and an
 * animation you notice twice is one you resent by the tenth time.
 */
const ROW_EXIT_MS = 200;
const LIST_SHIFT_MS = 260;

function maskLumoId(text: string) {
  let value = text.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (value.startsWith("LUMO")) {
    value = value.slice(4);
  }

  value = value.replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, "").slice(0, 6);

  return value.length <= 4 ? `${LUMO_ID_PREFIX}${value}` : `${LUMO_ID_PREFIX}${value.slice(0, 4)}-${value.slice(4)}`;
}

/**
 * TEMPORARY preview override — renders every tab as if the account were brand
 * new, so the three empty states can be looked at without emptying real data.
 *
 * Set back to `false` before shipping: left on, the screen shows nothing the
 * user actually has.
 */
const FORCE_EMPTY_STATE = false;

// Friends is fully built but not launched — flip this off to reveal it.
// Backend is wired (Supabase) — flip back to true to re-hide the tab for launch.
const FRIENDS_COMING_SOON = false;

/**
 * Opens Friends without a subscription, for walking the social routes end to end
 * while testing.
 *
 * **MUST BE FALSE IN EVERY BUILD THAT SHIPS.** Left on, the whole ₱49 tier is
 * free to anyone who opens the tab: this page, the groups behind it, and the Move
 * team routes that check the same entitlement. It is the one flag in the app whose
 * wrong value is a revenue bug rather than a cosmetic one, which is why it says
 * so here rather than in a commit message.
 *
 * Note what it does NOT open: the database holds its own gate. Creating a group,
 * starting a Plus challenge and joining one all check `has_active_subscription()`
 * server-side, so with this on, an unsubscribed test account reaches every screen
 * and is still refused by the writes. Testing the Move invite flow end to end
 * needs a real subscription (or sandbox purchase) on both accounts.
 */
const BYPASS_FRIENDS_PAYWALL = true;

const features: { icon: IconName; title: string; body: string }[] = [
  { icon: "friends", title: "Track together", body: "Follow your friends' progress and stay motivated." },
  { icon: "elementPlus", title: "Groups", body: "Every member's completions add up to one shared goal." },
  { icon: "heart", title: "Cheer each other on", body: "Celebrate streaks and wins as a team." },
  { icon: "trophy", title: "Friendly streaks", body: "Compare streaks and keep each other going." }
];

/**
 * HOME'S SHAPE, WITH ONE SWITCH — what the page is made of, and why.
 *
 * This screen used to be a Habits / Groups / Friends switcher, which put the work
 * you owed your groups today behind the same control as two directories you open
 * once a week. Home solves that by stacking: what you have to DO in the first
 * card, then the things you go and look at below it.
 *
 * So the day's group habits are always the first card, and the switch that
 * remains — up in the page bar, where Move keeps its own — only chooses what the
 * SECOND card lists. Two directories of people, one at a time, under no heading:
 * the pill above is the heading.
 */
type SocialTab = "groups" | "friends";

const SOCIAL_TABS: HeaderTabOption<SocialTab>[] = [
  { value: "groups", label: "Groups" },
  { value: "friends", label: "Friends" }
];

/**
 * One group activity, with the home list's hold-to-undo built in.
 *
 * The gesture split is deliberate and matches home exactly: a TAP only ever
 * adds a check-in, and undoing is long-press only. Making a tap toggle would
 * mean the same gesture that logs a rep can also destroy one, on a row whose
 * state the rest of the group can see.
 *
 * A component rather than a loop body because each row needs its own animated
 * value for the ring; sharing one across the card would fill every ring at
 * once.
 */
function GroupHabitRow({
  habit,
  count,
  done,
  membersDone,
  memberCount,
  divided,
  busy,
  onLog,
  onUndo
}: {
  habit: GroupHabit;
  count: number;
  done: boolean;
  /** How many of the group have finished this one today. */
  membersDone: number;
  memberCount: number;
  divided: boolean;
  busy: boolean;
  onLog: () => void;
  onUndo: () => void;
}) {
  const { palette, isDark } = useLumo();
  const holdProgress = React.useRef(new Animated.Value(0)).current;
  const swatch = habitColorOption(habit.color);
  const accent = habitAccent(habit.color, isDark) ?? palette.greenDark;
  const target = habit.goal.type === "multiple" ? habit.goal.count : 1;
  const canUndo = count > 0 && !busy;

  const startHold = React.useCallback(() => {
    holdProgress.stopAnimation();
    // Held hidden for the reveal delay, then filling over what is left, so it
    // reaches full exactly as the long press fires — and a quick tap never
    // flashes it.
    Animated.timing(holdProgress, {
      toValue: 1,
      delay: HOLD_REVEAL_DELAY_MS,
      duration: UNDO_HOLD_DURATION_MS - HOLD_REVEAL_DELAY_MS,
      easing: Easing.linear,
      useNativeDriver: false
    }).start();
  }, [holdProgress]);

  const endHold = React.useCallback(() => {
    holdProgress.stopAnimation();
    Animated.timing(holdProgress, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [holdProgress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: done, busy }}
      accessibilityLabel={
        done
          ? `${habit.name}. Done. Long press to undo.`
          : target > 1
            ? `${habit.name}. ${count} of ${target} today. Tap to log one.`
            : `${habit.name}. Tap to check in.`
      }
      delayLongPress={UNDO_HOLD_DURATION_MS}
      disabled={busy}
      onPress={() => (done ? undefined : onLog())}
      onLongPress={() => (canUndo ? onUndo() : undefined)}
      onPressIn={() => (canUndo ? startHold() : undefined)}
      onPressOut={endHold}
      // No rule above the first row of a band — its group's name is directly
      // above it, and a rule between the two would cut the name off the list it
      // heads. The rule that matters is the one BETWEEN bands, which the band
      // itself draws.
      style={({ pressed }) => [
        styles.habitRow,
        divided ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha(palette.hairline, "80") } : null,
        { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }
      ]}
    >
      {/* Home's icon treatment, at this list's scale: a rounded tile of the
          habit's colour at a soft tint, carrying a saturated glyph. It was a bare
          glyph on the canvas, which left the left edge of the list unanchored —
          the rows read as text with a mark beside it rather than as the same kind
          of row home's habits are. Rounded square, not a disc, so it reads as a
          tile against the round check target at the other end. */}
      <View style={[styles.habitIcon, { backgroundColor: alpha(accent, isDark ? "2E" : "24") }]}>
        <Icon name={habit.icon} size={17} color={accent} weight="bulk" />
      </View>
      <View style={styles.habitText}>
        <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.habitName}>
          {habit.name}
        </AppText>
        {/* The name, then who else has done it — the second line home gives to
            a habit's own schedule goes to the GROUP here, because that is the
            fact this list exists to carry. A multi-count habit puts its own
            tally in front of it: without that, tapping a row changed a ring and
            nothing else on the screen said why. */}
        <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.habitMeta}>
          {target > 1 ? `${Math.min(count, target)}/${target} today · ` : ""}
          {membersDone} of {memberCount} {memberCount === 1 ? "member" : "members"} completed
        </AppText>
      </View>
      {/* The ring winds around whatever this slot is showing — the check or the
          segmented ring — and sits on the control the hold acts on. */}
      <View style={styles.habitTrailing}>
        {target > 1 && !done ? (
          <SegmentedRing total={target} filled={Math.min(count, target)} fillColor={accent} />
        ) : (
          // The habit's own swatch when done, as on the home list, with the
          // swatch's paired `onColor` for the tick — white on the pale options
          // only reaches about 1.9:1.
          <View
            style={[
              styles.habitCheck,
              {
                backgroundColor: done ? swatch?.color ?? palette.greenDark : "transparent",
                borderColor: done ? swatch?.color ?? palette.greenDark : alpha(accent, "4D")
              }
            ]}
          >
            {done ? <Icon name="check" size={12} color={swatch?.onColor ?? palette.white} weight="bold" /> : null}
          </View>
        )}
        {canUndo ? (
          <HoldProgressRing progress={holdProgress} size={34} stroke={2.5} color={accent} trackColor={alpha(accent, "24")} />
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * One group's OUTSTANDING habits for today, as a band inside the page's first
 * card.
 *
 * A section rather than a card of its own: every group's work for today belongs
 * to one list, and a card per group turned three groups into three panels to
 * scroll past before the page even reached the groups themselves. The group's
 * NAME is what does the grouping, and it is the only part of the band that
 * navigates — the rows below check in where they are.
 *
 * What it lists is decided by the page, not here: `pending` arrives already
 * stripped of anything finished, so the parent can drop a whole band the moment
 * its last habit is ticked and still number the rules correctly.
 */
function GroupHabitsSection({
  group,
  pending,
  doneCount,
  dueCount,
  myLumoId,
  busyHabitId,
  divided,
  onOpen,
  onToggle,
  onUndo
}: {
  group: Group;
  /** Scheduled today and not yet finished — see `todayGroups` on the screen. */
  pending: GroupHabit[];
  doneCount: number;
  dueCount: number;
  myLumoId: string;
  /** Habit currently mid-write, so its row can hold still instead of double-firing. */
  busyHabitId: string | null;
  /** A rule above, for every band but the first under the card's heading. */
  divided: boolean;
  onOpen: () => void;
  onToggle: (habit: GroupHabit) => void;
  onUndo: (habit: GroupHabit) => void;
}) {
  const { palette } = useLumo();
  const [headerPressed, setHeaderPressed] = React.useState(false);
  const avatarSvg = React.useMemo(() => buildGroupAvatarSvg(group.avatarSeed ?? group.id), [group.avatarSeed, group.id]);
  const me = group.members.find((member) => member.profile.lumoId === myLumoId);

  return (
    // The band fades and closes up when its last habit is ticked — see
    // ROW_EXIT/LIST_SHIFT. `layout` on the band is what lets the bands below it
    // slide up into the space rather than jumping.
    <Reanimated.View
      exiting={FadeOut.duration(ROW_EXIT_MS)}
      layout={LinearTransition.duration(LIST_SHIFT_MS)}
      style={[
        styles.habitsGroup,
        divided
          ? [styles.habitsGroupDivided, { borderTopColor: palette.hairline }]
          : null
      ]}
    >
      {/* A quiet label, not a heading: the card above it is already titled, and
          the habit names below are the things to read. So the group's name takes
          the same 12pt semibold `caption` as its own count, both in `subtle` — a
          14pt bold name here was competing with the rows it was introducing. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${group.name}, ${doneCount} of ${dueCount} done today`}
        onPress={onOpen}
        onPressIn={() => setHeaderPressed(true)}
        onPressOut={() => setHeaderPressed(false)}
        style={[styles.habitsHeader, { opacity: headerPressed ? 0.7 : 1 }]}
      >
        <View style={[styles.habitsAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
          <Avatar svg={avatarSvg} size={20} />
        </View>
        <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.habitsGroupName}>
          {group.name}
        </AppText>
        {/* Counts the day, not the rows below it — the finished ones have left
            the list, and without this the band would go quiet about them.

            A step lighter than the name it sits beside: `muted`, the same colour
            the members line under each habit takes. The name is what you scan
            for; the tally is there when you look for it. */}
        <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.habitsCount}>
          {doneCount}/{dueCount} done
        </AppText>
      </Pressable>

      {pending.map((habit, index) => {
        const target = habit.goal.type === "multiple" ? habit.goal.count : 1;
        const count = me?.todayCountByHabit?.[habit.id] ?? 0;

        return (
          // The wrapper carries the animation, not the row: the row's own style is
          // a function of its pressed state (see `GroupHabitRow`), and Reanimated
          // cannot drive layout on a style it does not own. One per habit, keyed on
          // the habit, so a finished one fades where it stood and the rows under it
          // close the gap.
          <Reanimated.View
            key={habit.id}
            exiting={FadeOut.duration(ROW_EXIT_MS)}
            layout={LinearTransition.duration(LIST_SHIFT_MS)}
          >
            <GroupHabitRow
              habit={habit}
              count={count}
              done={false}
              membersDone={group.members.filter((member) => member.completedTodayHabitIds.includes(habit.id)).length}
              memberCount={group.members.length}
              divided={index > 0}
              busy={busyHabitId === habit.id}
              onLog={() => onToggle(habit)}
              onUndo={() => onUndo(habit)}
            />
          </Reanimated.View>
        );
      })}
    </Reanimated.View>
  );
}

/**
 * One group, as a row in the switching card at the foot of the page.
 *
 * It was a card of its own — a header plus a scrolling row of activity chips —
 * which made a column of groups a column of panels, and put the chips' scroller
 * inside a press target that then argued with it over every drag. As a row it
 * matches the friend rows it shares the card with, and the chips are on the
 * group's own page, one tap away, where they are not competing for gestures.
 */
function GroupRow({
  group,
  first,
  last,
  onPress
}: {
  group: Group;
  /** Carries the rule above and the padding at the card's edges — see `listRow`. */
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const { palette } = useLumo();
  const groupAvatarSvg = React.useMemo(() => buildGroupAvatarSvg(group.avatarSeed ?? group.id), [group.avatarSeed, group.id]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open group ${group.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        first ? styles.listRowFirst : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
        last ? styles.listRowLast : null,
        { opacity: pressed ? 0.7 : 1 }
      ]}
    >
      <Avatar svg={groupAvatarSvg} size={42} />
      <View style={styles.friendText}>
        <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.friendName}>
          {group.name}
        </AppText>
        <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.groupMeta}>
          {group.progress} {group.progress === 1 ? "completion" : "completions"} · {group.members.length}{" "}
          {group.members.length === 1 ? "member" : "members"}
        </AppText>
      </View>
      {group.streak >= 3 ? (
        <View style={[styles.groupStreakBadge, { backgroundColor: palette.glowSoft }]}>
          <FireIcon size={12} />
          <AppText variant="caption" color={palette.ink} style={styles.groupStreakText}>
            {group.streak}d
          </AppText>
        </View>
      ) : null}
      <View style={styles.groupAvatars}>
        {group.members.slice(0, 2).map((member, index) => (
          <View key={member.profile.lumoId} style={[styles.groupAvatar, { borderColor: palette.card, marginLeft: index ? -10 : 0 }]}>
            {/* The wrapper stays here, unlike the group's own avatar — its ring
                in the card colour is what separates overlapping faces. */}
            <Avatar config={member.profile.avatar ?? defaultAvatar()} size={24} />
          </View>
        ))}
        {group.members.length > 2 ? (
          <View style={[styles.groupAvatar, { backgroundColor: alpha(palette.greenDark, "14"), borderColor: palette.card, marginLeft: -10 }]}>
            <AppText variant="caption" color={palette.greenDark} style={styles.groupAvatarMore}>
              +{group.members.length - 2}
            </AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function InviteRow({
  title,
  subtitle,
  avatar,
  groupSeed,
  busy,
  first,
  onRespond
}: {
  title: string;
  subtitle: string;
  avatar?: AvatarConfig;
  groupSeed?: string;
  busy: boolean;
  first: boolean;
  onRespond: (accept: boolean) => void;
}) {
  const { palette } = useLumo();
  const groupAvatarSvg = React.useMemo(() => (groupSeed ? buildGroupAvatarSvg(groupSeed) : undefined), [groupSeed]);

  return (
    // Flat, on the sheet's own surface. As a raised card it was `palette.card`
    // sitting on a `palette.card` sheet — the same colour twice over, with only
    // a shadow to tell them apart. Hairlines do that job properly.
    <View style={[styles.inviteRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }]}>
      {groupAvatarSvg ? <Avatar svg={groupAvatarSvg} size={42} /> : <Avatar config={avatar ?? defaultAvatar()} size={42} />}
      <View style={styles.friendText}>
        <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.friendName}>
          {title}
        </AppText>
        <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.inviteSubtitle}>
          {subtitle}
        </AppText>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={palette.greenDark} />
      ) : (
        <View style={styles.inviteActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Decline ${title}`}
            hitSlop={8}
            onPress={() => onRespond(false)}
            style={({ pressed }) => [styles.inviteAction, { backgroundColor: alpha(palette.danger, "12"), opacity: pressed ? 0.7 : 1 }]}
          >
            <Icon name="close" size={15} color={palette.danger} weight="bulk" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Accept ${title}`}
            hitSlop={8}
            onPress={() => onRespond(true)}
            style={({ pressed }) => [styles.inviteAction, { backgroundColor: palette.greenSoft, opacity: pressed ? 0.7 : 1 }]}
          >
            <Icon name="check" size={15} color={palette.greenDark} weight="bold" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * Initial-load placeholder for the switching card's rows.
 *
 * One shape for both lists, because a group row and a friend row ARE the same
 * shape — a 42pt avatar beside two lines, plus something small on the right (the
 * stacked member faces on a group, the remove button on a friend). Bare rows, no
 * card: the card is the page's, and this stands in for its contents.
 *
 * Three rows, and the name widths vary between them. A column of identical bars
 * reads as a rendering artefact; uneven ones read as a list that has not arrived.
 */
function PeopleRowsSkeleton() {
  const { palette } = useLumo();
  const NAME_WIDTHS = [132, 104, 148];

  return (
    <View>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[
            styles.listRow,
            index === 0 ? styles.listRowFirst : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
            index === 2 ? styles.listRowLast : null
          ]}
        >
          <Skeleton tone="light" width={42} height={42} round />
          <View style={styles.friendText}>
            <Skeleton tone="light" width={NAME_WIDTHS[index]} height={14} />
            <Skeleton tone="light" width={88} height={12} style={styles.skeletonMeta} />
          </View>
          <Skeleton tone="light" width={28} height={28} round />
        </View>
      ))}
    </View>
  );
}

/**
 * The first card's placeholder: a group's label, then two habit rows.
 *
 * Built from the same styles the real band uses — `habitsGroup`, `habitsHeader`,
 * `habitRow` — so the blocks land exactly where the content will and the card
 * does not resize when the data arrives. What each block stands in for:
 * the 20pt group avatar and its name, the count on the right, then per row the
 * 34pt icon tile, the habit name, the members line under it, and the check.
 */
function GroupHabitsSkeleton() {
  const { palette } = useLumo();

  return (
    <View style={styles.habitsGroup}>
      <View style={styles.habitsHeader}>
        <Skeleton tone="light" width={20} height={20} round />
        <View style={styles.habitsGroupName}>
          <Skeleton tone="light" width={104} height={12} />
        </View>
        <Skeleton tone="light" width={52} height={12} />
      </View>
      {[0, 1].map((index) => (
        <View
          key={index}
          style={[styles.habitRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha(palette.hairline, "80") }]}
        >
          {/* The tile itself, not a circle inside it — the row's icon is a rounded
              square of the habit's colour, and a small disc in a 34pt slot read as
              a bullet rather than as the tile it is standing in for. */}
          <Skeleton tone="light" width={34} height={34} style={styles.habitIcon} />
          <View style={styles.habitText}>
            <Skeleton tone="light" width={index ? 132 : 168} height={14} />
            <Skeleton tone="light" width={116} height={12} style={styles.skeletonMeta} />
          </View>
          <Skeleton tone="light" width={22} height={22} round />
        </View>
      ))}
    </View>
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const { palette, isDark, isPro, lumoIdSuffix } = useLumo();
  const [inviteVisible, setInviteVisible] = React.useState(false);
  const [invitesVisible, setInvitesVisible] = React.useState(false);
  // Groups first: it is the list you act on, and Friends is where you go to add
  // somebody rather than to check on them.
  const [socialTab, setSocialTab] = React.useState<SocialTab>("groups");
  const [sendPressed, setSendPressed] = React.useState(false);
  const [sendingInvite, setSendingInvite] = React.useState(false);
  const [inviteId, setInviteId] = React.useState(LUMO_ID_PREFIX);
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [friends, setFriends] = React.useState<Friendship[]>([]);
  const [friendInvites, setFriendInvites] = React.useState<FriendInvitation[]>([]);
  const [groupInvites, setGroupInvites] = React.useState<GroupInvitation[]>([]);
  /** Lumo ID or group id currently being accepted/declined, so its row can show
   *  a spinner instead of the buttons. */
  const [respondingTo, setRespondingTo] = React.useState<string | null>(null);
  // First fetch shows skeletons; later focus refreshes update in place.
  const [initialLoading, setInitialLoading] = React.useState(true);
  const syncOffline = friendsService.status() === "offline";
  const myLumoId = formatLumoId(lumoIdSuffix);
  // Yours first, then the ones you were invited into — one list, since who
  // created a group is not how anybody looks for it.
  const allGroups = React.useMemo(
    () => [...groups.filter((group) => group.ownedByMe), ...groups.filter((group) => !group.ownedByMe)],
    [groups]
  );
  /**
   * Today, per group: what was scheduled, what is still outstanding, and how much
   * of it is done.
   *
   * Resolved HERE rather than inside each band, for two reasons. The card's
   * heading counts every group at once, the way home's does. And a finished habit
   * leaves the list — so the page has to know which groups still have something
   * pending before it renders them, or a group that has been fully cleared would
   * take a divider with it and leave a rule hanging under the heading.
   *
   * Groups with nothing scheduled today are dropped outright; they have nothing
   * to say in this card, and a band with no rows reads as a bug.
   */
  const todayGroups = React.useMemo(() => {
    const dateKey = toDateKey();

    return groups
      .map((group) => {
        const scheduled = scheduledGroupHabitsOn(group.habits, dateKey);
        const me = group.members.find((member) => member.profile.lumoId === myLumoId);
        const doneIds = me?.completedTodayHabitIds ?? [];
        const pending = scheduled.filter((habit) => {
          // A "multiple" habit is finished only once its count reaches the
          // target, so a half-done one stays on the list — which is also what
          // keeps hold-to-undo reachable while there is something to undo.
          const target = habit.goal.type === "multiple" ? habit.goal.count : 1;
          const count = me?.todayCountByHabit?.[habit.id] ?? 0;

          return !doneIds.includes(habit.id) && count < target;
        });

        return { group, due: scheduled.length, done: scheduled.length - pending.length, pending };
      })
      .filter((entry) => entry.due > 0);
  }, [groups, myLumoId]);
  /** The bands the card actually draws — the cleared groups have dropped out. */
  const pendingGroups = todayGroups.filter((entry) => entry.pending.length > 0);
  /** What the directory card's heading counts, whichever list the pill is on. */
  const directoryCount = socialTab === "groups" ? allGroups.length : friends.length;
  const habitsDueToday = todayGroups.reduce((sum, entry) => sum + entry.due, 0);
  const habitsDoneToday = todayGroups.reduce((sum, entry) => sum + entry.done, 0);
  /** The day cleared: something was due, and none of it is left. Worth a sparkle. */
  const allHabitsDone = habitsDueToday > 0 && pendingGroups.length === 0;

  const [refreshing, setRefreshing] = React.useState(false);
  /** The group habit currently mid-write, so its row cannot be fired twice. */
  const [busyHabitId, setBusyHabitId] = React.useState<string | null>(null);

  /**
   * Drives the backdrop's fade — see GroupBackdrop.
   *
   * Set by hand from `handleScroll` rather than by `Animated.event`, matching
   * the group page: `Screen` takes a single onScroll, and one interpolated
   * opacity per frame on the JS driver is cheap.
   */
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.setValue(event.nativeEvent.contentOffset.y);
    },
    [scrollY]
  );
  // The plate fills the screen, so the tabs are dropped to where the picnic
  // finishes rather than starting straight under the header and running across
  // it. The header is measured instead of assumed: its height moves with the
  // Dynamic Island / notch inset.
  const insets = useSafeAreaInsets();
  const subjectBottom = useGroupBackdropSubjectBottom();
  const [headerBottom, setHeaderBottom] = React.useState(0);
  const handleHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      setHeaderBottom(insets.top + y + height);
    },
    [insets.top]
  );
  // Zero until the bar has been measured — dropping the tabs on a guess would
  // land them somewhere else on the first frame and jump.
  const sceneDrop = headerBottom > 0 ? Math.max(0, (subjectBottom - headerBottom) * (1 - SCENE_OVERLAP)) : 0;

  const loadData = React.useCallback(async () => {
    const [loadedGroups, loadedFriends, loadedFriendInvites, loadedGroupInvites] = await Promise.all([
      friendsService.listGroups(),
      friendsService.listFriends(),
      friendsService.listInvitations(),
      friendsService.listGroupInvitations()
    ]);
    // The override lands here rather than at each render site, so every list,
    // count and badge on the screen agrees that there is nothing.
    setGroups(FORCE_EMPTY_STATE ? [] : loadedGroups);
    setFriends(FORCE_EMPTY_STATE ? [] : loadedFriends);
    setFriendInvites(FORCE_EMPTY_STATE ? [] : loadedFriendInvites);
    setGroupInvites(FORCE_EMPTY_STATE ? [] : loadedGroupInvites);
    setInitialLoading(false);
  }, []);

  const inviteCount = friendInvites.length + groupInvites.length;

  /**
   * Check-in straight from this page, rather than sending the reader into the
   * group to do it. Same write the group page makes — `syncCompletion` with the
   * day's running count — so the two screens cannot drift apart on what a
   * check-in means.
   *
   * `busyHabitId` holds the row still for the round trip. Without it a double
   * tap on a multi-count activity fires twice off the same stale `count` and
   * logs one rep instead of two.
   */
  async function logGroupHabit(group: Group, habit: GroupHabit) {
    const me = group.members.find((member) => member.profile.lumoId === myLumoId);

    if (!me || busyHabitId) {
      return;
    }

    const target = habit.goal.type === "multiple" ? habit.goal.count : 1;
    const count = me.todayCountByHabit?.[habit.id] ?? 0;

    if (count >= target) {
      return;
    }

    setBusyHabitId(habit.id);
    const ok = await friendsService.syncCompletion(habit.id, toDateKey(), Math.min(target, count + 1));

    if (ok) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      await loadData();
    }

    setBusyHabitId(null);
  }

  /**
   * Checking in ASKS FIRST on this page, unlike home's list.
   *
   * Two things make a tap here worth a question. The row leaves the list on the
   * last rep, so a mis-tap does not just flip a tick — it takes the habit off the
   * page, and the undo that would put it back goes with it. And this is a shared
   * habit: the number it moves is one the rest of the group can see.
   *
   * The dialog names the rep it is about to log, so a multi-count activity says
   * which one of the day's targets this is rather than "check in?" three times
   * over. Nothing is written until the confirm — `logGroupHabit` does the work.
   */
  function confirmLogGroupHabit(group: Group, habit: GroupHabit) {
    const me = group.members.find((member) => member.profile.lumoId === myLumoId);

    if (!me || busyHabitId) {
      return;
    }

    const target = habit.goal.type === "multiple" ? habit.goal.count : 1;
    const count = me.todayCountByHabit?.[habit.id] ?? 0;

    if (count >= target) {
      return;
    }

    const next = count + 1;
    const finishes = next >= target;

    Alert.alert(
      "Check in?",
      target > 1
        ? `Log ${next} of ${target} for ${habit.name}.${finishes ? " That finishes it for today." : ""}`
        : `Mark ${habit.name} as done today. Your group will see it.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Check in", onPress: () => void logGroupHabit(group, habit) }
      ]
    );
  }

  /**
   * Undo is a long press AND a confirmation, matching the home list. Removing a
   * check-in is the one action here that destroys something, and on a shared
   * habit it changes a number the rest of the group can see.
   */
  function confirmUndoGroupHabit(group: Group, habit: GroupHabit) {
    const me = group.members.find((member) => member.profile.lumoId === myLumoId);
    const count = me?.todayCountByHabit?.[habit.id] ?? 0;

    if (!me || !count || busyHabitId) {
      return;
    }

    const multiple = habit.goal.type === "multiple";

    Alert.alert(
      "Undo check-in?",
      multiple && count > 1 ? `Remove one from ${habit.name}?` : `Mark ${habit.name} as not done today?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo",
          style: "destructive",
          onPress: async () => {
            setBusyHabitId(habit.id);
            const ok = await friendsService.syncCompletion(habit.id, toDateKey(), multiple ? count - 1 : 0);

            if (ok) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
              await loadData();
            }

            setBusyHabitId(null);
          }
        }
      ]
    );
  }

  /**
   * Both respond calls are optimistic — the row leaves the list immediately and
   * the whole set is reloaded if the write fails, which is also what folds an
   * accepted invite into the Friends or Groups tab it now belongs to.
   */
  /**
   * Declining is the one that needs asking about. Accepting is reversible —
   * unfriend, or leave the group — but a decline deletes the row outright, so
   * the invitation is gone and only the other person can send it again.
   */
  function confirmDecline(what: string, onConfirm: () => void) {
    Alert.alert("Decline invitation?", `${what} They would have to invite you again.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: onConfirm }
    ]);
  }

  async function respondToFriendInvite(invite: FriendInvitation, accept: boolean) {
    const name = invite.nickname || "This person";

    if (!accept) {
      confirmDecline(`${name} will not be added to your friends.`, () => applyFriendInvite(invite, false));
      return;
    }

    await applyFriendInvite(invite, true);
  }

  async function applyFriendInvite(invite: FriendInvitation, accept: boolean) {
    setRespondingTo(invite.lumoId);
    const ok = await friendsService.respondToInvitation(invite.lumoId, accept);
    setRespondingTo(null);

    if (!ok) {
      Alert.alert("Could not update", "That invitation could not be updated. Please try again.");
    }

    await loadData();
  }

  async function respondToGroupInvite(invite: GroupInvitation, accept: boolean) {
    if (!accept) {
      confirmDecline(`You will not join "${invite.groupName}".`, () => applyGroupInvite(invite, false));
      return;
    }

    await applyGroupInvite(invite, true);
  }

  async function applyGroupInvite(invite: GroupInvitation, accept: boolean) {
    setRespondingTo(invite.groupId);
    const ok = await friendsService.respondToGroupInvitation(invite.groupId, accept);
    setRespondingTo(null);

    if (!ok) {
      Alert.alert("Could not update", "That invitation could not be updated. Please try again.");
    }

    await loadData();
  }

  // Refresh on focus so a group created on the form screen (or an invite
  // accepted on the profile screen) shows up on return. There is no tab to put
  // back any more — `Screen` returns the page to the top, which lands on the
  // day's habits, and everything else is one scroll below them.
  useFocusEffect(
    React.useCallback(() => {
      loadData();
      // `Screen` puts the scroller back to the top on focus; this puts the
      // backdrop's fade back with it. Without it a tab left scrolled down comes
      // back with the picnic still faded out, since the reset is unanimated and
      // may not emit a scroll event to track.
      scrollY.setValue(0);
    }, [loadData, scrollY])
  );

  const inviteComplete = inviteId.length === "LUMO-XXXX-XX".length;

  function handleUnfriend(friend: Friendship) {
    const name = friend.profile.nickname || "this friend";
    Alert.alert("Remove friend?", `${name} will be removed from your friends. You can add each other again anytime.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          // Optimistic removal; reload if the server write fails.
          setFriends((current) => current.filter((entry) => entry.profile.lumoId !== friend.profile.lumoId));
          const ok = await friendsService.unfriend(friend.profile.lumoId);
          if (!ok) {
            loadData();
          }
        }
      }
    ]);
  }

  function closeInvite() {
    setInviteVisible(false);
    setInviteId(LUMO_ID_PREFIX);
  }

  async function sendInvite() {
    if (sendingInvite) {
      return;
    }

    if (!inviteComplete) {
      Alert.alert("Incomplete ID", "A Lumo ID looks like LUMO-8F3K-2Q.");
      return;
    }

    if (inviteId === formatLumoId(lumoIdSuffix)) {
      Alert.alert("That's you!", "This is your own Lumo ID — share it with a friend instead.");
      return;
    }

    setSendingInvite(true);
    const sent = await friendsService.sendRequest(inviteId);
    setSendingInvite(false);
    closeInvite();

    if (sent) {
      Alert.alert("Invite sent", `We'll let you know when ${inviteId} accepts.`);
    } else {
      Alert.alert("Almost there", "Friend requests sync in an upcoming update — keep their ID handy!");
    }
  }

  if (FRIENDS_COMING_SOON) {
    return (
      // No page bar on this one, so it puts back the top padding `styles.content`
      // gives up for the pinned header.
      <Screen contentStyle={[styles.content, styles.unpinnedContent]}>
        <View style={styles.hero}>
          <View style={[styles.badge, { backgroundColor: palette.greenSoft }]}>
            <Icon name="friends" size={30} color={palette.greenDark} weight="bulk" />
          </View>
          <View style={[styles.pill, { backgroundColor: alpha(palette.greenDark, "12") }]}>
            <AppText variant="caption" color={palette.greenDark} style={styles.pillText}>
              LAUNCHING SOON
            </AppText>
          </View>
          <AppText color={palette.ink} numberOfLines={1} style={styles.title}>
            Better together
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
            Track habits with your friends, share routines, and keep each other going. Here's what's coming.
          </AppText>
        </View>

        <View style={styles.list}>
          {features.map((feature) => (
            <View key={feature.title} style={[styles.row, { backgroundColor: palette.card, shadowColor: palette.shadow }]}>
              <View style={[styles.rowIcon, { backgroundColor: alpha(palette.greenDark, "12") }]}>
                <Icon name={feature.icon} size={22} color={palette.greenDark} weight="bulk" />
              </View>
              <View style={styles.rowText}>
                <AppText variant="titleSmall" color={palette.ink} style={styles.rowTitle}>
                  {feature.title}
                </AppText>
                <AppText variant="bodySmall" color={palette.subtle} style={styles.rowBody}>
                  {feature.body}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        <AppText variant="bodySmall" color={palette.subtle} style={styles.pricingNote}>
          To cover server costs and maintenance, Friends will require ₱49/month. Everything else in Lumo stays free and on your
          device.
        </AppText>
      </Screen>
    );
  }

  if (!isPro && !BYPASS_FRIENDS_PAYWALL) {
    return <SubscriptionGate />;
  }

  return (
    // The social plate — the picnic this tab shares with a group's own page — so
    // the generic landscape is switched off rather than layered under it. See
    // GroupBackdrop for why it isn't a `backgroundVariant`.
    <Screen
      backgroundVariant={null}
      backgroundNode={<GroupBackdrop scrollY={scrollY} />}
      contentStyle={styles.content}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={palette.greenDark}
          onRefresh={async () => {
            setRefreshing(true);
            await loadData();
            setRefreshing(false);
          }}
        />
      }
      // Written as `stickyHeader` rather than as the first child — which `Screen`
      // would pin by itself — only so the bar can be wrapped and measured, which
      // is what the first card drops from.
      stickyHeader={
        <View onLayout={handleHeaderLayout}>
          {/* The app's page header with the Move screen's pill in its centre slot
              instead of a title. The word "Friends" up there was naming the tab
              you had already tapped to get here, while the switch that actually
              matters — which list the card at the foot of the page is showing —
              had nowhere to live. `hitSlop` is what brings the shrunk track back
              to a 44pt target; see HeaderTabs. */}
          <ScreenHeader
            centerContent={<HeaderTabs options={SOCIAL_TABS} value={socialTab} onChange={setSocialTab} hitSlop={8} />}
            // Invitations are an inbox, not a peer of the lists below — they
            // arrive unbidden and empty out as you deal with them. As a tab they
            // sat there reading "0" most of the time; on the bar they are silent
            // until something is actually waiting.
            // 22, matching Profile: these two carry `bulk` glyphs, whose lighter
            // duotone strokes read a size smaller than the bold ones every other
            // header uses at 20.
            leftAction={{
              icon: "notifications",
              label: "Invitations",
              iconWeight: "bulk",
              iconSize: 22,
              badge: inviteCount,
              onPress: () => setInvitesVisible(true)
            }}
            // Whatever the tab you are standing on adds. Two buttons up here
            // would mean one of them always acting on a list you cannot see, and
            // the pill between them already says which list that is.
            //
            // A bare bold + for a group, exactly as the Habits header draws its
            // add button — `elementPlus` is a plus inside a square, which read as
            // a different control from the one doing the same job one tab over.
            rightAction={
              socialTab === "friends"
                ? {
                    icon: "userCircleAdd",
                    label: "Invite a friend",
                    iconWeight: "bulk",
                    iconSize: 22,
                    onPress: () => setInviteVisible(true)
                  }
                : {
                    icon: "plus",
                    label: "Create a group",
                    iconWeight: "bold",
                    iconSize: 20,
                    onPress: () => router.push("/group/new")
                  }
            }
          />
        </View>
      }
    >
      {/* TODAY'S GROUP HABITS — the page's first card, and the only part of it
          that is about right now.

          One card for all of them, the way home carries the day's own habits: the
          heading counts the lot, and each group's name heads its own band inside.
          A habit LEAVES this list the moment it is finished, so what is left is
          always what is still owed — the heading's count is what keeps the ones
          you have done from vanishing without trace. Dropped past the picnic on
          the plate behind it. */}
      <Card style={[styles.listCard, { marginTop: sceneDrop }]}>
        <View style={styles.listHeader}>
          <AppText color={palette.ink} numberOfLines={1} style={styles.listTitle}>
            Group Habits
          </AppText>
          {habitsDueToday > 0 ? (
            <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.listCount}>
              <AppText variant="caption" color={palette.ink} style={styles.listCountValue}>
                {habitsDoneToday}
              </AppText>{" "}
              of {habitsDueToday} done
            </AppText>
          ) : null}
        </View>

        {initialLoading ? (
          <GroupHabitsSkeleton />
        ) : pendingGroups.length ? (
          pendingGroups.map((entry, index) => (
            <GroupHabitsSection
              key={entry.group.id}
              group={entry.group}
              pending={entry.pending}
              doneCount={entry.done}
              dueCount={entry.due}
              myLumoId={myLumoId}
              busyHabitId={busyHabitId}
              divided={index > 0}
              onOpen={() => router.push(`/group/${entry.group.id}`)}
              onToggle={(habit) => confirmLogGroupHabit(entry.group, habit)}
              onUndo={(habit) => confirmUndoGroupHabit(entry.group, habit)}
            />
          ))
        ) : (
          // Inside the card, and compact: this is the "nothing left" face of a
          // list, not a dead end, so it takes the shape home's rest day does.
          // Three states, not two — a cleared day has to read differently from a
          // day that never had anything on it, or finishing the last habit looks
          // like the list broke.
          // Fades in as the last row fades out, so clearing the day is one motion
          // rather than a blank card between the two.
          <Reanimated.View entering={FadeIn.duration(LIST_SHIFT_MS)} style={styles.listRest}>
            {/* Only on the cleared day. The other two states are the absence of
                work rather than the end of it, and a sparkle over "nothing
                scheduled" would be congratulating the calendar. */}
            {allHabitsDone ? (
              <View style={[styles.listRestIcon, { backgroundColor: alpha(palette.greenDark, isDark ? "26" : "14") }]}>
                <Icon name="sparkle" size={20} color={palette.greenDark} weight="bulk" />
              </View>
            ) : null}
            <AppText variant="titleSmall" color={palette.ink} style={styles.listRestTitle}>
              {allHabitsDone ? "All done today" : groups.length ? "Nothing due today" : "No group habits yet"}
            </AppText>
            {/* `muted` on the cleared day, `subtle` on the other two: this line is
                a note that the work is behind you and can recede, where the others
                are telling somebody what to do next. */}
            <AppText variant="bodySmall" color={allHabitsDone ? palette.muted : palette.subtle} style={styles.listRestBody}>
              {allHabitsDone
                ? `Every one of today's ${habitsDueToday === 1 ? "activities" : `${habitsDueToday} activities`} is checked off. Your groups can see it.`
                : groups.length
                  ? "None of your groups have an activity scheduled for today — enjoy the breather."
                  : "Join or create a group and its shared activities will gather here each day."}
            </AppText>
          </Reanimated.View>
        )}
      </Card>

      {/* THE DIRECTORY — one card, and the pill in the page bar chooses which
          list is in it.

          It carries a heading of its own, matching the habits card above: the
          pill names what you SWITCHED to, up at the top of the screen, and by the
          time you have scrolled to the card it is off-screen. Two headings that
          say the same word are worth less than a card that says what it holds. */}
      <Card style={[styles.listCard, styles.directoryCard]}>
        <View style={[styles.listHeader, styles.directoryHeader]}>
          <AppText color={palette.ink} numberOfLines={1} style={styles.listTitle}>
            {socialTab === "groups" ? "Groups" : "Friends"}
          </AppText>
          {/* The count alone, with no unit after it — "3 groups" beside a heading
              reading "Groups" is the same word twice. Hidden while the list is
              empty, where the state below says it in a sentence.

              Held back in `muted`, like the tally beside each group's name in the
              card above: the heading is what you read, and the number is there
              when you look for it. Nothing here is a figure worth a bold value
              the way "2 of 7 done" is — it is the length of the list under it. */}
          {directoryCount > 0 ? (
            <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.listCount}>
              {directoryCount}
            </AppText>
          ) : null}
        </View>

        {initialLoading ? (
          <PeopleRowsSkeleton />
        ) : socialTab === "groups" ? (
          allGroups.length ? (
            allGroups.map((group, index) => (
              <GroupRow
                key={group.id}
                group={group}
                first={index === 0}
                last={index === allGroups.length - 1}
                onPress={() => router.push(`/group/${group.id}`)}
              />
            ))
          ) : (
            <View style={styles.listRest}>
              <AppText variant="titleSmall" color={palette.ink} style={styles.listRestTitle}>
                No groups yet
              </AppText>
              {/* No CTA — the header's + is the way to create one, and a button
                  here would be a second front door to the same thing. */}
              <AppText variant="bodySmall" color={palette.subtle} style={styles.listRestBody}>
                Tap + to create one with friends — every member's check-ins add up to the same goal.
              </AppText>
            </View>
          )
        ) : friends.length ? (
          friends.map((friend, index) => (
            <View
              key={friend.profile.lumoId}
              style={[
                styles.listRow,
                index === 0 ? styles.listRowFirst : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
                index === friends.length - 1 ? styles.listRowLast : null
              ]}
            >
              {/* Circular, the way the avatar renders everywhere else. It was a
                  square-clipped portrait inside a tinted disc, which sheared the
                  bust off along a flat line — the art carries its own background,
                  so clipping it round IS the disc. */}
              <Avatar config={friend.profile.avatar ?? defaultAvatar()} size={42} />
              <View style={styles.friendText}>
                <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.friendName}>
                  {friend.profile.nickname || "Lumo user"}
                </AppText>
                <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                  {friend.profile.lumoId}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${friend.profile.nickname || "friend"}`}
                hitSlop={8}
                onPress={() => handleUnfriend(friend)}
                style={({ pressed }) => [styles.friendRemove, { backgroundColor: alpha(palette.danger, "12"), opacity: pressed ? 0.7 : 1 }]}
              >
                <Icon name="close" size={15} color={palette.danger} weight="bulk" />
              </Pressable>
            </View>
          ))
        ) : (
          <View style={styles.listRest}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.listRestTitle}>
              {syncOffline ? "Friends are syncing soon" : "No friends yet"}
            </AppText>
            <AppText variant="bodySmall" color={palette.subtle} style={styles.listRestBody}>
              {syncOffline
                ? "Friend connections sync in an upcoming update. Share your Lumo ID or QR now so friends are ready to add you."
                : "Share your Lumo ID and start cheering each other on."}
            </AppText>
          </View>
        )}
      </Card>

      {/* The invitations inbox. A sheet rather than a section of its own: you
          open it, clear it, and leave, and most days there is nothing in it —
          which as a block on the page would be a heading over an empty list. */}
      <Modal visible={invitesVisible} transparent animationType="fade" onRequestClose={() => setInvitesVisible(false)}>
        <View style={styles.inviteOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} accessibilityLabel="Close" onPress={() => setInvitesVisible(false)} />
          <View style={[styles.invitesSheet, { backgroundColor: palette.card }]}>
            {/* Only over a list. The empty state carries its own "No
                invitations" heading, so the bar title above it just said the
                same word twice. */}
            {inviteCount ? (
              <AppText variant="titleSmall" color={palette.ink} style={[styles.inviteTitle, styles.invitesTitle]}>
                Invitations
              </AppText>
            ) : null}

            {inviteCount ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.invitesList}>
                {groupInvites.map((invite, index) => (
                  <InviteRow
                    key={`group-${invite.groupId}`}
                    title={invite.groupName}
                    // Says "Group invitation" outright: a group and a person
                    // sit in the same list under the same kind of avatar, and
                    // the title alone does not tell you which you are accepting.
                    subtitle={`Group invitation ${timeAgo(invite.invitedAt).toLowerCase()}${invite.invitedBy ? ` by ${invite.invitedBy}` : ""}`}
                    groupSeed={invite.avatarSeed ?? invite.groupId}
                    busy={respondingTo === invite.groupId}
                    first={index === 0}
                    onRespond={(accept) => respondToGroupInvite(invite, accept)}
                  />
                ))}
                {friendInvites.map((invite) => (
                  <InviteRow
                    key={`friend-${invite.lumoId}`}
                    title={invite.nickname || "Lumo user"}
                    // Named the same way as the group line above it, so the two
                    // kinds are told apart by their first word rather than by
                    // guessing from the avatar.
                    subtitle={`Friend request ${timeAgo(invite.invitedAt).toLowerCase()}`}
                    avatar={invite.avatar ?? defaultAvatar()}
                    busy={respondingTo === invite.lumoId}
                    first={!groupInvites.length && invite === friendInvites[0]}
                    onRespond={(accept) => respondToFriendInvite(invite, accept)}
                  />
                ))}
              </ScrollView>
            ) : (
              // `quiet` — an empty inbox is the ordinary state here, not
              // something the user has to go and fix. `compact` and no art
              // because this one stands in a small sheet rather than on a page:
              // the glyph was the same add-a-friend mark as the header button
              // that opens this, drawn at 30pt over two lines of copy.
              <EmptyState
                quiet
                compact
                art={false}
                title="No invitations"
                body="Group and friend invites land here. Share your Lumo ID so people can find you."
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={inviteVisible} transparent animationType="fade" onRequestClose={closeInvite}>
        <View style={styles.inviteOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} accessibilityLabel="Close" onPress={closeInvite} />
          <View style={[styles.inviteCard, { backgroundColor: palette.card }]}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.inviteTitle}>
              Invite a friend
            </AppText>
            <AppText variant="bodySmall" color={palette.subtle} style={styles.inviteHint}>
              Enter their Lumo ID — they can find it on their profile.
            </AppText>
            <TextInput
              value={inviteId}
              onChangeText={(text) => setInviteId(maskLumoId(text))}
              placeholder="LUMO-XXXX-XX"
              placeholderTextColor={alpha(palette.subtle, "80")}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={sendInvite}
              style={[
                styles.inviteInput,
                { borderColor: palette.hairline, color: palette.ink, backgroundColor: isDark ? palette.surface : palette.canvas }
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send invite"
              onPress={sendInvite}
              onPressIn={() => setSendPressed(true)}
              onPressOut={() => setSendPressed(false)}
              style={[
                styles.inviteSend,
                { backgroundColor: palette.green, opacity: sendingInvite ? 1 : !inviteComplete ? 0.45 : sendPressed ? 0.85 : 1 }
              ]}
            >
              {sendingInvite ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <AppText variant="button" color={palette.white}>
                  Send invite
                </AppText>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    // The pinned bar has already spent the screen's top padding. `Screen` zeroes
    // this itself for a header written as its first child; this page passes its
    // bar as `stickyHeader` so it can be measured, which opts out of that — so
    // the zero is stated here instead.
    paddingTop: 0,
    paddingBottom: layout.tabScreenBottomPadding,
    // 8 between the two cards, which is home's own CONTENT_GAP. At the screen
    // default of 24 they read as two unrelated panels; this close, they read as
    // one page — today's work, then who it is with.
    gap: spacing.xs
  },
  unpinnedContent: {
    paddingTop: spacing.lg
  },
  hero: {
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingBottom: spacing.lg
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxs
  },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4
  },
  pillText: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 0.6
  },
  title: {
    fontFamily: "Lexend-Black",
    fontSize: 32,
    lineHeight: 38,
    textAlign: "center"
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 18
  },
  list: {
    gap: spacing.sm
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.nav,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2
  },
  rowIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  rowText: {
    flex: 1,
    gap: 2
  },
  rowTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  rowBody: {
    lineHeight: 18
  },
  pricingNote: {
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: spacing.md
  },
  subscribeCta: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  subscribeLabel: {
    fontSize: 17,
    lineHeight: 22
  },
  inviteOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  inviteCard: {
    width: "100%",
    maxWidth: 380,
    gap: spacing.sm,
    borderRadius: radius.dialog,
    padding: spacing.xl
  },
  inviteTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 18,
    lineHeight: 24
  },
  inviteHint: {
    lineHeight: 19
  },
  inviteInput: {
    minHeight: control.height,
    borderWidth: control.borderWidth,
    borderRadius: control.radius,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamilies.lexendBold,
    fontSize: 16,
    letterSpacing: 1.2
  },
  inviteSend: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    marginTop: spacing.xxs
  },
  // Capped rather than sized to content: a long list scrolls inside the sheet
  // instead of growing it off the top and bottom of the screen.
  invitesSheet: {
    width: "100%",
    maxHeight: "70%",
    gap: spacing.md,
    borderRadius: radius.dialog,
    // No horizontal padding: the rows carry their own, so their separators can
    // reach both edges instead of floating in a gutter.
    paddingVertical: spacing.lg
  },
  invitesTitle: {
    paddingHorizontal: spacing.lg
  },
  invitesList: {
    // No gap either — the rows are separated by rules now, not by air.
    paddingBottom: spacing.xxs
  },
  // The inset lives on the row, not on the sheet, so the hairline between rows
  // runs the sheet's full width while the content stays lined up with the
  // heading above it.
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  // Regular weight, not `caption`'s semibold — "Invited 2d ago" is a timestamp
  // under a name, and at semibold it competed with the name above it.
  inviteSubtitle: {
    fontFamily: fontFamilies.lexend
  },
  inviteActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  inviteAction: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  /**
   * Both of this page's cards, on home's habits-card padding exactly.
   *
   * 20 horizontally rather than the 16 these lists used to carry, and the same
   * uneven vertical inset: the rows bring their own 12 at the foot, so 12 here
   * lands on 24 under the last one against the 16 above the heading. The
   * asymmetry is deliberate — a flush bottom edge makes the last row look
   * clipped against the card boundary. Taken off the card rather than off that
   * row, because zeroing one row's padding puts its avatar off-centre against
   * every other row's.
   */
  listCard: {
    paddingHorizontal: spacing.ml,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm
  },
  /**
   * The bottom of the directory card only.
   *
   * Its top is `listCard`'s 16, the same as the habits card's — both cards now
   * open on a heading, so they open on the same inset. The FOOT is the one that
   * differs: this card's last row gave up its own padding (see `listRowLast`),
   * where the habits card's last habit row still brings 12 of its own. 20 here
   * covers that 12 and leaves the last avatar sitting in the same air the rows
   * above it have between them.
   */
  directoryCard: {
    paddingBottom: spacing.ml
  },
  // The air under this card's heading, which the habits card gets from its first
  // band's own padding instead — the rows here start flush, having given theirs up
  // at the card's edges, so the heading carries it. 12 against that band's 8,
  // because the band spends another 8 on its group-name row before anything is
  // read; see `habitsGroup`.
  directoryHeader: {
    marginBottom: spacing.sm
  },
  // The card's own heading: what it holds, and how much of it is done. A step
  // under the app's section headings — it sits INSIDE the card it names rather
  // than above a group of them, so at the full step it outweighed the habit
  // names underneath it. Home's habits card is built the same way.
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: 28
  },
  listTitle: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendBold,
    fontSize: 14,
    lineHeight: 19
  },
  listCount: {
    flexShrink: 0,
    fontFamily: fontFamilies.lexendMedium
  },
  listCountValue: {
    fontFamily: fontFamilies.lexendBold
  },
  // One group's band inside that card: its name, then its rows. The rule is what
  // separates two groups; the rows inside carry their own lighter ones.
  //
  // On the FIRST band this padding is the gap under the card's heading — the
  // divided ones below override it with their own.
  //
  // 8, where the directory card's heading takes 12: the band opens on its own
  // group-name row, which brings a further 8 of its own, so the heading is
  // already 16 clear of anything you read. The directory card's rows start flush,
  // and need the whole gap from the heading.
  habitsGroup: {
    paddingTop: spacing.xs
  },
  /**
   * The seam between two groups, and the air either side of it.
   *
   * `marginTop` falls OUTSIDE the border and `paddingTop` inside, so these are the
   * two halves of that air and they are deliberately the SAME number — the rule
   * sits centred between the last habit above it and the group name below.
   *
   * They have to be stated separately to come out even: at 12/16 the rule rode up
   * against the habit above it. The two rows flanking it each spend a further 8 of
   * their own (`habitRow` and `habitsHeader` share that inset), so equal here IS
   * equal on screen — 20 of air on each side of the seam at this setting.
   */
  habitsGroupDivided: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  habitsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs
  },
  // An empty list, stated inside the card that would have held it — home's rest
  // day, reused by both cards here. The mascot-and-heading `EmptyState` is for a
  // whole screen with nothing on it; inside a card it draws a box around a
  // drawing of nothing.
  listRest: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md
  },
  // The celebration mark, and only for the cleared day. A tinted disc rather than
  // a bare glyph, so it reads as a small award and not as another row's icon that
  // has lost its row.
  listRestIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxs
  },
  // A point off `titleSmall` and `bodySmall`, with the leading brought down to
  // match — an in-card state is a note about a list, not a screen of its own, and
  // at the full steps it was setting the largest type in either card.
  listRestTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  listRestBody: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 280
  },
  // The shared row of the second card: a 42pt avatar, two lines, and whatever
  // that list puts on the right. Groups and friends use the SAME row — they are
  // two directories of the same kind of thing, and rows that differed by a few
  // points read as a rendering fault when the pill swaps them.
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  /**
   * The rows at the card's own edges give their outer padding up.
   *
   * The card already insets 16 at the top and 12 at the foot; a row carrying its
   * own 12 on top of that put 28 above the first avatar and 24 under the last,
   * against the 24 BETWEEN two rows — so the list read as loose at the ends and
   * tight in the middle. Only the outer half goes: each row still keeps the
   * padding on its inward side, which is what holds every avatar centred against
   * every other one.
   */
  // The second line of a skeleton row. `friendText`/`habitText` set a 1pt gap for
  // real type, whose own leading does the rest of the work; two bare blocks that
  // close together read as one thick bar.
  skeletonMeta: {
    marginTop: 3
  },
  listRowFirst: {
    paddingTop: 0
  },
  listRowLast: {
    paddingBottom: 0
  },
  // Small enough to read as a mark beside a label rather than as a portrait: the
  // habits' own icon tiles are the left edge of this list, and a 26pt group face
  // above them was the largest thing in the card.
  habitsAvatar: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  // Both on `caption` as it comes — 12pt semibold, no weight of their own. The
  // size is what holds this row back from the habit names below it (at the
  // regular weight the pair went soft enough to read as a footnote to the rows
  // rather than as the label above them); the two COLOURS then separate the name
  // from its tally, `subtle` against `muted`.
  habitsGroupName: {
    flex: 1,
    minWidth: 0
  },
  habitsCount: {
    flexShrink: 0
  },
  // Shorter than the home card's rows, which is right for what these carry:
  // a bare glyph and a name, no icon tile and usually no second line.
  habitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: spacing.xs
  },
  // 34, not home's 46: these rows are shorter, and a tile that size would stand
  // taller than the two lines beside it.
  habitIcon: {
    width: 34,
    height: 34,
    borderRadius: tileRadius(34),
    alignItems: "center",
    justifyContent: "center"
  },
  habitText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  habitName: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 14,
    lineHeight: 21
  },
  habitMeta: {
    fontFamily: fontFamilies.lexend,
    fontSize: 12,
    lineHeight: 16
  },
  // Sized to the hold ring it hosts, so the ring's absolute fill centres on
  // the check inside it rather than on a box the check happens to sit in.
  habitTrailing: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center"
  },
  habitCheck: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center"
  },
  friendText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  friendRemove: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  friendName: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  groupStreakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3
  },
  groupStreakText: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  groupAvatars: {
    flexDirection: "row",
    alignItems: "center"
  },
  groupAvatar: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  groupAvatarMore: {
    fontSize: 10,
    lineHeight: 13,
    fontFamily: fontFamilies.lexendSemiBold
  },
  groupMeta: {
    // The caption variant is semibold, which reads as a second title next to
    // the group name — the counts want the regular face instead.
    fontFamily: fontFamilies.lexend,
    minWidth: 0
  }
});
