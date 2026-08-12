import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { HabitIcon } from "@/components/HabitIcon";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { FormSection } from "@/components/HabitForm";
import { AppText, Field, FieldLabel, LumoInput, Screen } from "@/components/ui";
import { challengeByName } from "@/constants/groupChallenges";
import { CTA_FILL, fontFamilies, habitColorOption, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { buildGroupAvatarSvg, defaultAvatar } from "@/lib/avatar";
import { alpha } from "@/lib/color";
import { beginActivityEdit } from "@/lib/groupActivityBridge";
import { friendsService, type Friendship, type GroupHabit } from "@/lib/friends";
import type { RepeatSchedule } from "@/types/habit";

function frequencyLabel(schedule: RepeatSchedule) {
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

function makeAvatarSeeds() {
  return Array.from({ length: 50 }, () => Math.random().toString(36).slice(2, 10));
}

function activityMeta(activity: GroupHabit) {
  if (activity.goal.type === "monthly") {
    return activity.goal.target === 1 ? "Once a month" : `${activity.goal.target}× a month`;
  }
  if (activity.goal.type === "weekly") {
    return activity.goal.target === 1 ? "Once a week" : `${activity.goal.target}× a week`;
  }

  const goal = activity.goal.type === "multiple" ? `${activity.goal.count}× a day` : "Once a day";

  return `${frequencyLabel(activity.repeatSchedule)} · ${goal}`;
}

/**
 * Create-group form. Activities are shared definitions that live ONLY in the
 * group (they are not added to anyone's personal habit list) — each carries
 * its own frequency and target, and members check them off from the group
 * page.
 */
export default function NewGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string }>();
  // Set when opened from a group's Edit button — the form saves changes to
  // that group instead of creating a new one.
  const editId = typeof params.editId === "string" ? params.editId : undefined;
  const { palette, isDark } = useLumo();
  const [name, setName] = React.useState("");
  const [activities, setActivities] = React.useState<GroupHabit[]>([]);
  // Group avatar: a pick-one row of DiceBear thumbs variants.
  const [avatarSeeds, setAvatarSeeds] = React.useState<string[]>(makeAvatarSeeds);
  const [avatarSeed, setAvatarSeed] = React.useState<string>(() => avatarSeeds[0]);
  const avatarSvgs = React.useMemo(
    () => Object.fromEntries(avatarSeeds.map((seed) => [seed, buildGroupAvatarSvg(seed)])),
    [avatarSeeds]
  );
  const [friends, setFriends] = React.useState<Friendship[]>([]);
  const [selectedFriends, setSelectedFriends] = React.useState<Set<string>>(() => new Set());
  const [createPressed, setCreatePressed] = React.useState(false);
  const [addActivityPressed, setAddActivityPressed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const canCreate = Boolean(name.trim()) && activities.length > 0 && !saving;

  React.useEffect(() => {
    let active = true;

    friendsService.listFriends().then((loaded) => {
      if (active) {
        setFriends(loaded.filter((friendship) => friendship.status === "accepted"));
      }
    });

    return () => {
      active = false;
    };
  }, []);

  // Edit mode: prefill from the existing group (members stay managed on the
  // group page, so the invite card is hidden while editing).
  React.useEffect(() => {
    if (!editId) {
      return;
    }

    let active = true;

    friendsService.getGroup(editId).then((group) => {
      if (!active || !group) {
        return;
      }

      setName(group.name);
      setActivities(group.habits);
      const seed = group.avatarSeed ?? group.id;
      setAvatarSeeds((current) => [seed, ...current.filter((entry) => entry !== seed)]);
      setAvatarSeed(seed);
    });

    return () => {
      active = false;
    };
  }, [editId]);

  /**
   * Opens the activity screen. `beginActivityEdit` registers where the result
   * comes back to — this screen stays mounted underneath, so the handler is
   * still live when the activity screen calls it.
   */
  function openActivityScreen(activity: GroupHabit | null) {
    const taken = activities.filter((entry) => entry.id !== activity?.id).map((entry) => entry.name);

    beginActivityEdit(activity, taken, (saved) => {
      setActivities((current) =>
        current.some((entry) => entry.id === saved.id)
          ? current.map((entry) => (entry.id === saved.id ? saved : entry))
          : [...current, saved]
      );
    });

    router.push("/group/activity");
  }

  function removeActivity(activity: GroupHabit) {
    Alert.alert("Remove activity?", `"${activity.name}" will be removed from this group.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => setActivities((current) => current.filter((entry) => entry.id !== activity.id))
      }
    ]);
  }

  function toggleFriend(lumoId: string) {
    setSelectedFriends((current) => {
      const next = new Set(current);

      if (next.has(lumoId)) {
        next.delete(lumoId);
      } else {
        next.add(lumoId);
      }

      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert("Name needed", "Give your group a name.");
      return;
    }

    if (!activities.length) {
      Alert.alert("Add an activity", "A group needs at least one activity to work toward.");
      return;
    }

    setSaving(true);

    try {
      if (editId) {
        const ok = await friendsService.updateGroup(editId, { name: name.trim(), habits: activities, avatarSeed });

        if (!ok) {
          Alert.alert("Couldn't save changes", "Please check your connection and try again.");
          return;
        }
      } else {
        await friendsService.createGroup({
          name: name.trim(),
          habits: activities,
          memberLumoIds: [...selectedFriends],
          avatarSeed
        });
      }
      router.back();
    } catch {
      // Surfaced instead of silently resetting the button (e.g. offline, or a
      // pending database migration rejecting the insert).
      Alert.alert(editId ? "Couldn't save changes" : "Couldn't create group", "Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader title={editId ? "Edit Group" : "New Group"} leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      {/* Sections on the canvas, not cards — the habit form's structure, which
          groups fields with a heading and whitespace rather than nesting one
          surface inside another. */}
      <FormSection
        heading="Group details"
        hint="Name your group — you'll add the activities you do together next."
        style={styles.firstSection}
      >
        <Field>
          <FieldLabel>Avatar</FieldLabel>
          {/* Bleeds to the screen gutter so the row scrolls edge-to-edge. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarScroll} contentContainerStyle={styles.avatarRow}>
            {avatarSeeds.map((seed) => {
              const selected = seed === avatarSeed;

              return (
                <Pressable
                  key={seed}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Group avatar option${selected ? ", selected" : ""}`}
                  onPress={() => setAvatarSeed(seed)}
                  style={[styles.avatarOption, { borderColor: selected ? palette.greenDark : "transparent" }]}
                >
                  <Avatar svg={avatarSvgs[seed]} size={54} />
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>

        <Field>
          <FieldLabel>Group name</FieldLabel>
          <LumoInput
            value={name}
            onChangeText={setName}
            placeholder="Morning Crew"
            autoCapitalize="words"
            returnKeyType="done"
            style={[styles.formInput, { backgroundColor: palette.card }]}
          />
        </Field>
      </FormSection>

      <FormSection
        heading="Activities"
        hint="What your group does together — like running every weekend. Each activity has its own frequency and target, and lives only in this group."
      >
        {activities.length ? (
          <View>
            {activities.map((activity, index) => {
              const colorOption = habitColorOption(activity.color);
              // Started challenges are fixed — the group logs them by name, so they
              // can't be renamed/edited here. The owner can still remove them.
              const isChallenge = Boolean(challengeByName(activity.name));

              return (
                <View
                  key={activity.id}
                  style={[
                    styles.activityRow,
                    index === 0 && styles.listRowFirst,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
                    index === activities.length - 1 && styles.listRowLast
                  ]}
                >
                  <View style={[styles.activityIcon, { backgroundColor: colorOption?.color ?? alpha(palette.greenDark, "12") }]}>
                    <HabitIcon value={activity.icon} color={colorOption?.onColor ?? palette.greenDark} size={16} />
                  </View>
                  <View style={styles.activityText}>
                    <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.activityName}>
                      {activity.name}
                    </AppText>
                    <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                      {isChallenge ? "Challenge · can't be edited" : activityMeta(activity)}
                    </AppText>
                  </View>
                  <View style={styles.activityActions}>
                    {isChallenge ? null : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${activity.name}`}
                        onPress={() => openActivityScreen(activity)}
                        hitSlop={6}
                        style={[styles.activityAction, { backgroundColor: alpha(palette.greenDark, "12") }]}
                      >
                        <Icon name="edit" size={14} color={palette.greenDark} weight="bulk" />
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${activity.name}`}
                      onPress={() => removeActivity(activity)}
                      hitSlop={6}
                      style={[styles.activityAction, { backgroundColor: alpha(palette.danger, "14") }]}
                    >
                      <Icon name="close" size={14} color={palette.danger} weight="bulk" />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* No "No activities yet" line — the section's own hint already says
            what an activity is, and the Add button below says what to do about
            it. A third sentence between them just repeated both. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add activity"
          onPress={() => openActivityScreen(null)}
          onPressIn={() => setAddActivityPressed(true)}
          onPressOut={() => setAddActivityPressed(false)}
          style={[styles.addActivityButton, { backgroundColor: alpha(palette.greenDark, isDark ? "26" : "12"), opacity: addActivityPressed ? 0.8 : 1 }]}
        >
          <Icon name="cloudPlus" size={18} color={palette.greenDark} weight="bulk" />
          <AppText variant="button" color={palette.greenDark} style={styles.addActivityLabel}>
            Add Activity
          </AppText>
        </Pressable>
      </FormSection>

      {editId ? null : (
      <FormSection heading="Invite friends" hint="Members check in on the group's activities and everyone's progress adds up.">
        {friends.length ? (
          friends.map((friendship, index) => {
            const selected = selectedFriends.has(friendship.profile.lumoId);

            return (
              <Pressable
                key={friendship.profile.lumoId}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${friendship.profile.nickname || friendship.profile.lumoId}${selected ? ", selected" : ""}`}
                onPress={() => toggleFriend(friendship.profile.lumoId)}
                style={[
                  styles.friendRow,
                  index === 0 && styles.listRowFirst,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
                  index === friends.length - 1 && styles.listRowLast
                ]}
              >
                <View style={[styles.friendAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
                  <Avatar config={friendship.profile.avatar ?? defaultAvatar()} size={34} />
                </View>
                <View style={styles.friendText}>
                  <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.friendName}>
                    {friendship.profile.nickname || "Lumo user"}
                  </AppText>
                  <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                    {friendship.profile.lumoId}
                  </AppText>
                </View>
                <Icon
                  name={selected ? "checkCircle" : "plusCircle"}
                  size={22}
                  color={selected ? palette.greenDark : palette.muted}
                  weight="bulk"
                  style={selected ? undefined : styles.friendAddIcon}
                />
              </Pressable>
            );
          })
        ) : (
          <AppText variant="caption" color={palette.subtle} style={styles.hint}>
            No friends yet — share your Lumo ID from your profile, then invite friends here.
          </AppText>
        )}
      </FormSection>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={editId ? "Save changes" : "Create group"}
        disabled={!canCreate}
        onPress={handleCreate}
        onPressIn={() => setCreatePressed(true)}
        onPressOut={() => setCreatePressed(false)}
        style={[
          styles.createButton,
          { backgroundColor: CTA_FILL, opacity: saving ? 1 : !canCreate ? 0.45 : createPressed ? 0.85 : 1 }
        ]}
      >
        {saving ? (
          <ActivityIndicator color={palette.white} />
        ) : (
          <>
            <AppText variant="button" color={palette.white} style={styles.createLabel}>
              {editId ? "Save Changes" : "Create Group"}
            </AppText>
            {canCreate ? (
              <AppText variant="caption" color="rgba(255,255,255,0.85)">
                {activities.length} {activities.length === 1 ? "activity" : "activities"}
                {!editId && selectedFriends.size ? ` · ${selectedFriends.size} ${selectedFriends.size === 1 ? "friend" : "friends"}` : ""}
              </AppText>
            ) : null}
          </>
        )}
      </Pressable>

    </Screen>
  );
}

const styles = StyleSheet.create({
  // No row gap: `FormSection` already carries the space between sections, and
  // adding one here stacked on top of it.
  content: {
    paddingBottom: spacing.xxl
  },
  // `FormSection` carries a spacing.ml top margin to set sections apart from
  // each other — but the first one has no section above it, only the header
  // bar, so it stacked on the bar's own margin and the screen's row gap for
  // 52pt of dead air before the form began.
  firstSection: {
    marginTop: 0
  },
  // The habit form's field box, verbatim: a boxed input with a warm outline,
  // not the underline this form used to draw. Two forms in one app should not
  // disagree about what an input looks like.
  formInput: {
    borderWidth: 1,
    borderRadius: radius.button,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamilies.lexendSemiBold
  },
  avatarScroll: {
    marginHorizontal: -layout.screenPaddingX
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: layout.screenPaddingX
  },
  avatarOption: {
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    borderWidth: 2,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  /**
   * A list's outer rows sit flush, so the row padding does not stack on the
   * section's own 20pt gap. Without this a section whose content is a list read
   * 32pt from its heading while a section of plain fields read 20 — the lists
   * looked pushed down relative to every other section.
   */
  listRowFirst: {
    paddingTop: 0
  },
  listRowLast: {
    paddingBottom: 0
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  activityText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  activityName: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  activityActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  activityAction: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  // No margin of its own — the section's 20pt gap is the whole separation. The
  // extra 8 here dated from when that gap was 12; once it went to 20 the button
  // was sitting 28pt off the list.
  addActivityButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.pill
  },
  addActivityLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  hint: {
    lineHeight: 17,
    opacity: 0.8
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  friendAddIcon: {
    opacity: 0.6
  },
  friendAvatar: {
    width: 38,
    height: 38,
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
  friendName: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  // spacing.hero, the same distance the habit and activity forms put between
  // their last field and their CTA.
  createButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    marginTop: spacing.xl
  },
  createLabel: {
    fontSize: 16,
    lineHeight: 21
  },
});
