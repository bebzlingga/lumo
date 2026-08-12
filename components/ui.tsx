import { useFocusEffect } from "expo-router";
import React, { ReactNode } from "react";
import { ActivityIndicator, Animated, type GestureResponderHandlers, LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle, useWindowDimensions } from "react-native"
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect as SvgRect, Stop } from "react-native-svg";
import { DEFAULT_BACKGROUND, type BackgroundVariant } from "@/constants/backgroundAssets";
import { control, fontFamilies, fontScaleForWidth, layout, radius, spacing, TEXT_SIZE_BUMP, type } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useTabBarVisibility } from "@/context/TabBarVisibility";
import { alpha } from "@/lib/color";
import { Icon, IconName, IconWeight } from "./Icon";
import { LumoBackground, type BackgroundIntensity } from "./LumoBackground";
import { Pressable } from "@/components/Pressable"

type TextVariant = keyof typeof type;

// Scales fontSize/lineHeight in an already-flattened text style, then adds the
// reader's accessibility uplift; leaves every other property untouched.
//
// The short-circuit has to test the uplift as well as the scale. A 390pt-wide
// screen — the size the type is designed at — scales to exactly 1, so
// returning early on `scale === 1` alone would silently skip the uplift on
// precisely the reference device.
function scaleTextStyle(flat: TextStyle, scale: number, bump: number): TextStyle {
  if (scale === 1 && bump === 0) {
    return flat;
  }

  return {
    ...flat,
    fontSize: typeof flat.fontSize === "number" ? Math.round(flat.fontSize * scale) + bump : flat.fontSize,
    lineHeight: typeof flat.lineHeight === "number" ? Math.round(flat.lineHeight * scale) + bump : flat.lineHeight
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
  background,
  backgroundGradient,
  backgroundNode,
  backgroundVariant = DEFAULT_BACKGROUND,
  backgroundIntensity = "subtle",
  refreshControl,
  scrollEnabled,
  scrollRef: scrollRefProp,
  onScroll,
  scrollEventThrottle,
  resetScrollOnFocus = true,
  gestureHandlers,
  stickyHeader,
  pinHeader = true
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  // Overrides the default canvas background (e.g. an immersive full-bleed screen).
  background?: string;
  // Full-screen vertical gradient behind the content; stops run top (0) → bottom (1).
  backgroundGradient?: { color: string; offset: number }[];
  // Pastel landscape plate. Defaults to DEFAULT_BACKGROUND so every screen
  // carries the same backdrop as onboarding; pass a variant to override, or
  // `null` to opt out entirely (e.g. immersive full-bleed screens).
  backgroundVariant?: BackgroundVariant | null;
  backgroundIntensity?: BackgroundIntensity;
  // Extra full-screen layer drawn above the gradient but behind the content
  // (e.g. decorative art that should blend into the background).
  backgroundNode?: ReactNode;
  // Pull-to-refresh for scrolling screens (ignored when scroll is false).
  refreshControl?: React.ComponentProps<typeof ScrollView>["refreshControl"];
  /** Set false to lock the page while a child owns the gesture (e.g. a dial). */
  scrollEnabled?: boolean;
  /** Hands the page's scroller back, for screens that need to scroll to a field. */
  scrollRef?: React.RefObject<ScrollView | null>;
  // Optional scroll passthrough (e.g. for infinite-scroll pagination).
  onScroll?: React.ComponentProps<typeof ScrollView>["onScroll"];
  scrollEventThrottle?: number;
  /** Screens are re-entered at the top by default. Opt out for a screen where
   * losing the reader's place is the worse outcome — a paginated feed they
   * scrolled a long way into, say. */
  resetScrollOnFocus?: boolean;
  /** PanResponder handlers spread onto the content view (non-scrolling screens
   * only) — e.g. swipe-to-navigate in onboarding. */
  gestureHandlers?: GestureResponderHandlers;
  /**
   * A page bar pinned above the scroll area rather than scrolling with it.
   *
   * A sibling of the ScrollView, not an overlay: the content then simply
   * begins beneath it, so nothing has to be padded by the bar's height and
   * nothing scrolls under a transparent strip. `backgroundNode` still fills
   * the whole screen behind both.
   */
  stickyHeader?: ReactNode;
  /**
   * Whether a `ScreenHeader` written as this screen's first child is pinned.
   *
   * True everywhere by default — a page bar that scrolls away takes the way out
   * of the screen with it, and every screen in the app wants the same answer to
   * that. Pass `false` for the rare page whose header is meant to travel with
   * the content.
   */
  pinHeader?: boolean;
}) {
  const { palette, isDark } = useLumo();
  // Overscroll/bounce past the content should match the gradient's tail (or the flat override).
  const canvas = backgroundGradient?.[backgroundGradient.length - 1]?.color ?? background ?? palette.canvas;
  /**
   * The page's scroller.
   *
   * Exposed through `scrollRef` when a caller passes one, so a screen that ends
   * on a text field can bring it above the keyboard itself. `automaticallyAdjust
   * KeyboardInsets` makes the room but does not move the view, so a field near
   * the bottom is still behind the keyboard until something scrolls to it.
   */
  const innerScrollRef = React.useRef<ScrollView>(null);
  const scrollRef = scrollRefProp ?? innerScrollRef;

  /**
   * The page bar, lifted out of the scroller.
   *
   * Screens write `<ScreenHeader />` as their first child and get a pinned bar
   * without saying so — one standard, and no 27 call sites to keep in step. The
   * header is recognised by a flag on the component (`isPageHeader`) rather than
   * by importing it, since `ScreenHeader` imports from this file.
   *
   * Only the FIRST child, and only when scrolling: a header further down is
   * doing something else, and on a non-scrolling screen it is already fixed.
   * An explicit `stickyHeader` always wins.
   */
  const childList = React.Children.toArray(children);
  const leadHeader =
    pinHeader && scroll && !stickyHeader && React.isValidElement(childList[0]) &&
    (childList[0].type as { isPageHeader?: boolean })?.isPageHeader === true
      ? childList[0]
      : null;
  const pinned = stickyHeader ?? leadHeader;
  const body = leadHeader ? childList.slice(1) : children;

  /**
   * A tab screen stays mounted once visited, so its ScrollView keeps whatever
   * offset it was left at — come back to Settings and you land halfway down it,
   * with no idea the page has a top. Every screen re-enters at the top instead.
   *
   * Unanimated on purpose: this fires as the screen begins appearing, so the
   * reset lands before it is on-screen rather than scrolling in front of the
   * reader. Harmless on first mount, where the offset is already zero.
   */
  useFocusEffect(
    React.useCallback(() => {
      if (!scroll || !resetScrollOnFocus) {
        return;
      }

      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [scroll, resetScrollOnFocus])
  );

  /**
   * Scrolling down tucks the floating tab bar away; scrolling back up brings it
   * in. Driven from here rather than from each tab screen so every page in the
   * navigator behaves the same, and chained so a screen that wants its own
   * `onScroll` (infinite scroll, parallax) still gets it. Null off the tabs.
   */
  const tabBar = useTabBarVisibility();
  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      tabBar?.onScroll(event);
      onScroll?.(event);
    },
    [tabBar, onScroll]
  );
  // A screen that can't scroll can't have hidden the bar — but the one that did
  // may still be mounted behind this one, so it is put back on arrival.
  useFocusEffect(
    React.useCallback(() => {
      if (!scroll) {
        tabBar?.reveal();
      }
    }, [scroll, tabBar])
  );

  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, { backgroundColor: canvas }]}>
      {backgroundGradient ? (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgLinearGradient id="screenBgGradient" x1="0" y1="0" x2="0" y2="1">
              {backgroundGradient.map((stop, index) => (
                <Stop key={index} offset={stop.offset} stopColor={stop.color} />
              ))}
            </SvgLinearGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#screenBgGradient)" />
        </Svg>
      ) : null}
      {backgroundVariant ? <LumoBackground variant={backgroundVariant} intensity={backgroundIntensity} /> : null}
      {backgroundNode}
      {pinned ? <View style={styles.stickyHeader}>{pinned}</View> : null}
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.screenContent, leadHeader ? styles.screenContentPinned : null, contentStyle]}
          refreshControl={refreshControl}
          scrollEnabled={scrollEnabled}
          onScroll={handleScroll}
          scrollEventThrottle={scrollEventThrottle ?? 16}
        >
          {body}
        </ScrollView>
      ) : (
        <Animated.View style={[styles.screenContent, styles.flex, contentStyle]} {...gestureHandlers}>
          {children}
        </Animated.View>
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
  const { palette, settings } = useLumo();
  const { width } = useWindowDimensions();
  // `?? 0` because installs that predate the setting have no `textSize` in
  // their persisted state, and an undefined key here would make every size NaN.
  const textBump = TEXT_SIZE_BUMP[settings.textSize] ?? 0;
  // Flatten first so explicit fontSize overrides passed via `style` scale too.
  const flat = StyleSheet.flatten([type[variant], { color: color ?? palette.ink }, style]) as TextStyle;

  return (
    <Text
      className={className}
      numberOfLines={numberOfLines}
      // Ignore the OS Dynamic Type multiplier upward — otherwise the same
      // device size renders bigger text when iOS Text Size is raised.
      maxFontSizeMultiplier={1}
      style={scaleTextStyle(flat, fontScaleForWidth(width), textBump)}
    >
      {children}
    </Text>
  );
}

export function Card({
  children,
  className,
  style,
  tone = "card",
  onLayout
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  tone?: "card" | "surface" | "glow" | "dark";
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { palette, isDark } = useLumo();
  const backgroundColor =
    tone === "surface" ? palette.surface : tone === "glow" ? palette.glowSoft : tone === "dark" ? palette.surfaceStrong : palette.card;

  return (
    <View
      className={className}
      onLayout={onLayout}
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
  iconSize = 17,
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
  /** Matches the label's own size — a smaller button needs a smaller glyph. */
  iconSize?: number;
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
  // Every button is a pill app-wide; `shape` is kept so existing call sites
  // still type-check, but both settings land on the same radius now.
  const surfaceBorderRadius = customStyle?.borderRadius ?? radius.pill;
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
      {icon ? <Icon name={icon} size={iconSize} color={color} weight={iconWeight} /> : null}
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

/**
 * Field label, matching onboarding: ink-coloured and a step up in size/weight
 * from caption, so it reads as a heading for its field rather than muted
 * helper text.
 */
/**
 * A field's name. Set in `subtle`, one step down the text ramp from `ink`: the
 * label is a question and the value the reader supplies is the answer, so at
 * full ink weight every form read as a column of headings with the actual
 * content — the inputs, the pickers — sitting under them at the same strength.
 */
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

/**
 * Soft lift for a borderless field. With no resting outline the fill alone is
 * ~1.02:1 against the canvas, so the shadow is what makes the field findable.
 * Kept shallow — it should read as a raised surface, not a floating card.
 */
export const fieldShadow = {
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.03,
  shadowRadius: 2,
  elevation: 1
} as const;

export function controlBorderColor(palette: ReturnType<typeof useLumo>["palette"], isDark: boolean, active = false) {
  // Focus is the only state that draws an edge; at rest the field is defined
  // by its fill against the canvas, so the border sits transparent. The border
  // WIDTH stays constant either way — dropping it would shift the layout by a
  // pixel on every focus.
  if (active) {
    return palette.hairlineStrong;
  }

  return "transparent";
}

export function LumoInput(props: TextInputProps) {
  const { palette, isDark, settings } = useLumo();
  const { width } = useWindowDimensions();
  const textBump = TEXT_SIZE_BUMP[settings.textSize] ?? 0;
  const [focused, setFocused] = React.useState(false);
  // Card, not surface — onboarding's fields sit on the lighter surface so
  // they read as inputs rather than as part of the canvas.
  const fieldBackground = palette.card;
  const flat = StyleSheet.flatten([
    styles.input,
    // Single-line only. The field's minHeight sits well above the height of one
    // line of text, and Android's EditText brings vertical padding of its own,
    // so the value and its placeholder ended up on the floor of the box instead
    // of centred in it. A multiline field has to keep its text at the top, so
    // it is left alone.
    props.multiline ? null : styles.inputSingleLine,
    {
      backgroundColor: fieldBackground,
      borderColor: controlBorderColor(palette, isDark, focused),
      color: palette.ink,
      shadowColor: palette.shadow,
      ...fieldShadow
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
      style={scaleTextStyle(flat, fontScaleForWidth(width), textBump)}
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
      className={className ?? "min-h-[48px] items-center justify-center rounded-[20px] px-4"}
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
          className={isGrid ? "min-h-[48px] items-center justify-center rounded-[20px] px-3" : undefined}
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
    <Screen scroll={false} contentStyle={[styles.centered, { gap: spacing.md }]}>
      <AppText style={{ fontFamily: "Lexend-Black", fontSize: 24, letterSpacing: 1.5, color: palette.ink }}>LUMO</AppText>
      <ActivityIndicator color={palette.glow} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  // Carries the screen's own gutter, so a pinned bar lines up with the content
  // under it without each caller re-stating the padding.
  stickyHeader: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing.lg
  },
  // With the bar pinned it has already spent the screen's top padding, and the
  // header carries its own bottom margin — a second helping here left the first
  // card sitting well down the page.
  screenContentPinned: {
    paddingTop: 0
  },
  screenContent: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing.lg,
    // A touch airier than spacing.md so stacked sections breathe instead of
    // reading as one dense block (the mascot-brand refresh).
    gap: 20
  },
  flex: {
    flex: 1
  },
  centered: {
    alignItems: "center",
    justifyContent: "center"
  },
  // Matches the onboarding card treatment: 18pt radius and a soft, wide
  // shadow rather than a tight one.
  card: {
    borderRadius: radius.card,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.045,
    shadowRadius: 8,
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
    borderRadius: radius.pill,
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
  // A step under body copy. At 15 it was within a point of the input text it
  // introduces, so the label and the value it labels carried the same weight.
  label: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 14,
    lineHeight: 19
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
  // Centres one line of text in a box taller than it. `paddingVertical: 0` is
  // the half that matters on Android, where the platform's own EditText inset
  // is what pushed the text down.
  inputSingleLine: {
    paddingVertical: 0,
    textAlignVertical: "center"
  },
  pill: {
    minHeight: 40,
    borderRadius: radius.nav,
    borderWidth: 1,
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
