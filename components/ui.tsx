import React, { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { fontFamilies, radius, spacing, type } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { Icon, IconName, IconWeight } from "./Icon";

type TextVariant = keyof typeof type;
type ChipOption = {
  label: string;
  value: string;
};

function alpha(color: string, value: string) {
  return color.startsWith("#") && color.length === 7 ? `${color}${value}` : color;
}

export function Screen({
  children,
  scroll = true,
  contentStyle,
  edges = ["top", "left", "right"]
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
}) {
  const { palette, isDark } = useLumo();

  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, { backgroundColor: palette.canvas }]}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.screenContent, contentStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screenContent, styles.flex, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function AppText({
  children,
  variant = "body",
  color,
  style,
  className,
  numberOfLines
}: {
  children: ReactNode;
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  className?: string;
  numberOfLines?: number;
}) {
  const { palette, isDark } = useLumo();

  return (
    <Text className={className} numberOfLines={numberOfLines} style={[type[variant], { color: color ?? palette.ink }, style]}>
      {children}
    </Text>
  );
}

export function Card({
  children,
  className,
  style,
  tone = "card"
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  tone?: "card" | "surface" | "glow" | "dark";
}) {
  const { palette, isDark } = useLumo();
  const backgroundColor =
    tone === "surface" ? palette.surface : tone === "glow" ? palette.glowSoft : tone === "dark" ? palette.surfaceStrong : palette.card;

  return (
    <View
      className={className}
      style={[
        styles.card,
        {
          backgroundColor,
          shadowColor: isDark ? "transparent" : palette.shadow
        },
        style
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  delayLongPress,
  icon,
  iconWeight = "bold",
  accessibilityLabel,
  className,
  variant = "primary",
  shape = "default",
  disabled = false,
  style
}: {
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  delayLongPress?: number;
  icon?: IconName;
  iconWeight?: IconWeight;
  accessibilityLabel?: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "glow" | "accent";
  shape?: "default" | "pill";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useLumo();
  const customStyle = StyleSheet.flatten(style);
  const classNameControlsSize = /\b(?:h-|min-h-|p-|px-|py-|rounded)/.test(className ?? "");
  const backgroundColor =
    variant === "primary"
      ? palette.green
      : variant === "secondary"
        ? palette.surface
        : variant === "danger"
          ? palette.danger
          : variant === "glow"
            ? palette.glow
            : variant === "accent"
              ? palette.accent
            : "transparent";
  const borderColor =
    variant === "ghost"
      ? "transparent"
      : variant === "glow"
        ? palette.chartPartial
        : variant === "accent"
          ? palette.accentBorder
          : palette.hairline;
  const surfaceBackgroundColor = customStyle?.backgroundColor ?? backgroundColor;
  const surfaceBorderColor = customStyle?.borderColor ?? borderColor;
  const surfaceBorderRadius = customStyle?.borderRadius ?? (shape === "pill" ? radius.pill : radius.md);
  const surfaceBorderWidth = customStyle?.borderWidth ?? StyleSheet.hairlineWidth;
  const color =
    variant === "primary" || variant === "danger"
      ? palette.white
      : variant === "glow" || variant === "accent"
        ? palette.onAccent
        : palette.ink;

  return (
    <Pressable
      className={className}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      delayLongPress={delayLongPress}
      onLongPress={onLongPress}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.buttonBase,
        !classNameControlsSize && styles.buttonDefaultSize,
        !classNameControlsSize && shape === "pill" && styles.buttonPill,
        {
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1
        },
        style
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.buttonSurface,
          {
            backgroundColor: surfaceBackgroundColor,
            borderColor: surfaceBorderColor,
            borderRadius: surfaceBorderRadius,
            borderWidth: surfaceBorderWidth
          }
        ]}
      />
      {icon ? <Icon name={icon} size={17} color={color} weight={iconWeight} /> : null}
      {label ? (
        <AppText variant="button" color={color} style={styles.buttonText}>
          {label}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  iconSize = 18,
  buttonSize,
  iconWeight = "regular",
  iconStyle,
  style
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  iconSize?: number;
  buttonSize?: number;
  iconWeight?: IconWeight;
  iconStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useLumo();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        buttonSize ? { width: buttonSize, height: buttonSize } : null,
        {
          backgroundColor: palette.card,
          borderColor: palette.hairline,
          opacity: pressed ? 0.75 : 1
        },
        style
      ]}
    >
      <View pointerEvents="none" style={iconStyle}>
        <Icon name={icon} size={iconSize} color={palette.ink} weight={iconWeight} />
      </View>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  const { palette } = useLumo();

  return (
    <AppText variant="caption" color={palette.subtle} style={styles.label}>
      {children}
    </AppText>
  );
}

export function Field({
  children,
  orientation = "vertical",
  style
}: {
  children: ReactNode;
  orientation?: "vertical" | "horizontal";
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[orientation === "horizontal" ? styles.fieldHorizontal : styles.field, style]}>{children}</View>;
}

export function FieldContent({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.fieldContent, style]}>{children}</View>;
}

export function FieldDescription({ children }: { children: ReactNode }) {
  const { palette } = useLumo();

  return (
    <AppText variant="bodySmall" color={palette.subtle} style={styles.fieldDescription}>
      {children}
    </AppText>
  );
}

export function LumoInput(props: TextInputProps) {
  const { palette, isDark } = useLumo();

  return (
    <TextInput
      placeholderTextColor={`${palette.body}B3`}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: palette.surface,
          borderColor: isDark ? alpha(palette.greenDark, "73") : palette.hairline,
          color: palette.ink
        },
        props.style
      ]}
    />
  );
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select option",
  accessibilityLabel
}: {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
}) {
  const { palette, isDark } = useLumo();
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedOption = options.find((option) => option.value === value);
  const inputBorderColor = isDark ? alpha(palette.greenDark, "73") : palette.hairline;

  return (
    <View style={[styles.selectRoot, isOpen ? styles.selectRootOpen : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen((current) => !current)}
        style={({ pressed }) => [
          styles.selectTrigger,
          {
            backgroundColor: palette.surface,
            borderColor: isOpen ? palette.greenDark : inputBorderColor,
            opacity: pressed ? 0.78 : 1
          }
        ]}
      >
        <View style={styles.selectTriggerContent}>
          <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.selectTriggerText}>
            {selectedOption?.label ?? placeholder}
          </AppText>
          <Icon name="chevronDown" size={18} color={palette.greenDark} weight="bulk" />
        </View>
      </Pressable>

      {isOpen ? (
        <View
          style={[
            styles.selectMenu,
            {
              backgroundColor: palette.card,
              borderColor: isDark ? alpha(palette.greenDark, "2E") : alpha(palette.hairline, "D9"),
              shadowColor: isDark ? "transparent" : palette.shadow
            }
          ]}
        >
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                style={({ pressed }) => [
                  styles.selectOption,
                  {
                    backgroundColor: pressed ? palette.surface : "transparent",
                    opacity: pressed ? 0.78 : 1
                  }
                ]}
              >
                <AppText variant="titleSmall" color={isSelected ? palette.greenDark : palette.ink} numberOfLines={1} style={styles.selectOptionText}>
                  {option.label}
                </AppText>
                {isSelected ? (
                  <View style={[styles.selectCheck, { backgroundColor: palette.greenSoft }]}>
                    <Icon name="check" size={14} color={palette.greenDark} weight="bold" />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function Pill({
  label,
  selected,
  onPress
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { palette } = useLumo();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: selected ? palette.greenSoft : palette.card,
          borderColor: selected ? palette.greenDark : palette.hairline,
          opacity: pressed ? 0.75 : 1
        }
      ]}
    >
      <AppText variant="caption" color={selected ? palette.greenDark : palette.body}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChoiceChip({
  label,
  selected,
  onPress,
  className,
  style
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useLumo();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={className ?? "min-h-[40px] items-center justify-center rounded-[22px] px-4"}
      style={({ pressed }) => [
        {
          backgroundColor: selected ? palette.greenSoft : palette.surface,
          borderColor: selected ? palette.green : palette.hairline,
          borderWidth: StyleSheet.hairlineWidth,
          opacity: pressed ? 0.75 : 1
        },
        style
      ]}
    >
      <AppText variant="caption" color={selected ? palette.greenDark : palette.body} numberOfLines={2} style={styles.choiceChipText}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChipGroup({
  options,
  value,
  onChange,
  layout = "wrap"
}: {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  layout?: "wrap" | "grid";
}) {
  const isGrid = layout === "grid";

  return (
    <View className={isGrid ? undefined : "flex-row flex-wrap gap-3"} style={isGrid ? styles.chipGrid : undefined}>
      {options.map((option, index) => (
        <ChoiceChip
          key={option.value}
          label={option.label}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
          className={isGrid ? "min-h-[46px] items-center justify-center rounded-[22px] px-3" : undefined}
          style={isGrid ? [styles.chipGridItem, options.length % 2 === 1 && index === options.length - 1 ? styles.chipGridItemFull : null] : undefined}
        />
      ))}
    </View>
  );
}

export function StatTile({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  const { palette, isDark } = useLumo();
  const percentValue = value.endsWith("%") && value.length > 1 ? value.slice(0, -1) : null;

  return (
    <View style={[styles.statTile, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      <View style={styles.statIconWrap}>
        <Icon name={icon} size={22} color={palette.green} weight="bulk" />
      </View>
      <AppText variant="titleSmall" numberOfLines={1} style={styles.statValue}>
        {percentValue ? (
          <>
            {percentValue}
            <Text style={styles.statPercentSymbol}>%</Text>
          </>
        ) : (
          value
        )}
      </AppText>
      <AppText variant="bodySmall" color={palette.subtle} numberOfLines={2} style={styles.statLabel}>
        {label}
      </AppText>
    </View>
  );
}

export function LoadingState() {
  const { palette } = useLumo();

  return (
    <Screen scroll={false} contentStyle={styles.centered}>
      <ActivityIndicator color={palette.green} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  screenContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md
  },
  flex: {
    flex: 1
  },
  centered: {
    alignItems: "center",
    justifyContent: "center"
  },
  card: {
    borderRadius: radius.nav,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 4
  },
  buttonBase: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
    overflow: "hidden",
    position: "relative"
  },
  buttonDefaultSize: {
    minHeight: 44,
    borderRadius: radius.nav,
    paddingHorizontal: spacing.md
  },
  buttonPill: {
    borderRadius: radius.nav,
    minHeight: 52,
    paddingHorizontal: spacing.xl
  },
  buttonText: {
    textAlign: "center",
    zIndex: 1
  },
  buttonSurface: {
    ...StyleSheet.absoluteFillObject
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.nav,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
  label: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  field: {
    gap: spacing.xs
  },
  fieldHorizontal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  fieldContent: {
    flex: 1,
    gap: spacing.xxs
  },
  fieldDescription: {
    fontFamily: fontFamilies.lexend
  },
  input: {
    minHeight: 48,
    borderRadius: radius.xl,
    borderWidth: 2,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamilies.lexend,
    fontSize: 16
  },
  selectRoot: {
    position: "relative",
    zIndex: 10
  },
  selectRootOpen: {
    zIndex: 1000,
    elevation: 12
  },
  selectTrigger: {
    minHeight: 52,
    width: "100%",
    alignSelf: "stretch",
    borderRadius: radius.xl,
    borderWidth: 2,
    paddingHorizontal: spacing.md,
    justifyContent: "center"
  },
  selectTriggerContent: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  selectTriggerText: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 18,
    lineHeight: 23
  },
  selectMenu: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    borderRadius: radius.nav,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 14,
    zIndex: 1001
  },
  selectOption: {
    minHeight: 44,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  selectOptionText: {
    flex: 1
  },
  selectCheck: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  pill: {
    minHeight: 40,
    borderRadius: radius.nav,
    borderWidth: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignItems: "center",
    justifyContent: "center"
  },
  choiceChipText: {
    textAlign: "center"
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.sm
  },
  chipGridItem: {
    width: "48.5%"
  },
  chipGridItemFull: {
    width: "100%"
  },
  statTile: {
    flex: 1,
    minWidth: 145,
    borderRadius: radius.nav,
    padding: spacing.lg,
    gap: spacing.xxs,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.075,
    shadowRadius: 18,
    elevation: 3
  },
  statIconWrap: {
    position: "absolute",
    top: spacing.lg,
    right: spacing.lg
  },
  statValue: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 28,
    lineHeight: 34
  },
  statPercentSymbol: {
    fontSize: 20,
    lineHeight: 26
  },
  statLabel: {
    fontSize: 12,
    lineHeight: 16
  }
});
