import { TextStyle } from "react-native";

/**
 * LUMO design tokens.
 *
 * Colour is light/dark only — there is no per-accent colour scheme. Every
 * surface pulls from `getPalette(isDark)`, so re-introducing extra schemes
 * later means adding one lookup here rather than touching call sites.
 *
 * Palette values come from the LUMO brand spec: warm cream canvas, navy ink,
 * sage-green primary actions, golden highlights, and pastel accents.
 */

// --- brand ramp (raw values; prefer the palette below at call sites) --------
export const brand = {
  // Warm cream canvas — used by ONBOARDING and the splash, which run a lighter,
  // brighter look than the app they hand off to.
  cream: "#FFF8EB",
  /** In-app canvas for EVERY screen past onboarding: deeper than the near-white
   * it started as, so cards, plates and illustrations sit ON something instead
   * of washing into it — but desaturated, since the same darkness carried at
   * onboarding's saturation reads yellow over a whole screen.
   * `surface`/`surfaceStrong` step down with it to keep the ladder. */
  canvas: "#F8F4EB",
  creamSoft: "#FAF6EC",
  /**
   * Card/field surface. Sits between white and the canvas: far enough off white
   * that cards and inputs don't glare on the warm background, not so close to
   * `canvas` that they read yellow.
   */
  card: "#FDFBF5",
  /** Warm outline for fields and selected cards (never a cool gray hairline). */
  borderWarm: "#E6D0A6",
  /** Inactive tracks, dots, and switch rails. */
  sand: "#DECFB4",
  /**
   * Primary ink. A deep amber-brown, not navy — a cool blue-black reads
   * foreign against the warm cream canvas. Still 11.6:1 on canvas, so it
   * clears AAA for body text.
   */
  navy: "#453213",
  // Warm taupe neutrals, NOT cool blue-grays. On the cream canvas a blue-tinted
  // gray reads as dirty; these share the background's warmth. They also carry
  // MORE contrast than the cool tones they replaced (5.95 vs 4.92 on canvas).
  slate: "#6E6152",
  mist: "#9C9182",
  sage: "#7FA466",
  sageStrong: "#648A4C",
  sageSoft: "#E8F0DD",
  gold: "#F4B632",
  goldSoft: "#FFF1C9",
  // For gold glyphs ON goldSoft — brand.gold there is only 1.61:1 and vanishes.
  // goldDeep clears 3:1 (non-text UI); goldInk clears 4.5:1 for small text.
  goldDeep: "#A8710B",
  goldInk: "#8A5C08",
  lavender: "#A98BEF",
  lavenderSoft: "#EEE7FF",
  mint: "#9BCFB4",
  mintSoft: "#E5F5EC",
  blue: "#88B5EA",
  blueSoft: "#E6F0FC",
  coral: "#F58C78",
  coralSoft: "#FCE4DE",
  warning: "#E8A129",
  error: "#E7665D",
  success: "#50A878",
  border: "#EAE4D7"
};

export type LumoPalette = typeof lightPalette;

export const lightPalette = {
  canvas: brand.canvas,
  // Deeper than brand.creamSoft (which onboarding still uses over its lighter
  // cream) so recessed areas stay readable against the deeper canvas, and held
  // at the canvas's lower saturation.
  surface: "#F1ECE0",
  surfaceStrong: "#E6DFD0",
  card: brand.card,
  ink: brand.navy,
  body: brand.navy,
  muted: brand.mist,
  subtle: brand.slate,
  hairline: brand.borderWarm,
  /**
   * Warm edge for selected cards and focused fields — the same hue as
   * `hairline`, a couple of steps deeper. It is the ONLY cue for the state, so
   * it is not taken lighter than this: 2.36:1 on card is already under the 3:1
   * WCAG asks of a state indicator, and going further would make selection
   * imperceptible for some users.
   */
  hairlineStrong: "#B8A685",
  green: brand.sage,
  greenActive: brand.sageStrong,
  greenDark: brand.sageStrong,
  greenSoft: brand.sageSoft,
  chartTrack: brand.sand,
  chartPartial: brand.gold,
  glow: brand.gold,
  glowSoft: brand.goldSoft,
  accent: brand.gold,
  accentBorder: "#E5A21F",
  onAccent: brand.navy,
  danger: brand.error,
  /** Danger as a FILL. `danger` itself only carries a white label at 3.25:1,
   * so a filled destructive button uses this deeper red (4.8:1) instead. */
  dangerFill: "#B9524A",
  white: "#FFFFFF",
  shadow: brand.navy
};

/** Deep navy/charcoal — never pure black — with muted pastel accents. */
export const darkPalette: LumoPalette = {
  canvas: "#121722",
  surface: "#202838",
  surfaceStrong: "#263049",
  card: "#1A2130",
  ink: "#F7F8FA",
  body: "#C3C8D0",
  muted: "#98A2B3",
  subtle: "#A8AEB9",
  hairline: "#2A3346",
  hairlineStrong: "#55648A",
  green: "#8FB47A",
  greenActive: "#A8C892",
  greenDark: "#A8C892",
  greenSoft: "#22301F",
  chartTrack: "#202838",
  chartPartial: brand.gold,
  glow: brand.gold,
  glowSoft: "#3A2F17",
  accent: brand.gold,
  accentBorder: "#E5A21F",
  onAccent: brand.navy,
  danger: "#F08A80",
  // Dark canvas: the label on a filled destructive button is the deep ink, so
  // the fill stays bright rather than darkening.
  dangerFill: "#F08A80",
  white: "#FFFFFF",
  shadow: "#000000"
};

/**
 * Contrasting pop colour for "to do" badges and vote counts — deliberately not
 * the primary sage, so it reads as a distinct state rather than an action.
 */
export const progressAccent = brand.coral;
export const progressAccentText = "#141413";

/**
 * Count badges — the header's pending-invitations pip and the tab bar's.
 *
 * Fixed, not from the palette: a badge is the same object in both themes, and
 * `palette.danger` lightens in dark mode, which is the wrong direction for
 * something carrying white text. Deep enough that white clears 4.6:1 on it —
 * `brand.error` only reaches 3.25, and the coral the header used was 2.36
 * (which is why that one carried near-black text and read as a warning chip
 * rather than a notification).
 */
export const badgeAccent = "#D0405E";
export const badgeAccentText = "#FFFFFF";

export function getPalette(isDark: boolean): LumoPalette {
  return isDark ? darkPalette : lightPalette;
}

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  ml: 20,
  lg: 24,
  xl: 32,
  hero: 40,
  xxl: 48
};

const floatingTabBarHeight = 72;

export const layout = {
  floatingTabBarHeight,
  /**
   * The horizontal gutter every screen uses. Onboarding set the standard, and
   * the rest of the app follows it. Full-bleed rows escape it with
   * `marginHorizontal: -layout.screenPaddingX`.
   *
   * NOTE: bleeds that escape a CARD's padding use that card's own value
   * instead — the two are not interchangeable.
   */
  screenPaddingX: spacing.xl,
  tabScreenBottomPadding: floatingTabBarHeight + spacing.xxl + spacing.lg
};

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  // Brand-spec steps: 18 is the default card radius, 16 the primary button.
  card: 18,
  /**
   * The softer corner the full-bleed hero cards take — the daily progress card
   * and the group cards on Home. A named step because it was two separate
   * hardcoded 30s, which read as one card having drifted from the other rather
   * than as a deliberate second tier above `card`.
   */
  hero: 30,
  button: 16,
  nav: 22,
  sheet: 28,
  pill: 9999
};

/**
 * Shared sizing for form controls (inputs, dropdown triggers, buttons) so they
 * stay visually consistent across every page — one height, one radius, one
 * border weight. Border/focus colors come from the active palette at use sites.
 */
// Field geometry, matching onboarding's inputs: boxed, with a 1pt warm
// outline that DARKENS on focus rather than thickening (a width change would
// shift the layout by a pixel on every focus).
export const control = {
  height: 52,
  radius: radius.button,
  borderWidth: 1
};

export const fontFamilies = {
  lexend: "Lexend-Regular",
  lexendMedium: "Lexend-Medium",
  lexendSemiBold: "Lexend-SemiBold",
  lexendBold: "Lexend-Bold",
  lexendBlack: "Lexend-Black",
  /**
   * Koh Santepheap — a Scotch-style serif, to give titles some editorial weight
   * against the rounded Lexend UI text.
   *
   * HEADLINES ONLY, meaning exactly two things:
   *  - the page bar's title (19pt), and
   *  - a screen's hero headline (27pt and up).
   *
   * NOT section or card headers — "My Habits", a journal month, a form section,
   * an empty state's title. At body sizes the serif stops reading as editorial
   * and just reads as a different font, and a screen ends up with two competing
   * title faces. Those all take `lexendBold`.
   */
  serif: "KohSantepheap-Regular",
  serifBold: "KohSantepheap-Bold",
  serifBlack: "KohSantepheap-Black"
};

export const type = {
  displayXL: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: 0
  } satisfies TextStyle,
  h1: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 0
  } satisfies TextStyle,
  h2: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 0
  } satisfies TextStyle,
  h3: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: 0
  } satisfies TextStyle,
  label: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0
  } satisfies TextStyle,
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
    letterSpacing: 0,
    // Every button label reads as Capitalised Words, whatever casing the call
    // site passes — set once here so no screen has to remember.
    textTransform: "capitalize"
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
