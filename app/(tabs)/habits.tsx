import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { HabitCard } from "@/components/HabitCard";
import { Icon } from "@/components/Icon";
import { AppText, Button, LoadingState, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";

export default function HabitsScreen() {
  const router = useRouter();
  const { habits, isReady, palette } = useLumo();
  const [showArchived, setShowArchived] = React.useState(false);
  const visibleHabits = habits.filter((habit) => habit.status !== "archived");
  const archivedHabits = habits.filter((habit) => habit.status === "archived");
  const groupedHabits = React.useMemo(() => {
    const groups = new Map<string, typeof visibleHabits>();

    visibleHabits.forEach((habit) => {
      const category = habit.category ?? "General";
      groups.set(category, [...(groups.get(category) ?? []), habit]);
    });

    return Array.from(groups, ([category, items]) => ({ category, items }));
  }, [visibleHabits]);

  if (!isReady) {
    return <LoadingState />;
  }

  return (
    <Screen contentStyle={{ paddingBottom: layout.tabScreenBottomPadding }}>
      <View style={styles.screenHeader} className="flex-row items-center justify-between gap-4">
        <View className="flex-1 gap-1">
          <AppText variant="displaySmall" color={palette.ink} style={{ fontFamily: fontFamilies.lexendBold, fontSize: 34, lineHeight: 40 }}>
            Habits
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle}>
            Keep every routine easy to find.
          </AppText>
        </View>
        <Button
          label="New"
          icon="elementPlus"
          iconWeight="bulk"
          variant="primary"
          shape="pill"
          onPress={() => router.push("/habit/new")}
          className="min-h-[40px] min-w-[92px] flex-row items-center justify-center gap-1.5 rounded-[22px] px-3 py-1"
        />
      </View>

      <View style={styles.categoryList}>
        {visibleHabits.length ? (
          groupedHabits.map(({ category, items }) => (
            <View key={category} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <AppText variant="titleSmall" color={palette.ink} style={styles.categoryTitle}>
                  {category}
                </AppText>
                <AppText variant="bodySmall" color={palette.muted} style={styles.categoryCount}>
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
                Archived
              </AppText>
              <View style={styles.archiveHeaderActions}>
                <AppText variant="bodySmall" color={palette.muted} style={styles.categoryCount}>
                  {archivedHabits.length} {archivedHabits.length === 1 ? "Habit" : "Habits"}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showArchived ? "Hide archived habits" : "Show archived habits"}
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
    fontFamily: fontFamilies.lexendSemiBold
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
