import { ensureSignedIn, isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { ActiveMoveChallenge, MoveParticipant, TeamGoal } from "@/lib/move/activeChallenge";
import { findFamily, type MoveChallengeVariant } from "@/lib/move/challengeDefs";

/**
 * The server side of Move challenges.
 *
 * ## What leaves the device
 *
 * For a team challenge: one number per person — the metres they have covered
 * since it started — plus the challenge's own definition ids. Nothing else. No
 * daily summaries, no step history, no times of day. `publishContribution`
 * computes the aggregate LOCALLY and sends the total, which is why the whole
 * feature can be sociable without sharing a movement history.
 *
 * Solo challenges send nothing at all beyond the `move_active_challenge` row
 * that reserves the slot, and that row holds no distance.
 *
 * ## Everything degrades
 *
 * Every call returns a safe empty value when Supabase is unconfigured or the
 * device is offline, matching `lib/friends.ts`. A team challenge then behaves
 * as a solo one locally — your own progress still counts, the others simply do
 * not arrive — which is a far better failure than refusing to start.
 */

type ChallengeRow = {
  id: string;
  variant_id: string;
  milestone_id: string;
  owner: string;
  status: string;
  started_at: string;
  ends_at: string | null;
  completed_at: string | null;
};

type ParticipantRow = {
  challenge_id: string;
  member: string;
  left_at: string | null;
  contribution_m: number;
};

/**
 * A challenge somebody has asked you to join, with everything the card needs to
 * describe it.
 *
 * The inviter is an ID, not a name: names are not stored server-side (see
 * `fetch`), so the screen fills it in from the friend list it already has. The
 * variant id is resolved against `challengeDefs` the same way — the ladder is
 * client-side config, and sending its titles over the wire would let a stale
 * build disagree with a fresh one about what "10k-timed" means.
 */
export type MoveInvite = {
  challengeId: string;
  inviterId: string;
  variantId: string;
  milestoneId: string;
  startedAt: string;
  endsAt: string | null;
  teamGoal: TeamGoal;
  /** The challenge sits on a Plus rung, so joining needs the invitee's own. */
  /** A 25K-and-above rung: joining it takes the joiner's own Pro purchase. */
  needsPro: boolean;
  invitedAt: string;
};

/**
 * An invitation to join somebody's ordinary move, right now.
 *
 * Thinner than `MoveInvite` because the thing itself is thinner: no target, no
 * deadline, no team goal — just who asked, what they are doing, and when they set
 * out. The card works out "5 minutes ago" from `startedAt`; a walk you are asked
 * onto an hour late is a different proposition from one starting now.
 */
export type WalkInvite = {
  inviteId: string;
  /**
   * The session to join, or null for an invitation with nothing to join.
   *
   * Null happens two ways, and both are ordinary: the sender's device could not
   * open a session (offline, or a database without the sessions migration), or the
   * row predates sessions entirely. Either way the friend still said "I am going
   * out with you" and the card still shows it — it simply has no Join.
   */
  sessionId: string | null;
  senderId: string;
  activityType: "walk" | "run";
  startedAt: string;
  invitedAt: string;
  /**
   * Already said yes, and not out of the door yet.
   *
   * An accepted invite STAYS on the list rather than vanishing: agreeing to walk
   * with somebody is a state you might change your mind about, and a card that
   * disappears on the tap leaves nothing to change it from. The card wears a tick
   * and an Undo; `move_walk_invites.status` is where it lives.
   */
  accepted: boolean;
};

type InviteRow = {
  challenge_id: string;
  inviter: string;
  created_at: string;
};

/**
 * How long a `move_presence` row is believed.
 *
 * Six hours: longer than any walk anybody takes, short enough that a row left
 * behind by a killed app frees the person up the same day. The row is deleted
 * when a walk ends; this is what covers the case where nothing got to run.
 */
const PRESENCE_STALE_MS = 6 * 60 * 60 * 1000;

function toStatus(value: string): ActiveMoveChallenge["status"] {
  return value === "completed" || value === "cancelled" || value === "expired" ? value : "active";
}

/**
 * "The invite list has changed" — nothing more.
 *
 * The realtime layer (`lib/realtime.ts`) hears the row land and rings this; the
 * Move tab listens and refetches. Deliberately carries no payload: the screen
 * already knows how to load invites, and a listener that trusted a pushed row
 * would show one the server might have withdrawn a second later.
 *
 * The same shape as `onGroupMembershipChanged` in `lib/friends.ts`, for the same
 * reason — realtime cannot call a screen's setState, and a context for one
 * boolean is more machinery than a set of callbacks.
 */
const inviteListeners = new Set<() => void>();

export function onMoveInvitesChanged(listener: () => void): () => void {
  inviteListeners.add(listener);

  return () => {
    inviteListeners.delete(listener);
  };
}

export function notifyMoveInvitesChanged(): void {
  inviteListeners.forEach((listener) => listener());
}

export const challengeClient = {
  /**
   * Reserves the one slot and files the challenge.
   *
   * `move_active_challenge` is written LAST and is the thing that can fail: its
   * primary key is the single-active rule, so a second device racing this gets
   * a duplicate-key error rather than a second challenge. The caller treats a
   * failure here as "someone else got there first".
   */
  async create(input: {
    variant: MoveChallengeVariant;
    startedAt: string;
    endsAt: string | null;
    /** Friend profile ids. Excludes the owner, who is added here. */
    friendIds: string[];
    /** How the team splits the distance — see `TeamGoal`. */
    teamGoal?: TeamGoal;
  }): Promise<{ id: string } | null> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return null;
    }

    const { data, error } = await supabase
      .from("move_challenges")
      .insert({
        variant_id: input.variant.id,
        milestone_id: input.variant.milestoneId,
        owner: userId,
        started_at: input.startedAt,
        ends_at: input.endsAt,
        team_goal: input.teamGoal ?? "each",
        /**
         * Whether this rung is behind Pro, sent so the SERVER can hold the gate.
         *
         * The column defaults to false, and leaving it to that default is how a
         * Pro challenge used to insert as a free one — the policy checks
         * `is_pro = false or has_active_subscription()`, so an unflagged row
         * sails past a check that exists precisely because the client's own
         * refusal is in a build somebody can replace. The flag travels with the
         * definition (`challengeDefs.ts`), so a new Pro rung needs no migration.
         */
        is_pro: findFamily(input.variant.milestoneId)?.pro ?? false
      })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn("[challengeClient.create] failed — no server challenge, so no invites", error);
      }

      return null;
    }

    const challengeId = (data as { id: string }).id;

    // Only your own participant row — the policy allows nothing else, and a
    // friend joins by accepting rather than by being written in.
    await supabase.from("move_challenge_participants").upsert({ challenge_id: challengeId, member: userId, contribution_m: 0 });
    await supabase.from("move_active_challenge").upsert({ user_id: userId, challenge_id: challengeId });

    // And now the friends are actually TOLD. This list used to be accepted and
    // dropped: the roster shaped the challenge locally and nobody else ever heard
    // about it. Fire-and-forget, after the slot is reserved — an invite to a
    // challenge that failed to insert would be an invitation to nothing.
    if (input.friendIds.length > 0) {
      await challengeClient.invite(challengeId, input.friendIds);
    }

    return { id: challengeId };
  },

  /**
   * Asks friends to join a challenge you own.
   *
   * One upsert rather than a loop of inserts: inviting the same friend twice is
   * an ordinary thing to do (they declined, you ask again after a word about it),
   * and the primary key means the second ask updates the first rather than
   * stacking a duplicate in their list. `status` is reset with it, which is what
   * makes a re-invite arrive as pending again.
   *
   * Every refusal is silent by design — an id that is not a friend, or a
   * challenge that is not yours, is rejected by policy rather than reported. The
   * inviter's screen has nothing useful to say about it and the attempt should
   * not fail the challenge it belongs to.
   */
  async invite(challengeId: string, friendIds: string[]): Promise<void> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId || friendIds.length === 0) {
      return;
    }

    const invitees = friendIds.filter((id) => id && id !== userId);

    if (invitees.length === 0) {
      return;
    }

    /**
     * A PLAIN INSERT, and this is load-bearing.
     *
     * It was an upsert on `(challenge_id, invitee)`, which PostgREST compiles to
     * `insert ... on conflict do update` — and Postgres requires the UPDATE policy
     * to be satisfiable for that statement, not just the insert one. The UPDATE
     * policy here is `invitee = auth.uid()`, because answering an invite is the
     * invitee's act. The INVITER can never satisfy it, so RLS refused the write
     * outright: the challenge was created, the friends were never invited, and
     * nothing said why.
     *
     * The only thing the upsert bought was re-inviting the same friend to the same
     * challenge, which the duplicate below handles just as well.
     */
    const { error } = await supabase.from("move_challenge_invites").insert(
      invitees.map((id) => ({
        challenge_id: challengeId,
        invitee: id,
        inviter: userId,
        status: "pending"
      }))
    );

    // 23505 is a unique violation: this friend already holds an invite to this
    // challenge, which is the outcome the call wanted anyway.
    if (error && error.code !== "23505" && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn("[challengeClient.invite] failed", error);
    }
  },

  /**
   * Opens a shared ordinary move and asks friends onto it.
   *
   * Returns the session id, which the caller keeps for as long as it is walking —
   * it is what every later publish and read is keyed on. Null when there is no
   * server to open one on, and the walk simply goes ahead alone: a session is what
   * makes a walk shareable, never what makes it possible.
   *
   * The owner's own participant row is written here rather than on the first
   * publish, so the session has somebody on it from the moment it exists — a
   * joiner reading it a second later sees a walk in progress rather than an empty
   * record.
   */
  async startWalkTogether(friendIds: string[], activityType: "walk" | "run"): Promise<string | null> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return null;
    }

    const { data, error } = await supabase
      .from("move_walk_sessions")
      .insert({ owner: userId, activity_type: activityType })
      .select("id")
      .maybeSingle();

    /**
     * No session — so send the invite WITHOUT one rather than nothing at all.
     *
     * This is the path a database that has not run the sessions migration takes,
     * and the path an offline device takes. Returning early here meant "bring
     * friends" silently did nothing: the invites are sent from inside this
     * function, so a failed session took the notification down with it and the
     * friend never heard about the walk at all.
     *
     * A sessionless invite is the notification-only invitation this feature
     * started as. The friend is told, there is simply no Join on it.
     */
    if (error || !data) {
      await challengeClient.inviteToWalk(friendIds, null);

      return null;
    }

    const sessionId = (data as { id: string }).id;

    await supabase.from("move_walk_participants").upsert({ session_id: sessionId, member: userId, distance_m: 0 });
    await challengeClient.inviteToWalk(friendIds, sessionId);

    return sessionId;
  },

  /** Publishes this device's distance on a shared move. Safe to call repeatedly. */
  async publishWalkDistance(sessionId: string, meters: number): Promise<void> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return;
    }

    await supabase.from("move_walk_participants").upsert({
      session_id: sessionId,
      member: userId,
      distance_m: Math.max(0, Math.round(meters)),
      updated_at: new Date().toISOString()
    });
  },

  /** Everyone else on a shared move, with what they have covered. */
  async fetchWalkPeers(sessionId: string): Promise<{ userId: string; distanceM: number }[]> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return [];
    }

    const { data } = await supabase
      .from("move_walk_participants")
      .select("member, distance_m, left_at")
      .eq("session_id", sessionId);

    return ((data ?? []) as { member: string; distance_m: number; left_at: string | null }[])
      .filter((row) => row.member !== userId && row.left_at === null)
      .map((row) => ({ userId: row.member, distanceM: Number(row.distance_m) || 0 }));
  },

  /**
   * Closes a shared move.
   *
   * The owner stamps the session; a joiner only stamps their own row. Both end up
   * off the walk, and the record of who covered what stays — the same call
   * `challengeClient.leave` makes about a challenge, for the same reason.
   */
  async leaveWalkTogether(sessionId: string): Promise<void> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return;
    }

    await supabase
      .from("move_walk_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("session_id", sessionId)
      .eq("member", userId);

    // Only the owner may write this, and a failure is nothing: an unstamped
    // session with everybody gone reads as finished anyway.
    await supabase
      .from("move_walk_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("owner", userId)
      .is("ended_at", null);

    /**
     * The invitations are LEFT ALONE, on purpose.
     *
     * Stamping the session is enough to take them off everybody's Move tab —
     * `listWalkInvites` drops any invite whose session has ended — and that is all
     * that should happen to them. The rows are the record of who asked whom and
     * whether they came, which is the history of walking together; deleting them to
     * tidy a list would trade that for nothing a filter does not already do.
     *
     * Same reasoning as the participant rows, which keep everyone's metres.
     */
  },

  /**
   * Invitations to walk together that are still waiting for an answer.
   *
   * Only ones with a session to join, and only sessions still open. A
   * notification-only invite from before sessions existed has `session_id` null
   * and is filtered out here — it was never joinable, and offering a Join button
   * for it would be offering nothing.
   *
   * Stale sessions are dropped on the same reasoning as `PRESENCE_STALE_MS`: an
   * owner whose app was killed never stamps `ended_at`, and "join Naj's walk from
   * last Tuesday" is not an invitation.
   */
  async listWalkInvites(): Promise<WalkInvite[]> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return [];
    }

    const { data: inviteRows } = await supabase
      .from("move_walk_invites")
      .select("id, sender, session_id, created_at, status")
      .eq("recipient", userId)
      // Accepted ones too: the card stays, wearing a tick, until the walk is over
      // or the answer is undone. Declined ones are gone for good.
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false });

    const invites = (inviteRows ?? []) as {
      id: string;
      sender: string;
      session_id: string | null;
      created_at: string;
      status: string;
    }[];

    if (invites.length === 0) {
      return [];
    }

    const sessionIds = invites.map((row) => row.session_id).filter((id): id is string => Boolean(id));

    // Only asked for if there is something to ask about. A list of purely
    // sessionless invites needs no session lookup at all.
    const { data: sessionRows } = sessionIds.length
      ? await supabase.from("move_walk_sessions").select("id, activity_type, started_at, ended_at").in("id", sessionIds)
      : { data: [] };

    const byId = new Map(
      ((sessionRows ?? []) as { id: string; activity_type: string; started_at: string; ended_at: string | null }[]).map((row) => [
        row.id,
        row
      ])
    );

    return invites.flatMap<WalkInvite>((row) => {
      const session = row.session_id ? byId.get(row.session_id) : undefined;

      /**
       * A sessionless invite is listed on its own terms.
       *
       * It used to be filtered out, which is how a friend could get the
       * notification and then find nothing in the tab — the row was real, it just
       * had nothing to join. It is judged on its own age instead of a session's.
       */
      if (!session) {
        if (Date.now() - Date.parse(row.created_at) > PRESENCE_STALE_MS) {
          return [];
        }

        return [
          {
            inviteId: row.id,
            sessionId: null,
            senderId: row.sender,
            activityType: "walk" as const,
            startedAt: row.created_at,
            invitedAt: row.created_at,
            accepted: row.status === "accepted"
          }
        ];
      }

      // A finished or long-abandoned walk is not an invitation to anything.
      if (session.ended_at || Date.now() - Date.parse(session.started_at) > PRESENCE_STALE_MS) {
        return [];
      }

      return [
        {
          inviteId: row.id,
          sessionId: session.id,
          senderId: row.sender,
          activityType: session.activity_type === "run" ? ("run" as const) : ("walk" as const),
          startedAt: session.started_at,
          invitedAt: row.created_at,
          accepted: row.status === "accepted"
        }
      ];
    });
  },

  /**
   * Answers one.
   *
   * Accepting writes the participant row FIRST, for the same reason a challenge
   * invite joins before it records the answer: the participant write is the one
   * the database can refuse, and an invite marked accepted by somebody who is not
   * on the walk would be a dead end with no way back to it.
   */
  async respondToWalkInvite(invite: WalkInvite, accept: boolean): Promise<boolean> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return false;
    }

    // Only a session can be joined. A sessionless invite is acknowledged and
    // nothing else — the answer just clears it off the tab.
    if (accept && invite.sessionId) {
      /**
       * `left_at: null` matters on a RE-accept.
       *
       * Undoing stamps the row rather than deleting it, so accepting again has to
       * clear that stamp or the walk would show somebody who is on it as having
       * left. `distance_m` is deliberately left out of the upsert's intent — it is
       * only zero on a first join, and the very next publish overwrites it anyway.
       */
      const { error } = await supabase
        .from("move_walk_participants")
        .upsert({ session_id: invite.sessionId, member: userId, distance_m: 0, left_at: null });

      if (error) {
        return false;
      }
    }

    const { error } = await supabase
      .from("move_walk_invites")
      .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
      .eq("id", invite.inviteId)
      .eq("recipient", userId);

    return !error;
  },

  /**
   * Takes an acceptance back.
   *
   * Not the same as declining: the invite returns to PENDING, so the card comes
   * back offering Accept rather than disappearing. Somebody who taps Undo has
   * changed their mind about coming now, not about the friend.
   *
   * The participant row is stamped rather than deleted, exactly as leaving a
   * challenge is — whatever was covered before the change of mind stays counted,
   * and the other side's screen does not lose a number it already showed.
   */
  async undoWalkInvite(invite: WalkInvite): Promise<boolean> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return false;
    }

    if (invite.sessionId) {
      await supabase
        .from("move_walk_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("session_id", invite.sessionId)
        .eq("member", userId);
    }

    const { error } = await supabase
      .from("move_walk_invites")
      .update({ status: "pending", responded_at: null })
      .eq("id", invite.inviteId)
      .eq("recipient", userId);

    return !error;
  },

  /**
   * Tells friends you have set out on an ordinary move with them.
   *
   * Not the same thing as `invite` above, and deliberately a different table: a
   * challenge invitation commits somebody to a target over days, and this asks
   * whether they want to come out NOW.
   *
   * `sessionId` is what makes it answerable — with one, the friend's Move tab
   * shows Join and Decline and accepting puts them on the same session. Without
   * one it is the notification-only invite this started as, which is what a row
   * written before sessions existed still means.
   *
   * The row is the message: a webhook turns it into a push while their app is
   * closed and the realtime channel banners it while it is open. Fire-and-forget
   * and never fatal — a walk must start whether or not anybody could be told, so
   * the caller does not await an answer it would have nothing to do with.
   */
  async inviteToWalk(friendIds: string[], sessionId?: string | null): Promise<void> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId || friendIds.length === 0) {
      return;
    }

    const recipients = friendIds.filter((id) => id && id !== userId);

    if (recipients.length === 0) {
      return;
    }

    const { error } = await supabase
      .from("move_walk_invites")
      .insert(recipients.map((id) => ({ sender: userId, recipient: id, session_id: sessionId ?? null })));

    if (!error) {
      return;
    }

    /**
     * RETRY WITHOUT THE SESSION COLUMN.
     *
     * This is not defensive noise — it is a regression fix. Adding `session_id` to
     * the insert made the whole write fail on a database that has not run the
     * sessions migration: PostgREST rejects an unknown column outright, so an
     * invitation that used to arrive as a notification stopped being sent AT ALL.
     * Nothing was told, and nothing said why.
     *
     * The notification is the part that matters most and the part that has always
     * worked; the session link is an upgrade on top of it. So the write is tried
     * with it and, if the column is not there, again without — a sessionless invite,
     * which is exactly what one of these was before sessions existed.
     */
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn("[inviteToWalk] insert with session_id failed, retrying without", error);
    }

    await supabase.from("move_walk_invites").insert(recipients.map((id) => ({ sender: userId, recipient: id })));
  },

  /**
   * Invitations waiting for an answer, newest first.
   *
   * Two queries rather than one embedded select: PostgREST can join these, but
   * the join comes back shaped by the relationship name, which is one more thing
   * to keep in step with the schema than a second `in` lookup is worth.
   *
   * Challenges that are no longer live are filtered out here rather than shown
   * and then refused — an invite to a challenge the owner has already finished or
   * abandoned is not an invite, and leaving it on screen would offer a Join
   * button that cannot work.
   */
  async listInvites(): Promise<MoveInvite[]> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return [];
    }

    const { data: inviteRows } = await supabase
      .from("move_challenge_invites")
      .select("challenge_id, inviter, created_at")
      .eq("invitee", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const invites = (inviteRows ?? []) as InviteRow[];

    if (invites.length === 0) {
      return [];
    }

    const { data: challengeRows } = await supabase
      .from("move_challenges")
      .select("id, variant_id, milestone_id, started_at, ends_at, team_goal, is_pro, status")
      .in(
        "id",
        invites.map((row) => row.challenge_id)
      );

    const byId = new Map(
      ((challengeRows ?? []) as (ChallengeRow & { team_goal: string; is_pro: boolean })[]).map((row) => [row.id, row])
    );

    return invites.flatMap((row) => {
      const challenge = byId.get(row.challenge_id);

      if (!challenge || toStatus(challenge.status) !== "active") {
        return [];
      }

      // A deadline that has already passed makes the challenge unwinnable, and
      // `status` will not say so until somebody's device notices and files it.
      if (challenge.ends_at && Date.parse(challenge.ends_at) <= Date.now()) {
        return [];
      }

      return [
        {
          challengeId: challenge.id,
          inviterId: row.inviter,
          variantId: challenge.variant_id,
          milestoneId: challenge.milestone_id,
          startedAt: challenge.started_at,
          endsAt: challenge.ends_at,
          teamGoal: challenge.team_goal === "shared" ? "shared" : "each",
          needsPro: Boolean(challenge.is_pro),
          invitedAt: row.created_at
        }
      ];
    });
  },

  /**
   * Answers one.
   *
   * Accepting JOINS FIRST and only then records the answer, because the join is
   * the part that can fail — the single-active rule, or the subscription check on
   * a Plus challenge. Writing 'accepted' first would leave an invite marked
   * answered by somebody who is not on the challenge, and no way back to it.
   */
  async respondToInvite(challengeId: string, accept: boolean): Promise<boolean> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return false;
    }

    if (accept && !(await challengeClient.join(challengeId))) {
      return false;
    }

    const { error } = await supabase
      .from("move_challenge_invites")
      .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
      .eq("challenge_id", challengeId)
      .eq("invitee", userId);

    return !error;
  },

  /** Takes part in a challenge someone else started. Refused if a slot is taken. */
  async join(challengeId: string): Promise<boolean> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return false;
    }

    const { error: slotError } = await supabase.from("move_active_challenge").insert({ user_id: userId, challenge_id: challengeId });

    // A duplicate key here IS the single-active rule firing. Nothing else to
    // interpret: this person is already on something.
    if (slotError) {
      return false;
    }

    const { error } = await supabase
      .from("move_challenge_participants")
      .upsert({ challenge_id: challengeId, member: userId, contribution_m: 0 });

    return !error;
  },

  /**
   * Publishes this member's distance.
   *
   * An UPSERT on `(challenge_id, member)`, which is what makes it safe to call
   * on every sync: the row is replaced, never added to, so ten refreshes leave
   * one contribution holding the current total rather than ten rows summing to
   * ten times the truth.
   */
  async publishContribution(challengeId: string, meters: number): Promise<void> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return;
    }

    await supabase.from("move_challenge_participants").upsert({
      challenge_id: challengeId,
      member: userId,
      contribution_m: Math.max(0, meters),
      updated_at: new Date().toISOString()
    });
  },

  /** The challenge and everyone on it, or null. */
  async fetch(challengeId: string): Promise<{ challenge: ChallengeRow; participants: MoveParticipant[] } | null> {
    if (!isSupabaseConfigured || !(await ensureSignedIn())) {
      return null;
    }

    const [{ data: challenge }, { data: rows }] = await Promise.all([
      supabase.from("move_challenges").select("*").eq("id", challengeId).maybeSingle(),
      supabase.from("move_challenge_participants").select("*").eq("challenge_id", challengeId)
    ]);

    if (!challenge) {
      return null;
    }

    return {
      challenge: challenge as ChallengeRow,
      participants: ((rows ?? []) as ParticipantRow[]).map((row) => ({
        userId: row.member,
        // Names are not stored server-side — a challenge has no business
        // holding a copy of someone's display name. The screen fills them in
        // from the friend list it already has.
        name: "A friend",
        contributionM: Number(row.contribution_m) || 0,
        leftAt: row.left_at
      }))
    };
  },

  /**
   * Steps away, freeing the slot.
   *
   * The participant row is STAMPED rather than deleted, so the contribution
   * stays and the rest of the group carries on from where it got to. Nobody's
   * kilometres vanish because somebody else lost interest.
   */
  async leave(challengeId: string): Promise<void> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return;
    }

    await supabase
      .from("move_challenge_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("challenge_id", challengeId)
      .eq("member", userId);

    await supabase.from("move_active_challenge").delete().eq("user_id", userId);
  },

  /**
   * Marks a challenge finished and frees everyone's slot.
   *
   * Guarded on `completed_at is null`, so two members finishing within the same
   * second cannot produce two stamps. Only the owner may write the challenge
   * row; the others simply see the stamp appear.
   */
  async complete(challengeId: string): Promise<void> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return;
    }

    await supabase
      .from("move_challenges")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", challengeId)
      .is("completed_at", null);

    await supabase.from("move_active_challenge").delete().eq("user_id", userId);
  },

  /**
   * Says this device is out on a move, so friends see it as busy.
   *
   * Upsert, not insert: the primary key is the user, so re-announcing on a resume
   * or after a relaunch refreshes the timestamp instead of failing. Nothing waits
   * on it — a walk that could not be announced is still a walk.
   */
  async beginPresence(activityType: "walk" | "run"): Promise<void> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return;
    }

    await supabase
      .from("move_presence")
      .upsert({ user_id: userId, activity_type: activityType, started_at: new Date().toISOString() });
  },

  /** And says it has finished. Safe to call when there was no row. */
  async endPresence(): Promise<void> {
    const userId = await ensureSignedIn();

    if (!isSupabaseConfigured || !userId) {
      return;
    }

    await supabase.from("move_presence").delete().eq("user_id", userId);
  },

  /**
   * Who among these friends cannot be asked along, and why.
   *
   * A map of reasons rather than a set of ids, because the picker prints the
   * reason under the name — "On a challenge" and "Out on a move" are different
   * facts and being told which one is the difference between a rule and a
   * mystery.
   *
   * ABSENT MEANS AVAILABLE, and every failure path returns an empty map: an
   * offline lookup must not lock a whole friend list, and the invite itself is
   * still the real check (the database refuses a second active challenge whatever
   * this said).
   *
   * Presence rows older than `PRESENCE_STALE_MS` are ignored — see the note on
   * `move_presence` in the schema. A device killed mid-walk leaves its row
   * behind, and a friend must not be unaskable for a week because of it.
   */
  async unavailableFriends(friendIds: string[]): Promise<Map<string, string>> {
    const reasons = new Map<string, string>();

    if (!isSupabaseConfigured || friendIds.length === 0 || !(await ensureSignedIn())) {
      return reasons;
    }

    const [{ data: challengeRows }, { data: presenceRows }] = await Promise.all([
      supabase.from("move_active_challenge").select("user_id").in("user_id", friendIds),
      supabase.from("move_presence").select("user_id, started_at").in("user_id", friendIds)
    ]);

    // Presence first, challenge second: being out RIGHT NOW is the more specific
    // fact, and a challenge row is often true at the same time.
    for (const row of (presenceRows ?? []) as { user_id: string; started_at: string }[]) {
      if (Date.now() - Date.parse(row.started_at) < PRESENCE_STALE_MS) {
        reasons.set(row.user_id, "Out on a move right now");
      }
    }

    for (const row of (challengeRows ?? []) as { user_id: string }[]) {
      if (!reasons.has(row.user_id)) {
        reasons.set(row.user_id, "On a challenge already");
      }
    }

    return reasons;
  },

  /**
   * Live changes to who is on a challenge and how far they have got.
   *
   * The poll behind this stays — a socket that drops is invisible, and a 30-second
   * refresh is the floor either way — but the poll alone made a shared challenge
   * feel like a page that had to be reloaded. A teammate joining, or their distance
   * landing, arrives in a second or two now.
   *
   * Carries no payload to the caller on purpose: the row that changed is not enough
   * to update a roster (names come from the friend list, and a `left_at` stamp
   * changes what everyone else's share is), so this rings and the caller re-reads
   * the whole thing.
   *
   * Returns a teardown. Safe to call when Supabase is unconfigured — it hands back
   * a no-op rather than making the caller check.
   */
  subscribeToChallenge(challengeId: string, onChange: () => void): () => void {
    if (!isSupabaseConfigured) {
      return () => undefined;
    }

    const channel = supabase
      .channel(`move-challenge-${challengeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "move_challenge_participants", filter: `challenge_id=eq.${challengeId}` },
        onChange
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  /** The same, for a shared ordinary walk. */
  subscribeToWalkSession(sessionId: string, onChange: () => void): () => void {
    if (!isSupabaseConfigured) {
      return () => undefined;
    }

    const channel = supabase
      .channel(`move-walk-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "move_walk_participants", filter: `session_id=eq.${sessionId}` },
        onChange
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  /**
   * Which of these friends already have a challenge running.
   *
   * A set rather than a map, because a missing row means FREE — someone who has
   * never opened Move has no row at all. An offline lookup therefore returns an
   * empty set and fails open: nobody is blocked from inviting a friend who was
   * actually available, and the invite itself is still the real check.
   */
  async busyFriends(friendIds: string[]): Promise<Set<string>> {
    if (!isSupabaseConfigured || friendIds.length === 0 || !(await ensureSignedIn())) {
      return new Set();
    }

    const { data } = await supabase.from("move_active_challenge").select("user_id").in("user_id", friendIds);

    return new Set(((data ?? []) as { user_id: string }[]).map((row) => row.user_id));
  }
};

export type { ChallengeRow };
export { toStatus };
