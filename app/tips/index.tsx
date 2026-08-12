import { Href, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native"
import { Icon } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { alpha } from "@/lib/color";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing, tileRadius } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { TIP_SECTIONS, TipSection } from "@/lib/tips";

function TipCard({ section, step, onPress }: { section: TipSection; step: number; onPress: () => void }) {
  const { palette, isDark } = useLumo();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Chapter ${step}. ${section.title}. ${section.focus}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: palette.card,
          shadowColor: isDark ? "transparent" : palette.shadow,
          opacity: pressed ? 0.85 : 1
        }
      ]}
    >
      {/* The glyph in the chapter's own hue, on a tile of the same wash — the
          shape every icon in the app sits in. It was a bare green glyph, which
          made five different chapters look like five of the same thing. */}
      <View style={[styles.cardIcon, { backgroundColor: alpha(section.accent, "1F") }]}>
        <Icon name={section.icon} size={18} color={section.accent} weight="bulk" />
      </View>
      <View style={styles.cardText}>
        <View style={styles.cardTitleLine}>
          {/* Two lines, not one: the longest chapter name ("Willpower &
              setbacks") runs close to the badge beside it, and on a narrow
              phone it should wrap rather than ellipsize. */}
          <AppText variant="bodySmall" color={palette.ink} numberOfLines={2} style={styles.cardTitle}>
            {section.title}
          </AppText>
          {/* The intro calls these five chapters that build on one another, so
              each card carries its place in that order. */}
          <View style={[styles.cardStep, { backgroundColor: alpha(section.accent, "14") }]}>
            <AppText variant="caption" color={section.accent} numberOfLines={1} style={styles.cardStepText}>
              Chapter {step}
            </AppText>
          </View>
        </View>
        <AppText variant="caption" color={palette.subtle} numberOfLines={2} style={styles.cardFocus}>
          {section.focus}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function TipsScreen() {
  const router = useRouter();
  const { palette } = useLumo();

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader title="Tips & Guides" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      {/* The bar names where you are in the app; this names what the page is. */}
      <AppText color={palette.ink} style={styles.headline}>
        Build habits that actually last
      </AppText>

      {/* Two paragraphs, not one block: the first says what this is and where
          it came from, the second says how to read it. Run together they were a
          single wall that people skipped to get to the cards. */}
      <View style={styles.intro}>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.introParagraph}>
          Decades of habit science, distilled into a single path. We've gathered the most proven ideas from the books people trust most —{" "}
          <AppText style={styles.bookTitle}>Atomic Habits</AppText>, <AppText style={styles.bookTitle}>The Power of Habit</AppText>,{" "}
          <AppText style={styles.bookTitle}>Tiny Habits</AppText>, <AppText style={styles.bookTitle}>Better Than Before</AppText> and{" "}
          <AppText style={styles.bookTitle}>The Willpower Instinct</AppText> — and shaped them into five short chapters that build on one another.
        </AppText>

        <AppText variant="bodySmall" color={palette.subtle} style={styles.introParagraph}>
          The through-line is that habits are built, not willed. Nothing here asks you to want it more; every chapter is about arranging things so the
          habit needs less of you to keep going — making it smaller, more obvious, and easier to start than whatever you'd drift into instead.
        </AppText>

        <AppText variant="bodySmall" color={palette.subtle} style={styles.introParagraph}>
          Read them in order if you're starting fresh, or jump straight to the one that matches where you are today. Each takes a few minutes.
        </AppText>
      </View>

      <View style={styles.cards}>
        {TIP_SECTIONS.map((section, index) => (
          <TipCard
            key={section.slug}
            section={section}
            step={index + 1}
            onPress={() => router.push(`/tips/${section.slug}` as Href)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    // Air under the pinned bar. The headline is a 38pt serif and it was sitting
    // straight against the header, which read as the page starting mid-sentence.
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xs
  },
  cardIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 38,
    borderRadius: tileRadius(38)
  },
  headline: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 38,
    lineHeight: 45,
    marginBottom: spacing.xxs
  },
  intro: {
    gap: spacing.sm,
    marginBottom: spacing.lg
  },
  // 15, not the 13 this ran at: it is the only prose on the page and it was
  // set smaller than the card captions beneath it, so the thing worth reading
  // read as the fine print.
  introParagraph: {
    fontFamily: fontFamilies.lexend,
    fontSize: 15,
    lineHeight: 23
  },
  // Size repeated, not inherited: a nested AppText with no `variant` defaults
  // to `body` (16pt), which overrode the paragraph size and made every book
  // title jump mid-sentence.
  bookTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontStyle: "italic",
    fontSize: 15,
    lineHeight: 23
  },
  cards: {
    gap: spacing.xs
  },
  // The app's list-card geometry: 18pt radius, spacing.md inset.
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },

  cardText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  cardTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  cardTitle: {
    // Yields to the badge beside it rather than pushing it out of the row.
    flexShrink: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    // 15, the intro paragraphs' size — the chapter names are the same weight of
    // reading as the copy above them, so they are set to the same measure.
    fontSize: 15,
    lineHeight: 21
  },
  cardStep: {
    // Wider than a bare digit needed, and it must not shrink — the title beside
    // it is what yields when a chapter name runs long.
    flexShrink: 0,
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill
  },
  cardStepText: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 11,
    lineHeight: 15
  },
  cardFocus: {
    fontFamily: fontFamilies.lexend,
    fontSize: 13,
    lineHeight: 18
  }
});
