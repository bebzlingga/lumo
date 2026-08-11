import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { JOURNEY_STAGES, type JourneyPosition } from "@/lib/move/journey";
import { formatDistance } from "@/lib/move/movement";

/**
 * The journey — a horizontal trail with Lumo standing where you have got to.
 *
 * Calm and illustrative, not a game map (§26). One row, one line, seven stops.
 * There is no route to choose and nothing to unlock out of order: the landscape
 * simply changes as the total grows.
 *
 * ## Placeholder art
 *
 * The stage glyphs and Lumo's marker are EMOJI, deliberately and visibly. The
 * spec says not to invent artwork, so this is the asset slot: swapping in
 * Lumo-style environment illustrations means replacing `glyph` in
 * `JOURNEY_STAGES` with an image source and this one `<AppText>` with an
 * `<Image>`. Everything else — the spacing, the trail, the position — already
 * works. See `assets/move/README.md`.
 */
export function MoveJourney({ position, totalDistanceM }: { position: JourneyPosition; totalDistanceM: number }) {
  const { palette } = useLumo();
  const scrollRef = React.useRef<ScrollView>(null);

  /**
   * Scrolls so the current stage is in view.
   *
   * Seven stages do not fit on a phone, and a journey that opens on the park
   * when someone is in the mountains shows them the part they finished months
   * ago. Unanimated on mount so it is simply where it should be.
   */
  React.useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: Math.max(0, (position.index - 1) * STOP_WIDTH), animated: false });
    }, 0);

    return () => clearTimeout(timer);
  }, [position.index]);

  return (
    <View style={styles.wrap}>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trail}>
        {JOURNEY_STAGES.map((stage, index) => {
          const reached = index <= position.index;
          const here = index === position.index;

          return (
            <View key={stage.id} style={styles.stop}>
              {/* The connecting line, drawn behind each stop rather than as one
                  long rule, so a stage can be greyed independently. */}
              {index > 0 ? (
                <View style={[styles.link, { backgroundColor: reached ? alpha(palette.greenDark, "80") : palette.hairline }]} />
              ) : null}

              <View
                accessible
                accessibilityLabel={
                  here
                    ? `${stage.name}, you are here`
                    : reached ? `${stage.name}, behind you` : `${stage.name}, ${formatDistance(Math.max(0, stage.fromMeters - totalDistanceM))} away`
                }
                style={[
                  styles.marker,
                  {
                    backgroundColor: reached ? palette.card : alpha(palette.hairline, "60"),
                    borderColor: here ? palette.greenDark : "transparent",
                    opacity: reached ? 1 : 0.55
                  }
                ]}
              >
                <AppText style={styles.glyph}>{stage.glyph}</AppText>
              </View>

              {/* Lumo, standing at the current stop. A placeholder for the
                  walking mascot — see the note at the top of this file. */}
              <View style={styles.lumoSlot}>{here ? <AppText style={styles.lumo}>🚶</AppText> : null}</View>

              <AppText variant="caption" color={here ? palette.ink : reached ? palette.body : palette.muted} numberOfLines={1} style={here ? styles.stopNameHere : undefined}>
                {stage.name}
              </AppText>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Width of one stop. Shared by the style and the scroll-into-view maths. */
const STOP_WIDTH = 92;

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: -spacing.md
  },
  trail: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.md
  },
  stop: {
    width: STOP_WIDTH,
    alignItems: "center",
    gap: spacing.xxs
  },
  // Sits at the vertical middle of the marker row, reaching back to the
  // previous stop.
  link: {
    position: "absolute",
    top: 25,
    right: "50%",
    width: STOP_WIDTH,
    height: 2
  },
  marker: {
    alignItems: "center",
    justifyContent: "center",
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 2
  },
  glyph: {
    fontSize: 24,
    lineHeight: 30
  },
  // Reserved whether or not Lumo is here, so the labels stay on one line.
  lumoSlot: {
    height: 22,
    justifyContent: "center"
  },
  lumo: {
    fontSize: 18,
    lineHeight: 22
  },
  stopNameHere: {
    fontFamily: fontFamilies.lexendSemiBold
  }
});
