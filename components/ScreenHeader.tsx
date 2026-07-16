import React, { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { spacing } from "@/constants/theme";
import { IconName, IconWeight } from "./Icon";
import { IconButton } from "./ui";

const HEADER_BUTTON_SIZE = 44;
const HEADER_ICON_SIZE = 22;
const HEADER_VISUAL_ICON_SIZES: Partial<Record<IconName, number>> = {
  back: 32,
  edit: 22
};
const HEADER_ICON_OFFSETS: Partial<Record<IconName, ViewStyle>> = {
  back: {
    transform: [{ translateX: 1 }]
  },
  edit: {
    transform: [{ translateX: -3 }, { translateY: 4 }]
  },
  pause: {
    transform: [{ translateX: -3 }, { translateY: 4 }]
  },
  play: {
    transform: [{ translateX: -3 }, { translateY: 4 }]
  }
};

type ScreenHeaderAction = {
  icon: IconName;
  label: string;
  onPress: () => void;
  iconWeight?: IconWeight;
  iconSize?: number;
  iconColor?: string;
  iconStyle?: StyleProp<ViewStyle>;
};

export function ScreenHeader({
  centerContent,
  centerLabel,
  onCenterPress,
  leftAction,
  rightAction,
  rightActions,
  style
}: {
  centerContent?: ReactNode;
  centerLabel?: string;
  onCenterPress?: () => void;
  leftAction?: ScreenHeaderAction;
  rightAction?: ScreenHeaderAction;
  rightActions?: ScreenHeaderAction[];
  style?: StyleProp<ViewStyle>;
}) {
  const resolvedRightActions = rightActions ?? (rightAction ? [rightAction] : []);
  const sideWidth =
    resolvedRightActions.length > 0
      ? resolvedRightActions.length * HEADER_BUTTON_SIZE + (resolvedRightActions.length - 1) * spacing.md
      : HEADER_BUTTON_SIZE;

  return (
    <View style={[styles.header, style]}>
      {leftAction ? (
        <View style={[styles.sideSlot, { width: sideWidth }]}>
          <IconButton
            icon={leftAction.icon}
            label={leftAction.label}
            onPress={leftAction.onPress}
            iconWeight={leftAction.iconWeight ?? "bulk"}
            iconSize={leftAction.iconSize ?? HEADER_VISUAL_ICON_SIZES[leftAction.icon] ?? HEADER_ICON_SIZE}
            iconColor={leftAction.iconColor}
            buttonSize={HEADER_BUTTON_SIZE}
            iconStyle={HEADER_ICON_OFFSETS[leftAction.icon]}
          />
        </View>
      ) : (
        <View style={[styles.placeholder, { width: sideWidth }]} />
      )}
      {onCenterPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={centerLabel}
          onPress={onCenterPress}
          style={({ pressed }) => [styles.centerContent, { opacity: pressed ? 0.7 : 1 }]}
        >
          {centerContent}
        </Pressable>
      ) : (
        <View pointerEvents="none" style={styles.centerContent}>
          {centerContent}
        </View>
      )}
      {resolvedRightActions.length ? (
        <View style={[styles.sideSlot, styles.rightSlot, { width: sideWidth }]}>
          {resolvedRightActions.map((action) => (
            <IconButton
              key={action.label}
              icon={action.icon}
              label={action.label}
              onPress={action.onPress}
              iconWeight={action.iconWeight ?? "bulk"}
              iconSize={action.iconSize ?? HEADER_VISUAL_ICON_SIZES[action.icon] ?? HEADER_ICON_SIZE}
              iconColor={action.iconColor}
              buttonSize={HEADER_BUTTON_SIZE}
              iconStyle={action.iconStyle ?? HEADER_ICON_OFFSETS[action.icon]}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.placeholder, { width: sideWidth }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: HEADER_BUTTON_SIZE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  sideSlot: {
    height: HEADER_BUTTON_SIZE
  },
  rightSlot: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md
  },
  centerContent: {
    flex: 1,
    minHeight: HEADER_BUTTON_SIZE,
    alignItems: "center",
    justifyContent: "center"
  },
  placeholder: {
    width: HEADER_BUTTON_SIZE,
    height: HEADER_BUTTON_SIZE
  }
});
