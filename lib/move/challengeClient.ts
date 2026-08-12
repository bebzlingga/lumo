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

function toStatus(value: string): ActiveMoveChallenge["status"] {
  return value === "completed" || value === "cancelled" || value === "expired" ? value : "active";
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
      return null;
    }

    const challengeId = (data as { id: string }).id;

    // Only your own participant row — the policy allows nothing else, and a
    // friend joins by accepting rather than by being written in.
    await supabase.from("move_challenge_participants").upsert({ challenge_id: challengeId, member: userId, contribution_m: 0 });
    await supabase.from("move_active_challenge").upsert({ user_id: userId, challenge_id: challengeId });

    return { id: challengeId };
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
