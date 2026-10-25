import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { MoveSummaryCard, useMoveAccent } from "@/components/move/ChallengeUI";
import { MoveFriendPicker } from "@/components/move/MoveFriendPicker";
import { MoveOptionGroup, MoveOptionRow } from "@/components/move/MoveOptionRow";
import { PlusBadge } from "@/components/PlusBadge";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Button, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { friendsService, type Friendship } from "@/lib/friends";
import { challengeClient } from "@/lib/move/challengeClient";
import { findFamily } from "@/lib/move/challengeDefs";
import { describeGoal, periodLabel } from "@/lib/move/goal";
import { formatDistance, formatKilometres } from "@/lib/move/movement";
import { MOVE_WITH_FRIENDS_ENABLED, moveSocialUnlocked } from "@/lib/move/gating";
import { clearWalkSession, saveWalkSession } from "@/lib/move/walkSession";

/**
 * Setting out on an ordinary move.
 *
 * Deliberately the same shape as the challenge screen — a route to choose, a
 * roster underneath it when the route needs one, one button at the foot — even
 * though there is no target and no badge at the end of it. Somebody who has
 * started a challenge already knows how this page works.
 *
 * ## What "bring friends" does
 *
 * It records who you set out with, their names travel with the activity to the
 * live screen and the summary, and — from `start` below — each of them is TOLD.
 *
 * What it still does not do is give them something to join. A plain move is one
 * person's recording; there is no shared row, no target and no roster, so the
 * message is a statement rather than a question ("Naj set out with you") and
 * there is nothing to accept. A challenge is the thing that can be joined, and it
 * has its own invitation with two buttons on it — see `app/move/[milestone].tsx`
 * and `move_challenge_invites`.
 *
 * ## AND IT NEEDS PLUS
 *
 * Company is the shared half of Move, so it sits behind the ₱49 monthly the same
 * way groups do. The row stays in the list wearing a `PlusBadge` rather than
 * disappearing — a feature you cannot see is one you cannot decide about — and
 * tapping it goes to the paywall instead of selecting.
 *
 * The answer comes from `moveSocialUnlocked`, not from `isPlus` directly, so the
 * testing bypass is one flag rather than one per screen — see `lib/move/gating.ts`.
 */

/**
 * How this move is being taken on.
 *
 * `challenge` only exists while one is running, and it is not a third KIND of
 * walk — every walk feeds the active challenge whether or not it is chosen here
 * (the tracker counts distance, not intent). What it changes is what this walk is
 * FOR: pick it and the page stops describing an open-ended stroll and starts
 * describing the target, what is left of it, and how long there is.
 */
type Route = "alone" | "goal" | "friends" | "challenge";

/** "a", "a and b", "a, b and c" — for a sentence built from optional parts. */
function joinPhrases(parts: (string | null)[]): string {
  const kept = parts.filter((part): part is string => Boolean(part));

  if (kept.length < 2) {
    return kept[0] ?? "";
  }

  return `${kept.slice(0, -1).join(", ")} and ${kept[kept.length - 1]}`;
}

export default function MoveStartScreen() {
  const router = useRouter();
  const { palette, isDark, isPlus } = useLumo();
  const accent = useMoveAccent();
  const move = useMove();

  const [pickedRoute, setPickedRoute] = React.useState<Route>("alone");
  /**
   * Whether the reader has actually chosen, as opposed to inheriting a default.
   *
   * Needed because the default depends on something that arrives LATE: Move's state
   * hydrates from storage after this screen mounts, so a challenge that is running
   * is not yet known on the first render. Seeding `useState` from it would land on
   * "alone" and stay there. Reading the default instead of storing it means the
   * challenge takes the selection the moment it is known — and stops taking it the
   * moment a row is tapped.
   */
  const [routeTouched, setRouteTouched] = React.useState(false);
  /** Null while loading, so an empty list is not mistaken for "no friends". */
  const [friends, setFriends] = React.useState<Friendship[] | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  /**
   * Friends who cannot come along, and why, keyed by profile id.
   *
   * Empty means everyone is free — the lookup fails open, so an offline picker
   * offers the whole list rather than locking it. Read once with the friend list
   * rather than on every open: somebody who set out in the last thirty seconds is
   * an edge this screen does not need to chase, and the invite itself is still the
   * real check.
   */
  const [unavailable, setUnavailable] = React.useState<Map<string, string>>(new Map());

  React.useEffect(() => {
    let active = true;

    friendsService
      .listFriends()
      .then(async (list) => {
        // Accepted only — somebody who has not accepted a friend request is not
        // somebody to take a walk with.
        const accepted = list.filter((entry) => entry.status === "accepted" && entry.profile.id);

        if (!active) {
          return;
        }

        setFriends(accepted);

        // Availability, straight after the list: who is mid-walk or on a
        // challenge. The challenge screen asks the same question of the same
        // helper, so the two pickers cannot disagree about who is free.
        const blocked = await challengeClient.unavailableFriends(accepted.map((entry) => entry.profile.id as string));

        if (active) {
          setUnavailable(blocked);
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
   * The one place the two conditions meet: this move has company only if the
   * route says so AND the subscription is live.
   *
   * Read everywhere below rather than `route` itself, so a lapsed subscription
   * cannot leave a roster on screen — or a list of names on the walk — from a
   * choice made while it was still paid for.
   */
  const canBringFriends = moveSocialUnlocked(isPlus);
  /**
   * The route in force: what was picked, or the challenge if one is running.
   *
   * Everything below reads THIS rather than `pickedRoute` — the first option in the
   * list has to be the selected one, and a screen where the top row is highlighted
   * by a default nobody stored is exactly the case that goes wrong when the default
   * is only applied at mount.
   */
  /** The goal in force and where it stands, or null when none is set. */
  const goalStanding = move.goalProgress;
  /**
   * The route in force: what was picked, or a sensible default.
   *
   * The default prefers a running CHALLENGE over a goal, and a goal over a plain
   * walk. Not a ranking of importance — a challenge is the one with a deadline
   * on it, so it is the one somebody is most likely to mean by "go for a walk"
   * today; a goal renews, so missing it once is not the same kind of loss.
   */
  const route: Route = routeTouched ? pickedRoute : move.progress ? "challenge" : goalStanding ? "goal" : "alone";

  function chooseRoute(next: Route) {
    setRouteTouched(true);
    setPickedRoute(next);
  }

  const withFriends = canBringFriends && route === "friends";
  const pickedFriends = (friends ?? []).filter((entry) => picked.includes(entry.profile.id as string));
  const names = pickedFriends.map((entry) => entry.profile.nickname || entry.profile.lumoId);
  // Setting out alone is always allowed; bringing people needs at least one.
  const ready = !withFriends || picked.length > 0;

  /**
   * What this move is, in the same shape the challenge screen uses.
   *
   * No goal and no reward, because there are none — an ordinary move is not a
   * challenge, and inventing a target for it would make one. The last row is
   * the honest answer to "what is this for": every metre counts toward the
   * lifetime total, and toward a challenge if one is running.
   */
  const challengeFamily = move.progress ? findFamily(move.progress.variant.milestoneId) : undefined;
  /**
   * On the challenge route the first two rows describe the CHALLENGE.
   *
   * Same five labels either way, because the card is answering the same five
   * questions — it is the answers that change. "No target" and "until you finish
   * it" are true of a stroll and false of a rung with 3.4 km and four days left on
   * it, and a summary that said them anyway would be the one part of the page not
   * to have noticed which route was chosen.
   */
  const onChallenge = route === "challenge" && move.progress !== null;
  /** The goal route, and a goal to describe — the same pairing as `onChallenge`. */
  const onGoal = route === "goal" && goalStanding !== null;
  const summaryRows = [
    {
      icon: "walk" as const,
      label: "Goal",
      value:
        onChallenge && move.progress
          ? `${formatDistance(move.progress.targetM)} — ${formatDistance(move.progress.remainingM)} to go`
          : onGoal && goalStanding
            ? goalStanding.hit
              ? `${describeGoal(goalStanding.goal)} — already made, keep going`
              : `${describeGoal(goalStanding.goal)} — ${formatKilometres(goalStanding.remainingM)} to go`
            : "No target — go as far as you like"
    },
    {
      icon: "calendar" as const,
      label: "Length",
      value:
        onChallenge && move.progress
          ? move.progress.daysLeft === null
            ? "No deadline on this one"
            : `${move.progress.daysLeft} ${move.progress.daysLeft === 1 ? "day" : "days"} left`
          : onGoal && goalStanding
            ? // The period's own clock, not the goal's: a goal has no end, and
              // the honest deadline is the one the current period is under.
              `${goalStanding.daysLeft} ${goalStanding.daysLeft === 1 ? "day" : "days"} left ${periodLabel(
                goalStanding.goal.period
              ).toLowerCase()}`
            : "Until you finish it"
    },
    { icon: "friends" as const, label: "Company", value: !withFriends ? "On your own" : names.length > 0 ? names.join(", ") : "Nobody picked yet" },
    { icon: "sun" as const, label: "Starts", value: "As soon as you tap" },
    {
      icon: "target" as const,
      label: "Counts toward",
      /**
       * Every metre counts toward everything at once — the tracker measures
       * distance, not intent — so this lists what is actually running rather
       * than whichever route was picked above.
       */
      value: joinPhrases([
        "Your lifetime total",
        challengeFamily ? `the ${challengeFamily.title} challenge` : null,
        goalStanding ? `your ${describeGoal(goalStanding.goal)} goal` : null
      ])
    }
  ];

  function start() {
    if (!ready) {
      return;
    }

    /**
     * Opens a shared session, asks the friends onto it, and does not wait.
     *
     * Not awaited on purpose: this is the tap that starts a recording, and a
     * round trip nobody is waiting for must never hold up the one thing the
     * button is for. If it fails — offline, or a friendship that has since ended —
     * the walk goes ahead as a solo recording with their names still on it, which
     * is what this screen did before sessions existed.
     *
     * The id is stored rather than passed as a route param: the walk outlives this
     * screen and can be recovered after a crash, and a param would be gone by then
     * — see `lib/move/walkSession.ts`.
     */
    if (withFriends && picked.length > 0) {
      void (async () => {
        const sessionId = await challengeClient.startWalkTogether(picked, "walk");

        if (sessionId) {
          await saveWalkSession({ sessionId, owner: true });
        }
      })().catch(() => undefined);
    } else {
      /**
       * Going alone means alone, even with a friend's walk ticked on the Move tab.
       *
       * The tick stores a session, and the track screen publishes to whatever is
       * stored — so without this, somebody who ticked Naj's walk and then came here
       * and chose "Go it alone" would still have their kilometres landing on Naj's
       * screen. Choosing the solo route is the clearest statement of intent there
       * is, and it wins over an earlier tick.
       */
      void clearWalkSession().catch(() => undefined);
    }

    /**
     * `replace`, not `push`: a recording in progress is not somewhere you
     * navigate to, and leaving this page on the stack would let somebody back
     * out of a live walk into the screen that started it.
     */
    router.replace({
      pathname: "/move/track",
      params: withFriends && names.length > 0 ? { with: names.join(", ") } : {}
    });
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader title="Move" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      <View style={styles.section}>
        <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
          How will you do it
        </AppText>

        <MoveOptionGroup>
          {/* FIRST, and selected by default, whenever a challenge is running.
              
              It is what somebody with a rung in progress almost always means by
              "go for a walk" — the two rows under it are the ordinary strolls, and
              burying the challenge beneath them made the page open on the least
              likely answer. Anyone who did mean a plain walk taps one of those, and
              the challenge still counts their distance either way. */}
          {challengeFamily && move.progress ? (
            <MoveOptionRow
              icon="target"
              title={`Complete ${challengeFamily.title}`}
              subtitle={
                move.progress.remainingM > 0
                  ? `${formatDistance(move.progress.remainingM)} to go${
                      move.progress.daysLeft === null ? "" : ` · ${move.progress.daysLeft} ${move.progress.daysLeft === 1 ? "day" : "days"} left`
                    }`
                  : "Target reached — walk it home"
              }
              selected={route === "challenge"}
              onPress={() => chooseRoute("challenge")}
            />
          ) : null}

          <MoveOptionRow
            icon="walk"
            title="Go it alone"
            subtitle="Just you, your route and the time it takes."
            selected={route === "alone"}
            onPress={() => chooseRoute("alone")}
          />
          {/* THE GOAL ROUTE — a walk taken against a target the reader set
              themselves, rather than against a rung somebody else wrote.

              Its subtitle is the goal's own standing, not a description: this
              row is the only place the figure appears before setting out, and
              "72 of 100 km this week" is what decides how far to go today.

              With no goal set, the row is the way to set one and goes to the
              goal page instead of selecting — nothing to walk toward yet.

              The bottom of the group whenever company is switched off, so the
              card does not end on the rule that separated it from the row that
              is no longer there. */}
          <MoveOptionRow
            icon="target"
            title={goalStanding ? describeGoal(goalStanding.goal) : "Set a goal"}
            subtitle={
              goalStanding
                ? // Kilometres on both halves of the pair: `formatDistance`
                  // drops to metres under 1 km, and "800 m of 100 km" reads as
                  // two unrelated numbers.
                  `${formatKilometres(goalStanding.walkedM)} of ${formatKilometres(goalStanding.targetM)} ${periodLabel(
                    goalStanding.goal.period
                  ).toLowerCase()}${goalStanding.hit ? " · made it" : ` · ${formatKilometres(goalStanding.remainingM)} to go`}`
                : "Pick a distance for the day, week or month. It renews until you end it."
            }
            selected={route === "goal"}
            onPress={() => (goalStanding ? chooseRoute("goal") : router.push("/move/goal"))}
            last={!MOVE_WITH_FRIENDS_ENABLED}
          />
          {/* GONE, not locked, while company is switched off — see
              MOVE_WITH_FRIENDS_ENABLED. A row reading "comes with Plus" would be
              offering something no subscription currently buys.

              While it IS on and merely unpaid, it stays pressable and goes to the
              paywall rather than refusing silently: `disabled` would dim the row
              and swallow the tap, which tells somebody they cannot have this
              without telling them how to. The badge replaces the radio, so the row
              cannot look chosen. */}
          {MOVE_WITH_FRIENDS_ENABLED ? (
            <MoveOptionRow
              icon="friends"
              title="Bring friends"
              subtitle={
                canBringFriends
                  ? "Note who is with you. Their names ride along with this one."
                  : "Comes with Plus, along with friends and groups."
              }
              selected={withFriends}
              onPress={() => (canBringFriends ? chooseRoute("friends") : router.push("/friends"))}
              trailing={canBringFriends ? undefined : <PlusBadge />}
              last
            />
          ) : null}

        </MoveOptionGroup>
      </View>

      {withFriends ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
              Who is coming
            </AppText>
            <AppText variant="caption" color={picked.length > 0 ? palette.subtle : accent.glyph}>
              {picked.length > 0 ? `${picked.length} coming` : "Pick at least one"}
            </AppText>
          </View>

          {picked.length === 0 ? (
            // Carded like the route list above, so the section holds its shape
            // whether or not anybody is on it.
            <View style={[styles.friendsCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
              <Icon name="friends" size={22} color={palette.subtle} weight="bulk" />
              <AppText variant="caption" color={palette.subtle} style={styles.friendsEmptyBody}>
                Lumo remembers who you went with, and lets them know you set out together.
              </AppText>
              <Button label="Add Friends" icon="userCircleAdd" variant="ghost" onPress={() => setPickerOpen(true)} />
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
                    onPress={() => setPicked((current) => current.filter((entry) => entry !== id))}
                    last={index === pickedFriends.length - 1}
                    leading={<Avatar config={friend.profile.avatar} size={44} />}
                  />
                );
              })}

              {/* Inside the card, under a rule: it acts on the list above it. */}
              <View style={[styles.rosterAction, { borderTopColor: palette.hairline }]}>
                <Button
                  label="Edit"
                  icon="userCircleAdd"
                  iconSize={15}
                  variant="ghost"
                  onPress={() => setPickerOpen(true)}
                  style={styles.rosterButton}
                  labelStyle={styles.rosterButtonLabel}
                />
              </View>
            </MoveOptionGroup>
          )}
        </View>
      ) : null}

      {/* Under the choices it describes, so picking a route and reading what it
          means are the same glance — the challenge screen's own arrangement. */}
      <View style={styles.section}>
        <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
          What you are taking on
        </AppText>
        <MoveSummaryCard rows={summaryRows} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready }}
        accessibilityLabel={ready ? "Start moving" : "Pick at least one friend"}
        onPress={start}
        disabled={!ready}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: ready ? accent.primary : palette.surface, opacity: pressed && ready ? 0.85 : 1 }
        ]}
      >
        <AppText color={ready ? palette.onGreen : palette.muted} style={styles.ctaLabel}>
          Start Moving
        </AppText>
      </Pressable>

      <MoveFriendPicker
        visible={pickerOpen}
        friends={friends}
        picked={picked}
        unavailable={unavailable}
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
  section: {
    /**
     * The air under each section's label — "How will you do it", "Who is
     * coming", "What you are taking on".
     *
     * 12 rather than 8: at 8 a label sat close enough to the card under it to
     * read as part of it, and this is the same gap the milestone screen — which
     * asks the same three questions in the same shape — already leaves.
     */
    gap: spacing.sm
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
  friendsCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    // Shallower at the foot: the Add Friends button carries its own height, so
    // a full inset under it read as a gap rather than as the card's edge.
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  friendsEmptyBody: {
    // Regular, not the caption's semibold: this is a sentence explaining the
    // section, not a label on it.
    fontFamily: fontFamilies.lexend,
    textAlign: "center",
    lineHeight: 17,
    maxWidth: 280
  },
  rosterGroup: {
    paddingBottom: 0
  },
  rosterAction: {
    borderTopWidth: StyleSheet.hairlineWidth
  },
  rosterButton: {
    minHeight: 42
  },
  rosterButtonLabel: {
    fontSize: 13
  },
  cta: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginTop: spacing.xs,
    borderRadius: radius.pill
  },
  ctaLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15
  }
});
