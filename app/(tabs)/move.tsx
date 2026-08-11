import { useRouter } from "expo-router";
import React from "react";
import { Animated, RefreshControl, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { ChallengeFacts, ChallengeHeadline, TeamContributions, useMoveAccent, useTeamMembers } from "@/components/move/ChallengeUI";
import { MoveBadge } from "@/components/move/MoveBadge";
import { MoveScopeTabs, type MoveScope } from "@/components/move/MoveScopeTabs";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState } from "@/components/states";
import { AppText, Screen } from "@/components/ui";
import { WalkBackground, useWalkSceneInset } from "@/components/WalkBackground";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { ME, useMove } from "@/context/MoveContext";
import { addDays, formatShortDate } from "@/lib/date";
import { hasMilestone } from "@/lib/move/achievements";
import { trackMove } from "@/lib/move/analytics";
import { MOVE_FAMILIES } from "@/lib/move/challengeDefs";
import { formatKilometres, formatMinutes, formatSteps } from "@/lib/move/movement";
import { MovePermissionCard } from "@/components/move/MoveCards";

/** How much higher the empty state starts than an active challenge does. */
const EMPTY_SCENE_LIFT = 28;

/**
 * How much closer to Lumo an active challenge's figure sits.
 *
 * The headline is a single number with nothing above it, so the full scene
 * inset left it floating in the middle of the screen with air on both sides.
 */
const ACTIVE_SCENE_LIFT = 20;

/**
 * What a walk gives back, in five.
 *
 * The full list runs to a dozen; a dozen chips is a leaflet, and nobody reads a
 * leaflet on the way out of the door. These five are the ones somebody might
 * actually FEEL this week, which is what makes them an argument rather than a
 * health claim — and why blood sugar and weight management, the two most
 * clinical-sounding of the set, are not here.
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
 * With a challenge running, this IS the challenge — one number, what is left,
 * and today's passive figures underneath. With none, it is an invitation to go
 * for a walk. Movement data is never the headline on its own: steps and minutes
 * are facts, and a challenge is what gives them a point.
 *
 * Nothing here reads or writes a habit.
 */
export default function MoveScreen() {
  const router = useRouter();
  const { palette } = useLumo();
  const accent = useMoveAccent();
  const move = useMove();

  const [connecting, setConnecting] = React.useState(false);
  const [dismissedConnect, setDismissedConnect] = React.useState(false);
  const [scope, setScope] = React.useState<MoveScope>("today");

  // No intro screen: Move opens on Move. The one thing onboarding did that
  // mattered — offering to connect health data — is `MovePermissionCard` below,
  // which asks in place and can be dismissed.
  React.useEffect(() => {
    trackMove("move_opened");
  }, []);

  const sceneInset = useWalkSceneInset("walking");
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => scrollY.setValue(event.nativeEvent.contentOffset.y),
    [scrollY]
  );

  const today = move.today;
  /** Names and faces for a team challenge's roster. Empty for every other kind. */
  const teamMembers = useTeamMembers(move.progress?.challenge.participants);
  const needsConnect = move.canRead && move.permission !== "granted";
  const earnedCount = MOVE_FAMILIES.filter((entry) => hasMilestone(move.achievements, entry.id)).length;
  /**
   * The badge in the page bar: the highest one earned, or the first rung when
   * none are. A locked badge is still the thing being worked toward, so the
   * corner is never empty.
   */
  const headerFamily = React.useMemo(() => {
    const earned = [...MOVE_FAMILIES].reverse().find((entry) => hasMilestone(move.achievements, entry.id));

    return earned ?? MOVE_FAMILIES[0];
  }, [move.achievements]);

  /**
   * Today and the six days before it, newest first.
   *
   * Built from the dates rather than from the summaries, so a day with no
   * movement still gets a row. Filtering to days that HAVE data would quietly
   * hide exactly the days worth noticing.
   */
  const lastSevenDays = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(move.todayKey, -index);
      const summary = move.state.summaries.find((entry) => entry.date === date);

      return {
        date,
        distanceMeters: summary?.distanceMeters ?? 0,
        activeMinutes: summary?.activeMinutes ?? 0
      };
    });
  }, [move.todayKey, move.state.summaries]);

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
      contentStyle={styles.content}
      backgroundVariant={null}
      backgroundNode={<WalkBackground plate="walking" scrollY={scrollY} />}
      onScroll={handleScroll}
      refreshControl={<RefreshControl refreshing={move.syncing} tintColor={accent.glyph} onRefresh={() => void move.refresh()} />}
    >
      <ScreenHeader
        centerContent={<MoveScopeTabs value={scope} onChange={setScope} hitSlop={8} />}
        leftAction={{
          icon: "trophy",
          label: `${headerFamily.title}, your badges`,
          onPress: () => router.push("/move/badges"),
          render: (
            <MoveBadge
              progress={{
                milestone: {
                  id: headerFamily.id,
                  title: headerFamily.title,
                  description: "",
                  target: headerFamily.distanceM,
                  metric: "distance",
                  tier: "bronze"
                },
                progress: 0,
                target: headerFamily.distanceM,
                ratio: 0,
                unlocked: hasMilestone(move.achievements, headerFamily.id),
                unlockedAt: null
              }}
              size={34}
            />
          )
        }}
        rightAction={{
          icon: "target",
          label: move.progress ? "Challenges, one in progress" : "Challenges",
          onPress: () => router.push("/move/challenges"),
          // A dot, not a count: there is only ever one challenge running, so a
          // "1" would be answering a question nobody asked.
          dot: move.progress !== null,
          dotColor: palette.danger
        }}
      />

      {/* The scene inset drops content below Lumo. With no challenge there is
          more to fit, so the empty state starts higher and tucks a little
          closer to him. */}
      <View style={{ height: Math.max(0, sceneInset - (move.progress ? ACTIVE_SCENE_LIFT : EMPTY_SCENE_LIFT)) }} />

      {needsConnect && !dismissedConnect ? (
        <MovePermissionCard onConnect={() => void handleConnect()} onDismiss={() => setDismissedConnect(true)} busy={connecting} />
      ) : null}

      {!move.canRead ? (
        <EmptyState
          icon="info"
          title="Movement tracking needs a new build"
          body="Lumo Move reads steps and distance from your device's health data. That needs a build with the health module included — everything else in Lumo works as normal."
        />
      ) : null}

      {scope === "today" ? (
        <>
          {move.progress ? (
            <>
              <ChallengeHeadline progress={move.progress} />

              <ChallengeFacts
                facts={[
                  { icon: "footprints", label: `${formatSteps(today?.steps ?? 0)} steps` },
                  { icon: "clock", label: formatMinutes(today?.activeMinutes ?? 0) },
                  { icon: "walk", label: `${formatKilometres(today?.distanceMeters ?? 0)} today` }
                ]}
              />

              {move.progress.variant.kind === "team" ? (
                <TeamContributions
                  challenge={move.progress.challenge}
                  progress={move.progress}
                  members={teamMembers}
                  meId={ME}
                />
              ) : null}

              {/* Walking with the phone in hand, for anyone who wants to watch
                  it happen. Health counts every walk either way — this records
                  the ROUTE and shows the challenge moving, it is not how the
                  challenge is fed. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Track a walk live"
                onPress={() => router.push("/move/track")}
                style={({ pressed }) => [styles.trackWalk, { backgroundColor: accent.primary, opacity: pressed ? 0.85 : 1 }]}
              >
                <Icon name="walk" size={16} color={palette.white} weight="bulk" />
                <AppText variant="button" color={palette.white}>
                  Track a Walk
                </AppText>
              </Pressable>
            </>
          ) : (
            /* No giant zero-of-something. With nothing running, the screen makes
               the case for walking rather than reporting a number nobody set —
               framed as everyday progress, not exercise. */
            <View style={styles.invite}>
              <AppText color={palette.ink} style={styles.inviteTitle}>
                Walk a little. Feel a little better.
              </AppText>
              <AppText variant="bodySmall" color={palette.subtle} style={styles.inviteBlurb}>
                Every step supports your energy, mood, heart and sleep — and small walks turn into a routine that lasts.
              </AppText>

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

              {/* One door. Challenges are a tap away in the page bar, and
                  offering them here as an equal made "go for a walk" — the thing
                  this screen is asking for — one of two decisions rather than
                  the answer. */}
              <View style={styles.inviteActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Track a walk live"
                  onPress={() => router.push("/move/track")}
                  style={({ pressed }) => [styles.inviteAction, { backgroundColor: accent.primary, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Icon name="walk" size={16} color={palette.white} weight="bulk" />
                  <AppText variant="button" color={palette.white} numberOfLines={1}>
                    Walk Now
                  </AppText>
                </Pressable>
              </View>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.totalHead}>
            <AppText variant="bodySmall" color={palette.body}>
              All time
            </AppText>
            {/* Kilometres always, with the unit at half the number's size —
                the same readout the tracking screens use. */}
            <AppText color={palette.ink} style={styles.total} numberOfLines={1}>
              {(Math.max(0, move.totalDistanceM) / 1000).toFixed(1)}
              <AppText color={palette.ink} style={styles.totalUnit}>
                {" km"}
              </AppText>
            </AppText>
          </View>

          {/* The last seven days, ending today — not the calendar week, which
              says almost nothing on a Monday morning.

              A list rather than the dot strip: dots compare days to each other,
              which is a shape, and what somebody actually wants back from a
              week is the figures. Every day appears, including empty ones — a
              gap you can see is the point of keeping a record. */}
          <View style={styles.section}>
            <AppText variant="bodySmall" color={palette.ink} style={[styles.sectionTitle, styles.centred]}>
              Last 7 days
            </AppText>

            <View style={styles.days}>
              {lastSevenDays.map((day, index) => (
                <View
                  key={day.date}
                  style={[styles.dayRow, index === 0 ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }]}
                >
                  <AppText variant="bodySmall" color={day.date === move.todayKey ? palette.ink : palette.body} style={styles.dayDate}>
                    {day.date === move.todayKey ? "Today" : formatShortDate(day.date)}
                  </AppText>
                  <AppText variant="caption" color={palette.muted} style={styles.dayTime}>
                    {day.activeMinutes > 0 ? formatMinutes(day.activeMinutes) : "—"}
                  </AppText>
                  <AppText
                    variant="bodySmall"
                    color={day.distanceMeters > 0 ? palette.ink : palette.muted}
                    style={styles.dayDistance}
                  >
                    {day.distanceMeters > 0 ? `${(day.distanceMeters / 1000).toFixed(1)} km` : "—"}
                  </AppText>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <AppText variant="bodySmall" color={palette.ink} style={[styles.sectionTitle, styles.centred]}>
              Milestones
            </AppText>

            {/* The Badges screen's own pill, verbatim — so one collection's
                count is not a chip on one screen and a sentence on another. */}
            <View style={[styles.totalBadges, { backgroundColor: palette.greenSoft }]}>
              <Icon name="trophy" size={14} color={palette.greenDark} weight="bulk" />
              <AppText variant="caption" color={palette.greenDark} style={styles.totalBlurb}>
                {earnedCount} of {MOVE_FAMILIES.length} unlocked
              </AppText>
            </View>
            {/* The shelf, and only the shelf. Nothing here is tappable: the
                Challenges screen is where a rung is chosen, and two ways in made
                this one look like a duplicate of it. */}
            <View style={styles.badgeGrid}>
              {MOVE_FAMILIES.map((family) => {
                const earned = hasMilestone(move.achievements, family.id);

                return (
                  <View key={family.id} style={styles.badgeCell}>
                    <MoveBadge
                      progress={{
                        milestone: {
                          id: family.id,
                          title: family.title,
                          description: "",
                          target: family.distanceM,
                          metric: "distance",
                          tier: "bronze"
                        },
                        progress: earned ? family.distanceM : 0,
                        target: family.distanceM,
                        ratio: earned ? 1 : 0,
                        unlocked: earned,
                        unlockedAt: null
                      }}
                      size={68}
                    />
                  </View>
                );
              })}
            </View>

          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: layout.tabScreenBottomPadding
  },
  section: {
    gap: spacing.xs
  },
  sectionTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  // Outlined rather than filled: recording a walk is an option during a
  // challenge, not the thing the screen is asking for.
  trackWalk: {
    flexDirection: "row",
    alignItems: "center",
    // Sized to its label rather than to the column: the same filled green as
    // "Walk Now" on the empty state, and a full-width version of it read as the
    // screen's one instruction when it is only an offer.
    alignSelf: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 46,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
    borderRadius: radius.pill
  },
  // Centred, because with no challenge running this IS the screen — a
  // left-aligned invitation reads as one item on a page that has none.
  invite: {
    alignItems: "center",
    gap: spacing.xs
  },
  inviteTitle: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 34,
    lineHeight: 42,
    textAlign: "center"
  },
  inviteBlurb: {
    fontFamily: fontFamilies.lexend,
    textAlign: "center",
    maxWidth: 300
  },
  // Centred and sized to its label, not stretched: it is the one thing to do
  // on this screen, and a full-width bar reads as a form's submit.
  /**
   * Three to a row, and five of them — so the last row holds two, centred.
   *
   * `center` with an explicit column gap rather than `space-between`: with a
   * short final row, `space-between` would push those two to opposite edges of
   * the screen with a hole between them.
   */
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
  inviteActions: {
    flexDirection: "row",
    alignSelf: "center",
    gap: spacing.sm,
    marginTop: spacing.lg
  },
  inviteAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill
  },
  totalHead: {
    alignItems: "center",
    gap: spacing.xxs
  },
  total: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 58,
    lineHeight: 68,
    textAlign: "center"
  },
  totalUnit: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 29
  },
  totalBlurb: {
    fontFamily: fontFamilies.lexendBold,
    letterSpacing: 0.4
  },
  totalBadges: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xxs
  },
  centred: {
    textAlign: "center"
  },
  days: {
    paddingTop: spacing.xxs
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 40
  },
  dayDate: {
    flex: 1
  },
  dayTime: {
    width: 72,
    textAlign: "right"
  },
  dayDistance: {
    width: 76,
    fontFamily: fontFamilies.lexendSemiBold,
    textAlign: "right"
  },
  // Four to a row, centred, so a short last row sits in the middle rather than
  // stranded against one edge.
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: spacing.sm,
    rowGap: spacing.sm,
    paddingTop: spacing.xs
  },
  badgeCell: {
    alignItems: "center"
  }
});
