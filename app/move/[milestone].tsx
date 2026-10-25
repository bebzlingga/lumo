import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { ChallengeHeadline, ChallengeSummary, TeamContributions, useMoveAccent, useTeamMembers } from "@/components/move/ChallengeUI";
import { FamilyBadge } from "@/components/move/MoveBadge";
import { MoveFriendPicker } from "@/components/move/MoveFriendPicker";
import { MoveOptionGroup, MoveOptionRow } from "@/components/move/MoveOptionRow";
import { PlusBadge } from "@/components/PlusBadge";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Button, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { ME, useMove } from "@/context/MoveContext";
import { alpha, readableOn } from "@/lib/color";
import { friendsService, type Friendship } from "@/lib/friends";
import { challengeClient } from "@/lib/move/challengeClient";
import { pauseState, START_REFUSAL_COPY, type TeamGoal } from "@/lib/move/activeChallenge";
import { familyProgress, hasMilestone, hasVariant, isFamilyLocked, previousFamily } from "@/lib/move/achievements";
import { describeUnlockRule, findFamily } from "@/lib/move/challengeDefs";
import { MOVE_WITH_FRIENDS_ENABLED, moveSocialUnlocked } from "@/lib/move/gating";
import { formatDistance } from "@/lib/move/movement";

/**
 * One milestone, and the three routes to its badge.
 *
 * The badge is the anchor at the top because it is what all three routes add up
 * to — alone, against a clock, and with friends. A finished route keeps its
 * tick in the list, so this screen doubles as the record of how far along the
 * badge is; there is nowhere else that shows it route by route.
 */
export default function MilestoneScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ milestone: string }>();
  const { palette, isDark, isPlus, isUnlimited } = useLumo();
  const accent = useMoveAccent();
  const move = useMove();

  const family = findFamily(params.milestone);
  const [selected, setSelected] = React.useState<string | null>(family?.variants[0]?.id ?? null);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  /** Null while loading, so an empty list is not mistaken for "no friends". */
  const [friends, setFriends] = React.useState<Friendship[] | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  /** How a team splits the distance. Only asked on the team route. */
  const [teamGoal, setTeamGoal] = React.useState<TeamGoal>("each");
  /**
   * Friends already on a challenge.
   *
   * A map of id → reason, so ABSENT means available — an offline lookup returns
   * empty and fails open rather than blocking someone from inviting a free
   * friend. The reason is what the picker prints under the name: "on a challenge"
   * and "out on a move right now" are different facts.
   */
  const [busy, setBusy] = React.useState<Map<string, string>>(new Map());
  /** Whether the Pro offer is open over this screen — see the blocked panel. */
  const [paywallOpen, setPaywallOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  React.useEffect(() => {
    // Friends are switched off (MOVE_WITH_FRIENDS_ENABLED): no network round trip for a hidden picker.
    if (!MOVE_WITH_FRIENDS_ENABLED) {
      return;
    }

    let active = true;

    friendsService
      .listFriends()
      .then(async (list) => {
        // Accepted only — someone who has not accepted a friend request is not
        // somebody to hand a challenge to.
        const accepted = list.filter((entry) => entry.status === "accepted" && entry.profile.id);

        if (!active) {
          return;
        }

        setFriends(accepted);

        // `unavailableFriends`, not `busyFriends`: the same question with the
        // ad-hoc walkers included. The start screen asks the identical helper.
        const taken = await challengeClient.unavailableFriends(accepted.map((entry) => entry.profile.id as string));

        if (active) {
          setBusy(taken);
        }
      })
      .catch(() => {
        if (active) {
          setFriends([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  /**
   * The routes this build offers for the rung.
   *
   * Every variant, minus the team one while company is switched off — see
   * `MOVE_WITH_FRIENDS_ENABLED`. Filtered rather than badged: a route that
   * cannot be taken at any price should not be on the list at all.
   *
   * `routes` below is NOT filtered on purpose. It counts what has been earned
   * against what exists, and a tally that quietly dropped a route would tell
   * somebody who walked the team route last year that they had done fewer than
   * they had.
   */
  const routeVariants = React.useMemo(
    () => (family ? (MOVE_WITH_FRIENDS_ENABLED ? family.variants : family.variants.filter((variant) => variant.kind !== "team")) : []),
    [family]
  );
  /** The running challenge, but only if it belongs to THIS milestone. */
  const running = family && move.progress && move.progress.variant.milestoneId === family.id ? move.progress : null;
  /** Names and faces for a team challenge's roster. Empty for every other kind. */
  const teamMembers = useTeamMembers(running?.challenge.participants);

  /**
   * EVERY HOOK IS ABOVE THIS LINE, and that is what the two returns below are
   * about.
   *
   * They used to sit further up — the paywall before the `!family` guard, both
   * before `routeVariants` and `useTeamMembers` — which meant opening the offer
   * rendered two fewer hooks than the render before it, and React tore the
   * screen down with "rendered fewer hooks than expected". Tapping "See Lumo
   * Pro" on a Pro rung crashed on the spot.
   *
   * The guards are not conditional hooks and never were; the hooks were simply
   * downstream of a `return`. So the hooks moved up rather than the returns
   * moving down, and they now tolerate a missing `family` instead of assuming
   * one.
   */

  /**
   * The offer, taking the whole screen — the shape `SubscriptionGate` is built
   * for, and the same one `habit/new` and the journal editor use when they hit
   * their limits. Ahead of the `!family` guard so it does not depend on which
   * rung was asked for.
   */
  if (paywallOpen) {
    return <SubscriptionGate product="unlimited" />;
  }

  if (!family) {
    return (
      <Screen contentStyle={styles.content}>
        <ScreenHeader title="Challenge" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />
        <AppText variant="bodySmall" color={palette.subtle}>
          That challenge is no longer available.
        </AppText>
      </Screen>
    );
  }

  const earned = hasMilestone(move.achievements, family.id);
  const routes = familyProgress(move.achievements, family);
  const chosen = family.variants.find((entry) => entry.id === selected) ?? null;
  // Another rung's challenge is what blocks this one. This rung's own is not a
  // block — it is what the screen is about.
  const blocked = move.active !== null && !running;
  const pause = running ? pauseState(running.challenge) : { can: false, left: 0 };
  // Reachable from the badges screens even when the list has it shut, so the
  // rule is stated here too rather than only being enforced in the list.
  const locked = isFamilyLocked(move.achievements, family);
  /**
   * A PRO rung, and the reader has not bought Pro.
   *
   * 25K and above sit behind Pro — the ₱149 one-off — not behind Plus, the ₱49
   * monthly. The two products are not a ladder (see `components/PlusBadge.tsx`):
   * Plus buys the shared side of the app, Pro lifts the limits on what one
   * person can do, and the long rungs are the Move-shaped version of exactly
   * that. Read `isUnlimited`, which is Pro's persisted flag.
   *
   * `family.pro` and the `is_pro` column behind it were named for this gate when
   * it pointed at the other product; both are load-bearing (a shipped column and
   * a stored key) and keep their names.
   *
   * Checked here as well as on the list, because the badges screens push
   * straight to a milestone — a rule enforced only where you usually enter from
   * is not a rule.
   */
  const needsPro = family.pro && !isUnlimited;
  // The amber is a wash, so the label is darkened until it clears the card it
  // sits on rather than taking the raw token.
  const pauseInk = readableOn(palette.chartPartial, palette.card, 4.5);

  const team = chosen?.kind === "team" ? chosen : null;
  const pickedNames = picked.map((id) => {
    const friend = (friends ?? []).find((entry) => entry.profile.id === id);

    return friend?.profile.nickname || friend?.profile.lumoId || "A friend";
  });
  const short = team ? team.minFriends - picked.length : 0;
  // A team route cannot start a friend short: the roster IS the challenge, and
  // one that can never complete is worse than one that will not start.
  const ready = short <= 0;
  /**
   * What one person walks on a shared challenge, as it stands.
   *
   * Recomputed as friends are added, because the answer changes with the size
   * of the team — "roughly 25 km each" is the whole reason somebody picks this
   * mode, and it would be an odd thing to hide until the challenge started.
   */
  const shareCopy = (() => {
    const size = picked.length + 1;

    if (!chosen || size < 2) {
      return "Fill one target together, however you divide it.";
    }

    return `${formatDistance(chosen.targetM)} between ${size} of you — about ${formatDistance(chosen.targetM / size)} each.`;
  })();
  const pickedFriends = (friends ?? []).filter((entry) => picked.includes(entry.profile.id as string));

  function toggleFriend(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }

  function openPicker() {
    setPickerOpen(true);
  }

  function start() {
    if (!chosen) {
      return;
    }

    const participants =
      chosen.kind === "team"
        ? [
            { userId: ME, name: "You", contributionM: 0, leftAt: null },
            ...picked.map((id, index) => ({ userId: id, name: pickedNames[index] ?? "A friend", contributionM: 0, leftAt: null }))
          ]
        : [];

    const result = move.startChallenge(chosen.id, participants, teamGoal);

    if (!result.ok) {
      setRefusal(START_REFUSAL_COPY[result.reason]);

      return;
    }

    router.replace("/move");
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader
        title={`${family.title.split(" ")[0]} Challenge`}
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
      />

      <View style={styles.hero}>
        <FamilyBadge family={family} unlocked={earned} size={148} />
        <AppText variant="bodySmall" color={palette.subtle} style={styles.heroBlurb}>
          {earned ? `${family.subtitle}. Badge earned.` : `${family.subtitle}. ${describeUnlockRule(family)}`}
        </AppText>
      </View>

      {needsPro ? (
        <View style={[styles.blocked, { backgroundColor: alpha(palette.accent, "1F") }]}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.blockedTitle}>
            A Lumo Pro challenge
          </AppText>
          <AppText variant="caption" color={palette.body} style={styles.blockedBody}>
            {family.title} and everything above it come with Lumo Pro, ₱149 once. The first three rungs are free and stay free —
            including the badges you have already earned.
          </AppText>
          {/* The page's primary button, not an outlined one.
              An outline says "secondary, there is a main action elsewhere" —
              and on a Pro rung there is no elsewhere: this card IS the screen's
              answer, and the only thing to do on it. Same fill and same shape
              as Start Challenge, because it occupies the same place in the
              page's argument. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See Lumo Pro"
            /* Opens the paywall over this screen rather than pushing at a route:
               Pro has no page of its own — `SubscriptionGate` is rendered in
               place wherever a limit is hit, and this is one more such place. */
            onPress={() => setPaywallOpen(true)}
            style={({ pressed }) => [styles.blockedButton, { backgroundColor: accent.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <AppText color={palette.onGreen} style={styles.blockedButtonLabel}>
              See Lumo Pro
            </AppText>
          </Pressable>
        </View>
      ) : locked ? (
        <View style={[styles.blocked, { backgroundColor: accent.soft }]}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.blockedTitle}>
            Not yet
          </AppText>
          <AppText variant="caption" color={palette.body} style={styles.blockedBody}>
            Earn the {previousFamily(family)?.title} badge first. The ladder is walked in order.
          </AppText>
        </View>
      ) : running ? (
        // This rung is under way, so the screen shows the challenge rather than
        // a list of routes that cannot be started. Everything below — picking,
        // the summary, the start button — belongs to a decision already made.
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
              In progress
            </AppText>
            <AppText variant="caption" color={palette.subtle}>
              {routes.done} of {routes.total} routes done
            </AppText>
          </View>

          <ChallengeHeadline progress={running} />

          {/* Two ways out, weighted differently. A pause is the small one and
              reads as such; cancelling is red because it ends the challenge and
              cannot be undone — the movement is kept, the challenge is not. */}
          {running.variant.kind === "team" ? (
            <TeamContributions
              challenge={running.challenge}
              progress={running}
              members={teamMembers}
              meId={ME}
            />
          ) : null}

          <View style={styles.runningActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !pause.can }}
              accessibilityLabel={pause.can ? `Pause for a day, ${pause.left} left` : (pause.reason ?? "Cannot pause")}
              disabled={!pause.can}
              onPress={() =>
                Alert.alert("Pause for a day?", "The deadline moves out by one day. Your progress and everything you have walked stay put.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Pause a Day", onPress: () => move.pauseChallenge() }
                ])
              }
              style={({ pressed }) => [
                styles.pauseAction,
                { backgroundColor: alpha(palette.chartPartial, "26"), opacity: pressed ? 0.7 : pause.can ? 1 : 0.45 }
              ]}
            >
              <Icon name="pause" size={15} color={pauseInk} weight="bold" />
              <AppText variant="button" color={pauseInk} numberOfLines={1}>
                {pause.can ? `Pause (${pause.left})` : "No pauses"}
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel this challenge"
              onPress={() =>
                Alert.alert(
                  "Cancel this challenge?",
                  "Your recorded movement stays in your Move history, but this challenge ends and the routes it would have earned stay unearned.",
                  [
                    { text: "Keep Going", style: "cancel" },
                    { text: "Cancel Challenge", style: "destructive", onPress: () => move.leaveChallenge() }
                  ]
                )
              }
              style={({ pressed }) => [styles.dangerAction, { backgroundColor: palette.danger, opacity: pressed ? 0.85 : 1 }]}
            >
              <AppText variant="button" color={palette.white} numberOfLines={1}>
                Cancel
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : (
      <View style={[styles.section, styles.routes]}>
        <View style={styles.sectionHead}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
            Choose a route
          </AppText>
          <AppText variant="caption" color={palette.subtle}>
            {routes.done} of {routes.total} done
          </AppText>
        </View>

        <MoveOptionGroup>
          {routeVariants.map((variant, index) => {
            const done = hasVariant(move.achievements, variant.id);
            /**
             * A TEAM route needs Plus, even on a free rung.
             *
             * The rung's own gate is about the distance; this is about the
             * company. Inviting people is the shared half of Move and sits behind
             * the ₱49 monthly wherever it appears — the same call the start
             * screen makes about "bring friends", and the same call the database
             * makes when it refuses to write a roster (see the participation
             * policy in supabase/schema.sql).
             *
             * Still listed, still tappable, and the tap goes to the paywall: a
             * route nobody can see is a route nobody can decide about.
             *
             * Asked through `moveSocialUnlocked` rather than `isPlus`, so the
             * testing bypass covers this route and the start screen's company
             * option together — see `lib/move/gating.ts`. The RUNG gate above
             * (`needsPro`) is a different question and is not bypassed.
             */
            const teamNeedsPlus = variant.kind === "team" && !moveSocialUnlocked(isPlus);

            return (
              <MoveOptionRow
                key={variant.id}
                icon={variant.kind === "team" ? "friends" : variant.durationDays === null ? "walk" : "calendar"}
                title={variant.title}
                subtitle={teamNeedsPlus ? "Walking it together comes with Plus." : done ? "Done" : variant.description}
                selected={!teamNeedsPlus && selected === variant.id}
                onPress={() => (teamNeedsPlus ? router.push("/friends") : setSelected(variant.id))}
                trailing={
                  teamNeedsPlus ? (
                    <PlusBadge />
                  ) : done ? (
                    <Icon name="checkCircle" size={20} color={palette.greenDark} weight="bulk" />
                  ) : undefined
                }
                last={index === routeVariants.length - 1}
              />
            );
          })}
        </MoveOptionGroup>
      </View>
      )}

      {/* The rule, stated where it applies, with the way out beside it. */}
      {running || locked || needsPro ? null : blocked ? (
        <View style={[styles.blocked, { backgroundColor: accent.soft }]}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.blockedTitle}>
            Active challenge in progress
          </AppText>
          <AppText variant="caption" color={palette.body} style={styles.blockedBody}>
            You can only have one active Move challenge at a time.
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View active challenge"
            onPress={() => router.push("/move")}
            style={({ pressed }) => [styles.blockedButton, { borderColor: accent.glyph, opacity: pressed ? 0.7 : 1 }]}
          >
            <AppText variant="bodySmall" color={accent.glyph}>
              View Active Challenge
            </AppText>
          </Pressable>
        </View>
      ) : chosen ? (
        <>
          {/* Asked before the roster, because it changes what the roster is
              FOR: on a shared target two friends halve the walk, on the other
              they each take the whole of it. Only shown on the team route —
              there is nobody to split a solo one with. */}
          {team ? (
            <View style={styles.section}>
              <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
                How will you do it
              </AppText>

              <MoveOptionGroup>
                <MoveOptionRow
                  icon="user"
                  title="Everyone walks it"
                  subtitle={`You each cover ${formatDistance(chosen.targetM)}.`}
                  selected={teamGoal === "each"}
                  onPress={() => setTeamGoal("each")}
                />
                <MoveOptionRow
                  icon="friends"
                  title="Share the distance"
                  subtitle={shareCopy}
                  selected={teamGoal === "shared"}
                  onPress={() => setTeamGoal("shared")}
                  last
                />
              </MoveOptionGroup>
            </View>
          ) : null}

          {/* Picking who is coming happens HERE, not on a screen of its own —
              the roster is part of the choice, and a route that needs friends
              should not hide behind a Continue button to say so. */}
          {team ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
                  Who is coming
                </AppText>
                <AppText variant="caption" color={ready ? palette.subtle : accent.glyph}>
                  {ready ? `${picked.length} invited` : `${short} more to go`}
                </AppText>
              </View>

              {/* Said before anybody is picked, because it is about THEM: a
                  friend without Plus cannot join a Plus challenge, and the
                  refusal would otherwise arrive after the invite went out. */}
              {family.pro ? (
                <AppText variant="caption" color={palette.subtle} style={styles.proNote}>
                  Friends need Lumo Pro to join a {family.title} challenge.
                </AppText>
              ) : null}

              {picked.length === 0 ? (
                // Carded like the route list and the summary, so the section
                // holds its shape whether or not anybody is on it. No title:
                // the section heading above already says what this is, and
                // "Nobody yet" only said it again in bolder type.
                <View style={[styles.friendsCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
                  <Icon name="friends" size={30} color={palette.subtle} weight="bulk" />
                  <AppText variant="bodySmall" color={palette.subtle} style={styles.friendsEmptyBody}>
                    {teamGoal === "shared"
                      ? "This route is walked together — one distance, divided between you."
                      : "This route is walked together — everyone covers the full distance, side by side."}
                  </AppText>
                  <Button label="Add Friends" icon="userCircleAdd" variant="ghost" onPress={openPicker} />
                </View>
              ) : (
                <MoveOptionGroup style={styles.rosterGroup}>
                  {pickedFriends.map((friend, index) => {
                    const id = friend.profile.id as string;

                    return (
                      <MoveOptionRow
                        key={id}
                        title={friend.profile.nickname || friend.profile.lumoId}
                        subtitle={friend.profile.lumoId}
                        selected
                        onPress={() => toggleFriend(id)}
                        last={index === pickedFriends.length - 1}
                        leading={<Avatar config={friend.profile.avatar} size={44} />}
                      />
                    );
                  })}

                  {/* Inside the card, under a rule: it acts on the list above
                      it, and a button floating below the card read as if it
                      belonged to the section rather than to the roster. */}
                  <View style={[styles.rosterAction, { borderTopColor: palette.hairline }]}>
                    {/* Shorter than the app-wide control height: this one is a
                        row inside a card, not a control on a page. */}
                    <Button
                      label="Edit Invites"
                      icon="userCircleAdd"
                      iconSize={15}
                      variant="ghost"
                      onPress={openPicker}
                      style={styles.rosterButton}
                      labelStyle={styles.rosterButtonLabel}
                    />
                  </View>
                </MoveOptionGroup>
              )}
            </View>
          ) : null}

          {/* The summary sits under the list it describes, so changing route
              and reading what it means are the same glance. */}
          <View style={styles.section}>
            <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
              What you are taking on
            </AppText>
            <ChallengeSummary variant={chosen} family={family} withNames={pickedNames} teamGoal={teamGoal} />
          </View>

          {refusal ? (
            <AppText variant="caption" color={palette.danger} style={styles.refusal}>
              {refusal}
            </AppText>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            accessibilityLabel={ready ? `Start ${chosen.title}` : `Invite ${short} more`}
            onPress={() => (ready ? start() : undefined)}
            disabled={!ready}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: ready ? accent.primary : palette.surface, opacity: pressed && ready ? 0.85 : 1 }
            ]}
          >
            <AppText color={ready ? palette.onGreen : palette.muted} style={styles.ctaLabel}>
              {ready ? "Start Challenge" : `Invite ${short} more ${short === 1 ? "friend" : "friends"}`}
            </AppText>
          </Pressable>
        </>
      ) : null}

      {/* One picker, shared with the plain-move flow — see `MoveFriendPicker`. */}
      <MoveFriendPicker
        visible={pickerOpen}
        friends={friends}
        picked={picked}
        // One challenge at a time applies to them too, so an invite would be
        // refused on arrival. Saying so in the list beats letting it fail later
        // for a reason nobody could see.
        unavailable={busy}
        onClose={() => setPickerOpen(false)}
        onDone={(next) => {
          setPicked(next);
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl
  },
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    // Separates the badge and its line from the choosing below — the hero says
    // what this rung IS, and the rest of the screen is what to do about it.
    paddingBottom: spacing.md
  },
  heroBlurb: {
    fontFamily: fontFamilies.lexend,
    textAlign: "center",
    maxWidth: 300
  },
  // Heading to content. At spacing.xs the label sat on top of the card it
  // introduces, reading as part of it rather than above it.
  section: {
    gap: spacing.sm
  },
  // The route list ends the decision; the summary below it is the consequence.
  // Without this they read as one long stack of rows.
  // The screen's own stack gap (spacing.lg) already separates these two, and
  // the extra padding on top of it read as a break rather than a step.
  routes: {
    paddingBottom: 0
  },
  refusal: {
    fontFamily: fontFamilies.lexend,
    textAlign: "center"
  },
  proNote: {
    fontFamily: fontFamilies.lexend
  },
  // Side by side and equal width: two ways out of the same challenge, so
  // neither should read as the bigger door.
  runningActions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.lg
  },
  pauseAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 46,
    borderRadius: radius.pill
  },
  dangerAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: radius.pill
  },
  // The summary card's inset, so the two cards on this screen match — with
  // more air over the glyph, which has nothing above it to sit under.
  friendsCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  // Air top and bottom, so a roster of one or two does not sit tight against
  // the card's own edge the way a full-height list of routes does.
  rosterGroup: {
    paddingVertical: spacing.xs
  },
  rosterAction: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xs,
    marginTop: spacing.xs
  },
  rosterButton: {
    minHeight: 32
  },
  rosterButtonLabel: {
    fontSize: 13,
    lineHeight: 18
  },
  friendsEmptyBody: {
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  sectionTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  // Centred, and roomier than a plain notice: this card is the whole answer to
  // a tap that expected a challenge, so it stands on its own rather than
  // reading as a strip of text pinned to the top of the page.
  blocked: {
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.card
  },
  blockedTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    textAlign: "center"
  },
  blockedBody: {
    fontFamily: fontFamilies.lexend,
    textAlign: "center"
  },
  /**
   * Filled like a primary button, but sized like the card it lives in.
   *
   * Not the 56 of Start Challenge: that one spans the page and ends a long
   * scroll, while this sits inside a notice a third of the height. At the full
   * size it was the loudest thing on the screen, which is the wrong emphasis
   * for an offer — the badge above it is what the page is about.
   */
  blockedButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    // Set apart from the sentence it answers — the gap is what makes it the
    // card's action rather than its last line.
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill
  },
  blockedButtonLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 14
  },
  // Set apart from the summary above it: this is the commit, not the last row
  // of what it describes.
  cta: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    marginTop: spacing.sm,
    borderRadius: radius.pill
  },
  ctaLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 16
  }
});
