import React from "react";
import { TextStyle } from "react-native";
import { AppText } from "./ui";
import { Icon, isIconName, type IconWeight } from "./Icon";

export function HabitIcon({
  value,
  color,
  size = 22,
  weight = "bulk",
  textStyle
}: {
  value: string;
  color: string;
  size?: number;
  /** Defaults to the duotone glyph the cards and lists use; screens showing the
   *  icon large can ask for a solid one instead. */
  weight?: IconWeight;
  textStyle?: TextStyle;
}) {
  if (isIconName(value)) {
    return <Icon name={value} size={size} color={color} weight={weight} />;
  }

  return (
    <AppText variant="titleSmall" color={color} style={[{ fontSize: size, lineHeight: size + 4 }, textStyle]}>
      {value}
    </AppText>
  );
}
