import React from "react";
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";

/**
 * The track, the handle, and how far the handle overhangs.
 *
 * The track is thin because it is a scale, not a progress bar — nothing is being
 * filled in, a number is being chosen. The handle is the part that has to be
 * grabbable, so it is sized for a fingertip and the row reserves its full height
 * rather than letting it clip.
 */
const TRACK_HEIGHT = 6;
const HANDLE_SIZE = 28;

/**
 * A horizontal picker for a whole number of kilometres.
 *
 * ## Why this is hand-built
 *
 * There is no slider in the app and none in its dependencies. Adding one means
 * `@react-native-community/slider`, which is a NATIVE module — and this project
 * commits its `ios/` prebuild with hand-patched pods, so a new native dependency
 * costs a rebuild of that whole arrangement for one control. `FocusDial` already
 * proved the pure-JS route works: `PanResponder`, a measured track, and no
 * native code at all. This is the straight-line version of the same thing.
 *
 * ## Claiming the gesture
 *
 * Captured on touch-down, exactly as the dial does it. A horizontal drag across
 * a control inside a ScrollView reads as a scroll to the list above it, and
 * whichever view asks first wins — so this asks in the CAPTURE phase, before the
 * scroller ever sees the touch. `onDragChange` then lets the page lock its own
 * scrolling for the duration, which is what stops a slow drag turning into a
 * page scroll halfway through.
 *
 * Both release AND terminate clear the drag: a gesture the system interrupts
 * ends without a release, and a page left permanently unscrollable is the worse
 * bug by far.
 */
export function DistanceSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
  accent,
  onDragChange,
  /** Announced instead of the raw number — "40 kilometres a week". */
  label
}: {
  /** The chosen value, in the same unit as `min`/`max`. Whole numbers. */
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  accent: string;
  /** Fires true on grab and false on release — lets a parent lock its scroll. */
  onDragChange?: (dragging: boolean) => void;
  label?: string;
}) {
  const { palette, isDark } = useLumo();
  /**
   * The track's position on screen, measured rather than assumed.
   *
   * `measureInWindow` on grab, not on layout: the goal page scrolls, so a
   * position captured at layout time is wrong the moment anything above it
   * moves. The dial takes the same approach for the same reason.
   */
  const trackRef = React.useRef<View>(null);
  const boundsRef = React.useRef({ x: 0, width: 0 });
  const [width, setWidth] = React.useState(0);

  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const measure = React.useCallback(() => {
    trackRef.current?.measureInWindow((x, _y, measuredWidth) => {
      boundsRef.current = { x, width: measuredWidth };
    });
  }, []);

  /**
   * Held in refs so the responder is created ONCE.
   *
   * Rebuilding it whenever `value` changes would hand the view a new responder
   * mid-drag, which drops the gesture on the first movement — the bug the dial
   * documents and solves the same way.
   */
  const changeRef = React.useRef(onChange);
  const dragRef = React.useRef(onDragChange);
  const rangeRef = React.useRef({ min, max, step });

  changeRef.current = onChange;
  dragRef.current = onDragChange;
  rangeRef.current = { min, max, step };

  const valueFromTouch = React.useCallback((pageX: number) => {
    const { x, width: trackWidth } = boundsRef.current;
    const { min: low, max: high, step: increment } = rangeRef.current;

    if (trackWidth <= 0) {
      return low;
    }

    /**
     * The travel is the track MINUS the handle: the handle's centre runs from
     * half its width in to half its width from the end, so that its edges stop
     * flush with the track rather than hanging off it. Measuring against the
     * full width instead would make the last few pixels unreachable.
     */
    const travel = Math.max(1, trackWidth - HANDLE_SIZE);
    const fraction = Math.min(1, Math.max(0, (pageX - x - HANDLE_SIZE / 2) / travel));
    const stepped = Math.round((low + fraction * (high - low)) / increment) * increment;

    return Math.min(high, Math.max(low, stepped));
  }, []);

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Capture phase — see the note above about who wins the gesture.
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          dragRef.current?.(true);
          measure();
          // Deliberately NOT setting a value here. The track is measured in this
          // same tick and `measureInWindow` is asynchronous, so a value read now
          // would use the previous position — which, on a page that has scrolled,
          // is a jump to the wrong number the instant you touch it.
        },
        onPanResponderMove: (event) => {
          changeRef.current(valueFromTouch(event.nativeEvent.pageX));
        },
        onPanResponderRelease: (event) => {
          changeRef.current(valueFromTouch(event.nativeEvent.pageX));
          dragRef.current?.(false);
        },
        onPanResponderTerminate: () => dragRef.current?.(false)
      }),
    [measure, valueFromTouch]
  );

  const clamped = Math.min(max, Math.max(min, value));
  const fraction = max > min ? (clamped - min) / (max - min) : 0;
  const travel = Math.max(0, width - HANDLE_SIZE);
  const handleLeft = travel * fraction;

  return (
    <View style={styles.wrap}>
      <View
        ref={trackRef}
        onLayout={handleLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: clamped }}
        // The whole row, so a tap anywhere along the track moves the handle to
        // it rather than only a drag from the handle itself.
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          const delta = event.nativeEvent.actionName === "increment" ? step : -step;

          onChange(Math.min(max, Math.max(min, clamped + delta)));
        }}
        style={styles.row}
        {...responder.panHandlers}
      >
        <View style={[styles.track, { backgroundColor: alpha(accent, isDark ? "33" : "24") }]} />
        {/* Drawn from the left edge to the handle's CENTRE, so the fill meets the
            handle rather than stopping short of it or running past. */}
        <View style={[styles.fill, { backgroundColor: accent, width: handleLeft + HANDLE_SIZE / 2 }]} />
        <View
          pointerEvents="none"
          style={[
            styles.handle,
            {
              left: handleLeft,
              backgroundColor: palette.card,
              borderColor: accent,
              shadowColor: isDark ? "transparent" : palette.shadow
            }
          ]}
        />
      </View>

      {/* The ends of the scale, so the handle's position means something before
          it is touched. Small and held back — they are the ruler's markings, not
          figures to read. */}
      <View style={styles.ends}>
        <AppText variant="caption" color={palette.muted} style={styles.end}>
          {min} km
        </AppText>
        <AppText variant="caption" color={palette.muted} style={styles.end}>
          {max} km
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xxs
  },
  // Full handle height, so the knob is never clipped by the row it sits in and
  // the whole band is a tap target rather than just the hairline of the track.
  row: {
    height: HANDLE_SIZE,
    justifyContent: "center"
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill
  },
  fill: {
    position: "absolute",
    left: 0,
    height: TRACK_HEIGHT,
    borderRadius: radius.pill
  },
  handle: {
    position: "absolute",
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: radius.pill,
    borderWidth: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3
  },
  ends: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  end: {
    fontFamily: fontFamilies.lexendMedium
  }
});
