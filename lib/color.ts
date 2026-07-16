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
