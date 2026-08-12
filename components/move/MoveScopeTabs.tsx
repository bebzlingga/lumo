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

/**
 * The labels and the values are deliberately different words.
 *
 * The values are what the code reasons about — one tab is today, the other is
 * everything. The labels are what the tabs are FOR: the first is where a walk
 * starts, the second is where the figures live. "Today" also collided with the
 * app's own Today tab one bar down, which made the same word mean two places.
 */
const OPTIONS: { value: MoveScope; label: string }[] = [
  { value: "today", label: "Move" },
  { value: "overall", label: "Stats" }
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
              style={[styles.label, selected ? styles.labelActive : null]}
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
    /**
     * The surround the raised segment sits in, rather than being flush against
     * the track's border.
     *
     * 4, not the 2 this started on: at 2 the white segment read as touching the
     * hairline and the whole control looked crowded. This is the most it can
     * take — 4 either side of a 30pt segment brings the track to exactly the
     * 38pt button line beside it, which is what `segment`'s own note is about.
     */
    padding: spacing.xxs,
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
    // 30 plus the track's own 4pt surround puts the control on the page bar's
    // 38pt button line — level with the circles either side of it, and no
    // taller, so the bar's height is still set by those buttons. Under the 44pt
    // tap-target guidance on its own, which is why the header gives the row
    // `hitSlop` — see the note at the call site.
    minHeight: 30,
    minWidth: 74,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill
  },
  // A shade over the caption's 12: two short words in a wide track read small,
  // and this pair names where you are in the whole section.
  label: {
    fontSize: 13,
    lineHeight: 17
  },
  labelActive: {
    fontFamily: fontFamilies.lexendSemiBold
  }
});
