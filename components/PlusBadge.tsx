import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui";
import { brand, fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";

/**
 * The mark on anything that needs the monthly subscription.
 *
 * ## THE TWO PRODUCTS, AND WHAT THEY ARE CALLED
 *
 * Lumo sells two things, and they are not a ladder (see `lib/iap.ts`):
 *
 *  - **Plus** — ₱49/month, auto-renewing. Buys the shared side of the app:
 *    friends, groups, and the social half of Move.
 *  - **Pro** — ₱149 once. Lifts the habit and journal limits, forever.
 *
 * The code underneath predates those names: the persisted flag for Plus is
 * `settings.isPro` and the one for Pro is `settings.isUnlimited`, and the
 * database column behind the Move gate is `move_challenges.is_pro`. Those names
 * are load-bearing — one is a stored key on every device, the other a column in
 * a live table — so `LumoContext` exposes `isPlus` as the reading name and the
 * old ones stay put. New code should say `isPlus`, and every screen should say
 * "Plus" to the reader.
 *
 * Small, uppercase, and in the accent rather than the app green: it is a price
 * tag on a feature, not a state of it, and it has to read as such next to the
 * green ticks that mean "done".
 */
export function PlusBadge({ label = "PLUS" }: { label?: string }) {
  const { palette, isDark } = useLumo();

  return (
    <View style={[styles.badge, { backgroundColor: alpha(palette.accent, isDark ? "2E" : "24") }]}>
      {/* `goldInk` in light mode, not the accent itself: the gold clears 3:1 for
          a shape but not 4.5:1 for 10pt type on its own tint. */}
      <AppText variant="caption" color={isDark ? palette.accent : brand.goldInk} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3
  },
  label: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.8
  }
});
