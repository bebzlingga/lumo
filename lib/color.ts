/**
 * Appends a two-character hex alpha channel to a 6-digit hex color.
 * Returns the color unchanged if it is not a `#rrggbb` value, so it is safe
 * to call on palette tokens that may already include alpha or use other formats.
 */
export function alpha(color: string, value: string) {
  return color.startsWith("#") && color.length === 7 ? `${color}${value}` : color;
}
