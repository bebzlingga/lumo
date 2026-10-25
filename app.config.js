/**
 * Everything static lives in `app.json`; this file exists for the one value that
 * cannot.
 *
 * ## Why the Google Maps key is not in app.json
 *
 * react-native-maps has no Apple Maps fallback on Android — every map in the app
 * (the walk route, the live preview on the Move tab) is Google Maps there, and
 * Google Maps renders a grey rectangle with no error and no crash when the key is
 * missing. A wrong key looks exactly like a working build until someone opens a
 * walk, which is the worst possible failure mode to leave to a placeholder string
 * somebody has to remember to replace.
 *
 * So it comes from the environment, and an Android build without it FAILS rather
 * than shipping the grey rectangle. Locally that is a line in `.env`; on EAS it is
 * an environment variable on the build profile.
 *
 * The key itself is not really a secret — an Android Maps key is restricted to the
 * package name plus the signing certificate's SHA-1 fingerprint, so a copy of it is
 * useless from any other app. It is kept out of the repo for hygiene, not safety,
 * and there is no harm in it appearing in EAS build logs.
 *
 * ## Why the guard is platform-conditional
 *
 * iOS uses Apple Maps and needs no key at all. Throwing unconditionally would break
 * every iOS build on a machine that has no reason to hold an Android credential.
 * `EAS_BUILD_PLATFORM` is set on EAS builds; local `expo run:android` is caught by
 * the second check.
 */

// `EAS_BUILD_PLATFORM` covers EAS. Locally the platform only appears in the
// command itself, and it appears in three different shapes — `run:android`,
// `--platform android`, `-p android` — so this matches the word wherever it
// lands rather than trying to enumerate the flags.
const isAndroidBuild =
  process.env.EAS_BUILD_PLATFORM === "android" || /\bandroid\b/.test(process.argv.slice(2).join(" "));

module.exports = ({ config }) => {
  const apiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

  if (isAndroidBuild && !apiKey) {
    throw new Error(
      "GOOGLE_MAPS_ANDROID_API_KEY is not set. Android maps render as a blank grey " +
        "square without it. Add it to .env for local builds, or to the build profile's " +
        "env in eas.json for EAS builds."
    );
  }

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...(config.android && config.android.config),
        googleMaps: { apiKey },
      },
    },
  };
};
