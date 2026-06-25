import React from "react";
import { TextStyle } from "react-native";
import { AppText } from "./ui";
import { Icon, isIconName } from "./Icon";

export function HabitIcon({
  value,
  color,
  size = 22,
  textStyle
}: {
  value: string;
  color: string;
  size?: number;
  textStyle?: TextStyle;
}) {
  if (isIconName(value)) {
    return <Icon name={value} size={size} color={color} weight="bulk" />;
  }

  return (
    <AppText variant="titleSmall" color={color} style={[{ fontSize: size, lineHeight: size + 4 }, textStyle]}>
      {value}
    </AppText>
  );
}
