import { useRouter } from "expo-router";
import React, { useState } from "react";
import { LayoutAnimation, Linking, Platform, StyleSheet, UIManager, View } from "react-native"
import { Icon } from "@/components/Icon";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { Pressable } from "@/components/Pressable"

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LUMO_FACEBOOK_URL = "https://www.facebook.com/lumo.habittracker/";

type Faq = { question: string; answer: string };

const FAQS: Faq[] = [
  {
    question: "What is Lumo?",
    answer:
      "Lumo is a gentle, private habit tracker. It helps you keep small daily habits visible, capture how each day went in a journal, and watch your progress build over time — without pressure or noise."
  },
  {
    question: "How do I create a habit?",
    answer:
      "Open the Habits tab and tap the plus button. Give the habit a name, pick an icon and category, choose how often it should happen, and set an optional reminder. You can edit or delete it any time."
  },
  {
    question: "Can I change how Lumo looks?",
    answer:
      "Settings has a Dark mode switch under Preferences. Lumo carries one warm palette through both modes — bright and readable in daylight, low and quiet at night — so the app stays recognisably itself whichever you pick."
  },
  {
    question: "How do streaks work?",
    answer:
      "A streak counts the consecutive days you complete a habit on schedule. Miss a scheduled day and the streak resets, but your overall history stays intact so you can always start a new run."
  },
  {
    question: "Can I complete a habit more than once a day?",
    answer:
      "Yes. When you set a habit's goal to a daily target (for example, drink water three times), Lumo tracks each completion and fills your daily progress ring gradually as you go."
  },
  {
    question: "What happens when I delete a habit?",
    answer:
      "Deleted habits move to Trash rather than disappearing immediately. Open Settings → Tools & Data → Trash to restore one, or remove it permanently once you are sure you no longer need it."
  },
  {
    question: "What is the journal for?",
    answer:
      "The journal gives you one entry per day to reflect. Give the day a title, write as much or as little as you like, and attach a photo if you want to remember how it looked. It is a quiet place to record how the day actually felt."
  },
  {
    question: "How do reminders work?",
    answer:
      "Turn on Notifications in Settings, then add a reminder time to any habit. Lumo schedules a gentle local prompt at that time. Reminders live on your device and never leave it."
  },
  {
    question: "Where is my data stored?",
    answer:
      "Everything stays on this device by default. If you enable Friends, only your nickname, avatar, and progress numbers sync — your habits, journal entries, and photos never leave your device."
  },
  {
    question: "How do I back up or move my data?",
    answer:
      "Settings → Tools & Data has all three: export a backup file to share or store, import one onto a new device, or switch on Auto backup to keep a daily, weekly, or monthly copy. Because your data is local, a backup is the best way to protect it."
  },
  {
    question: "How much does Lumo cost?",
    answer:
      "Habits, journals, stats, and themes are all free with no caps. Only the social features — like Friends — need a ₱49/month subscription, which covers their server costs. Cancel anytime in the App Store."
  }
];

/** One question. Collapsed it is a single tappable line; expanded it grows to
 * show the answer under it. */
function FaqRow({
  item,
  expanded,
  onToggle,
  last
}: {
  item: Faq;
  expanded: boolean;
  onToggle: () => void;
  last: boolean;
}) {
  const { palette } = useLumo();

  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={item.question}
        onPress={onToggle}
        style={({ pressed }) => [styles.rowHeader, { opacity: pressed ? 0.7 : 1 }]}
      >
        <AppText variant="bodySmall" color={palette.ink} style={styles.question}>
          {item.question}
        </AppText>
        <View style={[styles.chevron, { transform: [{ rotate: expanded ? "180deg" : "0deg" }] }]}>
          <Icon name="chevronDown" size={16} color={palette.muted} weight="bold" />
        </View>
      </Pressable>
      {expanded ? (
        <AppText variant="bodySmall" color={palette.subtle} style={styles.answer}>
          {item.answer}
        </AppText>
      ) : null}
    </View>
  );
}

export default function FaqsScreen() {
  const router = useRouter();
  const { palette, isDark } = useLumo();
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());

  function toggle(key: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  function openCommunity() {
    Linking.openURL(LUMO_FACEBOOK_URL).catch(() => undefined);
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.topBarButton, { borderColor: palette.hairline, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="arrowLeft" size={20} color={palette.ink} weight="bold" />
        </Pressable>
        <AppText color={palette.ink} style={styles.headerTitle}>
          FAQs
        </AppText>
        {/* Balances the back button so the title centres on the screen, not on
            the space left over beside it. */}
        <View style={styles.topBarSpacer} />
      </View>

      <AppText variant="bodySmall" color={palette.subtle} style={styles.intro}>
        Tap any question to unfold the answer. If it isn't covered here, the Lumo community is always happy to help.
      </AppText>

      <View style={[styles.group, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
        {FAQS.map((item, index) => (
          <FaqRow
            key={item.question}
            item={item}
            expanded={openKeys.has(item.question)}
            onToggle={() => toggle(item.question)}
            last={index === FAQS.length - 1}
          />
        ))}
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Ask the Lumo community on Facebook"
        onPress={openCommunity}
        style={({ pressed }) => [
          styles.communityRow,
          { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow, opacity: pressed ? 0.7 : 1 }
        ]}
      >
        <View style={[styles.communityIcon, { backgroundColor: alpha(palette.greenDark, "14") }]}>
          <Icon name="facebook" size={22} color={palette.greenDark} weight="bulk" />
        </View>
        <View style={styles.communityCopy}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.communityTitle}>
            Still have questions?
          </AppText>
          <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.communityBody}>
            Ask the community on Facebook
          </AppText>
        </View>
        <Icon name="forward" size={16} color={palette.muted} weight="bold" />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.xs
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: spacing.sm
  },
  // Outlined circle, the same header button the journal form and habit screens
  // use — hairline border, no fill.
  topBarButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  topBarSpacer: {
    width: 38
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: fontFamilies.serifBlack,
    fontSize: 19,
    lineHeight: 25
  },
  intro: {
    // Supporting copy, so it sits below the question rows rather than level
    // with them: regular weight, a step down in size.
    fontFamily: fontFamilies.lexend,
    fontSize: 13,
    lineHeight: 19,
    // The section headings used to supply this air; without them the list sat
    // straight under the intro.
    marginBottom: spacing.lg
  },
  group: {
    // A step wider than the Settings groups' spacing.md — the questions are
    // full sentences, so they need more margin than a two-word row title.
    paddingHorizontal: spacing.ml,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2
  },
  row: {
    paddingVertical: spacing.md
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    minHeight: 24
  },
  question: {
    flex: 1,
    minWidth: 0,
    // Same weight and size as a Settings row title, so a question reads as a
    // list item rather than a heading.
    fontFamily: fontFamilies.lexendSemiBold
  },
  chevron: {
    width: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  answer: {
    lineHeight: 21,
    marginTop: spacing.xs,
    // Clears the chevron so the answer doesn't run under it.
    paddingRight: spacing.lg
  },
  communityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xxs,
    // Roomier than a list row — it closes the page, so it gets the deeper
    // spacing.lg inset the focal cards use rather than the list-row spacing.md.
    padding: spacing.lg,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2
  },
  // Sized like HabitCard's icon bubble — this is the page's one call to
  // action, so it carries more weight than a settings row's 36pt tile.
  communityIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg
  },
  communityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  communityTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  communityBody: {
    fontFamily: fontFamilies.lexend
  }
});
