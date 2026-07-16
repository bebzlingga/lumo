import { createAvatar } from "@dicebear/core";
import * as avataaars from "@dicebear/avataaars";
import * as thumbs from "@dicebear/thumbs";

export type AvatarGender = "male" | "female";

// Portrait avatar config (DiceBear "avataaars"). Hair and headwear share one
// visual slot, so we store them separately and merge at render time — that way
// removing a hat restores the previously chosen hair.
export type AvatarConfig = {
  gender: AvatarGender;
  skinColor: string;
  hair: string;
  headwear: string; // "none" or a hat value
  hairColor: string;
  hatColor: string;
  eyes: string;
  eyebrows: string;
  mouth: string;
  facialHair: string; // "none" or a value
  facialHairColor: string;
  accessories: string; // "none" or a glasses value
  clothing: string;
  clothesColor: string;
};

// Gender-dependent style sets.
export const hairOptions: Record<AvatarGender, string[]> = {
  female: ["straight01", "straight02", "straightAndStrand", "bob", "bun", "curly", "curvy", "longButNotTooLong", "miaWallace", "bigHair", "frida", "froBand"],
  male: ["shortFlat", "shortRound", "shortWaved", "shortCurly", "theCaesar", "theCaesarAndSidePart", "sides", "shavedSides", "dreads01", "dreads02", "fro", "frizzle", "shaggy", "shaggyMullet"]
};

export const headwearOptions: Record<AvatarGender, string[]> = {
  female: ["none", "hat", "turban", "hijab", "winterHat1", "winterHat02", "winterHat03", "winterHat04"],
  male: ["none", "hat", "turban", "winterHat1", "winterHat02", "winterHat03", "winterHat04"]
};

export const facialHairOptions: Record<AvatarGender, string[]> = {
  female: ["none"],
  male: ["none", "beardLight", "beardMedium", "beardMajestic", "moustacheFancy", "moustacheMagnum"]
};

export const eyesOptions = ["default", "happy", "wink", "squint", "surprised", "hearts", "side", "closed"];
export const eyebrowsOptions = ["defaultNatural", "default", "flatNatural", "raisedExcited", "angryNatural", "sadConcerned", "upDown"];
export const mouthOptions = ["default", "smile", "twinkle", "serious", "tongue", "grimace", "eating"];
export const accessoriesOptions = ["none", "round", "wayfarers", "sunglasses", "prescription01", "prescription02", "kurt"];
export const clothingOptions = ["shirtCrewNeck", "shirtVNeck", "shirtScoopNeck", "hoodie", "collarAndSweater", "blazerAndShirt", "blazerAndSweater", "graphicShirt", "overall"];

// Color palettes (hex without #).
export const skinColors = ["614335", "8d5524", "ae5d29", "d08b5b", "edb98a", "ffdbb4", "fd9841", "f8d25c"];
export const hairColors = ["2c1b18", "4a312c", "724133", "a55728", "b58143", "d6b370", "c93305", "e8e1e1", "ecdcbf", "f59797"];
export const clothesColors = ["262e33", "3c4f5c", "25557c", "5199e4", "65c9ff", "929598", "ff488e", "ff5c5c", "a7ffc4", "ffffb1", "e6e6e6", "ffffff"];

export function defaultAvatar(): AvatarConfig {
  return {
    gender: "male",
    skinColor: "edb98a",
    hair: "shortFlat",
    headwear: "none",
    hairColor: "2c1b18",
    hatColor: "3c4f5c",
    eyes: "default",
    eyebrows: "defaultNatural",
    mouth: "smile",
    facialHair: "none",
    facialHairColor: "2c1b18",
    accessories: "none",
    clothing: "shirtCrewNeck",
    clothesColor: "5199e4"
  };
}

function topFor(config: AvatarConfig) {
  return config.headwear === "none" ? config.hair : config.headwear;
}

function avatarOptions(config: AvatarConfig) {
  return {
    // Fixed seed — baked into every rendered avatar; changing it would alter
    // all existing users' avatars.
    seed: "lumo",
    backgroundColor: [] as string[],
    top: [topFor(config)],
    hairColor: [config.hairColor],
    hatColor: [config.hatColor],
    eyes: [config.eyes],
    eyebrows: [config.eyebrows],
    mouth: [config.mouth],
    facialHair: config.facialHair === "none" ? [] : [config.facialHair],
    facialHairColor: [config.facialHairColor],
    facialHairProbability: config.facialHair === "none" ? 0 : 100,
    accessories: config.accessories === "none" ? [] : [config.accessories],
    accessoriesProbability: config.accessories === "none" ? 0 : 100,
    clothing: [config.clothing],
    clothesColor: [config.clothesColor],
    skinColor: [config.skinColor]
  };
}

export function buildAvatarSvg(config: AvatarConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = createAvatar(avataaars, avatarOptions(config) as any).toString();
  // react-native-svg's parser doesn't handle the embedded RDF metadata block.
  return svg.replace(/<metadata[\s\S]*?<\/metadata>/, "");
}

// Group avatar: deterministic DiceBear "thumbs" face seeded by the group id,
// so every member sees the same face without storing anything. Scaled down so
// the square art isn't clipped by the circular containers it renders in.
export function buildGroupAvatarSvg(seed: string) {
  const svg = createAvatar(thumbs, { seed, scale: 75 }).toString();

  return svg.replace(/<metadata[\s\S]*?<\/metadata>/, "");
}

// Sanitize a possibly-stale/partial stored config against the current option
// sets (and gender rules).
export function normalizeAvatar(config?: Partial<AvatarConfig>): AvatarConfig {
  const base = defaultAvatar();
  if (!config) {
    return base;
  }

  const gender: AvatarGender = config.gender === "female" ? "female" : "male";
  const pick = (value: string | undefined, options: string[], fallback: string) =>
    value && options.includes(value) ? value : fallback;

  return {
    gender,
    skinColor: pick(config.skinColor, skinColors, base.skinColor),
    hair: pick(config.hair, hairOptions[gender], hairOptions[gender][0]),
    headwear: pick(config.headwear, headwearOptions[gender], "none"),
    hairColor: pick(config.hairColor, hairColors, base.hairColor),
    hatColor: pick(config.hatColor, clothesColors, base.hatColor),
    eyes: pick(config.eyes, eyesOptions, base.eyes),
    eyebrows: pick(config.eyebrows, eyebrowsOptions, base.eyebrows),
    mouth: pick(config.mouth, mouthOptions, base.mouth),
    facialHair: pick(config.facialHair, facialHairOptions[gender], "none"),
    facialHairColor: pick(config.facialHairColor, hairColors, base.facialHairColor),
    accessories: pick(config.accessories, accessoriesOptions, "none"),
    clothing: pick(config.clothing, clothingOptions, base.clothing),
    clothesColor: pick(config.clothesColor, clothesColors, base.clothesColor)
  };
}
