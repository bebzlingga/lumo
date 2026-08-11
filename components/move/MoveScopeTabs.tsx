import React from "react";
import { StyleSheet, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";

/**
 * The Move screen's two views: what today looks like, and where it all adds up.
 *
 * ## Why it wears the date pill's clothes
 *
 * Same shape, same semi-transparent fill, same hairline and soft shadow as
 * `DatePill` on Home. Both sit ON the backdrop artwork rather than on flat
 * canvas, and both are the one control at the top of a screen that changes what
 * everything below them shows. A solid fill up there reads as a chip pasted
 * over the scene, which is why the alpha is copied rather than approximated —
 * the two are doing the same job and should look like it.
 *
 * Sized to live INSIDE the page bar's centre slot, so it has to clear the
 * 38pt buttons either side of it rather than stand on its own. That is what
 * fixes the track height at 30 and the labels at `caption`.
 *
 * The RAISED-segment treatment inside comes from `SegmentedControl`, so the
 * selection reads the way selection reads everywhere else in Lumo.
 */
export type MoveScope = "today" | "overall";

const OPTIONS: { value: MoveScope; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "overall", label: "Overall" }
];

export function MoveScopeTabs({
  value,
  onChange,
  /** Makes up the difference to a 44pt tap target when the track is shrunk. */
  hitSlop
}: {
  value: MoveScope;
  onChange: (scope: MoveScope) => void;
  hitSlop?: number;
}) {
  const { palette, isDark } = useLumo();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.track,
        {
          backgroundColor: alpha(palette.card, "A6"),
          borderColor: palette.hairline,
          shadowColor: isDark ? "transparent" : palette.shadow
        }
      ]}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            hitSlop={hitSlop}
            style={({ pressed }) => [
              styles.segment,
              // The selected segment goes fully opaque against the track's
              // alpha — that contrast is what makes it read as raised without
              // needing a second shadow inside a shadow.
              selected ? { backgroundColor: palette.card } : null,
              { opacity: pressed && !selected ? 0.7 : 1 }
            ]}
          >
            <AppText
              variant="caption"
              color={selected ? palette.ink : palette.subtle}
              numberOfLines={1}
              style={selected ? styles.labelActive : undefined}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    alignSelf: "center",
    flexDirection: "row",
    // A hair of padding so the raised segment sits inside the track rather than
    // flush against its border.
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  segment: {
    alignItems: "center",
    justifyContent: "center",
    // 30 keeps the whole track inside the page bar's 38pt button line. Under
    // the 44pt tap-target guidance on its own, which is why the header gives
    // the row `hitSlop` — see the note at the call site.
    minHeight: 30,
    minWidth: 74,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill
  },
  labelActive: {
    fontFamily: fontFamilies.lexendSemiBold
  }
});
