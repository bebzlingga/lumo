import { TextStyle } from "react-native";

/**
 * LUMO design tokens.
 *
 * Colour is a THEME (hue family) crossed with a MODE (light/dark). Every
 * surface pulls from `getPalette(themeId, isDark)`, which is the one lookup the
 * whole app goes through — adding a theme means adding an entry to `THEMES`
 * below and touching no call sites.
 *
 * `cream` is the LUMO brand spec and the default: warm cream canvas, amber-brown
 * ink, sage-green primary actions, golden highlights. Its two palettes are the
 * original `lightPalette`/`darkPalette` verbatim, so an install that never opens
 * the picker renders exactly as it did before themes existed.
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
  /**
   * The page ground: one step down from `card`, and the only thing separating
   * the two.
   *
   * The app deliberately puts pages, cards and the tab shell on the same warm
   * near-white — nothing is a plate on a darker ground. At `card` exactly, that
   * near-white read as bare white on a phone at full brightness, so the PAGE
   * takes a shade off while the cards hold their value. Still far short of
   * `canvas`, which stays the deeper cream the art is cut against.
   */
  page: "#FBF7EE",
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
  // A shade under `card`. The page, the cards and the tab shell still share one
  // warm near-white — cards are told apart by their shadow and, where they have
  // one, their hairline — but the ground carries the shade so a full-brightness
  // screen does not read as plain white. See the note on `brand.canvas`, which
  // stays the deeper cream some art and gradients are cut against.
  canvas: brand.page,
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

/**
 * Deep navy/charcoal — never pure black — with muted pastel accents.
 *
 * ## Elevation is LIGHT here, not shadow
 *
 * Every dark palette in this file used to set `card` to the same value as
 * `canvas`, which was fine in light mode — there a card is told apart by its
 * shadow, and the two greys barely differ — but in dark mode `Card` draws no
 * shadow at all (it disappears against a dark ground), so a card was literally
 * invisible: the same fill as the page, no edge, no shade. Every card-based
 * screen lost its structure the moment the theme went dark.
 *
 * So the dark ramp does what dark interfaces do instead: a raised surface is
 * LIGHTER than what it sits on, and the amount of lift is the amount of
 * elevation. `canvas` is the ground, `card` a step above it, `surface` a step
 * above that, `surfaceStrong` highest. `Card` adds a hairline on top of that,
 * because a single step is a fine cue for a big panel and a weak one for a row
 * forty points tall.
 */
export const darkPalette: LumoPalette = {
  canvas: "#1A2130",
  surface: "#202838",
  surfaceStrong: "#263049",
  card: "#232C3E",
  ink: "#F7F8FA",
  body: "#C3C8D0",
  muted: "#98A2B3",
  subtle: "#A8AEB9",
  hairline: "#354059",
  hairlineStrong: "#55648A",
  green: "#8FB47A",
  greenActive: "#A8C892",
  greenDark: "#A8C892",
  greenSoft: "#22301F",
  /**
   * The empty part of a ring or a bar.
   *
   * Lifted well clear of `card`, which it used to equal — it was set to the
   * same value as `surface`, so an unfilled ring on a card was invisible and
   * three separate call sites had grown their own workaround for it
   * (`chartTrackColor`, the settings switch, the segmented control). A token
   * nobody can use as-is is not a token.
   */
  chartTrack: "#39455F",
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

// --- themes ----------------------------------------------------------------

export type ThemeId = "cream" | "forest" | "ocean" | "sunset";

export type ThemeDefinition = {
  /** Shown in the picker. */
  label: string;
  light: LumoPalette;
  dark: LumoPalette;
  /**
   * Three colours for the picker's swatch, darkest last. These are drawn from
   * the LIGHT palette even in dark mode: the swatch names a hue family, and a
   * chip that restyles itself with the mode stops being recognisable as the
   * thing you picked.
   */
  swatch: [string, string, string];
  /**
   * How strongly the background plates show through, per mode.
   *
   * The eight plates in assets/bg/ are warm cream illustrations and are NOT
   * re-tinted per theme — `LumoBackground` only varies their opacity. So the
   * further a theme's canvas sits from cream, the further its art has to
   * recede before the mismatch reads as a mistake rather than as texture.
   * Cream keeps 1 (its art is at home); the cooler themes step down.
   *
   * Multiplied into the intensity `LumoBackground` already computes, so the
   * per-screen `subtle`/`medium`/`full` ladder still applies on top.
   */
  plateOpacity: { light: number; dark: number };
};

/**
 * Every theme carries all 25 palette tokens because `LumoPalette` is
 * `typeof lightPalette` — a theme missing one fails to compile, which is how a
 * new token stays impossible to forget.
 *
 * Contrast is not eyeballed: `constants/__tests__/theme.test.ts` asserts every
 * theme × mode clears the floors cream already ships (ink 7:1 on canvas/card,
 * subtle 4.5:1, accent labels 4.5:1). Change a value here and that test is what
 * tells you whether it is still readable.
 */
export const THEMES: Record<ThemeId, ThemeDefinition> = {
  cream: {
    label: "Cream",
    light: lightPalette,
    dark: darkPalette,
    swatch: [brand.goldSoft, brand.gold, brand.sageStrong],
    plateOpacity: { light: 1, dark: 1 }
  },

  // Cool botanical green. Ink and primary are the same hue family, so the
  // amber accent is doing all the warm work — which is why it stays close to
  // cream's gold rather than going green too.
  forest: {
    label: "Forest",
    light: {
      canvas: "#FAFCF7",
      surface: "#E8EDE1",
      surfaceStrong: "#DCE3D2",
      card: "#FAFCF7",
      ink: "#23301C",
      body: "#23301C",
      muted: "#8A9682",
      subtle: "#59654F",
      hairline: "#CFD9C2",
      hairlineStrong: "#9FAF8E",
      green: "#5D9150",
      greenActive: "#46743B",
      greenDark: "#46743B",
      greenSoft: "#E0EBD6",
      chartTrack: "#CFD9C2",
      chartPartial: "#E8A33D",
      glow: "#E8A33D",
      glowSoft: "#FBEBCF",
      accent: "#E8A33D",
      accentBorder: "#D08E28",
      onAccent: "#23301C",
      danger: "#D9614F",
      dangerFill: "#A94636",
      white: "#FFFFFF",
      shadow: "#23301C"
    },
    dark: {
      canvas: "#16231A",
      surface: "#1B2A1E",
      surfaceStrong: "#223526",
      card: "#1F2F23",
      ink: "#F2F7F0",
      body: "#C2CFBE",
      muted: "#8FA08C",
      subtle: "#A6B5A2",
      hairline: "#304534",
      hairlineStrong: "#4E6B52",
      green: "#7FB06E",
      greenActive: "#9BCB88",
      greenDark: "#9BCB88",
      greenSoft: "#1E2E1C",
      chartTrack: "#344A38",
      chartPartial: "#E8A33D",
      glow: "#E8A33D",
      glowSoft: "#33290F",
      accent: "#E8A33D",
      accentBorder: "#D08E28",
      onAccent: "#23301C",
      danger: "#EE8878",
      // Dark canvas: a filled destructive button carries the deep ink as its
      // label, so the fill stays bright rather than darkening. Same reasoning
      // as cream's dark palette.
      dangerFill: "#EE8878",
      white: "#FFFFFF",
      shadow: "#000000"
    },
    swatch: ["#E0EBD6", "#5D9150", "#23301C"],
    plateOpacity: { light: 0.7, dark: 0.85 }
  },

  // Cool blue-teal. The furthest from cream, so its plates recede the most.
  ocean: {
    label: "Ocean",
    light: {
      canvas: "#F9FCFD",
      surface: "#E5ECF1",
      surfaceStrong: "#D6E1E9",
      card: "#F9FCFD",
      ink: "#16303D",
      body: "#16303D",
      muted: "#8496A0",
      subtle: "#52646F",
      hairline: "#C7D6DF",
      hairlineStrong: "#94AAB8",
      green: "#3E93A0",
      greenActive: "#2C7280",
      greenDark: "#2C7280",
      greenSoft: "#D9EDF0",
      chartTrack: "#C7D6DF",
      chartPartial: "#E9A83C",
      glow: "#E9A83C",
      glowSoft: "#FBEDD1",
      accent: "#E9A83C",
      accentBorder: "#D0912A",
      onAccent: "#16303D",
      danger: "#DE6257",
      dangerFill: "#AD4739",
      white: "#FFFFFF",
      shadow: "#16303D"
    },
    dark: {
      canvas: "#121D28",
      surface: "#17242F",
      surfaceStrong: "#1F2E3C",
      card: "#1C2935",
      ink: "#F0F6FA",
      body: "#BCC9D3",
      muted: "#8A9AA8",
      subtle: "#A2B1BD",
      hairline: "#2D3F4D",
      hairlineStrong: "#4A6274",
      green: "#58A9B6",
      greenActive: "#76C4D0",
      greenDark: "#76C4D0",
      greenSoft: "#172E33",
      chartTrack: "#324453",
      chartPartial: "#E9A83C",
      glow: "#E9A83C",
      glowSoft: "#322914",
      accent: "#E9A83C",
      accentBorder: "#D0912A",
      onAccent: "#16303D",
      danger: "#EF8B7E",
      dangerFill: "#EF8B7E",
      white: "#FFFFFF",
      shadow: "#000000"
    },
    swatch: ["#D9EDF0", "#3E93A0", "#16303D"],
    plateOpacity: { light: 0.6, dark: 0.8 }
  },

  // Warm rose and terracotta. Closest in warmth to cream, so its plates keep
  // most of their weight.
  sunset: {
    label: "Sunset",
    light: {
      canvas: "#FEF9F7",
      surface: "#F5E8E2",
      surfaceStrong: "#EBD9D1",
      card: "#FEF9F7",
      ink: "#3F2029",
      body: "#3F2029",
      muted: "#A08C8F",
      subtle: "#705A5E",
      hairline: "#E8D0C6",
      hairlineStrong: "#C0A79C",
      green: "#C4674A",
      greenActive: "#A44F35",
      greenDark: "#A44F35",
      greenSoft: "#FADFD4",
      chartTrack: "#E8D0C6",
      chartPartial: "#E2A32F",
      glow: "#E2A32F",
      glowSoft: "#FBEBCB",
      accent: "#E2A32F",
      accentBorder: "#C88C1F",
      onAccent: "#3F2029",
      danger: "#D6544F",
      dangerFill: "#A83C37",
      white: "#FFFFFF",
      shadow: "#3F2029"
    },
    dark: {
      canvas: "#20141B",
      surface: "#291A22",
      surfaceStrong: "#33212B",
      card: "#302028",
      ink: "#FAF2F4",
      body: "#D0BEC4",
      muted: "#A08E95",
      subtle: "#B4A2A8",
      hairline: "#4B333E",
      hairlineStrong: "#614350",
      green: "#D9805F",
      greenActive: "#EE9C79",
      greenDark: "#EE9C79",
      greenSoft: "#33201A",
      chartTrack: "#513743",
      chartPartial: "#E2A32F",
      glow: "#E2A32F",
      glowSoft: "#382A12",
      accent: "#E2A32F",
      accentBorder: "#C88C1F",
      onAccent: "#3F2029",
      danger: "#EE8078",
      dangerFill: "#EE8078",
      white: "#FFFFFF",
      shadow: "#000000"
    },
    swatch: ["#FADFD4", "#C4674A", "#3F2029"],
    plateOpacity: { light: 0.85, dark: 0.9 }
  }
};

/**
 * Whether the Appearance settings exist at all — the master switch.
 *
 * ON — Light / Dark / System is live, with dark cuts of the background art
 * (see `darkBackgroundAsset`). Turned off, `LumoContext` pins BOTH the mode and
 * the theme to light cream: both, not just one, because hiding a control
 * without pinning its value strands anyone who had already switched — the card
 * that would let them switch back is the card being hidden.
 *
 * The dark palettes below are NOT dead. They are built, and as of the elevation
 * ramp above they are correct on a dark screen rather than shipping cards the
 * same colour as the page behind them. What they have not had is time on real
 * hardware across every screen, which is the whole reason this is a switch and
 * not a deletion.
 *
 * It pins at RESOLUTION rather than by rewriting stored settings, which is what
 * makes it safe to flip either way — an install that chose dark while it was on
 * still has that choice waiting, and gets it back untouched when this returns.
 */
export const APPEARANCE_ENABLED = true;

/**
 * Whether the THEME picker exists — nested inside the switch above.
 *
 * Two flags because they are two decisions, and they will not necessarily come
 * back together. A MODE is the same app lit for a dark room; the hue families
 * are four palettes across every screen, which is four times the surface to get
 * wrong. So the mode can ship on its own one day, and the picker stays behind
 * this until its four palettes have each had the same walk.
 *
 * Moot while `APPEARANCE_ENABLED` is false — the card it lives in is hidden
 * either way — and it still governs `themeId`, so nothing depends on the order
 * the two are turned back on in.
 */
export const THEME_PICKER_ENABLED = false;

/** Picker order. Cream leads because it is the default and the brand. */
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export const DEFAULT_THEME_ID: ThemeId = "cream";

/** Narrows anything stored (or imported from an older build) to a real theme. */
export function normalizeThemeId(value: unknown): ThemeId {
  return typeof value === "string" && value in THEMES ? (value as ThemeId) : DEFAULT_THEME_ID;
}

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

/**
 * The app's single colour lookup. `themeId` is tolerant of anything stored —
 * a theme removed in a later build resolves back to cream rather than crashing
 * an install that had it selected.
 */
export function getPalette(themeId: ThemeId, isDark: boolean): LumoPalette {
  const theme = THEMES[themeId] ?? THEMES[DEFAULT_THEME_ID];

  return isDark ? theme.dark : theme.light;
}

/** How far the background plates recede for this theme and mode. See `plateOpacity`. */
export function themePlateOpacity(themeId: ThemeId, isDark: boolean): number {
  const theme = THEMES[themeId] ?? THEMES[DEFAULT_THEME_ID];

  return isDark ? theme.plateOpacity.dark : theme.plateOpacity.light;
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

/**
 * The fill behind every filled primary button, app-wide.
 *
 * FIXED rather than themed, and that is the point. `palette.greenDark` flips to
 * a LIGHT green in dark mode (and to teal or coral under other themes), none of
 * which can carry a white label at 4.5:1 — which is why call sites had started
 * growing `isDark ? onAccent : white` workarounds. One constant means one
 * answer, and the label is plain white everywhere.
 *
 * The alpha sits on the FILL only, so an illustrated backdrop shows through the
 * button while the label stays fully opaque. Matches onboarding's CtaButton.
 */
export const CTA_FILL = `${brand.sageStrong}CC`;

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

/**
 * The corner ladder. One scale, and everything in the app takes a step on it.
 *
 * Two halves, because they answer different questions.
 *
 * **The numbered steps (`xs`–`xl`) go by SIZE.** A corner is only soft in
 * proportion to what it is on: 10pt on a 17pt calendar cell is a circle, and
 * 10pt on a full-width card is barely a corner at all. These climb gently, and
 * the small end deliberately climbs least — the things wearing `xs` and `sm`
 * are chart bars and date cells, where a big radius eats the shape itself.
 *
 * **The named steps go by ROLE**, and they are what almost everything uses:
 * `button`, `card`, `nav`, `sheet`, `hero`, `dialog`. They exist so a corner is
 * chosen by what a thing IS rather than by how big it happens to be, which is
 * what keeps two cards on different screens agreeing. They also climb with how
 * far the surface floats above the page: a card lying on a page is tighter than
 * a nav shell over it, which is tighter than a sheet on a scrim.
 *
 * Adding a hardcoded `borderRadius: 14` anywhere is how a set of corners drifts
 * apart — take a step here instead, and add one if none of them fits.
 */
export const radius = {
  // Chart bars, calendar cells, the date strip — small enough that the corner
  // is a hint rather than a shape.
  xs: 6,
  sm: 9,
  md: 14,
  lg: 18,
  xl: 22,
  /** Buttons, inputs and every other form control — see `control`. */
  button: 20,
  /** The default for anything card-shaped. By far the most-used step. */
  card: 24,
  /** Nav shells and segmented bars: floating chrome, so softer than a card. */
  nav: 28,
  /**
   * The softer corner the full-bleed hero cards take — the daily progress card
   * and the group cards on Home. A named step because it was two separate
   * hardcoded 30s, which read as one card having drifted from the other rather
   * than as a deliberate second tier above `card`.
   */
  hero: 34,
  sheet: 34,
  /**
   * Every modal card in the app — pickers, celebrations, invite sheets.
   *
   * The date and time pickers set the shape long before the rest arrived, and
   * a dialog that opens at a different corner than the last one reads as a
   * different app. The top of the ladder: a sheet floating on a scrim carries a
   * softer corner than anything lying on a page.
   */
  dialog: 44,
  pill: 9999
};

/**
 * The corner for a square icon tile, worked out from its side.
 *
 * A function rather than a step on the ladder, because this is the one place a
 * fixed number cannot work: the app's glyph tiles run from 40 to 72pt, and any
 * single radius that is a squircle on 72 is a circle on 40. Nothing about a
 * tile's shape should change with its size — only its corner, in proportion.
 *
 * 34% of the side is the squircle every icon tile in the app wears. Half would
 * be a circle; the app has those too, and they say `radius.pill` so a reader
 * can tell a deliberate circle from a corner that grew into one.
 */
export function tileRadius(size: number): number {
  return Math.round(size * 0.34);
}

/**
 * The corner for a short single-line row, worked out from its height.
 *
 * The same problem `tileRadius` solves, one axis over. `radius.card` is drawn
 * for something with paragraphs in it; on a 44–58pt row it is nearly half the
 * height, and the row comes out a lozenge. A card that happens to be one line
 * tall is still a card, and should not change shape because of what is in it.
 *
 * Capped at `radius.card`, so a tall row keeps the ordinary card corner and
 * only short ones are pulled in.
 */
export function rowRadius(height: number): number {
  return Math.min(radius.card, Math.round(height * 0.3));
}

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

/**
 * What chrome wears when it sits ON the backdrop art rather than on flat canvas:
 * Home's date pill, the page-bar tab pill on Move and Friends, and the round 38pt
 * header buttons either side of both.
 *
 * A SEMI-TRANSPARENT card fill, never a solid one. Up on the plate's sky a solid
 * chip reads as pasted over the artwork; at this alpha the scene shows through and
 * the control reads as sitting on it. The soft shadow is what separates it from a
 * busy plate without a heavier outline — and it is dropped in dark mode at the use
 * site, where the navy has nothing to catch it.
 *
 * One token because these controls sit side by side in the SAME BAR, where any
 * drift between them is visible at a glance. It was three hand-matched copies —
 * the date pill, the tab pill, and Home's avatar button — before the header
 * buttons were given the surface too and made it four.
 *
 * `fill` is the alpha suffix for `alpha(palette.card, …)`; the shadow's COLOUR
 * comes from the palette at the use site, so only its geometry lives here.
 */
export const onArtChrome = {
  fill: "A6",
  shadow: {
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  }
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
/**
 * Points added to every rendered type and icon size, per accessibility step,
 * applied AFTER `fontScaleForWidth` has done its proportional work.
 *
 * Additive rather than a multiplier on purpose: a multiplier would move a 28pt
 * title four times as far as a 12pt caption, so long headings would start
 * wrapping well before body copy became comfortable to read.
 *
 * Read in exactly two places — `scaleTextStyle` in components/ui.tsx, which
 * every AppText and LumoInput passes through, and the `Icon` component. Icons
 * move with the text so that a row's glyph doesn't shrink against its label.
 */
export const TEXT_SIZE_BUMP: Record<"default" | "large" | "larger", number> = {
  default: 0,
  large: 2,
  larger: 4
};

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
