import { habitColorPickerOptions } from "@/constants/theme";
import { contrastRatio, readableOn } from "../color";

const LIGHT_CARD = "#FFFEFA";
const DARK_CARD = "#1A2130";

describe("readableOn", () => {
  it("returns colours that already clear the target untouched", () => {
    // The original bug darkened EVERY colour to near-black, because
    // `shadeWithBlack`'s amount is the share of the original kept — so the
    // search has to count down from 1, not up from 0.
    for (const option of habitColorPickerOptions) {
      if (contrastRatio(option.accent, LIGHT_CARD) >= 3) {
        expect(readableOn(option.accent, LIGHT_CARD)).toBe(option.accent);
      }
    }
  });

  it("makes every picker accent legible on the light card", () => {
    for (const option of habitColorPickerOptions) {
      expect(contrastRatio(readableOn(option.accent, LIGHT_CARD), LIGHT_CARD)).toBeGreaterThanOrEqual(3);
    }
  });

  it("lightens rather than darkens on a dark surface", () => {
    for (const option of habitColorPickerOptions) {
      expect(contrastRatio(readableOn(option.accent, DARK_CARD), DARK_CARD)).toBeGreaterThanOrEqual(3);
    }
  });

  it("preserves hue rather than collapsing toward black", () => {
    // An amber must still read amber after adjustment: red stays the dominant
    // channel and stays well clear of the blue channel.
    const adjusted = readableOn("#F9941E", LIGHT_CARD).replace("#", "");
    const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(adjusted.slice(offset, offset + 2), 16));

    expect(red).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(blue);
    expect(red - blue).toBeGreaterThan(80);
  });

  it("passes through values it cannot parse", () => {
    expect(readableOn("rgba(0,0,0,0.5)", LIGHT_CARD)).toBe("rgba(0,0,0,0.5)");
  });
});
