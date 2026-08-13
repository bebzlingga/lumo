import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";

/**
 * A list of choices inside one card — glyph, title, subtitle, and a control on
 * the right.
 *
 * The shape the Move creation flow is built from. A row list beats the strip of
 * equal-width chips it replaced for one reason: every option gets a SUBTITLE.
 * "Steps" alone does not say whether it means today or this week, and a chip
 * has nowhere to put that.
 *
 * Rows are separated by a rule and the last one goes without, so the card never
 * ends on a line.
 */

export function MoveOptionGroup({
  children,
  style,
  /**
   * Already inside a card — a dialog sheet, say. Drops the plate and the shadow
   * so the rows sit directly on their host instead of stacking one card inside
   * another. Pair with `flush` on the rows to drop their inset too.
   */
  flush = false
}: {
  children: React.ReactNode;
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette, isDark } = useLumo();

  if (flush) {
    return <View style={style}>{children}</View>;
  }

  return (
    // Two views on purpose: iOS drops the shadow of any view that sets
    // `overflow: hidden`, and the clipping is what keeps the first and last
    // rows inside the rounded corner. The shadow lives on the outer one.
    <View style={[styles.groupShadow, { shadowColor: isDark ? "transparent" : palette.shadow }]}>
      {/* Shadow only. The hairline that used to sit on top of it drew a second
          edge inside the shadow's own, which read as a card with a line around
          it rather than as one raised surface — and every other card in Move is
          told apart by its shadow alone. */}
      <View style={[styles.group, { backgroundColor: palette.card }, style]}>{children}</View>
    </View>
  );
}

export function MoveOptionRow({
  icon,
  leading,
  flush = false,
  title,
  subtitle,
  selected,
  onPress,
  /** Drawn on the right instead of the radio — a badge, an avatar, a value. */
  trailing,
  last = false,
  /**
   * Unavailable, and dimmed to say so.
   *
   * Kept in the list rather than filtered out: a friend who vanishes from the
   * invite list looks like a bug, and the subtitle can explain why they cannot
   * be picked. Non-interactive, so the explanation is the only outcome of
   * reaching for them.
   */
  disabled = false
}: {
  icon?: IconName;
  /** Drawn on the left instead of the glyph — an avatar, a badge. */
  leading?: React.ReactNode;
  /** Inside a card that already has its own inset — see `MoveOptionGroup`. */
  flush?: boolean;
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  trailing?: React.ReactNode;
  last?: boolean;
  disabled?: boolean;
}) {
  const { palette } = useLumo();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        flush ? styles.rowFlush : null,
        disabled ? styles.rowDisabled : null,
        last ? null : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline },
        { opacity: pressed && !selected ? 0.7 : 1 }
      ]}
    >
      {/* 20, not 22. The glyph is a label's mark here, not the row's subject — the
          title and its subtitle are — and at 22 it sat level with the 20pt radio at
          the other end, which made the row read as two controls with words between
          them. `bulk`'s duotone strokes also carry a size heavier than a bold glyph
          of the same number. */}
      {leading ?? (icon ? <Icon name={icon} size={20} color={selected ? palette.greenDark : palette.subtle} weight="bulk" /> : null)}

      <View style={styles.text}>
        <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
        {subtitle ? (
          // Regular against `caption`'s semibold. At the same weight as the
          // title above it the row reads as two headings rather than a label
          // and its explanation — and a column of them turns into noise.
          <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {trailing ?? (
        // A filled tick when chosen, an empty ring when not — the state is a
        // SHAPE as well as a colour, so it survives being read without one.
        <View
          style={[
            styles.radio,
            selected
              ? { backgroundColor: palette.greenDark, borderColor: palette.greenDark }
              : { borderColor: palette.hairline }
          ]}
        >
          {selected ? <Icon name="check" size={11} color={palette.white} weight="bold" /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groupShadow: {
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  group: {
    borderRadius: radius.card,
    overflow: "hidden"
  },
  // Dimmed rather than hidden. Colour is not the only cue — the row is also
  // inert and its subtitle says why (§48).
  rowDisabled: {
    opacity: 0.45
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    // Well past the 44pt tap target — these are the screen's main controls.
    minHeight: 62,
    paddingHorizontal: spacing.md
  },
  rowFlush: {
    paddingHorizontal: 0
  },
  text: {
    flex: 1,
    gap: 2
  },
  title: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  subtitle: {
    fontFamily: fontFamilies.lexend
  },
  radio: {
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2
  }
});
