import { findVariant, type MoveChallengeVariant } from "@/lib/move/challengeDefs";
import { sumMetric } from "@/lib/move/movement";
import type { MovementSummary } from "@/lib/move/types";

/**
 * The one challenge someone is doing, and how far along it is.
 *
 * Pure and clock-free: every function takes the day or instant it is being
 * evaluated at, so the deadline and window cases are testable without freezing
 * time.
 *
 * ## Only one, ever
 *
 * The rule is enforced in three places on purpose, because each catches a
 * different failure:
 *
 *  - **Here** (`canStartChallenge`), so the UI can explain rather than fail.
 *  - **In the store**, so a stale screen cannot write a second one locally.
 *  - **In the database**, where `move_active_challenge` has `user_id` as its
 *    PRIMARY KEY — one row per person, so two devices racing cannot both win.
 *
 * A check in only the first two is a check that a second phone can walk past.
 */

export type MoveChallengeStatus = "active" | "completed" | "cancelled" | "expired";

/** One member of a team challenge, and what they have put in. */
export type MoveParticipant = {
  userId: string;
  /** Display name, stored so a team card reads correctly offline. */
  name: string;
  /** Metres contributed since the challenge started. */
  contributionM: number;
  /** Null while still taking part. */
  leftAt: string | null;
};

/**
 * How a team challenge's distance is met.
 *
 * `each` — everybody covers the full target. Four people, 100 km, four hundred
 * kilometres walked between them.
 *
 * `shared` — the target is one pot the team fills together. Four people, 100 km,
 * a hundred kilometres walked between them, roughly twenty-five each.
 *
 * Only ever set on a team challenge; solo routes have nobody to share with.
 */
export type TeamGoal = "each" | "shared";

export type ActiveMoveChallenge = {
  id: string;
  variantId: string;
  /** ISO instant. Movement before this never counts. */
  startedAt: string;
  /** ISO instant the clock runs out, or null for an open-ended challenge. */
  endsAt: string | null;
  status: MoveChallengeStatus;
  completedAt: string | null;
  /**
   * Everyone taking part, INCLUDING the owner, on a team challenge.
   *
   * Empty on a solo one rather than holding a single self-entry — a solo
   * challenge's progress comes straight from the device's own summaries, and a
   * participant row for yourself would be a second copy of the same number that
   * could disagree with it.
   */
  participants: MoveParticipant[];
  /** Set on a team challenge so a member can tell whose it is. */
  ownerId: string | null;
  /**
   * Whether the team splits the distance or each covers it. Chosen when the
   * challenge starts and fixed for its life — changing it mid-run would move
   * the finish line under everybody.
   *
   * Optional, and absent means `each`: that was the only behaviour before this
   * existed, so a challenge stored without the field is one of those.
   */
  teamGoal?: TeamGoal;
  /**
   * Days already bought back with a pause. Capped at `MAX_PAUSES`.
   *
   * Kept as a COUNT rather than a list of paused days: nothing needs to know
   * which days they were, and a count cannot drift out of step with `endsAt`,
   * which is the thing a pause actually moves.
   */
  pausesUsed: number;
};

export type ChallengeProgress = {
  challenge: ActiveMoveChallenge;
  variant: MoveChallengeVariant;
  /**
   * The metres that count toward `targetM`.
   *
   * Yours, on a solo challenge and on a team one where everybody covers the
   * full distance. On a SHARED team challenge it is the team's pooled figure,
   * because there the pot is the thing being measured — see `teamGoal`.
   */
  currentM: number;
  /**
   * The distance being measured against.
   *
   * The variant's own figure, whatever the mode: a shared challenge divides the
   * WORK rather than the target, so the team still fills the same 100 km. What
   * each person is expected to walk is `shareM`.
   */
  targetM: number;
  /**
   * One person's expected share, for the roster's rings.
   *
   * The full target when everybody covers it, and the target split across the
   * team when it is shared.
   */
  shareM: number;
  /** 0–1, clamped, against `currentM`. */
  ratio: number;
  remainingM: number;
  /** Whole days left, or null when there is no clock. Floors at zero. */
  daysLeft: number | null;
  /**
   * Whether the CHALLENGE is done.
   *
   * Solo: you reached the target. Team: it depends on `teamGoal` — `each` needs
   * **everyone** there, `shared` needs the pooled total there.
   *
   * `each` is the default, and the two are deliberately equal in what they
   * earn: both file the route and both take the badge. Splitting a distance
   * across a team is a different way of doing the same challenge, not a
   * cheaper one — the app's own framing is that showing up is the point, and a
   * team that carves 100 km into four showed up four times.
   */
  complete: boolean;
  /** True once the clock ran out short. Never true at the same time as `complete`. */
  expired: boolean;
  /** Everyone's distance added up. The measure itself when the target is shared. */
  teamM: number;
  /** How many are already there, of how many are taking part. */
  teamDone: number;
  teamSize: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many days a challenge can buy back, one at a time.
 *
 * Three is enough for the ordinary reasons a week goes wrong — illness, travel,
 * a bad few days — without turning a 7-day challenge into a 10-day one by
 * default. Past that the honest answer is to leave it and start again, which
 * costs nothing but the streak of having finished.
 */
export const MAX_PAUSES = 3;

/** The instant a challenge's clock runs out, or null for an open-ended one. */
export function challengeEndsAt(variant: MoveChallengeVariant, startedAt: string): string | null {
  if (variant.durationDays === null) {
    return null;
  }

  return new Date(new Date(startedAt).getTime() + variant.durationDays * DAY_MS).toISOString();
}

/**
 * Whether a challenge may be started.
 *
 * A domain answer rather than a boolean, so the screen can say WHY. An opaque
 * refusal is the thing that makes a rule feel like a bug.
 */
export type StartRefusal =
	| "MOVE_CHALLENGE_ALREADY_ACTIVE"
	| "MOVE_CHALLENGE_UNKNOWN_VARIANT"
	| "MOVE_CHALLENGE_NEEDS_FRIENDS"
	/**
	 * The server would not add this device to a challenge it was invited to.
	 *
	 * Its own case rather than reusing ALREADY_ACTIVE, because there are two
	 * causes and neither is knowable from here: the invitee may have picked up a
	 * challenge elsewhere since the invite arrived, or the rung needs Plus and
	 * this account does not have it (the participation policy checks that, not
	 * the client). Naming the wrong one would send somebody to cancel a challenge
	 * they do not have.
	 */
	| "MOVE_CHALLENGE_JOIN_REFUSED";

export function canStartChallenge(input: {
  active: ActiveMoveChallenge | null;
  variantId: string;
  /** Friends who have agreed to take part. Excludes the owner. */
  invitedFriendIds?: string[];
}): { ok: true; variant: MoveChallengeVariant } | { ok: false; reason: StartRefusal } {
  const variant = findVariant(input.variantId);

  if (!variant) {
    return { ok: false, reason: "MOVE_CHALLENGE_UNKNOWN_VARIANT" };
  }

  if (input.active && input.active.status === "active") {
    return { ok: false, reason: "MOVE_CHALLENGE_ALREADY_ACTIVE" };
  }

  if (variant.kind === "team" && (input.invitedFriendIds?.length ?? 0) < variant.minFriends) {
    return { ok: false, reason: "MOVE_CHALLENGE_NEEDS_FRIENDS" };
  }

  return { ok: true, variant };
}

/** What each refusal means, in words a person can act on. */
export const START_REFUSAL_COPY: Record<StartRefusal, string> = {
  MOVE_CHALLENGE_ALREADY_ACTIVE: "You already have an active challenge. Finish or leave it to start another.",
  MOVE_CHALLENGE_UNKNOWN_VARIANT: "That challenge is no longer available.",
  MOVE_CHALLENGE_NEEDS_FRIENDS: "Invite enough friends to start this one.",
  MOVE_CHALLENGE_JOIN_REFUSED:
    "Lumo could not add you to this one. Check you have no other challenge running, and that you have Lumo Plus if this challenge needs it."
};

/**
 * How much of the day-keyed movement cache falls inside a challenge's window.
 *
 * Day-granular, which is a real approximation worth naming: a challenge started
 * at 3pm counts that whole day, including the morning before it began. The
 * alternative is discarding a day someone genuinely walked because they signed
 * up late in it, and being slightly generous on the first day is the friendlier
 * error — Move is not a stopwatch.
 */
export function challengeWindow(
  challenge: ActiveMoveChallenge,
  todayKey: string,
  dayKeyOf: (iso: string) => string
): { start: string; end: string } {
  const start = dayKeyOf(challenge.startedAt);
  // The end is whichever comes first: the deadline, or today. Counting past
  // today would let a future-dated summary land inside the window.
  const deadline = challenge.endsAt ? dayKeyOf(challenge.endsAt) : null;

  return { start, end: deadline && deadline < todayKey ? deadline : todayKey };
}

/**
 * Where a challenge stands.
 *
 * `currentM` is always YOUR distance, read from the device's own summaries —
 * solo or team. The team figures alongside it (`teamM`, `teamDone`) describe
 * everyone else, and completion needs all of them there. See `complete`.
 */
export function challengeProgress(input: {
  challenge: ActiveMoveChallenge;
  summaries: MovementSummary[];
  todayKey: string;
  /** Turns an ISO instant into a local date key. `lib/date`'s job, passed in. */
  dayKeyOf: (iso: string) => string;
  /** Epoch ms, for the deadline. */
  now: number;
}): ChallengeProgress | null {
  const variant = findVariant(input.challenge.variantId);

  if (!variant) {
    return null;
  }

  const window = challengeWindow(input.challenge, input.todayKey, input.dayKeyOf);
  const targetM = variant.targetM;

  /**
   * Your own distance always comes from the device's summaries, even on a team
   * challenge — the participant row is what OTHERS see of you, written by the
   * last sync, and reading it here would make your own bar lag your own walk.
   */
  const currentM = sumMetric(input.summaries, "distance", window.start, window.end);

  const roster = input.challenge.participants.filter((entry) => entry.leftAt === null);
  const teamM = roster.reduce((total, entry) => total + Math.max(0, entry.contributionM), 0);
  const shared = variant.kind === "team" && input.challenge.teamGoal === "shared";
  /**
   * What one person is expected to walk.
   *
   * Split across whoever is STILL taking part, so somebody leaving raises
   * everybody else's share rather than quietly shrinking the challenge. Falls
   * back to the whole target with an empty roster, which is a challenge with
   * nobody in it and completes on nothing.
   */
  const shareM = shared && roster.length > 0 ? targetM / roster.length : targetM;
  const teamDone = roster.filter((entry) => entry.contributionM >= shareM).length;

  // The pot on a shared challenge, your own legs on any other.
  const measuredM = shared ? teamM : currentM;

  const everyoneThere = variant.kind === "team" && roster.length > 0 && teamDone === roster.length;
  const teamComplete = shared ? teamM >= targetM : everyoneThere;
  const complete = input.challenge.completedAt !== null || (variant.kind === "team" ? teamComplete : currentM >= targetM);
  const endsAt = input.challenge.endsAt ? new Date(input.challenge.endsAt).getTime() : null;

  return {
    challenge: input.challenge,
    variant,
    currentM: measuredM,
    targetM,
    shareM,
    ratio: targetM > 0 ? Math.min(1, measuredM / targetM) : 0,
    remainingM: Math.max(0, targetM - measuredM),
    // Rounded UP, so the last partial day still reads as "1 day left" rather
    // than "0 days left" while there is time on the clock.
    daysLeft: endsAt === null ? null : Math.max(0, Math.ceil((endsAt - input.now) / DAY_MS)),
    complete,
    // Never both. A challenge finished on its final morning is complete, not
    // expired, however the clock reads afterwards.
    expired: !complete && endsAt !== null && input.now > endsAt,
    teamM,
    teamDone,
    teamSize: roster.length
  };
}

/** Whether a day can still be bought back, and why not when it cannot. */
export function pauseState(challenge: ActiveMoveChallenge): { can: boolean; left: number; reason?: string } {
  const left = Math.max(0, MAX_PAUSES - challenge.pausesUsed);

  if (challenge.status !== "active") {
    return { can: false, left, reason: "This challenge is no longer running." };
  }

  // An open-ended challenge has no clock, so there is nothing a pause could do.
  if (challenge.endsAt === null) {
    return { can: false, left, reason: "This one has no deadline to pause." };
  }

  if (left === 0) {
    return { can: false, left, reason: `You have used all ${MAX_PAUSES} pauses on this challenge.` };
  }

  return { can: true, left };
}

/**
 * Buys a day back: the deadline moves out by one, the count goes up by one.
 *
 * Returns the challenge unchanged when it cannot be paused, so a caller that
 * skipped `pauseState` still cannot overrun the cap.
 */
export function pauseChallenge(challenge: ActiveMoveChallenge): ActiveMoveChallenge {
  if (!pauseState(challenge).can || challenge.endsAt === null) {
    return challenge;
  }

  return {
    ...challenge,
    endsAt: new Date(new Date(challenge.endsAt).getTime() + DAY_MS).toISOString(),
    pausesUsed: challenge.pausesUsed + 1
  };
}

/** This member's own contribution to a team challenge. */
export function myContribution(challenge: ActiveMoveChallenge, userId: string): number {
  return challenge.participants.find((entry) => entry.userId === userId)?.contributionM ?? 0;
}

/** Participants still taking part, biggest contribution first. */
export function activeParticipants(challenge: ActiveMoveChallenge): MoveParticipant[] {
  return challenge.participants.filter((entry) => entry.leftAt === null).sort((a, b) => b.contributionM - a.contributionM);
}

/** Narrows a stored challenge, or drops it. */
export function normalizeActiveChallenge(value: unknown): ActiveMoveChallenge | null {
  const raw = value as Partial<ActiveMoveChallenge> | undefined;

  if (!raw || typeof raw.id !== "string" || !raw.id || !findVariant(raw.variantId) || typeof raw.startedAt !== "string") {
    return null;
  }

  const status: MoveChallengeStatus =
    raw.status === "completed" || raw.status === "cancelled" || raw.status === "expired" ? raw.status : "active";

  return {
    id: raw.id,
    variantId: raw.variantId as string,
    startedAt: raw.startedAt,
    endsAt: typeof raw.endsAt === "string" ? raw.endsAt : null,
    status,
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : null,
    participants: Array.isArray(raw.participants)
      ? raw.participants
          .map((entry) => entry as Partial<MoveParticipant>)
          .filter((entry): entry is MoveParticipant => typeof entry?.userId === "string" && Boolean(entry.userId))
          .map((entry) => ({
            userId: entry.userId,
            name: typeof entry.name === "string" && entry.name ? entry.name : "A friend",
            contributionM: Number.isFinite(entry.contributionM) ? Math.max(0, entry.contributionM) : 0,
            leftAt: typeof entry.leftAt === "string" ? entry.leftAt : null
          }))
      : [],
    ownerId: typeof raw.ownerId === "string" ? raw.ownerId : null,
    // Anything unrecognised, including absent, is `each` — the behaviour every
    // challenge stored before this field existed was running under.
    teamGoal: raw.teamGoal === "shared" ? "shared" : "each",
    pausesUsed: Number.isFinite(raw.pausesUsed) ? Math.min(MAX_PAUSES, Math.max(0, Math.round(raw.pausesUsed as number))) : 0
  };
}
