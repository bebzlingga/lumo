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
 *    DISTANCE, and a different product: those rungs come with Pro, the ₱149
 *    one-off (`isUnlimited`), not with Plus. Checked at its own call site in
 *    `app/move/[milestone].tsx` and deliberately NOT bypassed here — nothing in
 *    this file should be able to give away the other product.
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
export const BYPASS_MOVE_PLUS_GATE = false;

/**
 * Whether Move's company exists AT ALL in this build.
 *
 * Off for now: Move ships as a solo feature — record a walk, take on a rung,
 * watch the line climb — and everything about doing it WITH somebody is hidden
 * behind this. That means the "bring friends" route, the team route on a
 * challenge, and the invitations that arrive from either.
 *
 * A DIFFERENT KIND OF SWITCH FROM THE PLUS GATE BELOW, and the difference is
 * what each one says to the reader. A locked Plus feature stays on screen
 * wearing a badge, because a feature you cannot see is one you cannot decide to
 * pay for. A feature that is switched off is not on offer at any price, so it
 * shows nothing at all — a "comes with Plus" row for something nobody can have
 * yet would be selling a thing that is not there.
 *
 * Nothing server-side is touched. The tables, the policies and the realtime
 * channels stay exactly as they are, so an invite sent from an older build still
 * lands in the database — this build simply neither sends nor shows one. Turning
 * it back on is this flag and nothing else.
 */
export const MOVE_WITH_FRIENDS_ENABLED = false;

/**
 * Whether this account may take people along on a move or a challenge.
 *
 * Takes the entitlement rather than reading the context, so it stays a plain
 * function the screens can call inside render and a test can call directly.
 *
 * The feature switch comes FIRST and beats both the entitlement and the testing
 * bypass: with company switched off there is nothing to unlock, and a bypass
 * that reopened it would defeat the switch on exactly the builds it matters on.
 */
export function moveSocialUnlocked(isPlus: boolean): boolean {
  return MOVE_WITH_FRIENDS_ENABLED && (isPlus || BYPASS_MOVE_PLUS_GATE);
}
