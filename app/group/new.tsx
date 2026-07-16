import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { FloatingDropdown } from "@/components/FloatingDropdown";
import { HabitIcon } from "@/components/HabitIcon";
import { Icon, type IconName } from "@/components/Icon";
import { categoryIconOptions } from "@/components/IconPicker";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Card, FieldLabel, LumoInput, Screen } from "@/components/ui";
import { defaultHabitColor, fontFamilies, habitColorOption, habitColorPickerOptions, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { buildGroupAvatarSvg, defaultAvatar } from "@/lib/avatar";
import { alpha } from "@/lib/color";
import { dayLabels, dayNames } from "@/lib/date";
import { friendsService, type Friendship, type GroupHabit } from "@/lib/friends";
import type { GoalType, RepeatSchedule, Weekday } from "@/types/habit";

// All picker icons in one row (activities have no category).
const activityIconOptions: IconName[] = [...new Set(Object.values(categoryIconOptions).flat())];

// One merged "How often?" axis, same as the habit form: day-bound schedules
// and any-day period targets are alternatives, so conflicting combos are
// inexpressible. "Times per day" applies only to the day-bound choices.
type ActivityCadence = RepeatSchedule["type"] | "weekly" | "monthly";

const cadenceOptions: { label: string; value: ActivityCadence }[] = [
  { label: "Every day", value: "daily" },
  { label: "Weekdays", value: "weekdays" },
  { label: "Weekends", value: "weekends" },
  { label: "Specific days", value: "specific" },
  { label: "Custom interval", value: "interval" },
  { label: "Times per week", value: "weekly" },
  { label: "Times per month", value: "monthly" }
];

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
  // Activity dialog state — mirrors the habit form's merged "How often?" field.
  const [dialogVisible, setDialogVisible] = React.useState(false);
  // Set while editing an existing activity; null means the dialog adds a new one.
  const [editingActivityId, setEditingActivityId] = React.useState<string | null>(null);
  const [activityName, setActivityName] = React.useState("");
  const [activityIcon, setActivityIcon] = React.useState<IconName>("sparkle");
  const [activityColor, setActivityColor] = React.useState(defaultHabitColor);
  const [cadence, setCadence] = React.useState<ActivityCadence>("daily");
  const [specificDays, setSpecificDays] = React.useState<Weekday[]>([1, 2, 3, 4, 5]);
  const [intervalDays, setIntervalDays] = React.useState("2");
  const [goalAmount, setGoalAmount] = React.useState("1");
  const [dialogAddPressed, setDialogAddPressed] = React.useState(false);
  const [dialogCancelPressed, setDialogCancelPressed] = React.useState(false);
  const [nameFieldFocused, setNameFieldFocused] = React.useState(false);
  // Period (weekly/monthly) targets replace the day schedule ("any day").
  const periodGoal = cadence === "weekly" || cadence === "monthly";
  const buttonFill = isDark ? palette.green : palette.greenDark;
  const fieldBorderColor = alpha(palette.greenDark, "33");
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

  function openActivityDialog() {
    setEditingActivityId(null);
    setActivityName("");
    setActivityIcon("sparkle");
    setActivityColor(defaultHabitColor);
    setCadence("daily");
    setSpecificDays([1, 2, 3, 4, 5]);
    setIntervalDays("2");
    setGoalAmount("1");
    setDialogVisible(true);
  }

  function openEditActivity(activity: GroupHabit) {
    setEditingActivityId(activity.id);
    setActivityName(activity.name);
    setActivityIcon(activity.icon);
    setActivityColor(activity.color ?? defaultHabitColor);
    setCadence(
      activity.goal.type === "weekly" || activity.goal.type === "monthly" ? activity.goal.type : activity.repeatSchedule.type
    );
    setSpecificDays(activity.repeatSchedule.type === "specific" ? activity.repeatSchedule.days : [1, 2, 3, 4, 5]);
    setIntervalDays(activity.repeatSchedule.type === "interval" ? String(activity.repeatSchedule.every) : "2");
    setGoalAmount(
      activity.goal.type === "multiple"
        ? String(activity.goal.count)
        : activity.goal.type === "weekly" || activity.goal.type === "monthly"
          ? String(activity.goal.target)
          : "1"
    );
    setDialogVisible(true);
  }

  function toggleSpecificDay(day: Weekday) {
    setSpecificDays((current) => {
      const next = current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort();

      return next.length ? next : [day];
    });
  }

  function saveActivity() {
    const cleaned = activityName.trim();

    if (!cleaned) {
      return;
    }

    const duplicate = activities.some(
      (activity) => activity.id !== editingActivityId && activity.name.toLowerCase() === cleaned.toLowerCase()
    );
    if (duplicate) {
      Alert.alert("Already added", `${cleaned} is already in this group.`);
      return;
    }

    // Same shapes the habit form builds (components/HabitForm.tsx save()).
    const amount = Math.max(1, Number(goalAmount) || 1);
    const repeatSchedule: RepeatSchedule =
      cadence === "weekly" || cadence === "monthly"
        ? { type: "daily" }
        : cadence === "specific"
          ? { type: "specific", days: specificDays }
          : cadence === "interval"
            ? { type: "interval", every: Math.max(1, Number(intervalDays) || 1) }
            : { type: cadence };
    const goal: GoalType =
      cadence === "weekly" || cadence === "monthly"
        ? { type: cadence, target: amount }
        : amount > 1
          ? { type: "multiple", count: amount }
          : { type: "once" };
    const activity: GroupHabit = {
      id: editingActivityId ?? `act-${Date.now().toString(36)}`,
      name: cleaned,
      icon: activityIcon,
      color: activityColor,
      repeatSchedule,
      goal
    };

    setActivities((current) =>
      editingActivityId ? current.map((entry) => (entry.id === editingActivityId ? activity : entry)) : [...current, activity]
    );
    setDialogVisible(false);
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
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        centerContent={
          <AppText variant="titleSmall" color={palette.ink} style={styles.headerTitle}>
            {editId ? "Edit Group" : "New Group"}
          </AppText>
        }
      />

      <Card style={styles.formCard}>
        <View style={styles.cardHeader}>
          <AppText variant="titleSmall" color={palette.ink}>
            Group details
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle}>
            Name your group — you'll add the activities you do together next.
          </AppText>
        </View>

        <View style={[styles.sectionDivider, { backgroundColor: palette.hairline }]} />

        <View style={styles.field}>
          {/* Bleeds to the card edges so the row scrolls edge-to-edge. */}
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
        </View>

        <View style={styles.field}>
          <FieldLabel>Group name</FieldLabel>
          <LumoInput
            value={name}
            onChangeText={setName}
            placeholder="Morning Crew"
            autoCapitalize="words"
            returnKeyType="done"
            style={[styles.flatInput, { borderColor: fieldBorderColor }]}
          />
        </View>
      </Card>

      <Card style={styles.formCard}>
        <View style={styles.cardHeader}>
          <AppText variant="titleSmall" color={palette.ink}>
            Activities
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle}>
            What your group does together — like running every weekend. Each activity has its own frequency and target, and lives
            only in this group.
          </AppText>
        </View>

        <View style={[styles.sectionDivider, { backgroundColor: palette.hairline }]} />

        {activities.length ? (
          <View>
            {activities.map((activity, index) => {
              const colorOption = habitColorOption(activity.color);

              return (
                <View
                  key={activity.id}
                  style={[styles.activityRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }]}
                >
                  <View style={[styles.activityIcon, { backgroundColor: colorOption?.color ?? alpha(palette.greenDark, "12") }]}>
                    <HabitIcon value={activity.icon} color={colorOption?.onColor ?? palette.greenDark} size={16} />
                  </View>
                  <View style={styles.activityText}>
                    <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.activityName}>
                      {activity.name}
                    </AppText>
                    <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                      {activityMeta(activity)}
                    </AppText>
                  </View>
                  <View style={styles.activityActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${activity.name}`}
                      onPress={() => openEditActivity(activity)}
                      hitSlop={6}
                      style={[styles.activityAction, { backgroundColor: alpha(palette.greenDark, "12") }]}
                    >
                      <Icon name="edit" size={14} color={palette.greenDark} weight="bulk" />
                    </Pressable>
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
        ) : (
          <AppText variant="caption" color={palette.subtle} style={styles.hint}>
            No activities yet — add what you'll do together, like "Weekend run" or "Read 20 pages".
          </AppText>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add activity"
          onPress={openActivityDialog}
          onPressIn={() => setAddActivityPressed(true)}
          onPressOut={() => setAddActivityPressed(false)}
          style={[styles.addActivityButton, { backgroundColor: alpha(palette.greenDark, isDark ? "26" : "12"), opacity: addActivityPressed ? 0.8 : 1 }]}
        >
          <Icon name="cloudPlus" size={18} color={palette.greenDark} weight="bulk" />
          <AppText variant="button" color={palette.greenDark} style={styles.addActivityLabel}>
            Add Activity
          </AppText>
        </Pressable>
      </Card>

      {editId ? null : (
      <Card style={styles.formCard}>
        <View style={styles.cardHeader}>
          <AppText variant="titleSmall" color={palette.ink}>
            Invite friends
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle}>
            Members check in on the group's activities and everyone's progress adds up.
          </AppText>
        </View>

        <View style={[styles.sectionDivider, { backgroundColor: palette.hairline }]} />

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
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
                  index === friends.length - 1 && styles.friendRowLast
                ]}
              >
                <View style={[styles.friendAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
                  <Avatar config={friendship.profile.avatar ?? defaultAvatar()} size={34} rounded={false} />
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
      </Card>
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
          { backgroundColor: buttonFill, opacity: saving ? 1 : !canCreate ? 0.45 : createPressed ? 0.85 : 1 }
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

      {/* Activity dialog: name + frequency + target, added to the group only. */}
      <Modal visible={dialogVisible} transparent animationType="fade" onRequestClose={() => setDialogVisible(false)}>
        {/* Keyboard avoidance is off while the (top-of-dialog) Activity name
            field is focused so the dialog doesn't jump; lower fields still
            shift up to stay visible. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          enabled={!nameFieldFocused}
          style={styles.dialogOverlay}
        >
          {/* No tap-outside close — dismissing is explicit via the Cancel button. */}
          <View style={[styles.dialogCard, { backgroundColor: palette.card }]}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.dialogTitle}>
              {editingActivityId ? "Edit Activity" : "New Activity"}
            </AppText>

            <View style={styles.field}>
              <FieldLabel>Activity</FieldLabel>
              <LumoInput
                value={activityName}
                onChangeText={setActivityName}
                placeholder="e.g. Weekend run"
                autoCapitalize="sentences"
                autoFocus={!editingActivityId}
                returnKeyType="done"
                onSubmitEditing={saveActivity}
                onFocus={() => setNameFieldFocused(true)}
                onBlur={() => setNameFieldFocused(false)}
                style={[styles.flatInput, { borderColor: fieldBorderColor }]}
              />
            </View>

            <View style={styles.field}>
              <FieldLabel>Icon</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dialogBleed} contentContainerStyle={styles.iconChipRow}>
                {activityIconOptions.map((iconName) => {
                  const isSelected = activityIcon === iconName;

                  return (
                    <Pressable
                      key={iconName}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setActivityIcon(iconName)}
                      style={[styles.iconChip, { backgroundColor: isSelected ? alpha(palette.greenDark, "1F") : "transparent" }]}
                    >
                      <HabitIcon value={iconName} color={palette.greenDark} size={22} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.field}>
              <FieldLabel>Color</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dialogBleed} contentContainerStyle={styles.colorChipRow}>
                {habitColorPickerOptions.map((option) => {
                  const isSelected = activityColor === option.color;

                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setActivityColor(option.color)}
                      style={[styles.colorChipOuter, { borderColor: isSelected ? option.accent : "transparent" }]}
                    >
                      <View style={[styles.colorChip, { backgroundColor: option.color, borderColor: palette.hairline }]}>
                        {isSelected ? <Icon name="checkCircle" size={16} color={option.onColor} weight="bulk" /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.field}>
              <FieldLabel>How often?</FieldLabel>
              <FloatingDropdown
                variant="input"
                options={cadenceOptions}
                value={cadence}
                onChange={setCadence}
                accessibilityLabel="How often"
                borderColor={fieldBorderColor}
              />
              {periodGoal ? (
                <AppText variant="caption" color={palette.subtle}>
                  Hit the target on any days that suit the group.
                </AppText>
              ) : null}
            </View>

            {cadence === "specific" ? (
              <View style={styles.field}>
                <FieldLabel>Days</FieldLabel>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayList}>
                  {dayNames.map((dayName, index) => {
                    const checked = specificDays.includes(index as Weekday);

                    return (
                      <Pressable
                        key={dayName}
                        accessibilityRole="checkbox"
                        accessibilityLabel={dayName}
                        accessibilityState={{ checked }}
                        onPress={() => toggleSpecificDay(index as Weekday)}
                        style={styles.dayItem}
                      >
                        {checked ? (
                          <Icon name="checkCircle" size={20} color={palette.greenDark} weight="bulk" />
                        ) : (
                          <View style={[styles.dayCircle, { borderColor: palette.hairline, backgroundColor: palette.surface }]} />
                        )}
                        <AppText variant="body" color={checked ? palette.ink : palette.subtle} style={styles.dayName}>
                          {dayLabels[index]}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {cadence === "interval" ? (
              <View style={styles.field}>
                <FieldLabel>Every how many days?</FieldLabel>
                <LumoInput
                  value={intervalDays}
                  onChangeText={setIntervalDays}
                  keyboardType="number-pad"
                  style={[styles.flatInput, { borderColor: fieldBorderColor }]}
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <FieldLabel>{cadence === "weekly" ? "Times per week" : cadence === "monthly" ? "Times per month" : "Times per day"}</FieldLabel>
              <LumoInput
                value={goalAmount}
                onChangeText={setGoalAmount}
                keyboardType="number-pad"
                style={[styles.flatInput, { borderColor: fieldBorderColor }]}
              />
            </View>

            <View style={styles.dialogActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => setDialogVisible(false)}
                onPressIn={() => setDialogCancelPressed(true)}
                onPressOut={() => setDialogCancelPressed(false)}
                style={[styles.dialogCancel, { backgroundColor: palette.surface, opacity: dialogCancelPressed ? 0.7 : 1 }]}
              >
                <AppText variant="button" color={palette.ink} style={styles.dialogActionLabel}>
                  Cancel
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={editingActivityId ? "Save this activity" : "Add this activity"}
                disabled={!activityName.trim()}
                onPress={saveActivity}
                onPressIn={() => setDialogAddPressed(true)}
                onPressOut={() => setDialogAddPressed(false)}
                style={[
                  styles.dialogAdd,
                  { backgroundColor: buttonFill, opacity: !activityName.trim() ? 0.45 : dialogAddPressed ? 0.85 : 1 }
                ]}
              >
                <AppText variant="button" color={palette.white} style={styles.dialogActionLabel}>
                  {editingActivityId ? "Save Activity" : "Add Activity"}
                </AppText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.md
  },
  headerTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 22,
    lineHeight: 28,
    transform: [{ translateY: -7 }]
  },
  formCard: {
    gap: spacing.md,
    padding: spacing.xl
  },
  cardHeader: {
    gap: spacing.xxs
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth
  },
  field: {
    gap: spacing.xs
  },
  flatInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderRadius: 0,
    minHeight: 0,
    paddingHorizontal: 0,
    paddingTop: spacing.xxs,
    paddingBottom: spacing.sm,
    fontFamily: fontFamilies.lexendBold
  },
  dayList: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingRight: spacing.lg
  },
  dayItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xxs
  },
  dayCircle: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 1.5
  },
  dayName: {
    fontSize: 16
  },
  avatarScroll: {
    marginHorizontal: -spacing.xl
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xl
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
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  dialogBleed: {
    marginHorizontal: -spacing.xl
  },
  iconChipRow: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.xl
  },
  iconChip: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: radius.xl
  },
  colorChipRow: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xl
  },
  colorChipOuter: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  colorChip: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
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
  friendRowLast: {
    paddingBottom: 0
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
  createButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    marginTop: spacing.sm
  },
  createLabel: {
    fontSize: 16,
    lineHeight: 21
  },
  dialogOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  dialogCard: {
    width: "100%",
    gap: spacing.md,
    borderRadius: radius.nav,
    padding: spacing.xl
  },
  dialogTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 20,
    lineHeight: 26
  },
  dialogActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xxs
  },
  dialogActionLabel: {
    fontSize: 16,
    lineHeight: 21
  },
  dialogCancel: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill
  },
  dialogAdd: {
    flex: 1.4,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill
  }
});
