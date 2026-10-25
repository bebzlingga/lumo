import React from "react";
import { StyleSheet, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { fontFamilies, onArtChrome, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";

/**
 * The two-way switch that lives IN a page bar's centre slot — the Move screen's
 * Move/Stats pill, generalised so any page can wear it.
 *
 * ## Why it wears the date pill's clothes
 *
 * Same shape, same semi-transparent fill, same hairline and soft shadow as
 * `DatePill` on Home. Both sit ON the backdrop artwork rather than on flat
 * canvas, and both are the one control at the top of a screen that changes what
 * everything below them shows. A solid fill up there reads as a chip pasted over
 * the scene, which is why the alpha is copied rather than approximated — the two
 * are doing the same job and should look like it.
 *
 * Sized to live inside the bar's centre slot, so it has to clear the 38pt
 * buttons either side of it rather than stand on its own. That is what fixes the
 * track height at 30 and the labels at `caption`.
 *
 * Extracted from `MoveScopeTabs` when the Friends page needed the same control
 * for Groups/Friends: two hand-matched copies of a pill this fiddly would drift
 * the first time one of them was tuned.
 */
const TRACK_PADDING = spacing.xxs;
/**
 * 30 plus the track's own 4pt surround puts the control on the page bar's 38pt
 * button line — level with the circles either side of it, and no taller, so the
 * bar's height is still set by those buttons. Under the 44pt tap-target
 * guidance on its own, which is why callers pass `hitSlop`.
 */
const SEGMENT_HEIGHT = 30;

export type HeaderTabOption<T extends string> = {
  value: T;
  label: string;
};

export function HeaderTabs<T extends string>({
  options,
  value,
  onChange,
  /** Makes up the difference to a 44pt tap target, since the track is shrunk. */
  hitSlop,
  /** A floor per segment, for labels short enough to collapse the pill. */
  minSegmentWidth = 74
}: {
  options: HeaderTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  hitSlop?: number;
  minSegmentWidth?: number;
}) {
  const { palette, isDark } = useLumo();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.track,
        {
          backgroundColor: alpha(palette.card, onArtChrome.fill),
          borderColor: palette.hairline,
          shadowColor: isDark ? "transparent" : palette.shadow
        }
      ]}
    >
      {options.map((option) => {
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
              { minWidth: minSegmentWidth },
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
    // The surround the raised segment sits in, rather than being flush against
    // the track's border. This is the most it can take — see SEGMENT_HEIGHT.
    padding: TRACK_PADDING,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    // The same surface the date pill and the header buttons wear — see
    // `onArtChrome`. Shared rather than copied: these sit in the same bar.
    ...onArtChrome.shadow
  },
  segment: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: SEGMENT_HEIGHT,
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
