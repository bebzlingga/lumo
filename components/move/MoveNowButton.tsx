import React from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Icon } from "@/components/Icon";
import { useMoveAccent } from "@/components/move/ChallengeUI";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";

/**
 * The Move tab's one action. Centred and sized to its label rather than stretched
 * — it is the thing to do on the screen, and a full-width bar reads as a form's
 * submit. While a walk is recording it becomes the way back to that walk, since
 * only one can run at a time.
 */
export function MoveNowButton({
  label,
  accessibilityLabel,
  onPress,
  style
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useLumo();
  const accent = useMoveAccent();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: accent.primary, opacity: pressed ? 0.85 : 1 }, style]}
    >
      <Icon name="walk" size={16} color={palette.onGreen} weight="bulk" />
      <AppText variant="button" color={palette.onGreen} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill
  }
});
