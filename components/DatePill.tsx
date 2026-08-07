import React from "react";
import { Modal, StyleSheet, View } from "react-native";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { parseDateKey, toDateKey } from "@/lib/date";
import { Icon } from "./Icon";
import { Pressable } from "./Pressable";
import { AppText } from "./ui";
import { WheelDatePicker } from "./WheelDatePicker";

/** "Sun, Aug 3" — the compact form the pill wears. */
function formatPillDate(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * The home screen's day selector: a pill carrying the selected date, which
 * opens the same wheel sheet the journal editor uses.
 *
 * Only the past is reachable (`max` defaults to today) — a day you have not
 * lived yet has nothing to check off.
 */
export function DatePill({
  value,
  onChange,
  max = toDateKey()
}: {
  value: string;
  onChange: (dateKey: string) => void;
  max?: string;
}) {
  const { palette, isDark } = useLumo();
  const [picking, setPicking] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const todayKey = toDateKey();

  function open() {
    setDraft(value);
    setPicking(true);
  }

  function confirm(dateKey: string) {
    onChange(dateKey);
    setPicking(false);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: picking }}
        accessibilityLabel={`Selected day: ${formatPillDate(value)}. Tap to change.`}
        onPress={open}
        style={({ pressed }) => [
          styles.pill,
          {
            // Semi-transparent: the pill sits on the home backdrop's sky, and
            // a solid fill up there reads as a chip pasted over the artwork.
            // The header buttons either side of it carry the same alpha.
            backgroundColor: alpha(palette.card, "A6"),
            borderColor: palette.hairline,
            shadowColor: isDark ? "transparent" : palette.shadow,
            opacity: pressed ? 0.82 : 1
          }
        ]}
      >
        <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.pillLabel}>
          {formatPillDate(value)}
        </AppText>
        <Icon name="chevronDown" size={12} color={palette.subtle} weight="bold" />
      </Pressable>

      {picking ? (
        <Modal transparent animationType="none" visible onRequestClose={() => setPicking(false)}>
          <View style={styles.backdrop}>
            <Pressable accessibilityLabel="Close day picker" style={StyleSheet.absoluteFill} onPress={() => setPicking(false)} />
            <View style={[styles.sheet, { backgroundColor: palette.card }]}>
              <AppText color={palette.ink} style={styles.sheetTitle}>
                Jump to a day
              </AppText>
              <WheelDatePicker value={draft} onChange={setDraft} max={max} />
              <View style={styles.sheetActions}>
                {/* "Today" is the destination people want most often, so it is
                    one tap rather than three wheels' worth of spinning. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Jump to today"
                  onPress={() => confirm(todayKey)}
                  style={({ pressed }) => [
                    styles.sheetButton,
                    styles.sheetButtonGhost,
                    { borderColor: palette.hairline, opacity: pressed ? 0.7 : 1 }
                  ]}
                >
                  <AppText variant="button" color={palette.ink}>
                    Today
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                  onPress={() => confirm(draft)}
                  style={({ pressed }) => [styles.sheetButton, { backgroundColor: palette.green, opacity: pressed ? 0.88 : 1 }]}
                >
                  <AppText variant="button" color={palette.white}>
                    Done
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // `alignSelf: center` so the pill hugs its label instead of stretching to
  // fill the header slot it sits in — it is a control, not a bar. It sits a
  // step in from the 38pt header buttons on either side: the date is a label
  // you can change, not a third button competing with them.
  pill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  pillLabel: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 13,
    lineHeight: 17
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    backgroundColor: "rgba(0, 0, 0, 0.35)"
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 40,
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing.xl
  },
  sheetTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
    marginBottom: spacing.md
  },
  sheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  sheetButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  sheetButtonGhost: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth
  }
});
