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
  ViewStyle,
  useWindowDimensions
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { control, fontFamilies, fontScaleForWidth, radius, spacing, type } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { Icon, IconName, IconWeight } from "./Icon";

type TextVariant = keyof typeof type;

// Scales fontSize/lineHeight in an already-flattened text style; leaves every
// other property untouched. scale === 1 short-circuits to the same object.
function scaleTextStyle(flat: TextStyle, scale: number): TextStyle {
  if (scale === 1) {
    return flat;
  }

  return {
    ...flat,
    fontSize: typeof flat.fontSize === "number" ? Math.round(flat.fontSize * scale) : flat.fontSize,
    lineHeight: typeof flat.lineHeight === "number" ? Math.round(flat.lineHeight * scale) : flat.lineHeight
  };
}
type ChipOption = {
  label: string;
  value: string;
};

export function Screen({
  children,
  scroll = true,
  contentStyle,
  edges = ["top", "left", "right"],
  refreshControl,
  onScroll,
  scrollEventThrottle
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  // Pull-to-refresh for scrolling screens (ignored when scroll is false).
  refreshControl?: React.ComponentProps<typeof ScrollView>["refreshControl"];
  // Optional scroll passthrough (e.g. for infinite-scroll pagination).
  onScroll?: React.ComponentProps<typeof ScrollView>["onScroll"];
  scrollEventThrottle?: number;
}) {
  const { palette, isDark } = useLumo();

  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, { backgroundColor: palette.canvas }]}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.screenContent, contentStyle]}
          refreshControl={refreshControl}
          onScroll={onScroll}
          scrollEventThrottle={scrollEventThrottle}
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
  const { palette } = useLumo();
  const { width } = useWindowDimensions();
  // Flatten first so explicit fontSize overrides passed via `style` scale too.
  const flat = StyleSheet.flatten([type[variant], { color: color ?? palette.ink }, style]) as TextStyle;

  return (
    <Text
      className={className}
      numberOfLines={numberOfLines}
      // Ignore the OS Dynamic Type multiplier upward — otherwise the same
      // device size renders bigger text when iOS Text Size is raised.
      maxFontSizeMultiplier={1}
      style={scaleTextStyle(flat, fontScaleForWidth(width))}
    >
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
  style,
  labelStyle
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
  labelStyle?: StyleProp<TextStyle>;
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
  const surfaceBorderRadius = customStyle?.borderRadius ?? (shape === "pill" ? radius.pill : control.radius);
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
        <AppText variant="button" color={color} style={[styles.buttonText, labelStyle]}>
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
  iconColor,
  buttonSize,
  iconWeight = "regular",
  iconStyle,
  style
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  iconSize?: number;
  iconColor?: string;
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
        <Icon name={icon} size={iconSize} color={iconColor ?? palette.ink} weight={iconWeight} />
      </View>
    </Pressable>
  );
}

export function FieldLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { palette } = useLumo();

  return (
    <AppText variant="caption" color={palette.subtle} style={[styles.label, style]}>
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

export function controlBorderColor(palette: ReturnType<typeof useLumo>["palette"], isDark: boolean, active = false) {
  if (active) {
    return palette.greenDark;
  }

  return isDark ? alpha(palette.greenDark, "5C") : alpha(palette.greenDark, "47");
}

export function LumoInput(props: TextInputProps) {
  const { palette, isDark, settings } = useLumo();
  const { width } = useWindowDimensions();
  const [focused, setFocused] = React.useState(false);
  // The green theme uses a soft green-tinted field instead of the cream surface.
  const fieldBackground = settings.colorScheme === "green" ? alpha(palette.greenDark, "14") : palette.surface;
  const flat = StyleSheet.flatten([
    styles.input,
    {
      backgroundColor: fieldBackground,
      borderColor: controlBorderColor(palette, isDark, focused),
      color: palette.ink
    },
    props.style
  ]) as TextStyle;

  return (
    <TextInput
      placeholderTextColor={`${palette.body}99`}
      maxFontSizeMultiplier={1}
      {...props}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      style={scaleTextStyle(flat, fontScaleForWidth(width))}
    />
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
          backgroundColor: selected ? palette.greenSoft : palette.surface,
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
  const { palette, isDark } = useLumo();
  const unselectedBorder = isDark ? alpha(palette.greenDark, "73") : palette.hairline;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={className ?? "min-h-[48px] items-center justify-center rounded-[16px] px-4"}
      style={({ pressed }) => [
        {
          backgroundColor: selected ? palette.greenSoft : palette.surface,
          borderColor: selected ? palette.greenDark : unselectedBorder,
          borderWidth: 2,
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
          className={isGrid ? "min-h-[48px] items-center justify-center rounded-[16px] px-3" : undefined}
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
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
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
    minHeight: control.height,
    borderRadius: control.radius,
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
    minHeight: control.height,
    borderRadius: control.radius,
    borderWidth: control.borderWidth,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamilies.lexend,
    fontSize: 16
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
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
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
