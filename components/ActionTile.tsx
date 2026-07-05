import React, { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, ViewStyle } from "react-native";
import { radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { Icon, IconName } from "./Icon";
import { AppText } from "./ui";

export function ActionTile({
  label,
  icon,
  color,
  backgroundColor,
  onPress,
  style
}: {
  label: ReactNode;
  icon: IconName;
  color?: string;
  backgroundColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette, isDark } = useLumo();
  const iconColor = color ?? palette.greenDark;

  return (
    <Pressable
      style={[
        styles.tile,
        // A subtle shadow vanishes on the dark canvas, so deepen it in dark mode.
        { backgroundColor: backgroundColor ?? palette.card, shadowColor: palette.shadow, shadowOpacity: isDark ? 0.32 : 0.09 },
        style
      ]}
      onPress={onPress}
    >
      <Icon name={icon} size={18} color={iconColor} weight="bulk" />
      <AppText variant="caption" color={color ?? palette.greenDark} numberOfLines={1} style={styles.label}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 52,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 4
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: "center"
  }
});
