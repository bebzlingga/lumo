import type { ScrollViewInstance } from "react-native";
import React, { useEffect, useRef } from "react";
import { Animated, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from "react-native";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { AppText } from "./ui";

type Palette = ReturnType<typeof useLumo>["palette"];

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;
export const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const PERIODS = ["AM", "PM"];

// "HH:MM" (24h) -> wheel indices (12h hour, minute, AM/PM).
function toIndices(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  const hour24 = match ? Math.min(23, Math.max(0, Number(match[1]))) : 9;
  const minute = match ? Math.min(59, Math.max(0, Number(match[2]))) : 0;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hourIndex: hour12 - 1, minuteIndex: minute, periodIndex: hour24 < 12 ? 0 : 1 };
}

// wheel indices -> "HH:MM" (24h).
function fromIndices(hourIndex: number, minuteIndex: number, periodIndex: number) {
  let hour24 = (hourIndex + 1) % 12; // 12 -> 0, 1-11 -> 1-11
  if (periodIndex === 1) {
    hour24 += 12; // PM: 0 -> 12, 1-11 -> 13-23
  }
  return `${String(hour24).padStart(2, "0")}:${String(minuteIndex).padStart(2, "0")}`;
}

/**
 * One scrolling wheel. Exported so the date picker spins on exactly the same
 * mechanics — snap interval, live fade, and settle-on-momentum — rather than a
 * near-copy that drifts out of step.
 */
export function WheelColumn({
  data,
  index,
  onChange,
  palette,
  width
}: {
  data: string[];
  index: number;
  onChange: (index: number) => void;
  palette: Palette;
  /** Overrides the default column width, for longer labels like "August". */
  width?: number;
}) {
  const ref = useRef<ScrollViewInstance>(null);
  const settledRef = useRef(index);
  const readyRef = useRef(false);
  // Drives the live fade so the centered item brightens as you scroll, not only
  // when the wheel settles.
  const scrollY = useRef(new Animated.Value(index * ITEM_HEIGHT)).current;

  // Scroll to a new index only when the change came from outside (not our own
  // settle), so selecting a value doesn't fight the momentum snap.
  useEffect(() => {
    if (readyRef.current && settledRef.current !== index) {
      settledRef.current = index;
      ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
    }
  }, [index]);

  function settle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    const next = Math.max(0, Math.min(data.length - 1, Math.round(y / ITEM_HEIGHT)));
    if (next !== settledRef.current) {
      settledRef.current = next;
      onChange(next);
    }
  }

  return (
    <Animated.ScrollView
      ref={ref as never}
      style={[styles.column, width ? { width } : null]}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      nestedScrollEnabled
      scrollEventThrottle={16}
      contentContainerStyle={styles.columnContent}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
      onLayout={() => {
        if (!readyRef.current) {
          readyRef.current = true;
          ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
        }
      }}
    >
      {data.map((label, itemIndex) => {
        const opacity = scrollY.interpolate({
          inputRange: [(itemIndex - 1) * ITEM_HEIGHT, itemIndex * ITEM_HEIGHT, (itemIndex + 1) * ITEM_HEIGHT],
          outputRange: [0.35, 1, 0.35],
          extrapolate: "clamp"
        });
        return (
          <Animated.View key={label} style={[styles.item, { opacity }]}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.itemText}>
              {label}
            </AppText>
          </Animated.View>
        );
      })}
    </Animated.ScrollView>
  );
}

export function WheelTimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { palette } = useLumo();
  const { hourIndex, minuteIndex, periodIndex } = toIndices(value);

  return (
    <View style={styles.wrap}>
      <View style={styles.columns}>
        <View pointerEvents="none" style={[styles.selectionBand, { backgroundColor: alpha(palette.greenDark, "12") }]} />
        <WheelColumn data={HOURS} index={hourIndex} palette={palette} onChange={(next) => onChange(fromIndices(next, minuteIndex, periodIndex))} />
        <WheelColumn data={MINUTES} index={minuteIndex} palette={palette} onChange={(next) => onChange(fromIndices(hourIndex, next, periodIndex))} />
        <WheelColumn data={PERIODS} index={periodIndex} palette={palette} onChange={(next) => onChange(fromIndices(hourIndex, minuteIndex, next))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: WHEEL_HEIGHT,
    alignItems: "center",
    justifyContent: "center"
  },
  columns: {
    flexDirection: "row",
    height: WHEEL_HEIGHT,
    gap: spacing.xs
  },
  column: {
    width: 58
  },
  columnContent: {
    paddingVertical: (WHEEL_HEIGHT - ITEM_HEIGHT) / 2
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center"
  },
  itemText: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 17
  },
  selectionBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: (WHEEL_HEIGHT - ITEM_HEIGHT) / 2,
    height: ITEM_HEIGHT,
    borderRadius: radius.lg
  }
});
