import type { ChallengeProgress } from "@/lib/move/activeChallenge";
import { formatDistance } from "@/lib/move/movement";

/**
 * Near-challenge encouragement, and the notification copy behind it.
 *
 * Pure: this decides WHAT could be said and how close is close enough. Whether
 * to say it at all is `shouldNudge` plus the caller's record of when it last
 * spoke.
 *
 * The tone is fixed: every line states a small remaining amount and stops. No
 * exclamation marks stacked up, no guilt about yesterday.
 */

/**
 * How close counts as close.
 *
 * Three quarters of the way, and not sooner. A nudge at 40% is not
 * encouragement, it is a reminder that most of it is still left — which is the
 * thing that makes people turn notifications off.
 */
export const NUDGE_THRESHOLD = 0.75;

/** Never twice within this window, whatever else happens. */
export const NUDGE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type MoveNudge = { title: string; body: string };

/**
 * The one thing worth saying about a running challenge, or nothing.
 *
 * Ranked: a deadline about to pass beats being nearly there, because it is the
 * only one where waiting costs something. Exactly one comes out, so three
 * notifications for three true facts is structurally impossible.
 */
export function challengeNudge(progress: ChallengeProgress | null): MoveNudge | null {
  if (!progress || progress.complete || progress.expired) {
    return null;
  }

  const left = formatDistance(progress.remainingM);

  // The clock first — a last day with ground to cover is the only case where
  // saying nothing actually costs the person something.
  if (progress.daysLeft !== null && progress.daysLeft <= 1 && progress.remainingM > 0) {
    return { title: "Last day", body: `${left} left on ${progress.variant.title}.` };
  }

  if (progress.ratio < NUDGE_THRESHOLD) {
    return null;
  }

  // On a team challenge, being nearly there yourself is worth a different line
  // from the group being nearly there — the group cannot walk for you.
  if (progress.variant.kind === "team" && progress.currentM >= progress.targetM) {
    return {
      title: "Waiting on the others",
      body: `You're done. ${progress.teamDone} of ${progress.teamSize} there so far.`
    };
  }

  return { title: "Almost there", body: `Only ${left} to finish ${progress.variant.title}.` };
}

/**
 * Whether Move is allowed to speak at all right now.
 *
 * Three gates, any of which can veto: the user's own notification setting, the
 * cooldown, and the hour. Quiet hours keep Move out of the early morning and
 * the night — a nudge at 6am is not encouragement.
 */
export function shouldNudge(input: {
  notificationsEnabled: boolean;
  lastNudgeAt: number | null;
  now: number;
  hour: number;
  quietBefore?: number;
  quietAfter?: number;
}): boolean {
  const { notificationsEnabled, lastNudgeAt, now, hour, quietBefore = 9, quietAfter = 21 } = input;

  if (!notificationsEnabled || hour < quietBefore || hour >= quietAfter) {
    return false;
  }

  return lastNudgeAt === null || now - lastNudgeAt >= NUDGE_COOLDOWN_MS;
}
