import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { AppText, Screen } from "@/components/ui";
import { control, fontFamilies, habitAccent, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { Avatar } from "@/components/Avatar";
import { FireIcon } from "@/components/FireIcon";
import { Skeleton } from "@/components/Skeleton";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { buildGroupAvatarSvg, defaultAvatar } from "@/lib/avatar";
import { alpha } from "@/lib/color";
import { friendsService, type Friendship, type Group } from "@/lib/friends";
import { formatLumoId } from "@/lib/lumoId";

/** Masks free typing into the `LUMO-XXXX-XX` ID format: the LUMO- prefix is
 * fixed (it restores itself if deletion reaches into it); the user only types
 * the code, which gets uppercased, filtered to the ID alphabet, and dashed. */
const LUMO_ID_PREFIX = "LUMO-";

function maskLumoId(text: string) {
  let value = text.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (value.startsWith("LUMO")) {
    value = value.slice(4);
  }

  value = value.replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, "").slice(0, 6);

  return value.length <= 4 ? `${LUMO_ID_PREFIX}${value}` : `${LUMO_ID_PREFIX}${value.slice(0, 4)}-${value.slice(4)}`;
}

// Friends is fully built but not launched — flip this off to reveal it.
// Backend is wired (Supabase) — flip back to true to re-hide the tab for launch.
const FRIENDS_COMING_SOON = false;

const features: { icon: IconName; title: string; body: string }[] = [
  { icon: "friends", title: "Track together", body: "Follow your friends' progress and stay motivated." },
  { icon: "elementPlus", title: "Groups", body: "Every member's completions add up to one shared goal." },
  { icon: "heart", title: "Cheer each other on", body: "Celebrate streaks and wins as a team." },
  { icon: "trophy", title: "Friendly streaks", body: "Compare streaks and keep each other going." }
];

type FriendsTab = "friends" | "goals";

// Mirrors the Insights StatsSegmentedControl styling so the two tab bars read
// as the same component family.
function FriendsTabs({ value, onChange }: { value: FriendsTab; onChange: (value: FriendsTab) => void }) {
  const { palette, isDark } = useLumo();
  const controlBackground = isDark ? palette.chartTrack : alpha(palette.chartTrack, "99");
  const selectedBackground = isDark ? palette.greenDark : palette.white;
  const options: { label: string; value: FriendsTab }[] = [
    { label: "Groups", value: "goals" },
    { label: "Friends", value: "friends" }
  ];

  return (
    <View style={[styles.tabs, { backgroundColor: controlBackground, shadowColor: isDark ? "transparent" : palette.shadow }]}>
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
                      backgroundColor: selectedBackground,
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

function GroupCard({ group, onPress }: { group: Group; onPress: () => void }) {
  const { palette, isDark } = useLumo();
  const [pressed, setPressed] = React.useState(false);
  const groupAvatarSvg = React.useMemo(() => buildGroupAvatarSvg(group.avatarSeed ?? group.id), [group.avatarSeed, group.id]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open group ${group.name}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.groupCard,
        { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow, opacity: pressed ? 0.85 : 1 }
      ]}
    >
      <View style={styles.groupHeader}>
        <View style={[styles.groupIdentity, { backgroundColor: alpha(palette.greenDark, "10") }]}>
          <Avatar svg={groupAvatarSvg} size={40} rounded={false} />
        </View>
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
            <View
              key={member.profile.lumoId}
              style={[
                styles.groupAvatar,
                { backgroundColor: alpha(palette.greenDark, "10"), borderColor: palette.card, marginLeft: index ? -10 : 0 }
              ]}
            >
              <Avatar config={member.profile.avatar ?? defaultAvatar()} size={24} rounded={false} />
            </View>
          ))}
          {group.members.length > 2 ? (
            <View
              style={[
                styles.groupAvatar,
                { backgroundColor: alpha(palette.greenDark, "14"), borderColor: palette.card, marginLeft: -10 }
              ]}
            >
              <AppText variant="caption" color={palette.greenDark} style={styles.groupAvatarMore}>
                +{group.members.length - 2}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupHabitsScroll} contentContainerStyle={styles.groupHabits}>
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
    </Pressable>
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
          <View style={styles.skeletonLines}>
            <Skeleton width="55%" height={13} />
            <Skeleton width="35%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

function GroupCardSkeleton() {
  const { palette, isDark } = useLumo();

  return (
    <View style={[styles.skeletonCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      {/* Header: group avatar, name + meta column, member avatars right. */}
      <View style={styles.skeletonHeaderRow}>
        <Skeleton width={40} height={40} round />
        <View style={styles.skeletonLines}>
          <Skeleton width="50%" height={14} />
          <Skeleton width="40%" height={10} />
        </View>
        <View style={styles.skeletonAvatars}>
          <Skeleton width={24} height={24} round />
          <Skeleton width={24} height={24} round />
        </View>
      </View>
      {/* Activity chips row. */}
      <View style={styles.skeletonChips}>
        <Skeleton width={84} height={22} round />
        <Skeleton width={104} height={22} round />
        <Skeleton width={72} height={22} round />
      </View>
    </View>
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const { palette, isDark, isPro, lumoIdSuffix } = useLumo();
  const [activeTab, setActiveTab] = React.useState<FriendsTab>("goals");
  const [inviteVisible, setInviteVisible] = React.useState(false);
  const [invitePressed, setInvitePressed] = React.useState(false);
  const [sendPressed, setSendPressed] = React.useState(false);
  const [sendingInvite, setSendingInvite] = React.useState(false);
  const [inviteId, setInviteId] = React.useState(LUMO_ID_PREFIX);
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [friends, setFriends] = React.useState<Friendship[]>([]);
  // First fetch shows skeletons; later focus refreshes update in place.
  const [initialLoading, setInitialLoading] = React.useState(true);
  const syncOffline = friendsService.status() === "offline";
  const myGroups = groups.filter((group) => group.ownedByMe);
  const invitedGroups = groups.filter((group) => !group.ownedByMe);

  const [refreshing, setRefreshing] = React.useState(false);

  const loadData = React.useCallback(async () => {
    const [loadedGroups, loadedFriends] = await Promise.all([friendsService.listGroups(), friendsService.listFriends()]);
    setGroups(loadedGroups);
    setFriends(loadedFriends);
    setInitialLoading(false);
  }, []);

  // Refresh on focus so a group created on the form screen (or an invite
  // accepted on the profile screen) shows up on return.
  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [loadData])
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
      <Screen contentStyle={styles.content}>
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

  if (!isPro) {
    return <SubscriptionGate />;
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
            await loadData();
            setRefreshing(false);
          }}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="displaySmall" color={palette.ink} style={styles.pageTitle}>
            {activeTab === "friends" ? "Friends" : "Groups"}
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle}>
            {activeTab === "friends"
              ? "Your Lumo ID and QR code live on your profile — tap your avatar on Home."
              : "Do activities with friends — everyone's check-ins add up to the goal."}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={activeTab === "friends" ? "Invite a friend" : "Create a group"}
          onPress={() => {
            if (activeTab === "friends") {
              setInviteVisible(true);
            } else {
              router.push("/group/new");
            }
          }}
          onPressIn={() => setInvitePressed(true)}
          onPressOut={() => setInvitePressed(false)}
          style={[styles.inviteButton, { backgroundColor: palette.greenSoft, opacity: invitePressed ? 0.75 : 1 }]}
        >
          <Icon name={activeTab === "friends" ? "userCircleAdd" : "elementPlus"} size={24} color={palette.greenDark} weight="bulk" />
        </Pressable>
      </View>

      <FriendsTabs value={activeTab} onChange={setActiveTab} />

      {activeTab === "friends" ? (
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
                <View style={[styles.friendAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
                  <Avatar config={friend.profile.avatar ?? defaultAvatar()} size={38} rounded={false} />
                </View>
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
          <View style={[styles.emptyCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
            <Icon name="friends" size={22} color={palette.muted} weight="bulk" />
            <AppText variant="bodySmall" color={palette.subtle} style={styles.emptyText}>
              {syncOffline
                ? "Friend connections sync in an upcoming update. Share your Lumo ID or QR now so friends are ready to add you."
                : "No friends yet — share your Lumo ID to get started."}
            </AppText>
          </View>
        )}
      </View>
      ) : (
      <>
        {/* Hidden entirely when there are no owned groups — the invited
            section below always shows and carries the tab's empty state. */}
        {initialLoading || myGroups.length ? (
          <View style={styles.section}>
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
        <View style={styles.section}>
          {initialLoading ? (
            <GroupCardSkeleton />
          ) : invitedGroups.length ? (
            invitedGroups.map((group) => <GroupCard key={group.id} group={group} onPress={() => router.push(`/group/${group.id}`)} />)
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
              <Icon name="trophy" size={22} color={palette.muted} weight="bulk" />
              <AppText variant="bodySmall" color={palette.subtle} style={styles.emptyText}>
                No groups yet. Tap + to create one with friends, or accept a group invite from your profile.
              </AppText>
            </View>
          )}
        </View>
        ) : null}
      </>
      )}

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
    paddingBottom: layout.tabScreenBottomPadding,
    gap: spacing.lg
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
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  subscribeLabel: {
    fontSize: 17,
    lineHeight: 22
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xl
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs
  },
  inviteButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
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
    borderRadius: radius.nav,
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
  pageTitle: {
    fontFamily: "Lexend-Black",
    fontSize: 34,
    lineHeight: 40
  },
  section: {
    gap: spacing.sm
  },
  sectionTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.nav,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  // Friend rows — mirrors the profile screen's invitation card.
  friendsCard: {
    borderRadius: radius.nav,
    paddingHorizontal: spacing.lg,
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
  friendAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  friendText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  friendRemove: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
  skeletonCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.nav,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  skeletonAvatars: {
    flexDirection: "row",
    gap: spacing.xxs
  },
  skeletonHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  skeletonChips: {
    flexDirection: "row",
    gap: spacing.xxs,
    marginTop: spacing.xs
  },
  emptyText: {
    lineHeight: 19,
    textAlign: "center"
  },
  groupCard: {
    gap: spacing.xs,
    borderRadius: radius.nav,
    padding: spacing.lg,
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
  groupIdentity: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
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
    marginTop: spacing.xs,
    marginHorizontal: -spacing.lg
  },
  groupHabits: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.lg
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
    minWidth: 0
  }
});
