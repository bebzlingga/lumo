import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Alert, Animated, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { WalkBackground } from "@/components/WalkBackground";
import { WalkMap } from "@/components/WalkMap";
import { AppText, Screen } from "@/components/ui";
import { WALK_ACCENT } from "@/constants/tools";
import { fontFamilies, habitAccent, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha, readableOn } from "@/lib/color";
import {
  calculatePace,
  formatDistance,
  formatDuration,
  formatPace,
  formatSteps,
  type WalkMood,
  type WalkRecord
} from "@/lib/walk";
import { deleteWalk, loadWalkState } from "@/lib/walkStorage";
import { forgetWalk } from "@/lib/walkSyncRunner";

/**
 * One walk or run, in full.
 *
 * The route drawn here is the SIMPLIFIED one stored on the record, not the raw
 * trace — a half-hour walk is a few hundred fixes, and the difference between
 * those and the fifty that describe the same shape is invisible at this size.
 */

const MOOD_LABEL: Record<WalkMood, { label: string; icon: IconName }> = {
  easy: { label: "Felt easy", icon: "emojiHappy" },
  good: { label: "Felt good", icon: "emojiNormal" },
  tough: { label: "Felt tough", icon: "emojiSad" }
};

function whenLabel(startedAt: number, endedAt: number): string {
  const date = new Date(startedAt).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const from = new Date(startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const to = new Date(endedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return `${date} · ${from} – ${to}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  const { palette } = useLumo();

  return (
    <View style={styles.stat}>
      {/* Ink rather than the walk accent: four green numbers in a row read as
          four links, and the route on the map is already carrying the colour. */}
      <AppText color={palette.ink} style={styles.statValue} numberOfLines={1}>
        {value}
      </AppText>
      <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

export default function WalkDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { palette, isDark, habits } = useLumo();

  /**
   * `undefined` while loading, `null` when there is no such walk.
   *
   * Three states rather than two, so a walk that has just been deleted from
   * this very screen does not flash "not found" on its way out.
   */
  const [record, setRecord] = React.useState<WalkRecord | null | undefined>(undefined);

  React.useEffect(() => {
    let active = true;

    loadWalkState().then((state) => {
      if (active) {
        setRecord(state.history.find((entry) => entry.id === params.id) ?? null);
      }
    });

    return () => {
      active = false;
    };
  }, [params.id]);

  const accent = readableOn(WALK_ACCENT, palette.white, 4.5);
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

  function handleDelete() {
    Alert.alert("Delete this?", "It will be removed from your history. This cannot be undone.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          // Local first, and the screen leaves on that — the server half is a
          // tidy-up the user should not be made to wait for.
          void deleteWalk(params.id).then(() => {
            router.back();

            return forgetWalk(params.id);
          });
        }
      }
    ]);
  }

  if (record === undefined) {
    return (
      <Screen contentStyle={styles.content} backgroundVariant={null} backgroundNode={<WalkBackground plate="walkDone" scrollY={scrollY} />} onScroll={handleScroll}>
        <ScreenHeader title="Move" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />
      </Screen>
    );
  }

  if (record === null) {
    return (
      <Screen contentStyle={styles.content} backgroundVariant={null} backgroundNode={<WalkBackground plate="walkDone" scrollY={scrollY} />} onScroll={handleScroll}>
        <ScreenHeader title="Move" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />
        <AppText variant="bodySmall" color={palette.subtle} style={styles.centered}>
          That one is no longer in your history.
        </AppText>
      </Screen>
    );
  }

  const linked = habits.filter((habit) => record.habitIds.includes(habit.id));
  const mood = record.mood ? MOOD_LABEL[record.mood] : null;

  return (
    <Screen contentStyle={styles.content} backgroundVariant={null} backgroundNode={<WalkBackground plate="walkDone" scrollY={scrollY} />} onScroll={handleScroll}>
      <ScreenHeader
        title="Move"
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        rightAction={{ icon: "trash", label: "Delete this", onPress: handleDelete }}
      />

      <AppText variant="bodySmall" color={palette.subtle} style={styles.when}>
        {whenLabel(record.startedAt, record.endedAt)}
      </AppText>

      {/* No card behind this: the map draws its own rounded frame, and a white
          plate around it only boxed in the one element that needs no boxing. */}
      <View style={styles.card}>
        {record.route.length > 1 ? (
          // No wash over the tiles: nothing is laid over this map, so the only
          // thing quietening the streets would do is make the route harder to
          // place. This IS the page.
          <WalkMap route={record.route} accent={accent} showRecenter={false} scrim={false} style={styles.map} />
        ) : null}

        <View style={styles.statRow}>
          <Stat label="Time" value={formatDuration(record.activeMs)} />
          <Stat label="Distance" value={formatDistance(record.distanceM)} />
          <Stat label="Pace" value={formatPace(calculatePace(record.distanceM, record.activeMs))} />
          <Stat label="Steps" value={formatSteps(record.steps)} />
        </View>
      </View>

      <View style={styles.badges}>
        {/* Reported, never hidden — the map above draws a route longer than the
            distance beside it, and this is the sentence that explains why. */}
        {record.vehicleM > 0 ? (
          <View style={[styles.badge, { backgroundColor: alpha(palette.danger, isDark ? "24" : "14") }]}>
            <Icon name="info" size={14} color={palette.danger} weight="bulk" />
            <AppText variant="caption" color={palette.body}>
              {formatDistance(record.vehicleM)} not on foot
            </AppText>
          </View>
        ) : null}

        {mood ? (
          <View style={[styles.badge, { backgroundColor: alpha(WALK_ACCENT, isDark ? "24" : "14") }]}>
            <Icon name={mood.icon} size={14} color={accent} weight="bulk" />
            <AppText variant="caption" color={palette.body}>
              {mood.label}
            </AppText>
          </View>
        ) : null}
      </View>

      {linked.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="bodySmall" color={palette.subtle}>
            Counted toward
          </AppText>
          <View style={styles.badges}>
            {linked.map((habit) => {
              // Each chip wears its own habit's colour, the way habits are
              // recognised everywhere else in the app.
              const swatch = habitAccent(habit.color, isDark) ?? palette.greenDark;
              const glyph = readableOn(swatch, palette.surface, 3);

              return (
                <View key={habit.id} style={[styles.badge, { backgroundColor: alpha(swatch, isDark ? "24" : "14") }]}>
                  <AppText variant="caption" color={glyph} numberOfLines={1}>
                    {habit.name}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {record.note ? (
        <View style={[styles.noteCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
          <AppText variant="bodySmall" color={palette.body}>
            {record.note}
          </AppText>
        </View>
      ) : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl
  },
  section: {
    gap: spacing.xs
  },
  when: {
    textAlign: "center"
  },
  centered: {
    textAlign: "center"
  },
  card: {
    gap: spacing.md
  },
  map: {
    height: 220
  },
  statRow: {
    flexDirection: "row",
    alignItems: "flex-end"
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2
  },
  statValue: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 20,
    lineHeight: 26
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: 30,
    maxWidth: "100%",
    paddingHorizontal: spacing.ml,
    borderRadius: radius.pill
  },
  noteCard: {
    padding: spacing.md,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2
  }
});
