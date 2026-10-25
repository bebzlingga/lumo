import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useMoveAccent } from "@/components/move/ChallengeUI";
import { MoveProgressBar } from "@/components/move/MoveProgressBar";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import type { ChallengeProgress } from "@/lib/move/activeChallenge";
import { formatDistance } from "@/lib/move/movement";
import type { MovementSummary } from "@/lib/move/types";

/**
 * The two Move cards that survive the move to challenges.
 *
 * Everything else — the day card, the week, the badges, the goal card — either
 * became a cardless block in `ChallengeUI` or went with the goals system. A
 * card is kept only where something genuinely is one item among several, which
 * is true of a permission prompt and of Move's row on the Home screen.
 */
function Card({ children }: { children: React.ReactNode }) {
  const { palette, isDark } = useLumo();

  return (
    <View style={[styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
      {children}
    </View>
  );
}

/** Asked when someone enters Move, never at launch. */
export function MovePermissionCard({ onConnect, onDismiss, busy }: { onConnect: () => void; onDismiss?: () => void; busy?: boolean }) {
  const { palette } = useLumo();
  const accent = useMoveAccent();

  return (
    <Card>
      <View style={[styles.icon, { backgroundColor: accent.soft }]}>
        <Icon name="health" size={22} color={accent.glyph} weight="bulk" />
      </View>

      <AppText variant="bodySmall" color={palette.ink} style={styles.title}>
        Let Lumo count your movement
      </AppText>
      <AppText variant="caption" color={palette.subtle} style={styles.body}>
        Connect your health data so your walks and runs count toward your challenges automatically. Lumo reads steps, distance and
        active minutes — nothing else — and never writes anything back.
      </AppText>

      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Connect health data"
          onPress={onConnect}
          disabled={busy}
          style={({ pressed }) => [styles.primary, { backgroundColor: accent.primary, opacity: pressed || busy ? 0.85 : 1 }]}
        >
          <AppText color={palette.onGreen} style={styles.primaryLabel}>
            {busy ? "Connecting\u2026" : "Connect"}
          </AppText>
        </Pressable>

        {onDismiss ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Maybe later" onPress={onDismiss} style={({ pressed }) => [styles.ghost, { opacity: pressed ? 0.6 : 1 }]}>
            <AppText variant="bodySmall" color={palette.subtle}>
              Maybe later
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Move on Lumo's Home screen. Its own section, never a habit card.
 *
 * Leads with the active challenge when there is one, because that is what Move
 * currently means to this person. Otherwise it is an invitation.
 */
export function MoveHomeCard({
  today,
  weekMeters,
  progress,
  totalDistanceM
}: {
  today: MovementSummary | null;
  weekMeters: number;
  progress: ChallengeProgress | null;
  totalDistanceM: number;
}) {
  const router = useRouter();
  const { palette } = useLumo();
  const accent = useMoveAccent();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Lumo Move"
      onPress={() => router.push("/(tabs)/move")}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <Card>
        <View style={styles.head}>
          <AppText variant="caption" color={palette.subtle}>
            LUMO MOVE
          </AppText>
          <Icon name="arrowRight" size={16} color={accent.glyph} weight="bold" />
        </View>

        <View style={styles.row}>
          <Icon name="walk" size={22} color={accent.glyph} weight="bulk" />
          <AppText color={palette.ink} style={styles.value} numberOfLines={1}>
            {formatDistance(today?.distanceMeters ?? 0)} today
          </AppText>
        </View>

        {progress ? (
          <MoveProgressBar
            ratio={progress.ratio}
            accent={accent.fill}
            label={`${progress.variant.title}, ${formatDistance(progress.currentM)} of ${formatDistance(progress.targetM)}`}
          />
        ) : null}

        <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.body}>
          {progress
            ? `${progress.variant.title} \u00b7 ${formatDistance(progress.remainingM)} to go`
            : `${formatDistance(weekMeters)} this week \u00b7 ${formatDistance(totalDistanceM)} all time`}
        </AppText>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  icon: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: radius.xl
  },
  title: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  body: {
    fontFamily: fontFamilies.lexend
  },
  buttons: {
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  primary: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: radius.pill
  },
  primaryLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15
  },
  ghost: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  value: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 20
  }
});
