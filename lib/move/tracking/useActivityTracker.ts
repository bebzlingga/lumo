import React from "react";
import { AppState } from "react-native";
import { activityTracker, type PrepareState } from "@/lib/move/tracking/controller";
import { averagePace, averageSpeed, smoothedPace } from "@/lib/move/tracking/pace";
import type { ActivityTrackingState } from "@/lib/move/tracking/types";

/**
 * The screens' view of a recording.
 *
 * Subscribes to the controller and re-renders on its updates — nothing more.
 * Every decision belongs to the controller and the engine; this hook exists so
 * a component can read the state without owning it, and so unmounting a screen
 * cannot end a walk.
 *
 * The derived figures are computed here rather than stored, because they are
 * views of the same facts: a pace held in state is a second copy that can
 * disagree with the distance it came from.
 */
export function useActivityTracker() {
  const [state, setState] = React.useState<ActivityTrackingState | null>(() => activityTracker.getState());
  const [prepare, setPrepare] = React.useState<PrepareState>({
    quality: "unavailable",
    accuracyM: null,
    ready: false,
    permission: null
  });

  React.useEffect(() => activityTracker.subscribe(setState), []);
  React.useEffect(() => activityTracker.subscribePrepare(setPrepare), []);

  /**
   * Coming back to the foreground drains whatever the background task collected
   * while the app was away. The controller also drains on its own clock, so
   * this is the fast path rather than the only one.
   */
  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void activityTracker.drainBackground();
      }
    });

    return () => subscription.remove();
  }, []);

  const derived = React.useMemo(() => {
    if (!state) {
      return { currentPace: null, averagePace: null, averageSpeed: null };
    }

    return {
      currentPace: smoothedPace(state.segments, Date.now()),
      averagePace: averagePace(state.distanceMeters, state.movingDuration),
      averageSpeed: averageSpeed(state.distanceMeters, state.movingDuration)
    };
    // `lastTickAt` moves once a second while recording, which is exactly the
    // cadence these should be recomputed at.
  }, [state?.lastTickAt, state?.distanceMeters, state?.movingDuration, state?.segments]);

  return {
    state,
    prepare,
    ...derived,
    isRecording: state !== null && state.status !== "finished",
    controller: activityTracker
  };
}
