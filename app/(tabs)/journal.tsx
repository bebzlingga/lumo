import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Icon } from "@/components/Icon";
import { AppText, Card, LoadingState, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { addDays, formatHeaderDateParts, formatMonthYear, toDateKey } from "@/lib/date";
import { markdownToPlainText } from "@/lib/markdown";
import { moodColor, moodIcon } from "@/lib/mood";
import { JournalEntry } from "@/types/habit";

const PAGE_SIZE = 15;
// How far back the list of previous days can scroll (about a year).
const MAX_PREVIOUS_DAYS = 365;

type ListItem =
  | { type: "month"; key: string; label: string }
  | { type: "day"; key: string; dateKey: string; entry?: JournalEntry };

export default function JournalScreen() {
  const router = useRouter();
  const { journals, isReady, palette, canCreateJournal } = useLumo();
  const todayKey = toDateKey();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const todayEntry = journals.find((entry) => entry.date === todayKey);
  const entriesByDate = useMemo(() => new Map(journals.map((entry) => [entry.date, entry])), [journals]);

  // Show every previous calendar day as a card (with or without an entry),
  // newest first, capped at MAX_PREVIOUS_DAYS.
  const dayCount = Math.min(visibleCount, MAX_PREVIOUS_DAYS);
  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    let currentMonth = "";

    for (let offset = 1; offset <= dayCount; offset += 1) {
      const dateKey = addDays(todayKey, -offset);
      const label = formatMonthYear(dateKey);

      if (label !== currentMonth) {
        currentMonth = label;
        items.push({ type: "month", key: `month-${label}`, label });
      }

      items.push({ type: "day", key: dateKey, dateKey, entry: entriesByDate.get(dateKey) });
    }

    return items;
  }, [dayCount, entriesByDate, todayKey]);

  if (!isReady) {
    return <LoadingState />;
  }

  function openEntry(dateKey: string) {
    // Opening an existing entry is always allowed; creating a new one is gated
    // by the free journal limit.
    const isNewEntry = !entriesByDate.has(dateKey);
    if (isNewEntry && !canCreateJournal) {
      router.push("/paywall");
      return;
    }
    router.push(`/journal/${dateKey}`);
  }

  function loadMore() {
    setVisibleCount((current) => (current < MAX_PREVIOUS_DAYS ? current + PAGE_SIZE : current));
  }

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <FlatList
        data={listItems}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <AppText variant="displaySmall" color={palette.ink} style={styles.title}>
                Journal
              </AppText>
              <AppText variant="bodySmall" color={palette.subtle}>
                One entry a day. Capture how it went.
              </AppText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={todayEntry ? "Edit today's journal" : "Add your journal for today"}
              onPress={() => openEntry(todayKey)}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <Card tone="dark" style={[styles.todayCard, { backgroundColor: palette.greenDark }]}>
                <View style={[styles.todayIcon, { backgroundColor: "rgba(255,255,255,0.16)" }]}>
                  <Icon name={todayEntry ? "edit" : "messageEdit"} size={22} color={palette.white} weight="bulk" />
                </View>
                <View style={styles.todayCopy}>
                  <AppText variant="titleSmall" color={palette.white} style={styles.todayTitle}>
                    {todayEntry ? "Today's journal" : "Add your journal"}
                  </AppText>
                  <AppText variant="bodySmall" color="rgba(255,255,255,0.82)" numberOfLines={1}>
                    {todayEntry ? markdownToPlainText(todayEntry.content) || "Tap to continue writing." : "Tap to write about today."}
                  </AppText>
                </View>
                <Icon name="chevronDown" size={20} color="rgba(255,255,255,0.7)" weight="bulk" style={styles.todayChevron} />
              </Card>
            </Pressable>

          </View>
        }
        renderItem={({ item }) => {
          if (item.type === "month") {
            return (
              <AppText variant="titleSmall" color={palette.ink} style={styles.monthLabel}>
                {item.label}
              </AppText>
            );
          }

          const parts = formatHeaderDateParts(item.dateKey);
          const entryTitle = item.entry?.title?.trim();
          const preview = item.entry ? markdownToPlainText(item.entry.content) : "";
          const hasPhoto = Boolean(item.entry?.photoUri);

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open journal for ${parts.weekday}, ${parts.date}`}
              onPress={() => openEntry(item.dateKey)}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <Card style={styles.entryCard}>
                <View style={styles.entryHead}>
                  <View style={styles.entryHeadLeft}>
                    {item.entry?.mood ? (
                      <Icon name={moodIcon(item.entry.mood)} size={20} color={moodColor(palette, item.entry.mood)} weight="bulk" />
                    ) : null}
                    <AppText
                      variant="titleSmall"
                      color={palette.ink}
                      numberOfLines={1}
                      style={entryTitle ? styles.entryTitle : styles.entryWeekday}
                    >
                      {entryTitle ? entryTitle : parts.weekday}
                    </AppText>
                  </View>
                  {entryTitle ? (
                    <View style={styles.entryDateBlock}>
                      <AppText variant="caption" color={palette.subtle} style={styles.entryDate}>
                        {parts.weekday}
                      </AppText>
                      <AppText variant="caption" color={palette.subtle} style={styles.entryDate}>
                        {parts.date}
                      </AppText>
                    </View>
                  ) : (
                    <AppText variant="caption" color={palette.subtle} style={styles.entryDate}>
                      {parts.date}
                    </AppText>
                  )}
                </View>
                {preview ? (
                  <AppText variant="bodySmall" color={palette.subtle} numberOfLines={entryTitle ? 1 : 2} style={styles.entryPreview}>
                    {preview}
                  </AppText>
                ) : !entryTitle ? (
                  <AppText variant="bodySmall" color={palette.muted} numberOfLines={1} style={styles.entryPreview}>
                    {hasPhoto ? "Photo attached" : "Tap to add a note"}
                  </AppText>
                ) : null}
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 0
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: layout.tabScreenBottomPadding,
    gap: spacing.sm
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.xs
  },
  titleBlock: {
    gap: spacing.xxs
  },
  title: {
    fontFamily: "Lexend-Black",
    fontSize: 34,
    lineHeight: 40
  },
  todayCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  todayIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  todayCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  todayTitle: {
    fontFamily: fontFamilies.lexendBold
  },
  todayChevron: {
    transform: [{ rotate: "-90deg" }]
  },
  monthLabel: {
    fontFamily: fontFamilies.lexendBold,
    marginTop: spacing.sm,
    marginBottom: spacing.xxs
  },
  entryCard: {
    gap: spacing.xs
  },
  entryHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  entryHeadLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  entryWeekday: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  entryTitle: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendBold
  },
  entryDateBlock: {
    flexShrink: 0,
    alignItems: "flex-end"
  },
  entryDate: {
    flexShrink: 0,
    opacity: 0.5,
    textAlign: "right"
  },
  entryPreview: {
    lineHeight: 20
  }
});
