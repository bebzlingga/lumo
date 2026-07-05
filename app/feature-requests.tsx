import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import React, { useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from "react-native-svg";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Button, Card, LoadingState, LumoInput, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { FeatureRequest, FeatureRequestStatus } from "@/types/habit";

// Free users get a teaser of the board; the rest is behind the Pro fade.
const FREE_PREVIEW_COUNT = 3;

const PHOTO_DIRECTORY = `${FileSystem.documentDirectory}feature-photos/`;

// Copy the picked image into the app's document directory so it survives the OS
// clearing the picker cache.
async function persistPhoto(uri: string) {
  await FileSystem.makeDirectoryAsync(PHOTO_DIRECTORY, { intermediates: true });
  const extension = uri.split("?")[0].split(".").pop() || "jpg";
  const destination = `${PHOTO_DIRECTORY}${new Date().getTime()}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

async function removePhotoFile(uri?: string) {
  if (!uri || !uri.startsWith(PHOTO_DIRECTORY)) {
    return;
  }
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}


type SortMode = "top" | "newest" | "completed";

const sortTabs: { value: SortMode; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "newest", label: "Newest" },
  { value: "completed", label: "Completed" }
];

export default function FeatureRequestsScreen() {
  const router = useRouter();
  const { featureRequests, isReady, isDark, palette, canUseFeatureBoard, submitFeatureRequest, toggleFeatureVote } = useLumo();
  const buttonFill = isDark ? palette.green : palette.greenDark;
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [sortMode, setSortMode] = useState<SortMode>("top");
  // The order toggle (right-side arrow). Meaning depends on the active tab.
  const [reversed, setReversed] = useState(false);

  const sorted = useMemo(() => {
    // Completed tab: in-progress + shipped, grouped; arrow toggles which group
    // leads (completed-first by default, ongoing-first when reversed).
    if (sortMode === "completed") {
      const items = featureRequests.filter((r) => r.status === "in_progress" || r.status === "done");
      const leads = (r: FeatureRequest) => (reversed ? r.status === "in_progress" : r.status === "done");
      return items.sort((a, b) => (leads(b) ? 1 : 0) - (leads(a) ? 1 : 0) || b.votes - a.votes || b.createdAt.localeCompare(a.createdAt));
    }

    // Top / Newest: everything not yet shipped (completed lives on its own tab).
    const active = featureRequests.filter((r) => r.status !== "done");
    if (sortMode === "newest") {
      return active.sort((a, b) => (reversed ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
    }
    return active.sort((a, b) =>
      reversed ? a.votes - b.votes || a.createdAt.localeCompare(b.createdAt) : b.votes - a.votes || b.createdAt.localeCompare(a.createdAt)
    );
  }, [featureRequests, sortMode, reversed]);

  const countLabel = `${sorted.length} ${sortMode === "completed" ? "Completed" : sorted.length === 1 ? "Request" : "Requests"}`;
  // Free users see a capped preview; Pro sees the whole board.
  const visible = canUseFeatureBoard ? sorted : sorted.slice(0, FREE_PREVIEW_COUNT);

  if (!isReady) {
    return <LoadingState />;
  }

  function requirePro() {
    router.push("/paywall");
  }

  function handleVote(id: string) {
    if (!canUseFeatureBoard) {
      requirePro();
      return;
    }
    toggleFeatureVote(id);
  }

  function openComposer() {
    if (!canUseFeatureBoard) {
      requirePro();
      return;
    }
    setComposerOpen(true);
  }

  function closeComposer() {
    // Drop a picked-but-unsubmitted photo so it doesn't orphan on disk.
    removePhotoFile(photoUri);
    setPhotoUri(undefined);
    setComposerOpen(false);
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
      const stored = await persistPhoto(result.assets[0].uri);
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

  function submit() {
    submitFeatureRequest(title, description, photoUri);
    setTitle("");
    setDescription("");
    setPhotoUri(undefined);
    setComposerOpen(false);
  }

  const orderLabel =
    sortMode === "top" ? (reversed ? "Lowest" : "Highest") : sortMode === "newest" ? (reversed ? "Oldest" : "Newest") : reversed ? "Ongoing" : "Completed";

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        centerContent={
          <AppText variant="titleSmall" color={palette.ink} style={styles.headerTitle}>
            Feature Board
          </AppText>
        }
        rightActions={[{ icon: "elementPlus", label: "Suggest a feature", onPress: openComposer, iconSize: 22, iconStyle: { transform: [{ translateY: 6 }] } }]}
      />

      <View style={[styles.segmented, { backgroundColor: isDark ? palette.chartTrack : alpha(palette.chartTrack, "99"), shadowColor: isDark ? "transparent" : palette.shadow }]}>
        {sortTabs.map((tab) => {
          const active = sortMode === tab.value;
          return (
            <Pressable
              key={tab.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setSortMode(tab.value);
                setReversed(false);
              }}
              style={styles.segment}
            >
              <View
                style={[
                  styles.segmentSurface,
                  active
                    ? {
                        backgroundColor: isDark ? palette.greenDark : palette.white,
                        borderColor: isDark ? palette.greenDark : "transparent",
                        borderWidth: isDark ? 1 : 0,
                        shadowColor: isDark ? "transparent" : palette.shadow,
                        shadowOpacity: isDark ? 0 : 0.08,
                        shadowRadius: 5,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 1
                      }
                    : { backgroundColor: "transparent" }
                ]}
              >
                <AppText variant="button" color={active ? (isDark ? palette.onAccent : palette.greenDark) : palette.subtle} numberOfLines={1} style={styles.segmentText}>
                  {tab.label}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.infoRow}>
        <AppText variant="bodySmall" color={palette.ink} style={styles.infoCount}>
          {countLabel}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Order: ${orderLabel}. Tap to change.`}
          hitSlop={8}
          onPress={() => setReversed((v) => !v)}
          style={({ pressed }) => [styles.orderToggle, { backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
        >
          <AppText variant="caption" color={palette.greenDark} style={styles.orderLabel}>
            {orderLabel}
          </AppText>
          <Icon name={reversed ? "arrowUp" : "arrowDown"} size={16} color={palette.greenDark} weight="bulk" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.list, canUseFeatureBoard ? styles.listPadPro : styles.listPadFree]}
        showsVerticalScrollIndicator={false}
      >
        {visible.length ? (
          visible.map((request) => (
            <RequestRow key={request.id} request={request} onVote={() => handleVote(request.id)} />
          ))
        ) : (
          <AppText variant="bodySmall" color={palette.subtle} style={styles.empty}>
            {sortMode === "completed" ? "Nothing here yet." : "No requests yet."}
          </AppText>
        )}
      </ScrollView>

      {!canUseFeatureBoard ? (
        <View pointerEvents="box-none" style={styles.bottomFade}>
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <SvgLinearGradient id="featureFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={palette.canvas} stopOpacity={0} />
                <Stop offset="0.5" stopColor={palette.canvas} stopOpacity={1} />
                <Stop offset="1" stopColor={palette.canvas} stopOpacity={1} />
              </SvgLinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#featureFade)" />
          </Svg>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Unlock Pro to submit and vote"
            onPress={requirePro}
            style={({ pressed }) => [styles.upsell, { backgroundColor: buttonFill, opacity: pressed ? 0.85 : 1 }]}
          >
            <Icon name="sparkle" size={20} color={palette.white} weight="bulk" />
            <AppText variant="bodySmall" color={palette.white} style={styles.upsellText}>
              Unlock Pro to submit ideas and vote
            </AppText>
            <Icon name="chevronDown" size={18} color={palette.white} weight="bulk" style={styles.upsellChevron} />
          </Pressable>
        </View>
      ) : null}

      <Modal transparent animationType="fade" visible={composerOpen} onRequestClose={closeComposer}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeComposer} />
          <View style={[styles.sheet, { backgroundColor: palette.card }]}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.sheetTitle}>
              Suggest a feature
            </AppText>
            <LumoInput
              value={title}
              onChangeText={setTitle}
              placeholder="Short title"
              style={[styles.input, { borderColor: alpha(palette.greenDark, "33") }]}
            />
            <LumoInput
              value={description}
              onChangeText={setDescription}
              placeholder="What should it do? (optional)"
              multiline
              style={[styles.input, styles.inputMultiline, { borderColor: alpha(palette.greenDark, "33") }]}
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
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Attach a photo"
                onPress={pickPhoto}
                style={({ pressed }) => [styles.photoAttach, { borderColor: alpha(palette.greenDark, "33"), opacity: pressed ? 0.7 : 1 }]}
              >
                <Icon name="gallery" size={18} color={palette.greenDark} weight="bulk" />
                <AppText variant="bodySmall" color={palette.greenDark} style={styles.photoAttachText}>
                  Attach a photo
                </AppText>
              </Pressable>
            )}

            <View style={[styles.ctaShell, styles.submitShell, { backgroundColor: buttonFill, shadowColor: isDark ? "transparent" : palette.greenDark }]}>
              <Button
                label="Submit"
                variant="primary"
                disabled={!title.trim()}
                onPress={submit}
                className="min-h-[48px] w-full flex-row items-center justify-center rounded-[18px] px-4 py-2"
                style={{ backgroundColor: buttonFill, borderRadius: 18, borderWidth: 0 }}
                labelStyle={{ fontSize: 16 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function RequestRow({
  request,
  onVote
}: {
  request: FeatureRequest;
  onVote: () => void;
}) {
  const { palette } = useLumo();
  const voted = request.votedByMe;

  return (
    <Card style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${voted ? "Remove vote from" : "Vote for"} ${request.title}. ${request.votes} votes.`}
        accessibilityState={{ selected: voted }}
        onPress={onVote}
        style={({ pressed }) => [
          styles.voteButton,
          {
            backgroundColor: voted ? palette.greenDark : alpha(palette.greenDark, "10"),
            opacity: pressed ? 0.8 : 1
          }
        ]}
      >
        <Icon name="chevronDown" size={16} color={voted ? palette.white : palette.greenDark} weight="bulk" style={styles.voteCaret} />
        <AppText variant="caption" color={voted ? palette.white : palette.greenDark} style={styles.voteCount}>
          {request.votes}
        </AppText>
      </Pressable>

      <View style={styles.rowText}>
        <View style={styles.rowHead}>
          <AppText variant="titleSmall" color={palette.ink} numberOfLines={2} style={styles.rowTitle}>
            {request.title}
          </AppText>
          {request.status === "in_progress" ? (
            <View style={[styles.tag, { backgroundColor: alpha(palette.chartPartial, "22") }]}>
              <AppText variant="caption" color={palette.chartPartial}>
                Ongoing
              </AppText>
            </View>
          ) : null}
          {request.status === "done" ? (
            <View style={[styles.tag, { backgroundColor: alpha(palette.greenDark, "12") }]}>
              <AppText variant="caption" color={palette.greenDark}>
                Shipped
              </AppText>
            </View>
          ) : null}
          {request.mine ? (
            <View style={[styles.tag, { backgroundColor: alpha(palette.greenDark, "12") }]}>
              <AppText variant="caption" color={palette.greenDark}>
                Yours
              </AppText>
            </View>
          ) : null}
        </View>
        {request.description ? (
          <AppText variant="bodySmall" color={palette.subtle} numberOfLines={3} style={styles.rowBody}>
            {request.description}
          </AppText>
        ) : null}
        {request.photoUri ? <Image source={{ uri: request.photoUri }} style={styles.rowPhoto} resizeMode="cover" /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md
  },
  headerTitle: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 17,
    lineHeight: 22,
    transform: [{ translateY: -6 }]
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm
  },
  infoCount: {
    fontFamily: fontFamilies.lexendBold
  },
  orderToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill
  },
  orderLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  segmented: {
    flexDirection: "row",
    borderRadius: radius.xl,
    padding: spacing.xs,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 4
  },
  segment: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 2
  },
  segmentSurface: {
    minHeight: 40,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    alignItems: "center",
    justifyContent: "center"
  },
  segmentText: {
    textAlign: "center",
    fontFamily: fontFamilies.lexendSemiBold
  },
  empty: {
    textAlign: "center",
    paddingVertical: spacing.xl,
    lineHeight: 21
  },
  scroll: {
    flex: 1,
    marginHorizontal: -spacing.lg
  },
  list: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  listPadPro: {
    paddingBottom: spacing.xxl
  },
  listPadFree: {
    // Room so the last preview row isn't fully hidden under the fade + CTA.
    paddingBottom: 140
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    justifyContent: "flex-end"
  },
  upsell: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.nav
  },
  upsellText: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold
  },
  upsellChevron: {
    transform: [{ rotate: "-90deg" }]
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md
  },
  voteButton: {
    width: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    gap: 2
  },
  voteCaret: {
    transform: [{ rotate: "180deg" }]
  },
  voteCount: {
    fontFamily: fontFamilies.lexendBold
  },
  rowText: {
    flex: 1,
    gap: spacing.xxs
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs
  },
  rowTitle: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold
  },
  tag: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2
  },
  rowBody: {
    lineHeight: 20
  },
  statusText: {
    fontFamily: fontFamilies.lexendSemiBold,
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    backgroundColor: "rgba(0, 0, 0, 0.35)"
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md
  },
  sheetTitle: {
    fontFamily: fontFamilies.lexendBold
  },
  input: {
    borderWidth: 0,
    borderBottomWidth: 1,
    borderRadius: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    fontFamily: fontFamilies.lexendSemiBold
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: "top"
  },
  ctaShell: {
    borderRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8
  },
  submitShell: {
    marginTop: spacing.sm
  },
  photoAttach: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed"
  },
  photoAttachText: {
    fontFamily: fontFamilies.lexendSemiBold
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
  rowPhoto: {
    width: "100%",
    height: 120,
    borderRadius: radius.md,
    marginTop: spacing.xxs
  }
});
