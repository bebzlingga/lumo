import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { FREE_HABIT_LIMIT, FREE_JOURNAL_LIMIT, useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";

// Display price. Once IAP is wired, replace with the store's localized price
// string (react-native-iap product.localizedPrice).
const PRICE_LABEL = "₱99";

const perks: { icon: IconName; title: string; body: string }[] = [
  { icon: "grid", title: "Unlimited habits", body: "Track as many habits as you like — no cap." },
  { icon: "book", title: "Unlimited journals", body: "Write a journal entry for every day." },
  { icon: "star", title: "Shape the roadmap", body: "Submit and vote on feature requests." },
  { icon: "heart", title: "Support Lumo", body: "Help keep the app growing and ad-free." }
];

export default function PaywallScreen() {
  const router = useRouter();
  const { palette, isPro, purchasePro } = useLumo();
  const [busy, setBusy] = useState(false);
  const [ctaPressed, setCtaPressed] = useState(false);

  async function handlePurchase() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const unlocked = await purchasePro();
      if (unlocked) {
        Alert.alert("Unlocked!", "You now have unlimited habits and journals. Thank you for supporting Lumo.");
        router.back();
      } else {
        Alert.alert("Purchase not completed", "Nothing was charged. Please try again.");
      }
    } catch {
      Alert.alert("Something went wrong", "We couldn't complete the purchase. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll={false} edges={["top", "left", "right", "bottom"]} contentStyle={styles.content}>
      <ScreenHeader rightActions={[{ icon: "close", label: "Close", onPress: () => router.back() }]} />

      <ScrollView style={styles.topSection} contentContainerStyle={styles.topContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={[styles.badge, { backgroundColor: palette.greenSoft }]}>
            <Icon name="sparkle" size={30} color={palette.greenDark} weight="bulk" />
          </View>
          <AppText color={palette.ink} style={styles.title}>
            Unlock unlimited habits and journal
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
            {isPro
              ? "You already have Lumo unlocked. Thank you!"
              : `The free plan includes ${FREE_HABIT_LIMIT} habits and ${FREE_JOURNAL_LIMIT} journal entries. Unlock once for unlimited.`}
          </AppText>
        </View>

        <View style={styles.perks}>
          {perks.map((perk) => (
            <View key={perk.title} style={[styles.perkRow, { backgroundColor: palette.card, shadowColor: palette.shadow }]}>
              <View style={[styles.perkIcon, { backgroundColor: alpha(palette.greenDark, "12") }]}>
                <Icon name={perk.icon} size={22} color={palette.greenDark} weight="bulk" />
              </View>
              <View style={styles.perkText}>
                <AppText variant="titleSmall" color={palette.ink} style={styles.perkTitle}>
                  {perk.title}
                </AppText>
                <AppText variant="bodySmall" color={palette.subtle}>
                  {perk.body}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={[styles.ctaShell, { backgroundColor: palette.green, shadowColor: palette.green }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPro ? "Purchased" : `Unlock for ${PRICE_LABEL}. One-time payment.`}
            disabled={isPro || busy}
            onPress={handlePurchase}
            onPressIn={() => setCtaPressed(true)}
            onPressOut={() => setCtaPressed(false)}
            style={[styles.ctaButton, { backgroundColor: palette.green, opacity: ctaPressed ? 0.88 : 1 }]}
          >
            <AppText variant="button" color={palette.white} style={styles.ctaLabel}>
              {isPro ? "Purchased" : busy ? "Please wait…" : `Unlock for ${PRICE_LABEL}`}
            </AppText>
            {!isPro ? (
              <AppText variant="caption" color="rgba(255,255,255,0.85)" style={styles.ctaSub}>
                One-time payment
              </AppText>
            ) : null}
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md
  },
  topSection: {
    flex: 1,
    // Bleed the scroll bounds to the screen edges so card shadows aren't clipped.
    marginHorizontal: -spacing.lg,
    // Pulls the content up against the screen container's built-in child gap.
    marginTop: -spacing.xs
  },
  topContent: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg
  },
  hero: {
    alignItems: "center",
    gap: spacing.xs
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs
  },
  title: {
    fontFamily: "Lexend-Black",
    fontSize: 26,
    lineHeight: 32,
    textAlign: "center"
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 21
  },
  perks: {
    gap: spacing.sm
  },
  perkRow: {
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
  perkIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  perkText: {
    flex: 1,
    gap: 2
  },
  perkTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  footer: {
    gap: spacing.sm,
    paddingBottom: spacing.md
  },
  ctaShell: {
    borderRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8
  },
  ctaButton: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  ctaLabel: {
    fontSize: 17,
    lineHeight: 22
  },
  ctaSub: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 11,
    lineHeight: 14
  }
});
