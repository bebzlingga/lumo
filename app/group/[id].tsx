import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React from "react";
import {
  Alert,
  Animated,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  Share,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { SegmentedControl } from "@/components/controls";
import { FireIcon } from "@/components/FireIcon";
import { GroupActivityRow } from "@/components/GroupActivityRow";
import { GroupBackdrop, useGroupBackdropSubjectBottom } from "@/components/GroupBackdrop";
import { GroupInviteModal } from "@/components/GroupInviteModal";
import { CROWN_GOLD, GroupMemberRow } from "@/components/GroupMemberRow";
import { GroupWinCelebration } from "@/components/GroupWinCelebration";
import { GroupRollCall } from "@/components/GroupRollCall";
import { chartTrackColor } from "@/components/StatisticsViews";
import { Icon, type IconName } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/states";
import { AppText, Card, Screen } from "@/components/ui";
import { fontFamilies, habitAccent, radius, spacing, tileRadius } from "@/constants/theme";
import {
  bestEarnedTrophy,
  challengeByName,
  challengeProgressFor,
  countWonChallenges,
  earnedTrophies,
  groupChallengeTierMeta,
  groupScoreForXp,
  groupTrophies,
  groupXpFromCounts,
  productivityChallenges,
  trophyVariantIcon
} from "@/constants/groupChallenges";
import { useLumo } from "@/context/LumoContext";
import { buildGroupAvatarSvg, defaultAvatar } from "@/lib/avatar";
import { alpha } from "@/lib/color";
import { addDays, parseDateKey, toDateKey } from "@/lib/date";
import {
  friendsService,
  scheduledGroupHabitsOn,
  type Friendship,
  type Group,
  type GroupActivity,
  type GroupMember,
  type GroupReaction,
  type MemberDayStatus
} from "@/lib/friends";
import { formatLumoId } from "@/lib/lumoId";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EMPTY_WEEK: MemberDayStatus[] = ["none", "none", "none", "none", "none", "none", "none"];
// Logs tab starts by showing this many days, revealing more as you scroll down.
/** The figures card's own inset, shared by the cards that copy its shape. */
const STATS_CARD_PADDING = spacing.md;

/** The share of the backdrop's subject zone the identity block rides up into. */
const HERO_OVERLAP = 0.7;

/**
 * The backdrop's picnic, pulled up a little further here than on the Friends tab.
 *
 * This page carries the group's own face — a 104pt avatar and its name — under
 * the scene rather than a row of tabs, so it needs the extra room, and the art
 * has sky to spare at the top. Kept just under the ceiling `GROUP_PLATE_LIFT`
 * documents: past ~0.07 the centre Lumo's flame reaches the page bar.
 */
const BACKDROP_LIFT = 0.07;

const LOG_DAYS_PAGE = 3;

/**
 * The two nav tiles' plates: the trail to a flagged summit, and the cup on its
 * podium. Both are 640 × 480 with the scene running to the edge — the earlier
 * pair were wide banners with a cream mat and a rounded frame baked in, which
 * fitted to the tile's WIDTH and left the subject blown up across a thin strip.
 * At 4:3 they sit within a couple of percent of the tile's own proportions, so
 * they are COVERED edge to edge and almost nothing is cropped.
 */
const CHALLENGE_ART = require("../../assets/GroupChallenge.webp");
const TROPHY_ART = require("../../assets/GroupTrophies.webp");
/**
 * Each tile's palette, sampled from its own plate: the mat is the card colour
 * behind the art (what shows while it decodes, and in the corners the card's
 * radius rounds off), and the ink is the copy laid over the plate's open left.
 */
const CHALLENGE_MAT = "#FDD5D3";
const CHALLENGE_INK = "#7E2F3A";
const TROPHY_MAT = "#E5E5B8";
const TROPHY_INK = "#1F4A2A";

type GroupTab = "habits" | "stats" | "members" | "logs";

// The app's own segmented control, the one the Friends screen you arrived from
// uses — this screen used to draw a second, taller pill bar of its own.
const GROUP_TABS: { label: string; value: GroupTab }[] = [
  { label: "Habits", value: "habits" },
  { label: "Stats", value: "stats" },
  { label: "Team", value: "members" },
  { label: "Logs", value: "logs" }
];

// "Today" / "Yesterday" / "Monday, Jul 21" heading for a day of log entries.
function formatLogDay(iso: string): string {
  const dayKey = toDateKey(new Date(iso));
  const todayKey = toDateKey();

  if (dayKey === todayKey) {
    return "Today";
  }

  if (dayKey === addDays(todayKey, -1)) {
    return "Yesterday";
  }

  return parseDateKey(dayKey).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatLogTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * The habit page's metadata chip: a wash of the ink colour carrying a small
 * glyph and label. Deliberately quiet — these repeat figures the card below
 * states properly, so they read as a subtitle to the name rather than as a
 * second heading level.
 */
function MetaChip({
  icon,
  label,
  tint,
  color,
  // A chip whose label is a bare figure ("6") needs the noun spelled out for a
  // screen reader — the glyph that supplies it visually is decorative.
  accessibilityLabel
}: {
  icon: IconName;
  label: string;
  tint?: string;
  color?: string;
  accessibilityLabel?: string;
}) {
  const { palette } = useLumo();

  return (
    <View
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[styles.chip, { backgroundColor: tint ?? alpha(palette.ink, "14") }]}
    >
      <Icon name={icon} size={12} color={color ?? palette.subtle} weight="bulk" />
      <AppText variant="caption" color={color ?? palette.body} numberOfLines={1} style={styles.chipLabel}>
        {label}
      </AppText>
    </View>
  );
}

// Half-width nav tile ("Challenges" / "Trophies"), the artwork carrying the
// card. The big value/total stands in for an icon.
function NavCard({
  accessibilityLabel,
  onPress,
  art,
  mat,
  ink,
  value,
  total,
  title,
  caption
}: {
  accessibilityLabel: string;
  onPress: () => void;
  art: ImageSourcePropType;
  /** The plate's own card and copy colours — see CHALLENGE_MAT. */
  mat: string;
  ink: string;
  value: number;
  total: number;
  title: string;
  caption: string;
}) {
  const { palette, isDark } = useLumo();

  return (
    // Outer lifts, inner clips. The tile has to hide its artwork's overflow to
    // keep it inside the rounded corners, and on iOS a view that clips its own
    // children masks its shadow away with them — so the lift lives out here,
    // where nothing is being clipped.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navCardPressable,
        { shadowColor: isDark ? "transparent" : palette.shadow, opacity: pressed ? 0.9 : 1 }
      ]}
    >
      <Card style={[styles.navCard, { backgroundColor: mat }]}>
        {/* Anchored BOTTOM-RIGHT rather than filling from the centre.
            `absoluteFill` + cover crops evenly off all four sides, which took
            the same slice off the corner the art actually puts its subject in.
            Pinning two edges and over-sizing the plate means the crop is spent
            on the top and left, where both plates are open background. */}
        <Image source={art} resizeMode="cover" style={styles.navCardArt} />
        {/* Both plates keep their left side open for exactly this. */}
        <View style={styles.navCardBody}>
          <View style={styles.navCardStat}>
            <AppText color={ink} style={styles.navCardStatValue}>
              {value}
            </AppText>
            <AppText color={ink} style={styles.navCardStatTotal}>
              /{total}
            </AppText>
          </View>
          <AppText variant="titleSmall" color={ink} numberOfLines={1} style={styles.navCardTitle}>
            {title}
          </AppText>
          <AppText variant="caption" color={alpha(ink, "E6")} numberOfLines={1} style={styles.navCardCaption}>
            {caption}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}

/** Heading for a section inside the Stats tab — the habit page's card title. */
function CardTitle({ children }: { children: React.ReactNode }) {
  const { palette } = useLumo();

  return (
    <AppText variant="titleSmall" color={palette.ink} style={styles.cardTitle}>
      {children}
    </AppText>
  );
}

export default function GroupDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette, isDark, lumoIdSuffix } = useLumo();
  const [loadedGroup, setLoadedGroup] = React.useState<Group | null>(null);
  const [reactions, setReactions] = React.useState<GroupReaction[]>([]);
  const [activity, setActivity] = React.useState<GroupActivity[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<GroupTab>("habits");
  const [refreshing, setRefreshing] = React.useState(false);
  /**
   * Drives the backdrop's fade — see GroupBackdrop.
   *
   * Set by hand from `handleScroll` rather than by `Animated.event`: `Screen`
   * accepts one onScroll and this page already had one, so the two share it.
   * The JS driver either way — a plain ScrollView has nothing for a native
   * driver to attach to, and one interpolated opacity per frame is cheap.
   */
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const [visibleLogDays, setVisibleLogDays] = React.useState(LOG_DAYS_PAGE);
  // Invite sheet: accepted friends, with per-row sent state.
  const [inviteVisible, setInviteVisible] = React.useState(false);
  const [friends, setFriends] = React.useState<Friendship[]>([]);
  const [invitedIds, setInvitedIds] = React.useState<Set<string>>(() => new Set());
  // The plate fills the screen now, so the identity block is dropped to where
  // the picnic finishes rather than starting straight under the header and
  // running across it. The header is measured instead of assumed: its height
  // moves with the Dynamic Island / notch inset.
  const insets = useSafeAreaInsets();
  // The same wash Profile's charts use — `chartTrack` at full strength is the
  // warm sand, which reads as its own filled bar beside a short one.
  const trackColor = chartTrackColor(palette, isDark);
  const subjectBottom = useGroupBackdropSubjectBottom(BACKDROP_LIFT);
  const [headerBottom, setHeaderBottom] = React.useState(0);
  const handleHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      setHeaderBottom(insets.top + y + height);
    },
    [insets.top]
  );
  /**
   * How far the identity block sits below the page bar.
   *
   * `subjectBottom` is where the backdrop's scene finishes, and the block used
   * to clear it completely — which put the avatar a third of the way down the
   * screen. It only rides down PART of that gap now: the lower stretch of that
   * zone is the picnic blanket rather than the characters on it, and the plate
   * fades as the page scrolls anyway, so overlapping it costs nothing and buys
   * back the space the group's own face should be in.
   */
  const heroDrop = headerBottom > 0 ? Math.max(0, (subjectBottom - headerBottom) * (1 - HERO_OVERLAP)) : 0;
  const myLumoId = formatLumoId(lumoIdSuffix);
  const groupAvatarSvg = React.useMemo(
    () => (loadedGroup ? buildGroupAvatarSvg(loadedGroup.avatarSeed ?? loadedGroup.id) : ""),
    [loadedGroup?.avatarSeed, loadedGroup?.id]
  );

  // Log entries (newest first) bucketed into consecutive day groups for the Logs tab.
  const activityByDay = React.useMemo(() => {
    const days: { key: string; label: string; items: GroupActivity[] }[] = [];

    for (const entry of activity) {
      const key = toDateKey(new Date(entry.at));
      const current = days[days.length - 1];

      if (!current || current.key !== key) {
        days.push({ key, label: formatLogDay(entry.at), items: [entry] });
      } else {
        current.items.push(entry);
      }
    }

    return days;
  }, [activity]);

  // Re-collapse the logs to the first page whenever we leave the Logs tab, so
  // returning to it starts fresh at LOG_DAYS_PAGE days again.
  React.useEffect(() => {
    if (activeTab !== "logs") {
      setVisibleLogDays(LOG_DAYS_PAGE);
    }
  }, [activeTab]);

  // Infinite scroll for the Logs tab: reveal more days as the page nears the
  // bottom. All activity is already loaded, so this is purely client-side.
  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Feeds the backdrop's fade first — `Screen` takes a single onScroll, and
      // the early return below is only about paging the log, so tracking after
      // it would have frozen the fade on every other tab.
      scrollY.setValue(event.nativeEvent.contentOffset.y);

      if (activeTab !== "logs") {
        return;
      }

      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);

      if (distanceToBottom < 320) {
        setVisibleLogDays((current) => (current < activityByDay.length ? current + LOG_DAYS_PAGE : current));
      }
    },
    [activeTab, activityByDay.length]
  );

  const loadAll = React.useCallback(async () => {
    if (typeof id !== "string") {
      return;
    }

    // Record this visit first so the roll-call streak reflects today's check-in
    // in the data we're about to load.
    await friendsService.recordGroupCheckin(id);
    const [group, todayReactions, loadedFriends, loadedActivity] = await Promise.all([
      friendsService.getGroup(id),
      friendsService.listTodayReactions(id),
      friendsService.listFriends(),
      friendsService.listGroupActivity(id)
    ]);
    setLoadedGroup(group);
    setReactions(todayReactions);
    setFriends(loadedFriends.filter((friendship) => friendship.status === "accepted"));
    setActivity(loadedActivity);
    setLoaded(true);
  }, [id]);

  useFocusEffect(
    React.useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  if (!loaded) {
    // Mirrors the real layout: avatar beside the title, chips, the roll-call
    // row, the figures card, the tab bar, then activity cards. The nav tiles
    // sit at the foot of the page, past where this reaches.
    return (
      <Screen contentStyle={styles.content}>
        <ScreenHeader leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />
        <View style={styles.hero}>
          <Skeleton width={104} height={104} round />
          <Skeleton width={180} height={30} />
          <Skeleton width={220} height={18} />
        </View>
        <Skeleton height={90} style={styles.skeletonCard} />
        <Skeleton height={148} style={styles.skeletonCard} />
        <Skeleton height={40} style={styles.skeletonPill} />
        {[0, 1].map((index) => (
          <Skeleton key={index} height={104} style={styles.skeletonCard} />
        ))}
      </Screen>
    );
  }

  if (!loadedGroup) {
    return (
      <Screen contentStyle={styles.content}>
        <ScreenHeader leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />
        <EmptyState
          icon="friends"
          title="Group not found"
          body="This group is no longer available — it may have been deleted by its owner."
        />
      </Screen>
    );
  }

  // Narrowed once, so every handler below closes over a non-null group.
  const group = loadedGroup;
  const memberCount = group.members.length;

  // The trophy shelf, resolved live from the group's synced metrics — the page's
  // rank chip, its trophy count and its celebration all read from this one list.
  // Plain consts (not useMemo): this runs after the early-return guards above,
  // so a hook here would break the rules-of-hooks order.
  const trophyMetrics = {
    members: memberCount,
    completions: group.progress,
    streak: group.streak,
    rollCallStreak: group.rollCallStreak,
    challengesWon: countWonChallenges(group.habits, group.completedDaysByHabit)
  };
  const trophies = earnedTrophies(trophyMetrics);
  // The group's rank, which used to be the highest milestone on the ladder and is
  // now the best trophy on the shelf — the shelf tests the same metrics, so
  // nothing about what a group is proud of changed with the ladder's removal.
  const rank = bestEarnedTrophy(trophyMetrics);
  const rankAccent = rank ? groupChallengeTierMeta[rank.tier].accent : palette.muted;

  // Group Score (XP) — powers the level chip + the level-up celebration.
  const countByHabit: Record<string, number> = {};
  for (const habit of group.habits) {
    countByHabit[habit.id] = group.members.reduce((sum, member) => sum + (member.contributionByHabit?.[habit.id] ?? 0), 0);
  }
  const groupScore = groupScoreForXp(groupXpFromCounts(group.habits, countByHabit));
  // How many of the built-in challenges the group has taken on.
  const activeChallengeCount = group.habits.filter((habit) => challengeByName(habit.name)).length;

  const sortedMembers = [...group.members].sort((a, b) => b.contribution - a.contribution);
  const maxContribution = Math.max(1, ...group.members.map((member) => member.contribution));
  const topContributor = sortedMembers.find((member) => member.contribution > 0) ?? null;

  // Aggregate the current week's per-member, per-habit statuses.
  const doneByHabit: Record<string, number> = {};
  const doneByDay = [0, 0, 0, 0, 0, 0, 0];
  const doneByMember: Record<string, number> = {};

  for (const member of group.members) {
    for (const habit of group.habits) {
      const week = member.weekByHabit?.[habit.id] ?? EMPTY_WEEK;

      week.forEach((status, dayIndex) => {
        if (status === "done") {
          doneByHabit[habit.id] = (doneByHabit[habit.id] ?? 0) + 1;
          doneByDay[dayIndex] += 1;
          doneByMember[member.profile.lumoId] = (doneByMember[member.profile.lumoId] ?? 0) + 1;
        }
      });
    }
  }

  const perfectDays = doneByDay.filter((count) => count === memberCount * group.habits.length && count > 0).length;
  const bestDayIndex = doneByDay.some((count) => count > 0) ? doneByDay.indexOf(Math.max(...doneByDay)) : -1;
  const mostConsistent =
    group.members.length && Object.keys(doneByMember).length
      ? group.members.reduce((best, member) =>
          (doneByMember[member.profile.lumoId] ?? 0) > (doneByMember[best.profile.lumoId] ?? 0) ? member : best
        )
      : null;

  // --- Roll call, weekly MVP, cheers & nudges ---
  const checkedInCount = group.members.filter((member) => member.checkedInToday).length;
  const inTodayRate = memberCount ? Math.round((checkedInCount / memberCount) * 100) : 0;
  const mvp = group.members.reduce(
    (best: GroupMember | null, member) =>
      member.weekCompletions > 0 && member.weekCompletions > (best?.weekCompletions ?? 0) ? member : best,
    null
  );
  const cheersFor = (member: GroupMember) =>
    reactions.filter((reaction) => reaction.kind === "cheer" && reaction.recipientId === member.profile.id).length;
  // Today's day-bound activities → each member's roll-call progress ring
  // fraction. Uses the same shared rule as the service, so the ring can't
  // disagree with the roll call or the group streak.
  const scheduledTodayHabits = scheduledGroupHabitsOn(group.habits, toDateKey());
  const rollCallProgress = (member: GroupMember) => {
    if (!scheduledTodayHabits.length) {
      return member.checkedInToday ? 1 : 0;
    }

    return scheduledTodayHabits.filter((habit) => member.completedTodayHabitIds.includes(habit.id)).length / scheduledTodayHabits.length;
  };
  const me = group.members.find((member) => member.profile.lumoId === myLumoId);
  const myCheers = me ? cheersFor(me) : 0;
  // 3 cheers per group per day — dim the cheer buttons once they're spent.
  const outOfCheers =
    reactions.filter((reaction) => reaction.kind === "cheer" && me?.profile.id && reaction.senderId === me.profile.id).length >= 3;
  const eligibleFriends = friends.filter(
    (friend) => !group.members.some((member) => member.profile.lumoId === friend.profile.lumoId)
  );
  // Already invited = flagged this session OR a server-side pending invite
  // (persists across sessions; clears when the invitee declines).
  const isAlreadyInvited = (lumoId: string) => invitedIds.has(lumoId) || group.pendingInviteeLumoIds.includes(lumoId);
  /**
   * Inviting is the owner's to do (see `Group.ownedByMe`), and the MENU always
   * offers it to them. It used to also require at least one invitable friend,
   * so an owner with nobody left to add found no invite entry anywhere and no
   * explanation — a menu item that vanishes reads as a missing feature. The
   * sheet says why instead ("All of your friends are already in this group").
   */
  const canInvite = group.ownedByMe;
  // The header button is the one that stays gated: a bare icon with nothing
  // behind it is a dead control, and unlike a menu row it can't explain itself.
  const hasInvitableFriends = eligibleFriends.some((friend) => !isAlreadyInvited(friend.profile.lumoId));

  async function sendCheer(member: GroupMember) {
    if (!member.profile.id) {
      return;
    }

    const result = await friendsService.cheerMember(group.id, member.profile.id);

    if (result === "ok") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReactions((current) => [
        { kind: "cheer", senderId: me?.profile.id ?? "", senderName: "", recipientId: member.profile.id!, at: new Date().toISOString() },
        ...current
      ]);
    } else if (result === "limit") {
      Alert.alert("Out of cheers", "You've sent your 3 cheers in this group today — they recharge tomorrow!");
    } else {
      Alert.alert("Couldn't send", "Please check your connection and try again.");
    }
  }

  async function sendNudge(member: GroupMember) {
    if (!member.profile.id) {
      return;
    }

    const result = await friendsService.nudgeMember(group.id, member.profile.id);

    if (result === "ok") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Nudge sent", `${member.profile.nickname || "Your friend"} will see you're waiting on them.`);
    } else if (result === "already") {
      Alert.alert("Already nudged", "One nudge per friend per day — give them a moment!");
    } else {
      Alert.alert("Couldn't send", "Please check your connection and try again.");
    }
  }

  function handleMemberTap(member: GroupMember) {
    if (member.profile.lumoId === myLumoId) {
      return;
    }

    const name = member.profile.nickname || "Lumo user";
    Alert.alert(name, member.checkedInToday ? "All checked in today!" : "Hasn't checked in yet today.", [
      { text: "Send a cheer", onPress: () => sendCheer(member) },
      ...(!member.checkedInToday ? [{ text: "Nudge", onPress: () => sendNudge(member) }] : []),
      { text: "Cancel", style: "cancel" as const }
    ]);
  }

  function handleRemoveMember(member: GroupMember) {
    if (!member.profile.id) {
      return;
    }

    const memberId = member.profile.id;
    const name = member.profile.nickname || "this member";
    Alert.alert("Remove member?", `Remove ${name} from the group? Their progress stays saved and comes back if you add them again.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const ok = await friendsService.removeMember(group.id, memberId);

          if (ok) {
            loadAll();
          } else {
            Alert.alert("Couldn't remove", "Please check your connection and try again.");
          }
        }
      }
    ]);
  }

  // Members check activities off right here — group activities live only in
  // the group, so there's no personal habit copy to complete instead.
  async function toggleCheckIn(habit: Group["habits"][number]) {
    if (!me) {
      return;
    }

    const doneToday = me.completedTodayHabitIds.includes(habit.id);
    const target = habit.goal.type === "multiple" ? habit.goal.count : 1;
    const ok = await friendsService.syncCompletion(habit.id, toDateKey(), doneToday ? 0 : target);

    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadAll();
    }
  }

  // Multi-count activities check in one rep at a time (the ring fills up).
  async function incrementCheckIn(habit: Group["habits"][number]) {
    if (!me || habit.goal.type !== "multiple") {
      return;
    }

    const current = me.todayCountByHabit?.[habit.id] ?? 0;
    const ok = await friendsService.syncCompletion(habit.id, toDateKey(), Math.min(habit.goal.count, current + 1));

    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadAll();
    }
  }

  // Long press undoes: one rep off multi-count activities, the whole day for
  // single-count ones.
  async function undoCheckIn(habit: Group["habits"][number]) {
    if (!me) {
      return;
    }

    const current = me.todayCountByHabit?.[habit.id] ?? 0;

    if (current <= 0) {
      return;
    }

    const next = habit.goal.type === "multiple" ? current - 1 : 0;
    const ok = await friendsService.syncCompletion(habit.id, toDateKey(), next);

    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      loadAll();
    }
  }

  // Completing the hold arms the undo; this dialog confirms it before anything
  // is removed.
  function confirmUndoCheckIn(habit: Group["habits"][number]) {
    if (!me) {
      return;
    }

    const current = me.todayCountByHabit?.[habit.id] ?? 0;

    if (current <= 0) {
      return;
    }

    const multiple = habit.goal.type === "multiple";
    Alert.alert("Undo check-in?", multiple && current > 1 ? `Remove one check-in from ${habit.name}?` : `Undo ${habit.name} for today?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Undo", style: "destructive", onPress: () => undoCheckIn(habit) }
    ]);
  }

  function shareRecap() {
    if (!group.lastWeek) {
      return;
    }

    const lines = [
      `Last week in "${group.name}" on Lumo`,
      `• ${group.lastWeek.total} ${group.lastWeek.total === 1 ? "completion" : "completions"} together`,
      group.lastWeek.mvpName ? `• MVP: ${group.lastWeek.mvpName} (${group.lastWeek.mvpCount})` : null,
      `• ${group.lastWeek.perfectDays} perfect ${group.lastWeek.perfectDays === 1 ? "day" : "days"}`,
      "Building habits together!"
    ].filter(Boolean);

    Share.share({ message: lines.join("\n") }).catch(() => undefined);
  }

  async function inviteFriend(friend: Friendship) {
    const result = await friendsService.inviteToGroup(group.id, friend.profile.lumoId);

    if (result === "ok" || result === "already") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setInvitedIds((current) => new Set(current).add(friend.profile.lumoId));
    } else {
      Alert.alert("Couldn't invite", "Please check your connection and try again.");
    }
  }

  function confirmDeleteGroup() {
    Alert.alert("Delete group?", "This removes the group, its activities, and everyone's progress. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const ok = await friendsService.deleteGroup(group.id);

          if (ok) {
            router.back();
          } else {
            Alert.alert("Couldn't delete", "Please check your connection and try again.");
          }
        }
      }
    ]);
  }

  function confirmLeave() {
    Alert.alert("Leave group?", "You'll stop contributing to this group's habits.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          await friendsService.leaveGroup(group.id);
          router.back();
        }
      }
    ]);
  }

  /**
   * Every group-level action in one sheet, the way the habit page gathers edit,
   * pause, complete and delete behind a single "…". These were three separate
   * controls in three different places — a trash icon in the header, an invite
   * button floating over the artwork, and a full-width Leave button that only
   * existed while the Team tab happened to be open.
   */
  function openOverflow() {
    const options: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];

    if (group.ownedByMe) {
      options.push({ text: "Edit group", onPress: () => router.push(`/group/new?editId=${group.id}` as Href) });
    }

    if (canInvite) {
      options.push({ text: "Invite friends", onPress: () => setInviteVisible(true) });
    }

    if (group.lastWeek) {
      options.push({ text: "Share last week's recap", onPress: shareRecap });
    }

    options.push(
      group.ownedByMe
        ? { text: "Delete group", style: "destructive", onPress: confirmDeleteGroup }
        : { text: "Leave group", style: "destructive", onPress: confirmLeave }
    );
    options.push({ text: "Cancel", style: "cancel" });

    Alert.alert(group.name, undefined, options);
  }

  // Habits shown on the Habits tab — completed challenges drop off (their data
  // still lives on the Challenges screen + trophies).
  const visibleHabits = group.habits
    .filter((habit) => {
      const challenge = challengeByName(habit.name);

      if (!challenge) {
        return true;
      }

      const daysDone = group.completedDaysByHabit[habit.id]?.length ?? 0;

      return !challengeProgressFor(challenge, daysDone).complete;
    })
    // Habits I've already done today sink to the bottom (stable within each group).
    .sort((a, b) => {
      const aDone = me?.completedTodayHabitIds.includes(a.id) ? 1 : 0;
      const bDone = me?.completedTodayHabitIds.includes(b.id) ? 1 : 0;

      return aDone - bDone;
    });

  return (
    // The social plate — the picnic this page shares with the Friends tab — so
    // the generic landscape is switched off rather than layered under it. See
    // GroupBackdrop for why it isn't a `backgroundVariant`.
    <Screen
      backgroundVariant={null}
      backgroundNode={<GroupBackdrop scrollY={scrollY} lift={BACKDROP_LIFT} />}
      contentStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={palette.greenDark}
          onRefresh={async () => {
            setRefreshing(true);
            await loadAll();
            setRefreshing(false);
          }}
        />
      }
      onScroll={handleScroll}
      scrollEventThrottle={16}
      // Back on the left, everything you can DO to the group on the right — one
      // optional invite button plus the overflow. Pinned rather than scrolled:
      // the way out of a page should not be something you have to scroll back
      // up to find. Still wrapped so its bottom edge can be measured, which is
      // what the identity block drops from.
      stickyHeader={
        <View onLayout={handleHeaderLayout}>
          <ScreenHeader
            leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
            rightActions={[
              ...(canInvite && hasInvitableFriends
                ? [
                    {
                      icon: "userCircleAdd" as IconName,
                      label: "Invite friends",
                      iconWeight: "bulk" as const,
                      iconSize: 22,
                      onPress: () => setInviteVisible(true)
                    }
                  ]
                : []),
              { icon: "dotsThree" as IconName, label: "Group options", onPress: openOverflow }
            ]}
          />
        </View>
      }
    >
      {/* Identity centred and stacked: avatar, name, badges. It used to run
          down the left, because the plate behind it pinned Lumo to the
          top-right and a centred avatar landed under him. The plate is centred
          now, so the column can be too — and the group's own face reads as the
          subject of the page rather than a thumbnail beside a heading. */}
      <View style={[styles.hero, { marginTop: heroDrop - spacing.md }]}>
        <Avatar svg={groupAvatarSvg} size={104} backgroundColor={palette.greenSoft} />
        <AppText color={palette.ink} numberOfLines={2} style={styles.title}>
          {group.name}
        </AppText>
        {/* Two chips, not four: the badge the group has actually earned, and how
            many of them there are. The level lives in the figures card below and
            was being stated twice; "members" spelled out beside a Users glyph
            was the glyph's own caption. */}
        <View style={[styles.chipRow, styles.heroChipRow]}>
          <MetaChip
            icon={rank ? trophyVariantIcon[rank.variant] : "award"}
            label={rank ? rank.name : "Unranked"}
            tint={alpha(rankAccent, "1F")}
            color={rankAccent}
          />
          <MetaChip
            icon="friends"
            label={`${memberCount}`}
            accessibilityLabel={`${memberCount} ${memberCount === 1 ? "member" : "members"}`}
          />
        </View>
      </View>

      {/* Who is here today, straight under the group's name — the faces ARE the
          group, so they open the page rather than closing the figures card the
          way they used to. Down there they read as a legend for the arithmetic
          above them, and you had to get past three numbers to find out whether
          anyone had shown up.

          It bleeds past the screen's gutter itself, so it wants no wrapper here —
          nesting it in one would stop the last face at the margin instead of
          letting it scroll off the edge. */}
      <GroupRollCall
        members={group.members}
        myLumoId={myLumoId}
        myCheers={myCheers}
        cheersFor={cheersFor}
        progressFor={rollCallProgress}
        onMemberPress={handleMemberTap}
      />

      {/* The group's figures in one card, the shape Profile and the habit page
          both use: the two live numbers at display size, the rest in a strip
          under a rule.

          First card on the page, not inside the Stats tab. It lived there so
          the page would not open with arithmetic — but "how are we doing" is
          the question the page exists to answer, and behind a tab it was the
          one thing you had to go looking for.

          Every number appears exactly once. The streak was once in a
          dismissible banner AND a stat tile, the completions total in the strip
          AND a tile, the level in a chip AND the strip — so "how is this group
          doing" had four different answers depending on where you looked. */}
      <View style={[styles.statsCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
        <View style={styles.statsHero}>
          <View style={styles.statsHeroItem}>
            <View style={styles.statsHeroValueRow}>
              <AppText color={palette.ink} style={styles.statsHeroValue}>
                {group.streak}
              </AppText>
              <AppText color={palette.subtle} style={styles.statsHeroUnit}>
                {group.streak === 1 ? "day" : "days"}
              </AppText>
            </View>
            <View style={styles.statsHeroLabelRow}>
              <FireIcon size={13} />
              <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.statsHeroLabel}>
                Group streak
              </AppText>
            </View>
          </View>

          <View style={styles.statsHeroItem}>
            <View style={styles.statsHeroValueRow}>
              <AppText color={palette.ink} style={styles.statsHeroValue}>
                {inTodayRate}
              </AppText>
              {/* A percent sign belongs to the number, so it takes the ink
                  colour, more of the figure's size, and no gap before it. */}
              <AppText color={palette.ink} style={[styles.statsHeroUnit, styles.statsHeroUnitTight]}>
                %
              </AppText>
            </View>
            <View style={styles.statsHeroLabelRow}>
              <Icon name="friends" size={13} color={palette.greenDark} weight="bulk" />
              <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.statsHeroLabel}>
                In today
              </AppText>
            </View>
          </View>
        </View>

        <View style={[styles.statsRule, { backgroundColor: palette.hairline }]} />

        <View style={styles.statsStrip}>
          {[
            { label: "Check-ins", value: `${group.progress}` },
            { label: "Roll-call streak", value: `${group.rollCallStreak}` },
            { label: "Perfect days", value: `${perfectDays}` }
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

      {/* Straight after the faces: challenges and trophies are what the group
          is playing FOR, so they sit with the people playing rather than
          after the arithmetic that scores it — or, as they once did, stranded
          at the foot of the page under whichever tab happened to be open. */}
      <View style={styles.navCardRow}>
        <NavCard
          accessibilityLabel="Group challenges"
          onPress={() => router.push(`/group/challenges?id=${group.id}` as Href)}
          art={CHALLENGE_ART}
          mat={CHALLENGE_MAT}
          ink={CHALLENGE_INK}
          value={activeChallengeCount}
          total={productivityChallenges.length}
          title="Challenges"
          caption="Started"
        />
        <NavCard
          accessibilityLabel="Group trophies"
          onPress={() => router.push(`/group/levels?id=${group.id}` as Href)}
          art={TROPHY_ART}
          mat={TROPHY_MAT}
          ink={TROPHY_INK}
          value={trophies.length}
          total={groupTrophies.length}
          title="Trophies"
          caption="Earned"
        />
      </View>

      <GroupWinCelebration groupName={group.name} trophies={trophies} scoreLevel={groupScore.level} />

      <SegmentedControl options={GROUP_TABS} value={activeTab} onChange={setActiveTab} style={styles.tabs} />

      {activeTab === "habits" ? (
        visibleHabits.length ? (
          // A card per activity. These were one card of hairline-divided rows
          // for a while — home's shape — but a group activity carries far more
          // than a home row does: a share bar, a 14-day strip, and a per-member
          // grid that unfolds underneath. Stacked inside one card those ran
          // together into a single long panel, and the row you expanded had no
          // edges of its own to expand within. No wrapper: the cards are direct
          // children of the page stack, so they take its 8pt rhythm and sit at
          // the same spacing as every other card on the screen.
          <>
            {visibleHabits.map((habit) => (
              <Card key={habit.id} style={styles.habitCard}>
                <GroupActivityRow
                  habit={habit}
                  me={me}
                  members={group.members}
                  memberCount={memberCount}
                  gridDays={group.gridDays}
                  onCheckIn={() => toggleCheckIn(habit)}
                  onIncrement={() => incrementCheckIn(habit)}
                  onUndo={() => confirmUndoCheckIn(habit)}
                />
              </Card>
            ))}
          </>
        ) : (
          <EmptyState
            icon="elementPlus"
            title="No active habits"
            body={
              group.ownedByMe
                ? "Add one from Edit group, or take on a challenge together."
                : "The group owner hasn't added any habits yet."
            }
            quiet
          />
        )
      ) : null}

      {activeTab === "members" ? (
        <Card style={styles.sectionCard}>
          {sortedMembers.map((member, index) => (
            <GroupMemberRow
              key={member.profile.lumoId}
              member={member}
              index={index}
              isLast={index === sortedMembers.length - 1}
              isMvp={mvp?.profile.lumoId === member.profile.lumoId}
              cheers={cheersFor(member)}
              isSelf={member.profile.lumoId === myLumoId}
              canRemove={group.ownedByMe && member.profile.lumoId !== myLumoId}
              outOfCheers={outOfCheers}
              onNudge={() => sendNudge(member)}
              onCheer={() => sendCheer(member)}
              onRemove={() => handleRemoveMember(member)}
            />
          ))}
        </Card>
      ) : null}

      {activeTab === "stats" ? (
        <>
          {/* What the figures card can't say: who is carrying the group, and when. */}
          <Card style={styles.sectionCard}>
            <CardTitle>Contributions</CardTitle>
            <View style={styles.barsRow}>
              {sortedMembers.map((member) => (
                <View key={member.profile.lumoId} style={styles.barItem}>
                  <AppText variant="caption" color={palette.subtle} style={styles.barValue}>
                    {member.contribution}
                  </AppText>
                  <View style={[styles.barTrack, { backgroundColor: trackColor }]}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${(member.contribution / maxContribution) * 100}%`,
                          backgroundColor: alpha(palette.greenDark, "CC")
                        }
                      ]}
                    />
                  </View>
                  <Avatar config={member.profile.avatar ?? defaultAvatar()} size={30} />
                </View>
              ))}
            </View>
            <View style={[styles.cardFooter, { borderTopColor: palette.hairline }]}>
              <AppText variant="caption" color={palette.subtle} style={styles.footerNote}>
                {topContributor
                  ? `${topContributor.profile.nickname || "A member"} leads with ${topContributor.contribution} completions. Keep each other going!`
                  : "Contributions will show up here as members check in."}
              </AppText>
            </View>
          </Card>

          <Card style={styles.sectionCard}>
            <CardTitle>This week</CardTitle>
            {group.habits.map((habit, index, allHabits) => {
              const habitDone = doneByHabit[habit.id] ?? 0;
              const maxHabitDone = Math.max(1, ...group.habits.map((entry) => doneByHabit[entry.id] ?? 0));
              // The activity's own colour, as everywhere else it appears — the
              // chips on the group card, its row's icon and rings. Every row
              // here was the theme green, so four activities that are four
              // colours across the app arrived as one block of sage.
              const habitAccentColor = habitAccent(habit.color, isDark) ?? palette.greenDark;

              return (
                <View
                  key={habit.id}
                  style={[
                    styles.weekHabitRow,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
                    // The card's footer rule sits directly under the last row,
                    // so its own bottom padding stacked with the footer's top
                    // and opened a gap the other rows do not have.
                    index === allHabits.length - 1 && styles.weekHabitRowLast
                  ]}
                >
                  <View style={[styles.weekHabitIcon, { backgroundColor: alpha(habitAccentColor, "14") }]}>
                    <Icon name={habit.icon} size={20} color={habitAccentColor} weight="bulk" />
                  </View>
                  <View style={styles.weekHabitBody}>
                    <View style={styles.weekHabitTop}>
                      <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.weekHabitName}>
                        {habit.name}
                      </AppText>
                      <AppText variant="bodySmall" color={habitAccentColor} style={styles.weekHabitCount}>
                        {habitDone}×
                      </AppText>
                    </View>
                    <View style={[styles.weekHabitTrack, { backgroundColor: trackColor }]}>
                      <View
                        style={[
                          styles.weekHabitFill,
                          { width: `${(habitDone / maxHabitDone) * 100}%`, backgroundColor: alpha(habitAccentColor, "CC") }
                        ]}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
            <View style={[styles.cardFooter, { borderTopColor: palette.hairline }]}>
              <AppText variant="caption" color={palette.subtle} style={styles.footerNote}>
                {bestDayIndex >= 0
                  ? `Best day: ${WEEKDAY_LABELS[bestDayIndex]}${mostConsistent ? ` · ${mostConsistent.profile.nickname || "A member"} kept the pace best` : ""}.`
                  : "Weekly patterns will appear once members start checking in."}
              </AppText>
            </View>
          </Card>

          {group.lastWeek ? (
            <Card style={styles.sectionCard}>
              <View style={styles.recapHeader}>
                <CardTitle>Last week's recap</CardTitle>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share last week's recap"
                  hitSlop={8}
                  onPress={shareRecap}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Icon name="upload" size={18} color={palette.greenDark} weight="bulk" />
                </Pressable>
              </View>
              {group.lastWeek.mvpName ? (
                <View style={styles.recapRow}>
                  <Icon name="crown1" size={16} color={CROWN_GOLD} weight="bulk" />
                  <AppText variant="bodySmall" color={palette.ink} style={styles.recapLine}>
                    MVP:{" "}
                    <AppText variant="bodySmall" color={palette.ink} style={styles.recapStrong}>
                      {group.lastWeek.mvpName}
                    </AppText>{" "}
                    with {group.lastWeek.mvpCount} {group.lastWeek.mvpCount === 1 ? "completion" : "completions"}
                  </AppText>
                </View>
              ) : null}
              <View style={styles.recapRow}>
                <Icon name="checkCircle" size={16} color={palette.greenDark} weight="bulk" />
                <AppText variant="bodySmall" color={palette.body} style={styles.recapLine}>
                  {group.lastWeek.total} {group.lastWeek.total === 1 ? "completion" : "completions"} together
                </AppText>
              </View>
              <View style={styles.recapRow}>
                <Icon name="star" size={16} color={CROWN_GOLD} weight="bulk" />
                <AppText variant="bodySmall" color={palette.body} style={styles.recapLine}>
                  {group.lastWeek.perfectDays} perfect {group.lastWeek.perfectDays === 1 ? "day" : "days"} — everyone, every habit
                </AppText>
              </View>
            </Card>
          ) : null}
        </>
      ) : null}

      {activeTab === "logs" ? (
        activityByDay.length ? (
          <View style={styles.logList}>
            {activityByDay.slice(0, visibleLogDays).map((day) => (
              <View key={day.key} style={styles.logDay}>
                <AppText variant="caption" color={palette.muted} style={styles.logDayLabel}>
                  {day.label}
                </AppText>
                <Card style={[styles.sectionCard, styles.logCard]}>
                  {day.items.map((entry, index) => (
                    <View
                      key={`${entry.profile.lumoId}-${entry.at}-${index}`}
                      style={[styles.logRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }]}
                    >
                      <Avatar config={entry.profile.avatar ?? defaultAvatar()} size={36} />
                      <AppText variant="bodySmall" color={palette.body} numberOfLines={1} style={styles.logText}>
                        <AppText variant="bodySmall" color={palette.ink} style={styles.logName}>
                          {entry.profile.nickname || "Someone"}
                        </AppText>{" "}
                        completed{" "}
                        <AppText variant="bodySmall" color={palette.ink} style={styles.logName}>
                          {entry.habitName}
                        </AppText>
                      </AppText>
                      <AppText variant="caption" color={palette.muted} style={styles.logTime}>
                        {formatLogTime(entry.at)}
                      </AppText>
                    </View>
                  ))}
                </Card>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="activity"
            title="Nothing logged yet"
            body="Check-ins show up here as members complete the group's activities."
            quiet
          />
        )
      ) : null}

      <GroupInviteModal
        visible={inviteVisible}
        friends={eligibleFriends}
        hasFriends={friends.length > 0}
        isInvited={isAlreadyInvited}
        onInvite={inviteFriend}
        onClose={() => setInviteVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl * 2,
    // Cards carry their own padding, so the stack between them stays tight —
    // the same 8pt home runs, rather than a rhythm of this page's own.
    gap: spacing.xs
  },
  // Left column: avatar beside the name, chips under both. The right side of
  // this band belongs to the mascot on the plate.
  // Tight: avatar, name and badges are one identity block, so the space
  // between them stays under the space that separates the block from what
  // follows. The screen's own stack gap already supplies that separation, so
  // this carries no bottom margin of its own. The top margin is set inline:
  // `heroDrop` pulled back, so the block rides up into the mascot's zone rather
  // than waiting for it to finish — the plate fades on scroll and the group's
  // own face is what should be at the top of its page.
  hero: {
    alignItems: "center",
    gap: spacing.xs
  },
  title: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 28,
    lineHeight: 34,
    textAlign: "center"
  },
  // The hero's own chips sit under a centred column, so they centre too — the
  // shared `chipRow` is left alone for the places that run left-aligned.
  heroChipRow: {
    justifyContent: "center"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
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
  // The figures card, geometry shared verbatim with Profile's and the habit
  // page's — same 30pt hero, same rule, same 17/11 strip — plus a roll-call band
  // under a second rule. No `overflow: hidden`: on iOS it would mask the shadow
  // away, and nothing here needs the clip — the roll call's bleed cancels
  // exactly this padding, so the faces stop at the card's own edge.
  //
  // The one card on the page with a top margin: it follows the identity block
  // rather than another card, and the stack's 8pt is the rhythm BETWEEN cards.
  // Held to that, the figures started straight off the badge chips and the two
  // read as one run.
  statsCard: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    padding: STATS_CARD_PADDING,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.075,
    shadowRadius: 18,
    elevation: 3
  },
  // No padding of its own: the card carries the inset and the gap between
  // blocks. These used to be flush sections of an unpadded card, so each one
  // paid for its own — kept, that is now counted twice.
  statsHero: {
    flexDirection: "row"
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
    flexDirection: "row"
  },
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
  // No top margin: the stack's own gap already separates this row from the
  // card above it, and carrying both put the tiles further from the figures
  // than any two cards on the page are from each other.
  navCardRow: {
    flexDirection: "row",
    gap: spacing.xs
  },
  navCardPressable: {
    // flex-basis 0 + grow makes both columns an exact 50/50 split of the row
    // regardless of their label lengths; minWidth 0 lets them shrink evenly
    // instead of sizing to content.
    flex: 1,
    minWidth: 0,
    // Has to track navCard's radius, or iOS draws the shadow to a square.
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.075,
    shadowRadius: 18,
    elevation: 3
  },
  /**
   * Both plates are 300 × 150, and the tile is squarer than that — so `cover`
   * has to scale by height and would crop the sides. Drawn wider than the tile
   * and pinned to its bottom-right corner, that crop is spent on the top and
   * left instead, which is where the art is empty.
   */
  navCardArt: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "125%",
    aspectRatio: 300 / 150
  },
  // The height is the padding here: the body is centred in the card, so the
  // space above and below it is whatever `minHeight` leaves over. Trimming
  // that is what tightens the tile — there is no vertical padding to reduce.
  navCard: {
    minHeight: 116,
    padding: 0,
    justifyContent: "center",
    // Clips the artwork to the card's rounded corners.
    overflow: "hidden"
  },
  // The copy sits in the plate's open left side, vertically centred.
  // No gap: the value, the title and the caption are one stacked label, and
  // their own line boxes already separate them. A gap on top of that read as
  // three separate things sitting in a column.
  navCardBody: {
    alignItems: "flex-start",
    paddingHorizontal: spacing.md
  },
  navCardStat: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: spacing.xs
  },
  navCardStatValue: {
    fontFamily: "Lexend-Black",
    fontSize: 34,
    lineHeight: 36
  },
  navCardStatTotal: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 3,
    opacity: 0.85
  },
  navCardTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  navCardCaption: {
    fontFamily: fontFamilies.lexend
  },
  // Dropped clear of the challenge and trophy tiles above. Everything before
  // the tabs is a summary of the group; everything after depends on which one
  // is selected — so this gap is the seam between the two, and it should read
  // as wider than the space between cards that belong together.
  tabs: {
    marginTop: spacing.md,
    marginBottom: spacing.xxs
  },
  // Rows run edge to edge inside it and carry their own height, so the card
  // only insets horizontally — matching the home habits card.
  // The page's shared card inset, like every other card on it. The row inside
  // brings no padding of its own — the card is the only thing insetting it.
  habitCard: {
    padding: STATS_CARD_PADDING
  },
  // Every card under the tabs shares the figures card's inset, so flipping
  // between Habits, Stats, Team and Logs doesn't shift the content in and out.
  // At the old 20 the tab cards sat in more room than the card above them.
  sectionCard: {
    gap: spacing.xs,
    borderRadius: radius.card,
    padding: STATS_CARD_PADDING
  },
  cardTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.xxs
  },
  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.sm
  },
  footerNote: {
    fontFamily: fontFamilies.lexend,
    lineHeight: 17
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xxs
  },
  barItem: {
    flex: 1,
    maxWidth: 72,
    alignItems: "center",
    gap: spacing.xs
  },
  barValue: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  barTrack: {
    width: 34,
    height: 120,
    borderRadius: radius.pill,
    overflow: "hidden",
    justifyContent: "flex-end"
  },
  barFill: {
    width: "100%",
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill
  },
  weekHabitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  weekHabitRowLast: {
    paddingBottom: 0
  },
  // 40 on a 20pt glyph — the challenges list's icon bubble verbatim, and the
  // same rounded square the habit and activity pickers use. At 32 it was the
  // smallest tinted bubble in the app and read as a bullet beside the name
  // rather than as the habit's own mark.
  weekHabitIcon: {
    width: 40,
    height: 40,
    borderRadius: tileRadius(40),
    alignItems: "center",
    justifyContent: "center",
    // Nudged down off the row's centre line. `top` rather than a margin: RN
    // views are relative by default, so this offsets the bubble without
    // resizing the row or shifting the name and bar beside it. The row centres
    // on the body's full height, name plus progress bar, which sits the bubble
    // level with the gap between them rather than with the name.
    top: 3
  },
  weekHabitBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs
  },
  weekHabitTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  weekHabitName: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamilies.lexendSemiBold
  },
  weekHabitCount: {
    fontFamily: fontFamilies.lexendBold
  },
  weekHabitTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden"
  },
  weekHabitFill: {
    height: "100%",
    borderRadius: radius.pill
  },
  recapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  recapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  recapLine: {
    flex: 1,
    lineHeight: 20
  },
  recapStrong: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  logList: {
    gap: spacing.md
  },
  logDay: {
    gap: spacing.sm
  },
  logDayLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    marginLeft: spacing.xs
  },
  // Half the shared inset vertically: log rows carry their own 8pt, so the two
  // add up to the 16 the sides use. The Team card needs no such trim — its
  // first and last rows zero out their own vertical padding instead.
  logCard: {
    paddingVertical: spacing.xs
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  logText: {
    flex: 1,
    minWidth: 0,
    lineHeight: 19
  },
  logName: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  logTime: {
    flexShrink: 0,
    fontFamily: fontFamilies.lexend
  },
  skeletonCard: {
    borderRadius: radius.card
  },
  skeletonPill: {
    borderRadius: radius.pill
  }
});
