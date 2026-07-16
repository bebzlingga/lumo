import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { AppText, IconButton, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import {
  AvatarConfig,
  AvatarGender,
  accessoriesOptions,
  buildAvatarSvg,
  clothesColors,
  clothingOptions,
  eyebrowsOptions,
  eyesOptions,
  facialHairOptions,
  hairColors,
  hairOptions,
  headwearOptions,
  mouthOptions,
  skinColors
} from "@/lib/avatar";

type CategoryKey = "hair" | "headwear" | "eyes" | "eyebrows" | "mouth" | "facialHair" | "glasses" | "clothes" | "skin";

const THUMB_COLUMNS = 6;
const THUMB_PADDING = 5;
const COLOR_COLUMNS = 8;
const COLOR_GAP = spacing.xs;
const COLOR_PADDING = 8;

function overrideFor(base: AvatarConfig, category: CategoryKey, option: string): AvatarConfig {
  switch (category) {
    case "hair":
      return { ...base, headwear: "none", hair: option };
    case "headwear":
      return { ...base, headwear: option };
    case "eyes":
      return { ...base, eyes: option };
    case "eyebrows":
      return { ...base, eyebrows: option };
    case "mouth":
      return { ...base, mouth: option };
    case "facialHair":
      return { ...base, facialHair: option };
    case "glasses":
      return { ...base, accessories: option };
    case "clothes":
      return { ...base, clothing: option };
    default:
      return base;
  }
}

type Palette = ReturnType<typeof useLumo>["palette"];

// Selected boxes (thumbnails + color swatches) get a light card bg + shadow.
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

function ThumbRow({
  base,
  category,
  options,
  selected,
  onSelect,
  palette
}: {
  base: AvatarConfig;
  category: CategoryKey;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  palette: Palette;
}) {
  const { width } = useWindowDimensions();
  // Thumbs fill the width in equal columns, like the color swatches.
  const thumbSize = Math.floor((width - spacing.lg * 2 - spacing.sm * (THUMB_COLUMNS - 1)) / THUMB_COLUMNS);
  const thumbs = useMemo(
    () => options.map((option) => ({ option, svg: buildAvatarSvg(overrideFor(base, category, option)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, category, options]
  );

  return (
    <View style={styles.grid}>
      {thumbs.map(({ option, svg }) => {
        const active = option === selected;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option)}
            style={[styles.thumb, { width: thumbSize, height: thumbSize }, selectionStyle(active, palette)]}
          >
            <Avatar svg={svg} size={thumbSize - THUMB_PADDING * 2} rounded={false} />
          </Pressable>
        );
      })}
    </View>
  );
}

function SwatchRow({
  colors,
  selected,
  onSelect,
  palette,
  size
}: {
  colors: string[];
  selected: string;
  onSelect: (value: string) => void;
  palette: Palette;
  size: number;
}) {
  const fill = size - COLOR_PADDING * 2;
  return (
    <View style={styles.colorGrid}>
      {colors.map((color) => {
        const active = color === selected;
        return (
          <Pressable
            key={color}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(color)}
            style={[styles.colorBox, { width: size, height: size }, selectionStyle(active, palette)]}
          >
            <View style={[styles.colorFill, { width: fill, height: fill, backgroundColor: `#${color}`, borderColor: palette.hairline }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AvatarScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { avatar, setAvatar, palette, isDark } = useLumo();
  const [draft, setDraft] = useState<AvatarConfig>(avatar);
  const [category, setCategory] = useState<CategoryKey>("hair");

  // Color swatches fill the width in 8 equal columns.
  const colorSize = Math.floor((width - spacing.lg * 2 - COLOR_GAP * (COLOR_COLUMNS - 1)) / COLOR_COLUMNS);

  const previewSvg = useMemo(() => buildAvatarSvg(draft), [draft]);

  // Slide + fade the preview whenever the gender switches.
  const genderAnim = useRef(new Animated.Value(1)).current;
  const slideDir = useRef(0);
  useEffect(() => {
    slideDir.current = draft.gender === "female" ? 1 : -1;
    genderAnim.setValue(0);
    Animated.timing(genderAnim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [draft.gender, genderAnim]);

  function update(patch: Partial<AvatarConfig>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function setGender(gender: AvatarGender) {
    setDraft((current) => {
      const hair = hairOptions[gender].includes(current.hair) ? current.hair : hairOptions[gender][0];
      const headwear = headwearOptions[gender].includes(current.headwear) ? current.headwear : "none";
      const facialHair = facialHairOptions[gender].includes(current.facialHair) ? current.facialHair : "none";
      return { ...current, gender, hair, headwear, facialHair };
    });
    if (category === "facialHair" && gender === "female") {
      setCategory("hair");
    }
  }

  function save() {
    setAvatar(draft);
    router.back();
  }

  const categories: { key: CategoryKey; label: string }[] = [
    { key: "hair", label: "Hair" },
    { key: "headwear", label: "Headwear" },
    { key: "eyes", label: "Eyes" },
    { key: "eyebrows", label: "Brows" },
    { key: "mouth", label: "Mouth" },
    ...(draft.gender === "male" ? [{ key: "facialHair" as CategoryKey, label: "Beard" }] : []),
    { key: "glasses", label: "Glasses" },
    { key: "clothes", label: "Clothes" },
    { key: "skin", label: "Skin" }
  ];

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <View style={styles.header}>
        <IconButton icon="back" label="Back" iconWeight="bulk" iconSize={32} buttonSize={44} onPress={() => router.back()} iconStyle={styles.backIcon} />
        <View style={styles.headerCenter} pointerEvents="none">
          <AppText variant="titleSmall" color={palette.ink} style={styles.headerTitle}>
            {draft.gender === "male" ? "Male" : "Female"}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save avatar"
          onPress={save}
          hitSlop={8}
          style={({ pressed }) => [styles.saveButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="checkCircle" size={24} color={palette.greenDark} weight="bulk" />
        </Pressable>
      </View>

      <View style={styles.preview}>
        <View style={styles.previewRow}>
          {draft.gender === "female" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch to male"
              onPress={() => setGender("male")}
              hitSlop={8}
              style={({ pressed }) => [styles.genderArrow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="arrowLeft" size={24} color={palette.greenDark} weight="outline" />
            </Pressable>
          ) : (
            <View style={styles.genderArrow} />
          )}

          <Animated.View
            style={{
              opacity: genderAnim,
              transform: [{ translateX: genderAnim.interpolate({ inputRange: [0, 1], outputRange: [slideDir.current * 70, 0] }) }]
            }}
          >
            <View style={styles.previewFrame}>
              <View style={[styles.previewCircle, { backgroundColor: alpha(palette.greenDark, "10") }]} pointerEvents="none" />
              <Avatar svg={previewSvg} size={156} rounded={false} />
            </View>
          </Animated.View>

          {draft.gender === "male" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch to female"
              onPress={() => setGender("female")}
              hitSlop={8}
              style={({ pressed }) => [styles.genderArrow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="arrowRight" size={24} color={palette.greenDark} weight="outline" />
            </Pressable>
          ) : (
            <View style={styles.genderArrow} />
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
        {categories.map((cat) => {
          const active = category === cat.key;
          return (
            <Pressable
              key={cat.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setCategory(cat.key)}
              style={[styles.tab, active ? styles.tabActive : null, active ? { backgroundColor: palette.greenDark } : null]}
            >
              <AppText
                variant="bodySmall"
                color={active ? (isDark ? palette.onAccent : palette.white) : alpha(palette.subtle, "99")}
                style={[styles.tabText, active ? null : styles.tabTextInactive]}
              >
                {cat.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent} showsVerticalScrollIndicator={false}>
        {category === "skin" ? <SwatchRow colors={skinColors} selected={draft.skinColor} onSelect={(c) => update({ skinColor: c })} palette={palette} size={colorSize} /> : null}

        {category === "hair" ? (
          <>
            <ThumbRow base={draft} category="hair" options={hairOptions[draft.gender]} selected={draft.headwear === "none" ? draft.hair : ""} onSelect={(o) => update({ hair: o, headwear: "none" })} palette={palette} />
            <SwatchRow colors={hairColors} selected={draft.hairColor} onSelect={(c) => update({ hairColor: c })} palette={palette} size={colorSize} />
          </>
        ) : null}

        {category === "headwear" ? (
          <>
            <ThumbRow base={draft} category="headwear" options={headwearOptions[draft.gender]} selected={draft.headwear} onSelect={(o) => update({ headwear: o })} palette={palette} />
            {draft.headwear !== "none" ? (
              <>
                <SwatchRow colors={clothesColors} selected={draft.hatColor} onSelect={(c) => update({ hatColor: c })} palette={palette} size={colorSize} />
              </>
            ) : null}
          </>
        ) : null}

        {category === "eyes" ? <ThumbRow base={draft} category="eyes" options={eyesOptions} selected={draft.eyes} onSelect={(o) => update({ eyes: o })} palette={palette} /> : null}
        {category === "eyebrows" ? <ThumbRow base={draft} category="eyebrows" options={eyebrowsOptions} selected={draft.eyebrows} onSelect={(o) => update({ eyebrows: o })} palette={palette} /> : null}
        {category === "mouth" ? <ThumbRow base={draft} category="mouth" options={mouthOptions} selected={draft.mouth} onSelect={(o) => update({ mouth: o })} palette={palette} /> : null}

        {category === "facialHair" ? (
          <>
            <ThumbRow base={draft} category="facialHair" options={facialHairOptions[draft.gender]} selected={draft.facialHair} onSelect={(o) => update({ facialHair: o })} palette={palette} />
            {draft.facialHair !== "none" ? (
              <>
                <SwatchRow colors={hairColors} selected={draft.facialHairColor} onSelect={(c) => update({ facialHairColor: c })} palette={palette} size={colorSize} />
              </>
            ) : null}
          </>
        ) : null}

        {category === "glasses" ? <ThumbRow base={draft} category="glasses" options={accessoriesOptions} selected={draft.accessories} onSelect={(o) => update({ accessories: o })} palette={palette} /> : null}

        {category === "clothes" ? (
          <>
            <ThumbRow base={draft} category="clothes" options={clothingOptions} selected={draft.clothing} onSelect={(o) => update({ clothing: o })} palette={palette} />
            <SwatchRow colors={clothesColors} selected={draft.clothesColor} onSelect={(c) => update({ clothesColor: c })} palette={palette} size={colorSize} />
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
  header: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  headerTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 17,
    lineHeight: 22
  },
  backIcon: {
    transform: [{ translateX: 1 }]
  },
  saveButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm
  },
  preview: {
    alignItems: "center",
    paddingVertical: spacing.md
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg
  },
  genderArrow: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center"
  },
  previewFrame: {
    alignItems: "center",
    justifyContent: "center"
  },
  previewCircle: {
    position: "absolute",
    width: 156,
    height: 156,
    borderRadius: 78
  },
  tabScroll: {
    flexGrow: 0,
    marginHorizontal: -spacing.lg
  },
  tabRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs
  },
  tab: {
    justifyContent: "center",
    padding: 3,
    borderRadius: radius.pill
  },
  tabActive: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs
  },
  tabText: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  tabTextInactive: {
    fontFamily: fontFamilies.lexendMedium
  },
  optionsScroll: {
    flex: 1,
    // Bleed to the screen edges so the first/last item shadows aren't clipped.
    marginHorizontal: -spacing.lg
  },
  optionsContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm
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
