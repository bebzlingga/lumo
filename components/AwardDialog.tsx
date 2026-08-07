import * as Sharing from "expo-sharing";
import React from "react";
import { Alert, Animated, Easing, Image, Modal, StyleSheet, View, useWindowDimensions } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import { Icon, type IconName } from "@/components/Icon";
// NOT react-native's Pressable: NativeWind's cssInterop collects a
// function-valued `style` into an array, so RN never calls it and anything
// styled that way renders unstyled. This wrapper resolves the callback first.
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { BACKGROUND_ASPECT, backgroundAsset } from "@/constants/backgroundAssets";
import { control, fontFamilies, radius, spacing } from "@/constants/theme";
import { alpha } from "@/lib/color";

/** The award's art, drawn at the size the card gives it. */
const ART_SIZE = 196;
/** The unlock confetti, with the earned tier's own accent led in. */
const CONFETTI_COLORS = ["#FFC94D", "#4BA97A", "#5B9BD5", "#E8871A", "#D0405E", "#FFFFFF"];

export type AwardDialogContent = {
  /**
   * Stable identity for the award being shown. The entrance animation keys off
   * this rather than off the object, so a caller may build the content inline
   * every render without restarting the animation on each one.
   */
  id: string;
  /** Small-caps line above the art — "BADGE UNLOCKED", "GOLD TROPHY". */
  kicker: string;
  title: string;
  description: string;
  earned: boolean;
  /** Draws the award at the given size — badge art and trophy art differ. */
  renderArt: (size: number) => React.ReactNode;
  /** Locked only: how far along, e.g. "12 / 30 day streak". */
  lockLabel?: string;
  /** Leads the unlock confetti. */
  accent: string;
};

/**
 * THE award card. One card for every kind of award in the app — streak badges,
 * group trophies, and the unlock celebration — so an award looks the same
 * wherever it appears and whoever earned it. There is no browse version and a
 * congratulations version.
 *
 * It doubles as the shareable image: `cardRef` is what gets rasterised, and the
 * Share button deliberately sits outside it.
 *
 * Callers do not use this directly — `BadgeDialog` and `TrophyDialog` are the
 * two adapters, and they are what own the copy for their kind of award.
 */
export function AwardDialog({
  content,
  onClose,
  celebrate = false,
  footer
}: {
  content: AwardDialogContent | null;
  onClose: () => void;
  /** Just-earned: confetti, a pulsing halo, and the unlock kicker. */
  celebrate?: boolean;
  /** Extra controls under the card — the celebration's "Show All Badges". */
  footer?: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const cardRef = React.useRef<View>(null);
  // The card is the overlay width, capped by `content`'s maxWidth.
  const cardWidth = Math.min(340, width - spacing.lg * 2);
  const awardId = content?.id ?? null;

  /**
   * The card rises and the award lands a beat later, on a springier curve — the
   * stagger is what makes the award read as the subject rather than as one more
   * element of a dialog that appeared. Runs whenever the card opens, celebration
   * or not; only the halo and confetti are held back for a genuine unlock.
   *
   * All transform/opacity, so it stays on the native driver.
   */
  const cardScale = React.useRef(new Animated.Value(0.88)).current;
  const cardOpacity = React.useRef(new Animated.Value(0)).current;
  const artScale = React.useRef(new Animated.Value(0.4)).current;
  const artBreath = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!awardId) {
      return;
    }

    cardScale.setValue(0.88);
    cardOpacity.setValue(0);
    artScale.setValue(0.4);
    artBreath.setValue(1);

    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.sequence([Animated.delay(120), Animated.spring(artScale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true })])
    ]).start();

    if (!celebrate) {
      return;
    }

    // The award breathes: a very slow zoom out and back, easing at both ends so
    // it never reads as a bounce. Its own value, multiplied with the entrance
    // scale in the transform below, so the two do not fight over one animation.
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.delay(420),
        Animated.timing(artBreath, { toValue: 1.07, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(artBreath, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ])
    );

    breathe.start();

    return () => breathe.stop();
  }, [awardId, celebrate, artBreath, artScale, cardOpacity, cardScale]);

  // view-shot is a native module, and importing it at the top would crash this
  // screen on app builds that don't include it yet.
  async function handleShare() {
    let uri: string;

    try {
      const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
      uri = await captureRef(cardRef, { format: "png", quality: 1 });
    } catch {
      Alert.alert("Almost there", "Sharing needs the latest app build. Rebuild the app to enable it.");
      return;
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your award" });
      }
    } catch {
      Alert.alert("Sharing failed", "Could not share the image. Please try again.");
    }
  }

  return (
    <Modal visible={Boolean(content)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} accessibilityLabel="Close" onPress={onClose} />
        {content ? (
          <>
            {celebrate ? (
              <ConfettiCannon
                count={140}
                origin={{ x: width / 2, y: -20 }}
                colors={[content.accent, ...CONFETTI_COLORS]}
                fadeOut
                autoStart
                explosionSpeed={360}
                fallSpeed={2900}
              />
            ) : null}
            <Animated.View style={[styles.content, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]} pointerEvents="box-none">
              {/* `cardRef` is exactly the shareable image and nothing else — no
                  buttons, and no space held open for one. */}
              <View ref={cardRef} collapsable={false} style={[styles.card, { backgroundColor: CARD_BACKGROUND }]}>
                  {/* Natural aspect at the card's width, anchored to the BOTTOM —
                      the same geometry LumoBackground uses. The trophy and foliage
                      sit at the foot of the plate, so this keeps them in frame and
                      lets the empty sky overflow off the top, where the card's
                      `overflow: hidden` clips it. No squashing, no magnifying.
                      The card is left bright rather than scrimmed: a dark veil here
                      matched the modal backdrop and made it read as if it sat BEHIND
                      the dim layer. The plate is light cream art, so the copy is
                      dark ink, which clears 6:1 even on the deepest gold. */}
                  <Image
                    source={backgroundAsset("trophies")}
                    style={[styles.art, { width: cardWidth, height: cardWidth / BACKGROUND_ASPECT }]}
                    resizeMode="cover"
                  />
                  {/* A soft cream veil, not a dark one: it settles the busiest part
                      of the art so the copy stays readable, without dimming it. */}
                  <View style={styles.veil} pointerEvents="none" />
                  {/* The kicker carries the tier now that the line under the title
                      is the award's meaning rather than its metadata. */}
                  <AppText variant="caption" color={CARD_MUTED} style={styles.kicker}>
                    {content.kicker}
                  </AppText>
                  {/* Two scales, multiplied: the entrance spring and the slow
                      breathing loop, each owning its own value. */}
                  <Animated.View style={{ transform: [{ scale: artScale }, { scale: artBreath }] }}>
                    {content.renderArt(ART_SIZE)}
                  </Animated.View>
                  <AppText color={CARD_INK} style={styles.title}>
                    {content.title}
                  </AppText>
                  {/* What the award MEANS, not what it is. "Bronze badge · 7 day
                      streak" only restated the art and the number already on the
                      card; the description is the one thing here that says why
                      "Kindling" is called that and what reaching it took. */}
                  <AppText variant="bodySmall" color={CARD_INK} style={styles.description}>
                    {content.description}
                  </AppText>
                  {/* Locked only, and a chip rather than a line of text: it is a
                      status on the award, not another sentence to read after the
                      description. Deliberately neutral instead of tier-accented —
                      the tier's colour is what an EARNED award wears, so spending
                      it here would undercut the padlock. */}
                  {content.earned || !content.lockLabel ? null : (
                    <View style={[styles.lockChip, { backgroundColor: alpha(CARD_MUTED, "1F") }]}>
                      <Icon name="lock" size={11} color={CARD_MUTED} weight="bulk" />
                      <AppText variant="caption" color={CARD_MUTED} style={styles.lockChipText}>
                        {content.lockLabel}
                      </AppText>
                    </View>
                  )}
              </View>
              {/* BELOW the card, on the scrim — not floating over its foot.
                  `handleShare` rasterises the card, and the button is outside
                  that ref so it never lands in the exported image; overlaying it
                  meant the card had to reserve 86pt of empty cream for it, and
                  that reservation IS part of the ref, so every shared badge came
                  out with a blank band under the description.

                  Earned awards only: the locked card was offering to export a
                  padlocked grey award as if it were an achievement. */}
              {content.earned ? (
                <View style={styles.actions}>
                  <CardButton label="Share" icon="upload" onPress={handleShare} />
                </View>
              ) : null}
              {footer}
            </Animated.View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

/**
 * A ghost button for the dimmed backdrop the card sits on. The shared `Button`
 * colours its glyph AND its label together from `palette.ink` and only exposes
 * `labelStyle`, so there was no way to set the icon independently — it went the
 * wrong colour beside a label that had been overridden. (The celebration's own
 * footer button works around the same thing.)
 */
function CardButton({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.cardButton, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={17} color={SCRIM_INK} weight="bold" />
      <AppText variant="button" color={SCRIM_INK}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** The plate's own cream, so the card reads as one lit surface; it only shows
 *  in the moment before the art decodes. */
const CARD_BACKGROUND = "#FBF5EA";
/**
 * This card is a FIXED surface: cream plate art under a cream veil, in both
 * themes, because it doubles as the shared image. So its copy takes fixed
 * colours too.
 *
 * The title and description used to take `palette.ink` — which is the brand
 * navy-brown in light mode but #F7F8FA in dark. On a permanently-cream card
 * that made the award's name and meaning near-invisible for every dark-mode
 * user, in both the unlock celebration and the locked card.
 */
const CARD_INK = "#453213";
/** A shade deeper than palette.subtle, which only reached 3.78:1 over the
 *  plate's deepest gold — the subtitle sits right there. */
const CARD_MUTED = "#5C503F";
/** Copy on the dimmed backdrop rather than on the card — the scrim is the same
 *  near-black in both themes, so this is white in both too. */
const SCRIM_INK = "#FFFFFF";

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  content: {
    width: "100%",
    maxWidth: 340
  },
  card: {
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.nav,
    // Clips the plate and veil to the rounded corners. Safe here — the card
    // carries no shadow for iOS to drop.
    overflow: "hidden",
    // Even top and bottom. The card used to end on 86pt of reserved space for
    // the Share button that floated in it — which is what put a blank band at
    // the foot of every exported badge, since the reservation is inside the
    // capture and the button is not.
    paddingVertical: spacing.xl,
    // Wider than the vertical inset is tall would be odd, but 24 was too tight
    // against a 196pt piece of art — the description ran nearly edge to edge.
    paddingHorizontal: spacing.xl
  },
  // Pinned to the card's bottom edge; width and height come from the call site
  // so the plate keeps its own proportions and overflows upward.
  art: {
    position: "absolute",
    left: 0,
    bottom: 0
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FBF6EC",
    opacity: 0.34
  },
  kicker: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 1.5
  },
  title: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 28,
    lineHeight: 34,
    textAlign: "center"
  },
  description: {
    fontFamily: fontFamilies.lexendMedium,
    lineHeight: 20,
    textAlign: "center"
  },
  lockChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.xxs
  },
  lockChipText: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.3
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.sm
  },
  // No fill, so it sits directly on the dimmed backdrop with no plate of its
  // own and the card keeps every bit of the weight. Same height and radius as
  // the app's buttons.
  cardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: control.height,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill
  }
});
