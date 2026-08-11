type OrientationModule = typeof import("expo-screen-orientation");

/**
 * Device orientation control that degrades to nothing when the native module is
 * not in the binary.
 *
 * `expo-screen-orientation` resolves its native module at IMPORT time, so a
 * plain top-level import throws "Cannot find native module
 * 'ExpoScreenOrientation'" on any build made before it was added — and because
 * the root layout is one of the importers, that throw takes the whole app down
 * rather than just the screen that wanted to rotate.
 *
 * Deferred require inside a try/catch is the same shape `lib/iap.ts` uses for
 * `react-native-iap`, and for the same reason: the JS bundle reloads instantly,
 * the native binary does not, and the gap between them should cost a feature
 * rather than the app.
 *
 * Once the app is rebuilt this starts working with no code change.
 */
let cached: OrientationModule | null | undefined;

function load(): OrientationModule | null {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require("expo-screen-orientation") as OrientationModule;
    } catch {
      cached = null;
    }
  }

  return cached;
}

/**
 * True when the device can actually be rotated under program control.
 *
 * Callers use this to hide the affordance rather than to offer a button that
 * does nothing — a "Focus mode" that silently stays portrait is worse than one
 * that isn't there yet.
 */
export function canControlOrientation(): boolean {
  return load() !== null;
}

async function lock(pick: (module: OrientationModule) => number): Promise<void> {
  const module = load();

  if (!module) {
    return;
  }

  try {
    await module.lockAsync(pick(module));
  } catch {
    // Locking can reject on a device that refuses the orientation (an iPad in
    // Split View, say). Nothing to do but leave it where it is.
  }
}

export function lockPortrait(): Promise<void> {
  return lock((module) => module.OrientationLock.PORTRAIT_UP);
}

export function lockLandscape(): Promise<void> {
  return lock((module) => module.OrientationLock.LANDSCAPE);
}
