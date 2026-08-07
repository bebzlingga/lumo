import { Platform } from "react-native";
import type { IconName } from "@/components/Icon";
import { type AvatarConfig } from "@/lib/avatar";
import { addDays, parseDateKey, toDateKey, weekRangeMonday } from "@/lib/date";
import { ensureSignedIn, isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { GoalType, RepeatSchedule, Weekday } from "@/types/habit";

/**
 * Friends service layer backed by Supabase (see supabase/schema.sql). The UI
 * talks only to this interface. Every call degrades gracefully: when Supabase
 * isn't configured or reachable, reads resolve empty and writes resolve false,
 * which the screens already present as the offline state.
 */
export type FriendProfile = {
  /** Supabase profile uuid — needed to address cheers/nudges. */
  id?: string;
  lumoId: string;
  nickname: string;
  avatar?: AvatarConfig;
};

export type Friendship = {
  profile: FriendProfile;
  status: "pending" | "accepted";
};

export type FriendInvitation = FriendProfile & {
  /** ISO timestamp of when the invitation was sent. */
  invitedAt: string;
};

/** A pending group membership awaiting this user's accept/decline. */
export type GroupInvitation = {
  groupId: string;
  groupName: string;
  avatarSeed?: string;
  /** Group owner's nickname (the inviter). */
  invitedBy?: string;
  invitedAt: string;
};

export type MemberDayStatus = "done" | "partial" | "missed" | "none";

export type GroupMember = {
  profile: FriendProfile;
  contribution: number;
  /** Completion count within the current Mon–Sun week (weekly MVP ranking). */
  weekCompletions: number;
  /** True when every habit scheduled today is done — powers the roll call. */
  checkedInToday: boolean;
  /** Group-habit ids this member has completed today. */
  completedTodayHabitIds: string[];
  /** Raw completion count per group-habit id for today (multi-count rings). */
  todayCountByHabit?: Record<string, number>;
  /** Total completions this member has logged per group-habit id (all time) —
   * powers per-challenge leaderboards. */
  contributionByHabit: Record<string, number>;
  /** Mon–Sun status per group-habit id for the current week (stats math). */
  weekByHabit?: Record<string, MemberDayStatus[]>;
  /** Status per group-habit id over Group.gridDays (the history grid). */
  historyByHabit?: Record<string, MemberDayStatus[]>;
};

/** Last week's highlights for the recap card. */
export type GroupWeekRecap = {
  total: number;
  perfectDays: number;
  mvpLumoId?: string;
  mvpName?: string;
  mvpCount: number;
};

export type GroupReaction = {
  kind: "cheer" | "nudge";
  /** Sender profile uuid — lets the UI count its own sent cheers. */
  senderId: string;
  senderName: string;
  /** Recipient profile uuid. */
  recipientId: string;
  at: string;
};

export type GroupActivity = {
  profile: FriendProfile;
  habitName: string;
  at: string;
};

/**
 * A group habit is a full habit definition — same schedule and goal shapes as
 * personal habits, so each habit carries its own frequency, goal, and period.
 * The definition (name, icon, frequency, goal) is shared by the group;
 * reminders stay personal, configured by each member on their own copy.
 */
export type GroupHabit = {
  id: string;
  name: string;
  icon: IconName;
  /** Hex from the habit color palette; missing = theme green. */
  color?: string;
  repeatSchedule: RepeatSchedule;
  goal: GoalType;
};

/**
 * A group is a bundle of habits shared with friends; every member's
 * completions of those habits add up. Goals and periods live on the habits
 * themselves, not on the group.
 */
export type Group = {
  id: string;
  name: string;
  habits: GroupHabit[];
  /** Total completions across all members and habits. */
  progress: number;
  /** Consecutive days every member completed all group habits. */
  streak: number;
  /** Consecutive days every member visited the group page ("showed up"). */
  rollCallStreak: number;
  /** True once the current user has visited the group today. */
  checkedInTodayByMe: boolean;
  /** Completions within the current Mon–Sun week (challenge progress). */
  weekTotal: number;
  /** Optional weekly challenge target set by the owner. */
  weeklyTarget?: number;
  /** Last week's highlights (absent when nothing happened last week). */
  lastWeek?: GroupWeekRecap;
  /** DiceBear thumbs seed picked at creation; render falls back to the id. */
  avatarSeed?: string;
  /** Rolling day keys (oldest → today) backing each member's historyByHabit. */
  gridDays: string[];
  /** Distinct day keys any member logged each group-habit id (all-time) — powers
   * challenge duration progress. */
  completedDaysByHabit: Record<string, string[]>;
  members: GroupMember[];
  /** Lumo IDs of friends invited but not yet accepted (for the invite sheet). */
  pendingInviteeLumoIds: string[];
  /** True when the current user created the group (and can invite friends). */
  ownedByMe: boolean;
};

export type FriendsServiceStatus = "offline" | "ready";

export type GroupDraft = {
  name: string;
  habits: GroupHabit[];
  memberLumoIds: string[];
  /** Optional weekly challenge target chosen at creation. */
  weeklyTarget?: number;
  /** DiceBear thumbs seed for the group avatar. */
  avatarSeed?: string;
};

// ---------------------------------------------------------------------------
// Row shapes + mappers (schema columns are snake_case).
// ---------------------------------------------------------------------------

type ProfileRow = {
  id: string;
  lumo_id: string;
  nickname: string | null;
  avatar: AvatarConfig | null;
};

type GroupHabitRow = {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  repeat_schedule: RepeatSchedule;
  goal: GoalType;
};

type CompletionRow = {
  group_id: string;
  habit_id: string;
  member: string;
  day: string;
  count: number;
  completed_at: string;
};

function rowToProfile(row: ProfileRow): FriendProfile {
  return {
    id: row.id,
    lumoId: row.lumo_id,
    nickname: row.nickname ?? "",
    avatar: row.avatar ?? undefined
  };
}

function rowToGroupHabit(row: GroupHabitRow): GroupHabit {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon as IconName,
    color: row.color ?? undefined,
    repeatSchedule: row.repeat_schedule,
    goal: row.goal
  };
}

async function profileIdByLumoId(lumoId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("id").eq("lumo_id", lumoId).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Group math: schedules, targets, week status, streak.
// ---------------------------------------------------------------------------

function dailyTarget(goal: GoalType) {
  return goal.type === "multiple" ? goal.count : 1;
}

// Weekly/monthly goals aren't tied to specific days — they never show daily
// "missed" states and don't gate the roll call or the group streak.
function isFlexibleGoal(goal: GoalType) {
  return goal.type === "weekly" || goal.type === "monthly";
}

/**
 * Group habits scheduled on a date — the single rule the roll call, group
 * streak, and the group screen all share.
 *
 * Deliberately NOT `lib/habitMath.isScheduledOnDate`: that one anchors
 * `interval` schedules to a personal `createdAt` and honours per-habit status,
 * neither of which exists for a shared group habit.
 */
export function scheduledGroupHabitsOn(habits: GroupHabit[], dateKey: string): GroupHabit[] {
  return habits.filter((habit) => !isFlexibleGoal(habit.goal) && isScheduledOn(habit.repeatSchedule, dateKey));
}

function isScheduledOn(schedule: RepeatSchedule, dateKey: string) {
  const day = parseDateKey(dateKey).getDay() as Weekday;

  switch (schedule.type) {
    case "weekdays":
      return day >= 1 && day <= 5;
    case "weekends":
      return day === 0 || day === 6;
    case "specific":
      return schedule.days.includes(day);
    default:
      // "daily", and "interval" too — interval has no shared anchor date
      // across members, so groups treat it as daily.
      return true;
  }
}


type GroupRowJoined = {
  id: string;
  name: string;
  owner: string;
  weekly_target: number | null;
  avatar_seed: string | null;
  group_habits: GroupHabitRow[];
  group_members: { member: string; status: "pending" | "accepted"; joined_at: string | null; profiles: ProfileRow }[];
};

type CheckinRow = { group_id: string; member: string; day: string };

/**
 * Turns the joined Supabase rows for one group into the `Group` the app reads.
 * Pure — every input is passed in, including `todayKey` — which is what makes
 * the streak rules testable without a clock or a network.
 *
 * Exported for `__tests__/groupStreak.test.ts`; nothing else should call it.
 */
export function buildGroup(
  row: GroupRowJoined,
  completions: CompletionRow[],
  checkins: CheckinRow[],
  userId: string,
  todayKey: string
): Group {
  const habits = (row.group_habits ?? []).map(rowToGroupHabit);
  const week = weekRangeMonday(todayKey);
  const lastWeekDays = week.map((day) => addDays(day, -7));
  // Rolling window for the activity history grid (oldest → today).
  const gridDays = Array.from({ length: 21 }, (_, index) => addDays(todayKey, index - 20));
  const countFor = (member: string, habitId: string, day: string) =>
    completions.find((entry) => entry.member === member && entry.habit_id === habitId && entry.day === day)?.count ?? 0;
  const sumWithin = (rows: CompletionRow[], days: string[]) =>
    rows.filter((entry) => days.includes(entry.day)).reduce((sum, entry) => sum + entry.count, 0);
  const scheduledToday = scheduledGroupHabitsOn(habits, todayKey);
  // Pending invitees aren't members yet — they don't appear or count anywhere,
  // but the invite sheet marks them as already invited.
  const acceptedRows = (row.group_members ?? []).filter((memberRow) => memberRow.status !== "pending");

  /**
   * Whether a member is answerable for a given day — the rule that keeps a
   * group's streaks alive when it grows.
   *
   * Both streaks below walk backwards asking "did EVERY member do their bit
   * that day". Evaluated against today's roster alone, a member who joined on
   * Tuesday has no rows for Monday, so Monday fails and the loop breaks: the
   * moment someone accepted an invite, a group's 10-day streak read 0. Growing
   * the group destroyed its history retroactively.
   *
   * So a member only counts from their join date, and history they were not
   * present for is judged on the people who WERE. Plus one grace day: accept an
   * invite at 9pm with nothing logged and you would otherwise break the streak
   * on your first night, before having had a day to take part in. Members are
   * answerable from the day AFTER they joined.
   *
   * Missing `joined_at` (older rows, or a local-only group) means we can't
   * date the membership, so the member counts for every day — the previous
   * behaviour, which is the safe direction to fail: it can understate a streak,
   * never inflate one.
   */
  const countsOn = (memberRow: { joined_at?: string | null }, day: string) => {
    if (!memberRow.joined_at) {
      return true;
    }

    return day > toDateKey(new Date(memberRow.joined_at));
  };
  const pendingInviteeLumoIds = (row.group_members ?? [])
    .filter((memberRow) => memberRow.status === "pending" && memberRow.profiles)
    .map((memberRow) => memberRow.profiles.lumo_id);

  const members: GroupMember[] = acceptedRows
    .filter((memberRow) => memberRow.profiles)
    .map((memberRow) => {
      const memberId = memberRow.member;
      const memberRows = completions.filter((entry) => entry.member === memberId);
      const contribution = memberRows.reduce((sum, entry) => sum + entry.count, 0);
      const contributionByHabit: Record<string, number> = {};
      for (const habit of habits) {
        contributionByHabit[habit.id] = memberRows
          .filter((entry) => entry.habit_id === habit.id)
          .reduce((sum, entry) => sum + entry.count, 0);
      }
      const completedTodayHabitIds = habits
        .filter((habit) => countFor(memberId, habit.id, todayKey) >= dailyTarget(habit.goal))
        .map((habit) => habit.id);
      const weekByHabit: Record<string, MemberDayStatus[]> = {};
      const historyByHabit: Record<string, MemberDayStatus[]> = {};
      const todayCountByHabit: Record<string, number> = {};
      const statusOn = (habit: GroupHabit, day: string): MemberDayStatus => {
        if (day > todayKey || !isScheduledOn(habit.repeatSchedule, day)) {
          return "none";
        }

        const count = countFor(memberId, habit.id, day);

        if (isFlexibleGoal(habit.goal)) {
          return count > 0 ? "done" : "none";
        }
        if (count >= dailyTarget(habit.goal)) {
          return "done";
        }
        if (count > 0) {
          return "partial";
        }
        return day < todayKey ? "missed" : "none";
      };

      for (const habit of habits) {
        weekByHabit[habit.id] = week.map((day) => statusOn(habit, day));
        historyByHabit[habit.id] = gridDays.map((day) => statusOn(habit, day));
        todayCountByHabit[habit.id] = countFor(memberId, habit.id, todayKey);
      }

      return {
        profile: rowToProfile(memberRow.profiles),
        contribution,
        weekCompletions: sumWithin(memberRows, week),
        // With only flexible (weekly/monthly) activities, any check-in counts.
        checkedInToday: scheduledToday.length
          ? scheduledToday.every((habit) => completedTodayHabitIds.includes(habit.id))
          : memberRows.some((entry) => entry.day === todayKey && entry.count > 0),
        completedTodayHabitIds,
        todayCountByHabit,
        contributionByHabit,
        weekByHabit,
        historyByHabit
      };
    });

  // Distinct days any member logged each habit (all-time) — the challenge
  // duration progress. Built once from every completion row.
  const completedDaysByHabit: Record<string, string[]> = {};
  for (const habit of habits) {
    const days = new Set<string>();
    for (const entry of completions) {
      if (entry.habit_id === habit.id && entry.count > 0) {
        days.add(entry.day);
      }
    }
    completedDaysByHabit[habit.id] = Array.from(days).sort();
  }

  // Last week's recap: totals, per-member MVP, and perfect days.
  const lastWeekTotal = sumWithin(completions, lastWeekDays);
  let lastWeek: GroupWeekRecap | undefined;
  if (lastWeekTotal > 0) {
    const mvp = members.reduce(
      (best: { member: GroupMember; count: number } | null, member) => {
        const count = sumWithin(
          completions.filter((entry) => entry.member === member.profile.id),
          lastWeekDays
        );
        return count > (best?.count ?? 0) ? { member, count } : best;
      },
      null
    );
    const perfectDays = lastWeekDays.filter((day) => {
      const scheduled = habits.filter((habit) => isScheduledOn(habit.repeatSchedule, day));
      return (
        scheduled.length > 0 &&
        scheduled.every((habit) =>
          acceptedRows.every((memberRow) => countFor(memberRow.member, habit.id, day) >= dailyTarget(habit.goal))
        )
      );
    }).length;

    lastWeek = {
      total: lastWeekTotal,
      perfectDays,
      mvpLumoId: mvp?.member.profile.lumoId,
      mvpName: mvp?.member.profile.nickname,
      mvpCount: mvp?.count ?? 0
    };
  }

  // Streak: consecutive days (ending today, today itself optional) where every
  // member who had joined by then met every scheduled habit's target.
  let streak = 0;
  if (members.length && habits.length) {
    for (let offset = 0; offset < 60; offset++) {
      const day = addDays(todayKey, -offset);
      const scheduled = scheduledGroupHabitsOn(habits, day);
      const answerable = acceptedRows.filter((memberRow) => countsOn(memberRow, day));
      const allDone =
        answerable.length > 0 &&
        scheduled.every((habit) => answerable.every((memberRow) => countFor(memberRow.member, habit.id, day) >= dailyTarget(habit.goal)));

      if (allDone && scheduled.length) {
        streak += 1;
      } else if (day !== todayKey) {
        break;
      }
    }
  }

  // Roll-call streak: consecutive days (today optional) where every member who
  // had joined by then visited the group page. Independent of habit completion,
  // but grandfathered on the same rule — it broke identically on a new join.
  const checkedInOn = (member: string, day: string) => checkins.some((c) => c.member === member && c.day === day);
  let rollCallStreak = 0;
  if (acceptedRows.length) {
    for (let offset = 0; offset < 60; offset++) {
      const day = addDays(todayKey, -offset);
      const answerable = acceptedRows.filter((memberRow) => countsOn(memberRow, day));
      const everyoneVisited = answerable.length > 0 && answerable.every((memberRow) => checkedInOn(memberRow.member, day));

      if (everyoneVisited) {
        rollCallStreak += 1;
      } else if (day !== todayKey) {
        break;
      }
    }
  }

  return {
    id: row.id,
    name: row.name,
    habits,
    progress: completions.reduce((sum, entry) => sum + entry.count, 0),
    streak,
    rollCallStreak,
    checkedInTodayByMe: checkins.some((c) => c.member === userId && c.day === todayKey),
    weekTotal: sumWithin(completions, week),
    weeklyTarget: row.weekly_target ?? undefined,
    lastWeek,
    avatarSeed: row.avatar_seed ?? undefined,
    gridDays,
    completedDaysByHabit,
    members,
    pendingInviteeLumoIds,
    ownedByMe: row.owner === userId
  };
}

// Session-local fallback so the create-group flow still works end-to-end when
// the backend is unreachable (mirrors the old offline stub).
const offlineGroups: Group[] = [];

// Fired after any group completion write so live UI (e.g. the Friends tab
// badge) can refresh without polling.
const completionListeners = new Set<() => void>();

export function onGroupCompletionsChanged(listener: () => void): () => void {
  completionListeners.add(listener);

  return () => {
    completionListeners.delete(listener);
  };
}

function notifyCompletionsChanged() {
  completionListeners.forEach((listener) => listener());
}

// Fired after any change to which groups the user belongs to (leave, delete,
// create, accept an invite) so live UI like the home "Your groups" row can
// refresh in real time instead of only on screen focus.
const membershipListeners = new Set<() => void>();

export function onGroupMembershipChanged(listener: () => void): () => void {
  membershipListeners.add(listener);

  return () => {
    membershipListeners.delete(listener);
  };
}

function notifyMembershipChanged() {
  membershipListeners.forEach((listener) => listener());
}

export const friendsService = {
  status(): FriendsServiceStatus {
    return isSupabaseConfigured ? "ready" : "offline";
  },

  /** Upserts this device's profile so friends can find it by Lumo ID. Called
   * from LumoContext whenever the local profile changes. The email goes to the
   * private profile_emails table (owner-only RLS), never the public profile.
   * Returns "conflict" when another user already claimed this Lumo ID (the
   * column is unique) so the caller can regenerate and resync. */
  async syncProfile(profile: FriendProfile & { email?: string }): Promise<"ok" | "conflict" | "error"> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return "error";
    }

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      lumo_id: profile.lumoId,
      nickname: profile.nickname,
      avatar: profile.avatar ?? null
    });

    if (error) {
      // 23505 = unique violation; profiles has one unique constraint besides
      // the PK: lumo_id.
      return error.code === "23505" ? "conflict" : "error";
    }

    await supabase
      .from("profile_emails")
      .upsert({ id: userId, email: profile.email?.trim() || null, updated_at: new Date().toISOString() });

    return "ok";
  },

  async findByLumoId(lumoId: string): Promise<FriendProfile | null> {
    if (!(await ensureSignedIn())) {
      return null;
    }

    const { data } = await supabase.from("profiles").select("id, lumo_id, nickname, avatar").eq("lumo_id", lumoId).maybeSingle();

    return data ? rowToProfile(data as ProfileRow) : null;
  },

  async listFriends(): Promise<Friendship[]> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return [];
    }

    const { data } = await supabase
      .from("friendships")
      .select(
        "requester, addressee, status, requester_profile:profiles!friendships_requester_fkey(id, lumo_id, nickname, avatar), addressee_profile:profiles!friendships_addressee_fkey(id, lumo_id, nickname, avatar)"
      )
      .eq("status", "accepted");

    type FriendshipRow = {
      requester: string;
      addressee: string;
      status: "pending" | "accepted";
      requester_profile: ProfileRow;
      addressee_profile: ProfileRow;
    };

    return ((data ?? []) as unknown as FriendshipRow[])
      .map((row) => ({
        profile: rowToProfile(row.requester === userId ? row.addressee_profile : row.requester_profile),
        status: row.status
      }))
      .filter((friendship) => friendship.profile.lumoId);
  },

  async sendRequest(lumoId: string): Promise<boolean> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return false;
    }

    const targetId = await profileIdByLumoId(lumoId);
    if (!targetId || targetId === userId) {
      return false;
    }

    // Clear a prior request in this direction (e.g. one that was declined or
    // cancelled) so the (requester, addressee) primary key doesn't block a new
    // one. An accepted friendship is left untouched — they're already friends.
    await supabase
      .from("friendships")
      .delete()
      .eq("requester", userId)
      .eq("addressee", targetId)
      .eq("status", "pending");

    const { error } = await supabase.from("friendships").insert({ requester: userId, addressee: targetId });

    return !error;
  },

  async listInvitations(): Promise<FriendInvitation[]> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return [];
    }

    const { data } = await supabase
      .from("friendships")
      .select("invited_at, requester_profile:profiles!friendships_requester_fkey(id, lumo_id, nickname, avatar)")
      .eq("addressee", userId)
      .eq("status", "pending")
      .order("invited_at", { ascending: false });

    type InvitationRow = { invited_at: string; requester_profile: ProfileRow };

    return ((data ?? []) as unknown as InvitationRow[])
      .filter((row) => row.requester_profile)
      .map((row) => ({ ...rowToProfile(row.requester_profile), invitedAt: row.invited_at }));
  },

  async respondToInvitation(lumoId: string, accept: boolean): Promise<boolean> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return false;
    }

    const requesterId = await profileIdByLumoId(lumoId);
    if (!requesterId) {
      return false;
    }

    const { error } = accept
      ? await supabase.from("friendships").update({ status: "accepted" }).eq("requester", requesterId).eq("addressee", userId)
      : await supabase.from("friendships").delete().eq("requester", requesterId).eq("addressee", userId);

    return !error;
  },

  /** Removes an accepted friendship in either direction (RLS lets either side). */
  async unfriend(lumoId: string): Promise<boolean> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return false;
    }

    const friendId = await profileIdByLumoId(lumoId);
    if (!friendId) {
      return false;
    }

    const { error } = await supabase
      .from("friendships")
      .delete()
      .or(`and(requester.eq.${userId},addressee.eq.${friendId}),and(requester.eq.${friendId},addressee.eq.${userId})`);

    return !error;
  },

  /** Stores this device's Expo push token so the server can notify this user. */
  async savePushToken(token: string): Promise<boolean> {
    const userId = await ensureSignedIn();
    if (!userId || !token) {
      return false;
    }

    const { error } = await supabase
      .from("device_tokens")
      .upsert({ token, user_id: userId, platform: Platform.OS === "android" ? "android" : "ios" }, { onConflict: "token" });

    return !error;
  },

  async listGroups(): Promise<Group[]> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return [...offlineGroups];
    }

    const { data } = await supabase
      .from("groups")
      .select(
        // `joined_at` is what stops a new member's empty history breaking the
        // group's streak — see `countsOn` in buildGroup.
        "id, name, owner, weekly_target, avatar_seed, group_habits(id, name, icon, color, repeat_schedule, goal), group_members(member, status, joined_at, profiles(id, lumo_id, nickname, avatar))"
      )
      .order("created_at", { ascending: false });
    // Groups where this user is still a pending invitee live on the profile's
    // invitation list, not here.
    const groupRows = ((data ?? []) as unknown as GroupRowJoined[]).filter(
      (row) =>
        row.owner === userId ||
        (row.group_members ?? []).some((memberRow) => memberRow.member === userId && memberRow.status !== "pending")
    );

    if (!groupRows.length) {
      return [];
    }

    const groupIds = groupRows.map((row) => row.id);
    const [{ data: completionData }, { data: checkinData }] = await Promise.all([
      supabase.from("group_completions").select("group_id, habit_id, member, day, count, completed_at").in("group_id", groupIds),
      supabase.from("group_checkins").select("group_id, member, day").in("group_id", groupIds)
    ]);
    const completions = ((completionData ?? []) as CompletionRow[]);
    const checkins = ((checkinData ?? []) as CheckinRow[]);
    const todayKey = toDateKey();

    return groupRows.map((row) =>
      buildGroup(
        row,
        completions.filter((entry) => entry.group_id === row.id),
        checkins.filter((entry) => entry.group_id === row.id),
        userId,
        todayKey
      )
    );
  },

  /** Records that the current user visited the group today (roll-call streak). */
  async recordGroupCheckin(groupId: string): Promise<boolean> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return false;
    }

    // Ignore duplicate-key conflicts — one visit per member per day is enough.
    const { error } = await supabase
      .from("group_checkins")
      .upsert({ group_id: groupId, member: userId, day: toDateKey() }, { onConflict: "group_id,member,day", ignoreDuplicates: true });

    return !error;
  },

  async getGroup(id: string): Promise<Group | null> {
    const groups = await friendsService.listGroups();

    return groups.find((group) => group.id === id) ?? null;
  },

  async listGroupActivity(groupId: string): Promise<GroupActivity[]> {
    if (!(await ensureSignedIn())) {
      return [];
    }

    const { data } = await supabase
      .from("group_completions")
      .select("completed_at, profiles(id, lumo_id, nickname, avatar), group_habits(name)")
      .eq("group_id", groupId)
      .order("completed_at", { ascending: false })
      .limit(100);

    type ActivityRow = { completed_at: string; profiles: ProfileRow; group_habits: { name: string } };

    return ((data ?? []) as unknown as ActivityRow[])
      .filter((row) => row.profiles && row.group_habits)
      .map((row) => ({
        profile: rowToProfile(row.profiles),
        habitName: row.group_habits.name,
        at: row.completed_at
      }));
  },

  /**
   * Mirrors a local habit completion into group_completions when the habit is
   * shared with a group. `count` is the local completion count for that day
   * after the change; 0 removes the row. No-ops for personal habits, so
   * LumoContext can call this on every completion without checking first.
   */
  async syncCompletion(habitId: string, day: string, count: number): Promise<boolean> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return false;
    }

    const { data } = await supabase.from("group_habits").select("id, group_id").eq("id", habitId).maybeSingle();
    const groupHabit = data as { id: string; group_id: string } | null;
    if (!groupHabit) {
      return false;
    }

    if (count <= 0) {
      const { error } = await supabase.from("group_completions").delete().eq("habit_id", habitId).eq("member", userId).eq("day", day);

      if (!error) {
        notifyCompletionsChanged();
      }

      return !error;
    }

    const { error } = await supabase.from("group_completions").upsert({
      group_id: groupHabit.group_id,
      habit_id: habitId,
      member: userId,
      day,
      count,
      completed_at: new Date().toISOString()
    });

    if (!error) {
      notifyCompletionsChanged();
    }

    return !error;
  },

  /**
   * Adds a single shared activity to a group (e.g. from a productivity
   * challenge). Mirrors the group_habits insert used when creating a group.
   */
  async addGroupActivity(groupId: string, activity: GroupHabit): Promise<{ ok: true } | { ok: false; reason: string }> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return { ok: false, reason: "You're offline. Connect to the internet to start challenges." };
    }

    const { error } = await supabase.from("group_habits").insert({
      id: activity.id,
      group_id: groupId,
      name: activity.name,
      icon: activity.icon,
      color: activity.color ?? null,
      repeat_schedule: activity.repeatSchedule,
      goal: activity.goal
    });

    if (error) {
      console.warn("[addGroupActivity] insert failed", error);
      // 42501 = RLS denial. Only the group owner may write group_habits, so a
      // member tapping Start gets rejected here.
      const isRlsDenial = error.code === "42501" || /row-level security/i.test(error.message ?? "");
      return {
        ok: false,
        reason: isRlsDenial ? "Only the group's creator can start challenges." : error.message
      };
    }

    notifyMembershipChanged();
    return { ok: true };
  },

  /**
   * Sends a cheer to a group member. Capped at 3 cheers per sender per group
   * per day so they stay meaningful (soft, client-side cap).
   */
  async cheerMember(groupId: string, recipientId: string): Promise<"ok" | "limit" | "error"> {
    const userId = await ensureSignedIn();
    if (!userId || !recipientId) {
      return "error";
    }

    const day = toDateKey();
    const { data: sentToday } = await supabase
      .from("group_reactions")
      .select("id")
      .eq("group_id", groupId)
      .eq("sender", userId)
      .eq("kind", "cheer")
      .eq("day", day);

    if (((sentToday ?? []) as { id: string }[]).length >= 3) {
      return "limit";
    }

    const { error } = await supabase
      .from("group_reactions")
      .insert({ group_id: groupId, sender: userId, recipient: recipientId, kind: "cheer", day });

    return error ? "error" : "ok";
  },

  /**
   * Nudges a member who hasn't checked in today. One nudge per sender →
   * recipient per day, enforced by a partial unique index (23505 → "already").
   */
  async nudgeMember(groupId: string, recipientId: string): Promise<"ok" | "already" | "error"> {
    const userId = await ensureSignedIn();
    if (!userId || !recipientId) {
      return "error";
    }

    const { error } = await supabase
      .from("group_reactions")
      .insert({ group_id: groupId, sender: userId, recipient: recipientId, kind: "nudge", day: toDateKey() });

    if (!error) {
      return "ok";
    }

    return error.code === "23505" ? "already" : "error";
  },

  /** Today's cheers and nudges in a group, newest first. */
  async listTodayReactions(groupId: string): Promise<GroupReaction[]> {
    if (!(await ensureSignedIn())) {
      return [];
    }

    const { data } = await supabase
      .from("group_reactions")
      .select("kind, sender, recipient, created_at, profiles!group_reactions_sender_fkey(nickname)")
      .eq("group_id", groupId)
      .eq("day", toDateKey())
      .order("created_at", { ascending: false });

    type ReactionRow = {
      kind: "cheer" | "nudge";
      sender: string;
      recipient: string;
      created_at: string;
      profiles: { nickname: string | null } | null;
    };

    return ((data ?? []) as unknown as ReactionRow[]).map((row) => ({
      kind: row.kind,
      senderId: row.sender,
      senderName: row.profiles?.nickname ?? "",
      recipientId: row.recipient,
      at: row.created_at
    }));
  },

  /** Owner sets (or clears) the group's weekly completion target. */
  async setWeeklyTarget(groupId: string, target: number | null): Promise<boolean> {
    if (!(await ensureSignedIn())) {
      return false;
    }

    // RLS silently skips rows the caller doesn't own — verify one was updated.
    const { data, error } = await supabase
      .from("groups")
      .update({ weekly_target: target })
      .eq("id", groupId)
      .select("id");

    return !error && ((data ?? []) as { id: string }[]).length > 0;
  },

  async leaveGroup(groupId: string): Promise<boolean> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return false;
    }

    const { error } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("member", userId);

    if (!error) {
      notifyMembershipChanged();
    }

    return !error;
  },

  /**
   * Owner removes a member from the group. Only the group_members row is deleted —
   * the member's completion and check-in history stays in the database (those
   * tables key off profile + group, not membership), so re-adding them later
   * brings all their progress back into view.
   */
  async removeMember(groupId: string, memberId: string): Promise<boolean> {
    const userId = await ensureSignedIn();
    if (!userId || !memberId || memberId === userId) {
      return false;
    }

    // RLS silently skips rows the caller can't delete — verify one was removed.
    const { data, error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("member", memberId)
      .select("group_id");

    return !error && ((data ?? []) as unknown[]).length > 0;
  },

  async createGroup(draft: GroupDraft): Promise<Group> {
    const userId = await ensureSignedIn();

    // Offline fallback keeps the flow usable; the group lives for this session only.
    if (!userId) {
      const group: Group = {
        id: `group-${Date.now().toString(36)}`,
        name: draft.name,
        habits: draft.habits,
        progress: 0,
        streak: 0,
        rollCallStreak: 0,
        checkedInTodayByMe: false,
        weekTotal: 0,
        weeklyTarget: draft.weeklyTarget,
        avatarSeed: draft.avatarSeed,
        gridDays: [],
        completedDaysByHabit: {},
        pendingInviteeLumoIds: [],
        ownedByMe: true,
        members: []
      };
      offlineGroups.unshift(group);
      notifyMembershipChanged();

      return group;
    }

    const { data: groupRow, error } = await supabase
      .from("groups")
      .insert({ name: draft.name, owner: userId, weekly_target: draft.weeklyTarget ?? null, avatar_seed: draft.avatarSeed ?? null })
      .select("id")
      .single();
    if (error || !groupRow) {
      throw new Error("Could not create the group. Please try again.");
    }

    const groupId = (groupRow as { id: string }).id;

    if (draft.habits.length) {
      await supabase.from("group_habits").insert(
        draft.habits.map((habit) => ({
          id: habit.id,
          group_id: groupId,
          name: habit.name,
          icon: habit.icon,
          color: habit.color ?? null,
          repeat_schedule: habit.repeatSchedule,
          goal: habit.goal
        }))
      );
    }

    const memberIds = [userId];
    if (draft.memberLumoIds.length) {
      const { data: memberRows } = await supabase.from("profiles").select("id").in("lumo_id", draft.memberLumoIds);
      memberIds.push(...((memberRows ?? []) as { id: string }[]).map((row) => row.id).filter((id) => id !== userId));
    }
    // The owner joins immediately; everyone else gets a pending invitation to
    // accept or decline from their profile.
    await supabase
      .from("group_members")
      .insert(memberIds.map((member) => ({ group_id: groupId, member, status: member === userId ? "accepted" : "pending" })));

    notifyMembershipChanged();

    return {
      id: groupId,
      name: draft.name,
      habits: draft.habits,
      progress: 0,
      streak: 0,
      rollCallStreak: 0,
      checkedInTodayByMe: false,
      weekTotal: 0,
      weeklyTarget: draft.weeklyTarget,
      avatarSeed: draft.avatarSeed,
      gridDays: [],
      completedDaysByHabit: {},
      pendingInviteeLumoIds: [],
      ownedByMe: true,
      members: []
    };
  },

  /** Invites a friend to the group (pending until they accept). */
  async inviteToGroup(groupId: string, lumoId: string): Promise<"ok" | "already" | "error"> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return "error";
    }

    const memberId = await profileIdByLumoId(lumoId);
    if (!memberId) {
      return "error";
    }

    // Clear a prior pending invite (e.g. one that was declined or cancelled) so
    // the (group_id, member) primary key doesn't block re-inviting. An accepted
    // membership stays put — they're already in the group.
    await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("member", memberId)
      .eq("status", "pending");

    const { error } = await supabase.from("group_members").insert({ group_id: groupId, member: memberId, status: "pending" });

    if (!error) {
      return "ok";
    }

    // Primary-key conflict: they're already an accepted member.
    return error.code === "23505" ? "already" : "error";
  },

  /**
   * Owner edits the group: name, avatar seed, and the activity list. Activity
   * sync is upsert-current + delete-removed; removing an activity cascades its
   * completion history.
   */
  async updateGroup(groupId: string, draft: { name: string; avatarSeed?: string; habits: GroupHabit[] }): Promise<boolean> {
    const userId = await ensureSignedIn();
    const cleanName = draft.name.trim();
    if (!userId || !cleanName) {
      return false;
    }

    // RLS silently skips rows the caller doesn't own — verify one was updated.
    const { data: updated, error } = await supabase
      .from("groups")
      .update({ name: cleanName, avatar_seed: draft.avatarSeed ?? null })
      .eq("id", groupId)
      .select("id");
    if (error || !((updated ?? []) as { id: string }[]).length) {
      return false;
    }

    const { data: existingRows } = await supabase.from("group_habits").select("id").eq("group_id", groupId);
    const keepIds = new Set(draft.habits.map((habit) => habit.id));
    const removedIds = ((existingRows ?? []) as { id: string }[]).map((row) => row.id).filter((habitId) => !keepIds.has(habitId));

    if (draft.habits.length) {
      const { error: upsertError } = await supabase.from("group_habits").upsert(
        draft.habits.map((habit) => ({
          id: habit.id,
          group_id: groupId,
          name: habit.name,
          icon: habit.icon,
          color: habit.color ?? null,
          repeat_schedule: habit.repeatSchedule,
          goal: habit.goal
        }))
      );
      if (upsertError) {
        return false;
      }
    }

    if (removedIds.length) {
      await supabase.from("group_habits").delete().eq("group_id", groupId).in("id", removedIds);
    }

    return true;
  },

  /** Owner deletes the group (habits, completions, and invites cascade). */
  async deleteGroup(groupId: string): Promise<boolean> {
    if (!(await ensureSignedIn())) {
      return false;
    }

    // RLS silently skips rows the caller doesn't own — verify one was removed.
    const { data, error } = await supabase.from("groups").delete().eq("id", groupId).select("id");

    const removed = !error && ((data ?? []) as { id: string }[]).length > 0;
    if (removed) {
      notifyMembershipChanged();
    }

    return removed;
  },

  /** Pending group invitations for this user, for the profile screen. */
  async listGroupInvitations(): Promise<GroupInvitation[]> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return [];
    }

    const { data } = await supabase
      .from("group_members")
      .select("joined_at, groups(id, name, avatar_seed, profiles!groups_owner_fkey(nickname))")
      .eq("member", userId)
      .eq("status", "pending")
      .order("joined_at", { ascending: false });

    type InviteRow = {
      joined_at: string;
      groups: { id: string; name: string; avatar_seed: string | null; profiles: { nickname: string | null } | null } | null;
    };

    return ((data ?? []) as unknown as InviteRow[])
      .filter((row) => row.groups)
      .map((row) => ({
        groupId: row.groups!.id,
        groupName: row.groups!.name,
        avatarSeed: row.groups!.avatar_seed ?? undefined,
        invitedBy: row.groups!.profiles?.nickname || undefined,
        invitedAt: row.joined_at
      }));
  },

  /** Accepts (status flip) or declines (row delete) a pending group invite. */
  async respondToGroupInvitation(groupId: string, accept: boolean): Promise<boolean> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return false;
    }

    // RLS silently skips rows the caller doesn't own — verify one was touched.
    const { data, error } = accept
      ? // `joined_at` is stamped again here, not left at the invite's own
        // insert time. The streak rule dates a member from `joined_at`, and an
        // invite sat on for a week would otherwise make them answerable for
        // days they had not yet accepted — reintroducing the very break the
        // rule exists to prevent.
        await supabase
          .from("group_members")
          .update({ status: "accepted", joined_at: new Date().toISOString() })
          .eq("group_id", groupId)
          .eq("member", userId)
          .select("group_id")
      : await supabase.from("group_members").delete().eq("group_id", groupId).eq("member", userId).select("group_id");

    const changed = !error && ((data ?? []) as unknown[]).length > 0;
    if (changed) {
      notifyMembershipChanged();
    }

    return changed;
  }
};
