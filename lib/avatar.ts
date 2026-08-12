// Must come first: DiceBear calls structuredClone, which Hermes lacks, and the
// Style instances below are constructed at module scope.
import "@/lib/polyfills";
import { Avatar, Style } from "@dicebear/core";
import clayDefinition from "@dicebear/styles/clay.json";
import thumbsDefinition from "@dicebear/styles/thumbs.json";

/**
 * Avatars use DiceBear's "clay" style — a soft clay creature rather than the
 * human portrait avataaars drew. Clay has no hair, clothing or glasses, so the
 * config below is built from what it actually offers: a body shape, an optional
 * top and surface pattern, a face, and three colours.
 *
 * The Style instances are created once and reused; constructing one per render
 * re-parses the whole definition.
 */
const clayStyle = new Style(clayDefinition);
const thumbsStyle = new Style(thumbsDefinition);

export type AvatarConfig = {
  body: string;
  /** "none" or a variant — clay renders this on top of the body. */
  top: string;
  /** "none" or a variant — the marking on the body's surface. */
  pattern: string;
  eyes: string;
  mouth: string;
  bodyColor: string;
  accentColor: string;
  backgroundColor: string;
};

export const bodyOptions = ["blob", "pear", "boulder", "loaf", "column", "stack", "gumdrop", "dollop", "slug", "egg", "bell", "cube", "squat", "lean"];
export const topOptions = ["none", "tuft", "horns", "hornsSmall", "nub", "curl", "spikes", "antenna", "loop", "peak", "ears", "crest", "swirl", "pellet"];
export const patternOptions = ["none", "spiral", "prints", "pellets", "buttons", "stitches", "patch", "coil", "freckles", "checker", "zig"];
export const eyesOptions = ["even", "googly", "big", "tiny", "mono", "trio", "side", "outward", "inward", "dots", "happy", "wink", "down", "up", "pinprick"];
export const mouthOptions = [
  "smile",
  "smileBig",
  "smileTongue",
  "grin",
  "laugh",
  "teeth",
  "toothy",
  "open",
  "openSmall",
  "o",
  "uu",
  "cat",
  "tongue",
  "smirk",
  "line",
  "wavy",
  "zigzag",
  "dot",
  "pout",
  "frown"
];

// Clay's own palettes, kept verbatim so the colours stay in the style's range.
export const bodyColors = ["#c4795c", "#d99277", "#e0bd6a", "#cf9f52", "#a8b37e", "#8ba06b", "#83b0a4", "#86a5c3", "#9793bd", "#ab8bbd", "#cd8ea6", "#b3a696"];
export const accentColors = bodyColors;
export const backgroundColors = [
  "#f4e8d4",
  "#f8f1e5",
  "#f7e3d9",
  "#f9ecc9",
  "#eff0da",
  "#e3efe9",
  "#e2ecf4",
  "#e9e7f4",
  "#f4e4ef",
  "#ece8e2",
  "#f9e8cf",
  "#e8edf0"
];

/**
 * One random pick from every option set — what the editor's shuffle hands you.
 *
 * Deliberately unweighted, "none" included: the whole point is to reach corners
 * of the space nobody would tab through by hand, and half the appeal of a
 * shuffle is the occasional creature you would never have built yourself.
 */
export function randomAvatar(): AvatarConfig {
  const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

  return {
    body: pick(bodyOptions),
    top: pick(topOptions),
    pattern: pick(patternOptions),
    eyes: pick(eyesOptions),
    mouth: pick(mouthOptions),
    bodyColor: pick(bodyColors),
    accentColor: pick(accentColors),
    backgroundColor: pick(backgroundColors)
  };
}

export function defaultAvatar(): AvatarConfig {
  return {
    body: "blob",
    top: "tuft",
    pattern: "none",
    eyes: "even",
    mouth: "smile",
    bodyColor: "#e0bd6a",
    accentColor: "#8ba06b",
    backgroundColor: "#f9ecc9"
  };
}

function avatarOptions(config: AvatarConfig) {
  return {
    // Fixed seed — every component is pinned below, so the seed only decides
    // the handful of jitters clay randomises (the pattern's offset and tilt).
    seed: "lumo",
    bodyVariant: [config.body],
    eyesVariant: [config.eyes],
    mouthVariant: [config.mouth],
    // The style ships CSS keyframe animations; a profile picture holds still.
    animationVariant: ["none"],
    bodyColor: [config.bodyColor],
    accentColor: [config.accentColor],
    backgroundColor: [config.backgroundColor],
    // Omitted entirely when off, not passed as undefined: the options validator
    // rejects an explicit undefined for a `*Variant` key.
    ...(config.top === "none" ? { topProbability: 0 } : { topVariant: [config.top], topProbability: 100 }),
    ...(config.pattern === "none" ? { patternProbability: 0 } : { patternVariant: [config.pattern], patternProbability: 100 })
  };
}

export function buildAvatarSvg(config: AvatarConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = new Avatar(clayStyle, avatarOptions(config) as any).toString();
  // react-native-svg's parser doesn't handle the embedded RDF metadata block.
  return svg.replace(/<metadata[\s\S]*?<\/metadata>/, "");
}

// Group avatar: a deterministic DiceBear "thumbs" face seeded by the group id,
// so every member sees the same face without storing anything. Thumbs rather
// than the moods circle it used to draw — a group's mark sits beside the members'
// own clay creatures, and a plain smiley read as a placeholder next to them.
// Scaled down so the art isn't clipped by the circular containers it renders in.
//
// `scale` is a multiplier in core 10, capped at 10 — it was a percentage in
// core 9, so the 75 that used to mean "75%" is now 0.75.
//
// Cast for the same reason `buildAvatarSvg` casts: the options type a `Style`
// infers from its JSON indexes every key as a number, which the seed is not.
export function buildGroupAvatarSvg(seed: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = new Avatar(thumbsStyle, { seed, scale: 0.75 } as any).toString();

  return svg.replace(/<metadata[\s\S]*?<\/metadata>/, "");
}

/**
 * Sanitize a stored config against the current option sets.
 *
 * Avatars saved under the old avataaars style share no vocabulary with clay —
 * there is no "shortFlat" body or "shirtCrewNeck" mouth — so every field falls
 * back and those users land on the default clay creature. That is the honest
 * outcome of changing style; there is nothing to map across.
 */
export function normalizeAvatar(config?: Partial<AvatarConfig>): AvatarConfig {
  const base = defaultAvatar();

  if (!config) {
    return base;
  }

  const pick = (value: string | undefined, options: string[], fallback: string) =>
    value && options.includes(value) ? value : fallback;

  return {
    body: pick(config.body, bodyOptions, base.body),
    top: pick(config.top, topOptions, base.top),
    pattern: pick(config.pattern, patternOptions, base.pattern),
    eyes: pick(config.eyes, eyesOptions, base.eyes),
    mouth: pick(config.mouth, mouthOptions, base.mouth),
    bodyColor: pick(config.bodyColor, bodyColors, base.bodyColor),
    accentColor: pick(config.accentColor, accentColors, base.accentColor),
    backgroundColor: pick(config.backgroundColor, backgroundColors, base.backgroundColor)
  };
}
