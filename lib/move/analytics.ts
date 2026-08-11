/**
 * Move analytics events.
 *
 * Lumo has **no analytics SDK**, and §47 says not to introduce one. So this is
 * a typed sink: the call sites are correct and named, the event list is in one
 * place, and wiring it to a real backend later is a change to `emit` alone.
 *
 * In development it logs, so the funnel can be watched while building. In
 * production it does nothing at all — deliberately, rather than buffering
 * events nobody will ever read.
 *
 * ⚠️ **No health data may ever be a property here.** Not a step count, not a
 * distance, not a date of activity. Event names and ids only. Movement is
 * health information (§15), and the moment it is attached to an analytics event
 * it has left the device under a weaker set of promises than the ones Move
 * makes about it.
 */

export type MoveAnalyticsEvent =
  | "move_opened"
  | "movement_permission_requested"
  | "movement_permission_granted"
  | "movement_permission_denied"
  | "move_goal_created"
  | "move_goal_completed"
  | "move_badge_unlocked"
  | "move_challenge_joined"
  | "move_challenge_completed"
  | "move_journey_stage_reached"
  | "group_move_challenge_created"
  | "group_move_challenge_joined"
  | "group_move_challenge_completed";

/**
 * Properties an event may carry.
 *
 * Identifiers and enum-ish labels only. The type is narrow on purpose — there
 * is no `value: number` field, so an amount of movement cannot be attached
 * without a deliberate change to this type and a second look at the rule above.
 */
export type MoveAnalyticsProps = {
  goalId?: string;
  challengeId?: string;
  milestoneId?: string;
  stageId?: string;
  groupId?: string;
  metric?: string;
  frequency?: string;
  activityType?: string;
  mode?: string;
};

export function trackMove(event: MoveAnalyticsEvent, props: MoveAnalyticsProps = {}): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[move] ${event}`, props);
  }
}
