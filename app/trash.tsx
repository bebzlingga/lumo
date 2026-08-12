import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { HabitIcon } from "@/components/HabitIcon";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Card, LoadingState, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing, tileRadius } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";

function formatDeletedAt(iso?: string) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TrashScreen() {
  const router = useRouter();
  const { deletedHabits, isReady, palette, restoreHabit, permanentlyDeleteHabit, emptyTrash } = useLumo();

  if (!isReady) {
    return <LoadingState />;
  }

  function confirmRestore(id: string, name: string) {
    Alert.alert("Restore habit?", `"${name}" will be moved back to your habits.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Restore", onPress: () => restoreHabit(id) }
    ]);
  }

  function confirmPermanentDelete(id: string, name: string) {
    Alert.alert("Delete permanently?", `"${name}" and its history will be removed for good. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => permanentlyDeleteHabit(id) }
    ]);
  }

  function confirmEmptyTrash() {
    Alert.alert("Delete all?", "Every habit in the trash and its history will be removed for good. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete all", style: "destructive", onPress: () => emptyTrash() }
    ]);
  }

  return (
    <Screen contentStyle={styles.content}>
      {/* Nothing to empty when the trash is empty, so the action goes with it. */}
      <ScreenHeader
        title="Trash"
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        rightAction={deletedHabits.length ? { icon: "trash", label: "Delete all", onPress: confirmEmptyTrash } : undefined}
      />

      {deletedHabits.length ? (
        <View style={styles.list}>
          {deletedHabits.map((habit) => (
            <Card key={habit.id} style={styles.row}>
              <View style={[styles.icon, { backgroundColor: palette.greenSoft }]}>
                <HabitIcon value={habit.emoji} color={palette.greenDark} size={20} />
              </View>
              <View style={styles.nameBlock}>
                <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.name}>
                  {habit.name}
                </AppText>
                {habit.deletedAt ? (
                  <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.deletedAt}>
                    Deleted {formatDeletedAt(habit.deletedAt)}
                  </AppText>
                ) : null}
              </View>
              <View style={styles.actions}>
                <Pressable
                  accessibilityLabel="Restore"
                  hitSlop={6}
                  style={styles.action}
                  onPress={() => confirmRestore(habit.id, habit.name)}
                >
                  <Icon name="refresh" size={19} color={palette.greenDark} weight="bulk" />
                </Pressable>
                <Pressable
                  accessibilityLabel="Delete"
                  hitSlop={6}
                  style={styles.action}
                  onPress={() => confirmPermanentDelete(habit.id, habit.name)}
                >
                  <Icon name="trash" size={17} color={palette.danger} weight="bulk" />
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      ) : (
        // Carries the explanation the intro line used to, but only when it is
        // actually useful — once there is a list, the rows speak for themselves.
        <View style={styles.empty}>
          {/* Neutral rather than the brand green — an empty trash is a state of
              affairs, not something to draw the eye to. */}
          <View style={[styles.emptyIcon, { backgroundColor: alpha(palette.muted, "1F") }]}>
            <Icon name="trash" size={28} color={palette.muted} weight="bulk" />
          </View>
          <AppText variant="titleSmall" color={palette.ink} style={styles.emptyTitle}>
            Nothing in the trash
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle} style={styles.emptyBody}>
            Habits you delete land here first, so you can bring one back if you change your mind.
          </AppText>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    // Not a tab screen — it is pushed from Settings, so the floating tab bar
    // never covers it and the 144pt of clearance it reserved was dead space.
    paddingBottom: spacing.xxl,
    // Lets the empty state flex into the height left under the header.
    flexGrow: 1,
    gap: spacing.md
  },
  // Fills the space left under the header so the block sits in the middle of
  // the screen rather than hanging off the top of it. Needs `flexGrow` on the
  // content container above to have any space to fill.
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    // Sits the block above the true centre — a lone message reads better high
    // in the space than marooned in the middle of it.
    paddingBottom: 160
  },
  emptyIcon: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tileRadius(60),
    marginBottom: spacing.xs
  },
  emptyTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 17,
    lineHeight: 23
  },
  emptyBody: {
    fontFamily: fontFamilies.lexend,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 280
  },
  list: {
    gap: spacing.sm
  },
  // Card defaults to spacing.lg; a list row uses the spacing.md inset every
  // other list card in the app carries.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card
  },
  // Rounded square, matching the icon tile every other list row in the app uses.
  icon: {
    width: 40,
    height: 40,
    borderRadius: tileRadius(40),
    alignItems: "center",
    justifyContent: "center"
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  name: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  deletedAt: {
    fontFamily: fontFamilies.lexend,
    fontSize: 12,
    lineHeight: 16
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  action: {
    width: 30,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  }
});
