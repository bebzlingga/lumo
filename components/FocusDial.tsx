import React from "react";
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line } from "react-native-svg";
import { spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { STEP_MINUTES, dialToMinutes, minutesToDial } from "@/lib/focus";

/**
 * The circular length picker: a track of minute ticks, a filled arc showing how
 * long the session will be, and a handle you drag to change it.
 *
 * Geometry runs from 12 o'clock, clockwise. Screen coordinates put +y downward
 * and `Math.atan2` measures from +x counter-clockwise, so every conversion here
 * offsets by a quarter turn and flips sign — done in one place (`angleFor` and
 * `fractionFromTouch`) rather than scattered through the drawing code.
 *
 * `progress` mode swaps the drag for a read-only arc: the same dial draws the
 * countdown while a session runs, so the shape the user set is the shape they
 * then watch empty.
 */
const TICK_COUNT = 60;
/**
 * Ring thickness. Heavy enough that the arc is the thing you read from across
 * a desk rather than a hairline around the number.
 *
 * The handle grows with it — at 13 the knob sat flush inside a 20pt stroke and
 * stopped looking like something you could grab.
 */
const DEFAULT_STROKE = 28;
const HANDLE_RADIUS = 18;

/** Radians from 12 o'clock, clockwise, for a 0–1 position on the dial. */
function angleFor(fraction: number): number {
  return fraction * Math.PI * 2 - Math.PI / 2;
}

export function FocusDial({
  minutes,
  onChange,
  progress,
  accent,
  trackColor,
  onDragChange,
  stroke: strokeProp,
  children
}: {
  /** The chosen length. Ignored when `progress` is given. */
  minutes: number;
  /** Omit to make the dial read-only. */
  onChange?: (minutes: number) => void;
  /** 0–1 remaining, for the running countdown. Takes over from `minutes`. */
  progress?: number;
  /** Drawn in the middle — the time and whatever sits under it. */
  children?: React.ReactNode;
  /** The arc and handle colour. Defaults to the app's primary green. */
  accent?: string;
  /** The unfilled track behind the arc. Defaults to a wash of `accent`. */
  trackColor?: string;
  /** Fires true on grab and false on release — lets a parent lock its scroll. */
  onDragChange?: (dragging: boolean) => void;
  /** Ring thickness. Heavier suits a smaller dial, where the arc is all there is. */
  stroke?: number;
}) {
  const { palette, isDark } = useLumo();
  // Falls back to the app green so the dial still works standalone; the Focus
  // screen passes the colour of whatever activity is selected.
  const arc = accent ?? palette.greenActive;
  const track = trackColor ?? alpha(arc, isDark ? "2E" : "1F");
  const STROKE = strokeProp ?? DEFAULT_STROKE;
  const [size, setSize] = React.useState(0);
  const wrapRef = React.useRef<View>(null);
  /**
   * The dial's top-left in window coordinates.
   *
   * Touches are resolved against THIS rather than against `locationX`, which is
   * measured from whichever view actually received the touch — during a drag
   * that can be a child, or nothing at all once the finger leaves the element,
   * so a dial driven by it responds to the first tap and then goes dead.
   * `pageX`/`pageY` are absolute and keep working wherever the finger goes.
   */
  const originRef = React.useRef({ x: 0, y: 0 });

  const measure = React.useCallback(() => {
    wrapRef.current?.measureInWindow((x, y) => {
      originRef.current = { x, y };
    });
  }, []);

  // Read through a ref inside the responder: PanResponder is created once, so a
  // handler closing over `onChange` directly would keep calling the first one it
  // ever saw.
  const changeRef = React.useRef(onChange);
  changeRef.current = onChange;
  const dragRef = React.useRef(onDragChange);
  dragRef.current = onDragChange;
  const sizeRef = React.useRef(0);
  sizeRef.current = size;

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      setSize(Math.min(event.nativeEvent.layout.width, event.nativeEvent.layout.height));
      measure();
    },
    [measure]
  );

  /**
   * Where a touch falls on the dial, 0–1 from 12 o'clock clockwise.
   *
   * Locates the touch relative to the dial's centre, then undoes the quarter
   * turn described above. The `+ 1) % 1` puts the result back in range for
   * touches in the top-left quadrant, where the raw angle comes out negative.
   */
  const fractionFromTouch = React.useCallback((pageX: number, pageY: number) => {
    const center = sizeRef.current / 2;
    const x = pageX - originRef.current.x - center;
    const y = pageY - originRef.current.y - center;
    const angle = Math.atan2(y, x) + Math.PI / 2;

    return ((angle / (Math.PI * 2)) + 1) % 1;
  }, []);

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Boolean(changeRef.current),
        onMoveShouldSetPanResponder: () => Boolean(changeRef.current),
        // Claimed in the CAPTURE phase, which is what actually stops the page
        // scrolling: a vertical sweep across the dial reads as a scroll to the
        // ScrollView above, and whichever view asks first wins. Capturing here
        // means the dial is asked before the list ever sees the gesture.
        onStartShouldSetPanResponderCapture: () => Boolean(changeRef.current),
        onMoveShouldSetPanResponderCapture: () => Boolean(changeRef.current),
        // Claimed on touch-down AND held through the drag, so one continuous
        // gesture sweeps the dial rather than each tap being its own event.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          dragRef.current?.(true);
          measure();
          const { pageX, pageY } = event.nativeEvent;
          changeRef.current?.(dialToMinutes(fractionFromTouch(pageX, pageY)));
        },
        onPanResponderMove: (event) => {
          const { pageX, pageY } = event.nativeEvent;
          changeRef.current?.(dialToMinutes(fractionFromTouch(pageX, pageY)));
        },
        // Both, because a gesture interrupted by the system ends without a
        // release — and a scroll left permanently locked is the worse bug.
        onPanResponderRelease: () => dragRef.current?.(false),
        onPanResponderTerminate: () => dragRef.current?.(false)
      }),
    [fractionFromTouch, measure]
  );

  const fraction = progress ?? minutesToDial(minutes);
  const center = size / 2;
  const ringRadius = Math.max(0, center - STROKE / 2 - HANDLE_RADIUS / 2);
  const circumference = 2 * Math.PI * ringRadius;
  const handleAngle = angleFor(fraction);
  const handleX = center + Math.cos(handleAngle) * ringRadius;
  const handleY = center + Math.sin(handleAngle) * ringRadius;
  const tickOuter = ringRadius - STROKE / 2 - 4;
  const tickInner = tickOuter - 6;

  return (
    <View
      ref={wrapRef}
      style={styles.wrap}
      onLayout={handleLayout}
      // The whole dial is the drag target rather than the handle alone: a 26pt
      // handle is a small thing to catch, and grabbing the ring anywhere is how
      // every physical dial behaves.
      {...(onChange ? responder.panHandlers : {})}
      accessibilityRole={onChange ? "adjustable" : undefined}
      accessibilityLabel={onChange ? `Focus length, ${minutes} minutes` : undefined}
      accessibilityActions={onChange ? [{ name: "increment" }, { name: "decrement" }] : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") {
          changeRef.current?.(minutes + STEP_MINUTES);
        }
        if (event.nativeEvent.actionName === "decrement") {
          changeRef.current?.(minutes - STEP_MINUTES);
        }
      }}
    >
      {size > 0 ? (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Minute ticks. Drawn first and faintly — they give the dial its
              instrument feel without competing with the arc over them. */}
          <G>
            {Array.from({ length: TICK_COUNT }, (_, index) => {
              const angle = angleFor(index / TICK_COUNT);
              const major = index % 5 === 0;

              return (
                <Line
                  key={index}
                  x1={center + Math.cos(angle) * tickOuter}
                  y1={center + Math.sin(angle) * tickOuter}
                  x2={center + Math.cos(angle) * (major ? tickInner - 2 : tickInner)}
                  y2={center + Math.sin(angle) * (major ? tickInner - 2 : tickInner)}
                  stroke={alpha(palette.subtle, major ? "59" : "2E")}
                  strokeWidth={major ? 2 : 1}
                  strokeLinecap="round"
                />
              );
            })}
          </G>

          <Circle cx={center} cy={center} r={ringRadius} stroke={track} strokeWidth={STROKE} fill="none" />
          <Circle
            cx={center}
            cy={center}
            r={ringRadius}
            stroke={arc}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            originX={center}
            originY={center}
            rotation={-90}
          />

          {onChange ? (
            <>
              {/* Two circles, not one: the ring's colour reads as the handle's
                  edge and the card fill as its face, so it sits ON the arc
                  rather than punching a hole through it. */}
              <Circle cx={handleX} cy={handleY} r={HANDLE_RADIUS} fill={palette.card} stroke={arc} strokeWidth={3} />
            </>
          ) : null}
        </Svg>
      ) : null}

      <View pointerEvents="none" style={styles.center}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs
  }
});
