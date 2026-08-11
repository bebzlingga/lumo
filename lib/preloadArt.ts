import { Asset } from "expo-asset";

/**
 * Warms the background plates so switching screens does not flash the canvas.
 *
 * ## What the flash actually is
 *
 * A plate is a `require`d image, and React Native does not resolve one until
 * the `<Image>` that references it mounts. Until it is ready the image draws
 * nothing, so the canvas colour shows through and then the artwork pops in —
 * which reads as the background loading late.
 *
 * **It is far worse in a development build.** There, `require`d assets are
 * fetched over HTTP from the Metro packager on first use; in a release build
 * they are already on disk and only need decoding. So some of what this fixes
 * would have gone away at ship time on its own — but not all of it, and a
 * first-run decode is still visible on a cold launch.
 *
 * Called once at startup and deliberately NOT awaited: a slower launch to avoid
 * a brief flash on a screen nobody may open is the wrong trade. The plates warm
 * behind the splash, and anything still cold simply loads the way it did before.
 */
const PLATES = [
  // Move's own, which is the pair a user switches between most.
  require("../assets/walk/LumoWalking.webp"),
  require("../assets/walk/LumoWalked.webp"),
  // The app-wide default every form and most screens sit on.
  require("../assets/bg/02_today.webp")
];

export function preloadBackgroundArt(): void {
  Asset.loadAsync(PLATES).catch(() => {
    // A plate that fails to warm loads on demand, exactly as it did before —
    // there is nothing to recover and nothing worth telling anyone about.
  });
}
