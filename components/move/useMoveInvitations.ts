import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import React from "react";
import { Alert, AppState, Linking } from "react-native";
import { useMove } from "@/context/MoveContext";
import { friendsService, type Friendship } from "@/lib/friends";
import { START_REFUSAL_COPY } from "@/lib/move/activeChallenge";
import { challengeClient, onMoveInvitesChanged, type MoveInvite, type WalkInvite } from "@/lib/move/challengeClient";
import { MOVE_WITH_FRIENDS_ENABLED } from "@/lib/move/gating";
import { clearWalkSession, loadWalkSession, saveWalkSession } from "@/lib/move/walkSession";
import { notificationsPermitted, requestNotificationPermissions } from "@/lib/notifications";

/** A shared move this device has agreed to but not started yet. */
export type JoinedSession = { sessionId: string | null; withName?: string };

/**
 * Everything the Move tab knows about OTHER PEOPLE: friends, the two kinds of
 * invitation, the session a ticked walk invite put this device on, and whether a
 * banner can reach it when the next one lands.
 *
 * All of it sits behind `MOVE_WITH_FRIENDS_ENABLED`. While company is off nothing
 * here touches the network and every list stays empty, so the social pieces of
 * the screen render nothing on their own — no flag checks at the render sites.
 */
export function useMoveInvitations() {
  const move = useMove();
  const [friends, setFriends] = React.useState<Friendship[]>([]);
  /** Challenges friends have asked this account to join. Server-only — not Move state. */
  const [invites, setInvites] = React.useState<MoveInvite[]>([]);
  /** Invitations to an ordinary move happening right now; they expire with it. */
  const [walkInvites, setWalkInvites] = React.useState<WalkInvite[]>([]);
  /** The invite being answered, so its buttons hold still. */
  const [answering, setAnswering] = React.useState<string | null>(null);
  /** Read from storage on every visit — the promise outlives this tab (`walkSession.ts`). */
  const [joinedSession, setJoinedSession] = React.useState<JoinedSession | null>(null);
  /** Null while unknown, so nothing is claimed before the answer. */
  const [notifyOn, setNotifyOn] = React.useState<boolean | null>(null);

  /**
   * Both lists, loaded independently: one failing (e.g. a database missing the
   * sessions migration) must not blank the other. A failed fetch keeps the old
   * list — empty would read as "no invitations", which is a different statement.
   */
  const loadInvites = React.useCallback(async () => {
    if (!MOVE_WITH_FRIENDS_ENABLED) {
      return;
    }

    const [challenges, walks] = await Promise.all([
      challengeClient.listInvites().catch(() => null),
      challengeClient.listWalkInvites().catch(() => null)
    ]);

    if (challenges) {
      setInvites(challenges);
    }

    if (walks) {
      setWalkInvites(walks);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (!MOVE_WITH_FRIENDS_ENABLED) {
        return;
      }

      let active = true;

      friendsService
        .listFriends()
        .then((list) => active && setFriends(list))
        .catch(() => undefined);
      void loadInvites();
      void notificationsPermitted().then((granted) => active && setNotifyOn(granted));
      void loadWalkSession().then(
        (stored) => active && setJoinedSession(stored ? { sessionId: stored.sessionId, withName: stored.withName } : null)
      );

      return () => {
        active = false;
      };
    }, [loadInvites])
  );

  /**
   * Live as well as on focus: realtime rings while the tab is already open, and
   * the foreground check covers a socket that died while the phone slept.
   */
  React.useEffect(() => {
    if (!MOVE_WITH_FRIENDS_ENABLED) {
      return;
    }

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

  /** A face for each companion name a walk stored; no match falls back to a glyph. */
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

  /** The name to show for a friend's profile id. */
  const friendName = React.useCallback(
    (profileId: string | undefined) => {
      const friend = friends.find((entry) => entry.profile.id === profileId);

      return friend?.profile.nickname || friend?.profile.lumoId || "A friend";
    },
    [friends]
  );

  const friendAvatar = React.useCallback(
    (profileId: string | undefined) => friends.find((entry) => entry.profile.id === profileId)?.profile.avatar,
    [friends]
  );

  /**
   * Ticks a walk invitation, or unticks it — a radio across the deck.
   *
   * The tick lands at once and is reverted only if the server refuses: waiting on
   * two round trips made the row look dead on a slow connection. Ticking takes the
   * place and stores the session (which is what makes "Move Now" publish to it);
   * unticking gives it back.
   */
  async function toggleWalkInvite(invite: WalkInvite) {
    if (answering) {
      return;
    }

    setAnswering(invite.inviteId);

    const snapshot = walkInvites;
    const nextAccepted = !invite.accepted;

    setWalkInvites((current) =>
      current.map((entry) => ({
        ...entry,
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

      // One at a time: give back the previously ticked place first, so the server
      // agrees with the single stored session.
      const previous = walkInvites.find((entry) => entry.accepted && entry.inviteId !== invite.inviteId);

      if (previous) {
        await challengeClient.undoWalkInvite(previous);
      }

      if (!(await challengeClient.respondToWalkInvite(invite, true))) {
        setWalkInvites(snapshot);
        Alert.alert("Could not join", "That move may have finished. Pull to refresh and see.");

        return;
      }

      const withName = friendName(invite.senderId);

      await saveWalkSession({ sessionId: invite.sessionId, owner: false, withName });
      setJoinedSession({ sessionId: invite.sessionId, withName });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } finally {
      setAnswering(null);
    }
  }

  /** A decline, not an untick: marked declined so it does not return on refresh. */
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

  /** iOS asks only once per install; after that, Settings is the only way to say yes. */
  async function enableNotifications() {
    if ((await requestNotificationPermissions()) === "granted") {
      setNotifyOn(true);

      return;
    }

    void Linking.openSettings().catch(() => undefined);
  }

  return {
    invites,
    walkInvites,
    invitationCount: invites.length + walkInvites.length,
    answering,
    joinedSession,
    /** Only someone with friends has anything to be notified about. */
    showNotifyPrompt: notifyOn === false && friends.length > 0,
    avatarByName,
    friendName,
    friendAvatar,
    toggleWalkInvite,
    dismissWalkInvite,
    answerInvite,
    enableNotifications
  };
}

export type MoveInvitations = ReturnType<typeof useMoveInvitations>;
