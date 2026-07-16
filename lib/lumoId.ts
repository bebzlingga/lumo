/**
 * Lumo IDs identify a user for the Friends feature. A short standalone code is
 * generated once per install and displayed as `LUMO-8F3K-2Q` — independent of
 * the nickname, so profile changes never break friendships. Ambiguous
 * characters (0/O, 1/I/L) are excluded so IDs survive being read aloud or
 * retyped from a screenshot.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateLumoSuffix(length = 6) {
  let suffix = "";

  for (let index = 0; index < length; index++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }

  return suffix;
}

export function formatLumoId(suffix: string) {
  return `LUMO-${suffix.slice(0, 4)}-${suffix.slice(4)}`;
}

/** Deep link encoded into QR codes and invite messages. */
export function friendInviteLink(suffix: string) {
  return `lumo://add-friend?id=${encodeURIComponent(formatLumoId(suffix))}`;
}
