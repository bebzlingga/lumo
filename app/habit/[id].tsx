import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, View } from "react-native";
import { ActionTile } from "@/components/ActionTile";
import { DottedProgressChart } from "@/components/DottedProgressChart";
import { HabitIcon } from "@/components/HabitIcon";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Button, Card, LoadingState, Screen, StatTile } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { dateRange, formatHistoryDateParts, monthRange, toDateKey } from "@/lib/date";
import { completionCount, habitSummary, isDoneOnDate, isScheduledOnDate } from "@/lib/habitMath";

const fireGif = require("../../assets/gif/icons8-fire.gif");

type HistoryRange = "7d" | "14d" | "1m";

const historyRangeOptions: { label: string; value: HistoryRange }[] = [
  { label: "7d", value: "7d" },
  { label: "14d", value: "14d" },
  { label: "1m", value: "1m" }
];

const streakMotivationByDay: Partial<Record<number, string>> = {
  3: "Three days in. You are turning a small choice into a real rhythm.",
  10: "Ten days strong. Momentum is building, and you are showing up for it.",
  15: "Fifteen days. This habit is becoming part of how you take care of yourself.",
  30: "Thirty days. You turned intention into a routine you can trust.",
  60: "Sixty days. This is commitment in motion. Keep the light going."
};

function streakMotivation(streak: number) {
  return streakMotivationByDay[streak] ?? "Every completed day keeps your momentum alive. Show up once and keep your streak glowing.";
}

function targetLabelForHabit(habit: NonNullable<ReturnType<typeof useLumo>["habits"][number]>) {
  switch (habit.goal.type) {
    case "multiple":
      return `${habit.goal.count} per day`;
    case "weekly":
      return `${habit.goal.target} per week`;
    case "monthly":
      return `${habit.goal.target} per month`;
    default:
      return null;
  }
}

export default function HabitDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { habits, isReady, isDark, palette, pauseHabit, resumeHabit, archiveHabit, recoverHabit, deleteHabit } = useLumo();
  const habit = habits.find((item) => item.id === id);
  const [isStreakModalVisible, setIsStreakModalVisible] = React.useState(false);
  const [historyRange, setHistoryRange] = React.useState<HistoryRange>("7d");

  if (!isReady) {
    return <LoadingState />;
  }

  if (!habit) {
    return (
      <Screen>
        <AppText variant="title">Habit not found</AppText>
        <Button label="Back to today" icon="back" onPress={() => router.replace("/(tabs)/today")} />
      </Screen>
    );
  }

  const currentHabit = habit;
  const displayHabit = { ...currentHabit, status: "active" as const };
  const todayKey = toDateKey();
  const summary = habitSummary(displayHabit);
  const modalButtonTextColor = isDark ? palette.onAccent : palette.white;
  const heroTextColor = isDark ? palette.ink : palette.white;
  const heroMutedColor = isDark ? palette.muted : palette.greenSoft;
  const heroBackgroundColor = isDark ? palette.surfaceStrong : palette.greenDark;
  const reminderLabel = !currentHabit.reminderEnabled
    ? "No reminder"
    : currentHabit.reminderMode === "interval"
      ? `Every ${currentHabit.reminderIntervalValue} ${currentHabit.reminderIntervalUnit === "hours" ? "hr" : "min"}`
      : currentHabit.reminderTime;
  const targetLabel = targetLabelForHabit(currentHabit);
  const history = (historyRange === "1m" ? monthRange(todayKey) : dateRange(historyRange === "14d" ? 14 : 7, todayKey))
    .reverse()
    .filter((dateKey) => dateKey >= currentHabit.createdAt);

  function confirmDelete() {
    Alert.alert("Delete habit?", "This removes the habit and its local history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteHabit(currentHabit.id);
          router.replace("/(tabs)/today");
        }
      }
    ]);
  }

  function confirmArchive() {
    Alert.alert("Archive habit?", "This hides the habit from your active list. You can recover it later.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: async () => {
          await archiveHabit(currentHabit.id);
          router.replace("/(tabs)/habits");
        }
      }
    ]);
  }

  function confirmRecover() {
    Alert.alert("Recover habit?", "This moves the habit back to your active habits list.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Recover",
        onPress: async () => {
          await recoverHabit(currentHabit.id);
          router.replace("/(tabs)/habits");
        }
      }
    ]);
  }

  const headerRightActions: NonNullable<React.ComponentProps<typeof ScreenHeader>["rightActions"]> = [
    {
      icon: "edit",
      label: "Edit habit",
      onPress: () => router.push(`/habit/edit/${currentHabit.id}`)
    }
  ];

  if (currentHabit.status !== "archived") {
    headerRightActions.push({
      icon: currentHabit.status === "paused" ? "play" : "pause",
      label: currentHabit.status === "paused" ? "Resume habit" : "Pause habit",
      onPress: () => (currentHabit.status === "paused" ? resumeHabit(currentHabit.id) : pauseHabit(currentHabit.id))
    });
  }

  return (
    <Screen contentStyle={styles.screenContent}>
      <ScreenHeader
        centerContent={
          currentHabit.status === "archived" ? (
            <AppText variant="titleSmall" color={palette.greenDark} numberOfLines={1} style={styles.headerStatus}>
              Archived
            </AppText>
          ) : currentHabit.status === "paused" ? (
            <AppText variant="titleSmall" color={palette.greenDark} numberOfLines={1} style={styles.headerStatus}>
              Habit On Pause
            </AppText>
          ) : summary.currentStreak > 0 ? (
            <View style={styles.headerStreak}>
              <Image source={fireGif} style={styles.headerFireIcon} />
              <AppText variant="titleSmall" color={palette.greenDark} numberOfLines={1}>
                {summary.currentStreak} day streak
              </AppText>
            </View>
          ) : null
        }
        centerLabel={currentHabit.status === "archived" ? "Archived habit" : currentHabit.status === "paused" ? "Habit paused" : "Show streak details"}
        onCenterPress={currentHabit.status === "active" && summary.currentStreak > 0 ? () => setIsStreakModalVisible(true) : undefined}
        leftAction={{
          icon: "back",
          label: "Back",
          onPress: () => router.back()
        }}
        rightActions={headerRightActions}
      />

      <Card style={[styles.heroCard, { backgroundColor: heroBackgroundColor }]}>
        <View style={styles.heroHeader}>
          <View style={[styles.heroIcon, { backgroundColor: isDark ? palette.greenSoft : palette.green }]}>
            <HabitIcon value={currentHabit.emoji} color={palette.white} size={24} />
          </View>
          <View style={styles.heroCopy}>
            <AppText variant="title" color={heroTextColor} numberOfLines={1}>
              {currentHabit.name}
            </AppText>
            <View style={styles.heroMetaRow}>
              <Icon name="clock" size={14} color={heroMutedColor} weight="bulk" />
              <AppText variant="bodySmall" color={heroMutedColor}>
                {reminderLabel}
              </AppText>
              {targetLabel ? (
                <>
                  <View style={[styles.heroMetaDot, { backgroundColor: heroMutedColor }]} />
                  <AppText variant="bodySmall" color={heroMutedColor}>
                    {targetLabel}
                  </AppText>
                </>
              ) : null}
            </View>
          </View>
        </View>
        <View style={styles.heroChart}>
          <DottedProgressChart habit={displayHabit} days={140} dotSize={11} tone="hero" />
        </View>
      </Card>

      <View style={styles.statsRow}>
        <StatTile label="Current streak" value={`${summary.currentStreak}`} icon="fire" />
        <StatTile label="Best streak" value={`${summary.bestStreak}`} icon="trophy" />
        <StatTile label="Completion rate" value={`${summary.completionRate}%`} icon="chart" />
        <StatTile label="Total completions" value={`${summary.totalCompletions}`} icon="checkCircle" />
      </View>

      <Card style={styles.historyCard}>
        <View style={styles.historyHeader}>
          <AppText variant="titleSmall">Recent history</AppText>
          <View style={styles.historyTabs}>
            {historyRangeOptions.map((option) => {
              const selected = historyRange === option.value;

              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setHistoryRange(option.value)}
                  style={({ pressed }) => [
                    {
                      opacity: pressed ? 0.76 : 1
                    }
                  ]}
                >
                  <View
                    style={[
                      styles.historyTab,
                      {
                        backgroundColor: selected ? palette.greenDark : `${palette.greenSoft}2E`,
                        borderColor: selected ? palette.greenDark : `${palette.greenSoft}4D`
                      }
                    ]}
                  >
                    <AppText variant="caption" color={selected ? palette.white : palette.muted} style={styles.historyTabText}>
                      {option.label}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
        {history.map((dateKey, index) => {
          const scheduled = isScheduledOnDate({ ...currentHabit, status: "active" }, dateKey);
          const done = isDoneOnDate(currentHabit, dateKey);
          const count = completionCount(currentHabit, dateKey);
          const partial = currentHabit.goal.type === "multiple" && count > 0 && count < currentHabit.goal.count;
          const historyDate = formatHistoryDateParts(dateKey);
          const isLast = index === history.length - 1;
          const historyDotColor = !scheduled
            ? alpha(palette.greenSoft, "3D")
            : done
              ? palette.greenDark
              : partial
                ? alpha(palette.greenDark, "66")
                : alpha(palette.greenSoft, "3D");
          const historyTextColor = palette.ink;

          return (
            <View key={dateKey} style={[styles.historyRow, !isLast ? styles.historyRowBorder : null, !isLast ? { borderBottomColor: palette.hairline } : null]}>
              <View style={styles.historyLeft}>
                <View
                  style={[
                    styles.historyDot,
                    {
                      backgroundColor: historyDotColor,
                      borderColor: !scheduled || (!done && !partial) ? palette.hairline : historyDotColor
                    }
                  ]}
                />
                <AppText variant="bodySmall" color={historyTextColor} numberOfLines={1} style={styles.historyWeekday}>
                  {historyDate.weekday}
                </AppText>
              </View>
              <AppText variant="bodySmall" color={palette.subtle} numberOfLines={1} style={styles.historyDate}>
                {historyDate.date}
              </AppText>
            </View>
          );
        })}
      </Card>

      <View style={styles.actionGrid}>
        {currentHabit.status === "archived" ? (
          <ActionTile icon="refresh" label="Recover" onPress={confirmRecover} style={styles.actionButton} />
        ) : (
          <ActionTile icon="archive" label="Archive" onPress={confirmArchive} style={styles.actionButton} />
        )}
        <ActionTile
          icon="trash"
          label="Delete"
          color={palette.danger}
          backgroundColor={`${palette.danger}1A`}
          onPress={confirmDelete}
          style={[styles.actionButton, { shadowColor: isDark ? "transparent" : palette.danger, shadowOpacity: isDark ? 0 : 0.12 }]}
        />
      </View>

      <Modal
        transparent
        visible={isStreakModalVisible}
        animationType="fade"
        onRequestClose={() => setIsStreakModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIsStreakModalVisible(false)} />
          <View style={[styles.streakModal, { backgroundColor: palette.card, shadowColor: palette.shadow }]}>
            <View style={styles.flameArt}>
              <View style={[styles.flameGlow, { backgroundColor: palette.surface }]} />
              <View style={[styles.streakIconFrame, { backgroundColor: palette.surfaceStrong }]}>
                <Image source={fireGif} style={styles.modalFireIcon} />
              </View>
              <AppText color={palette.ink} style={styles.flameCount}>
                {summary.currentStreak}
              </AppText>
            </View>

            <View style={styles.modalCopy}>
              <AppText color={palette.ink} style={styles.modalTitle}>
                {summary.currentStreak}-day streak!
              </AppText>
              <AppText color={palette.body} style={styles.modalBody}>
                {streakMotivation(summary.currentStreak)}
              </AppText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue"
              onPress={() => setIsStreakModalVisible(false)}
              style={({ pressed }) => [
                styles.modalButton,
                { backgroundColor: palette.greenDark, shadowColor: palette.shadow, opacity: pressed ? 0.78 : 1 }
              ]}
            >
              <AppText color={modalButtonTextColor} style={styles.modalButtonText}>
                CONTINUE
              </AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: spacing.xl
  },
  headerStreak: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingBottom: 10
  },
  headerStatus: {
    paddingBottom: 10,
    textAlign: "center"
  },
  headerFireIcon: {
    width: 22,
    height: 22
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 20, 19, 0.55)",
    padding: spacing.lg
  },
  streakModal: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.nav,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: "center",
    gap: spacing.md,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 12
  },
  flameArt: {
    width: 124,
    height: 124,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs
  },
  flameGlow: {
    position: "absolute",
    width: 116,
    height: 116,
    borderRadius: radius.pill
  },
  streakIconFrame: {
    width: 80,
    height: 80,
    borderRadius: radius.nav,
    alignItems: "center",
    justifyContent: "center"
  },
  modalFireIcon: {
    width: 62,
    height: 62
  },
  flameCount: {
    position: "absolute",
    right: 20,
    bottom: 22,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "800",
    textAlign: "center"
  },
  modalCopy: {
    alignItems: "center",
    gap: spacing.sm
  },
  modalTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 18,
    lineHeight: 24,
    textAlign: "center"
  },
  modalBody: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center"
  },
  modalButton: {
    minHeight: 44,
    alignSelf: "stretch",
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.045,
    shadowRadius: 18,
    elevation: 2
  },
  modalButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    textAlign: "center"
  },
  heroCard: {
    gap: spacing.md,
    overflow: "hidden"
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xxs
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  heroMetaDot: {
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    opacity: 0.72
  },
  heroChart: {
    alignSelf: "stretch"
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  chartCard: {
    gap: spacing.md,
    overflow: "hidden"
  },
  historyCard: {
    paddingVertical: spacing.md
  },
  historyHeader: {
    minHeight: 36,
    marginBottom: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  historyTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  historyTab: {
    minWidth: 36,
    minHeight: 24,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: 2
  },
  historyTabText: {
    textAlign: "center"
  },
  historyRow: {
    minHeight: 38,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  historyRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  historyLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  historyDot: {
    width: 12,
    height: 12,
    borderRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth
  },
  historyWeekday: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold
  },
  historyDate: {
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "right"
  },
  actionGrid: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  actionButton: {
    flex: 1,
    minWidth: 0
  }
});
