import React from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

/**
 * Whether the floating tab bar is tucked away, shared between the bar (which
 * lives in the tabs navigator) and the screens (whose scrolling drives it).
 *
 * A shared value rather than state: the bar animates on the UI thread, so a
 * fast flick doesn't wait on a React render to get out of the way. Screens
 * outside the tab navigator see no provider and report nothing — `Screen` is
 * used app-wide, and a modal's scrolling has no tab bar to hide.
 */
type TabBarVisibility = {
  /** 0 = fully shown, 1 = fully tucked below the screen. */
  hidden: SharedValue<number>;
  /** Feed a scroll event in; direction decides the rest. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /**
   * Force the bar back and forget where the last screen was scrolled to. Called
   * on a tab switch: the offset carries over between screens otherwise, and the
   * first event on the new one reads as a huge drag in whichever direction the
   * two pages happen to differ.
   */
  reveal: () => void;
  /**
   * Pin the bar out of sight, or release it.
   *
   * Separate from the scroll mechanism rather than "just scroll it away": while
   * locked, scrolling and `reveal` are ignored outright. A screen that hides
   * the bar because it has no business offering navigation — the paywall — has
   * to stay hidden whether the reader scrolls up, switches tab and comes back,
   * or lands on it fresh.
   */
  setLocked: (locked: boolean) => void;
};

const TabBarVisibilityContext = React.createContext<TabBarVisibility | null>(null);

// The bar stays put until the finger has travelled this far in one direction —
// without it, the scroll's own jitter flips the bar in and out on every frame.
const DIRECTION_THRESHOLD = 12;
// Near the top of a page the bar is always shown: hiding it there costs a
// destination for no room, since nothing is being read out from under it yet.
const TOP_ZONE = 48;
const DURATION = 200;

export function TabBarVisibilityProvider({ children }: { children: React.ReactNode }) {
  const hidden = useSharedValue(0);
  const lastY = React.useRef(0);
  const travel = React.useRef(0);
  const locked = React.useRef(false);

  const show = React.useCallback(() => {
    travel.current = 0;

    if (locked.current || hidden.value === 0) {
      return;
    }

    hidden.value = withTiming(0, { duration: DURATION });
  }, [hidden]);

  const setLocked = React.useCallback(
    (value: boolean) => {
      locked.current = value;
      travel.current = 0;
      hidden.value = withTiming(value ? 1 : 0, { duration: DURATION });
    },
    [hidden]
  );

  const reveal = React.useCallback(() => {
    lastY.current = 0;
    show();
  }, [show]);

  const onScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (locked.current) {
        return;
      }

      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const y = contentOffset.y;
      const delta = y - lastY.current;
      lastY.current = y;

      // The top of the page always shows the bar, and rubber-banding past
      // either end isn't a direction — on iOS the bounce reports a long run of
      // deltas that would otherwise read as a flick.
      if (y <= TOP_ZONE) {
        show();
        return;
      }

      // A frame that didn't move has no sign, and folding it in would reset the
      // count below on a slow drag.
      if (delta === 0 || y + layoutMeasurement.height >= contentSize.height) {
        return;
      }

      // Reversing direction restarts the count, so the threshold measures one
      // continuous drag rather than the net of a scroll back and forth.
      travel.current = Math.sign(delta) === Math.sign(travel.current) ? travel.current + delta : delta;

      if (travel.current > DIRECTION_THRESHOLD && hidden.value !== 1) {
        hidden.value = withTiming(1, { duration: DURATION });
      } else if (travel.current < -DIRECTION_THRESHOLD) {
        show();
      }
    },
    [hidden, show]
  );

  const value = React.useMemo(() => ({ hidden, onScroll, reveal, setLocked }), [hidden, onScroll, reveal, setLocked]);

  return <TabBarVisibilityContext.Provider value={value}>{children}</TabBarVisibilityContext.Provider>;
}

/** Null outside the tab navigator — callers no-op rather than branch. */
export function useTabBarVisibility(): TabBarVisibility | null {
  return React.useContext(TabBarVisibilityContext);
}
