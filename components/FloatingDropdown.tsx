import React from "react";
import { Dimensions, Modal, ScrollView, StyleSheet, View } from "react-native"
import { control, fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { AppText, controlBorderColor, fieldShadow } from "./ui";
import { Icon } from "./Icon";
import { Pressable } from "@/components/Pressable"

export type FloatingDropdownOption<T extends string> = {
  label: string;
  value: T;
};

type TriggerRect = { x: number; y: number; width: number; height: number };

const MENU_GAP = 6;
// Min space (px) needed below the trigger before the menu flips above it.
const MENU_MAX_SPACE = 300;

/**
 * Inline, anchored floating menu. Self-contained: it owns its open state and
 * positions the menu just below the trigger. The overlay (backdrop + menu) is
 * rendered inside a transparent Modal so a tap anywhere outside the menu closes
 * it — an inline backdrop can't receive taps that land outside its parent's
 * bounds. Two trigger styles: a compact right-aligned "pill" and a full-width
 * "input" for forms.
 */
export function FloatingDropdown<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  placeholder = "Select option",
  variant = "pill",
  menuWidth = 200,
  borderColor,
  borderWidth,
  disabled = false
}: {
  options: FloatingDropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  placeholder?: string;
  variant?: "pill" | "input";
  menuWidth?: number;
  // Customize the input-variant bottom border. `borderColor` overrides the
  // resting (closed) color; the focused/open state still uses greenDark.
  borderColor?: string;
  borderWidth?: number;
  // Locked: shows the active value but can't be opened.
  disabled?: boolean;
}) {
  const { palette, isDark } = useLumo();
  const [isOpen, setIsOpen] = React.useState(false);
  const [triggerRect, setTriggerRect] = React.useState<TriggerRect | null>(null);
  const triggerRef = React.useRef<View>(null);
  const activeOption = options.find((option) => option.value === value);
  const isInput = variant === "input";
  const triggerBorderColor = controlBorderColor(palette, isDark, isOpen);
  // No resting edge on the input variant — the open state supplies it.
  const inputBorderColor = borderColor ?? "transparent";

  const open = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setTriggerRect({ x, y, width, height });
      setIsOpen(true);
    });
  };
  const close = () => setIsOpen(false);

  const windowHeight = Dimensions.get("window").height;
  const resolvedMenuWidth = isInput ? triggerRect?.width ?? 0 : menuWidth;
  const menuLeft = triggerRect
    ? isInput
      ? triggerRect.x
      : triggerRect.x + triggerRect.width - resolvedMenuWidth
    : 0;
  // Flip the menu above the trigger when there isn't enough room below it.
  const openUp = !!triggerRect && windowHeight - (triggerRect.y + triggerRect.height) < MENU_MAX_SPACE;
  const menuVerticalStyle = triggerRect
    ? openUp
      ? { bottom: windowHeight - triggerRect.y + MENU_GAP }
      : { top: triggerRect.y + triggerRect.height + MENU_GAP }
    : null;

  return (
    <View
      ref={triggerRef}
      collapsable={false}
      style={[styles.root, isInput ? styles.rootInput : styles.rootPill]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen, disabled }}
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={() => (isOpen ? close() : open())}
        style={({ pressed }) => [
          isInput ? styles.inputTrigger : styles.pillTrigger,
          {
            backgroundColor: isInput ? palette.card : palette.surface,
            shadowColor: palette.shadow,
            borderColor: isInput ? (isOpen ? palette.hairlineStrong : inputBorderColor) : triggerBorderColor,
            opacity: disabled ? 0.55 : pressed ? 0.76 : 1
          }
        ]}
      >
        {isInput ? (
          <View style={styles.inputTriggerContent}>
            <AppText variant="titleSmall" color={activeOption ? palette.ink : `${palette.body}99`} numberOfLines={1} style={styles.inputTriggerText}>
              {activeOption?.label ?? placeholder}
            </AppText>
            <Icon name="chevronDown" size={18} color={palette.greenDark} weight="bulk" />
          </View>
        ) : (
          <AppText variant="caption" color={palette.greenDark} numberOfLines={1} style={styles.pillTriggerText}>
            {activeOption?.label ?? placeholder}
          </AppText>
        )}
      </Pressable>

      <Modal visible={isOpen} transparent animationType="none" onRequestClose={close}>
        <Pressable accessibilityLabel="Close menu" style={styles.backdrop} onPress={close} />
        {triggerRect ? (
          <View
            style={[
              styles.menu,
              menuVerticalStyle,
              { left: menuLeft, width: resolvedMenuWidth },
              // Dark theme: a big black shadow lifts the menu off the equally
              // dark canvas (the light theme's soft tinted shadow vanishes).
              isDark
                ? { backgroundColor: palette.card, shadowColor: "#000000", shadowOpacity: 0.55, shadowRadius: 36 }
                : { backgroundColor: palette.card, shadowColor: palette.shadow }
            ]}
          >
            <ScrollView style={styles.menuScroll} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {options.map((option) => {
                const selected = option.value === value;

                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onChange(option.value);
                      close();
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor: selected ? `${palette.greenDark}14` : "transparent",
                        borderColor: selected ? `${palette.greenDark}33` : "transparent",
                        opacity: pressed ? 0.76 : 1
                      }
                    ]}
                  >
                    <View style={styles.optionContent}>
                      <AppText variant="bodySmall" color={selected ? palette.greenDark : palette.body} numberOfLines={1} style={styles.optionText}>
                        {option.label}
                      </AppText>
                      <View style={styles.checkSlot}>
                        {selected ? <Icon name="checkCircle" size={18} color={palette.greenDark} weight="bulk" /> : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative"
  },
  rootInput: {
    alignSelf: "stretch"
  },
  rootPill: {
    flexShrink: 0
  },
  // Compact by design: the pill variant only ever sits as the trailing control
  // of a settings row, so it is sized against that row's caption text rather
  // than against a form field. (The forms use the `input` variant below.)
  pillTrigger: {
    minWidth: 84,
    minHeight: 28,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    borderRadius: radius.pill,
    borderWidth: control.borderWidth,
    paddingHorizontal: spacing.xs
  },
  pillTriggerText: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 12,
    lineHeight: 16
  },
  // Same box as LumoInput so the dropdown reads as a field.
  inputTrigger: {
    width: "100%",
    alignSelf: "stretch",
    justifyContent: "center",
    minHeight: control.height,
    borderWidth: control.borderWidth,
    borderRadius: control.radius,
    paddingHorizontal: spacing.md,
    ...fieldShadow
  },
  inputTriggerContent: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  // Semibold, matching the input this trigger is shaped like — and the pill
  // trigger and menu rows above/below it. Bold made a select read heavier than
  // the text field sitting next to it in the same form.
  inputTriggerText: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 16,
    lineHeight: 22
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject
  },
  menu: {
    position: "absolute",
    borderRadius: radius.card,
    borderWidth: 0,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 16
  },
  menuScroll: {
    maxHeight: 264
  },
  option: {
    minHeight: 44,
    width: "100%",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  optionContent: {
    width: "100%",
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  optionText: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    lineHeight: 18
  },
  checkSlot: {
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center"
  }
});
