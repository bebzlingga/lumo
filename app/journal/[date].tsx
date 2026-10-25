import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native"
import { Icon } from "@/components/Icon";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { AppText, LoadingState, Screen } from "@/components/ui";
import { WheelDatePicker } from "@/components/WheelDatePicker";
import { brand, fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { dayLabels, parseDateKey, toDateKey } from "@/lib/date";
import { journalHasContent } from "@/lib/journal";
import { journalPhotoUri, persistJournalPhoto, removeJournalPhoto } from "@/lib/journalPhotos";
import { createId } from "@/lib/id";
import { MAX_JOURNALS_PER_DAY, type JournalMood } from "@/types/habit";
import { Pressable } from "@/components/Pressable"

export default function JournalEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date: string; id?: string; new?: string }>();
  const { journals, isReady, isDark, palette, saveJournal, canCreateJournal } = useLumo();
  // Dark mode: the title keeps full ink, but long-form writing uses the softer
  // `body` tone — paragraphs of near-white on near-black glare.
  const titleColor = isDark ? palette.ink : "#1C1B19";
  const textColor = isDark ? palette.body : "#1C1B19";
  const placeholderColor = isDark ? palette.muted : `${palette.body}59`;

  const openedDateKey = typeof params.date === "string" ? params.date : toDateKey();

  // Resolved once, at mount: the entry can be re-filed under another day from
  // here, and re-running this against the new day would swap the screen onto
  // whatever entry lives there.
  const [opened] = useState(() => {
    const written = (key: string) => journals.filter((entry) => entry.date === key && journalHasContent(entry));

    // `?id=` edits that entry, wherever it is filed.
    if (params.id) {
      const byId = journals.find((entry) => entry.id === params.id);

      if (byId) {
        return { entry: byId, date: byId.date };
      }
    }

    // `?new=1` always means a NEW record — never the one already on the day.
    // A full day only moves the starting date back to one with room; the date
    // picker takes it from there.
    if (params.new) {
      const cursor = parseDateKey(openedDateKey);

      for (let step = 0; step < 366; step += 1) {
        const key = toDateKey(cursor);

        if (written(key).length < MAX_JOURNALS_PER_DAY) {
          return { entry: undefined, date: key };
        }

        cursor.setDate(cursor.getDate() - 1);
      }

      return { entry: undefined, date: openedDateKey };
    }

    // Neither: open whatever the day already holds, or start it.
    const dayEntries = journals.filter((entry) => entry.date === openedDateKey).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latest = dayEntries[dayEntries.length - 1];

    return { entry: latest, date: latest?.date ?? openedDateKey };
  });

  const existing = opened.entry;

  // Fixed for the life of the screen so every save lands on the same entry,
  // including the first one for a brand new entry.
  const [entryId] = useState(() => existing?.id ?? createId());

  const [dateKey, setDateKey] = useState(opened.date);
  const [pickingDate, setPickingDate] = useState(false);
  // The wheels move freely against this; only Done commits it.
  const [draftDate, setDraftDate] = useState(dateKey);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  // Kept, not edited: the simple page writes title, date and body only, so an
  // entry keeps whatever mood and tags it already carried.
  const [tags] = useState<string[]>(existing?.tags ?? []);
  const [photoUri, setPhotoUri] = useState<string | undefined>(existing?.photoUri);
  const [mood] = useState<JournalMood | undefined>(existing?.mood);

  const moodRef = useRef(mood);
  moodRef.current = mood;
  const contentRef = useRef(content);
  contentRef.current = content;
  const photoRef = useRef(photoUri);
  photoRef.current = photoUri;
  const titleRef = useRef(title);
  titleRef.current = title;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  // Read through a ref like every other field, so re-filing the entry does not
  // re-run the save effect and write it out twice.
  const dateRef = useRef(dateKey);
  dateRef.current = dateKey;
  const skipSaveRef = useRef(false);

  useEffect(() => {
    return () => {
      if (!skipSaveRef.current) {
        saveJournal(entryId, dateRef.current, contentRef.current, photoRef.current, moodRef.current, titleRef.current, tagsRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  if (!isReady) {
    return <LoadingState />;
  }

  // New entries only. Opening or editing something already written is never
  // blocked — the cap is on how many you keep, and locking someone out of
  // their own writing to sell them a purchase would be a different thing
  // entirely.
  if (!existing && !canCreateJournal) {
    return <SubscriptionGate product="unlimited" />;
  }

  const entryDate = parseDateKey(dateKey);
  // "Tue, August 4, 2026" — the day the entry is filed under, shown under its
  // title rather than in the top bar.
  const fullDate = `${dayLabels[entryDate.getDay()]}, ${entryDate.toLocaleDateString(undefined, { month: "long" })} ${entryDate.getDate()}, ${entryDate.getFullYear()}`;

  async function pickPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      // iOS "limited" access reports granted: false but still opens a picker
      // over the photos the user chose to share — only a hard denial that
      // cannot be re-asked is worth blocking on.
      if (!permission.granted && !permission.canAskAgain) {
        Alert.alert("Photo access needed", "Allow photo access for Lumo in Settings to attach an image.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 0.8
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const previous = photoUri;
      const stored = await persistJournalPhoto(result.assets[0].uri, dateKey);
      setPhotoUri(stored);

      if (previous && previous !== stored) {
        removeJournalPhoto(previous);
      }
    } catch (error) {
      // Surface the reason — a silent "something went wrong" made this
      // impossible to diagnose.
      Alert.alert("Couldn't attach photo", error instanceof Error ? error.message : "Please try again.");
    }
  }

  function removePhoto() {
    const current = photoUri;
    setPhotoUri(undefined);
    removeJournalPhoto(current);
  }

  /**
   * A day is open if it is not already carrying its share of entries. Checked
   * against the draft while the wheels move rather than on save, where the
   * write would just be dropped.
   */
  function dayIsOpen(candidate: string) {
    return journals.filter((entry) => entry.date === candidate && entry.id !== entryId && journalHasContent(entry)).length < MAX_JOURNALS_PER_DAY;
  }

  /** Re-files the entry — for catching up on a day you missed writing. */
  function confirmDate() {
    if (dayIsOpen(draftDate)) {
      setDateKey(draftDate);
    }

    setPickingDate(false);
  }

  function openDatePicker() {
    setDraftDate(dateKey);
    setPickingDate(true);
  }

  return (
    <Screen scroll={false} contentStyle={styles.content} edges={["top", "left", "right", "bottom"]}>
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
        <View style={styles.topBarSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach a photo"
          onPress={pickPhoto}
          hitSlop={10}
          style={({ pressed }) => [styles.topBarButton, { borderColor: palette.hairline, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="attachment" size={20} color={palette.ink} weight="bold" />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={[styles.flex, styles.editorBody]} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* The page itself: the attachment leads, then title, the day it is
              filed under, and the entry. No fields, no frames — just text on
              the canvas. */}
          {photoUri ? (
            <View style={styles.photoWrap}>
              {/* Resolved now, not stored — see lib/journalPhotos. */}
              <Image source={{ uri: journalPhotoUri(photoUri) }} style={styles.photo} resizeMode="cover" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                onPress={removePhoto}
                style={({ pressed }) => [styles.photoRemove, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Icon name="close" size={22} color={brand.navy} weight="fill" />
              </Pressable>
            </View>
          ) : null}

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Give today a title"
            placeholderTextColor={placeholderColor}
            multiline
            autoFocus={!existing}
            style={[styles.titleInput, { color: titleColor }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Entry date, ${fullDate}. Tap to change.`}
            onPress={openDatePicker}
            hitSlop={8}
            style={({ pressed }) => [styles.dateLine, { opacity: pressed ? 0.6 : 1 }]}
          >
            <AppText variant="bodySmall" color={palette.muted}>
              {fullDate}
            </AppText>
            <Icon name="calendar" size={14} color={palette.muted} weight="bulk" />
          </Pressable>

          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Write your thoughts…"
            placeholderTextColor={placeholderColor}
            multiline
            textAlignVertical="top"
            style={[styles.bodyInput, { color: textColor }]}
          />

        </ScrollView>
      </KeyboardAvoidingView>

      {pickingDate ? (
        <Modal transparent animationType="none" visible onRequestClose={() => setPickingDate(false)}>
          <View style={styles.pickerBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickingDate(false)} />
            <View style={[styles.pickerSheet, { backgroundColor: palette.card }]}>
              <AppText color={palette.ink} style={styles.pickerTitle}>
                Entry date
              </AppText>
              {/* Today is the newest day on the wheels — there is nothing to
                  record about a day you have not lived yet. */}
              <WheelDatePicker value={draftDate} onChange={setDraftDate} max={toDateKey()} />
              <AppText variant="caption" color={dayIsOpen(draftDate) ? palette.muted : palette.danger} style={styles.pickerHint}>
                {dayIsOpen(draftDate) ? "Move this entry to a day you missed." : "That day already has an entry."}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                accessibilityState={{ disabled: !dayIsOpen(draftDate) }}
                disabled={!dayIsOpen(draftDate)}
                onPress={confirmDate}
                style={({ pressed }) => [
                  styles.pickerDoneButton,
                  { backgroundColor: palette.green, opacity: !dayIsOpen(draftDate) ? 0.45 : pressed ? 0.88 : 1 }
                ]}
              >
                <AppText variant="button" color={palette.onGreen} style={styles.pickerDoneLabel}>
                  Done
                </AppText>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // No padding of its own — the Screen already insets by screenPaddingX, and
  // adding it again pushed both buttons a full gutter in from the edges.
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: spacing.sm
  },
  // Outlined circle, the same header button the habit screens and the journal
  // list use.
  topBarButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  topBarSpacer: {
    flex: 1
  },
  // The entry's own headline, set like one — serif, no field around it.
  titleInput: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 36,
    lineHeight: 46,
    padding: 0
  },
  dateLine: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xxs,
    marginTop: spacing.xs
  },
  // The same sheet the reminder-time picker uses.
  pickerBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    backgroundColor: "rgba(0, 0, 0, 0.35)"
  },
  pickerSheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radius.dialog,
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing.xl
  },
  pickerTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
    marginBottom: spacing.md
  },
  pickerHint: {
    marginTop: spacing.sm,
    textAlign: "center"
  },
  pickerDoneButton: {
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  pickerDoneLabel: {
    fontSize: 17
  },
  content: {
    flex: 1
  },
  flex: {
    flex: 1
  },
  // Pulls the editor up against the Screen container's built-in child gap so
  // the date block sits flush under the header row.
  editorBody: {
    marginTop: -spacing.md
  },
  editContent: {
    paddingHorizontal: spacing.xs,
    // No lead-in: the attachment (or the title) starts right under the bar.
    paddingTop: 0,
    // The floating action bar it used to clear is gone, so this only needs to
    // keep the last row off the very bottom edge.
    paddingBottom: spacing.sm
  },
  bodyInput: {
    fontFamily: fontFamilies.lexend,
    fontSize: 16,
    lineHeight: 26,
    padding: 0,
    marginTop: spacing.xl,
    minHeight: 220
  },
  // Full width now that the attachment lives in the top bar rather than in a
  // row of thumbnails.
  // Leads the page, so it sits flush at the top and spaces the title below it.
  photoWrap: {
    marginBottom: spacing.xl,
    borderRadius: radius.card,
    overflow: "hidden"
  },
  photo: {
    width: "100%",
    height: 200,
    borderRadius: radius.lg
  },
  photoRemove: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  }
});
