import React, { useMemo } from "react";
import { View, ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import { AvatarConfig, buildAvatarSvg } from "@/lib/avatar";

// Renders a DiceBear avataaars portrait from a config. `svg` can be passed
// directly to skip regeneration (e.g. for many thumbnails sharing work).
export function Avatar({
  config,
  svg,
  size = 96,
  backgroundColor,
  rounded = true,
  style
}: {
  config?: AvatarConfig;
  svg?: string;
  size?: number;
  backgroundColor?: string;
  rounded?: boolean;
  style?: ViewStyle;
}) {
  const xml = useMemo(() => svg ?? (config ? buildAvatarSvg(config) : ""), [svg, config]);

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: rounded ? size / 2 : 0,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor
        },
        style
      ]}
    >
      {xml ? <SvgXml xml={xml} width={size} height={size} /> : null}
    </View>
  );
}
