import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, Pressable, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { AppText } from "@/components/ui";
import { fontFamilies, layout } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { friendsService, onGroupCompletionsChanged } from "@/lib/friends";
import { formatLumoId } from "@/lib/lumoId";

const tabIcons: Record<string, IconName> = {
  today: "home",
  habits: "colorFilter",
  stats: "chart",
  journal: "book",
  friends: "friends"
};

function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { isDark, palette, lumoIdSuffix } = useLumo();
  // Group activities still to complete today — shown as a badge on Friends.
  const [pendingActivities, setPendingActivities] = React.useState(0);

  const loadPendingActivities = React.useCallback(async () => {
    const myLumoId = formatLumoId(lumoIdSuffix);
    const groups = await friendsService.listGroups();
    const todayDow = new Date().getDay();
    let pending = 0;

    for (const group of groups) {
      const me = group.members.find((member) => member.profile.lumoId === myLumoId);
      if (!me) {
        continue;
      }

      for (const habit of group.habits) {
        if (habit.goal.type === "weekly" || habit.goal.type === "monthly") {
          continue;
        }

        const scheduled =
          habit.repeatSchedule.type === "weekdays"
            ? todayDow >= 1 && todayDow <= 5
            : habit.repeatSchedule.type === "weekends"
              ? todayDow === 0 || todayDow === 6
              : habit.repeatSchedule.type === "specific"
                ? (habit.repeatSchedule.days as number[]).includes(todayDow)
                : true;

        if (scheduled && !me.completedTodayHabitIds.includes(habit.id)) {
          pending += 1;
        }
      }
    }

    setPendingActivities(pending);
  }, [lumoIdSuffix]);

  // Refetch on tab switches, and live whenever a group check-in is written
  // anywhere in the app (group page, home mirroring, undo).
  React.useEffect(() => {
    loadPendingActivities();
  }, [state.index, loadPendingActivities]);

  React.useEffect(() => onGroupCompletionsChanged(loadPendingActivities), [loadPendingActivities]);
  // Slightly below the safe-area inset so the bar hugs the screen bottom.
  const bottomGap = -12;
  const bottomInset = Math.max(insets.bottom, 0);
  const shellBackground = isDark ? palette.surface : palette.greenDark;
  const activeColor = palette.white;
  const inactiveColor = isDark ? palette.muted : palette.greenSoft;
  const activeBackground = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.14)";

  function renderRoute(route: (typeof state.routes)[number]) {
    const index = state.routes.findIndex((item) => item.key === route.key);
    const isFocused = state.index === index;
    const options = descriptors[route.key]?.options;
    const label = String(options?.title ?? route.name);
    const accessibilityLabel = options?.tabBarAccessibilityLabel ?? label;
    const color = isFocused ? activeColor : inactiveColor;

    return (
      <Pressable
        key={route.key}
        className="h-[58px] min-w-0 flex-1 basis-0 items-center justify-center rounded-[18px] px-2"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={isFocused ? { selected: true } : undefined}
        onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
        onPress={() => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        }}
        style={({ pressed }) => [
          {
            backgroundColor: isFocused ? activeBackground : "transparent",
            opacity: pressed ? 0.72 : 1
          },
        ]}
      >
        {/* Dim only the icon/label — the badge stays vivid on inactive tabs. */}
        <View>
          <View style={{ opacity: isFocused ? 1 : 0.7 }}>
            <Icon name={tabIcons[route.name] ?? "grid"} size={25} color={color} weight="bulk" />
          </View>
          {route.name === "friends" && pendingActivities > 0 ? (
            <View
              style={{
                position: "absolute",
                top: -9,
                right: -9,
                zIndex: 1,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                paddingHorizontal: 3,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: palette.danger
              }}
            >
              <AppText
                variant="caption"
                color={palette.white}
                style={{ fontSize: 9, lineHeight: 12, fontFamily: fontFamilies.lexendBold }}
              >
                {pendingActivities > 9 ? "9+" : pendingActivities}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText
          variant="caption"
          color={color}
          style={{ fontSize: 10, lineHeight: 13, textAlign: "center", width: "100%", opacity: isFocused ? 1 : 0.7 }}
          numberOfLines={1}
        >
          {label}
        </AppText>
      </Pressable>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 items-center justify-end bg-transparent px-6"
      style={{ paddingBottom: bottomInset + bottomGap }}
    >
      <View
        className="w-full rounded-[22px]"
        style={{
          height: layout.floatingTabBarHeight,
          backgroundColor: shellBackground,
          shadowColor: palette.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.26,
          shadowRadius: 18,
          ...Platform.select({
            android: {
              elevation: 12
            }
          })
        }}
      >
        <View className="h-full w-full flex-row items-center justify-center px-5">
          {state.routes.filter((route) => route.name !== "settings").map(renderRoute)}
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="today"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        animation: "shift",
        headerShown: false,
        transitionSpec: {
          animation: "timing",
          config: {
            duration: 240
          }
        }
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Today"
        }}
      />
      <Tabs.Screen
        name="habits"
        options={{
          title: "Habits"
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends"
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: "Journal"
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Insights"
        }}
      />
      {/* Hidden from the tab bar, but kept in the tabs navigator so the bottom
          navigation pane still shows while the Settings screen is open. */}
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          title: "Settings"
        }}
      />
    </Tabs>
  );
}
