import { Alert, Platform } from "react-native";

/**
 * The prominent disclosure Google Play requires before background location is
 * ever requested.
 *
 * ## Why this exists as its own gate rather than better permission copy
 *
 * Android's own background-location dialog says almost nothing — it offers
 * "Allow all the time" against the app name and no reason. Google Play's Location
 * Permissions policy therefore requires the app to explain itself FIRST, in its
 * own words, and to get an affirmative tap before the system dialog appears. An
 * app that calls `requestBackgroundPermissionsAsync` cold is rejected on review
 * regardless of how good its manifest strings are, because the reviewer never
 * sees them.
 *
 * The policy is specific about what the disclosure has to do, and each clause
 * below maps to one of its requirements:
 *
 *  - name the data (location),
 *  - say it is collected in the background — "even when you are not using the
 *    app" is the phrasing Google's own examples use,
 *  - say what it is used for, in terms of a feature the reader recognises,
 *  - be dismissible only by an explicit choice, not by tapping outside.
 *
 * ## Why iOS returns true without showing anything
 *
 * Apple solves the same problem in the opposite direction: `NSLocationAlwaysAnd
 * WhenInUseUsageDescription` is shown inside the system dialog, so the
 * explanation and the choice are already one screen. A second Lumo-drawn dialog
 * in front of it would be two prompts for one decision, which is worse for the
 * reader and is not asked for by anybody.
 *
 * ## Why it is not remembered
 *
 * There is no "seen it" flag on purpose. The caller only reaches this when the
 * permission is NOT already granted, so the only person who sees it twice is
 * somebody who declined — and re-explaining before asking again is exactly what
 * the policy wants. A stored flag would let the second request through with no
 * disclosure at all, which is the failure this file exists to prevent.
 */

/** What the reader is told, kept here so review screenshots and copy stay in one place. */
export const BACKGROUND_LOCATION_DISCLOSURE =
  "Lumo collects location data to trace the route of your walk and measure how far you went — " +
  "even when the app is closed or not in use.\n\n" +
  "This happens only while a walk is recording, and stops the moment you finish it. " +
  "Your route stays on your device unless you choose to share it.";

/**
 * Shows the disclosure and resolves with the reader's answer.
 *
 * Resolves false on decline, which the caller must treat as "do not request the
 * permission" — not as "request it anyway and let the OS ask". Asking after a
 * decline is the same policy violation as asking without disclosing.
 */
export function requestBackgroundLocationConsent(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      "Keep recording in the background?",
      BACKGROUND_LOCATION_DISCLOSURE,
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ],
      // Policy: the disclosure must not be dismissable without a choice, so a
      // tap outside or a back press cannot count as consent.
      { cancelable: false, onDismiss: () => resolve(false) }
    );
  });
}
