import React, { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Animated, Easing, PanResponder, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import {
  MonthlyStatsView,
  OverallStatsView,
  StatsSegmentedControl,
  StatsTab,
  WeeklyStatsView,
  statsTabs
} from "@/components/StatisticsViews";
import { AppText, LoadingState, Screen } from "@/components/ui";
import { fontFamilies, layout, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";

function isHorizontalSwipeGesture(dx: number, dy: number) {
  const horizontalDistance = Math.abs(dx);
  const verticalDistance = Math.abs(dy);

  return horizontalDistance > 18 && horizontalDistance > verticalDistance * 1.25;
}

type SwipeDirection = "next" | "previous";

export default function StatsScreen() {
  const { habits, isReady, palette } = useLumo();
  const { width } = useWindowDimensions();
  const [selectedTab, setSelectedTab] = useState<StatsTab>("overall");
  const [outgoingTab, setOutgoingTab] = useState<StatsTab | null>(null);
  const [slideDirection, setSlideDirection] = useState<SwipeDirection>("next");
  const slideProgress = React.useRef(new Animated.Value(1)).current;
  const slideDistance = Math.max(320, width);

  useFocusEffect(
    useCallback(() => {
      slideProgress.stopAnimation();
      slideProgress.setValue(1);
      setOutgoingTab(null);
      setSlideDirection("next");
      setSelectedTab("overall");
    }, [slideProgress])
  );

  const selectTab = useCallback(
    (nextTab: StatsTab) => {
      if (nextTab === selectedTab) {
        return;
      }

      const currentIndex = statsTabs.findIndex((tab) => tab.value === selectedTab);
      const nextIndex = statsTabs.findIndex((tab) => tab.value === nextTab);
      const direction: SwipeDirection = nextIndex > currentIndex ? "next" : "previous";

      slideProgress.stopAnimation();
      slideProgress.setValue(0);
      setSlideDirection(direction);
      setOutgoingTab(selectedTab);
      setSelectedTab(nextTab);

      Animated.timing(slideProgress, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start(({ finished }) => {
        if (finished) {
          setOutgoingTab(null);
        }
      });
    },
    [selectedTab, slideProgress]
  );

  const moveTab = useCallback(
    (direction: SwipeDirection) => {
      const currentIndex = statsTabs.findIndex((tab) => tab.value === selectedTab);
      const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
      const clampedIndex = Math.min(Math.max(nextIndex, 0), statsTabs.length - 1);
      const nextTab = statsTabs[clampedIndex]?.value;

      if (nextTab) {
        selectTab(nextTab);
      }
    },
    [selectedTab, selectTab]
  );
  const renderStatsView = useCallback(
    (tab: StatsTab) => {
      if (tab === "overall") {
        return <OverallStatsView habits={habits} />;
      }

      if (tab === "weekly") {
        return <WeeklyStatsView habits={habits} />;
      }

      return <MonthlyStatsView habits={habits} />;
    },
    [habits]
  );
  const incomingTranslateX = slideProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [slideDirection === "next" ? slideDistance : -slideDistance, 0]
  });
  const outgoingTranslateX = slideProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, slideDirection === "next" ? -slideDistance : slideDistance]
  });
  const incomingOpacity = slideProgress.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [0.82, 1, 1]
  });
  const outgoingOpacity = slideProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.76]
  });
  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => isHorizontalSwipeGesture(gestureState.dx, gestureState.dy),
        onMoveShouldSetPanResponderCapture: (_, gestureState) => isHorizontalSwipeGesture(gestureState.dx, gestureState.dy),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx <= -56 || gestureState.vx <= -0.65) {
            moveTab("next");
          }

          if (gestureState.dx >= 56 || gestureState.vx >= 0.65) {
            moveTab("previous");
          }
        },
        onPanResponderTerminationRequest: () => false
      }),
    [moveTab]
  );

  if (!isReady) {
    return <LoadingState />;
  }

  return (
    <Screen scroll={false} contentStyle={styles.screenShell}>
      <View collapsable={false} style={styles.swipeFrame} {...swipeResponder.panHandlers}>
        <ScrollView
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.screenHeader}>
            <AppText variant="displaySmall" color={palette.ink} style={styles.headerTitle}>
              Insights
            </AppText>
            <AppText variant="bodySmall" color={palette.subtle}>
              See how your routines are building up.
            </AppText>
          </View>

          <StatsSegmentedControl value={selectedTab} onChange={selectTab} />

          <View style={styles.swipeContent}>
            {outgoingTab ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.slidePane,
                  styles.outgoingSlidePane,
                  {
                    opacity: outgoingOpacity,
                    transform: [{ translateX: outgoingTranslateX }]
                  }
                ]}
              >
                {renderStatsView(outgoingTab)}
              </Animated.View>
            ) : null}
            <Animated.View
              style={[
                styles.slidePane,
                {
                  opacity: outgoingTab ? incomingOpacity : 1,
                  transform: [{ translateX: outgoingTab ? incomingTranslateX : 0 }]
                }
              ]}
            >
              {renderStatsView(selectedTab)}
            </Animated.View>
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenShell: {
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 0
  },
  swipeFrame: {
    flex: 1
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: layout.tabScreenBottomPadding
  },
  screenHeader: {
    marginBottom: spacing.sm,
    gap: spacing.xxs
  },
  swipeContent: {
    minHeight: 360,
    overflow: "hidden",
    // Extend the clip box out to the screen edges (and below) so card shadows
    // aren't cut off. The horizontal inset is moved onto slidePane instead.
    marginHorizontal: -spacing.lg,
    marginBottom: -spacing.lg,
    paddingBottom: spacing.lg
  },
  slidePane: {
    width: "100%",
    paddingHorizontal: spacing.lg
  },
  outgoingSlidePane: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 1
  },
  headerTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 34,
    lineHeight: 40
  }
});
