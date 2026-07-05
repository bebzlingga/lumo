import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { getTipSection } from "@/lib/tips";

export default function TipSectionScreen() {
  const router = useRouter();
  const { palette } = useLumo();
  const params = useLocalSearchParams<{ slug: string }>();
  const section = getTipSection(typeof params.slug === "string" ? params.slug : undefined);

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      {section ? (
        <View style={styles.article}>
          <View style={styles.header}>
            <AppText variant="displaySmall" color={palette.ink} style={styles.title}>
              {section.title}
            </AppText>
            <AppText variant="bodySmall" color={palette.subtle} style={styles.focus}>
              {section.focus}
            </AppText>
          </View>

          {section.tips.map((tip, index) => (
            <View
              key={tip.title}
              style={[
                index > 0 && { marginTop: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline, paddingTop: spacing.xl }
              ]}
            >
              <AppText variant="bodySmall" color={palette.ink} style={styles.tipTitle}>
                {tip.title}
              </AppText>
              <AppText variant="bodySmall" color={palette.subtle} style={styles.tipBody}>
                {tip.body}{"\n\n"}{tip.action}
              </AppText>
            </View>
          ))}
        </View>
      ) : (
        <AppText variant="bodySmall" color={palette.subtle} style={styles.missing}>
          This section could not be found.
        </AppText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl
  },
  article: {
    marginTop: -spacing.xs
  },
  header: {
    marginBottom: 35
  },
  title: {
    fontFamily: "Lexend-Black",
    fontSize: 54,
    lineHeight: 58
  },
  focus: {
    fontFamily: "Lexend-Regular",
    fontSize: 15,
    lineHeight: 21,
    marginTop: spacing.xxs
  },
  tipTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: spacing.md
  },
  tipBody: {
    fontFamily: "Lexend-Regular",
    fontSize: 15,
    lineHeight: 23
  },
  missing: {
    fontFamily: "Lexend-Regular",
    marginTop: spacing.lg
  }
});
