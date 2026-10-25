import { useRouter } from "expo-router";
import React from "react";
import { Animated, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Icon } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { WalkBackground, useWalkSceneInset } from "@/components/WalkBackground";
import { AppText, Screen } from "@/components/ui";
import { WALK_ACCENT } from "@/constants/tools";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha, readableOn } from "@/lib/color";
import { formatDistance } from "@/lib/move/movement";
import { formatDuration } from "@/lib/move/tracking/pace";
import { totalsSince, type WalkRecord } from "@/lib/walk";
import { loadWalkState } from "@/lib/walkStorage";

/**
 * Every walk and run you have filed, newest first.
 *
 * Reads the store directly rather than taking it through context: walks live
 * under their own AsyncStorage key precisely so a route does not travel with
 * every habit and journal entry, and putting them in context would undo that.
 * The screen is pushed fresh each time, so a load on mount is always current.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Today", "Yesterday", then a plain date. */
function dayLabel(at: number, now: number): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const days = Math.floor((startOfToday.getTime() - new Date(at).setHours(0, 0, 0, 0)) / DAY_MS);

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  return new Date(at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function WalkHistoryScreen() {
  const router = useRouter();
  const { palette, isDark } = useLumo();

  const [history, setHistory] = React.useState<WalkRecord[] | null>(null);
  const [now] = React.useState(() => Date.now());

  React.useEffect(() => {
    let active = true;

    loadWalkState().then((state) => {
      if (active) {
        setHistory(state.history);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const accent = readableOn(WALK_ACCENT, palette.white, 4.5);
  const sceneInset = useWalkSceneInset("walking");
  /**
   * Drives the backdrop's fade. A plain `Animated.Value` written from a scroll
   * listener rather than `useNativeDriver` — opacity on an image behind a
   * ScrollView is the same thing `HomeBackground` animates this way.
   */
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => scrollY.setValue(event.nativeEvent.contentOffset.y),
    [scrollY]
  );
  const week = React.useMemo(() => totalsSince(history ?? [], now - 7 * DAY_MS), [history, now]);

  return (
    <Screen contentStyle={styles.content} backgroundVariant={null} backgroundNode={<WalkBackground plate="walking" scrollY={scrollY} />} onScroll={handleScroll}>
      <ScreenHeader
        title="Your history"
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
      />

      {history === null ? null : history.length === 0 ? (
        <View style={[styles.empty, { marginTop: sceneInset }]}>
          <Icon name="walk" size={30} color={palette.muted} weight="bulk" />
          <AppText variant="bodySmall" color={palette.subtle} style={styles.emptyText}>
            Nothing here yet. The first walk or run you finish lands here.
          </AppText>
        </View>
      ) : (
        <>
          {week.walks > 0 ? (
            <View style={[styles.weekCard, { marginTop: sceneInset, backgroundColor: alpha(WALK_ACCENT, isDark ? "24" : "14") }]}>
              <AppText variant="caption" color={palette.subtle}>
                LAST 7 DAYS
              </AppText>
              <AppText variant="bodySmall" color={palette.ink}>
                {week.walks} {week.walks === 1 ? "outing" : "outings"} · {formatDuration(week.activeMs)} · {formatDistance(week.distanceM)}
              </AppText>
            </View>
          ) : null}

          <View style={[styles.list, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
            {history.map((record, index) => (
              <Pressable
                key={record.id}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(record.startedAt, now)}, ${formatDistance(record.distanceM)}`}
                onPress={() => router.push({ pathname: "/walk/[id]", params: { id: record.id } })}
                style={({ pressed }) => [
                  styles.row,
                  // Separated by a rule rather than by gaps, and the last one
                  // does without so the card does not end on a line.
                  index === history.length - 1 ? null : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline },
                  { opacity: pressed ? 0.6 : 1 }
                ]}
              >
                <View style={styles.rowText}>
                  <AppText variant="bodySmall" color={palette.ink} numberOfLines={1}>
                    {dayLabel(record.startedAt, now)} · {timeLabel(record.startedAt)}
                  </AppText>
                  <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                    {formatDuration(record.activeMs)}
                    {record.vehicleM > 0 ? ` · ${formatDistance(record.vehicleM)} not on foot` : ""}
                  </AppText>
                </View>

                <AppText color={accent} style={styles.rowValue}>
                  {formatDistance(record.distanceM)}
                </AppText>
                <Icon name="chevronDown" size={16} color={palette.muted} weight="bold" style={styles.chevron} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl
  },
  empty: {
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xxl
  },
  emptyText: {
    textAlign: "center"
  },
  weekCard: {
    gap: spacing.xxs,
    padding: spacing.md,
    borderRadius: radius.card
  },
  list: {
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  rowText: {
    flex: 1,
    gap: 2
  },
  rowValue: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15
  },
  // Rotated a quarter turn so the row's caret points the way it navigates.
  chevron: {
    transform: [{ rotate: "-90deg" }]
  }
});
