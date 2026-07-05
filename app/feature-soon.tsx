import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";

const features: { icon: IconName; title: string; body: string }[] = [
  { icon: "messageEdit", title: "Suggest features", body: "Share the ideas you'd love to see in Lumo." },
  { icon: "star", title: "Vote on requests", body: "Upvote what matters most so we build it first." },
  { icon: "clock", title: "Track progress", body: "Follow what's Ongoing and what's already Shipped." },
  { icon: "gallery", title: "Add screenshots", body: "Attach a photo to explain your idea clearly." }
];

export default function FeatureSoonScreen() {
  const router = useRouter();
  const { palette } = useLumo();

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        centerContent={
          <AppText variant="titleSmall" color={palette.ink} style={styles.headerTitle}>
            Feature Board
          </AppText>
        }
      />

      <View style={styles.hero}>
        <View style={[styles.badge, { backgroundColor: palette.greenSoft }]}>
          <Icon name="sparkle" size={30} color={palette.greenDark} weight="bulk" />
        </View>
        <View style={[styles.pill, { backgroundColor: alpha(palette.greenDark, "12") }]}>
          <AppText variant="caption" color={palette.greenDark} style={styles.pillText}>
            LAUNCHING SOON
          </AppText>
        </View>
        <AppText color={palette.ink} style={styles.title}>
          Help shape what's next
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
          Your ideas and votes will guide where we go. Here's what's coming.
        </AppText>
      </View>

      <View style={styles.list}>
        {features.map((feature) => (
          <View key={feature.title} style={[styles.row, { backgroundColor: palette.card, shadowColor: palette.shadow }]}>
            <View style={[styles.rowIcon, { backgroundColor: alpha(palette.greenDark, "12") }]}>
              <Icon name={feature.icon} size={22} color={palette.greenDark} weight="bulk" />
            </View>
            <View style={styles.rowText}>
              <AppText variant="titleSmall" color={palette.ink} style={styles.rowTitle}>
                {feature.title}
              </AppText>
              <AppText variant="bodySmall" color={palette.subtle}>
                {feature.body}
              </AppText>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.lg
  },
  headerTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 17,
    lineHeight: 22,
    transform: [{ translateY: -6 }]
  },
  hero: {
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg
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
  }
});
