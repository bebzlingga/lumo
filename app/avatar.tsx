import type { ScrollViewInstance } from "react-native";
import * as Haptics from "expo-haptics";
import { usePreventRemove, useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native"
import { Avatar } from "@/components/Avatar";
import { SegmentedButton, SegmentedControl } from "@/components/controls";
import { type IconName } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import {
  AvatarConfig,
  accentColors,
  backgroundColors,
  bodyColors,
  bodyOptions,
  buildAvatarSvg,
  eyesOptions,
  mouthOptions,
  patternOptions,
  randomAvatar,
  topOptions
} from "@/lib/avatar";
import { Pressable } from "@/components/Pressable";

/** Each tab edits exactly one field of the config. */
type CategoryKey = "body" | "top" | "pattern" | "eyes" | "mouth" | "colors";

const THUMB_COLUMNS = 4;
const THUMB_PADDING = 5;
const COLOR_COLUMNS = 6;
const COLOR_GAP = spacing.xs;
const COLOR_PADDING = 8;

/**
 * `label` is no longer drawn — the tabs are glyphs — but it stays as each tab's
 * accessibility label. An icon-only control with no name is unusable to a
 * screen reader, and "Body"/"Top" are exactly the words to announce.
 */
const categories: { key: CategoryKey; label: string; icon: IconName; field?: keyof AvatarConfig; options?: string[] }[] = [
  { key: "body", label: "Body", icon: "user", field: "body", options: bodyOptions },
  // A crown sits where a top does — the closest thing in the set to "the bit on
  // top of the head", which has no literal glyph.
  { key: "top", label: "Top", icon: "crown1", field: "top", options: topOptions },
  { key: "eyes", label: "Eyes", icon: "eye", field: "eyes", options: eyesOptions },
  { key: "mouth", label: "Mouth", icon: "smiley", field: "mouth", options: mouthOptions },
  { key: "pattern", label: "Pattern", icon: "grid", field: "pattern", options: patternOptions },
  { key: "colors", label: "Colors", icon: "colorFilter" }
];

/** What the segmented control needs, derived so the two can never fall out of
 *  step with each other. */
const categoryTabs = categories.map((category) => ({
  label: category.label,
  value: category.key,
  icon: category.icon
}));

type Palette = ReturnType<typeof useLumo>["palette"];

// Selected boxes (thumbnails + colour swatches) get a light card bg + shadow.
function selectionStyle(active: boolean, palette: Palette) {
  return active
    ? {
        backgroundColor: palette.card,
        shadowColor: palette.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
        elevation: 4
      }
    : { backgroundColor: "transparent" };
}

/**
 * Every thumbnail is the CURRENT avatar with one field swapped, so what you see
 * is what choosing it would give you — not an isolated part on its own.
 */
function ThumbRow({
  base,
  field,
  options,
  onSelect,
  palette
}: {
  base: AvatarConfig;
  field: keyof AvatarConfig;
  options: string[];
  onSelect: (value: string) => void;
  palette: Palette;
}) {
  const { width } = useWindowDimensions();
  const thumbSize = Math.floor((width - layout.screenPaddingX * 2 - spacing.sm * (THUMB_COLUMNS - 1)) / THUMB_COLUMNS);
  const thumbs = useMemo(
    () => options.map((option) => ({ option, svg: buildAvatarSvg({ ...base, [field]: option }) })),
    [base, field, options]
  );

  return (
    <View style={styles.grid}>
      {thumbs.map(({ option, svg }) => {
        const active = option === base[field];

        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={option === "none" ? `No ${String(field)}` : option}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option)}
            style={[styles.thumb, { width: thumbSize, height: thumbSize }, selectionStyle(active, palette)]}
          >
            {/* Circular, like the avatar is everywhere else it appears. Square
                thumbnails were previewing a shape the app never renders. */}
            <Avatar svg={svg} size={thumbSize - THUMB_PADDING * 2} />
          </Pressable>
        );
      })}
    </View>
  );
}

function SwatchRow({
  label,
  colors,
  selected,
  onSelect,
  palette,
  size
}: {
  label: string;
  colors: string[];
  selected: string;
  onSelect: (value: string) => void;
  palette: Palette;
  size: number;
}) {
  const fill = size - COLOR_PADDING * 2;

  return (
    <View style={styles.swatchBlock}>
      <AppText variant="caption" color={palette.subtle} style={styles.swatchLabel}>
        {label}
      </AppText>
      <View style={styles.colorGrid}>
        {colors.map((color) => {
          const active = color === selected;

          return (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${color}`}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(color)}
              style={[styles.colorBox, { width: size, height: size }, selectionStyle(active, palette)]}
            >
              {/* Clay's palettes are full hex strings, so they render as-is. */}
              <View style={[styles.colorFill, { width: fill, height: fill, backgroundColor: color, borderColor: palette.hairline }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function AvatarScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { avatar, setAvatar, palette } = useLumo();
  const [draft, setDraft] = useState<AvatarConfig>(avatar);
  const [category, setCategory] = useState<CategoryKey>("body");

  const colorSize = Math.floor((width - layout.screenPaddingX * 2 - COLOR_GAP * (COLOR_COLUMNS - 1)) / COLOR_COLUMNS);
  const previewSvg = useMemo(() => buildAvatarSvg(draft), [draft]);
  const active = categories.find((item) => item.key === category);
  const optionsRef = useRef<ScrollViewInstance>(null);
  // Field-by-field rather than by reference: every tap makes a new `draft`
  // object, but picking an option and picking the old one back is not a change
  // and should not arm the discard prompt.
  const dirty = (Object.keys(draft) as (keyof AvatarConfig)[]).some((key) => draft[key] !== avatar[key]);

  function update(patch: Partial<AvatarConfig>) {
    // Every option is a one-tap change with no other confirmation, so the tap
    // itself is the only feedback there is. Failures are swallowed: a device
    // without a taptic engine should not break choosing an avatar.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setDraft((current) => ({ ...current, ...patch }));
  }

  /** Each category is its own list; landing mid-scroll in the next one is just
   *  the previous one's offset leaking across. */
  function selectCategory(key: CategoryKey) {
    setCategory(key);
    optionsRef.current?.scrollTo({ y: 0, animated: false });
  }

  function shuffle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setDraft(randomAvatar());
  }

  function save() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    // Lift the guard first: `dirty` only clears on the next render, after this leave.
    disablePrevention();
    setAvatar(draft);
    router.back();
  }

  /**
   * Nothing here is saved until the tick, and leaving used to throw the lot away
   * without a word — easy to do after a couple of minutes of fiddling, with no
   * way to get any of it back.
   *
   * On removal rather than on the Back button, because the button is only
   * one of three ways off this screen: the iOS edge swipe and the Android back
   * gesture both leave without ever touching it. A prompt that catches one of
   * the three is worse than none — it teaches you that leaving is safe.
   */
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => {
    Alert.alert("Discard changes?", "Your new avatar has not been saved yet.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: repeat }
    ]);
  });

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      {/* The save tick takes the header's default ink, like every other header
          button. It was greenDark, which is only 3.6:1 on the light canvas and
          left this circle looking washed out beside the ink Back button in the
          identical circle next to it. These outlined buttons are chrome, so the
          one colour that overrides ink anywhere in the app is danger, on the
          destructive ones. */}
      <ScreenHeader
        title="Your avatar"
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        rightAction={{ icon: "check", label: "Save avatar", onPress: save }}
      />

      {/* One circular disc, no separate backdrop behind a square portrait: the
          art carries its own background colour, so clipping it round IS the
          disc — and it is what the avatar actually looks like on Home, Profile
          and Settings. The editor was previewing a shape you never see. */}
      <View style={styles.preview}>
        <Avatar svg={previewSvg} size={156} />
      </View>

      {/* Laid out like the Habits filter row: an action split off into its own
          short track on the left, the real tabs filling the rest. Same recessed
          track and card-filled segment as there — nothing bespoke. Six segments
          at flex 1 divide the width evenly, so there is nothing to scroll and
          no tab hiding off the right edge. */}
      <View style={styles.controlRow}>
        <SegmentedButton icon="shuffle" label="Shuffle avatar" onPress={shuffle} style={styles.controlShuffle} />
        <SegmentedControl options={categoryTabs} value={category} onChange={selectCategory} style={styles.controlTabs} />
      </View>

      <ScrollView
        ref={optionsRef}
        style={styles.optionsScroll}
        contentContainerStyle={styles.optionsContent}
        showsVerticalScrollIndicator={false}
      >
        {active?.field && active.options ? (
          <ThumbRow
            base={draft}
            field={active.field}
            options={active.options}
            onSelect={(option) => update({ [active.field as keyof AvatarConfig]: option })}
            palette={palette}
          />
        ) : null}

        {category === "colors" ? (
          <>
            <SwatchRow label="Body" colors={bodyColors} selected={draft.bodyColor} onSelect={(c) => update({ bodyColor: c })} palette={palette} size={colorSize} />
            <SwatchRow
              label="Accent"
              colors={accentColors}
              selected={draft.accentColor}
              onSelect={(c) => update({ accentColor: c })}
              palette={palette}
              size={colorSize}
            />
            <SwatchRow
              label="Background"
              colors={backgroundColors}
              selected={draft.backgroundColor}
              onSelect={(c) => update({ backgroundColor: c })}
              palette={palette}
              size={colorSize}
            />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.sm
  },
  preview: {
    alignItems: "center",
    paddingVertical: spacing.md
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  // `segment` is flex:1 (so flexBasis:0), which in a one-segment track collapses
  // to its own padding without a floor. Narrower than the Habits row's 88, since
  // this one holds a glyph rather than the word "Active".
  controlShuffle: {
    flexShrink: 0,
    minWidth: 60
  },
  controlTabs: {
    flex: 1
  },
  optionsScroll: {
    flex: 1,
    // Bleed to the screen edges so the first/last item shadows aren't clipped.
    marginHorizontal: -layout.screenPaddingX
  },
  optionsContent: {
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing.sm,
    gap: spacing.md
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  thumb: {
    padding: THUMB_PADDING,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center"
  },
  swatchBlock: {
    gap: spacing.xs
  },
  swatchLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: COLOR_GAP
  },
  colorBox: {
    padding: COLOR_PADDING,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center"
  },
  colorFill: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth
  }
});
