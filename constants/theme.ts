import { TextStyle } from "react-native";

export const themeColorOptions = [
  { key: "black", label: "Black", swatch: "#2F302B" },
  { key: "blue", label: "Blue", swatch: "#274F6F" },
  { key: "indigo", label: "Indigo", swatch: "#3E3D79" },
  { key: "orange", label: "Orange", swatch: "#744729" },
  { key: "pink", label: "Pink", swatch: "#763E5C" },
  { key: "purple", label: "Purple", swatch: "#5A4077" },
  { key: "green", label: "Green", swatch: "#335E3B" }
] as const;

export type ThemeColorScheme = (typeof themeColorOptions)[number]["key"];

export type LumoPalette = typeof lightPalette;

export const lightPalette = {
  canvas: "#FFFFFF",
  surface: "#FFF7E6",
  surfaceStrong: "#BBDBB1",
  card: "#FFFFFF",
  ink: "#335E3B",
  body: "#335E3B",
  muted: "#6EA66E",
  subtle: "#706A60",
  hairline: "#EFE3C8",
  green: "#6EA66E",
  greenActive: "#335E3B",
  greenDark: "#335E3B",
  greenSoft: "#BBDBB1",
  chartTrack: "#E7ECE6",
  chartPartial: "#FFB313",
  glow: "#FFC94D",
  glowSoft: "#FFE8A6",
  accent: "#FFC94D",
  accentBorder: "#FFB313",
  onAccent: "#335E3B",
  danger: "#B84F45",
  white: "#FFFFFF",
  shadow: "#141413"
};

export const darkPalette = {
  canvas: "#1A2119",
  surface: "#223025",
  surfaceStrong: "#2B3A2D",
  card: "#202A20",
  ink: "#FFF7E6",
  body: "#FFE8A6",
  muted: "#BBDBB1",
  subtle: "#9A9385",
  hairline: "#335E3B",
  green: "#6EA66E",
  greenActive: "#BBDBB1",
  greenDark: "#BBDBB1",
  greenSoft: "#243829",
  chartTrack: "#223025",
  chartPartial: "#FFB313",
  glow: "#FFC94D",
  glowSoft: "#3A311B",
  accent: "#FFC94D",
  accentBorder: "#FFB313",
  onAccent: "#335E3B",
  danger: "#F29A8E",
  white: "#FFFFFF",
  shadow: "#000000"
};

type PaletteAccent = Pick<
  LumoPalette,
  | "canvas"
  | "surface"
  | "surfaceStrong"
  | "card"
  | "ink"
  | "body"
  | "muted"
  | "hairline"
  | "green"
  | "greenActive"
  | "greenDark"
  | "greenSoft"
  | "chartTrack"
  | "onAccent"
>;

const themeAccentPalettes = {
  black: {
    light: {
      canvas: "#FFFFFF",
      surface: "#ECEEE9",
      surfaceStrong: "#D8DDD6",
      card: "#FFFFFF",
      ink: "#2F302B",
      body: "#2F302B",
      muted: "#73786E",
      hairline: "#DADDD6",
      green: "#73786E",
      greenActive: "#2F302B",
      greenDark: "#2F302B",
      greenSoft: "#D8DDD6",
      chartTrack: "#E9ECE7",
      onAccent: "#FFF7E6"
    },
    dark: {
      canvas: "#171817",
      surface: "#242521",
      surfaceStrong: "#353730",
      card: "#20211E",
      ink: "#FFF7E6",
      body: "#D8D4C7",
      muted: "#C3C7BE",
      hairline: "#3A3D36",
      green: "#92978F",
      greenActive: "#E8EADF",
      greenDark: "#E8EADF",
      greenSoft: "#2C302B",
      chartTrack: "#242821",
      onAccent: "#191A17"
    }
  },
  blue: {
    light: {
      canvas: "#FFFFFF",
      surface: "#EEF7FB",
      surfaceStrong: "#C8DEE8",
      card: "#FFFFFF",
      ink: "#274F6F",
      body: "#274F6F",
      muted: "#6D9AB8",
      hairline: "#DCEAF0",
      green: "#6D9AB8",
      greenActive: "#274F6F",
      greenDark: "#274F6F",
      greenSoft: "#C8DEE8",
      chartTrack: "#E7EEF2",
      onAccent: "#F8FCFF"
    },
    dark: {
      canvas: "#151D24",
      surface: "#1E2A33",
      surfaceStrong: "#263645",
      card: "#1B242C",
      ink: "#F2F8FB",
      body: "#D8E8F2",
      muted: "#B8D4E5",
      hairline: "#2B4A5E",
      green: "#6D9AB8",
      greenActive: "#C8DEE8",
      greenDark: "#C8DEE8",
      greenSoft: "#203747",
      chartTrack: "#1E2A33",
      onAccent: "#173044"
    }
  },
  indigo: {
    light: {
      canvas: "#FFFFFF",
      surface: "#F3F2FD",
      surfaceStrong: "#DAD9F4",
      card: "#FFFFFF",
      ink: "#3E3D79",
      body: "#3E3D79",
      muted: "#8584C6",
      hairline: "#E5E3F2",
      green: "#8584C6",
      greenActive: "#3E3D79",
      greenDark: "#3E3D79",
      greenSoft: "#DAD9F4",
      chartTrack: "#ECECF6",
      onAccent: "#FBFAFF"
    },
    dark: {
      canvas: "#191A28",
      surface: "#24253A",
      surfaceStrong: "#303254",
      card: "#202133",
      ink: "#F7F5FF",
      body: "#E4E1FF",
      muted: "#C6C5EA",
      hairline: "#3C3E65",
      green: "#8584C6",
      greenActive: "#DAD9F4",
      greenDark: "#DAD9F4",
      greenSoft: "#292B47",
      chartTrack: "#24253A",
      onAccent: "#202247"
    }
  },
  orange: {
    light: {
      canvas: "#FFFFFF",
      surface: "#FFF3E7",
      surfaceStrong: "#F1D4B9",
      card: "#FFFFFF",
      ink: "#744729",
      body: "#744729",
      muted: "#C48551",
      hairline: "#F0E1D1",
      green: "#C48551",
      greenActive: "#744729",
      greenDark: "#744729",
      greenSoft: "#F1D4B9",
      chartTrack: "#F3E7DA",
      onAccent: "#FFFBF6"
    },
    dark: {
      canvas: "#241A14",
      surface: "#32251C",
      surfaceStrong: "#4A3120",
      card: "#2B2018",
      ink: "#FFF6EE",
      body: "#F2DDCB",
      muted: "#E2BE9C",
      hairline: "#5A3824",
      green: "#C48551",
      greenActive: "#F1D4B9",
      greenDark: "#F1D4B9",
      greenSoft: "#40291C",
      chartTrack: "#32251C",
      onAccent: "#2B190E"
    }
  },
  pink: {
    light: {
      canvas: "#FFFFFF",
      surface: "#FFF0F6",
      surfaceStrong: "#F1D4E2",
      card: "#FFFFFF",
      ink: "#763E5C",
      body: "#763E5C",
      muted: "#C77C9E",
      hairline: "#F0DFE8",
      green: "#C77C9E",
      greenActive: "#763E5C",
      greenDark: "#763E5C",
      greenSoft: "#F1D4E2",
      chartTrack: "#F4E8ED",
      onAccent: "#FFFAFC"
    },
    dark: {
      canvas: "#251820",
      surface: "#33232B",
      surfaceStrong: "#4A293A",
      card: "#2D1F27",
      ink: "#FFF4F8",
      body: "#F3DCE8",
      muted: "#E3B7CC",
      hairline: "#5E3448",
      green: "#C77C9E",
      greenActive: "#F1D4E2",
      greenDark: "#F1D4E2",
      greenSoft: "#432434",
      chartTrack: "#33232B",
      onAccent: "#311825"
    }
  },
  purple: {
    light: {
      canvas: "#FFFFFF",
      surface: "#F7F0FC",
      surfaceStrong: "#E5D7F1",
      card: "#FFFFFF",
      ink: "#5A4077",
      body: "#5A4077",
      muted: "#A079C4",
      hairline: "#E9DFF0",
      green: "#A079C4",
      greenActive: "#5A4077",
      greenDark: "#5A4077",
      greenSoft: "#E5D7F1",
      chartTrack: "#F0E9F4",
      onAccent: "#FDFAFF"
    },
    dark: {
      canvas: "#201927",
      surface: "#2B2235",
      surfaceStrong: "#3D2B4F",
      card: "#271F30",
      ink: "#FAF4FF",
      body: "#E9D9F5",
      muted: "#D0B5E3",
      hairline: "#4A3561",
      green: "#A079C4",
      greenActive: "#E5D7F1",
      greenDark: "#E5D7F1",
      greenSoft: "#382743",
      chartTrack: "#2B2235",
      onAccent: "#261633"
    }
  },
  green: {
    light: {
      canvas: lightPalette.canvas,
      surface: lightPalette.surface,
      surfaceStrong: lightPalette.surfaceStrong,
      card: lightPalette.card,
      ink: lightPalette.ink,
      body: lightPalette.body,
      muted: lightPalette.muted,
      hairline: lightPalette.hairline,
      green: lightPalette.green,
      greenActive: lightPalette.greenActive,
      greenDark: lightPalette.greenDark,
      greenSoft: lightPalette.greenSoft,
      chartTrack: lightPalette.chartTrack,
      onAccent: lightPalette.onAccent
    },
    dark: {
      canvas: darkPalette.canvas,
      surface: darkPalette.surface,
      surfaceStrong: darkPalette.surfaceStrong,
      card: darkPalette.card,
      ink: darkPalette.ink,
      body: darkPalette.body,
      muted: darkPalette.muted,
      hairline: darkPalette.hairline,
      green: darkPalette.green,
      greenActive: darkPalette.greenActive,
      greenDark: darkPalette.greenDark,
      greenSoft: darkPalette.greenSoft,
      chartTrack: darkPalette.chartTrack,
      onAccent: darkPalette.onAccent
    }
  }
} satisfies Record<ThemeColorScheme, { light: PaletteAccent; dark: PaletteAccent }>;

const themeSubtleColors = {
  black: {
    light: "#6F726A",
    dark: "#A7AAA1"
  },
  blue: {
    light: "#637888",
    dark: "#9BAFBE"
  },
  indigo: {
    light: "#74739E",
    dark: "#AAA8CE"
  },
  orange: {
    light: "#8A7460",
    dark: "#CDAE91"
  },
  pink: {
    light: "#8B6F7D",
    dark: "#CDA5B9"
  },
  purple: {
    light: "#806F8E",
    dark: "#BCA4CD"
  },
  green: {
    light: lightPalette.subtle,
    dark: darkPalette.subtle
  }
} satisfies Record<ThemeColorScheme, { light: string; dark: string }>;

/**
 * Contrasting pop color per theme (quick-done TO DO badge, board vote
 * counts) — deliberately NOT the theme's own hue, the way amber pops on the
 * black theme. All are light enough to carry near-black text in both modes.
 */
export const progressAccents: Record<ThemeColorScheme, string> = {
  black: "#FFC94D", // amber
  green: "#EE8B6C", // terracotta
  blue: "#F09B7A", // peach coral
  indigo: "#F0928A", // coral
  orange: "#E5C685", // cream / sand
  pink: "#F7BE45", // deep gold
  purple: "#F2A08C" // salmon
};
export const progressAccentText = "#141413";

export function getPalette(isDark: boolean, colorScheme: ThemeColorScheme = "green"): LumoPalette {
  const basePalette = isDark ? darkPalette : lightPalette;
  const accent = themeAccentPalettes[colorScheme] ?? themeAccentPalettes.green;
  const subtle = themeSubtleColors[colorScheme]?.[isDark ? "dark" : "light"] ?? basePalette.subtle;

  return {
    ...basePalette,
    ...(isDark ? accent.dark : accent.light),
    subtle
  };
}

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
};

const floatingTabBarHeight = 72;

export const layout = {
  floatingTabBarHeight,
  tabScreenBottomPadding: floatingTabBarHeight + spacing.xxl + spacing.lg
};

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  nav: 22,
  pill: 9999
};

/**
 * Shared sizing for form controls (inputs, dropdown triggers, buttons) so they
 * stay visually consistent across every page — one height, one radius, one
 * border weight. Border/focus colors come from the active palette at use sites.
 */
export const control = {
  height: 48,
  radius: radius.lg,
  borderWidth: 1
};

export const fontFamilies = {
  lexend: "Lexend-Regular",
  lexendMedium: "Lexend-Medium",
  lexendSemiBold: "Lexend-SemiBold",
  lexendBold: "Lexend-Bold"
};

export const type = {
  display: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 0
  } satisfies TextStyle,
  displaySmall: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 0
  } satisfies TextStyle,
  title: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: 0
  } satisfies TextStyle,
  titleSmall: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0
  } satisfies TextStyle,
  body: {
    fontFamily: fontFamilies.lexend,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0
  } satisfies TextStyle,
  bodySmall: {
    fontFamily: fontFamilies.lexend,
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0
  } satisfies TextStyle,
  caption: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0
  } satisfies TextStyle,
  button: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0
  } satisfies TextStyle
};

/**
 * Type is designed at a 390pt-wide screen (iPhone 14 / Pro). Narrower devices
 * scale text down so the same point sizes don't read oversized on smaller
 * phones — a 375pt device renders at ~0.92, floored at 0.8. Wider (Pro Max)
 * screens scale up slightly instead, capped at 1.04 (430pt ≈ 1.04). Note:
 * device-to-device differences at the SAME width come from the iOS Text Size
 * setting, which AppText caps via maxFontSizeMultiplier instead.
 * AppText / LumoInput apply this globally.
 */
export function fontScaleForWidth(width: number) {
  if (width >= 390) {
    return Math.min(1.04, 1 + ((width - 390) / 390) * 0.4);
  }

  return Math.max(0.8, 1 - ((390 - width) / 390) * 2);
}

export const habitColors = [
  "#335E3B",
  "#6EA66E",
  "#BBDBB1",
  "#FFE8A6",
  "#FFC94D",
  "#FFB313"
];

/**
 * Per-habit color themes, named after places known for the hue.
 * - `color`: the swatch itself — icon bubbles, chart fills, hero surfaces.
 * - `onColor`: content drawn on top of `color` (white on bold swatches, the
 *   deep family hue on pale ones).
 * - `accent`: a card-safe version of the hue for text accents and small fills;
 *   equals `color` for bold swatches, the deep family hue for pale ones.
 */
export type HabitColorOption = {
  key: string;
  label: string;
  color: string;
  accent: string;
  /** Dark-mode replacement for `accent` — needed when the accent itself is
   * too dark to read on dark cards (e.g. the Ink/black option). */
  accentDark?: string;
  onColor: string;
};

export const habitColorOptions: HabitColorOption[] = [
  { key: "skyBlue", label: "Sky Blue", color: "#1D74E4", accent: "#1D74E4", onColor: "#FFFFFF" },
  { key: "monteverde", label: "Monteverde", color: "#17A38F", accent: "#17A38F", onColor: "#FFFFFF" },
  { key: "glencoe", label: "Glencoe", color: "#74CDC4", accent: "#2E9E90", onColor: "#FFFFFF" },
  { key: "sagano", label: "Sagano", color: "#CDEAE1", accent: "#17A38F", onColor: "#17A38F" },
  { key: "kolkata", label: "Kolkata", color: "#F9941E", accent: "#F9941E", onColor: "#FFFFFF" },
  { key: "erfoud", label: "Erfoud", color: "#FBB25C", accent: "#E8871A", onColor: "#FFFFFF" },
  { key: "bagan", label: "Bagan", color: "#FCEACD", accent: "#F9941E", onColor: "#F9941E" },
  { key: "bunol", label: "Buñol", color: "#FC7A5E", accent: "#FC7A5E", onColor: "#FFFFFF" },
  { key: "petra", label: "Petra", color: "#FCA78F", accent: "#E8654A", onColor: "#FFFFFF" },
  { key: "nara", label: "Nara", color: "#FCE3DA", accent: "#FC7A5E", onColor: "#FC7A5E" },
  { key: "abisko", label: "Abisko", color: "#5A4B9C", accent: "#5A4B9C", onColor: "#FFFFFF" },
  { key: "valensole", label: "Valensole", color: "#A29FC9", accent: "#7A6FB0", onColor: "#FFFFFF" },
  { key: "tochigi", label: "Tochigi", color: "#DEDDEB", accent: "#5A4B9C", onColor: "#5A4B9C" },
  { key: "panjin", label: "Panjin", color: "#D0405E", accent: "#D0405E", onColor: "#FFFFFF" },
  { key: "hillier", label: "Hillier", color: "#DE8898", accent: "#C9506B", onColor: "#FFFFFF" },
  { key: "harbour", label: "Harbour", color: "#F2DBDF", accent: "#D0405E", onColor: "#D0405E" },
  { key: "ink", label: "Ink", color: "#2F302B", accent: "#2F302B", accentDark: "#E8EADF", onColor: "#FFFFFF" }
];

export const defaultHabitColor = habitColorOptions[0].color;

/** Curated subset shown in the habit form's color picker — one swatch per hue
 * family. The full option list above stays resolvable so habits saved with a
 * retired swatch keep their colors. */
const habitColorPickerKeys = ["skyBlue", "monteverde", "kolkata", "bunol", "abisko", "valensole", "panjin", "hillier", "ink"];

export const habitColorPickerOptions = habitColorOptions.filter((option) => habitColorPickerKeys.includes(option.key));

/** Resolve a habit's stored color to its palette option. Habits created before
 * color themes (or with legacy greens) return undefined, and the UI falls back
 * to the app theme's colors. */
export function habitColorOption(color?: string): HabitColorOption | undefined {
  return habitColorOptions.find((option) => option.color === color);
}

/** Mode-aware accent for a habit's stored color: dark mode swaps in
 * `accentDark` when the option defines one. Use this (not `.accent`) wherever
 * the accent is drawn on cards/canvas. */
export function habitAccent(color: string | undefined, isDark: boolean): string | undefined {
  const option = habitColorOption(color);

  if (!option) {
    return undefined;
  }

  return isDark ? option.accentDark ?? option.accent : option.accent;
}
