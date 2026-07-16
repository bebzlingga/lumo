import React from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { getFriendsSubscriptionPrice } from "@/lib/iap";

// Fallback until the App Store returns a localized price.
const FALLBACK_PRICE_LABEL = "₱49";

const perks: { icon: IconName; title: string; body: string }[] = [
  { icon: "friends", title: "Groups with friends", body: "Do activities together — roll call, streaks, and shared progress." },
  { icon: "fire", title: "Cheers & nudges", body: "Hype up friends who show up, nudge the ones who haven't yet." },
  { icon: "star", title: "Shape the roadmap", body: "Submit and vote on feature requests in the Feature Board." },
  { icon: "heart", title: "Cover the servers", body: "Social features run on servers — your subscription keeps them on." }
];

/**
 * "Better together" subscription gate shown wherever the Friends / Feature
 * Board features are locked. Handles subscribing and restoring inline — there
 * is no separate paywall screen.
 */
export function SubscriptionGate() {
  const { palette, isDark, purchasePro, restorePurchases } = useLumo();
  const buttonFill = isDark ? palette.green : palette.greenDark;
  const [busy, setBusy] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const [ctaPressed, setCtaPressed] = React.useState(false);
  const [restorePressed, setRestorePressed] = React.useState(false);
  const [priceLabel, setPriceLabel] = React.useState(FALLBACK_PRICE_LABEL);

  React.useEffect(() => {
    let active = true;

    getFriendsSubscriptionPrice().then((price) => {
      if (active && price) {
        setPriceLabel(price);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubscribe() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const subscribed = await purchasePro();
      if (subscribed) {
        Alert.alert("Welcome aboard!", "Friends and the Feature Board are now unlocked. Thank you for supporting Lumo.");
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
        Alert.alert("Nothing to restore", "No active subscription was found for this Apple ID.");
      }
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <View style={[styles.badge, { backgroundColor: palette.greenSoft }]}>
          <Icon name="friends" size={30} color={palette.greenDark} weight="bulk" />
        </View>
        <View style={[styles.pill, { backgroundColor: alpha(palette.greenDark, "12") }]}>
          <AppText variant="caption" color={palette.greenDark} style={styles.pillText}>
            LUMO PLUS
          </AppText>
        </View>
        <AppText color={palette.ink} numberOfLines={1} style={styles.title}>
          Better together
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
          Everything else in Lumo is free, forever. The social features need servers — that's what this covers.
        </AppText>
      </View>

      <View style={styles.list}>
        {perks.map((perk) => (
          <View key={perk.title} style={[styles.row, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
            <View style={[styles.rowIcon, { backgroundColor: alpha(palette.greenDark, "12") }]}>
              <Icon name={perk.icon} size={22} color={palette.greenDark} weight="bulk" />
            </View>
            <View style={styles.rowText}>
              <AppText variant="titleSmall" color={palette.ink} style={styles.rowTitle}>
                {perk.title}
              </AppText>
              <AppText variant="bodySmall" color={palette.subtle} style={styles.rowBody}>
                {perk.body}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Subscribe for ${priceLabel} per month`}
        disabled={busy}
        onPress={handleSubscribe}
        onPressIn={() => setCtaPressed(true)}
        onPressOut={() => setCtaPressed(false)}
        style={[styles.subscribeCta, { backgroundColor: buttonFill, opacity: ctaPressed ? 0.88 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator color={palette.white} />
        ) : (
          <>
            <AppText variant="button" color={palette.white} style={styles.subscribeLabel}>
              Subscribe for {priceLabel}/month
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.85)">
              Auto-renews monthly · cancel anytime in the App Store
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    // Clears the floating tab bar (shown on the Friends tab).
    paddingBottom: layout.tabScreenBottomPadding,
    gap: spacing.md
  },
  hero: {
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxs
  },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.xs
  },
  pillText: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 0.6
  },
  title: {
    fontFamily: "Lexend-Black",
    fontSize: 32,
    lineHeight: 38,
    textAlign: "center"
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 21
  },
  list: {
    gap: spacing.sm
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.nav,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2
  },
  rowIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  rowText: {
    flex: 1,
    gap: 2
  },
  rowTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  rowBody: {
    lineHeight: 19
  },
  subscribeCta: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: radius.nav,
    paddingVertical: spacing.md,
    marginTop: spacing.xs
  },
  subscribeLabel: {
    fontSize: 17,
    lineHeight: 22
  },
  restoreButton: {
    alignItems: "center",
    paddingVertical: spacing.xxs
  },
  restoreLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    textDecorationLine: "underline"
  }
});
