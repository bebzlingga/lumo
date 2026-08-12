import { Href, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { TIP_SECTIONS, getTipSection } from "@/lib/tips";

export default function TipSectionScreen() {
  const router = useRouter();
  const { palette, isDark } = useLumo();
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = typeof params.slug === "string" ? params.slug : undefined;
  const section = getTipSection(slug);
  // The chapters are written to build on one another, so the reader is told
  // where they are in the path and offered the next one at the foot.
  const index = TIP_SECTIONS.findIndex((item) => item.slug === slug);
  const next = index >= 0 ? TIP_SECTIONS[index + 1] : undefined;
  /**
   * The chapter's own hue, carried from the index.
   *
   * Everything on this page that was green takes it — the badge, the action
   * lines, the next-chapter tile — so arriving from a blue card lands on a blue
   * page rather than on a page that looks like every other one. Falls back to
   * the app's green for a slug that no longer exists.
   */
  const accent = section?.accent ?? palette.greenDark;

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader title={section?.title ?? "Tips & Guides"} leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      {section ? (
        <>
          {/* The bar carries the chapter's name, so this opens with where it
              sits in the path and what it covers rather than repeating it. */}
          <View style={styles.header}>
            {/* The same pill the Tips index puts beside each chapter title. */}
            <View style={[styles.chapterBadge, { backgroundColor: alpha(accent, "14") }]}>
              <AppText variant="caption" color={accent} numberOfLines={1} style={styles.chapterText}>
                Chapter {index + 1} of {TIP_SECTIONS.length}
              </AppText>
            </View>
            <AppText color={palette.ink} style={styles.focus}>
              {section.focus}
            </AppText>
          </View>

          {section.tips.map((tip) => (
            <View
              key={tip.title}
              style={[styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}
            >
              <AppText color={palette.ink} style={styles.tipTitle}>
                {tip.title}
              </AppText>
              <AppText variant="bodySmall" color={palette.subtle} style={styles.tipBody}>
                {tip.body}
              </AppText>
              {/* The action used to be glued onto the body with a blank line,
                  which made the one thing to actually DO read as more prose. */}
              <View style={[styles.action, { backgroundColor: alpha(accent, "12") }]}>
                <View style={styles.actionHead}>
                  <Icon name="checkCircle" size={14} color={accent} weight="bulk" />
                  <AppText variant="caption" color={accent} style={styles.actionLabel}>
                    Try this
                  </AppText>
                </View>
                <AppText variant="bodySmall" color={palette.ink} style={styles.actionBody}>
                  {tip.action}
                </AppText>
              </View>
            </View>
          ))}

          {next ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Next chapter: ${next.title}`}
              onPress={() => router.replace(`/tips/${next.slug}` as Href)}
              style={({ pressed }) => [
                styles.nextCard,
                { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow, opacity: pressed ? 0.85 : 1 }
              ]}
            >
              {/* The chapter it points AT, not the one it sits on: the tile is
                  a preview of where the arrow goes. */}
              <View style={[styles.nextIcon, { backgroundColor: alpha(next.accent, "14") }]}>
                <Icon name={next.icon} size={20} color={next.accent} weight="bulk" />
              </View>
              <View style={styles.nextCopy}>
                <AppText variant="caption" color={palette.subtle} style={styles.nextLabel}>
                  Next chapter
                </AppText>
                <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.nextTitle}>
                  {next.title}
                </AppText>
              </View>
              <Icon name="forward" size={16} color={palette.muted} weight="bold" />
            </Pressable>
          ) : null}
        </>
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
    // Air under the pinned bar, matching the index.
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xs
  },
  header: {
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  chapterBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill
  },
  chapterText: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 11,
    lineHeight: 15
  },
  // Carries the opening line now the title lives in the bar, so it steps up
  // from the 13pt a page description usually takes.
  focus: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 28,
    lineHeight: 35,
    textAlign: "center"
  },
  // The app's list-card geometry: 18pt radius, spacing.md inset.
  card: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  tipTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 16,
    lineHeight: 22
  },
  tipBody: {
    fontFamily: fontFamilies.lexend,
    lineHeight: 21
  },
  // Roomier than the spacing.sm it started at: this is the one block on the
  // card the reader is meant to act on, and at 12pt its copy sat almost against
  // the tint's edge. Still a step inside the card's own spacing.lg, so it reads
  // as nested rather than as a card of its own.
  //
  // The margin stacks on the card's spacing.xs row gap for 20pt of clear air
  // above the tint — enough that the block reads as a separate thing to DO
  // rather than as the last paragraph of the body copy it follows.
  action: {
    gap: spacing.xxs,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.sm
  },
  actionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs
  },
  actionLabel: {
    fontFamily: fontFamilies.lexendBold
  },
  // Matches tipBody: both are the card's reading copy.
  actionBody: {
    fontFamily: fontFamilies.lexend,
    lineHeight: 21
  },
  nextCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  nextIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg
  },
  nextCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  nextLabel: {
    fontFamily: fontFamilies.lexend
  },
  nextTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  missing: {
    fontFamily: fontFamilies.lexend,
    marginTop: spacing.lg
  }
});
