import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Alert, Animated, Linking, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BACKGROUND_ASPECT } from "@/constants/backgroundAssets";
import { CTA_FILL, fontFamilies, radius, spacing, tileRadius } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { useTabBarVisibility } from "@/context/TabBarVisibility";
import { FRIENDS_SUBSCRIPTION_SKU, UNLIMITED_SKU, getProductPrice } from "@/lib/iap";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/lib/legal";

/**
 * The paywall's own plate: Lumo peeking over a hill, with open cream below for
 * the offer to sit on. Its own art rather than one of the landscape variants —
 * this is the one screen in the app that asks for money, and it should not
 * look like a reskin of a page that doesn't.
 */
const PLATE = require("../assets/Purchase.webp");

/**
 * Where the hill Lumo leans on tops out, as a fraction of the plate's height.
 * The offer starts below it, so nothing is written across his arms.
 */
const PLATE_HILL_TOP = 0.233;

/**
 * How far the page scrolls before the plate reaches its faded weight, and what
 * that weight is — the same treatment HomeBackground gives the home plate, so
 * a scroll behaves the same wherever art sits behind the content.
 *
 * It does not fade to nothing: a backdrop that vanishes reads as a loading
 * glitch and leaves the rest of the page as flat canvas.
 */
const FADE_DISTANCE = 300;
const FADED_OPACITY = 0.3;

/**
 * What sits above the hero before it starts: the screen's own top padding, the
 * page bar, and the bar's bottom margin. Subtracted from where the hill tops
 * out to work out how far the copy still has to be pushed down.
 */
const HEADER_BAND = spacing.lg + 38 + spacing.md;

/**
 * Breathing room between the hill Lumo leans on and the first line of copy.
 * Landing the headline exactly on the hill's edge was geometrically right and
 * visually cramped — it read as resting on him rather than clear of him.
 */
const HERO_CLEARANCE = spacing.hero;

/**
 * The base price in pesos, rendered for the reader's own locale.
 *
 * This is only ever a STAND-IN. The App Store returns `displayPrice` already
 * converted and formatted for the buyer's storefront — a reader in the US sees
 * dollars, one in Japan sees yen — and that is what gets charged and what this
 * screen swaps in the moment it arrives. What is shown before then has to be
 * honest about being a peso figure, so `Intl` is asked for PHP explicitly: a
 * reader outside the Philippines gets "PHP 149", not a bare ₱ sign next to a
 * number in a currency that is not theirs.
 *
 * Wrapped, because `Intl` is not guaranteed on every Hermes build; the plain
 * symbol is a fine last resort.
 */
function pesos(amount: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `₱${amount}`;
  }
}

/** Which of the two products this screen is selling. */
export type PaywallProduct = "friends" | "unlimited";

/**
 * Copy and pricing per product.
 *
 * One screen for both, because the two paywalls do the same job and every part
 * of them except the words is shared — the purchase call, the restore button,
 * the legal links, the busy states. Two screens meant two places to fix a bug
 * in any of that.
 *
 * `basePrice` is the peso amount, and only ever a placeholder — see `pesos`.
 * The App Store's own localized price replaces it as soon as it loads, and is
 * the one that gets charged.
 */
const PRODUCTS: Record<
  PaywallProduct,
  {
    sku: string;
    icon: IconName;
    /** Broken by hand — these are fixed strings, so the break is predictable,
     *  and at this size a natural wrap lands in the wrong place. */
    title: string;
    subtitle: string;
    basePrice: number;
    /** Under the price on the button. */
    terms: string;
    /** The small print at the foot of the screen. */
    legal: (price: string) => string;
    cta: (price: string) => string;
    unlockedMessage: string;
    perks: { icon: IconName; title: string; body: string }[];
  }
> = {
  friends: {
    sku: FRIENDS_SUBSCRIPTION_SKU,
    icon: "friends",
    title: "Show up\nfor each other",
    subtitle: "Everything you track on your own stays free. This adds the shared side of Lumo, billed monthly.",
    basePrice: 49,
    terms: "Auto-renews monthly · cancel anytime in the App Store",
    legal: (price) =>
      `Lumo Friends auto-renews at ${price}/month via your Apple ID. Cancel anytime in your App Store settings at least 24 hours before it renews.`,
    cta: (price) => `Subscribe for ${price}/month`,
    unlockedMessage: "Friends and groups are now unlocked. Thank you for supporting Lumo.",
    perks: [
      { icon: "friends", title: "Groups with friends", body: "Create a group, share activities, and build a streak together — everyone's check-ins count toward it." },
      { icon: "fire", title: "Cheers & nudges", body: "Cheer friends who checked in today, and nudge the ones who haven't yet." },
      { icon: "trophy", title: "Group trophies", body: "Sixteen awards across four tiers, each one earned by the whole group rather than any one member." },
      { icon: "target", title: "Weekly challenges", body: "Set a shared target for the week and watch the group's total climb toward it together." },
      { icon: "checkCircle", title: "Roll call", body: "A second streak for simply showing up — it keeps going as long as everyone opens Lumo each day." },
    ]
  },
  unlimited: {
    sku: UNLIMITED_SKU,
    icon: "sparkle",
    title: "Room\nfor everything",
    subtitle: "Free accounts keep 3 habits and 3 journal entries. This lifts both limits for good — one payment, no subscription.",
    basePrice: 149,
    terms: "One payment · yours for good",
    // Not a subscription, so none of the renewal small print applies — saying
    // it anyway would be telling someone they are about to be charged monthly.
    legal: (price) =>
      `A one-time payment of ${price} via your Apple ID. Not a subscription — nothing renews and there is nothing to cancel. Restores free on your other devices.`,
    cta: (price) => `Unlock for ${price}`,
    unlockedMessage: "Unlimited habits and journal entries are now unlocked. Thank you for supporting Lumo.",
    perks: [
      { icon: "taskSquare", title: "Unlimited habits", body: "Track as many habits as you want, instead of the 3 a free account keeps." },
      { icon: "book", title: "Unlimited journal", body: "Write every day and keep every entry, instead of the 3 a free account keeps." },
      { icon: "elementPlus", title: "Starter packs in full", body: "Add a whole starter pack in one tap, instead of only the habits that fit in three free slots." },
      { icon: "lock", title: "Pay once, keep it", body: "A single payment — not a subscription. Nothing renews and there is nothing to cancel." },
      { icon: "heart", title: "Support Lumo", body: "One purchase keeps the app being built, and keeps it free of ads for everyone." }
    ]
  }
};

/**
 * The paywall, shown wherever a paid feature is locked. Handles purchasing and
 * restoring inline — there is no separate purchase screen.
 *
 * Restoring covers BOTH products regardless of which one is on screen: Apple's
 * "Restore Purchases" is one button to the user, and someone restoring their
 * unlimited unlock from this screen should not have to find the other paywall
 * to get their subscription back too.
 */
export function SubscriptionGate({ product = "friends" }: { product?: PaywallProduct }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { palette, purchasePro, purchaseUnlimited, restorePurchases } = useLumo();
  const copy = PRODUCTS[product];
  const tabBar = useTabBarVisibility();

  /**
   * No tab bar over the paywall. This screen has one thing to say, and a row
   * of tabs across the bottom of it is both an invitation to leave and a strip
   * of chrome sitting on the price.
   *
   * Tied to FOCUS rather than mount: the gate renders inline on the Friends
   * tab, and a tab screen stays mounted after you leave it — locked on mount,
   * it would keep the bar hidden across the whole app. Null outside the tab
   * navigator, where there is no bar to hide.
   */
  useFocusEffect(
    React.useCallback(() => {
      tabBar?.setLocked(true);

      return () => tabBar?.setLocked(false);
    }, [tabBar])
  );

  // The plate is cut at the app's standard background ratio, so at full screen
  // width it stands very nearly a screen tall — no scaling games needed.
  const plateHeight = width / BACKGROUND_ASPECT;
  /**
   * How far the hero copy is pushed down so it STARTS below Lumo's hill.
   *
   * Bottom-aligning inside a reserved box was the wrong shape for this: it made
   * the copy END at the hill, so a three-line block began some 50pt above it,
   * written across his arms. Padding from the top puts the first line on the
   * hill's edge whatever the copy grows to.
   */
  const heroTopPad = Math.max(0, Math.round(plateHeight * PLATE_HILL_TOP) - (insets.top + HEADER_BAND)) + HERO_CLEARANCE;
  // Fade the plate out of the way as the offer scrolls up over it. Driven off a
  // plain listener rather than useNativeDriver, because opacity on an image
  // behind a ScrollView is the same thing HomeBackground animates this way.
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => scrollY.setValue(event.nativeEvent.contentOffset.y),
    [scrollY]
  );
  const plateOpacity = scrollY.interpolate({
    inputRange: [0, FADE_DISTANCE],
    outputRange: [1, FADED_OPACITY],
    extrapolate: "clamp"
  });
  const [busy, setBusy] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const [ctaPressed, setCtaPressed] = React.useState(false);
  const [restorePressed, setRestorePressed] = React.useState(false);
  const [priceLabel, setPriceLabel] = React.useState(() => pesos(copy.basePrice));

  React.useEffect(() => {
    let active = true;
    setPriceLabel(pesos(copy.basePrice));

    // Storefront-localized and authoritative: whatever the store says here is
    // what Apple will charge, in the reader's own currency.
    getProductPrice(copy.sku).then((price) => {
      if (active && price) {
        setPriceLabel(price);
      }
    });

    return () => {
      active = false;
    };
  }, [copy.sku, copy.basePrice]);

  async function handleSubscribe() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const subscribed = await (product === "unlimited" ? purchaseUnlimited() : purchasePro());
      if (subscribed) {
        Alert.alert("Welcome aboard!", copy.unlockedMessage);
      } else {
        Alert.alert("Purchase not completed", "Nothing was charged. Please try again.");
      }
    } catch {
      Alert.alert("Something went wrong", "We couldn't complete the purchase. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (restoring) {
      return;
    }
    setRestoring(true);
    try {
      const active = await restorePurchases();
      if (!active) {
        Alert.alert("Nothing to restore", "No previous purchase was found for this Apple ID.");
      }
    } finally {
      setRestoring(false);
    }
  }

  function openLegal(url: string) {
    Linking.openURL(url).catch(() => {
      Alert.alert("Couldn't open link", "Please try again in a moment.");
    });
  }

  return (
    <Screen
      contentStyle={styles.content}
      // The plate replaces the shared landscape wash rather than sitting over
      // it — two backdrops would only muddy each other.
      backgroundVariant={null}
      backgroundNode={
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Animated.Image
            source={PLATE}
            style={{ position: "absolute", top: 0, width, height: plateHeight, opacity: plateOpacity }}
            resizeMode="cover"
          />
        </View>
      }
      onScroll={handleScroll}
    >
      {/* The app's page bar, so this looks like a screen of Lumo rather than a
          modal that arrived from somewhere else. The back button is dropped
          when there is nothing to go back TO — this renders inline on the
          Friends tab, where "back" would leave the tab entirely. */}
      {/* No title on the bar: the hero headline right under it already names
          what this screen is selling, and both at once read as the same thing
          said twice. The bar is here for the way out. */}
      <ScreenHeader leftAction={router.canGoBack() ? { icon: "back", label: "Back", onPress: () => router.back() } : undefined} />

      {/* Lumo is IN the backdrop, so this holds space for him rather than
          drawing anything — the padding is the space. */}
      <View style={[styles.hero, { paddingTop: heroTopPad }]}>
        <AppText color={palette.ink} style={styles.title}>
          {copy.title}
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
          {copy.subtitle}
        </AppText>
      </View>

      <View style={styles.list}>
        {copy.perks.map((perk) => (
          <View key={perk.title} style={styles.row}>
            {/* A soft tinted disc, not a card. The rows themselves sit straight
                on the plate; this just gives each glyph something to stand on so
                the column of icons reads as a set. */}
            <View style={[styles.rowIcon, { backgroundColor: alpha(palette.greenDark, "12") }]}>
              <Icon name={perk.icon} size={22} color={palette.greenDark} weight="bulk" />
            </View>
            <View style={styles.rowText}>
              <AppText variant="titleSmall" color={palette.ink} style={styles.rowTitle}>
                {perk.title}
              </AppText>
              <AppText variant="bodySmall" color={palette.subtle} numberOfLines={3} style={styles.rowBody}>
                {perk.body}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.cta(priceLabel)}
        disabled={busy}
        onPress={handleSubscribe}
        onPressIn={() => setCtaPressed(true)}
        onPressOut={() => setCtaPressed(false)}
        style={[styles.subscribeCta, { backgroundColor: CTA_FILL, opacity: ctaPressed ? 0.88 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator color={palette.white} />
        ) : (
          <>
            <AppText variant="button" color={palette.white} style={styles.subscribeLabel}>
              {copy.cta(priceLabel)}
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.85)">
              {copy.terms}
            </AppText>
          </>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Restore purchases"
        disabled={restoring}
        onPress={handleRestore}
        onPressIn={() => setRestorePressed(true)}
        onPressOut={() => setRestorePressed(false)}
        style={[styles.restoreButton, { opacity: restorePressed ? 0.6 : 1 }]}
      >
        <AppText variant="caption" color={palette.subtle} style={styles.restoreLabel}>
          {restoring ? "Restoring…" : "Restore purchases"}
        </AppText>
      </Pressable>

      <View style={styles.legal}>
        <AppText variant="caption" color={palette.subtle} style={styles.legalText}>
          {copy.legal(priceLabel)}
        </AppText>
        <View style={styles.legalLinks}>
          <Pressable accessibilityRole="link" accessibilityLabel="Terms of Use" onPress={() => openLegal(TERMS_URL)}>
            <AppText variant="caption" color={palette.greenDark} style={styles.legalLink}>
              Terms of Use (EULA)
            </AppText>
          </Pressable>
          <AppText variant="caption" color={palette.subtle}>
            ·
          </AppText>
          <Pressable accessibilityRole="link" accessibilityLabel="Privacy Policy" onPress={() => openLegal(PRIVACY_POLICY_URL)}>
            <AppText variant="caption" color={palette.greenDark} style={styles.legalLink}>
              Privacy Policy
            </AppText>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    // Fill the screen so short content doesn't float. No allowance for the
    // floating tab bar: this screen hides it (see setLocked above), so padding
    // for it would leave a strip of nothing under the CTA.
    flexGrow: 1,
    paddingBottom: spacing.xl,
    gap: spacing.md
  },
  hero: {
    alignItems: "center",
    gap: spacing.xs,
    paddingBottom: spacing.md
  },
  // The serif at hero size, as on home's greeting — one of the exactly two
  // places the app allows it (see fontFamilies.serif). Tight leading, since it
  // is always set over two lines and the default put daylight between them.
  title: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 38,
    lineHeight: 44,
    textAlign: "center"
  },
  subtitle: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 320
  },
  list: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs
  },
  // On the canvas, not in cards. Four raised panels stacked under the headline
  // read as four things to deal with; as plain rows they read as one list of
  // what you get, which is what they are.
  //
  // Top-aligned, because the bodies now run to two and three lines: centred,
  // the tile floated to the middle of its paragraph instead of sitting beside
  // the title it belongs to.
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  // A rounded square, not a disc — the same tile the habit rows wear, so the
  // paywall's list looks like the app's other lists rather than its own thing.
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: tileRadius(44),
    alignItems: "center",
    justifyContent: "center"
  },
  rowText: {
    flex: 1,
    gap: 2
  },
  rowTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 14,
    lineHeight: 20
  },
  rowBody: {
    fontSize: 12,
    lineHeight: 16
  },
  subscribeCta: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    marginTop: spacing.xs
  },
  subscribeLabel: {
    fontSize: 16,
    lineHeight: 21
  },
  restoreButton: {
    alignItems: "center",
    paddingVertical: spacing.xxs
  },
  restoreLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    textDecorationLine: "underline"
  },
  legal: {
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  // Regular weight against `caption`'s semibold — this is small print, and at
  // the heavier weight it pulled against the CTA sitting right above it.
  legalText: {
    fontFamily: fontFamilies.lexend,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 16
  },
  legalLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  legalLink: {
    fontFamily: fontFamilies.lexendSemiBold,
    textDecorationLine: "underline"
  }
});
