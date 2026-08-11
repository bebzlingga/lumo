import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Image, Modal, SectionList, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Icon } from "@/components/Icon";
import { AppText, LoadingState, Screen } from "@/components/ui";
import { DailyReflectionCard } from "@/components/DailyReflectionCard";
import { sceneAsset } from "@/constants/mascotAssets";
import { control, CTA_FILL, fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useTabBarVisibility } from "@/context/TabBarVisibility";
import { alpha } from "@/lib/color";
import { formatLongDate, parseDateKey, toDateKey } from "@/lib/date";
import { reflectionPromptFor } from "@/lib/homeCopy";
import { journalHasContent } from "@/lib/journal";
import { journalPhotoUri } from "@/lib/journalPhotos";
import { markdownToPlainText } from "@/lib/markdown";
import { JournalEntry, MAX_JOURNALS_PER_DAY } from "@/types/habit";
import { Pressable } from "@/components/Pressable";

/** Entries loaded per page, and again each time the list runs out. */
const PAGE_SIZE = 10;
/**
 * The today scene is drawn at its own width-fit size — NOT stretched to cover
 * the window, which would scale Lumo up with every move — and offset from the
 * top by this much (negative lifts it off-screen). Its bottom edge dissolves
 * into the canvas over SCENE_FADE, so the shorter plate leaves no seam above
 * the buttons.
 */
const SCENE_TOP = -50;
const SCENE_FADE = 200;
/** Art width as a multiple of the screen's — over 1 crops evenly off both sides. */
const SCENE_SCALE = 1.08;
/** "Add your journal" banner: the plate's own ratio, capped so it stays a band. */
/** How much wider than the banner the art is drawn, which is what pushes its
 *  contents right. Overhangs the right edge, where the clip removes it. */

export default function JournalScreen() {
  const router = useRouter();
  const { journals, isReady, isDark, palette } = useLumo();
  const insets = useSafeAreaInsets();
  const tabBar = useTabBarVisibility();
  const todayKey = toDateKey();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  /** Dismissed for THIS visit only — see the focus effect below. */
  const [dismissed, setDismissed] = useState(false);
  // The tab stays mounted once visited, and the prompt is a modal window that
  // would otherwise surface over whichever tab the user moved on to.
  const [focused, setFocused] = useState(false);

  // The raw record, so writing reuses it rather than tripping the per-day cap.
  const todayEntry = journals.find((entry) => entry.date === todayKey);
  const todayIsBlank = !todayEntry || !journalHasContent(todayEntry);

  // Only days that actually have an entry, newest first — the list is "Recent
  // Entries", not a calendar of every day that has passed.
  const entries = useMemo(
    () => journals.filter(journalHasContent).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [journals]
  );

  // Read by the focus effect without making it re-run on every write.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const listRef = useRef<SectionList<JournalEntry>>(null);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // Every arrival on the tab re-opens the prompt while today is unwritten,
      // so dismissing it lasts only as long as the visit.
      setDismissed(false);

      // Back to the top, like every other screen. `Screen` does this for the
      // screens that scroll through it, but this one owns its list, so it has
      // to do its own. `getScrollResponder` rather than `scrollToLocation`:
      // the latter throws when there are no sections yet.
      listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false });

      // Coming back from the editor: an entry re-filed under an older day sorts
      // by ITS date, which can drop it past the loaded page. Page far enough to
      // put whatever was just written on screen.
      const recent = entriesRef.current.reduce<JournalEntry | undefined>(
        (newest, entry) => (!newest || entry.updatedAt > newest.updatedAt ? entry : newest),
        undefined
      );
      const position = recent ? entriesRef.current.findIndex((entry) => entry.id === recent.id) : -1;

      if (position >= 0) {
        setVisibleCount((current) => Math.max(current, Math.ceil((position + 1) / PAGE_SIZE) * PAGE_SIZE));
      }

      return () => setFocused(false);
    }, [])
  );

  // Grouped into months as they come off the sorted list, so a page boundary
  // in the middle of a month just extends that month's section.
  const sections = useMemo(() => {
    const months: { title: string; data: JournalEntry[] }[] = [];

    for (const entry of entries.slice(0, visibleCount)) {
      const title = parseDateKey(entry.date).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      const open = months[months.length - 1];

      if (open?.title === title) {
        open.data.push(entry);
      } else {
        months.push({ title, data: [entry] });
      }
    }

    return months;
  }, [entries, visibleCount]);

  if (!isReady) {
    return <LoadingState />;
  }

  function openEntry(entry: JournalEntry) {
    router.push(`/journal/${entry.date}?id=${entry.id}`);
  }

  /** Today's entry, or a fresh one when the day has none yet. */
  function openToday() {
    router.push(todayEntry ? `/journal/${todayKey}?id=${todayEntry.id}` : `/journal/${todayKey}?new=1`);
  }

  /**
   * Always a blank record, never today's existing one. A day that is already
   * full would just hand the editor back the entry living there, so this walks
   * back to the newest day with room — the date is editable from the editor
   * anyway, for anyone catching up further back than that.
   */
  function startNewEntry() {
    const cursor = new Date();

    for (let step = 0; step < 366; step += 1) {
      const key = toDateKey(cursor);
      const onDay = journals.filter((entry) => entry.date === key);
      // A record with nothing in it is an unused page, not a written entry:
      // hand it back rather than skipping the day it is sitting on.
      const blank = onDay.find((entry) => !journalHasContent(entry));

      if (blank) {
        router.push(`/journal/${key}?id=${blank.id}`);
        return;
      }

      if (onDay.length < MAX_JOURNALS_PER_DAY) {
        router.push(`/journal/${key}?new=1`);
        return;
      }

      cursor.setDate(cursor.getDate() - 1);
    }

    router.push(`/journal/${todayKey}?new=1`);
  }

  /**
   * Nothing written today: the invitation covers the whole app, tab bar and
   * all, so writing or browsing are the only ways on. Closing it first means
   * the editor doesn't open behind the modal's own window.
   */
  function writeToday() {
    setDismissed(true);
    requestAnimationFrame(openToday);
  }

  return (
    <>
      <Modal
        visible={focused && todayIsBlank && !dismissed}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setDismissed(true)}
      >
        <TodayEmptyState onWrite={writeToday} onBrowse={() => setDismissed(true)} />
      </Modal>

      <Screen scroll={false} contentStyle={styles.content} edges={["left", "right"]}>
        <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(entry) => entry.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        // This screen scrolls its own list rather than the one `Screen`
        // provides, so it reports to the tab bar itself.
        onScroll={tabBar?.onScroll}
        scrollEventThrottle={16}
        onEndReachedThreshold={0.4}
        onEndReached={() => setVisibleCount((current) => Math.min(current + PAGE_SIZE, entries.length))}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
              <View style={styles.titleRow}>
                <View style={styles.titleBlock}>
                  <AppText color={palette.ink} style={styles.title}>
                    Journal
                  </AppText>
                  <AppText variant="bodySmall" color={palette.subtle}>
                    Reflect, express, and grow.
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="New journal entry"
                  onPress={startNewEntry}
                  hitSlop={10}
                  style={({ pressed }) => [styles.headerButton, { borderColor: palette.hairline, opacity: pressed ? 0.6 : 1 }]}
                >
                  <Icon name="plus" size={20} color={palette.ink} weight="bold" />
                </Pressable>
              </View>

              {/* Only shown having come from "View Entries" with today still
                  unwritten. Once the day has an entry the header is just its
                  title — nothing left to invite.

                  The same card the home screen ends on, prompt and all: these
                  are two doors into today's entry, and they were two separate
                  builds of the same plate until now. */}
              {todayIsBlank && dismissed ? <DailyReflectionCard prompt={reflectionPromptFor(todayKey)} onPress={openToday} /> : null}
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <AppText color={palette.ink} style={styles.monthHeading}>
            {section.title}
          </AppText>
        )}
        renderItem={({ item }) => <EntryRow entry={item} onPress={() => openEntry(item)} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText variant="bodySmall" color={palette.subtle} style={styles.emptyText}>
              No entries yet — today is a good place to start.
            </AppText>
          </View>
        }
        />
      </Screen>
    </>
  );
}

/**
 * Today's blank page, as a full-screen scene.
 *
 * This used to pin itself to cream ink on a cream ground, because the art
 * carries its own cream canvas and dark mode's near-white text vanished against
 * it. That fixed the text at the cost of the screen: a dark-mode user got one
 * blazing cream page in an otherwise dark app, and a themed user got a page in
 * somebody else's colours.
 *
 * Now the ground and copy follow the palette while the art stays at full
 * strength. It was briefly faded per theme so it would recede behind the copy;
 * that just made the screen look washed out, and the illustration is the whole
 * point of it. The gradient at its lower edge still blends it into whatever the
 * canvas is, so a full-strength plate leaves no seam.
 */
function TodayEmptyState({ onWrite, onBrowse }: { onWrite: () => void; onBrowse: () => void }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const scene = sceneAsset("journalToday");
  const { palette } = useLumo();
  // Natural proportions at a chosen width, rather than blown up to fill a
  // screen that is taller than the art is — that coupled size to position.
  const artWidth = window.width * SCENE_SCALE;
  const artHeight = artWidth / scene.aspect;
  const artLeft = (window.width - artWidth) / 2;
  const artBottom = artHeight + SCENE_TOP;
  // It runs as a dialog over the whole app — no tab bar underneath to clear,
  // just the home indicator. Kept tight so the copy block sits low: it is
  // bottom-anchored, so every line the description gains pushes the headline
  // UP into the illustration rather than down towards the buttons.
  const bottomClearance = insets.bottom + spacing.md;

  return (
    <Screen scroll={false} contentStyle={styles.sceneContent} edges={[]} backgroundVariant={null} background={palette.canvas}>
      {/* Sized explicitly — left to `absoluteFill` the art lays out at its
          intrinsic 941×1672 and spills off the right of the screen. */}
      <Image
        source={scene.source}
        style={[styles.sceneArt, { top: SCENE_TOP, left: artLeft, width: artWidth, height: artHeight }]}
        resizeMode="cover"
      />
      <Svg width={window.width} height={SCENE_FADE} style={[styles.sceneArt, { top: artBottom - SCENE_FADE }]} pointerEvents="none">
        <Defs>
          {/* Fades the art's bottom edge into whatever the canvas now is, so the
              illustration ends without a seam in every theme. */}
          <LinearGradient id="journalSceneFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.canvas} stopOpacity="0" />
            <Stop offset="1" stopColor={palette.canvas} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={window.width} height={SCENE_FADE} fill="url(#journalSceneFade)" />
      </Svg>

      <View style={[styles.sceneCopy, { paddingBottom: bottomClearance }]}>
        {/* Broken by hand so the second half always lands on its own line. */}
        <AppText color={palette.ink} style={styles.sceneTitle}>
          {"Let’s keep a little\npiece of today."}
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.sceneBody}>
          Even one small thought is worth remembering. A line about how today went is enough — and months from now it will be the
          only record of what this week actually felt like.
        </AppText>

        <View style={styles.sceneDivider}>
          {/* Tinted inline rather than in the stylesheet — these follow the
              theme, and a StyleSheet entry can only hold a fixed colour. */}
          <View style={[styles.sceneDividerRule, { backgroundColor: palette.glowSoft }]} />
          <Icon name="heart" size={18} color={palette.glow} weight="fill" />
          <View style={[styles.sceneDividerRule, { backgroundColor: palette.glowSoft }]} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Write today's entry"
          onPress={onWrite}
          style={({ pressed }) => [styles.sceneCta, styles.sceneCtaLead, { backgroundColor: CTA_FILL, opacity: pressed ? 0.88 : 1 }]}
        >
          {/* `white`, not `ink`: this is a filled primary button, and its label
              has to clear the fill in every theme — which the palette's own
              onAccent pairing does not cover, since that one is for the gold. */}
          <AppText variant="button" color={palette.white}>
            Write Your Journal Today
          </AppText>
        </Pressable>

        {/* Always offered: with the tab bar covered, this is the only way past
            the dialog for anyone who does not want to write yet. Unfilled, so
            it reads as the quieter of the two. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View past entries"
          onPress={onBrowse}
          style={({ pressed }) => [styles.sceneCta, { opacity: pressed ? 0.6 : 1 }]}
        >
          <AppText variant="button" color={palette.subtle}>
            View Entries
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

/** One row: photo (when there is one), title, date, chevron. */
function EntryRow({ entry, onPress }: { entry: JournalEntry; onPress: () => void }) {
  const { isDark, palette } = useLumo();
  const title = entry.title?.trim() || markdownToPlainText(entry.content).split("\n")[0] || "Untitled entry";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}, ${formatLongDate(entry.date)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.entryRow,
        // Lifted by its shadow rather than outlined, the same treatment the
        // shared Card gives every other list row in the app.
        { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow, opacity: pressed ? 0.85 : 1 }
      ]}
    >
      {/* Only a real attachment earns a thumbnail — an entry without one is
          just its words. */}
      {/* Resolved against this launch's container — see lib/journalPhotos. */}
      {entry.photoUri ? <Image source={{ uri: journalPhotoUri(entry.photoUri) }} style={styles.entryThumb} resizeMode="cover" /> : null}
      <View style={styles.entryCopy}>
        <AppText color={palette.ink} numberOfLines={1} style={styles.entryTitle}>
          {title}
        </AppText>
        <AppText variant="caption" color={palette.muted} style={styles.entryDate}>
          {formatLongDate(entry.date)}
        </AppText>
      </View>
      <Icon name="forward" size={14} color={palette.muted} weight="bold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 0,
    // The header plate provides its own top inset so it can run edge to edge.
    paddingTop: 0
  },
  // The scene art bleeds to every edge; the copy sits in the empty lower half
  // the illustration leaves for it.
  sceneContent: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    justifyContent: "flex-end"
  },
  sceneArt: {
    position: "absolute",
    left: 0
  },
  // Tighter than the app's screen padding so the headline gets the width it
  // needs to hold two lines.
  sceneCopy: {
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: spacing.xs
  },
  // As large as the longer of the two hand-broken lines can run without
  // re-wrapping — AppText scales it down again on narrower phones.
  sceneTitle: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 34,
    lineHeight: 42,
    textAlign: "center"
  },
  // A step down from `body`, and running to three or four lines, so it takes
  // its own leading — it is the note under the headline, not a second one.
  sceneBody: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: spacing.xs,
    maxWidth: 320
  },
  sceneDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.xs
  },
  sceneDividerRule: {
    width: 24,
    height: 2,
    borderRadius: 1
  },
  // The column is bottom-anchored, so the space before the buttons is what
  // lifts the headline and its line away from them.
  sceneCtaLead: {
    marginTop: spacing.xl
  },
  // Sized to its label rather than stretched edge to edge — a pill that wide
  // reads as a banner instead of a button.
  sceneCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: spacing.xs,
    minHeight: control.height,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill
  },
  listContent: {
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: layout.tabScreenBottomPadding,
    gap: spacing.xs
  },
  header: {
    gap: spacing.md
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  titleBlock: {
    flex: 1,
    gap: spacing.xxs
  },
  // The outlined circle every other header uses.
  headerButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  title: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 36,
    lineHeight: 41
  },
  // Full-bleed: cancels the list's horizontal padding so the plate reaches both
  // screen edges, and crops the plate's overflow above the band.
  // The gap is what separates the title from the reflection card under it. It
  // lives here rather than as a margin on the card, because the card is shared
  // with the home screen, where the screen's own row gap already spaces it.
  hero: {
    gap: spacing.ml,
    marginHorizontal: -layout.screenPaddingX,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing.md,
    overflow: "hidden"
  },
  // Same geometry as a habit card: 16pt all round, 16pt between the thumbnail
  // and the copy, 66pt floor.
  // Serif, a step down from a screen heading: it labels the run of entries
  // under it rather than competing with the page title.
  // The list's own 8pt gap sits above and below this. It keeps a little more
  // room on top than underneath, so the heading reads as leading the month
  // below it rather than closing the one above.
  // Both margins stack on the list's own spacing.xs row gap, so the real air
  // around the heading is 16pt above and 20pt below.
  monthHeading: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.sm
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 66,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.045,
    shadowRadius: 8,
    elevation: 2
  },
  // 44pt, the same tile the habit cards use for their icon.
  entryThumb: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    overflow: "hidden"
  },
  entryCopy: {
    flex: 1,
    gap: 2
  },
  entryTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 21
  },
  // Regular weight, not the caption variant's semibold — the date is a
  // reference, the title above it is what you read.
  entryDate: {
    fontFamily: fontFamilies.lexend
  },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xl
  },
  emptyText: {
    textAlign: "center"
  }
});
