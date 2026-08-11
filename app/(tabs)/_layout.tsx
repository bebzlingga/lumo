import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, View } from "react-native"
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Icon, type IconName } from "@/components/Icon";
import { AppText } from "@/components/ui";
import { badgeAccent, badgeAccentText, fontFamilies, layout, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { TabBarVisibilityProvider, useTabBarVisibility } from "@/context/TabBarVisibility";
import { alpha } from "@/lib/color";
import { friendsService, onGroupCompletionsChanged, scheduledGroupHabitsOn } from "@/lib/friends";
import { toDateKey } from "@/lib/date";
import { formatLumoId } from "@/lib/lumoId";
import { Pressable } from "@/components/Pressable"

/**
 * Routes that live in the tabs navigator — so the bar stays visible while
 * they are open — but hold no slot in it.
 *
 * This is an explicit list rather than a check on `href: null`: Expo Router
 * consumes `href` itself, so it never reaches `descriptors[...].options` and a
 * filter on it silently matches nothing.
 */
const HIDDEN_TABS = new Set(["settings", "profile"]);

const tabIcons: Record<string, IconName> = {
  today: "home",
  habits: "colorFilter",
  // Lumo Move sits between the personal side of the app and the social side,
  // which is where it belongs: it is a major feature of its own rather than a
  // tool tucked inside Today.
  move: "walk",
  journal: "book",
  friends: "friends"
};

function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { isDark, palette, lumoIdSuffix } = useLumo();
  // A challenge in progress — shown as a plain dot on Move. A dot rather than a
  // count because there is only ever one, and a "1" would invite the question of
  // what the other ones are.
  const { progress: challengeProgress } = useMove();
  // Group activities still to complete today — shown as a badge on Friends.
  const [pendingActivities, setPendingActivities] = React.useState(0);

  const loadPendingActivities = React.useCallback(async () => {
    const myLumoId = formatLumoId(lumoIdSuffix);
    const groups = await friendsService.listGroups();
    const todayKey = toDateKey();
    let pending = 0;

    for (const group of groups) {
      const me = group.members.find((member) => member.profile.lumoId === myLumoId);

      if (!me) {
        continue;
      }

      // The shared rule, not a copy of it. This used to inline its own reading
      // of `repeatSchedule`, which meant the badge and the Habits tab could
      // disagree about what was due — the badge saying two, the list showing
      // three.
      pending += scheduledGroupHabitsOn(group.habits, todayKey).filter((habit) => !me.completedTodayHabitIds.includes(habit.id)).length;
    }

    setPendingActivities(pending);
  }, [lumoIdSuffix]);

  // Refetch on tab switches, and live whenever a group check-in is written
  // anywhere in the app (group page, home mirroring, undo).
  React.useEffect(() => {
    loadPendingActivities();
  }, [state.index, loadPendingActivities]);

  React.useEffect(() => onGroupCompletionsChanged(loadPendingActivities), [loadPendingActivities]);
  // Lifted clear of the bottom edge rather than tucked under the safe-area
  // inset — the bar is a floating shell, and pulled down into the home
  // indicator it read as docked chrome. The floor covers phones that report no
  // bottom inset at all, where the bar would otherwise sit flush on the edge.
  const bottomGap = 0;
  const bottomInset = Math.max(insets.bottom, spacing.sm);
  // Scrolling down slides the bar out; scrolling back up returns it. It travels
  // its full height plus the gutter so the shadow clears the edge too, and
  // fades on the way so it doesn't read as a slab sliding under the content.
  const tabBar = useTabBarVisibility();
  const hiddenTravel = layout.floatingTabBarHeight + bottomInset + bottomGap + spacing.md;
  const hideStyle = useAnimatedStyle(() => {
    const hidden = tabBar?.hidden.value ?? 0;

    return { transform: [{ translateY: hidden * hiddenTravel }], opacity: 1 - hidden };
  });
  // A tab switch always brings it back — the new screen starts at its own
  // offset, and arriving to a bar the PREVIOUS page scrolled away is a tab bar
  // that has gone missing for no reason the reader can see.
  React.useEffect(() => {
    tabBar?.reveal();
  }, [state.index, tabBar]);
  // Light warm shell to match the onboarding surfaces, rather than a solid
  // green slab — the sage now reads as the ACTIVE state instead of the chrome.
  const shellBackground = isDark ? palette.surface : palette.card;
  const activeColor = isDark ? palette.greenActive : palette.greenDark;
  const inactiveColor = palette.muted;
  const activeBackground = isDark ? alpha(palette.greenActive, "1F") : palette.greenSoft;

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
        className="h-[58px] min-w-0 flex-1 basis-0 items-center justify-center px-1"
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
        style={({ pressed }) => [{ opacity: pressed ? 0.72 : 1 }]}
      >
        {/* The active fill lives on THIS box, not on the Pressable — the
            Pressable stays the full 58pt cell so the touch target does not
            shrink with the highlight, which now sits 2pt inside it top and
            bottom and 4pt in on each side (the cell's own px-1). */}
        <View
          className="h-[54px] w-full items-center justify-center rounded-[16px]"
          style={{ backgroundColor: isFocused ? activeBackground : "transparent" }}
        >
        {/* Dim only the icon/label — the badge stays vivid on inactive tabs. */}
        <View>
          <View style={{ opacity: isFocused ? 1 : 0.7 }}>
            <Icon name={tabIcons[route.name] ?? "grid"} size={25} color={color} weight={isFocused ? "fill" : "bulk"} />
          </View>
          {route.name === "move" && challengeProgress !== null ? (
            <View
              style={{
                position: "absolute",
                top: -3,
                right: -3,
                zIndex: 1,
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: palette.danger
              }}
            />
          ) : null}
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
                backgroundColor: badgeAccent
              }}
            >
              <AppText
                variant="caption"
                color={badgeAccentText}
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
        </View>
      </Pressable>
    );
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 items-center justify-end bg-transparent"
      // Same gutter every screen's content uses, so the bar's edges line up
      // with the cards above it rather than sitting 8pt wider.
      style={[{ paddingHorizontal: layout.screenPaddingX, paddingBottom: bottomInset + bottomGap }, hideStyle]}
    >
      <View
        // 28 (radius.sheet), not 22 — a 72pt-tall bar carried its old corner
        // like a card rather than like the floating shell it is.
        className="w-full rounded-[28px]"
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
          {state.routes.filter((route) => !HIDDEN_TABS.has(route.name)).map(renderRoute)}
        </View>
      </View>
    </Animated.View>
  );
}

export default function TabLayout() {
  return (
    // Wraps the navigator so the bar and the screens whose scrolling drives it
    // share one signal — `tabBar` renders inside `Tabs`, so both are below this.
    <TabBarVisibilityProvider>
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
          name="move"
          options={{
            title: "Move"
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
        {/* Held back from the bar, but kept in the tabs navigator so the bottom
            navigation stays visible while Profile is open — the same treatment
            Settings gets. Still reached from the avatar on Today and from the
            friend-request and group-invite notifications, so nothing is
            stranded by taking the slot away. */}
        <Tabs.Screen
          name="profile"
          options={{
            href: null,
            title: "Profile"
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
    </TabBarVisibilityProvider>
  );
}
