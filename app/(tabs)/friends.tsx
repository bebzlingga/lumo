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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SegmentedControl } from "@/components/controls";
import { GroupBackdrop, useGroupBackdropSubjectBottom } from "@/components/GroupBackdrop";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { HoldProgressRing } from "@/components/HoldProgressRing";
import { HOLD_REVEAL_DELAY_MS, SegmentedRing, UNDO_HOLD_DURATION_MS } from "@/components/QuickDoneWidgets";
import { EmptyState } from "@/components/states";
import { AppText, Screen } from "@/components/ui";
import { control, fontFamilies, habitAccent, habitColorOption, layout, radius, spacing } from "@/constants/theme";
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

/** The inset both list cards on this screen use — `HabitCard`'s, so the friend
 *  rows and the group cards line up with each other and with the habit list.
 *  Named because the group card's activity chip row bleeds against it and has
 *  to cancel exactly this, not the screen gutter. */
const LIST_CARD_PADDING = spacing.md;

/**
 * How much of the backdrop's picnic the tab row may sit over, as a fraction of
 * the gap between the page bar and the foot of the scene.
 *
 * 0 clears the scene completely, which puts the tabs a third of the way down the
 * screen; 1 starts them straight under the bar and runs the pills across the
 * three of them. This lands the row on the blanket's front corner — the
 * picnic's own foreground, clear of the characters — so the page reads as
 * sitting IN FRONT of the scene rather than beginning after it.
 */
const SCENE_OVERLAP = 0.15;

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
 * TEMPORARY — opens Friends without a subscription, so the Move team routes can
 * be walked end to end while testing. Set to false to put the paywall back.
 */
const BYPASS_FRIENDS_PAYWALL = true;

const features: { icon: IconName; title: string; body: string }[] = [
  { icon: "friends", title: "Track together", body: "Follow your friends' progress and stay motivated." },
  { icon: "elementPlus", title: "Groups", body: "Every member's completions add up to one shared goal." },
  { icon: "heart", title: "Cheer each other on", body: "Celebrate streaks and wins as a team." },
  { icon: "trophy", title: "Friendly streaks", body: "Compare streaks and keep each other going." }
];

type FriendsTab = "habits" | "goals" | "friends";

/**
 * Two controls rather than one, following the Habits screen's split filters.
 *
 * Habits is a different KIND of view from the two beside it: Groups and
 * Friends each list a set of people you are connected to, while Habits lists
 * work you owe them today. Sat in one run of three it read as a third
 * directory; set apart, it reads as the day's view of the other two.
 */
const HABITS_TAB: { label: string; value: FriendsTab }[] = [{ label: "Habits", value: "habits" }];

const SOCIAL_TABS: { label: string; value: FriendsTab }[] = [
  { label: "Groups", value: "goals" },
  { label: "Friends", value: "friends" }
];

const TAB_TITLE: Record<FriendsTab, string> = {
  // "Group Habits", not "Habits": there is a Habits tab in the bottom bar for
  // the user's own, and a page bar reading the same word over a different list
  // is how you end up thinking you are looking at that one.
  habits: "Group Habits",
  goals: "Groups",
  friends: "Friends"
};

/**
 * Every group habit due today, gathered into one card per group.
 *
 * The Groups tab answers "what are my groups"; this answers "what do I owe
 * them today", which otherwise meant opening each group in turn to find out.
 * Rows are read-only on purpose — checking in belongs on the group page, where
 * the rest of that group's context is, and a second place to complete the same
 * habit is a second place for the two to disagree.
 */
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
  divided,
  busy,
  onLog,
  onUndo
}: {
  habit: GroupHabit;
  count: number;
  done: boolean;
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
      // No rule above the first row — the heading sits outside the card, so the
      // card's own edge is the separator there.
      style={({ pressed }) => [
        styles.habitRow,
        divided ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha(palette.hairline, "80") } : null,
        { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }
      ]}
    >
      {/* The glyph alone, in the habit's own colour — no tinted tile behind
          it. These rows sit under a heading rather than being the whole card,
          so a bubble on every one of them made the list heavier than the group
          list it sits beside. */}
      <View style={styles.habitIcon}>
        <Icon name={habit.icon} size={17} color={accent} weight="bulk" />
      </View>
      <View style={styles.habitText}>
        <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.habitName}>
          {habit.name}
        </AppText>
        {target > 1 ? (
          <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.habitMeta}>
            {Math.min(count, target)}/{target} today
          </AppText>
        ) : null}
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

function GroupHabitsCard({
  group,
  myLumoId,
  busyHabitId,
  onOpen,
  onToggle,
  onUndo
}: {
  group: Group;
  myLumoId: string;
  /** Habit currently mid-write, so its row can hold still instead of double-firing. */
  busyHabitId: string | null;
  onOpen: () => void;
  onToggle: (habit: GroupHabit) => void;
  onUndo: (habit: GroupHabit) => void;
}) {
  const { palette, isDark } = useLumo();
  const [headerPressed, setHeaderPressed] = React.useState(false);
  const avatarSvg = React.useMemo(() => buildGroupAvatarSvg(group.avatarSeed ?? group.id), [group.avatarSeed, group.id]);
  const todayHabits = React.useMemo(() => scheduledGroupHabitsOn(group.habits, toDateKey()), [group.habits]);
  const me = group.members.find((member) => member.profile.lumoId === myLumoId);
  const doneIds = me?.completedTodayHabitIds ?? [];
  const doneCount = todayHabits.filter((habit) => doneIds.includes(habit.id)).length;

  if (!todayHabits.length) {
    return null;
  }

  return (
    <View style={styles.habitsGroup}>
      {/* The group's name sits on the canvas, not in the card — it names the
          card rather than being the first row of it. It is also the only part
          of the block that navigates: the rows below check in where they are. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${group.name}, ${doneCount} of ${todayHabits.length} done today`}
        onPress={onOpen}
        onPressIn={() => setHeaderPressed(true)}
        onPressOut={() => setHeaderPressed(false)}
        style={[styles.habitsHeader, { opacity: headerPressed ? 0.7 : 1 }]}
      >
        <View style={[styles.habitsAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
          <Avatar svg={avatarSvg} size={26} />
        </View>
        <AppText color={palette.ink} numberOfLines={1} style={styles.habitsGroupName}>
          {group.name}
        </AppText>
        <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.habitsCount}>
          {doneCount}/{todayHabits.length} done
        </AppText>
      </Pressable>

      <View style={[styles.habitsCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
        {todayHabits.map((habit, index) => {
          const target = habit.goal.type === "multiple" ? habit.goal.count : 1;
          const count = me?.todayCountByHabit?.[habit.id] ?? 0;

          return (
            <GroupHabitRow
              key={habit.id}
              habit={habit}
              count={count}
              done={doneIds.includes(habit.id) || count >= target}
              divided={index > 0}
              busy={busyHabitId === habit.id}
              onLog={() => onToggle(habit)}
              onUndo={() => onUndo(habit)}
            />
          );
        })}
      </View>
    </View>
  );
}

function GroupCard({ group, onPress }: { group: Group; onPress: () => void }) {
  const { palette, isDark } = useLumo();
  const [pressed, setPressed] = React.useState(false);
  const groupAvatarSvg = React.useMemo(() => buildGroupAvatarSvg(group.avatarSeed ?? group.id), [group.avatarSeed, group.id]);

  return (
    /**
     * The card is a plain View, and only its HEADER is pressable.
     *
     * It used to be one Pressable wrapping everything, which put the activity
     * chips' horizontal ScrollView inside a press target spanning the whole
     * card — the two then argued over every drag, and the row would not scroll
     * reliably. Splitting them gives the scroller its gestures back. The cost
     * is that dragging across the chips no longer opens the group, which is
     * the right way round: that area's job is to scroll.
     */
    <View style={[styles.groupCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open group ${group.name}`}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[styles.groupHeader, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Avatar svg={groupAvatarSvg} size={40} />
        <View style={styles.groupHeaderText}>
          <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.groupName}>
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
              {/* The wrapper stays here, unlike the group's own avatar — its
                  ring in the card colour is what separates overlapping faces. */}
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Only scrolls when there is somewhere to scroll to — a short row that
        // rubber-bands under the finger reads as broken.
        alwaysBounceHorizontal={false}
        style={styles.groupHabitsScroll}
        contentContainerStyle={styles.groupHabits}
      >
        {group.habits.map((habit) => {
          // Chip tinted with the activity's own color (theme green fallback).
          const accent = habitAccent(habit.color, isDark) ?? palette.greenDark;

          return (
            <View key={habit.id} style={[styles.groupHabitChip, { backgroundColor: alpha(accent, "14") }]}>
              <Icon name={habit.icon} size={13} color={accent} weight="bulk" />
              <AppText variant="caption" color={accent} numberOfLines={1}>
                {habit.name}
              </AppText>
            </View>
          );
        })}
      </ScrollView>
    </View>
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

// Initial-load placeholders sized to match the real rows/cards.
function FriendsSkeleton() {
  const { palette, isDark } = useLumo();

  return (
    <View style={[styles.friendsCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[styles.friendRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }]}
        >
          <Skeleton width={42} height={42} round />
          <View style={styles.friendText}>
            <Skeleton width={132} height={14} />
            <Skeleton width={96} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

function GroupCardSkeleton() {
  const { palette, isDark } = useLumo();

  return (
    <View style={[styles.groupCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      {/* Header: group avatar, name + meta column, overlapping member faces. */}
      <View style={styles.groupHeader}>
        <Skeleton width={40} height={40} round />
        <View style={styles.skeletonLines}>
          <Skeleton width="50%" height={14} />
          <Skeleton width="40%" height={10} />
        </View>
        <View style={styles.groupAvatars}>
          {[0, 1].map((index) => (
            <View key={index} style={[styles.groupAvatar, { borderColor: palette.card, marginLeft: index ? -10 : 0 }]}>
              <Skeleton width={24} height={24} round />
            </View>
          ))}
        </View>
      </View>
      {/* Activity chips. Bare, not in the bleeding scroller — the real row's
          negative margin and matching inset cancel out to the same edge. */}
      <View style={styles.skeletonChips}>
        <Skeleton width={84} height={24} round />
        <Skeleton width={104} height={24} round />
        <Skeleton width={72} height={24} round />
      </View>
    </View>
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const { palette, isDark, isPro, lumoIdSuffix } = useLumo();
  // Habits, not Groups: the tab you open this screen for day to day is what
  // you still owe today, and the other two are where you go to change the
  // arrangement rather than to act on it.
  const [activeTab, setActiveTab] = React.useState<FriendsTab>("habits");
  const [inviteVisible, setInviteVisible] = React.useState(false);
  const [invitesVisible, setInvitesVisible] = React.useState(false);
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
  const myGroups = groups.filter((group) => group.ownedByMe);
  const invitedGroups = groups.filter((group) => !group.ownedByMe);
  const myLumoId = formatLumoId(lumoIdSuffix);
  // Only groups with something due today — a group whose activities are all
  // scheduled for other days has nothing to say on this tab, and listing it
  // with an empty card would read as a bug.
  const groupsWithHabitsToday = React.useMemo(
    () => groups.filter((group) => scheduledGroupHabitsOn(group.habits, toDateKey()).length > 0),
    [groups]
  );

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
   * Check-in straight from the Habits tab, rather than sending the reader into
   * the group to do it. Same write the group page makes — `syncCompletion` with
   * the day's running count — so the two screens cannot drift apart on what a
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
  // accepted on the profile screen) shows up on return.
  /**
   * Every arrival lands on Habits, not on whichever tab was left open.
   *
   * A tab screen stays mounted once visited, so without this the segment you
   * last tapped is where you come back to — days later, from another tab, with
   * no memory of having set it. Habits is the one worth reopening on: it is
   * what you owe today, and the other two are where you go to change the
   * arrangement rather than to act on it.
   *
   * Same reasoning as `Screen` resetting scroll position on focus.
   */
  useFocusEffect(
    React.useCallback(() => {
      setActiveTab("habits");
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
      // is what the tab row drops from.
      stickyHeader={
        <View onLayout={handleHeaderLayout}>
          {/* The app's page header, same as Habits and Profile: outlined 38pt
              button, centred serif title. This was the last tab still running its
              own — a left-aligned Lexend-Black 34 headline over a filled green
              circle, which made Friends look like a different app from the tab
              beside it. */}
          <ScreenHeader
            title={TAB_TITLE[activeTab]}
            // Invitations are an inbox, not a peer of Groups and Friends — they
            // arrive unbidden and empty out as you deal with them. As a tab they
            // sat there reading "0" most of the time; on the bar they are silent
            // until something is actually waiting, and the count is visible from
            // either tab rather than only once you have gone looking.
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
            rightAction={{
              // A bare bold + on Groups, exactly as the Habits header draws its
              // add button — `elementPlus` is a plus inside a square, which read
              // as a different control from the one doing the same job one tab
              // over.
              icon: activeTab === "friends" ? "userCircleAdd" : "plus",
              // Habits come only from groups, so the Habits tab keeps the Groups
              // tab's action rather than offering none.
              label: activeTab === "friends" ? "Invite a friend" : "Create a group",
              iconWeight: activeTab === "friends" ? "bulk" : "bold",
              iconSize: activeTab === "friends" ? 22 : 20,
              onPress: () => {
                if (activeTab === "friends") {
                  setInviteVisible(true);
                } else {
                  router.push("/group/new");
                }
              }
            }}
          />
        </View>
      }
    >
      {/* Dropped past the picnic — `styles.tabRow`'s own 8pt, plus however much
          of the scene there is to clear. */}
      <View style={[styles.tabRow, { marginTop: spacing.xs + sceneDrop }]}>
        <SegmentedControl options={HABITS_TAB} value={activeTab} onChange={setActiveTab} style={styles.tabHabits} />
        <SegmentedControl options={SOCIAL_TABS} value={activeTab} onChange={setActiveTab} style={styles.tabSocial} />
      </View>

      {activeTab === "habits" ? (
      <View style={styles.habitsSections}>
        {initialLoading ? (
          <GroupCardSkeleton />
        ) : groupsWithHabitsToday.length ? (
          groupsWithHabitsToday.map((group) => (
            <GroupHabitsCard
              key={group.id}
              group={group}
              myLumoId={myLumoId}
              busyHabitId={busyHabitId}
              onOpen={() => router.push(`/group/${group.id}`)}
              onToggle={(habit) => logGroupHabit(group, habit)}
              onUndo={(habit) => confirmUndoGroupHabit(group, habit)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <EmptyState
              icon="taskSquare"
              title={groups.length ? "Nothing due today" : "No group habits yet"}
              body={
                groups.length
                  ? "None of your groups have an activity scheduled for today — enjoy the breather."
                  : "Join or create a group and its shared activities will gather here each day."
              }
            />
          </View>
        )}
      </View>
      ) : activeTab === "friends" ? (
      <View style={styles.section}>
        {initialLoading ? (
          <FriendsSkeleton />
        ) : friends.length ? (
          <View style={[styles.friendsCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
            {friends.map((friend, index) => (
              <View
                key={friend.profile.lumoId}
                style={[
                  styles.friendRow,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }
                ]}
              >
                {/* Circular, the way the avatar renders everywhere else. It was
                    a square-clipped portrait inside a tinted disc, which sheared
                    the bust off along a flat line — the art carries its own
                    background, so clipping it round IS the disc. */}
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
            ))}
          </View>
        ) : (
          // On the canvas, not in a card — the same treatment Habits gives an
          // empty filter. A card around an empty state draws a box around
          // nothing.
          <View style={styles.emptyState}>
            <EmptyState
              icon="friends"
              title={syncOffline ? "Friends are syncing soon" : "No friends yet"}
              body={
                syncOffline
                  ? "Friend connections sync in an upcoming update. Share your Lumo ID or QR now so friends are ready to add you."
                  : "Share your Lumo ID and start cheering each other on."
              }
            />
          </View>
        )}
      </View>
      ) : (
      // Owned and joined groups are one list to the reader, so the seam between
      // the two sections takes the same 8pt the cards inside them do. It was
      // inheriting the screen's 24pt stack gap, which read as a section break
      // with no heading to explain it.
      <View style={styles.groupSections}>
        {/* Hidden entirely when there are no owned groups — the invited
            section below always shows and carries the tab's empty state. */}
        {initialLoading || myGroups.length ? (
          <View style={styles.groupList}>
            {initialLoading ? (
              <GroupCardSkeleton />
            ) : (
              myGroups.map((group) => (
                <GroupCard key={group.id} group={group} onPress={() => router.push(`/group/${group.id}`)} />
              ))
            )}
          </View>
        ) : null}

        {/* Invited/joined groups. The empty state only shows when the user has
            NO groups at all — once any owned or joined group exists, this
            section is hidden rather than showing an empty "joined" card. */}
        {initialLoading || invitedGroups.length || !myGroups.length ? (
        <View style={styles.groupList}>
          {initialLoading ? (
            <GroupCardSkeleton />
          ) : invitedGroups.length ? (
            invitedGroups.map((group) => <GroupCard key={group.id} group={group} onPress={() => router.push(`/group/${group.id}`)} />)
          ) : (
            // Was a bare icon over a line of grey text in a card — the only
            // empty state in the app not using the shared component, so it had
            // no mascot, no heading, and no way out of the state it described.
            <View style={styles.emptyState}>
              {/* No CTA — the header's + is the way to create one, and a button
                  here would be a second front door to the same thing. */}
              <EmptyState
                icon="elementPlus"
                title="No groups yet"
                body="Tap + to create one with friends — every member's check-ins add up to the same goal."
              />
            </View>
          )}
        </View>
        ) : null}
      </View>
      )}

      {/* The invitations inbox. A sheet rather than a third tab: you open it,
          clear it, and leave — and this way the count on the bar is readable
          from both tabs instead of only from the one you are standing on. */}
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
              // something the user has to go and fix.
              <EmptyState
                quiet
                icon="userCircleAdd"
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
    gap: spacing.lg
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
  // On the canvas rather than in a card, matching the Habits screen: a card
  // drawn around an empty state is a box around nothing.
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xl
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
   * Two gaps, and the ratio between them is what does the grouping: the space
   * inside a block stays half the space between two of them, so the heading
   * reads as belonging to the card under it rather than floating between two.
   * Both moved up together for that reason — at 16 inside a 24 outer the two
   * were close enough that the grouping stopped reading.
   */
  habitsSections: {
    gap: spacing.xl
  },
  habitsGroup: {
    gap: spacing.md
  },
  // One card per group on the Habits tab. Rows run edge to edge inside it, so
  // the card only insets horizontally and the rows carry their own height.
  /**
   * LIST_CARD_PADDING, so this lines up with the friend rows and group cards
   * on the same screen rather than with the roomier home habits card. These
   * rows carry no icon tile, so the tighter inset is what keeps the list light
   * — at 20 the card read as padded around a row that had nothing in it.
   */
  habitsCard: {
    borderRadius: radius.card,
    paddingHorizontal: LIST_CARD_PADDING,
    paddingVertical: spacing.xxs,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  // Inset by the card's own padding so the name lines up with the habit names
  // under it rather than with the card's edge.
  habitsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: LIST_CARD_PADDING
  },
  habitsAvatar: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  habitsGroupName: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamilies.lexendBold,
    fontSize: 14,
    lineHeight: 19
  },
  habitsCount: {
    flexShrink: 0,
    fontFamily: fontFamilies.lexendSemiBold
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
  habitIcon: {
    width: 24,
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
  // Two controls, not one — see the note on HABITS_TAB. Laid out exactly as
  // the Habits screen lays out its own split filters.
  //
  // The negative margin pulls up against the header's own marginBottom, which
  // the screen's 24pt stack gap already covers; carrying both put 40pt above
  // the tabs.
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    /**
     * 8 on top of the header's own 16pt margin, for the same 24 Habits leaves
     * under its bar.
     *
     * This used to be -16, cancelling that margin: with the header inside the
     * scroller the page's 24pt stack gap landed under it as well, and the two
     * together were too much. Pinned, the stack gap is gone and the negative
     * margin left the tabs touching the bar.
     */
    marginTop: spacing.xs,
    // Takes the gap below up to the same 32 the sections use between blocks, so
    // the tabs sit in the page's own rhythm rather than a tighter one.
    marginBottom: spacing.xs
  },
  tabHabits: {
    flexShrink: 0,
    // `segment` is flex:1 (flexBasis:0), so in a single-option control with no
    // width the pill would collapse to its padding. Give it an explicit floor.
    minWidth: 88
  },
  tabSocial: {
    flex: 1
  },
  section: {
    gap: spacing.sm
  },
  // Tighter than `section`: group cards are tall, and at 12pt apart a column of
  // them read as separate blocks rather than as one list.
  groupList: {
    gap: spacing.xs
  },
  // The seam between owned and joined groups — the same 8pt, so the two
  // sections read as one continuous list.
  groupSections: {
    gap: spacing.xs
  },
  // Friend rows — the group card's inset, not spacing.lg. At 24 the friend rows
  // sat 8pt further in than the group cards one tab over, so the two lists on
  // this screen did not share a left edge.
  friendsCard: {
    borderRadius: radius.card,
    paddingHorizontal: LIST_CARD_PADDING,
    paddingVertical: spacing.xs,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
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
  skeletonLines: {
    flex: 1,
    gap: 6
  },
  // The chip row's own gap, matching `groupHabits`. No marginTop — the card's
  // gap already owns the space above it.
  skeletonChips: {
    flexDirection: "row",
    gap: spacing.xxs
  },
  // One gap between the header and the chip row, set here. It used to be this
  // gap PLUS a marginTop on the scroller, which is two numbers describing one
  // piece of space — and the skeleton only ever copied one of them.
  groupCard: {
    // The card's only two children are the header and the activity chips, so
    // this gap is entirely the space above the chips — they were sitting close
    // enough to the member faces above them to read as part of that row.
    gap: spacing.md,
    borderRadius: radius.card,
    // Roomier than LIST_CARD_PADDING, which the flatter friend rows use. This
    // card carries three tiers — avatar and name, a streak badge and stacked
    // faces, then the activity chips — and at the list inset they were packed
    // against its edges.
    padding: spacing.ml,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  groupHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  groupName: {
    fontFamily: fontFamilies.lexendBold
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
  groupHabitsScroll: {
    // Escapes groupCard's padding, NOT the screen gutter — must track it.
    marginHorizontal: -spacing.ml
  },
  groupHabits: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.ml
  },
  groupHabitChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4
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
