/**
 * Appends a two-character hex alpha channel to a 6-digit hex color.
 * Returns the color unchanged if it is not a `#rrggbb` value, so it is safe
 * to call on palette tokens that may already include alpha or use other formats.
 */
export function alpha(color: string, value: string) {
  return color.startsWith("#") && color.length === 7 ? `${color}${value}` : color;
}

/**
 * Blends a `#rrggbb` color toward white, returning a solid pastel of the same
 * hue. `amount` is the share of the original color kept (0–1), e.g. 0.14 →
 * 14% color / 86% white. Unlike `alpha`, the result is opaque, so it reads the
 * same over any backdrop. Non-`#rrggbb` values pass through unchanged.
 */
export function tintWithWhite(color: string, amount: number) {
  if (!color.startsWith("#") || color.length !== 7) {
    return color;
  }

  const channel = (offset: number) => {
    const value = parseInt(color.slice(offset, offset + 2), 16);
    const mixed = Math.round(255 - (255 - value) * amount);
    return mixed.toString(16).padStart(2, "0");
  };

  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/**
 * Blends a `#rrggbb` color toward black, returning a deeper shade of the same
 * hue. `amount` is the share of the original kept (0–1), e.g. 0.55 → 55% color
 * / 45% black. Useful for turning a pastel accent into a fill that can carry
 * white content. Non-`#rrggbb` values pass through unchanged.
 */
export function shadeWithBlack(color: string, amount: number) {
  if (!color.startsWith("#") || color.length !== 7) {
    return color;
  }

  const channel = (offset: number) => {
    const value = parseInt(color.slice(offset, offset + 2), 16);
    return Math.round(value * amount)
      .toString(16)
      .padStart(2, "0");
  };

  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/**
 * Adjust `color` just enough to clear a contrast ratio against `background`.
 *
 * The habit palette is built for fills, so several swatches (the ambers and
 * corals especially) sit under 3:1 on a light surface and vanish when used as
 * a glyph colour. This walks the colour AWAY from the background — toward
 * black on a light surface, toward white on a dark one — and stops at the
 * first step that clears `target`, so the hue is preserved and only as much
 * adjustment as necessary is applied.
 *
 * NOTE the `amount` convention shared with `shadeWithBlack`/`tintWithWhite`:
 * it is the share of the ORIGINAL colour kept, so it counts DOWN from 1.
 * Counting up from 0 would return near-black on the first step.
 */
export function readableOn(color: string, background: string, target = 3): string {
  if (!color.startsWith("#") || color.length !== 7) {
    return color;
  }

  const towardWhite = relativeLuminance(background) < 0.5;

  for (let keep = 1; keep >= 0.2; keep -= 0.05) {
    const candidate = keep >= 1 ? color : towardWhite ? tintWithWhite(color, keep) : shadeWithBlack(color, keep);

    if (contrastRatio(candidate, background) >= target) {
      return candidate;
    }
  }

  return towardWhite ? tintWithWhite(color, 0.2) : shadeWithBlack(color, 0.2);
}

function channelLuminance(channel: number) {
  const ratio = channel / 255;

  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance per WCAG 2.1. Expects a `#RRGGBB` string. */
function relativeLuminance(color: string) {
  const hex = color.replace("#", "").slice(0, 6);
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);

  return 0.2126 * channelLuminance(red) + 0.7152 * channelLuminance(green) + 0.0722 * channelLuminance(blue);
}

/** WCAG contrast ratio between two `#RRGGBB` colours. */
export function contrastRatio(a: string, b: string) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}
