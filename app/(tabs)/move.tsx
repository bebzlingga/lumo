import { useRouter, type Href } from "expo-router";
import React from "react";
import { Animated, RefreshControl, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { ChallengeFacts, ChallengeHeadline, TeamContributions, useMoveAccent, useTeamMembers } from "@/components/move/ChallengeUI";
import { MovePermissionCard } from "@/components/move/MoveCards";
import { FamilyBadge } from "@/components/move/MoveBadge";
import { MoveGoalBar } from "@/components/move/MoveGoalBar";
import { InvitationDeck, InvitationStack, NotificationsOffPrompt } from "@/components/move/MoveInvitations";
import { MoveNowButton } from "@/components/move/MoveNowButton";
import { MoveOverall } from "@/components/move/MoveOverall";
import { MoveScopeTabs, type MoveScope } from "@/components/move/MoveScopeTabs";
import { MovingCard } from "@/components/move/MovingCard";
import { useMoveInvitations } from "@/components/move/useMoveInvitations";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState } from "@/components/states";
import { AppText, Screen } from "@/components/ui";
import { WalkBackground, useWalkSceneInset } from "@/components/WalkBackground";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { ME, useMove } from "@/context/MoveContext";
import { hasMilestone } from "@/lib/move/achievements";
import { trackMove } from "@/lib/move/analytics";
import { MOVE_FAMILIES } from "@/lib/move/challengeDefs";
import { formatKilometres, formatMinutes, formatSteps } from "@/lib/move/movement";
import { formatDistanceValue, formatDuration } from "@/lib/move/tracking/pace";
import { useActivityTracker } from "@/lib/move/tracking/useActivityTracker";

/**
 * How far each state's opening content sits above the full scene inset. The
 * empty state has the most to fit; a challenge headline and the Overall figure
 * are single numbers that would otherwise float mid-screen.
 */
const SCENE_LIFT = { empty: 28, challenge: 20, overall: 20 } as const;

/**
 * What a walk gives back, in five — the ones somebody might actually FEEL this
 * week, which is what makes them an argument rather than a health claim.
 */
const BENEFITS: { icon: IconName; label: string }[] = [
  { icon: "zap", label: "More energy" },
  { icon: "smiley", label: "Better mood" },
  { icon: "heart", label: "Healthier heart" },
  { icon: "moon", label: "Deeper sleep" },
  { icon: "brain", label: "Clearer head" }
];

/**
 * Lumo Move.
 *
 * Today: with a challenge running this IS the challenge; with a walk recording it
 * reports the walk; otherwise it is an invitation to go. Overall: the record (see
 * `MoveOverall`). Friends and invitations live in `useMoveInvitations` and render
 * nothing while that feature is off.
 */
export default function MoveScreen() {
  const router = useRouter();
  const { palette } = useLumo();
  const accent = useMoveAccent();
  const move = useMove();
  const inv = useMoveInvitations();
  const teamMembers = useTeamMembers(move.progress?.challenge.participants);
  const { state: activity } = useActivityTracker();
  const moving = Boolean(activity) && activity?.status !== "finished";

  const [scope, setScope] = React.useState<MoveScope>("today");
  const [connecting, setConnecting] = React.useState(false);
  const [dismissedConnect, setDismissedConnect] = React.useState(false);

  React.useEffect(() => {
    trackMove("move_opened");
  }, []);

  const sceneInset = useWalkSceneInset("walking");
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => scrollY.setValue(event.nativeEvent.contentOffset.y),
    [scrollY]
  );

  const needsConnect = move.canRead && move.permission !== "granted";
  // The deck lives in the idle Today block; anywhere else invitations stack at the top.
  const deckShown = scope === "today" && !move.progress && !moving && inv.invitationCount > 0;
  const lift = scope === "overall" ? SCENE_LIFT.overall : move.progress ? SCENE_LIFT.challenge : SCENE_LIFT.empty;

  /** The highest badge earned, or the first rung — the corner is never empty. */
  const headerFamily = React.useMemo(
    () => [...MOVE_FAMILIES].reverse().find((entry) => hasMilestone(move.achievements, entry.id)) ?? MOVE_FAMILIES[0],
    [move.achievements]
  );

  /** Back to the recording; straight into a ticked friend's walk; or the start page. */
  const moveNowTarget: Href = moving
    ? "/move/track"
    : inv.joinedSession
      ? { pathname: "/move/track", params: inv.joinedSession.withName ? { with: inv.joinedSession.withName } : {} }
      : "/move/start";

  async function handleConnect() {
    setConnecting(true);

    try {
      await move.connect();
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Screen
      pinHeader
      contentStyle={styles.content}
      backgroundVariant={null}
      backgroundNode={<WalkBackground plate="walking" scrollY={scrollY} />}
      onScroll={handleScroll}
      refreshControl={<RefreshControl refreshing={move.syncing} tintColor={accent.glyph} onRefresh={() => void move.refresh()} />}
    >
      <ScreenHeader
        buttonSurface="pill"
        centerContent={<MoveScopeTabs value={scope} onChange={setScope} hitSlop={8} />}
        leftAction={{
          icon: "trophy",
          label: `${headerFamily.title}, your badges`,
          onPress: () => router.push("/move/badges"),
          render: <FamilyBadge family={headerFamily} unlocked={hasMilestone(move.achievements, headerFamily.id)} size={34} />
        }}
        rightAction={{
          icon: "target",
          label: move.progress ? "Challenges, one in progress" : "Challenges",
          onPress: () => router.push("/move/challenges"),
          dot: move.progress !== null,
          dotColor: palette.danger
        }}
      />

      <View style={{ height: Math.max(0, sceneInset - lift) }} />

      {needsConnect && !dismissedConnect ? (
        <MovePermissionCard onConnect={() => void handleConnect()} onDismiss={() => setDismissedConnect(true)} busy={connecting} />
      ) : null}

      {inv.showNotifyPrompt ? <NotificationsOffPrompt onPress={() => void inv.enableNotifications()} /> : null}
      {deckShown ? null : <InvitationStack inv={inv} />}

      {!move.canRead ? (
        <EmptyState
          icon="info"
          title="Movement tracking needs a new build"
          body="Lumo Move reads steps and distance from your device's health data. That needs a build with the health module included — everything else in Lumo works as normal."
        />
      ) : null}

      {scope === "overall" ? (
        <MoveOverall />
      ) : move.progress ? (
        <>
          <ChallengeHeadline progress={move.progress} />
          <ChallengeFacts
            facts={[
              { icon: "footprints", label: `${formatSteps(move.today?.steps ?? 0)} steps` },
              { icon: "clock", label: formatMinutes(move.today?.activeMinutes ?? 0) },
              { icon: "walk", label: `${formatKilometres(move.today?.distanceMeters ?? 0)} today` }
            ]}
          />
          {/* A goal can run beside a challenge; here it steps down to a row. */}
          {move.goalProgress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open your goal"
              onPress={() => router.push("/move/goal")}
              style={({ pressed }) => [styles.inset, { opacity: pressed ? 0.6 : 1 }]}
            >
              <MoveGoalBar progress={move.goalProgress} todayKey={move.todayKey} compact />
            </Pressable>
          ) : null}
          {move.progress.variant.kind === "team" ? (
            <TeamContributions challenge={move.progress.challenge} progress={move.progress} members={teamMembers} meId={ME} />
          ) : null}
          <MoveNowButton
            label={moving ? `${formatDistanceValue(activity?.distanceMeters ?? 0)} km · ${formatDuration(activity?.movingDuration ?? 0)}` : "Move Now"}
            accessibilityLabel={moving ? "Back to your walk" : "Start moving"}
            onPress={() => router.push(moveNowTarget)}
            style={styles.challengeAction}
          />
        </>
      ) : moving && activity ? (
        <MovingCard activity={activity} avatarByName={inv.avatarByName} onPress={() => router.push("/move/track")} />
      ) : (
        <View style={styles.idle}>
          {/* A goal replaces the pitch: someone who set one is already persuaded. */}
          {move.goalProgress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open your goal"
              onPress={() => router.push("/move/goal")}
              style={({ pressed }) => [styles.inset, styles.idleGoal, { opacity: pressed ? 0.85 : 1 }]}
            >
              <MoveGoalBar progress={move.goalProgress} todayKey={move.todayKey} />
            </Pressable>
          ) : (
            <>
              <AppText color={palette.ink} style={styles.idleTitle}>
                Walk a little. Feel a little better.
              </AppText>
              <AppText variant="bodySmall" color={palette.subtle} style={styles.idleBlurb}>
                Every step supports your energy, mood, heart and sleep — and small walks turn into a routine that lasts.
              </AppText>
            </>
          )}

          {/* An invitation is a better reason than any benefit, so it takes their slot. */}
          {deckShown ? (
            <InvitationDeck inv={inv} />
          ) : move.goalProgress ? null : (
            <View style={styles.benefits}>
              {BENEFITS.map((benefit) => (
                <View key={benefit.label} style={[styles.benefit, { backgroundColor: accent.soft }]}>
                  <Icon name={benefit.icon} size={14} color={accent.glyph} weight="bulk" />
                  <AppText variant="caption" color={palette.body} numberOfLines={2} style={styles.benefitLabel}>
                    {benefit.label}
                  </AppText>
                </View>
              ))}
            </View>
          )}

          <MoveNowButton
            label="Move Now"
            accessibilityLabel={inv.joinedSession ? `Start moving with ${inv.joinedSession.withName ?? "your friend"}` : "Start moving"}
            onPress={() => router.push(moveNowTarget)}
            style={styles.idleAction}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: layout.tabScreenBottomPadding
  },
  // The width the Overall charts use, so goal bars line up with them.
  inset: {
    width: "88%",
    alignSelf: "center"
  },
  challengeAction: {
    marginTop: spacing.md
  },
  idle: {
    alignItems: "center",
    gap: spacing.xs,
    // Clear of Lumo above: a 34pt serif straight off his feet reads as a caption.
    paddingTop: spacing.lg
  },
  idleGoal: {
    paddingBottom: spacing.xs
  },
  idleTitle: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 34,
    lineHeight: 42,
    textAlign: "center"
  },
  idleBlurb: {
    fontFamily: fontFamilies.lexend,
    textAlign: "center",
    maxWidth: 300
  },
  // Three to a row, centred, so the short last row sits in the middle.
  benefits: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignSelf: "stretch",
    columnGap: spacing.xs,
    rowGap: spacing.xs,
    paddingTop: spacing.xs
  },
  benefit: {
    width: "31%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    minHeight: 34,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill
  },
  benefitLabel: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexend,
    fontSize: 11,
    lineHeight: 14
  },
  idleAction: {
    marginTop: spacing.lg
  }
});
