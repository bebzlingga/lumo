import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Button, FieldLabel, LoadingState, LumoInput, Screen } from "@/components/ui";
import { CTA_FILL, fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { featureBoardService } from "@/lib/featureBoard";
import { persistPickedPhoto, removePickedPhoto } from "@/lib/localPhotos";
import { FeatureRequestType } from "@/types/habit";

const typeOptions: {
  value: FeatureRequestType;
  icon: IconName;
  label: string;
  tagline: string;
}[] = [
  { value: "feature", icon: "sparkle", label: "Feature idea", tagline: "What would make Lumo better?" },
  { value: "bug", icon: "zap", label: "Bug report", tagline: "Something not working right?" }
];

const formCopy: Record<
  FeatureRequestType,
  { heading: string; sub: string; titleLabel: string; titlePlaceholder: string; bodyLabel: string; bodyPlaceholder: string; cta: string }
> = {
  feature: {
    heading: "Shape what's next",
    sub: "The most-voted ideas get built first — yours could be next.",
    titleLabel: "Your idea",
    titlePlaceholder: "e.g. Home screen widgets",
    bodyLabel: "How would it work?",
    bodyPlaceholder: "What problem does it solve? When would you use it?",
    cta: "Send idea"
  },
  bug: {
    heading: "Help us squash it",
    sub: "Every report makes Lumo more reliable for everyone. Thank you!",
    titleLabel: "What went wrong?",
    titlePlaceholder: "e.g. Streak resets after midnight",
    bodyLabel: "What happened?",
    bodyPlaceholder: "What did you expect, and what happened instead? Steps to reproduce help a lot.",
    cta: "Report bug"
  }
};

export default function SubmitRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; editId?: string }>();
  const editId = typeof params.editId === "string" ? params.editId : undefined;
  const { width } = useWindowDimensions();
  const { isReady, isDark, palette, canUseFeatureBoard } = useLumo();
  // Type cards ride a horizontal scroll at 60% of the content width each.
  const typeCardWidth = Math.round((width - spacing.lg * 2) * 0.6);
  const [type, setType] = useState<FeatureRequestType>(params.type === "bug" ? "bug" : "feature");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  // Edit mode: whether the photo differs from what's stored on the server.
  const [photoChanged, setPhotoChanged] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editId));
  const [submitting, setSubmitting] = useState(false);
  const copy = formCopy[type];
  const fieldBorderColor = alpha(palette.greenDark, "33");

  // Submitting is subscriber-only; the board itself gates non-subscribers, so
  // this only catches deep links / stale nav — bounce them back out.
  const blocked = isReady && !canUseFeatureBoard;
  useEffect(() => {
    if (blocked) {
      router.back();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  // Edit mode: prefill the form from the existing post.
  useEffect(() => {
    if (!editId) {
      return;
    }
    featureBoardService.getRequest(editId).then((existing) => {
      if (existing) {
        setType(existing.type ?? "feature");
        setTitle(existing.title);
        setDescription(existing.description ?? "");
        setPhotoUri(existing.photoUri);
        setPhotoChanged(false);
      }
      setLoadingEdit(false);
    });
  }, [editId]);

  if (!isReady || blocked || loadingEdit) {
    return <LoadingState />;
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Allow photo access to attach a screenshot.");
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

    try {
      const previous = photoUri;
      const stored = await persistPickedPhoto(result.assets[0].uri);
      setPhotoUri(stored);
      setPhotoChanged(true);
      if (previous && previous !== stored) {
        removePickedPhoto(previous);
      }
    } catch {
      Alert.alert("Couldn't attach photo", "Something went wrong saving that image. Please try again.");
    }
  }

  function removePhoto() {
    const current = photoUri;
    setPhotoUri(undefined);
    setPhotoChanged(true);
    removePickedPhoto(current);
  }

  async function submit() {
    if (submitting || !title.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      if (editId) {
        const ok = await featureBoardService.updateRequest(editId, {
          title,
          description,
          type,
          photo: photoChanged ? { changed: true, uri: photoUri } : undefined
        });

        if (!ok) {
          Alert.alert("Couldn't save", "Editing may be locked (someone has voted since), or you're offline. You can add an update from the post instead.");
          return;
        }

        removePickedPhoto(photoUri);
        Alert.alert("Changes saved", "Your post has been updated.");
        router.back();
        return;
      }

      const ok = await featureBoardService.submitRequest({ title, description, photoUri, type });

      if (!ok) {
        Alert.alert("Couldn't submit", "Something went wrong sending it. Please check your connection and try again.");
        return;
      }

      removePickedPhoto(photoUri);
      Alert.alert(
        type === "bug" ? "Bug reported!" : "Idea received!",
        type === "bug" ? "Thank you — we're on it. You can track its status on the board." : "Thank you! Others can now vote it up the board."
      );
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader
        leftAction={{
          icon: "back",
          label: "Back",
          onPress: () => {
            removePickedPhoto(photoUri);
            router.back();
          }
        }}
      />

      <View style={styles.copyBlock}>
        <AppText variant="displaySmall" color={palette.ink} style={styles.heading}>
          {editId ? "Edit your post" : copy.heading}
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.sub}>
          {editId ? "Fix the wording or swap the screenshot — your post stays in place." : copy.sub}
        </AppText>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll} contentContainerStyle={styles.typeRow}>
        {typeOptions.map((option) => {
          const selected = type === option.value;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`${option.label}. ${option.tagline}`}
              accessibilityState={{ selected }}
              onPress={() => setType(option.value)}
              style={[
                styles.typeCard,
                {
                  width: typeCardWidth,
                  backgroundColor: selected ? alpha(palette.greenDark, isDark ? "26" : "12") : palette.card,
                  borderColor: selected ? palette.greenDark : palette.hairline,
                  shadowColor: isDark ? "transparent" : palette.shadow
                }
              ]}
            >
              <View style={[styles.typeIcon, { backgroundColor: selected ? palette.greenDark : alpha(palette.greenDark, "12") }]}>
                {/* In dark mode greenDark is a light tint, so the selected
                    icon needs the dark onAccent ink instead of white. */}
                <Icon name={option.icon} size={20} color={selected ? (isDark ? palette.onAccent : palette.white) : palette.greenDark} weight="bulk" />
              </View>
              <AppText variant="titleSmall" color={palette.ink} style={styles.typeLabel}>
                {option.label}
              </AppText>
              <AppText variant="caption" color={palette.subtle} numberOfLines={2} style={styles.typeTagline}>
                {option.tagline}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.form}>
        <View style={styles.field}>
          <FieldLabel style={styles.fieldLabel}>{copy.titleLabel}</FieldLabel>
          <LumoInput
            value={title}
            onChangeText={setTitle}
            placeholder={copy.titlePlaceholder}
            style={[styles.flatInput, { borderColor: fieldBorderColor }]}
          />
        </View>

        <View style={styles.field}>
          <FieldLabel style={styles.fieldLabel}>{copy.bodyLabel}</FieldLabel>
          <LumoInput
            value={description}
            onChangeText={setDescription}
            placeholder={copy.bodyPlaceholder}
            multiline
            style={[styles.flatInput, styles.flatInputMultiline, { borderColor: fieldBorderColor }]}
          />
        </View>

        {/* NativeWind's css-interop drops function-valued `style` props on
            Pressable, so these use plain style arrays. */}
        {photoUri ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              onPress={removePhoto}
              style={[styles.photoRemove, { backgroundColor: alpha("#000000", "8C") }]}
            >
              <Icon name="close" size={16} color={palette.white} weight="bulk" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach a photo"
            onPress={pickPhoto}
            style={[styles.photoAttach, { borderColor: alpha(palette.greenDark, "33") }]}
          >
            <Icon name="gallery" size={20} color={palette.greenDark} weight="bulk" />
            <AppText variant="bodySmall" color={palette.greenDark} style={styles.photoAttachText}>
              {type === "bug" ? "Attach a screenshot (helps a lot!)" : "Attach a photo"}
            </AppText>
          </Pressable>
        )}
      </View>

      <View style={[styles.ctaShell, { backgroundColor: CTA_FILL, shadowColor: isDark ? "transparent" : palette.greenDark }]}>
        <Button
          label={submitting ? (editId ? "Saving…" : "Sending…") : editId ? "Save changes" : copy.cta}
          variant="primary"
          disabled={!title.trim() || submitting}
          onPress={submit}
          className="min-h-[52px] w-full flex-row items-center justify-center rounded-full px-4 py-2"
          style={{ backgroundColor: CTA_FILL, borderRadius: radius.pill, borderWidth: 0 }}
          labelStyle={{ fontSize: 16 }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.lg
  },
  copyBlock: {
    marginTop: -spacing.lg,
    gap: spacing.xs
  },
  heading: {
    fontFamily: fontFamilies.lexendBold
  },
  sub: {
    lineHeight: 20
  },
  // Bleed the scroll viewport to the screen edges so cards clip there — the
  // cue that the row scrolls.
  typeScroll: {
    marginHorizontal: -layout.screenPaddingX,
    flexGrow: 0
  },
  typeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: layout.screenPaddingX
  },
  typeCard: {
    gap: spacing.xxs,
    padding: spacing.md,
    borderRadius: radius.nav,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  typeIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxs
  },
  typeLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  typeTagline: {
    lineHeight: 15
  },
  form: {
    gap: spacing.lg
  },
  field: {
    gap: spacing.xs
  },
  fieldLabel: {
    fontSize: 14,
    lineHeight: 19
  },
  flatInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderRadius: 0,
    minHeight: 0,
    paddingHorizontal: 0,
    paddingTop: spacing.xxs,
    paddingBottom: spacing.sm,
    fontFamily: fontFamilies.lexendSemiBold
  },
  flatInputMultiline: {
    minHeight: 84,
    textAlignVertical: "top"
  },
  photoWrap: {
    borderRadius: radius.lg,
    overflow: "hidden"
  },
  photo: {
    width: "100%",
    height: 160,
    borderRadius: radius.lg
  },
  photoRemove: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  // Dashed dropzone: icon stacked above the label, both centered.
  photoAttach: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed"
  },
  photoAttachText: {
    fontFamily: fontFamilies.lexendSemiBold,
    textAlign: "center"
  },
  ctaShell: {
    marginTop: spacing.md,
    borderRadius: radius.pill,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8
  }
});
