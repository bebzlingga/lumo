import { useRouter } from "expo-router";
import React from "react";
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Pressable } from "@/components/Pressable";
import { Avatar } from "@/components/Avatar";
import { BadgeImage } from "@/components/BadgeImage";
import { Icon, type IconName } from "@/components/Icon";
import { OverallStatsView } from "@/components/StatisticsViews";
import { WeekSummaryCard } from "@/components/WeekSummaryCard";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { readableOn } from "@/lib/color";
import { habitBadges } from "@/lib/badges";
import {
  bestCurrentStreakAcrossHabits,
  bestStreakAcrossHabits,
  completionRate,
  monthlyCompletionCount,
  perfectWeeksForHabits,
  weeklyCompletionCount
} from "@/lib/habitMath";
import { formatLumoId, friendInviteLink } from "@/lib/lumoId";

/**
 * Six figures, but not six equal ones. These two answer "how am I doing right
 * now", so they lead the card at display size; the four below are the context
 * for them. Six identical cells gave the eye nowhere to land, and forced every
 * label down to 10pt to fit a third of the width.
 *
 * `unit` is what stops `12` (days) and `12` (completions) reading as the same
 * kind of number. `tight` hugs it to the figure for a percent sign, which is
 * part of the value rather than a word after it.
 */
const HERO_STATS: {
  icon: IconName;
  label: string;
  tone: "accent" | "green";
  tight?: boolean;
  value: (stats: ProfileStats) => string;
  unit: (stats: ProfileStats) => string;
}[] = [
  {
    icon: "fire",
    label: "Current streak",
    tone: "accent",
    value: (stats) => `${stats.currentStreak}`,
    unit: (stats) => (stats.currentStreak === 1 ? "day" : "days")
  },
  {
    icon: "chart",
    label: "Completion",
    tone: "green",
    tight: true,
    value: (stats) => `${stats.completion}`,
    unit: () => "%"
  }
];

/**
 * The supporting four, as one quiet strip. No icons here on purpose: the badge
 * row directly above is already six pieces of art, and a second row of tinted
 * chips under it read as a duller copy of that rather than as data.
 */
const STRIP_STATS: { label: string; value: (stats: ProfileStats) => string }[] = [
  { label: "Best streak", value: (stats) => `${stats.bestStreak}` },
  { label: "This week", value: (stats) => `${stats.thisWeek}` },
  { label: "This month", value: (stats) => `${stats.thisMonth}` },
  { label: "Perfect weeks", value: (stats) => `${stats.perfectWeeks}` }
];

type ProfileStats = {
  bestStreak: number;
  completion: number;
  perfectWeeks: number;
  currentStreak: number;
  thisWeek: number;
  thisMonth: number;
};

export default function ProfileScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { palette, isDark, nickname, lumoIdSuffix, avatar, habits, settings } = useLumo();
  const [qrVisible, setQrVisible] = React.useState(false);
  const [avatarPressed, setAvatarPressed] = React.useState(false);
  const lumoId = formatLumoId(lumoIdSuffix);
  const inviteLink = friendInviteLink(lumoIdSuffix);
  // Same rule as the habit form CTA: greenDark is dark in light mode but light
  // in dark mode, so filled buttons use the medium green there instead.
  const buttonFill = isDark ? palette.green : palette.greenDark;
  // Derived, not fixed: the overlay gutter plus the card's own inset leave a
  // hard ceiling on how wide the code can be, and a fixed 200 broke out of the
  // card on anything narrower than about 367pt.
  const qrSize = Math.min(220, width - spacing.lg * 2 - spacing.xl * 2 - spacing.sm * 2);

  // Every number below is derived from real data — nothing here is decorative.
  const stats = React.useMemo(() => {
    const active = habits.filter((habit) => habit.status === "active");
    const rates = active.map((habit) => completionRate(habit));
    const bestStreak = bestStreakAcrossHabits(habits);

    return {
      bestStreak,
      completion: rates.length ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length) : 0,
      perfectWeeks: perfectWeeksForHabits(habits),
      // A run that is still alive today, unlike bestStreak's best-ever.
      currentStreak: bestCurrentStreakAcrossHabits(habits),
      thisWeek: active.reduce((sum, habit) => sum + weeklyCompletionCount(habit), 0),
      thisMonth: active.reduce((sum, habit) => sum + monthlyCompletionCount(habit), 0)
    };
  }, [habits]);

  // Badges come off the persisted high-water mark rather than stats.bestStreak,
  // which only sees the habits that still exist.
  const allBadges = React.useMemo(() => habitBadges(settings.bestStreakEver), [settings.bestStreakEver]);

  return (
    <Screen
      contentStyle={styles.content}
    >
      {/* Same shape as the Habits header: outlined icon on each side, title
          centred between them. */}
      <View style={styles.screenHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show QR code"
          onPress={() => setQrVisible(true)}
          hitSlop={10}
          style={({ pressed }) => [styles.headerButton, { borderColor: palette.hairline, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="qrCode" size={22} color={palette.ink} weight="bulk" />
        </Pressable>
        <View style={styles.screenHeaderCopy}>
          <AppText color={palette.ink} style={styles.screenTitle} numberOfLines={1}>
            Profile
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push("/(tabs)/settings")}
          hitSlop={10}
          style={({ pressed }) => [styles.headerButton, { borderColor: palette.hairline, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="settings" size={22} color={palette.ink} weight="bulk" />
        </Pressable>
      </View>

      {/* Identity on the canvas, stacked and centred: avatar, then the name,
          then the ID. No card — it is who you are, not data about you. */}
      <View style={styles.identity}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Customize avatar"
          onPress={() => router.push("/avatar")}
          onPressIn={() => setAvatarPressed(true)}
          onPressOut={() => setAvatarPressed(false)}
          style={[styles.avatarFrame, { opacity: avatarPressed ? 0.8 : 1 }]}
        >
          {/* Clipped to a circle, not a square: the portrait is a bust, so a
              square clip sheared the shoulders off along a hard flat line.
              The disc doubles as the backdrop the separate halo used to be. */}
          <Avatar config={avatar} size={116} backgroundColor={palette.greenSoft} />
          <View style={[styles.avatarEdit, { backgroundColor: buttonFill, borderColor: palette.canvas }]}>
            <Icon name="edit" size={14} color={palette.white} weight="bulk" />
          </View>
        </Pressable>

        <AppText color={palette.ink} style={styles.name} numberOfLines={1}>
          {nickname || "You"}
        </AppText>

        <AppText color={palette.subtle} style={styles.identityId} numberOfLines={1}>
          {lumoId}
        </AppText>
      </View>

      {/* Every badge, not just the earned ones — a locked badge you can see is
          the thing that pulls someone back tomorrow.

          A tap opens the BADGES PAGE rather than a dialog about the one that was
          tapped. This strip is a preview of a shelf that exists in full one
          screen away — with the Move milestones on it, which this strip does not
          carry — and answering "what does this one take?" in a sheet here left
          somebody with no way of discovering the rest of them. The page shows the
          same badges and still opens that dialog when one is tapped there, so
          nothing is lost by going through it. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeRow} style={styles.badgeScroll}>
        {allBadges.map((badge) => (
          <Pressable
            key={`${badge.tier}-${badge.threshold}`}
            accessibilityRole="button"
            accessibilityLabel={`${badge.name}. ${
              badge.earned ? "Earned" : `Locked, needs a ${badge.threshold} day streak`
            }. Opens all badges.`}
            onPress={() => router.push("/badges")}
            style={({ pressed }) => [styles.badgeItem, { opacity: pressed ? 0.7 : 1 }]}
          >
            {/* The illustration stands on the canvas — no card, no tinted
                bubble. Locked badges have their own greyed-and-padlocked art,
                so what is still ahead reads clearly rather than as a ghost. */}
            <BadgeImage threshold={badge.threshold} earned={badge.earned} size={96} />
            <AppText variant="caption" color={badge.earned ? palette.ink : palette.muted} numberOfLines={1} style={styles.badgeTitle}>
              {badge.name}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>

      {/* One card, not six — they are one set of figures. The hero band carries
          the two live numbers, the strip below carries the rest.

          NOTE: no `overflow: "hidden"` on this view. It used to clip the grid's
          hairlines to the rounded corners, but on iOS it also masks the shadow
          away, so this card sat flat while the charts right below it lifted.
          Nothing here needs the clip: the rule runs full-bleed across the card's
          waist, and the strip's dividers are inset well clear of the corners. */}
      <View style={[styles.journeyCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
        <View style={styles.journeyHero}>
          {HERO_STATS.map((stat) => (
            <View key={stat.label} style={styles.journeyHeroItem}>
              <View style={styles.journeyHeroValueRow}>
                <AppText color={palette.ink} style={styles.journeyHeroValue}>
                  {stat.value(stats)}
                </AppText>
                <AppText
                  color={stat.tight ? palette.ink : palette.subtle}
                  style={[styles.journeyHeroUnit, stat.tight && styles.journeyHeroUnitTight]}
                >
                  {stat.unit(stats)}
                </AppText>
              </View>
              {/* The glyph rides with the label rather than sitting in a chip
                  above the figure: at 13pt it marks the category without
                  competing with the number it belongs to. */}
              <View style={styles.journeyHeroLabelRow}>
                <Icon
                  name={stat.icon}
                  size={13}
                  color={stat.tone === "accent" ? readableOn(palette.accent, palette.card) : buttonFill}
                  weight="bulk"
                />
                <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.journeyHeroLabel}>
                  {stat.label}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.journeyRule, { backgroundColor: palette.hairline }]} />

        <View style={styles.journeyStrip}>
          {STRIP_STATS.map((stat, index) => (
            <View
              key={stat.label}
              style={[
                styles.journeyStripCell,
                index < STRIP_STATS.length - 1 && {
                  borderRightWidth: StyleSheet.hairlineWidth,
                  borderRightColor: palette.hairline
                }
              ]}
            >
              <AppText color={palette.ink} style={styles.journeyStripValue}>
                {stat.value(stats)}
              </AppText>
              {/* All four wrap to exactly two lines at this width, so the row
                  stays even — the old grid mixed one- and two-line labels. */}
              <AppText variant="caption" color={palette.subtle} numberOfLines={2} style={styles.journeyStripLabel}>
                {stat.label}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      {/* The week-over-week panel, which is all that survived of the "Your
          week" screen — see WeekSummaryCard. It sits directly under the
          lifetime figures because it is the same figures over a short window,
          and the two are read together. */}
      <WeekSummaryCard habits={habits} />

      {/* Moved here from the Insights screen: the two charts that read across
          every habit at once, rather than one habit at a time. */}
      <OverallStatsView habits={habits} />


      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={styles.qrOverlay}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={() => setQrVisible(false)} />
          <View style={[styles.qrCard, { backgroundColor: palette.card }]}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.qrTitle}>
              {lumoId}
            </AppText>
            <View style={styles.qrCodeWrap}>
              <QRCode value={inviteLink} size={qrSize} backgroundColor="transparent" color={isDark ? "#FFF7E6" : "#141413"} />
            </View>
            <AppText variant="caption" color={palette.subtle} style={styles.qrHint}>
              Friends can scan this to add you on Lumo.
            </AppText>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  screenHeaderCopy: {
    flex: 1,
    alignItems: "center"
  },
  screenTitle: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 19,
    lineHeight: 25
  },
  // Outlined circle, matching the Habits and journal editor header buttons.
  headerButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  // One centred column: avatar, name, level, then the ID and its note.
  identity: {
    alignItems: "center",
    gap: spacing.xxs,
    marginBottom: spacing.sm
  },

  // The Habits header's size — it was 24, which read louder than the "Profile"
  // title above it.
  // Larger than the header title above it — on this screen the name is the
  // headline, and "Profile" is just the bar's label for where you are.
  name: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 28,
    lineHeight: 34
  },
  // No padding of its own — the two bands inset themselves, so the rule between
  // them can run edge to edge. Shadow matches the chart cards this screen puts
  // directly underneath it (see OverallStatsView's `overallBarCard`); the two
  // are the same weight of surface and used to lift by different amounts.
  journeyCard: {
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.075,
    shadowRadius: 18,
    elevation: 3
  },
  journeyHero: {
    flexDirection: "row",
    paddingHorizontal: spacing.ml,
    paddingTop: spacing.md,
    paddingBottom: spacing.md
  },
  // Halves, each centred on its own — the same axis the four strip cells below
  // sit on, so the card reads as one centred set rather than two alignments.
  journeyHeroItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2
  },
  journeyHeroValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 3
  },
  journeyHeroValue: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 30,
    lineHeight: 36
  },
  journeyHeroUnit: {
    fontFamily: fontFamilies.lexendMedium,
    fontSize: 14,
    lineHeight: 20
  },
  // A percent sign belongs to the number, so it takes the ink colour, more of
  // the figure's size, and no gap before it.
  journeyHeroUnitTight: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 20,
    lineHeight: 26,
    marginLeft: -2
  },
  journeyHeroLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs
  },
  journeyHeroLabel: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendMedium,
    textAlign: "center"
  },
  journeyRule: {
    height: StyleSheet.hairlineWidth
  },
  journeyStrip: {
    flexDirection: "row",
    // Small side inset: the four cells need every point of width they can get
    // before their labels start wrapping to three lines.
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md
  },
  journeyStripCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 1,
    paddingHorizontal: spacing.xxs
  },
  journeyStripValue: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 17,
    lineHeight: 23
  },
  journeyStripLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamilies.lexendMedium,
    textAlign: "center"
  },
  badgeScroll: {
    marginHorizontal: -layout.screenPaddingX,
    // Separates the badges from the stat cards below, which are a different
    // kind of thing despite looking like another scrolling row.
    marginBottom: spacing.md
  },
  badgeRow: {
    gap: spacing.xs,
    // Has to match the scroller's own bleed, or the first badge starts 8pt
    // inside every other element on the page.
    paddingHorizontal: layout.screenPaddingX
  },
  badgeItem: {
    width: 104,
    alignItems: "center",
    gap: spacing.xxs
  },
  badgeTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    textAlign: "center"
  },
  content: {
    // Shorter page now that Tools/Support moved to Settings, so the floating
    // tab bar has to be cleared explicitly or it covers the last card.
    paddingBottom: layout.tabScreenBottomPadding,
    // Cards carry their own padding, so the stack between them stays tight.
    gap: spacing.sm
  },
  avatarFrame: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm
  },
  // Sits on the disc's lower-right edge; the ring in the card colour separates
  // it from the avatar behind it.
  avatarEdit: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  // Sits right under the name — a quiet identifier for it, not a line of its
  // own, so it takes the subtle colour and almost no gap above.
  identityId: {
    fontFamily: "Lexend-Black",
    fontSize: 15,
    lineHeight: 20,
    marginTop: 1
  },
  qrOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  qrCard: {
    width: "100%",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.nav,
    paddingVertical: spacing.xl,
    // Was spacing.xxl (48 a side), which is what squeezed the code out of the
    // card on narrow screens; qrSize is computed against this value.
    paddingHorizontal: spacing.xl
  },
  qrTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 18,
    lineHeight: 24
  },
  qrCodeWrap: {
    padding: spacing.sm
  },
  qrHint: {
    textAlign: "center",
    maxWidth: 220
  }
});
