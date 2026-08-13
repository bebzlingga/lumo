import React from "react";
import { AppState } from "react-native";
import { addDays, toDateKey } from "@/lib/date";
import { createId } from "@/lib/id";
import { ensureSignedIn } from "@/lib/supabase";
import { achievementFor, hasMilestone, nextFamily, routesToBadge, withAchievement, type MoveAchievement } from "@/lib/move/achievements";
import {
  canStartChallenge,
  challengeEndsAt,
  challengeProgress,
  pauseChallenge,
  type ActiveMoveChallenge,
  type ChallengeProgress,
  type MoveParticipant,
  type StartRefusal,
  type TeamGoal
} from "@/lib/move/activeChallenge";
import { trackMove } from "@/lib/move/analytics";
import { challengeClient, type MoveInvite } from "@/lib/move/challengeClient";
import { findFamily, findVariant, type MoveMilestoneFamily } from "@/lib/move/challengeDefs";
import { journeyPosition } from "@/lib/move/journey";
import { displayedTotalDistance, mergeSummaries, movementStreak } from "@/lib/move/movement";
import { canReadMovement, movementProvider, type MovementPermission } from "@/lib/move/movementProvider";
import { emptyMoveState, trimSummaries, type MoveState } from "@/lib/move/state";
import { loadMoveState, saveMoveState, syncMovement } from "@/lib/move/store";
import type { MovementSummary } from "@/lib/move/types";

/**
 * Move's state, kept apart from `LumoContext`.
 *
 * A separate provider rather than fields on the existing one, for two reasons
 * that both matter. Move is a standalone feature with its own storage key, and
 * mixing it into the habit context would put movement in the same blob that is
 * rewritten on every habit tick. And it means every consumer of `useLumo` is
 * untouched by this feature — nothing about habits re-renders when a step count
 * arrives.
 *
 * Nothing in this file reads or writes a habit.
 */

/**
 * How often a team challenge re-reads the roster.
 *
 * 30 seconds. Nobody is watching a teammate's kilometres tick over second by
 * second, and a challenge runs for days — this is about a number being right when
 * somebody opens the tab, not a live feed.
 */
const TEAM_SYNC_MS = 30_000;

/** The id used for the local user in a team roster, so a screen can tell "you" apart. */
export const ME = "me";

export type MoveCelebration = {
  milestoneId: string;
  /**
   * Whether this finish completed the BADGE — the last of the milestone's three
   * routes — or was one route of it.
   *
   * The sheet draws locked art and a quieter headline for a route, because
   * showing an unlocked badge for a badge someone has not got is the one thing
   * a celebration must never do.
   */
  badgeEarned: boolean;
  title: string;
  body: string;
  /** Names of everyone who finished it with you. Empty on a solo challenge. */
  withNames: string[];
  /** "5 days". */
  detail: string;
};

type MoveContextValue = {
  isReady: boolean;
  state: MoveState;
  /** Whether this build can read movement at all. False hides every connect affordance. */
  canRead: boolean;
  permission: MovementPermission;
  syncing: boolean;

  todayKey: string;
  today: MovementSummary | null;
  /** Cumulative distance INCLUDING today — the journey's measure. */
  totalDistanceM: number;
  /** Consecutive days with movement, ending today or yesterday. */
  streakDays: number;

  /** The one challenge in progress, or null. */
  active: ActiveMoveChallenge | null;
  /** Its standing, or null when there is nothing running. */
  progress: ChallengeProgress | null;
  achievements: MoveAchievement[];
  /** The next rung to aim at, or null once every one is behind you. */
  next: MoveMilestoneFamily | null;
  journey: ReturnType<typeof journeyPosition>;

  celebration: MoveCelebration | null;
  dismissCelebration: () => void;

  connect: () => Promise<MovementPermission>;
  refresh: () => Promise<void>;
  /**
   * Credits a finished GPS activity toward the challenge — but ONLY when the
   * device's health data cannot be read.
   *
   * Health counts the same walk itself, so crediting both would count every
   * outing twice. HealthKit stays the single source of truth wherever it is
   * available; this is the fallback for a device that has none, a permission
   * that was refused, or an Android build without Health Connect. Returns
   * whether the distance was actually taken.
   */
  creditActivity: (distanceMeters: number) => boolean;

  /**
   * Starts a challenge, or says why it cannot.
   *
   * Returns a domain refusal rather than throwing, so the screen can print the
   * reason instead of failing opaquely.
   */
  startChallenge: (
    variantId: string,
    participants?: MoveParticipant[],
    /** How a team splits the distance. Ignored on a solo route. */
    teamGoal?: TeamGoal
  ) => { ok: true } | { ok: false; reason: StartRefusal };
  /**
   * Takes up a challenge somebody else invited you to.
   *
   * Separate from `startChallenge` because almost nothing is the same: the
   * challenge already exists, its id and clock come from the server rather than
   * from here, and there is no roster to validate — the owner built that. What
   * IS shared is the single-active rule, which is why this returns the same
   * refusal shape instead of a boolean.
   *
   * Async, unlike its sibling: the join has to be confirmed before the local
   * state adopts it. `startChallenge` can be optimistic because a solo challenge
   * needs nothing from the server; this one is somebody else's row, and claiming
   * it locally when the write was refused would show a challenge the rest of the
   * team cannot see.
   */
  acceptInvite: (invite: MoveInvite) => Promise<{ ok: true } | { ok: false; reason: StartRefusal }>;
  /** Turns one down. The invite leaves the list either way. */
  declineInvite: (invite: MoveInvite) => Promise<void>;
  /** Abandons the active challenge. Movement history is untouched. */
  leaveChallenge: () => void;
  /** Buys a day back on the deadline. Capped — see `pauseState`. */
  pauseChallenge: () => void;
};

const MoveContext = React.createContext<MoveContextValue | null>(null);

export function MoveProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<MoveState>(emptyMoveState);
  const [isReady, setIsReady] = React.useState(false);
  const [permission, setPermission] = React.useState<MovementPermission>("not_requested");
  const [syncing, setSyncing] = React.useState(false);
  const [celebration, setCelebration] = React.useState<MoveCelebration | null>(null);
  /** Re-read on foreground and at midnight, so "today" is never yesterday. */
  const [todayKey, setTodayKey] = React.useState(() => toDateKey());
  /** Moves the deadline countdown on without re-reading health data. */
  const [now, setNow] = React.useState(() => Date.now());

  const stateRef = React.useRef(state);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const canRead = React.useMemo(() => canReadMovement(), []);

  // --- hydrate --------------------------------------------------------------

  React.useEffect(() => {
    let active = true;

    loadMoveState()
      .then((stored) => {
        if (active) {
          setState(stored);
        }
      })
      .finally(() => {
        if (active) {
          setIsReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!isReady) {
      return;
    }

    void saveMoveState(state);
  }, [isReady, state]);

  // --- permission -----------------------------------------------------------

  React.useEffect(() => {
    let active = true;
    const provider = movementProvider();

    if (!provider) {
      setPermission("unavailable");

      return;
    }

    provider
      .getPermission()
      .then((status) => {
        if (active) {
          setPermission(status);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  // --- syncing --------------------------------------------------------------

  const runSync = React.useCallback(async () => {
    if (permission !== "granted") {
      return;
    }

    setSyncing(true);

    try {
      const at = new Date();
      const outcome = await syncMovement(stateRef.current, at);

      if (!outcome.synced) {
        return;
      }

      setState({ ...outcome.state, summaries: trimSummaries(outcome.state.summaries, toDateKey(at)) });
      setTodayKey(toDateKey(at));
      setNow(at.getTime());
    } finally {
      setSyncing(false);
    }
  }, [permission]);

  React.useEffect(() => {
    if (isReady && permission === "granted") {
      void runSync();
    }
  }, [isReady, permission, runSync]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        setTodayKey(toDateKey());
        setNow(Date.now());
        void runSync();
      }
    });

    return () => subscription.remove();
  }, [runSync]);

  // --- derived --------------------------------------------------------------

  const today = React.useMemo(
    () => state.summaries.find((summary) => summary.date === todayKey) ?? null,
    [state.summaries, todayKey]
  );

  const totalDistanceM = React.useMemo(
    () => displayedTotalDistance(state.totals, state.summaries, todayKey),
    [state.totals, state.summaries, todayKey]
  );

  const streakDays = React.useMemo(
    () => movementStreak(state.summaries, todayKey, (key) => addDays(key, -1)),
    [state.summaries, todayKey]
  );

  /**
   * The active challenge's standing.
   *
   * Derived on every read rather than stored, which is what makes it
   * self-correcting: a health platform revising yesterday simply changes the
   * number, and there is no cached "complete" flag to go stale against it.
   */
  const progress = React.useMemo(() => {
    if (!state.active || state.active.status !== "active") {
      return null;
    }

    return challengeProgress({
      challenge: state.active,
      summaries: state.summaries,
      todayKey,
      dayKeyOf: (value) => toDateKey(new Date(value)),
      now
    });
  }, [state.active, state.summaries, todayKey, now]);

  /**
   * Keeps a team challenge in step with the server.
   *
   * Publishes YOUR distance, then pulls everyone's back. Publish-then-read
   * rather than the reverse, so the roster you render already includes the walk
   * you just did — reading first would show everyone else's fresh numbers
   * beside your own stale one.
   *
   * Runs on every sync and is safe to: the upsert replaces your row rather than
   * adding to it. Names are filled from the local roster, because the server
   * deliberately does not store them.
   */
  const variantKind = progress?.variant.kind ?? null;

  React.useEffect(() => {
    const challenge = state.active;

    if (!isReady || !challenge || challenge.status !== "active" || challenge.participants.length === 0 || !progress) {
      return;
    }

    let cancelled = false;

    const sync = async () => {
      await challengeClient.publishContribution(challenge.id, progress.currentM);

      const remote = await challengeClient.fetch(challenge.id);

      if (cancelled || !remote) {
        return;
      }

      const names = new Map(challenge.participants.map((entry) => [entry.userId, entry.name]));
      /**
       * Which of the returned rows is this device.
       *
       * The server keys everyone by their real user id; the local roster keys the
       * reader as `ME`, and every screen tells "you" apart by that constant. So
       * the row that comes back for this account is renamed to it — without this
       * step the reader's own row arrived as a stranger's, showing "A friend" with
       * your own kilometres beside it, and on the invitee's side that was every
       * row on the card.
       */
      const myUserId = await ensureSignedIn();

      setState((current) =>
        current.active && current.active.id === challenge.id
          ? {
              ...current,
              active: {
                ...current.active,
                participants: remote.participants.map((entry) => {
                  const mine = entry.userId === ME || (myUserId !== null && entry.userId === myUserId);

                  return {
                    ...entry,
                    userId: mine ? ME : entry.userId,
                    name: mine ? "You" : (names.get(entry.userId) ?? entry.name)
                  };
                })
              }
            }
          : current
      );
    };

    /**
     * A team sync that fails changes nothing here.
     *
     * Your own figure comes from the device's summaries and is already on screen;
     * this only refreshes what the OTHERS have done, and a stale roster is a far
     * better outcome than an error over a walk. Caught explicitly rather than left
     * to float — every other network call in Move is guarded the same way, and an
     * unhandled rejection here would surface as a red box in development for a
     * condition that is entirely ordinary.
     */
    const run = () => void sync().catch(() => undefined);

    run();

    /**
     * AND AGAIN ON A TIMER, for a team challenge.
     *
     * The effect's own triggers are all about THIS device — a new challenge, a
     * changed status, another kilometre of your own. None of them fire while you sit
     * still, so a teammate's distance could sit frozen on screen for an entire
     * afternoon while they were out walking: the one number a team challenge exists
     * to show, and the only one nothing here was watching.
     *
     * Solo challenges get no timer. There is nobody else on them, and a poll every
     * half minute to re-read your own row would be a battery cost for no fact.
     */
    const timer =
      variantKind === "team" ? setInterval(run, TEAM_SYNC_MS) : null;

    /**
     * And live, alongside the timer rather than instead of it.
     *
     * The socket is what makes a teammate joining or a kilometre landing show up in
     * a second or two; the timer is what covers the socket being asleep, dropped, or
     * never established. Belt and braces on purpose — the failure mode of trusting
     * only the socket is a number that silently stops moving, which is the one thing
     * a shared challenge cannot afford.
     */
    const unsubscribe = variantKind === "team" ? challengeClient.subscribeToChallenge(challenge.id, run) : null;

    return () => {
      cancelled = true;
      unsubscribe?.();

      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isReady, state.active?.id, state.active?.status, progress?.currentM, variantKind]);

  const next = React.useMemo(() => nextFamily(state.achievements), [state.achievements]);
  const journey = React.useMemo(() => journeyPosition(totalDistanceM), [totalDistanceM]);

  /**
   * Files a finished challenge, once.
   *
   * The badge is awarded here rather than on whichever screen happens to be
   * open, so it lands whether someone is looking at Move, at Habits, or has the
   * phone in a pocket. `celebrated` keys on the CHALLENGE id, so a finish shows
   * exactly once and never again on relaunch.
   */
  React.useEffect(() => {
    if (!isReady || !progress?.complete || !state.active || state.celebrated.includes(state.active.id)) {
      return;
    }

    const challenge = state.active;
    const completedAt = new Date().toISOString();
    const others = challenge.participants.filter((entry) => entry.leftAt === null && entry.userId !== ME);
    const achievement = achievementFor({
      variantId: challenge.variantId,
      startedAt: challenge.startedAt,
      completedAt,
      withUserIds: others.map((entry) => entry.userId)
    });

    if (!achievement) {
      return;
    }

    const variant = findVariant(challenge.variantId);
    // Filed first, then asked: the badge needs all three routes, so whether
    // this one earned it depends on the list WITH it already in.
    const filed = withAchievement(state.achievements, achievement);
    const family = findFamily(achievement.milestoneId);
    const badgeEarned = hasMilestone(filed, achievement.milestoneId);
    const toGo = family ? routesToBadge(filed, family) : 1;

    setState((current) => ({
      ...current,
      active: { ...challenge, status: "completed", completedAt },
      achievements: withAchievement(current.achievements, achievement),
      celebrated: [...current.celebrated, challenge.id].slice(-20)
    }));

    void challengeClient.complete(challenge.id).catch(() => undefined);

    trackMove("move_challenge_completed", { challengeId: challenge.variantId, milestoneId: achievement.milestoneId });

    if (badgeEarned) {
      trackMove("move_badge_unlocked", { milestoneId: achievement.milestoneId });
    }

    const withNames = others.map((entry) => entry.name);

    setCelebration({
      milestoneId: achievement.milestoneId,
      badgeEarned,
      title: badgeEarned
        ? withNames.length > 0
          ? "Badge earned, together!"
          : "Badge earned!"
        : withNames.length > 0
          ? "Route done, together!"
          : "Route done!",
      body: badgeEarned
        ? (family?.title ?? "Milestone complete")
        : `${variant?.title ?? "Challenge complete"} · ${toGo} more to earn the badge`,
      withNames,
      detail: `${achievement.days} ${achievement.days === 1 ? "day" : "days"}`
    });
  }, [isReady, progress?.complete, state.active, state.celebrated]);

  // --- actions --------------------------------------------------------------

  const connect = React.useCallback(async () => {
    const provider = movementProvider();

    if (!provider) {
      setPermission("unavailable");

      return "unavailable" as const;
    }

    trackMove("movement_permission_requested");
    const status = await provider.requestPermissions();

    setPermission(status);
    trackMove(status === "granted" ? "movement_permission_granted" : "movement_permission_denied");

    return status;
  }, []);

  const value = React.useMemo<MoveContextValue>(
    () => ({
      isReady,
      state,
      canRead,
      permission,
      syncing,
      todayKey,
      today,
      totalDistanceM,
      streakDays,
      active: state.active && state.active.status === "active" ? state.active : null,
      progress,
      achievements: state.achievements,
      next,
      journey,
      celebration,
      dismissCelebration: () => setCelebration(null),
      connect,
      refresh: runSync,
      creditActivity(distanceMeters) {
        // The rule that prevents double counting, in one condition.
        if (canRead && permission === "granted") {
          return false;
        }

        if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
          return false;
        }

        setState((current) => {
          const key = toDateKey();
          const today = current.summaries.find((entry) => entry.date === key);

          return {
            ...current,
            summaries: mergeSummaries(current.summaries, [
              {
                date: key,
                // Added to whatever today already has, so two walks in a day
                // both count. `mergeSummaries` replaces a day rather than
                // appending, which is why the sum happens here.
                distanceMeters: (today?.distanceMeters ?? 0) + distanceMeters,
                steps: today?.steps ?? 0,
                activeMinutes: today?.activeMinutes ?? 0
              }
            ])
          };
        });

        return true;
      },
      startChallenge(variantId, participants = [], teamGoal = "each") {
        const check = canStartChallenge({
          active: stateRef.current.active,
          variantId,
          invitedFriendIds: participants.filter((entry) => entry.userId !== ME).map((entry) => entry.userId)
        });

        if (!check.ok) {
          return check;
        }

        const variant = check.variant;
        const startedAt = new Date().toISOString();
        /**
         * A local id to start with, swapped for the server's below.
         *
         * Held in a variable because the swap has to be able to find this exact
         * challenge again — by the time `create` answers, the state may have moved
         * on (a second start, a leave), and blindly writing the id in would attach
         * it to whatever is there now.
         */
        const localId = createId();

        setState((latest) => ({
          ...latest,
          active: {
            id: localId,
            variantId,
            startedAt,
            endsAt: challengeEndsAt(variant, startedAt),
            status: "active",
            completedAt: null,
            participants,
            ownerId: participants.length > 0 ? ME : null,
            teamGoal,
            pausesUsed: 0
          }
        }));

        /**
         * AND THEN TAKE THE SERVER'S ID, which is the whole point of the call.
         *
         * The result used to be discarded. The owner therefore walked around with a
         * `createId()` uuid that existed on no server, and every call keyed on it
         * silently did nothing: `publishContribution` wrote to a challenge that was
         * not there, `fetch` came back null so the roster never arrived, and
         * `complete` stamped nothing. The invitee's side worked — they take the id
         * off the invitation — which is exactly why this showed up as "it is not
         * reflecting on both devices" rather than as an error anywhere.
         *
         * Still optimistic: the local id starts the challenge immediately, and a
         * failed or offline `create` leaves it in place so a solo challenge runs
         * unaffected. The swap only ever narrows local truth toward the server's.
         */
        void challengeClient
          .create({
            variant,
            startedAt,
            endsAt: challengeEndsAt(variant, startedAt) ?? null,
            friendIds: participants.filter((entry) => entry.userId !== ME).map((entry) => entry.userId),
            teamGoal
          })
          .then((created) => {
            if (!created) {
              return;
            }

            setState((current) =>
              current.active && current.active.id === localId
                ? { ...current, active: { ...current.active, id: created.id } }
                : current
            );
          })
          .catch(() => undefined);

        trackMove("move_challenge_joined", { challengeId: variantId, milestoneId: variant.milestoneId });

        return { ok: true };
      },
      async acceptInvite(invite) {
        const variant = findVariant(invite.variantId);

        if (!variant) {
          return { ok: false, reason: "MOVE_CHALLENGE_UNKNOWN_VARIANT" };
        }

        // The one rule an invitee can still break. Checked here rather than left
        // to the database's duplicate key, so the answer is a sentence instead of
        // a failed write.
        if (stateRef.current.active && stateRef.current.active.status === "active") {
          return { ok: false, reason: "MOVE_CHALLENGE_ALREADY_ACTIVE" };
        }

        if (!(await challengeClient.respondToInvite(invite.challengeId, true))) {
          // Refused by the server, and it does not say which rule: the slot, or
          // the subscription check on a Plus rung. `JOIN_REFUSED` exists to say
          // both rather than guess one.
          return { ok: false, reason: "MOVE_CHALLENGE_JOIN_REFUSED" };
        }

        setState((latest) => ({
          ...latest,
          active: {
            // The SERVER's id, not a local one — this challenge already exists,
            // and a fresh id here would publish contributions to a row nobody
            // else is reading.
            id: invite.challengeId,
            variantId: invite.variantId,
            startedAt: invite.startedAt,
            endsAt: invite.endsAt,
            status: "active",
            completedAt: null,
            // Filled in by the next sync, which reads the real roster off the
            // server. Starting with just this device keeps the local shape valid
            // in the meantime.
            participants: [{ userId: ME, name: "You", contributionM: 0, leftAt: null }],
            ownerId: invite.inviterId,
            teamGoal: invite.teamGoal,
            pausesUsed: 0
          }
        }));

        trackMove("move_challenge_joined", { challengeId: invite.variantId, milestoneId: invite.milestoneId });

        return { ok: true };
      },
      async declineInvite(invite) {
        await challengeClient.respondToInvite(invite.challengeId, false);
      },
      pauseChallenge() {
        setState((latest) => (latest.active ? { ...latest, active: pauseChallenge(latest.active) } : latest));
      },
      leaveChallenge() {
        const challenge = stateRef.current.active;

        setState((current) => (current.active ? { ...current, active: { ...current.active, status: "cancelled" } } : current));

        if (challenge) {
          // Stamps the participant row rather than deleting it — the group
          // carries on from where it got to, and nobody's kilometres vanish.
          void challengeClient.leave(challenge.id).catch(() => undefined);
        }
      }
    }),
    [
      isReady,
      state,
      canRead,
      permission,
      syncing,
      todayKey,
      today,
      totalDistanceM,
      streakDays,
      progress,
      next,
      journey,
      celebration,
      connect,
      runSync
    ]
  );

  return <MoveContext.Provider value={value}>{children}</MoveContext.Provider>;
}

export function useMove(): MoveContextValue {
  const value = React.useContext(MoveContext);

  if (!value) {
    throw new Error("useMove must be used inside MoveProvider");
  }

  return value;
}
