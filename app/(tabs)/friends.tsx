import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";

const features: { icon: IconName; title: string; body: string }[] = [
  { icon: "friends", title: "Track together", body: "Follow your friends' progress and stay motivated." },
  { icon: "elementPlus", title: "Share habits", body: "Send a habit to a friend and start it together." },
  { icon: "heart", title: "Cheer each other on", body: "Celebrate streaks and wins as a team." },
  { icon: "trophy", title: "Friendly streaks", body: "Compare streaks and keep each other going." }
];

export default function FriendsScreen() {
  const { palette } = useLumo();

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <View style={[styles.badge, { backgroundColor: palette.greenSoft }]}>
          <Icon name="friends" size={30} color={palette.greenDark} weight="bulk" />
        </View>
        <View style={[styles.pill, { backgroundColor: alpha(palette.greenDark, "12") }]}>
          <AppText variant="caption" color={palette.greenDark} style={styles.pillText}>
            LAUNCHING SOON
          </AppText>
        </View>
        <AppText color={palette.ink} numberOfLines={1} style={styles.title}>
          Better together
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
          Track habits with your friends, share routines, and keep each other going. Here's what's coming.
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
              <AppText variant="bodySmall" color={palette.subtle} style={styles.rowBody}>
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
    paddingBottom: layout.tabScreenBottomPadding,
    gap: spacing.lg
  },
  hero: {
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
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
    paddingVertical: 4
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
    lineHeight: 18
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
    lineHeight: 18
  }
});
