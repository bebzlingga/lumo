/**
 * Move's client-side subscription gates, in one place.
 *
 * ## WHY THIS FILE EXISTS
 *
 * Two screens ask the same question — may this account bring people along? —
 * and they used to ask it by reading `isPlus` directly. That is fine until the
 * answer needs overriding for testing, at which point the override has to be
 * remembered in both, and one of them gets missed.
 *
 * ## WHAT IS GATED, AND WHAT IS NOT
 *
 * There are two separate Plus gates in Move, and only one of them lives here:
 *
 *  - **Company** — bringing friends on an ordinary move, and the team ROUTE on a
 *    challenge. That is the shared half of Move and it is what this file
 *    answers.
 *  - **The upper rungs** — 25K and above (`family.pro`). A different gate about
 *    distance, checked against `isPlus` at its own call site, and deliberately
 *    NOT bypassed here: it is the one someone reads about on the paywall.
 */

/**
 * Opens Move's social features without a subscription, for walking the invite
 * flow end to end while testing.
 *
 * **MUST BE FALSE IN EVERY BUILD THAT SHIPS**, exactly like
 * `BYPASS_FRIENDS_PAYWALL` in `app/(tabs)/friends.tsx`. The two are separate
 * flags on purpose — that one opens the Friends TAB, this one opens Move's
 * company — but they have the same consequence when left on: a paid feature
 * given away.
 *
 * What it does NOT open, and cannot: the database's own gates. `move_challenges`
 * refuses a Plus rung without `has_active_subscription()`, and
 * `move_challenge_participants` refuses to join one — so with this on you reach
 * every screen and the writes are still refused. It is a way past the UI, not a
 * way past the rule.
 */
export const BYPASS_MOVE_PLUS_GATE = true;

/**
 * Whether this account may take people along on a move or a challenge.
 *
 * Takes the entitlement rather than reading the context, so it stays a plain
 * function the screens can call inside render and a test can call directly.
 */
export function moveSocialUnlocked(isPlus: boolean): boolean {
  return isPlus || BYPASS_MOVE_PLUS_GATE;
}
