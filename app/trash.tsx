import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { HabitIcon } from "@/components/HabitIcon";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Card, LoadingState, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";

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
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        centerContent={
          <AppText variant="titleSmall" color={palette.ink} style={styles.headerTitle}>
            Trash
          </AppText>
        }
        rightAction={{ icon: "trash", label: "Delete all", onPress: confirmEmptyTrash, iconSize: 21 }}
      />

      <AppText variant="bodySmall" color={palette.subtle} style={styles.intro}>
        Deleted habits stay here so you can restore them. Permanently deleting removes a habit and its history for good.
      </AppText>

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
                  <Icon name="refresh" size={23} color={palette.greenDark} weight="bulk" />
                </Pressable>
                <Pressable
                  accessibilityLabel="Delete"
                  hitSlop={6}
                  style={styles.action}
                  onPress={() => confirmPermanentDelete(habit.id, habit.name)}
                >
                  <Icon name="trash" size={20} color={palette.danger} weight="bulk" />
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: layout.tabScreenBottomPadding,
    gap: spacing.md
  },
  headerTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 19,
    lineHeight: 24,
    transform: [{ translateY: -8 }]
  },
  intro: {
    fontSize: 15,
    lineHeight: 21
  },
  list: {
    gap: spacing.sm
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
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
