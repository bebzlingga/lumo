import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React from "react";
import { Alert, Animated, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, RefreshControl, Share, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Avatar } from "@/components/Avatar";
import { FireIcon } from "@/components/FireIcon";
import { HoldProgressRing } from "@/components/HoldProgressRing";
import { Icon } from "@/components/Icon";
import { SegmentedRing } from "@/components/QuickDoneWidgets";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Skeleton } from "@/components/Skeleton";
import { AppText, Card, Screen, StatTile } from "@/components/ui";
import { fontFamilies, habitAccent, habitColorOption, progressAccents, progressAccentText, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { buildGroupAvatarSvg, defaultAvatar } from "@/lib/avatar";
import { alpha } from "@/lib/color";
import { addDays, parseDateKey, toDateKey } from "@/lib/date";
import { friendsService, type Friendship, type Group, type GroupActivity, type GroupMember, type GroupReaction, type MemberDayStatus } from "@/lib/friends";
import { formatLumoId } from "@/lib/lumoId";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Weekly MVP crown — gold in both themes.
const CROWN_GOLD = "#F0B429";
const EMPTY_WEEK: MemberDayStatus[] = ["none", "none", "none", "none", "none", "none", "none"];

type GroupTab = "habits" | "members" | "stats" | "logs";

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

// Mirrors the Friends/Insights segmented control styling.
function GroupTabs({ value, onChange }: { value: GroupTab; onChange: (value: GroupTab) => void }) {
  const { palette, isDark } = useLumo();
  const options: { label: string; value: GroupTab }[] = [
    { label: "Habits", value: "habits" },
    { label: "Stats", value: "stats" },
    { label: "Team", value: "members" },
    { label: "Logs", value: "logs" }
  ];

  return (
    <View style={[styles.tabs, { backgroundColor: isDark ? palette.chartTrack : alpha(palette.chartTrack, "99"), shadowColor: isDark ? "transparent" : palette.shadow }]}>
      {options.map((option) => {
        const selected = value === option.value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={styles.tabPressable}
          >
            <View
              style={[
                styles.tab,
                selected
                  ? {
                      backgroundColor: isDark ? palette.greenDark : palette.white,
                      borderColor: isDark ? palette.greenDark : "transparent",
                      borderWidth: isDark ? 1 : 0,
                      shadowColor: isDark ? "transparent" : palette.shadow,
                      shadowOpacity: isDark ? 0 : 0.08,
                      shadowRadius: 5,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 1
                    }
                  : null
              ]}
            >
              <AppText
                variant="button"
                color={selected ? (isDark ? palette.onAccent : palette.greenDark) : palette.subtle}
                numberOfLines={1}
                style={[styles.tabText, selected ? styles.tabTextActive : styles.tabTextInactive]}
              >
                {option.label}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function goalLabel(goal: Group["habits"][number]["goal"]) {
  switch (goal.type) {
    case "multiple":
      return `${goal.count}× a day`;
    case "weekly":
      return `${goal.target}× a week`;
    case "monthly":
      return `${goal.target}× a month`;
    default:
      return "Once a day";
  }
}

function frequencyLabel(schedule: Group["habits"][number]["repeatSchedule"]) {
  switch (schedule.type) {
    case "weekdays":
      return "Weekdays";
    case "weekends":
      return "Weekends";
    case "specific":
      return `${schedule.days.length} days a week`;
    case "interval":
      return `Every ${schedule.every} days`;
    default:
      return "Daily";
  }
}

// NativeWind's css-interop drops function-valued `style` props on Pressable,
// so pressed state is tracked manually and the style is passed as a plain array.
function CheerButton({ name, dimmed = false, onPress }: { name: string; dimmed?: boolean; onPress: () => void }) {
  const { palette } = useLumo();
  const [pressed, setPressed] = React.useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cheer ${name}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.cheerButton, { backgroundColor: alpha(palette.glow, "33"), opacity: pressed ? 0.7 : dimmed ? 0.5 : 1 }]}
    >
      <FireIcon size={16} />
    </Pressable>
  );
}

// Thin circular progress drawn around a roll-call avatar — everyone can see
// how far each member is through today's activities at a glance.
function AvatarProgressRing({
  progress,
  size,
  color,
  trackColor
}: {
  progress: number;
  size: number;
  color: string;
  trackColor: string;
}) {
  const strokeWidth = 3.5;
  const ringRadius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * ringRadius;

  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size / 2} cy={size / 2} r={ringRadius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      {progress > 0 ? (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={ringRadius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - Math.min(1, progress))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
    </Svg>
  );
}

// Day-of-month label for the history grid columns (14 columns leave no room
// for a month name).
function gridDayLabel(dateKey: string) {
  return String(parseDateKey(dateKey).getDate());
}

/**
 * 14-day per-member history for one activity: small color-only squares (no
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
  // Completed squares take the activity's own color.
  const accent = habitAccent(habit.color, isDark) ?? palette.greenDark;

  return (
    <View style={styles.grid}>
      <View style={styles.weekHeader}>
        <View style={styles.weekAvatarSpacer} />
        {gridDays.map((day) => (
          <AppText key={day} variant="caption" color={palette.body} style={styles.weekDayLabel}>
            {gridDayLabel(day)}
          </AppText>
        ))}
      </View>
      {members.map((member) => {
        const history = member.historyByHabit?.[habit.id] ?? [];

        return (
          <View key={member.profile.lumoId} style={styles.weekRow}>
            <View style={[styles.weekAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
              <Avatar config={member.profile.avatar ?? defaultAvatar()} size={30} rounded={false} />
            </View>
            {gridDays.map((day, dayIndex) => {
              const status = history[dayIndex] ?? "none";
              // Missed days stay on the plain track color — no red.
              const background = status === "done" ? accent : status === "partial" ? alpha(accent, "66") : alpha(palette.greenSoft, "3D");

              return <View key={day} style={[styles.weekDot, { backgroundColor: background }]} />;
            })}
          </View>
        );
      })}
    </View>
  );
}

// Undo takes a deliberate hold (matches the home quick-done rows) so it can't
// happen by accident, and a progress ring fills over the hold.
const ACTIVITY_UNDO_HOLD_MS = 1500;
// Logs tab starts by showing this many days, revealing more as you scroll down.
const LOG_DAYS_PAGE = 3;
// Only reveal a hold-progress ring after this much holding, so a quick tap never
// flashes it. The ring then fills over the remaining hold time.
const HOLD_REVEAL_DELAY_MS = 500;

// The TO DO check-in button, shown only while an activity is still pending.
// Once done, the tick-circle on the row's left icon becomes the hold-to-undo
// target instead (mirrors the home quick-done rows moving the state left).
function ActivityStatusBadge({ name, onPress }: { name: string; onPress: () => void }) {
  const { palette, settings } = useLumo();
  const [pressed, setPressed] = React.useState(false);
  const todoColor = progressAccents[settings.colorScheme ?? "green"] ?? palette.glow;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Check in ${name}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.statusBadge, { backgroundColor: todoColor, opacity: pressed ? 0.8 : 1 }]}
    >
      <AppText variant="caption" color={progressAccentText} style={styles.statusBadgeText}>
        TO DO
      </AppText>
    </Pressable>
  );
}

function InviteHeaderButton({ onPress }: { onPress: () => void }) {
  const { palette } = useLumo();
  const [pressed, setPressed] = React.useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Invite friends"
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.inviteHeaderButton, { backgroundColor: alpha(palette.greenDark, "12"), opacity: pressed ? 0.75 : 1 }]}
    >
      <Icon name="userCircleAdd" size={26} color={palette.greenDark} weight="bulk" />
    </Pressable>
  );
}

function InviteRowButton({ name, invited, onPress }: { name: string; invited: boolean; onPress: () => void }) {
  const { palette, isDark } = useLumo();
  const [pressed, setPressed] = React.useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={invited ? `${name} invited` : `Invite ${name}`}
      accessibilityState={{ disabled: invited }}
      disabled={invited}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.inviteRowButton,
        {
          backgroundColor: invited ? alpha(palette.greenDark, "14") : isDark ? palette.green : palette.greenDark,
          opacity: pressed ? 0.8 : 1
        }
      ]}
    >
      <AppText variant="caption" color={invited ? palette.greenDark : palette.white} style={styles.inviteRowButtonText}>
        {invited ? "Invited" : "Invite"}
      </AppText>
    </Pressable>
  );
}

function NudgeButton({ name, onPress }: { name: string; onPress: () => void }) {
  const { palette } = useLumo();
  const [pressed, setPressed] = React.useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Nudge ${name}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.cheerButton, { backgroundColor: alpha(palette.greenDark, "14"), opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name="messages" size={16} color={palette.greenDark} weight="bulk" />
    </Pressable>
  );
}

const MEMBER_REMOVE_HOLD_MS = 1500;

/**
 * A member row in the Members tab. For the group owner, pressing and holding the
 * avatar/name reveals a delete button whose ring fills over the hold; completing
 * the hold removes the member (the hold is the confirmation). Only the
 * membership is removed — their history stays and returns if they're re-added.
 */
function MemberRow({
  member,
  index,
  isLast,
  isMvp,
  cheers,
  isSelf,
  canRemove,
  outOfCheers,
  onNudge,
  onCheer,
  onRemove
}: {
  member: GroupMember;
  index: number;
  isLast: boolean;
  isMvp: boolean;
  cheers: number;
  isSelf: boolean;
  canRemove: boolean;
  outOfCheers: boolean;
  onNudge: () => void;
  onCheer: () => void;
  onRemove: () => void;
}) {
  const { palette } = useLumo();
  const holdProgress = React.useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = React.useState(false);
  // Guards the press-out handler from resetting after a completed hold has
  // already fired the removal.
  const completedRef = React.useRef(false);

  function startHold() {
    if (!canRemove) {
      return;
    }
    completedRef.current = false;
    setHolding(true);
    holdProgress.stopAnimation();
    holdProgress.setValue(0);
    Animated.timing(holdProgress, {
      toValue: 1,
      delay: HOLD_REVEAL_DELAY_MS,
      duration: MEMBER_REMOVE_HOLD_MS - HOLD_REVEAL_DELAY_MS,
      easing: (value) => value,
      useNativeDriver: false
    }).start(({ finished }) => {
      if (finished) {
        completedRef.current = true;
        // Reset the row and hand off to the confirmation dialog (onRemove) — the
        // hold arms the removal, the dialog confirms it.
        setHolding(false);
        holdProgress.setValue(0);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        onRemove();
      }
    });
  }

  function endHold() {
    if (completedRef.current) {
      return;
    }
    holdProgress.stopAnimation();
    Animated.timing(holdProgress, { toValue: 0, duration: 180, useNativeDriver: false }).start();
    setHolding(false);
  }

  // Fade the delete overlay in as the hold starts so a quick tap leaves no mark.
  const overlayOpacity = holdProgress.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1] });

  return (
    <View
      style={[
        styles.memberRow,
        index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
        index === 0 && styles.memberRowFirst,
        isLast && styles.memberRowLast
      ]}
    >
      <AppText variant="caption" color={palette.muted} style={styles.memberRank}>
        {index + 1}
      </AppText>
      <Pressable
        disabled={!canRemove}
        onPressIn={startHold}
        onPressOut={endHold}
        delayLongPress={MEMBER_REMOVE_HOLD_MS + 500}
        accessibilityRole={canRemove ? "button" : undefined}
        accessibilityLabel={canRemove ? `Hold to remove ${member.profile.nickname || "member"} from the group` : undefined}
        style={[styles.memberPressArea, holding && styles.memberPressAreaHolding]}
      >
        <View style={[styles.memberAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
          <Avatar config={member.profile.avatar ?? defaultAvatar()} size={32} rounded={false} />
        </View>
        <View style={styles.memberText}>
          <View style={styles.memberNameRow}>
            <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.memberName}>
              {member.profile.nickname || "Lumo user"}
            </AppText>
            {isMvp ? <Icon name="crown1" size={14} color={CROWN_GOLD} weight="bulk" /> : null}
          </View>
          <View style={styles.cheerCountRow}>
            <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
              {member.contribution} {member.contribution === 1 ? "completion" : "completions"}
            </AppText>
            {cheers > 0 ? (
              <>
                <FireIcon size={10} />
                <AppText variant="caption" color={palette.subtle}>
                  ×{cheers}
                </AppText>
              </>
            ) : null}
          </View>
        </View>
      </Pressable>
      {!isSelf ? (
        <View style={styles.memberActions}>
          {holding && canRemove ? (
            // Delete indicator: no fill, just the trash icon with a ring that
            // fills over the hold. Same slot/size as the nudge & cheer buttons.
            <Animated.View style={[styles.cheerButton, { opacity: overlayOpacity }]} pointerEvents="none">
              <Icon name="trash" size={16} color={palette.danger} weight="bulk" />
              <HoldProgressRing progress={holdProgress} size={34} stroke={2.5} color={palette.danger} trackColor={alpha(palette.danger, "24")} />
            </Animated.View>
          ) : (
            <>
              {!member.checkedInToday ? <NudgeButton name={member.profile.nickname || "friend"} onPress={onNudge} /> : null}
              <CheerButton name={member.profile.nickname || "friend"} dimmed={outOfCheers} onPress={onCheer} />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One activity row in the Habits tab. Tapping checks in (or adds a rep); holding
 * the check-in control undoes — a ring fills around the activity icon over the
 * hold so you can see how long to keep pressing, then a confirmation dialog
 * (onUndo) asks before anything is removed. Mirrors the home quick-done rows.
 */
function GroupActivityRow({
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
  const holdProgress = React.useRef(new Animated.Value(0)).current;
  const colorOption = habitColorOption(habit.color);
  const accentColor = habitAccent(habit.color, isDark) ?? palette.greenDark;
  const doneMembers = members.filter((member) => member.completedTodayHabitIds.includes(habit.id));
  const doneRatio = memberCount > 0 ? doneMembers.length / memberCount : 0;

  const count = me?.todayCountByHabit?.[habit.id] ?? 0;
  const done = me ? me.completedTodayHabitIds.includes(habit.id) : false;
  const canUndo = count > 0;

  function startHold() {
    if (!canUndo) {
      return;
    }
    holdProgress.stopAnimation();
    holdProgress.setValue(0);
    Animated.timing(holdProgress, {
      toValue: 1,
      delay: HOLD_REVEAL_DELAY_MS,
      duration: ACTIVITY_UNDO_HOLD_MS - HOLD_REVEAL_DELAY_MS,
      easing: (value) => value,
      useNativeDriver: false
    }).start();
  }

  function endHold() {
    holdProgress.stopAnimation();
    Animated.timing(holdProgress, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  }

  function handleUndo() {
    endHold();
    onUndo();
  }

  return (
    <View style={[styles.habitCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      {/* 3 columns, mirroring the home to-do rows: icon · name/details · status. */}
      <View style={styles.habitHeaderRow}>
        {done ? (
          // Done: the tick-circle icon is the hold-to-undo target (ring fills over the hold).
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: true }}
            accessibilityLabel={`${habit.name} done today — hold to undo`}
            onLongPress={handleUndo}
            onPressIn={startHold}
            onPressOut={endHold}
            delayLongPress={ACTIVITY_UNDO_HOLD_MS}
            style={styles.habitIconWrap}
          >
            <View style={[styles.habitIcon, { backgroundColor: colorOption ? colorOption.color : isDark ? palette.greenSoft : palette.greenDark }]}>
              <Icon name="checkCircle" size={22} color={colorOption ? colorOption.onColor : isDark ? palette.greenDark : palette.white} weight="bulk" />
            </View>
            {canUndo ? (
              <HoldProgressRing progress={holdProgress} size={50} stroke={3} color={accentColor} trackColor={alpha(accentColor, "24")} />
            ) : null}
          </Pressable>
        ) : (
          <View style={styles.habitIconWrap}>
            <View style={[styles.habitIcon, { backgroundColor: colorOption ? colorOption.color : isDark ? palette.greenSoft : palette.greenDark }]}>
              <Icon name={habit.icon} size={20} color={colorOption ? colorOption.onColor : isDark ? palette.greenDark : palette.white} weight="bulk" />
            </View>
            {canUndo ? (
              <HoldProgressRing progress={holdProgress} size={50} stroke={3} color={accentColor} trackColor={alpha(accentColor, "24")} />
            ) : null}
          </View>
        )}
        <View style={styles.habitText}>
          <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.habitName}>
            {habit.name}
          </AppText>
          <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
            {habit.goal.type === "weekly" || habit.goal.type === "monthly"
              ? goalLabel(habit.goal)
              : `${frequencyLabel(habit.repeatSchedule)} · ${goalLabel(habit.goal)}`}
          </AppText>
        </View>
        {me && !done ? (
          habit.goal.type === "multiple" ? (
            // In-progress multi-count: segmented ring, tap adds a rep, hold undoes one.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Check in ${habit.name}, ${count} of ${habit.goal.count} today — hold to undo one`}
              onPress={onIncrement}
              onLongPress={handleUndo}
              onPressIn={startHold}
              onPressOut={endHold}
              delayLongPress={ACTIVITY_UNDO_HOLD_MS}
              style={styles.ringWrap}
            >
              <SegmentedRing total={habit.goal.count} filled={Math.min(count, habit.goal.count)} fillColor={accentColor} />
            </Pressable>
          ) : (
            <ActivityStatusBadge name={habit.name} onPress={onCheckIn} />
          )
        ) : null}
      </View>

      <View style={[styles.habitTrack, { backgroundColor: isDark ? alpha(palette.subtle, "26") : palette.chartTrack }]}>
        <View style={[styles.habitFill, { width: `${doneRatio * 100}%`, backgroundColor: accentColor }]} />
      </View>

      <HistoryGrid habit={habit} members={members} gridDays={gridDays} />
    </View>
  );
}

export default function GroupDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette, isDark, lumoIdSuffix } = useLumo();
  const [group, setGroup] = React.useState<Group | null>(null);
  const [reactions, setReactions] = React.useState<GroupReaction[]>([]);
  const [activity, setActivity] = React.useState<GroupActivity[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [leavePressed, setLeavePressed] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<GroupTab>("habits");
  const [refreshing, setRefreshing] = React.useState(false);
  const [cheersBannerVisible, setCheersBannerVisible] = React.useState(true);
  const [streakBannerVisible, setStreakBannerVisible] = React.useState(true);
  const [visibleLogDays, setVisibleLogDays] = React.useState(LOG_DAYS_PAGE);
  // Invite modal: accepted friends, with per-row sent state.
  const [inviteVisible, setInviteVisible] = React.useState(false);
  const [friends, setFriends] = React.useState<Friendship[]>([]);
  const [invitedIds, setInvitedIds] = React.useState<Set<string>>(() => new Set());
  const myLumoId = formatLumoId(lumoIdSuffix);
  const groupAvatarSvg = React.useMemo(
    () => (group ? buildGroupAvatarSvg(group.avatarSeed ?? group.id) : ""),
    [group?.avatarSeed, group?.id]
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
    const [loadedGroup, todayReactions, loadedFriends, loadedActivity] = await Promise.all([
      friendsService.getGroup(id),
      friendsService.listTodayReactions(id),
      friendsService.listFriends(),
      friendsService.listGroupActivity(id)
    ]);
    setGroup(loadedGroup);
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
    // Skeleton mirrors the real layout: avatar + title header, roll call card
    // with progress-ring avatars, tabs, then activity cards (3-column header,
    // progress track, history grid rows).
    return (
      <Screen contentStyle={styles.content}>
        <ScreenHeader leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />
        <View style={styles.header}>
          <Skeleton width={56} height={56} round />
          <View style={styles.skeletonFlex}>
            <Skeleton width="60%" height={22} />
            <Skeleton width="40%" height={12} style={styles.skeletonGapTop} />
          </View>
        </View>
        <Card style={styles.rollCallCard}>
          <View style={styles.rollCallHeader}>
            <Skeleton width="40%" height={15} />
            <Skeleton width="25%" height={11} />
          </View>
          <View style={styles.skeletonRow}>
            <Skeleton width={54} height={54} round />
            <Skeleton width={54} height={54} round />
            <Skeleton width={54} height={54} round />
          </View>
        </Card>
        <Skeleton height={44} style={styles.skeletonPill} />
        {[0, 1].map((index) => (
          <Card key={index} style={styles.sectionCard}>
            <View style={styles.skeletonHeaderRow}>
              <Skeleton width={42} height={42} round />
              <View style={styles.skeletonFlex}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="35%" height={10} style={styles.skeletonGapTop} />
              </View>
              <Skeleton width={56} height={26} round />
            </View>
            <Skeleton height={6} style={styles.skeletonGapTop} />
            <Skeleton height={16} style={styles.skeletonGapTop} />
            <Skeleton height={16} style={styles.skeletonGapTop} />
          </Card>
        ))}
      </Screen>
    );
  }

  if (!group) {
    return (
      <Screen contentStyle={styles.content}>
        <ScreenHeader leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />
        <AppText variant="bodySmall" color={palette.subtle}>
          This group could not be found.
        </AppText>
      </Screen>
    );
  }

  const memberCount = group.members.length;
  const sortedMembers = [...group.members].sort((a, b) => b.contribution - a.contribution);
  const maxContribution = Math.max(1, ...group.members.map((member) => member.contribution));
  const topContributor = sortedMembers.find((member) => member.contribution > 0) ?? null;

  // Aggregate the current week's per-member, per-habit statuses.
  const doneByHabit: Record<string, number> = {};
  const doneByDay = [0, 0, 0, 0, 0, 0, 0];
  const doneByMember: Record<string, number> = {};
  let weekDone = 0;
  let weekTracked = 0;

  for (const member of group.members) {
    for (const habit of group.habits) {
      const week = member.weekByHabit?.[habit.id] ?? EMPTY_WEEK;

      week.forEach((status, dayIndex) => {
        if (status !== "none") {
          weekTracked += 1;
        }
        if (status === "done") {
          weekDone += 1;
          doneByHabit[habit.id] = (doneByHabit[habit.id] ?? 0) + 1;
          doneByDay[dayIndex] += 1;
          doneByMember[member.profile.lumoId] = (doneByMember[member.profile.lumoId] ?? 0) + 1;
        }
      });
    }
  }

  const weeklyRate = weekTracked ? Math.round((weekDone / weekTracked) * 100) : 0;
  const perfectDays = doneByDay.filter((count) => count === memberCount * group.habits.length && count > 0).length;
  const bestDayIndex = doneByDay.some((count) => count > 0) ? doneByDay.indexOf(Math.max(...doneByDay)) : -1;
  const mostConsistent =
    group.members.length && Object.keys(doneByMember).length
      ? group.members.reduce((best, member) =>
          (doneByMember[member.profile.lumoId] ?? 0) > (doneByMember[best.profile.lumoId] ?? 0) ? member : best
        )
      : null;

  // --- Fun layer: roll call, weekly MVP, cheers/nudges, challenge, recap ---
  const checkedInCount = group.members.filter((member) => member.checkedInToday).length;
  const mvp = group.members.reduce(
    (best: GroupMember | null, member) =>
      member.weekCompletions > 0 && member.weekCompletions > (best?.weekCompletions ?? 0) ? member : best,
    null
  );
  const cheersFor = (member: GroupMember) =>
    reactions.filter((reaction) => reaction.kind === "cheer" && reaction.recipientId === member.profile.id).length;
  // Today's day-bound activities (mirrors the service's scheduledToday rule)
  // → each member's roll-call progress ring fraction.
  const todayDow = new Date().getDay();
  const scheduledTodayHabits = group.habits.filter((habit) => {
    if (habit.goal.type === "weekly" || habit.goal.type === "monthly") {
      return false;
    }
    switch (habit.repeatSchedule.type) {
      case "weekdays":
        return todayDow >= 1 && todayDow <= 5;
      case "weekends":
        return todayDow === 0 || todayDow === 6;
      case "specific":
        return (habit.repeatSchedule.days as number[]).includes(todayDow);
      default:
        return true;
    }
  });
  const rollCallProgress = (member: GroupMember) => {
    if (!scheduledTodayHabits.length) {
      return member.checkedInToday ? 1 : 0;
    }

    const done = scheduledTodayHabits.filter((habit) => member.completedTodayHabitIds.includes(habit.id)).length;

    return done / scheduledTodayHabits.length;
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
  // Nobody left to invite (everyone's a member or already invited) → no button.
  const hasInvitableFriends = eligibleFriends.some((friend) => !isAlreadyInvited(friend.profile.lumoId));

  async function sendCheer(member: GroupMember) {
    if (!member.profile.id) {
      return;
    }

    const result = await friendsService.cheerMember(group!.id, member.profile.id);

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

    const result = await friendsService.nudgeMember(group!.id, member.profile.id);

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
    Alert.alert(
      name,
      member.checkedInToday ? "All checked in today!" : "Hasn't checked in yet today.",
      [
        { text: "Send a cheer", onPress: () => sendCheer(member) },
        ...(!member.checkedInToday ? [{ text: "Nudge", onPress: () => sendNudge(member) }] : []),
        { text: "Cancel", style: "cancel" as const }
      ]
    );
  }

  function handleRemoveMember(member: GroupMember) {
    if (!group || !member.profile.id) {
      return;
    }

    const memberId = member.profile.id;
    const name = member.profile.nickname || "this member";
    Alert.alert(
      "Remove member?",
      `Remove ${name} from the group? Their progress stays saved and comes back if you add them again.`,
      [
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
      ]
    );
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

  // Long press undoes: one rep off multi-count activities, the whole day
  // for single-count ones.
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
    Alert.alert(
      "Undo check-in?",
      multiple && current > 1 ? `Remove one check-in from ${habit.name}?` : `Undo ${habit.name} for today?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Undo", style: "destructive", onPress: () => undoCheckIn(habit) }
      ]
    );
  }

  function shareRecap() {
    if (!group?.lastWeek) {
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

  function handleInvite() {
    setInviteVisible(true);
  }

  async function inviteFriend(friend: Friendship) {
    const result = await friendsService.inviteToGroup(group!.id, friend.profile.lumoId);

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
          const ok = await friendsService.deleteGroup(group!.id);

          if (ok) {
            router.back();
          } else {
            Alert.alert("Couldn't delete", "Please check your connection and try again.");
          }
        }
      }
    ]);
  }

  function handleLeave() {
    Alert.alert("Leave group?", "You'll stop contributing to this group's habits.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          await friendsService.leaveGroup(group!.id);
          router.back();
        }
      }
    ]);
  }

  return (
    <Screen
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
    >
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        rightActions={
          group.ownedByMe
            ? [
                {
                  icon: "edit",
                  label: "Edit group",
                  onPress: () => router.push(`/group/new?editId=${group.id}` as Href),
                  // Cancel ScreenHeader's default edit-icon offset (translateY 4,
                  // tuned for the habit page) so it lines up with its neighbors.
                  iconStyle: {}
                },
                { icon: "trash", label: "Delete group", onPress: confirmDeleteGroup, iconSize: 20, iconColor: palette.danger }
              ]
            : undefined
        }
      />

      <View style={styles.header}>
        <View style={[styles.groupAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
          <Avatar svg={groupAvatarSvg} size={56} rounded={false} />
        </View>
        <View style={styles.headerText}>
          <AppText color={palette.ink} numberOfLines={1} style={styles.title}>
            {group.name}
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle}>
            {group.progress} {group.progress === 1 ? "completion" : "completions"} · {memberCount} {memberCount === 1 ? "member" : "members"}
          </AppText>
        </View>
        {group.ownedByMe && hasInvitableFriends ? <InviteHeaderButton onPress={handleInvite} /> : null}
      </View>

      {/* Group streak: pinned top-most, shown once the streak reaches 3 days,
          and dismissible for the rest of the visit. */}
      {group.streak >= 3 && streakBannerVisible ? (
        <View style={[styles.streakBanner, { backgroundColor: palette.glowSoft }]}>
          <FireIcon size={20} />
          <AppText variant="bodySmall" color={palette.ink} style={styles.streakText}>
            {group.streak}-day group streak — don't be the one who drops it!
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss group streak message"
            hitSlop={8}
            onPress={() => setStreakBannerVisible(false)}
          >
            <Icon name="close" size={16} color={palette.muted} weight="bulk" />
          </Pressable>
        </View>
      ) : null}

      {/* Cheers received today — dismissible for the rest of the visit. */}
      {myCheers > 0 && cheersBannerVisible ? (
        <Card style={styles.cheersCard}>
          <FireIcon size={18} />
          <AppText variant="bodySmall" color={palette.ink} style={styles.cheersText}>
            You got {myCheers} {myCheers === 1 ? "cheer" : "cheers"} today — friends have your back!
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss cheers message"
            hitSlop={8}
            onPress={() => setCheersBannerVisible(false)}
          >
            <Icon name="close" size={16} color={palette.muted} weight="bulk" />
          </Pressable>
        </Card>
      ) : null}

      {/* Roll call: who has checked in today. Tap a friend to cheer or nudge. */}
      <Card style={styles.rollCallCard}>
        <View style={styles.rollCallHeader}>
          <AppText variant="titleSmall" color={palette.ink} style={styles.rollCallTitle}>
            Today's roll call
          </AppText>
          <AppText variant="caption" color={checkedInCount === memberCount && memberCount > 0 ? palette.greenDark : palette.subtle} style={styles.rollCallCount}>
            {checkedInCount} of {memberCount} checked in
          </AppText>
        </View>

        {/* Roll-call streak: everyone just has to show up (open the group) each
            day — separate from completing activities. */}
        {group.rollCallStreak >= 3 ? (
          <View style={[styles.rollCallStreakRow, { backgroundColor: palette.glowSoft }]}>
            <FireIcon size={16} />
            <AppText variant="caption" color={palette.ink} style={styles.rollCallStreakText}>
              {group.rollCallStreak}-day roll-call streak — everyone's showing up.
            </AppText>
          </View>
        ) : null}

        <View style={styles.rollCallRow}>
          {group.members.map((member) => {
            const memberCheers = cheersFor(member);
            const progress = rollCallProgress(member);

            return (
              <Pressable
                key={member.profile.lumoId}
                accessibilityRole="button"
                accessibilityLabel={`${member.profile.nickname || "Lumo user"}, ${Math.round(progress * 100)}% of today's activities done`}
                onPress={() => handleMemberTap(member)}
                style={styles.rollCallMember}
              >
                <View style={styles.rollCallAvatarWrap}>
                  <AvatarProgressRing
                    progress={progress}
                    size={54}
                    color={palette.greenDark}
                    trackColor={isDark ? alpha(palette.subtle, "26") : palette.chartTrack}
                  />
                  <View
                    style={[
                      styles.rollCallAvatar,
                      {
                        backgroundColor: alpha(palette.greenDark, "10"),
                        // Full opacity is earned by checking in today.
                        opacity: member.checkedInToday ? 1 : 0.45
                      }
                    ]}
                  >
                    <Avatar config={member.profile.avatar ?? defaultAvatar()} size={30} rounded={false} />
                  </View>
                </View>
                <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.rollCallName}>
                  {member.profile.lumoId === myLumoId ? "You" : member.profile.nickname || "Friend"}
                </AppText>
                {memberCheers > 0 ? (
                  <View style={styles.cheerCountRow}>
                    <FireIcon size={10} />
                    <AppText variant="caption" color={palette.greenDark} style={styles.rollCallCheers}>
                      ×{memberCheers}
                    </AppText>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Card>

      <GroupTabs value={activeTab} onChange={setActiveTab} />

      {activeTab === "habits" ? (
        <View style={styles.habitList}>
          {group.habits.map((habit) => (
            <GroupActivityRow
              key={habit.id}
              habit={habit}
              me={me}
              members={group.members}
              memberCount={memberCount}
              gridDays={group.gridDays}
              onCheckIn={() => toggleCheckIn(habit)}
              onIncrement={() => incrementCheckIn(habit)}
              onUndo={() => confirmUndoCheckIn(habit)}
            />
          ))}
        </View>
      ) : null}

      {activeTab === "members" ? (
      <Card style={styles.sectionCard}>
        {sortedMembers.map((member, index) => (
          <MemberRow
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
          <View style={styles.statsGrid}>
            <StatTile label="Total completions" value={`${group.progress}`} icon="checkCircle" />
            <StatTile label="Group streak" value={`${group.streak}`} icon={group.streak >= 3 ? "streakFire" : "activity"} />
            <StatTile label="Weekly rate" value={`${weeklyRate}%`} icon="chart" />
            <StatTile label="Perfect days this week" value={`${perfectDays}`} icon="sun" />
          </View>

          <Card style={styles.sectionCard}>
            <View style={styles.barsRow}>
              {sortedMembers.map((member) => (
                <View key={member.profile.lumoId} style={styles.barItem}>
                  <AppText variant="caption" color={palette.subtle} style={styles.barValue}>
                    {member.contribution}
                  </AppText>
                  <View style={[styles.barTrack, { backgroundColor: isDark ? alpha(palette.subtle, "26") : palette.chartTrack }]}>
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
                  <View style={[styles.barAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
                    <Avatar config={member.profile.avatar ?? defaultAvatar()} size={24} rounded={false} />
                  </View>
                </View>
              ))}
            </View>
            <View style={[styles.barFooter, { borderTopColor: palette.hairline }]}>
              <AppText variant="caption" color={palette.subtle} style={styles.barAnalysis}>
                {topContributor
                  ? `${topContributor.profile.nickname || "A member"} leads with ${topContributor.contribution} completions. Keep each other going!`
                  : "Contributions will show up here as members check in."}
              </AppText>
            </View>
          </Card>

          <Card style={styles.sectionCard}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.statsCardTitle}>
              This week
            </AppText>
            {group.habits.map((habit, index) => {
              const habitDone = doneByHabit[habit.id] ?? 0;
              const maxHabitDone = Math.max(1, ...group.habits.map((entry) => doneByHabit[entry.id] ?? 0));

              return (
                <View
                  key={habit.id}
                  style={[styles.weekHabitRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }]}
                >
                  <View style={[styles.weekHabitIcon, { backgroundColor: alpha(palette.greenDark, "10") }]}>
                    <Icon name={habit.icon} size={16} color={palette.greenDark} weight="bulk" />
                  </View>
                  <View style={styles.weekHabitBody}>
                    <View style={styles.weekHabitTop}>
                      <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.weekHabitName}>
                        {habit.name}
                      </AppText>
                      <AppText variant="bodySmall" color={palette.greenDark} style={styles.weekHabitCount}>
                        {habitDone}×
                      </AppText>
                    </View>
                    <View style={[styles.weekHabitTrack, { backgroundColor: isDark ? alpha(palette.subtle, "26") : palette.chartTrack }]}>
                      <View
                        style={[
                          styles.weekHabitFill,
                          { width: `${(habitDone / maxHabitDone) * 100}%`, backgroundColor: alpha(palette.greenDark, "CC") }
                        ]}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
            <View style={[styles.barFooter, { borderTopColor: palette.hairline }]}>
              <AppText variant="caption" color={palette.subtle} style={styles.barAnalysis}>
                {bestDayIndex >= 0
                  ? `Best day: ${WEEKDAY_LABELS[bestDayIndex]}${mostConsistent ? ` · ${mostConsistent.profile.nickname || "A member"} kept the pace best` : ""}.`
                  : "Weekly patterns will appear once members start checking in."}
              </AppText>
            </View>
          </Card>

          {group.lastWeek ? (
            <Card style={styles.sectionCard}>
              <View style={styles.recapHeader}>
                <AppText variant="titleSmall" color={palette.ink} style={styles.statsCardTitle}>
                  Last week's recap
                </AppText>
                <Pressable accessibilityRole="button" accessibilityLabel="Share last week's recap" hitSlop={8} onPress={shareRecap}>
                  <Icon name="upload" size={18} color={palette.greenDark} weight="bulk" />
                </Pressable>
              </View>
              {group.lastWeek.mvpName ? (
                <View style={styles.recapRow}>
                  <Icon name="crown1" size={16} color={CROWN_GOLD} weight="bulk" />
                  <AppText variant="bodySmall" color={palette.ink} style={styles.recapLine}>
                    MVP: <AppText variant="bodySmall" color={palette.ink} style={styles.recapStrong}>{group.lastWeek.mvpName}</AppText> with{" "}
                    {group.lastWeek.mvpCount} {group.lastWeek.mvpCount === 1 ? "completion" : "completions"}
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
                      <View style={[styles.logAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
                        <Avatar config={entry.profile.avatar ?? defaultAvatar()} size={32} rounded={false} />
                      </View>
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
          <View style={styles.logEmpty}>
            <Icon name="activity" size={24} color={palette.muted} weight="bulk" />
            <AppText variant="bodySmall" color={palette.subtle} style={styles.logEmptyText}>
              No activity yet. Check-ins will show up here as members complete activities.
            </AppText>
          </View>
        )
      ) : null}

      {!group.ownedByMe && activeTab === "members" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave group"
          onPress={handleLeave}
          onPressIn={() => setLeavePressed(true)}
          onPressOut={() => setLeavePressed(false)}
          style={[styles.leaveButton, { backgroundColor: alpha(palette.danger, "14"), opacity: leavePressed ? 0.7 : 1 }]}
        >
          <AppText variant="button" color={palette.danger}>
            Leave group
          </AppText>
        </Pressable>
      ) : null}

      <Modal visible={inviteVisible} transparent animationType="fade" onRequestClose={() => setInviteVisible(false)}>
        <View style={styles.inviteOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} accessibilityLabel="Close" onPress={() => setInviteVisible(false)} />
          <View style={[styles.inviteCard, { backgroundColor: palette.card }]}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.inviteTitle}>
              Invite Friends
            </AppText>
            <AppText variant="caption" color={palette.subtle} style={styles.inviteHint}>
              They'll get an invitation on their profile to accept or decline.
            </AppText>

            {eligibleFriends.length ? (
              eligibleFriends.map((friend, index) => {
                const invited = isAlreadyInvited(friend.profile.lumoId);

                return (
                  <View
                    key={friend.profile.lumoId}
                    style={[styles.inviteRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }]}
                  >
                    <View style={[styles.inviteAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
                      <Avatar config={friend.profile.avatar ?? defaultAvatar()} size={32} rounded={false} />
                    </View>
                    <View style={styles.inviteText}>
                      <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.inviteName}>
                        {friend.profile.nickname || "Lumo user"}
                      </AppText>
                      <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                        {friend.profile.lumoId}
                      </AppText>
                    </View>
                    <InviteRowButton name={friend.profile.nickname || "friend"} invited={invited} onPress={() => inviteFriend(friend)} />
                  </View>
                );
              })
            ) : (
              <AppText variant="caption" color={palette.subtle} style={styles.inviteEmpty}>
                {friends.length
                  ? "All of your friends are already in this group."
                  : "No friends to invite yet — add friends from the Friends tab first."}
              </AppText>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={() => setInviteVisible(false)}
              style={[styles.inviteDone, { backgroundColor: isDark ? palette.green : palette.greenDark }]}
            >
              <AppText variant="button" color={palette.white}>
                Done
              </AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: -spacing.xs
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs
  },
  groupAvatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  inviteHeaderButton: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    fontFamily: "Lexend-Black",
    fontSize: 28,
    lineHeight: 34
  },
  rollCallCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.xs
  },
  rollCallHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  rollCallTitle: {
    fontFamily: fontFamilies.lexendBold
  },
  rollCallStreakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  rollCallStreakText: {
    flex: 1,
    fontFamily: fontFamilies.lexendMedium,
    lineHeight: 16
  },
  rollCallCount: {
    fontFamily: fontFamilies.lexend
  },
  rollCallRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  rollCallMember: {
    alignItems: "center",
    gap: spacing.xxs,
    width: 56
  },
  rollCallAvatarWrap: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center"
  },
  // 36pt inside the 54pt ring leaves a wide gap to the progress stroke.
  rollCallAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  rollCallName: {
    maxWidth: 56,
    textAlign: "center"
  },
  rollCallCheers: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: fontFamilies.lexendSemiBold
  },
  cheersCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.xs,
    // Pulls the roll call card up closer beneath it.
    marginBottom: -spacing.xs
  },
  cheersText: {
    flex: 1,
    fontFamily: fontFamilies.lexendMedium,
    lineHeight: 19
  },
  skeletonRow: {
    flexDirection: "row",
    gap: spacing.md
  },
  skeletonHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  skeletonFlex: {
    flex: 1,
    minWidth: 0
  },
  skeletonGapTop: {
    marginTop: spacing.xxs
  },
  skeletonPill: {
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
  cheerCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
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
  logCard: {
    paddingVertical: spacing.sm
  },
  logDayLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    marginLeft: spacing.xs
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  logAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
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
  logEmpty: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl
  },
  logEmptyText: {
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 20
  },
  streakBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  streakText: {
    flex: 1,
    fontFamily: fontFamilies.lexendMedium,
    lineHeight: 19
  },
  sectionCard: {
    gap: spacing.xs,
    padding: spacing.lg
  },
  tabs: {
    flexDirection: "row",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 4
  },
  tabPressable: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 2
  },
  tab: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingVertical: spacing.sm
  },
  tabText: {
    textAlign: "center"
  },
  tabTextActive: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  tabTextInactive: {
    fontFamily: fontFamilies.lexendMedium
  },
  habitList: {
    gap: spacing.sm
  },
  habitCard: {
    gap: spacing.xxs,
    borderRadius: radius.nav,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  // 3-column header mirroring the home to-do rows: icon · text · status badge.
  habitHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xxs
  },
  habitIconWrap: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center"
  },
  habitIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  habitText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  habitName: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  statusBadge: {
    minWidth: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  // Same footprint as the status badge so the ring lines up (home pattern).
  ringWrap: {
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center"
  },
  statusBadgeText: {
    fontFamily: "Lexend-Black",
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.6
  },
  habitTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
    marginTop: spacing.xs
  },
  // Compact 14-day grid: flexed color squares, no icons, fits the card.
  grid: {
    marginTop: spacing.sm
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
  weekDot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.sm
  },
  habitFill: {
    height: "100%",
    borderRadius: radius.pill
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  memberRank: {
    width: 16,
    fontFamily: fontFamilies.lexendBold,
    textAlign: "center"
  },
  memberActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  memberPressArea: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  memberPressAreaHolding: {
    opacity: 0.4
  },
  memberRowFirst: {
    paddingTop: 0
  },
  memberRowLast: {
    paddingBottom: 0
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  memberText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs
  },
  memberName: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  cheerButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    gap: spacing.md,
    paddingHorizontal: spacing.xs
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
  barAvatar: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  barFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.sm
  },
  barAnalysis: {
    lineHeight: 17,
    opacity: 0.8
  },
  statsCardTitle: {
    fontFamily: fontFamilies.lexendBold,
    marginBottom: spacing.xxs
  },
  weekHabitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
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
  weekHabitIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  weekHabitName: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamilies.lexendSemiBold
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
  weekHabitCount: {
    fontFamily: fontFamilies.lexendBold
  },
  leaveButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill
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
    gap: spacing.sm,
    borderRadius: radius.nav,
    padding: spacing.xl
  },
  inviteTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 20,
    lineHeight: 26
  },
  inviteHint: {
    lineHeight: 17,
    opacity: 0.8,
    marginTop: -spacing.xs
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  inviteAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  inviteText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  inviteName: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  inviteEmpty: {
    lineHeight: 17,
    opacity: 0.8,
    paddingVertical: spacing.sm
  },
  inviteRowButton: {
    minHeight: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm
  },
  inviteRowButtonText: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  inviteDone: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    marginTop: spacing.xxs
  }
});
