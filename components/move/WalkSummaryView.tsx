import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import React from "react";
import { Alert, Image, StyleSheet, useWindowDimensions, View, type HostInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Icon } from "@/components/Icon";
import { Metric } from "@/components/move/TrackingUI";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { WalkBackground } from "@/components/WalkBackground";
import { WalkRoute } from "@/components/WalkRoute";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { toWalkPoints } from "@/lib/move/tracking/bridge";
import { elevationGain, estimateCalories, formatDistanceValue, formatDuration, formatElevation, formatPace } from "@/lib/move/tracking/pace";
import type { ActivityTrackingState } from "@/lib/move/tracking/types";

/**
 * A finished walk: the distance, four figures, the route — and the share card
 * it doubles as.
 *
 * The tick in the page bar saves it; Share and Discard sit at the foot. The
 * capture takes the whole frame (Lumo's scene, or the walker's own photo behind
 * the figures), with the controls hidden for the shot.
 */
export function WalkSummaryView({
  state,
  averagePace,
  accent,
  companions,
  saving,
  onSave,
  onDiscard
}: {
  state: ActivityTrackingState;
  averagePace: number | null;
  accent: string;
  companions: string;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { palette } = useLumo();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const summaryRef = React.useRef<HostInstance>(null);
  /** True for the frame the image is taken in, so chrome can step out of it. */
  const [capturing, setCapturing] = React.useState(false);
  /** A backdrop for one picture — deliberately never saved anywhere. */
  const [photo, setPhoto] = React.useState<string | null>(null);
  /** Light figures for a dark photo, dark for a bright one. */
  const [light, setLight] = React.useState(false);

  const route = toWalkPoints(state);
  const calories = estimateCalories({ distanceM: state.distanceMeters, movingMs: state.movingDuration });
  // On Lumo's scene the palette answers the colour; over a photo the walker
  // chooses, black (not the warm ink) or white with a halo.
  const tone = photo
    ? { ink: light ? palette.white : "#000000", muted: alpha(light ? palette.white : "#000000", "CC"), shadow: light ? styles.onPhoto : undefined }
    : { ink: palette.ink, muted: palette.muted, shadow: undefined };
  const metric = { color: tone.ink, labelColor: tone.muted, textStyle: tone.shadow };

  async function pickPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      // iOS "limited" reports granted:false yet still opens a picker; only a
      // hard, final denial is worth stopping on.
      if (!permission.granted && !permission.canAskAgain) {
        Alert.alert("Photo access needed", "Allow photo access for Lumo in Settings to use one of your photos.");

        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: false, quality: 0.9 });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      setPhoto(result.assets[0].uri);
      // Photos are usually darker than the cream scene — a guess, with the toggle right there.
      setLight(true);
    } catch (error) {
      Alert.alert("Couldn't use that photo", error instanceof Error ? error.message : "Please try again.");
    }
  }

  function handlePhotoPress() {
    if (!photo) {
      void pickPhoto();

      return;
    }

    Alert.alert("Photo behind your card", undefined, [
      { text: "Choose another", onPress: () => void pickPhoto() },
      {
        text: "Remove photo",
        style: "destructive",
        onPress: () => {
          setPhoto(null);
          setLight(false);
        }
      },
      { text: "Cancel", style: "cancel" }
    ]);
  }

  async function handleShare() {
    let uri: string;

    setCapturing(true);
    // One beat for the hidden controls to leave the screen before the shot.
    await new Promise((resolve) => setTimeout(resolve, 64));

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
      uri = await captureRef(summaryRef, { format: "png", quality: 1, result: "tmpfile" });
    } catch {
      Alert.alert("Almost there", "Sharing needs the latest app build. Rebuild the app to enable it.");

      return;
    } finally {
      setCapturing(false);
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your walk" });
      }
    } catch {
      Alert.alert("Sharing failed", "Could not share the image. Please try again.");
    }
  }

  const headerSlot = capturing ? <View style={styles.headerSlot} /> : undefined;

  return (
    // The ref sits outside `Screen` and carries its own background, so the PNG
    // takes the backdrop with it instead of a transparent ground.
    <View ref={summaryRef} collapsable={false} style={[styles.fill, { backgroundColor: palette.canvas }]}>
      <Screen
        contentStyle={styles.content}
        backgroundVariant={null}
        backgroundNode={
          photo ? (
            <View style={StyleSheet.absoluteFill}>
              <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              {/* Held back only where the figures sit, in the tone opposite the text. */}
              <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                  <LinearGradient id="sharePhotoScrim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={light ? "#000000" : "#FFFFFF"} stopOpacity="0.8" />
                    <Stop offset="0.45" stopColor={light ? "#000000" : "#FFFFFF"} stopOpacity="0.5" />
                    <Stop offset="0.85" stopColor={light ? "#000000" : "#FFFFFF"} stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width={width} height={height} fill="url(#sharePhotoScrim)" />
              </Svg>
            </View>
          ) : (
            <WalkBackground plate="walkDone" />
          )
        }
      >
        <ScreenHeader
          centerContent={
            // Both always laid out, one invisible — swapping by opacity keeps the
            // header from re-laying out in the frame before the shot.
            <View style={styles.headerCenter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={photo ? "Change or remove the photo behind this card" : "Use one of your photos behind this card"}
                accessibilityElementsHidden={capturing}
                disabled={capturing}
                onPress={handlePhotoPress}
                style={({ pressed }) => [styles.photoButton, { borderColor: alpha(tone.ink, "59"), opacity: capturing ? 0 : pressed ? 0.6 : 1 }]}
              >
                <Icon name="gallery" size={16} color={tone.ink} weight="bulk" />
                <AppText variant="caption" color={tone.ink} numberOfLines={1}>
                  {photo ? "Change photo" : "Add photo"}
                </AppText>
              </Pressable>
              {/* The mark a shared picture carries once it leaves the app. */}
              <View pointerEvents="none" style={styles.markSlot} importantForAccessibility={capturing ? "auto" : "no-hide-descendants"}>
                <AppText color={tone.ink} numberOfLines={1} style={[styles.mark, tone.shadow, { opacity: capturing ? 1 : 0 }]}>
                  LUMO
                </AppText>
              </View>
            </View>
          }
          leftAction={
            photo
              ? {
                  icon: light ? "sun" : "moon",
                  label: light ? "Light text, switch to dark" : "Dark text, switch to light",
                  onPress: () => setLight((current) => !current),
                  iconColor: tone.ink,
                  borderColor: alpha(tone.ink, "59"),
                  render: headerSlot
                }
              : undefined
          }
          rightAction={{
            icon: "check",
            label: saving ? "Saving" : "Save this activity",
            onPress: onSave,
            iconColor: tone.ink,
            borderColor: alpha(tone.ink, "59"),
            render: headerSlot
          }}
        />

        <View style={styles.hero}>
          <AppText color={tone.ink} style={[styles.distance, tone.shadow]} numberOfLines={1}>
            {formatDistanceValue(state.distanceMeters)}
            <AppText color={tone.ink} style={styles.distanceUnit}>
              {" km"}
            </AppText>
          </AppText>
          {companions ? (
            <AppText variant="caption" color={tone.muted} numberOfLines={1} style={tone.shadow}>
              With {companions}
            </AppText>
          ) : null}
        </View>

        {/* Four figures in a 2×2 grid. Average speed is gone: it is pace in
            another unit, and one walk needs one answer to "how fast". */}
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <Metric label="Moving time" value={formatDuration(state.movingDuration)} {...metric} />
            <Metric label="Avg. pace" value={averagePace === null ? "—" : formatPace(averagePace)} {...metric} />
          </View>
          <View style={styles.gridRow}>
            <Metric label="Calories (est.)" value={`${calories ?? 0}`} {...metric} />
            <Metric label="Elevation" value={formatElevation(elevationGain(state.segments))} {...metric} />
          </View>
        </View>

        {route.length > 0 ? <WalkRoute route={route} accent={accent} width={width - layout.screenPaddingX * 2} height={200} /> : null}
      </Screen>

      {/* Floating at the foot so it is never below the fold; hidden by opacity
          for the shot, since pulling it from the layout shifted the page. */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share this activity"
          accessibilityElementsHidden={capturing}
          disabled={capturing}
          onPress={() => void handleShare()}
          style={({ pressed }) => [
            styles.share,
            { backgroundColor: alpha(palette.card, "CC"), borderColor: alpha(palette.ink, "1F"), opacity: capturing ? 0 : pressed ? 0.6 : 1 }
          ]}
        >
          <Icon name="share" size={20} color={palette.ink} weight="fill" />
          <AppText color={palette.ink} style={styles.shareLabel}>
            Share
          </AppText>
        </Pressable>
        {/* A quiet way out for a recording that went wrong — there was none. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Discard this activity"
          accessibilityElementsHidden={capturing}
          disabled={capturing}
          onPress={onDiscard}
          hitSlop={8}
          // A soft pill like Share's, smaller: bare muted text vanished over the art.
          style={({ pressed }) => [styles.discard, { backgroundColor: alpha(palette.card, "B3"), opacity: capturing ? 0 : pressed ? 0.5 : 1 }]}
        >
          <AppText variant="caption" color={palette.subtle}>
            Discard
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1
  },
  content: {
    gap: spacing.md,
    // Clears the floating footer.
    paddingBottom: spacing.xxl * 2
  },
  // 38pt, `ScreenHeader`'s button size, so the centre pill lines up with them.
  headerCenter: {
    height: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  headerSlot: {
    width: 38,
    height: 38
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  markSlot: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center"
  },
  mark: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 3,
    marginTop: -spacing.sm
  },
  hero: {
    alignItems: "center",
    gap: 2
  },
  distance: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 68,
    lineHeight: 78
  },
  // Half the figure, as on the live screen.
  distanceUnit: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 34
  },
  grid: {
    alignSelf: "center",
    width: "80%",
    gap: spacing.md
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "flex-end"
  },
  // A halo, not a drop shadow: a photo has no light source to imply.
  onPhoto: {
    textShadowColor: "rgba(0, 0, 0, 0.25)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing.sm
  },
  share: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 44,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  shareLabel: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 15,
    lineHeight: 20
  },
  discard: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill
  }
});
