import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, Pressable, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { AppText } from "@/components/ui";
import { layout } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";

const tabIcons: Record<string, IconName> = {
  today: "home",
  habits: "grid",
  stats: "chart",
  settings: "settings"
};

function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { isDark, palette } = useLumo();
  const bottomGap = 0;
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
        <Icon name={tabIcons[route.name] ?? "grid"} size={25} color={color} weight="bulk" />
        <AppText variant="caption" color={color} style={{ fontSize: 10, lineHeight: 13, textAlign: "center", width: "100%" }} numberOfLines={1}>
          {label}
        </AppText>
      </Pressable>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 items-center justify-end bg-transparent px-7"
      style={{ paddingBottom: bottomInset + bottomGap }}
    >
      <View
        className="w-full max-w-[370px] rounded-[22px]"
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
          {state.routes.map(renderRoute)}
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
        name="stats"
        options={{
          title: "Insights"
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings"
        }}
      />
    </Tabs>
  );
}
