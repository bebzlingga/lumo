import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Animated,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { ChallengeFacts, ChallengeHeadline, TeamContributions, useMoveAccent, useTeamMembers } from "@/components/move/ChallengeUI";
import { Avatar } from "@/components/Avatar";
import { MoveBadge } from "@/components/move/MoveBadge";
import { MoveInviteCard } from "@/components/move/MoveInviteCard";
import { WalkInviteCard } from "@/components/move/WalkInviteCard";
import { MoveScopeTabs, type MoveScope } from "@/components/move/MoveScopeTabs";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState } from "@/components/states";
import { AppText, Screen } from "@/components/ui";
import { WalkBackground, useWalkSceneInset } from "@/components/WalkBackground";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { ME, useMove } from "@/context/MoveContext";
import { addDays, formatRelativeDate, toDateKey } from "@/lib/date";
import { hasMilestone } from "@/lib/move/achievements";
import { trackMove } from "@/lib/move/analytics";
import { START_REFUSAL_COPY } from "@/lib/move/activeChallenge";
import { challengeClient, onMoveInvitesChanged, type MoveInvite, type WalkInvite } from "@/lib/move/challengeClient";
import { MOVE_FAMILIES } from "@/lib/move/challengeDefs";
import { clearWalkSession, loadWalkSession, saveWalkSession } from "@/lib/move/walkSession";
import { formatKilometres, formatMinutes, formatSteps } from "@/lib/move/movement";
import { MovePermissionCard } from "@/components/move/MoveCards";
import { MovingMapPreview } from "@/components/move/MovingMapPreview";
import { toWalkPoints } from "@/lib/move/tracking/bridge";
import { formatDistanceValue, formatDuration } from "@/lib/move/tracking/pace";
import { useActivityTracker } from "@/lib/move/tracking/useActivityTracker";
import { friendsService, type Friendship } from "@/lib/friends";
import { loadWalkState } from "@/lib/walkStorage";
import type { WalkRecord } from "@/lib/walk";

/**
 * How much of the neighbouring invitation shows past the centred one.
 *
 * 28 is enough to read as a card rather than a stripe, and little enough that the
 * one in the middle is plainly the one being answered. It is the only thing that
 * says a second invitation exists before anybody swipes.
 */
const INVITE_PEEK = 28;

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
 * And how much closer still the Overall tab starts.
 *
 * It opens on a 58pt figure with nothing above it — no chip, no heading — so it
 * can sit a little higher than the Today states without crowding Lumo.
 */
const OVERALL_SCENE_LIFT = 20;

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
  /**
   * Tracked walks, for linking the day rows to their routes.
   *
   * Read straight from the walk store rather than through `MoveContext`: Move
   * keeps daily totals, the walk store keeps recordings, and the two are
   * deliberately separate — see `lib/move/store.ts`.
   */
  const [walkHistory, setWalkHistory] = React.useState<WalkRecord[]>([]);
  /** Friends, for putting a face to each companion name. */
  const [friends, setFriends] = React.useState<Friendship[]>([]);
  /**
   * Challenges friends have asked this account to join.
   *
   * Held here rather than in `MoveContext` because they are not part of Move's
   * state — they are a question about it, they live only on the server, and
   * nothing offline depends on them. The context owns the ANSWER (`acceptInvite`)
   * because that changes the active challenge, which is state.
   */
  const [invites, setInvites] = React.useState<MoveInvite[]>([]);
  /**
   * And invitations to an ordinary move happening right now.
   *
   * A separate list from the challenge invites above, because they are separate
   * things: one is a target over days, the other is "coming out for a walk?" and
   * expires on its own as the walk ends. Both cards sit in the same place.
   */
  const [walkInvites, setWalkInvites] = React.useState<WalkInvite[]>([]);
  /** The invite currently being answered, so its buttons can hold still. */
  const [answering, setAnswering] = React.useState<string | null>(null);
  /**
   * A shared move this device has agreed to but not started yet.
   *
   * What turns "Move Now" into "Move with Naj". Read from storage rather than held
   * only in state, so the promise survives the tab being closed, the app being
   * backgrounded, and a relaunch — see `lib/move/walkSession.ts`.
   */
  const [joinedSession, setJoinedSession] = React.useState<{ sessionId: string | null; withName?: string } | null>(null);
  /** Both kinds at once — the carousel shows them in one deck. */
  const invitationCount = invites.length + walkInvites.length;
  const { width: screenWidth } = useWindowDimensions();
  /**
   * The deck's geometry: one card centred, its neighbours peeking either side.
   *
   * `INVITE_PEEK` is how much of the next card shows. The card is the screen minus
   * that sliver on BOTH sides, and the scroller is padded by exactly the same
   * amount — which is what centres the first card instead of starting it at the
   * gutter, and what leaves the previous one visible once you have swiped.
   *
   * The padding and the width are one calculation for that reason: they have to
   * agree or every card lands off-centre by the difference.
   */
  const inviteCardWidth = Math.max(240, screenWidth - (INVITE_PEEK + spacing.xs) * 2);
  const inviteSidePad = Math.max(0, (screenWidth - inviteCardWidth) / 2);
  /**
   * A recording in progress, if there is one.
   *
   * Read straight from the tracker rather than through Move's own state: the
   * two are separate on purpose, and this screen only needs to know whether to
   * offer a walk or show the one already happening.
   */
  const { state: activity } = useActivityTracker();
  const moving = Boolean(activity) && activity?.status !== "finished";
  const paused = activity?.status === "paused" || activity?.status === "autoPaused";
  /**
   * The last position the tracker saw, accepted or not.
   *
   * Only ever used to frame the preview before the route has points of its own
   * — a rejected fix is still roughly where the phone is, which is all a frame
   * needs, and without one the platform opens on the whole country.
   */
  /**
   * A face for each companion, looked up by the name the walk stored.
   *
   * The activity keeps names rather than ids — see `ActivityTrackingState` —
   * because a name is what the summary and the share card need, and they have
   * to work offline and long after a friendship might have changed. The avatar
   * is a nicety on top, so matching by name is the right trade: no match simply
   * falls back to the glyph.
   */
  const avatarByName = React.useMemo(() => {
    const map = new Map<string, Friendship["profile"]["avatar"]>();

    for (const entry of friends) {
      const name = entry.profile.nickname || entry.profile.lumoId;

      if (name && entry.profile.avatar) {
        map.set(name, entry.profile.avatar);
      }
    }

    return map;
  }, [friends]);

  const lastActivityFix = React.useMemo(() => {
    const point = activity?.rawPoints[activity.rawPoints.length - 1];

    return point ? { lat: point.latitude, lon: point.longitude } : null;
  }, [activity?.rawPoints]);
  const [dismissedConnect, setDismissedConnect] = React.useState(false);
  const [scope, setScope] = React.useState<MoveScope>("today");
  /**
   * Whether the carousel is on screen, and therefore whether the stacked cards at
   * the top of the tab should stand down.
   *
   * The carousel sits inside the idle block — Today, nothing running — so on the
   * Stats tab or mid-challenge it does not exist, and the invitations need
   * somewhere else to be. One flag, read in both places, so the two can never both
   * render and show every invitation twice.
   */
  const carouselShown = scope === "today" && !move.progress && invitationCount > 0;


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
  /**
   * What the last week and the last month came to, in metres.
   *
   * Rolling windows ending today, like the day list — not calendar weeks and
   * months, which reset to nearly nothing on the 1st and say least exactly when
   * somebody is most likely to look.
   */
  /**
   * Everything recorded on a given day, from BOTH sources.
   *
   * Health data covers every step taken, phone in hand or not, and is the right
   * figure whenever it is available. A tracked walk is the only figure when it
   * is NOT — no health permission, or no health module in the build — and
   * without this the list called a day with a recorded walk on it "No activity",
   * which is how this was found.
   *
   * `max`, not a sum: with health permission granted the walk is already inside
   * the day's health figure, so adding them would count the same kilometres
   * twice. The same rule `move.creditActivity` uses for challenges.
   */
  const dayDistance = React.useCallback(
    (dateKey: string) => {
      const health = move.state.summaries.find((entry) => entry.date === dateKey)?.distanceMeters ?? 0;
      const tracked = walkHistory
        .filter((record) => toDateKey(new Date(record.startedAt)) === dateKey)
        .reduce((total, record) => total + Math.max(0, record.distanceM), 0);

      return Math.max(health, tracked);
    },
    [move.state.summaries, walkHistory]
  );

  const periodTotals = React.useMemo(() => {
    const sum = (days: number) =>
      Array.from({ length: days }, (_, index) => dayDistance(addDays(move.todayKey, -index))).reduce(
        (total, metres) => total + metres,
        0
      );

    return { today: dayDistance(move.todayKey), week: sum(7), month: sum(30) };
  }, [move.todayKey, dayDistance]);

  const lastSevenDays = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(move.todayKey, -index);
      const summary = move.state.summaries.find((entry) => entry.date === date);
      /**
       * The walks RECORDED on that day, which is a different thing from the
       * day's figures.
       *
       * The numbers on the row come from health data and cover every step
       * taken, phone in hand or not. Only a walk that was tracked has a route,
       * a summary screen and somewhere to go — so a day can read 4.2 km and
       * still have nothing to open.
       */
      const walks = walkHistory.filter((record) => toDateKey(new Date(record.startedAt)) === date);
      // Minutes follow distance: whichever source knows about the day.
      const trackedMinutes = walks.reduce((total, record) => total + Math.max(0, record.activeMs) / 60_000, 0);

      return {
        date,
        distanceMeters: dayDistance(date),
        activeMinutes: Math.max(summary?.activeMinutes ?? 0, Math.round(trackedMinutes)),
        walks
      };
    });
  }, [move.todayKey, move.state.summaries, walkHistory, dayDistance]);

  /**
   * Opens what a day's row points at.
   *
   * One tracked walk goes straight to it. More than one goes to the history,
   * because picking for somebody would mean quietly hiding the others behind a
   * row that gave no sign there were any.
   */
  function openDay(walks: WalkRecord[]) {
    if (walks.length === 1) {
      router.push(`/walk/${walks[0].id}`);

      return;
    }

    router.push("/walk/history");
  }

  /**
   * The invite list, reloaded from the server.
   *
   * A callback rather than inline in the focus effect, because three different
   * things ask for it — focus, a live realtime event, and coming back to the
   * foreground. Always replaces the whole list: an invite can be withdrawn by the
   * inviter or answered on another device, and merging would keep a card alive
   * that no longer has a row behind it.
   */
  const loadInvites = React.useCallback(async () => {
    /**
     * The two lists are loaded INDEPENDENTLY, not in one `Promise.all` under one
     * catch.
     *
     * They were, and it coupled them: a walk-invite query against a database
     * missing the sessions migration threw, and the throw blanked the challenge
     * invites too — a card that had nothing wrong with it vanished because a
     * different feature was half-deployed. Each list now fails on its own.
     */
    const [challenges, walks] = await Promise.all([
      challengeClient.listInvites().catch(() => null),
      challengeClient.listWalkInvites().catch(() => null)
    ]);

    // Null means the fetch failed, and the previous list is kept: an empty list
    // would read as "no invitations", which is a different and wrong statement.
    if (challenges) {
      setInvites(challenges);
    }

    if (walks) {
      setWalkInvites(walks);
    }
  }, []);

  /**
   * Re-read on every visit, so a walk finished a moment ago has its row.
   *
   * On focus rather than on a dependency: this tab stays mounted, and a walk
   * recorded without health permission changes no summary — so nothing else
   * here would tell us the store had moved.
   */
  useFocusEffect(
    React.useCallback(() => {
      let active = true;

      loadWalkState().then((stored) => {
        if (active) {
          setWalkHistory(stored.history);
        }
      });

      friendsService
        .listFriends()
        .then((list) => {
          if (active) {
            setFriends(list);
          }
        })
        .catch(() => undefined);

      void loadInvites();

      // The session survives this screen, so it is re-read on every visit rather
      // than trusted from the last one: it may have been started, finished or gone
      // stale on the track screen since.
      loadWalkSession().then((stored) => {
        if (active) {
          setJoinedSession(stored ? { sessionId: stored.sessionId, withName: stored.withName } : null);
        }
      });

      return () => {
        active = false;
      };
    }, [loadInvites])
  );

  /**
   * And live, not only on focus.
   *
   * Three ways an invite arrives, and each needs its own trigger. `onFocus` above
   * covers coming back to the tab. `onMoveInvitesChanged` covers one landing while
   * you are ALREADY on this tab — realtime hears the row and rings it, and without
   * this the card would wait for a focus that never comes. And the foreground
   * check covers the phone having been asleep, where the realtime socket was gone
   * and no event was ever delivered.
   */
  React.useEffect(() => {
    const stopListening = onMoveInvitesChanged(() => void loadInvites());
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        void loadInvites();
      }
    });

    return () => {
      stopListening();
      subscription.remove();
    };
  }, [loadInvites]);

  /**
   * Answering an invite.
   *
   * The row leaves the list either way, and on the way in it is dropped BEFORE
   * the refusal can come back — accepting can still fail (someone else's slot
   * rule, or the subscription check on a Plus rung), and that is what the alert
   * is for. Leaving the card up under an alert would read as the tap not having
   * landed.
   */
  /**
   * Answering an invitation to walk together.
   *
   * Joining does two things, in this order: it takes the place on the session, and
   * only then starts a recording. The other way round would put somebody on a
   * tracked walk that nobody else can see — and the join is the part that can be
   * refused.
   *
   * The session id is stored rather than passed to `/move/track`: the walk outlives
   * the screen and can be recovered after a crash, when a route param is long gone
   * (see `lib/move/walkSession.ts`).
   */
  /**
   * Ticks an invitation, or unticks it.
   *
   * One handler for both directions, because the row is a checkbox and a checkbox
   * has one action. Ticking takes the place on the walk and stores the session,
   * which is what makes "Move Now" publish to it; unticking gives the place back
   * and clears the session, so the same button goes out alone again.
   *
   * The card is never removed by either — an invitation is a standing offer until
   * the friend's walk ends, and a row that vanished on the tick would leave nothing
   * to untick.
   */
  async function toggleWalkInvite(invite: WalkInvite) {
    if (answering) {
      return;
    }

    setAnswering(invite.inviteId);

    /**
     * The tick lands NOW, and is taken back only if the server refuses.
     *
     * Selecting used to wait on up to two round trips — handing back the previous
     * place, then taking this one — and on a slow connection a tap on the row did
     * nothing at all for a second or more, which reads as a dead control rather than
     * a slow one. The state a tap is about is a local one; the writes are how it is
     * kept.
     *
     * `snapshot` is what the revert restores, so a failure cannot leave the deck
     * showing a place this device does not hold.
     */
    const snapshot = walkInvites;
    const nextAccepted = !invite.accepted;

    setWalkInvites((current) =>
      current.map((entry) => ({
        ...entry,
        // A radio across the deck: ticking one unticks the rest in the same pass.
        accepted: entry.inviteId === invite.inviteId ? nextAccepted : nextAccepted ? false : entry.accepted
      }))
    );

    try {
      if (invite.accepted) {
        await challengeClient.undoWalkInvite(invite);
        await clearWalkSession();

        setJoinedSession(null);

        return;
      }

      /**
       * ONE AT A TIME. Ticking this unticks whichever was ticked before.
       *
       * You can be on one walk, and there is one stored session — so two ticked rows
       * would promise something the storage cannot keep, and the second tick would
       * silently take the first one's place while both still showed a tick. The
       * previous one is given back first, so the server agrees with the screen.
       */
      const previous = walkInvites.find((entry) => entry.accepted && entry.inviteId !== invite.inviteId);

      if (previous) {
        await challengeClient.undoWalkInvite(previous);
      }

      if (!(await challengeClient.respondToWalkInvite(invite, true))) {
        // Put the deck back exactly as it was before the optimistic tick.
        setWalkInvites(snapshot);
        Alert.alert("Could not join", "That move may have finished. Pull to refresh and see.");

        return;
      }

      const senderName = friends.find((entry) => entry.profile.id === invite.senderId)?.profile.nickname;

      await saveWalkSession({ sessionId: invite.sessionId, owner: false, withName: senderName || "a friend" });

      setJoinedSession({ sessionId: invite.sessionId, withName: senderName || "a friend" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } finally {
      setAnswering(null);
    }
  }

  /**
   * Clears an invitation off the deck for good.
   *
   * A decline, not an untick: the row is marked declined so it does not come back on
   * the next refresh. The difference matters — leaving an invitation unticked means
   * "not right now" and it expires with their walk, where the cross means "I am not
   * coming" and should be believed.
   *
   * If it was the ticked one, the session goes with it: the button must not still be
   * armed for a walk that has just been turned down.
   */
  async function dismissWalkInvite(invite: WalkInvite) {
    if (answering) {
      return;
    }

    setAnswering(invite.inviteId);

    try {
      await challengeClient.respondToWalkInvite(invite, false);

      if (invite.accepted) {
        await clearWalkSession();
        setJoinedSession(null);
      }

      setWalkInvites((current) => current.filter((entry) => entry.inviteId !== invite.inviteId));
    } finally {
      setAnswering(null);
    }
  }

  async function answerInvite(invite: MoveInvite, accept: boolean) {
    if (answering) {
      return;
    }

    setAnswering(invite.challengeId);

    try {
      if (!accept) {
        await move.declineInvite(invite);
        setInvites((current) => current.filter((entry) => entry.challengeId !== invite.challengeId));

        return;
      }

      const result = await move.acceptInvite(invite);

      if (result.ok) {
        setInvites((current) => current.filter((entry) => entry.challengeId !== invite.challengeId));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

        return;
      }

      Alert.alert("Could not join", START_REFUSAL_COPY[result.reason]);
    } finally {
      setAnswering(null);
    }
  }

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
      <View
        style={{
          height: Math.max(
            0,
            sceneInset - (scope === "overall" ? OVERALL_SCENE_LIFT : move.progress ? ACTIVE_SCENE_LIFT : EMPTY_SCENE_LIFT)
          )
        }}
      />

      {needsConnect && !dismissedConnect ? (
        <MovePermissionCard onConnect={() => void handleConnect()} onDismiss={() => setDismissedConnect(true)} busy={connecting} />
      ) : null}

      {/* Above the scope split, so an invitation is not hidden behind the tab you
          happen not to be on — and above today's own numbers, because it is the
          only thing on this screen with somebody else waiting on the other end.
          The inviter's name and face come from the friend list: the server keeps
          no copy of either. */}
      {/* THE FALLBACK PLACEMENT, and only that.
          
          Invitations live in the carousel further down, where the benefits chips
          would be — but that block only exists on the Today tab with nothing
          running. So these stacked cards cover the cases the carousel cannot
          reach: a challenge in progress, or the Stats tab. Rendering both at once
          would show every invitation twice. */}
      {carouselShown ? null : walkInvites.map((invite) => {
        const sender = friends.find((entry) => entry.profile.id === invite.senderId);

        return (
          <WalkInviteCard
            key={invite.inviteId}
            invite={invite}
            senderName={sender?.profile.nickname || sender?.profile.lumoId || "A friend"}
            senderAvatar={sender?.profile.avatar}
            busy={answering === invite.inviteId}
            onToggle={() => void toggleWalkInvite(invite)}
            onDismiss={() => void dismissWalkInvite(invite)}
          />
        );
      })}

      {carouselShown ? null : invites.map((invite) => {
        const inviter = friends.find((entry) => entry.profile.id === invite.inviterId);

        return (
          <MoveInviteCard
            key={invite.challengeId}
            invite={invite}
            inviterName={inviter?.profile.nickname || inviter?.profile.lumoId || "A friend"}
            inviterAvatar={inviter?.profile.avatar}
            busy={answering === invite.challengeId}
            onJoin={() => void answerInvite(invite, true)}
            onDecline={() => void answerInvite(invite, false)}
          />
        );
      })}

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
                accessibilityLabel={moving ? "Back to your walk" : "Start moving"}
                /**
                 * Three destinations, one button.
                 *
                 * Mid-walk it is the way back to the recording. With a friend's walk
                 * ticked it starts one straight away, publishing to their session.
                 * Otherwise it asks the start page who is coming.
                 *
                 * The middle case is here as well as on the idle button below
                 * because an invitation can be ticked while a challenge is running —
                 * the deck is on screen either way — and a Move Now that ignored the
                 * tick would walk somebody through the start page to choose company
                 * they had already chosen.
                 */
                onPress={() =>
                  router.push(
                    moving
                      ? "/move/track"
                      : joinedSession
                        ? { pathname: "/move/track", params: joinedSession.withName ? { with: joinedSession.withName } : {} }
                        : "/move/start"
                  )
                }
                style={({ pressed }) => [styles.trackWalk, { backgroundColor: accent.primary, opacity: pressed ? 0.85 : 1 }]}
              >
                <Icon name="walk" size={16} color={palette.white} weight="bulk" />
                <AppText variant="button" color={palette.white}>
                  {/* One at a time: starting a second recording is not possible,
                      so during one this is the way back to it. */}
                  {moving
                    ? `${formatDistanceValue(activity?.distanceMeters ?? 0)} km · ${formatDuration(activity?.movingDuration ?? 0)}`
                    : "Move Now"}
                </AppText>
              </Pressable>
            </>
          ) : moving ? (
            /* A walk is happening. The case for walking has been made and
               accepted, so the screen reports it instead of arguing for it —
               and the only thing to offer is the way back to the map. */
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to your walk"
              onPress={() => router.push("/move/track")}
              style={({ pressed }) => [styles.movingCard, { opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={[styles.movingChip, { backgroundColor: alpha(paused ? palette.danger : accent.glyph, "1F") }]}>
                <AppText variant="caption" color={paused ? palette.danger : accent.glyph} style={styles.movingChipLabel}>
                  {paused ? "Paused" : "Moving now"}
                </AppText>
              </View>

              <AppText color={palette.ink} style={styles.movingValue} numberOfLines={1}>
                {formatDistanceValue(activity?.distanceMeters ?? 0)}
                <AppText color={palette.ink} style={styles.movingUnit}>
                  {" km"}
                </AppText>
              </AppText>

              <AppText variant="caption" color={palette.muted}>
                {formatDuration(activity?.movingDuration ?? 0)} moving · tap to open
              </AppText>

              {/* Who came along.
                  Names and a shared clock, because that is all there is to
                  know: a plain move has no session on the server, so nobody
                  else's device is reporting anything. Rather than invent a
                  distance for them, the row says what is true — they set out
                  with you. A team CHALLENGE is where real per-person figures
                  live, and that has its own leaderboard. */}
              {activity?.companions?.length ? (
                <View style={styles.movingWith}>
                  {activity.companions.map((name, index) => {
                    const avatar = avatarByName.get(name);

                    return (
                      <View
                        key={name}
                        style={[
                          styles.movingWithRow,
                          // Rules rather than a fill. The block sits on the page
                          // with nothing else on it, and five tinted pills read
                          // as five buttons.
                          index === 0 ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }
                        ]}
                      >
                        {avatar ? (
                          <Avatar config={avatar} size={34} />
                        ) : (
                          <View style={[styles.movingWithFallback, { backgroundColor: alpha(palette.hairline, "80") }]}>
                            <Icon name="user" size={16} color={palette.muted} weight="bulk" />
                          </View>
                        )}
                        <AppText variant="caption" color={palette.ink} numberOfLines={1} style={styles.movingWithName}>
                          {name}
                        </AppText>
                        <AppText variant="caption" color={palette.muted}>
                          With you
                        </AppText>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {/* The route so far, faded into the page. Proof the app is still
                  following, without a second map to operate. */}
              {activity ? (
                <MovingMapPreview
                  route={toWalkPoints(activity)}
                  center={lastActivityFix}
                  height={160}
                />
              ) : null}
            </Pressable>
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

              {/* INVITATIONS TAKE THIS SPACE when there are any.
                  
                  The benefits chips are an argument for walking, and they are the
                  right thing to show somebody with no reason to go out yet. A
                  friend asking you along is a better reason than any of them, so
                  when one is waiting it takes the same slot rather than stacking
                  above the chips and pushing the button off the screen.

                  A carousel rather than a column for the same reason: three
                  invitations as three cards would bury "Move Now" under other
                  people's plans. */}
              {invitationCount > 0 ? (
                <View style={styles.inviteCarousel}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    // Snapped to the card pitch, so a swipe lands on a card rather
                    // than between two — and `fast` because a carousel that glides
                    // past three cards feels like a scroll, not a deck.
                    snapToInterval={inviteCardWidth + spacing.xs}
                    decelerationRate="fast"
                    disableIntervalMomentum
                    style={styles.inviteCarouselScroll}
                    // The side padding is computed, so it cannot live in the
                    // stylesheet with the rest — it is half the space the card does
                    // not fill, which is what puts a card in the middle of the
                    // screen rather than against its edge.
                    contentContainerStyle={[styles.inviteCarouselContent, { paddingHorizontal: inviteSidePad }]}
                  >
                    {walkInvites.map((invite) => {
                      const sender = friends.find((entry) => entry.profile.id === invite.senderId);

                      return (
                        <View key={invite.inviteId} style={{ width: inviteCardWidth }}>
                          <WalkInviteCard
                            invite={invite}
                            senderName={sender?.profile.nickname || sender?.profile.lumoId || "A friend"}
                            senderAvatar={sender?.profile.avatar}
                            busy={answering === invite.inviteId}
                            onToggle={() => void toggleWalkInvite(invite)}
                            onDismiss={() => void dismissWalkInvite(invite)}
                          />
                        </View>
                      );
                    })}
                    {invites.map((invite) => {
                      const inviter = friends.find((entry) => entry.profile.id === invite.inviterId);

                      return (
                        <View key={invite.challengeId} style={{ width: inviteCardWidth }}>
                          <MoveInviteCard
                            invite={invite}
                            inviterName={inviter?.profile.nickname || inviter?.profile.lumoId || "A friend"}
                            inviterAvatar={inviter?.profile.avatar}
                            busy={answering === invite.challengeId}
                            onJoin={() => void answerInvite(invite, true)}
                            onDecline={() => void answerInvite(invite, false)}
                          />
                        </View>
                      );
                    })}
                  </ScrollView>

                  {/* Dots only past one card. A single dot under a single card is
                      a control for a choice that does not exist. */}
                  {invitationCount > 1 ? (
                    <AppText variant="caption" color={palette.muted} style={styles.inviteCarouselHint}>
                      {invitationCount} invitations · swipe
                    </AppText>
                  ) : null}
                </View>
              ) : (
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

              {/* One door — and while it is open, the door is the walk itself.
                  Offering "Move Now" during a recording would start a second
                  one; the tracker allows exactly one at a time, so the button
                  becomes the way back to the one already running. */}
              {/* ONE BUTTON, always, and it always says the same thing.
                  
                  A ticked invitation does not replace it — somebody who ticked a
                  friend's walk and then decided to go on their own should not have
                  to hunt for the way to do that, and a button that renames itself
                  under a ticked row reads as the row having taken it over.
                  
                  What changes is only where it goes. With a walk ticked, both
                  questions the start page asks — alone or together, and with whom —
                  are already answered, so it skips that page and begins, publishing
                  to the session the tick put this device on. */}
              <View style={styles.inviteActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={joinedSession ? `Start moving with ${joinedSession.withName ?? "your friend"}` : "Start moving"}
                  /**
                   * The name travels as a route param, the session through storage.
                   *
                   * Two different lifetimes: the companion's name is only needed to
                   * label THIS recording, which is what `with` does on the track
                   * screen — the same param the start page passes. The session id has
                   * to outlive the screen, so it is stored (see `walkSession.ts`).
                   */
                  onPress={() =>
                    router.push(
                      joinedSession
                        ? { pathname: "/move/track", params: joinedSession.withName ? { with: joinedSession.withName } : {} }
                        : "/move/start"
                    )
                  }
                  style={({ pressed }) => [styles.inviteAction, { backgroundColor: accent.primary, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Icon name="walk" size={16} color={palette.white} weight="bulk" />
                  <AppText variant="button" color={palette.white} numberOfLines={1}>
                    Move Now
                  </AppText>
                </Pressable>
              </View>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.totalHead}>
            {/* Kilometres always, with the unit at half the number's size —
                the same readout the tracking screens use. */}
            <AppText color={palette.ink} style={styles.total} numberOfLines={1}>
              {(Math.max(0, move.totalDistanceM) / 1000).toFixed(1)}
              <AppText color={palette.ink} style={styles.totalUnit}>
                {" km"}
              </AppText>
            </AppText>
            {/* Under the figure, like the two windows below it — the number
                arrives first and the label says what it counts. */}
            <AppText variant="bodySmall" color={palette.muted} style={styles.totalLabel}>
              All time
            </AppText>
          </View>

          {/* Today and the two rolling windows, straight under the all-time
              figure. Four distances of the same kind, shortest span first —
              reading them as one block is the point, and at the foot of the page
              the smaller ones were a footnote to a number nobody could still
              see. */}
          <View style={styles.periods}>
            {[
              { label: "Today", metres: periodTotals.today },
              { label: "Last 7 days", metres: periodTotals.week },
              { label: "Last 30 days", metres: periodTotals.month }
            ].map((period) => (
              <View key={period.label} style={styles.period}>
                <AppText color={palette.ink} style={styles.periodValue} numberOfLines={1}>
                  {(period.metres / 1000).toFixed(1)}
                  <AppText color={palette.ink} style={styles.periodUnit}>
                    {" km"}
                  </AppText>
                </AppText>
                <AppText variant="caption" color={palette.muted}>
                  {period.label}
                </AppText>
              </View>
            ))}
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
              {lastSevenDays.map((day, index) => {
                const label = formatRelativeDate(day.date, move.todayKey);
                /* Rules rather than cards. Seven raised plates for seven days of
                   the same week read as seven separate things; the week is one
                   thing, and a line between its days is all that is needed to
                   tell them apart. */
                const rule =
                  index === 0 ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline };
                const walked = day.walks.length > 0;

                const body = (
                  <>
                    {/* No `numberOfLines`: "August 10, 2026" is the row's only
                        real content and an ellipsis in the middle of a date
                        makes it unreadable. */}
                    {/* A day with nothing recorded steps back: the date is still
                        there to be read, but it does not ask to be. */}
                    <AppText
                      variant="bodySmall"
                      color={
                        day.distanceMeters > 0 ? (day.date === move.todayKey ? palette.ink : palette.body) : palette.muted
                      }
                      style={styles.dayDate}
                    >
                      {label}
                    </AppText>

                    {/* One badge carrying the whole day.
                        Distance and time in the same pill rather than a figure
                        floating between the date and it: they are two readings
                        of one outing, and split apart the row read as a table.

                        A day with nothing says so rather than sitting blank:
                        "No activity" is a fact about the day, and a gap you can
                        see is the point of listing every one of them. */}
                    {day.distanceMeters > 0 ? (
                      <View style={[styles.dayBadge, { backgroundColor: accent.soft }]}>
                        <AppText variant="caption" color={accent.glyph} style={styles.dayBadgeLabel}>
                          {(day.distanceMeters / 1000).toFixed(1)} km
                          {day.activeMinutes > 0 ? ` · ${formatMinutes(day.activeMinutes)}` : ""}
                        </AppText>
                      </View>
                    ) : (
                      <View style={[styles.dayBadge, { backgroundColor: alpha(palette.danger, "1F") }]}>
                        <AppText variant="caption" color={palette.danger} style={styles.dayBadgeLabel}>
                          No activity
                        </AppText>
                      </View>
                    )}
                  </>
                );

                if (!walked) {
                  return (
                    <View key={day.date} style={[styles.dayRow, rule]}>
                      {body}
                    </View>
                  );
                }

                return (
                  <Pressable
                    key={day.date}
                    accessibilityRole="button"
                    accessibilityLabel={
                      day.walks.length === 1
                        ? `${label}, open the walk you recorded`
                        : `${label}, ${day.walks.length} recorded walks`
                    }
                    onPress={() => openDay(day.walks)}
                    style={({ pressed }) => [styles.dayRow, rule, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    {body}
                  </Pressable>
                );
              })}
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
  // No card. The figure is the page talking, like the challenge headline it
  // stands in for — a plate around it made the walk look like an object on the
  // screen rather than the thing the screen is about.
  movingCard: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingTop: spacing.md
  },
  movingChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill
  },
  movingChipLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  movingValue: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 62,
    lineHeight: 72
  },
  // Half the figure, as everywhere else the two appear together.
  movingUnit: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 31
  },
  movingWith: {
    // Inset off both edges: the list is a note about the walk, not a section of
    // the page, and at full width it read as one.
    width: "75%",
    paddingTop: spacing.sm
  },
  movingWithRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48
  },
  movingWithFallback: {
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: radius.pill
  },
  movingWithName: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 14,
    lineHeight: 19
  },
  invite: {
    alignItems: "center",
    gap: spacing.xs,
    // Clear of Lumo above it. The scene inset drops the block below the art,
    // but the headline is a 34pt serif and landing it straight off his feet
    // read as a caption on the picture rather than as the page's own opening.
    paddingTop: spacing.lg
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
  inviteCarousel: {
    gap: spacing.xs,
    /**
     * Air above the deck, on top of the block's own 8pt stack gap.
     *
     * The blurb it follows is centred prose and the deck is a control: at the bare
     * gap the first invitation sat against the last line of copy and read as part of
     * the same paragraph. This is the one break on the page between what it is
     * saying and what it is asking.
     */
    marginTop: spacing.sm,
    alignSelf: "stretch"
  },
  /**
   * Escapes the screen's gutter so a card can be swiped in from the edge, and the
   * content puts the gutter back — the same full-bleed trick the group roll call
   * uses. Without it the deck would stop dead at the margin, which reads as a list
   * that has ended rather than one that carries on.
   */
  inviteCarouselScroll: {
    marginHorizontal: -layout.screenPaddingX
  },
  inviteCarouselContent: {
    flexDirection: "row",
    gap: spacing.xs
  },
  inviteCarouselHint: {
    textAlign: "center"
  },
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
    // Air above the figure, none under it: the label belongs to the number it
    // sits below, so the two are set as one block with the space outside them.
    gap: 0,
    paddingTop: spacing.md
  },
  total: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 58,
    lineHeight: 68,
    textAlign: "center"
  },
  totalUnit: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 29
  },
  totalLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  periods: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  period: {
    flex: 1,
    alignItems: "center",
    gap: 2
  },
  periodValue: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 26,
    lineHeight: 32
  },
  // Half the figure, as everywhere else the two sit together.
  periodUnit: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 13
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
    // Inset off both edges: the week is a note under the headline figure, and
    // at full width it competed with it. Wide enough that a full date and its
    // two figures fit on one line.
    width: "88%",
    alignSelf: "center",
    paddingTop: spacing.xxs
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44
  },
  dayDate: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold
  },
  dayBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill
  },
  dayBadgeLabel: {
    fontFamily: fontFamilies.lexendSemiBold
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
