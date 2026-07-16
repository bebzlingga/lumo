import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { HabitCard } from "@/components/HabitCard";
import { Icon } from "@/components/Icon";
import { AppText, LoadingState, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { habitCategories } from "@/types/habit";

export default function HabitsScreen() {
  const router = useRouter();
  const { habits, isReady, palette } = useLumo();
  const [addPressed, setAddPressed] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);
  const visibleHabits = habits.filter((habit) => habit.status !== "archived");
  const archivedHabits = habits.filter((habit) => habit.status === "archived");
  const groupedHabits = React.useMemo(() => {
    const groups = new Map<string, typeof visibleHabits>();

    visibleHabits.forEach((habit) => {
      const category = habit.category ?? "General";
      groups.set(category, [...(groups.get(category) ?? []), habit]);
    });

    const categoryOrder = (category: string) => {
      const index = habitCategories.indexOf(category as (typeof habitCategories)[number]);
      return index === -1 ? habitCategories.length : index;
    };

    return Array.from(groups, ([category, items]) => ({ category, items })).sort(
      (a, b) => categoryOrder(a.category) - categoryOrder(b.category)
    );
  }, [visibleHabits]);

  if (!isReady) {
    return <LoadingState />;
  }

  return (
    <Screen contentStyle={{ paddingBottom: layout.tabScreenBottomPadding }}>
      <View style={styles.screenHeader} className="flex-row items-center justify-between gap-4">
        <View className="flex-1 gap-1">
          <AppText variant="displaySmall" color={palette.ink} style={{ fontFamily: "Lexend-Black", fontSize: 34, lineHeight: 40 }}>
            Habits
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle}>
            Keep every routine easy to find.
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New habit"
          onPress={() => router.push("/habit/new")}
          onPressIn={() => setAddPressed(true)}
          onPressOut={() => setAddPressed(false)}
          style={[styles.addButton, { backgroundColor: palette.greenSoft, opacity: addPressed ? 0.75 : 1 }]}
        >
          <Icon name="elementPlus" size={20} color={palette.greenDark} weight="bulk" />
        </Pressable>
      </View>

      <View style={styles.categoryList}>
        {visibleHabits.length ? (
          groupedHabits.map(({ category, items }) => (
            <View key={category} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <AppText variant="titleSmall" color={palette.ink} style={styles.categoryTitle}>
                  {category}
                </AppText>
                <AppText variant="bodySmall" color={palette.subtle} style={styles.categoryCount}>
                  {items.length} {items.length === 1 ? "Habit" : "Habits"}
                </AppText>
              </View>
              <View style={styles.habitStack}>
                {items.map((habit) => (
                  <HabitCard key={habit.id} habit={habit} compact />
                ))}
              </View>
            </View>
          ))
        ) : null}

        {archivedHabits.length ? (
          <View style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <AppText variant="titleSmall" color={palette.ink} style={styles.categoryTitle}>
                Completed
              </AppText>
              <View style={styles.archiveHeaderActions}>
                <AppText variant="bodySmall" color={palette.subtle} style={styles.categoryCount}>
                  {archivedHabits.length} {archivedHabits.length === 1 ? "Habit" : "Habits"}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showArchived ? "Hide completed habits" : "Show completed habits"}
                  accessibilityState={{ expanded: showArchived }}
                  onPress={() => setShowArchived((current) => !current)}
                  style={({ pressed }) => [
                    styles.archiveToggle,
                    {
                      backgroundColor: showArchived ? palette.greenDark : palette.greenSoft,
                      opacity: pressed ? 0.74 : 1
                    }
                  ]}
                >
                  <Icon name={showArchived ? "eye" : "eyeSlash"} size={18} color={palette.greenDark} weight="bulk" />
                </Pressable>
              </View>
            </View>
            {showArchived ? (
              <View style={styles.habitStack}>
                {archivedHabits.map((habit) => (
                  <HabitCard key={habit.id} habit={habit} compact disabledActions />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  categoryList: {
    gap: spacing.md
  },
  screenHeader: {
    marginBottom: spacing.sm
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  categorySection: {
    gap: spacing.sm
  },
  categoryHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  categoryTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  categoryCount: {
    fontFamily: fontFamilies.lexendSemiBold,
    opacity: 0.5
  },
  archiveHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  archiveToggle: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  habitStack: {
    gap: spacing.xs
  }
});
