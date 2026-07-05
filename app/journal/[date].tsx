import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Icon } from "@/components/Icon";
import { MarkdownView } from "@/components/MarkdownView";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, LoadingState, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { formatHeaderDateParts, toDateKey } from "@/lib/date";

// Temporarily hidden — flip to true to bring the Voice/Attach/Save bar back.
const SHOW_FLOATING_MENU = false;

const PHOTO_DIRECTORY = `${FileSystem.documentDirectory}journal-photos/`;

async function persistPhoto(uri: string, dateKey: string) {
  await FileSystem.makeDirectoryAsync(PHOTO_DIRECTORY, { intermediates: true });
  const extension = uri.split("?")[0].split(".").pop() || "jpg";
  const destination = `${PHOTO_DIRECTORY}${dateKey}-${new Date().getTime()}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

async function removePhotoFile(uri?: string) {
  if (!uri || !uri.startsWith(PHOTO_DIRECTORY)) {
    return;
  }
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

function joinText(base: string, addition: string) {
  if (!addition) {
    return base;
  }
  return base ? `${base} ${addition}` : addition;
}

type SttSubscription = { remove: () => void };
type SttModule = {
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (options: { lang: string; interimResults?: boolean; continuous?: boolean }) => void;
  stop: () => void;
  abort: () => void;
  addListener: (event: string, listener: (payload: { isFinal?: boolean; results?: { transcript: string }[] }) => void) => SttSubscription;
};

// Loaded lazily so a missing native module (before a rebuild) doesn't crash the
// whole screen at import time — voice just degrades to a helpful message.
function loadSpeechRecognition(): SttModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-speech-recognition").ExpoSpeechRecognitionModule as SttModule;
  } catch {
    return null;
  }
}

export default function JournalEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date: string }>();
  const { journals, isReady, isDark, palette, saveJournal, canCreateJournal } = useLumo();
  const textColor = isDark ? palette.ink : "#1C1B19";

  const dateKey = typeof params.date === "string" ? params.date : toDateKey();
  const existing = journals.find((entry) => entry.date === dateKey);

  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [photoUri, setPhotoUri] = useState<string | undefined>(existing?.photoUri);
  const [mode, setMode] = useState<"view" | "edit">(existing ? "view" : "edit");
  const [listening, setListening] = useState(false);

  const titleRef = useRef(title);
  titleRef.current = title;
  const contentRef = useRef(content);
  contentRef.current = content;
  const photoRef = useRef(photoUri);
  photoRef.current = photoUri;
  const skipSaveRef = useRef(false);
  // Text captured before dictation started, so recognised speech appends to it.
  const voiceBaseRef = useRef("");
  const sttRef = useRef<SttModule | null>(null);
  const sttSubsRef = useRef<SttSubscription[]>([]);

  function clearVoiceSubs() {
    sttSubsRef.current.forEach((sub) => sub.remove());
    sttSubsRef.current = [];
  }

  useEffect(() => {
    return () => {
      try {
        sttRef.current?.abort();
      } catch {
        // module went away; nothing to clean up
      }
      clearVoiceSubs();
    };
  }, []);

  const blocked = !existing && !canCreateJournal;
  if (blocked) {
    skipSaveRef.current = true;
  }

  useEffect(() => {
    if (blocked) {
      router.replace("/paywall");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  useEffect(() => {
    return () => {
      if (!skipSaveRef.current) {
        saveJournal(dateKey, contentRef.current, photoRef.current, existing?.mood, titleRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  if (!isReady || blocked) {
    return <LoadingState />;
  }

  const parts = formatHeaderDateParts(dateKey);

  function toggleMode() {
    setMode((current) => {
      if (current === "edit") {
        Keyboard.dismiss();
        return "view";
      }
      return "edit";
    });
  }

  async function toggleVoice() {
    if (listening) {
      sttRef.current?.stop();
      setListening(false);
      return;
    }

    const stt = loadSpeechRecognition();
    if (!stt) {
      Alert.alert("Voice unavailable", "Rebuild the app to enable voice-to-text (run: npx expo run:ios).");
      return;
    }

    const permission = await stt.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone needed", "Allow microphone and speech access to dictate your journal.");
      return;
    }

    sttRef.current = stt;
    clearVoiceSubs();
    sttSubsRef.current = [
      stt.addListener("result", (event) => {
        const transcript = event.results?.[0]?.transcript ?? "";
        if (event.isFinal) {
          voiceBaseRef.current = joinText(voiceBaseRef.current, transcript);
          setContent(voiceBaseRef.current);
        } else {
          setContent(joinText(voiceBaseRef.current, transcript));
        }
      }),
      stt.addListener("end", () => {
        setListening(false);
        clearVoiceSubs();
      }),
      stt.addListener("error", () => {
        setListening(false);
        clearVoiceSubs();
      })
    ];

    voiceBaseRef.current = content.trim();
    setListening(true);
    stt.start({ lang: "en-US", interimResults: true, continuous: true });
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Allow photo access to attach an image to your journal.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: false, quality: 0.8 });
    if (result.canceled || !result.assets?.length) {
      return;
    }
    try {
      const previous = photoUri;
      const stored = await persistPhoto(result.assets[0].uri, dateKey);
      setPhotoUri(stored);
      if (previous && previous !== stored) {
        removePhotoFile(previous);
      }
    } catch {
      Alert.alert("Couldn't attach photo", "Something went wrong saving that image. Please try again.");
    }
  }

  function removePhoto() {
    const current = photoUri;
    setPhotoUri(undefined);
    removePhotoFile(current);
  }

  function handleSave() {
    if (listening) {
      sttRef.current?.stop();
    }
    Keyboard.dismiss();
    router.back();
  }

  const toggleAction =
    mode === "view"
      ? ({ icon: "edit", label: "Edit", onPress: toggleMode, iconSize: 21, iconStyle: { transform: [{ translateY: 5 }] } } as const)
      : ({ icon: "eye", label: "Preview", onPress: toggleMode, iconSize: 22, iconStyle: { transform: [{ translateY: 5 }] } } as const);

  return (
    <Screen scroll={false} contentStyle={styles.content} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        centerContent={
          <AppText variant="bodySmall" color={palette.greenDark} style={styles.headerDate}>
            {parts.weekday}, {parts.date}
          </AppText>
        }
        rightActions={[toggleAction]}
      />

      <KeyboardAvoidingView style={[styles.flex, styles.editorBody]} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
        {mode === "edit" ? (
          <>
            <ScrollView style={styles.flex} contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Title"
                placeholderTextColor={`${palette.body}66`}
                multiline
                autoFocus={!existing}
                style={[styles.titleInput, { color: palette.ink }]}
              />
              {photoUri ? (
                <View style={styles.photoWrap}>
                  <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    onPress={removePhoto}
                    style={({ pressed }) => [styles.photoRemove, { backgroundColor: alpha("#000000", "8C"), opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Icon name="close" size={16} color={palette.white} weight="bulk" />
                  </Pressable>
                </View>
              ) : null}
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="Write about your day…"
                placeholderTextColor={`${palette.body}66`}
                multiline
                textAlignVertical="top"
                style={[styles.bodyInput, { color: textColor }]}
              />
            </ScrollView>

            {SHOW_FLOATING_MENU ? (
            <View style={styles.floatingWrap} pointerEvents="box-none">
              <View style={[styles.floatingBar, { backgroundColor: palette.card, shadowColor: palette.shadow, borderColor: palette.hairline }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={listening ? "Stop dictation" : "Dictate with voice"}
                  onPress={toggleVoice}
                  style={({ pressed }) => [styles.floatingButton, listening ? { backgroundColor: alpha(palette.danger, "1F") } : null, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Icon name={listening ? "microphone" : "microphone"} size={22} color={listening ? palette.danger : palette.ink} weight="bulk" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Attach a photo"
                  onPress={pickPhoto}
                  style={({ pressed }) => [styles.floatingButton, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Icon name="attachment" size={22} color={palette.ink} weight="bulk" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save journal"
                  onPress={handleSave}
                  style={({ pressed }) => [styles.floatingSave, { backgroundColor: palette.green, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Icon name="checkCircle" size={22} color={palette.white} weight="bulk" />
                </Pressable>
              </View>
            </View>
            ) : null}
          </>
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.viewContent} showsVerticalScrollIndicator={false}>
            {title.trim() ? (
              <AppText color={palette.ink} style={styles.titleView}>
                {title}
              </AppText>
            ) : null}
            {photoUri ? <Image source={{ uri: photoUri }} style={styles.photoView} resizeMode="cover" /> : null}
            {content.trim() ? (
              <MarkdownView content={content} textColor={textColor} />
            ) : !title.trim() ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Start writing" onPress={toggleMode}>
                <AppText variant="body" color={palette.muted} style={styles.emptyView}>
                  Nothing written yet. Tap the edit icon to start.
                </AppText>
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1
  },
  flex: {
    flex: 1
  },
  // Pulls the editor up against the Screen container's built-in child gap.
  editorBody: {
    marginTop: -spacing.xs
  },
  headerDate: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 16,
    lineHeight: 20,
    transform: [{ translateY: -8 }]
  },
  editContent: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: 120
  },
  titleInput: {
    fontFamily: "Lexend-Black",
    fontSize: 30,
    lineHeight: 38,
    paddingVertical: spacing.xs
  },
  bodyInput: {
    fontFamily: fontFamilies.lexend,
    fontSize: 17,
    lineHeight: 26,
    paddingTop: spacing.sm,
    minHeight: 200
  },
  photoWrap: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
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
  },
  floatingWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: spacing.md,
    alignItems: "center"
  },
  floatingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8
  },
  floatingButton: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  floatingSave: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  viewContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm
  },
  titleView: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 30,
    lineHeight: 38
  },
  photoView: {
    width: "100%",
    height: 200,
    borderRadius: radius.lg
  },
  emptyView: {
    paddingTop: spacing.md
  }
});
