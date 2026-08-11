import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { MoveJourney } from "@/components/move/MoveJourney";
import { useMoveAccent } from "@/components/move/ChallengeUI";
import { MoveProgressRow } from "@/components/move/MoveProgressBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { JOURNEY_STAGES } from "@/lib/move/journey";
import { formatDistance } from "@/lib/move/movement";

/**
 * Your journey — the cumulative total as somewhere you have walked to.
 *
 * The calmest screen in Move on purpose. No goals, no challenges, no badges:
 * just where you have got to and what is over the next hill.
 */
export default function MoveJourneyScreen() {
  const router = useRouter();
  const { palette, isDark } = useLumo();
  const accent = useMoveAccent();
  const move = useMove();

  const { journey } = move;

  return (
    <Screen contentStyle={styles.content} backgroundVariant="insights">
      <ScreenHeader title="Your journey" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      <View style={styles.head}>
        <AppText color={accent.glyph} style={styles.total} numberOfLines={1}>
          {formatDistance(move.totalDistanceM)}
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle}>
          moved with Lumo
        </AppText>
      </View>

      <View style={[styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
        <MoveJourney position={journey} totalDistanceM={move.totalDistanceM} />
      </View>

      <View style={[styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
        <AppText variant="caption" color={palette.subtle}>
          YOU ARE HERE
        </AppText>
        <AppText color={palette.ink} style={styles.stageName}>
          {journey.stage.name}
        </AppText>
        <AppText variant="bodySmall" color={palette.body}>
          {journey.stage.blurb}
        </AppText>

        {journey.next ? (
          <MoveProgressRow
            label={`Next: ${journey.next.name}`}
            value={`${formatDistance(journey.remainingMeters)} to go`}
            ratio={journey.stageRatio}
            accent={accent.fill}
          />
        ) : (
          <AppText variant="caption" color={palette.subtle}>
            You have walked the whole trail. Wherever you like, from here.
          </AppText>
        )}
      </View>

      <View style={styles.stages}>
        {JOURNEY_STAGES.map((stage, index) => (
          <View key={stage.id} style={styles.stageRow}>
            <AppText style={styles.stageGlyph}>{stage.glyph}</AppText>
            <View style={styles.stageText}>
              <AppText
                variant="bodySmall"
                color={index <= journey.index ? palette.ink : palette.muted}
                numberOfLines={1}
              >
                {stage.name}
              </AppText>
              <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                {index === 0 ? "From the start" : `From ${formatDistance(stage.fromMeters)}`}
              </AppText>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl
  },
  head: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingVertical: spacing.sm
  },
  total: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 34,
    lineHeight: 42
  },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  stageName: {
    fontFamily: fontFamilies.serif,
    fontSize: 22,
    lineHeight: 28
  },
  stages: {
    gap: spacing.sm
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  stageGlyph: {
    fontSize: 22,
    lineHeight: 28,
    width: 30,
    textAlign: "center"
  },
  stageText: {
    flex: 1,
    gap: 2
  }
});
