import type { HostInstance } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MOVE_WITH_FRIENDS_ENABLED } from "@/lib/move/gating";
import React from "react";
import { Alert, Animated, Easing, Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Icon, type IconName } from "@/components/Icon";
import { ChallengeRing } from "@/components/move/ChallengeUI";
import { GpsHint, GpsIndicator, Metric, TrackingDebugPanel } from "@/components/move/TrackingUI";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Screen } from "@/components/ui";
import { WalkBackground, useWalkSceneInset } from "@/components/WalkBackground";
import { WalkMap } from "@/components/WalkMap";
import { WalkRoute } from "@/components/WalkRoute";
import { ctaFill, fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { MOVE_ROUTE_ACCENT } from "@/constants/tools";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { alpha, readableOn } from "@/lib/color";
import { toDateKey } from "@/lib/date";
import { challengeClient } from "@/lib/move/challengeClient";
import { clearWalkSession, loadWalkSession } from "@/lib/move/walkSession";
import { findFamily } from "@/lib/move/challengeDefs";
import { checkIntegrity, toWalkPoints, toWalkRecordFromActivity } from "@/lib/move/tracking/bridge";
import {
  elevationGain,
  estimateCalories,
  formatDistance,
  formatElevation,
  formatDistanceValue,
  formatDuration,
  formatPace,
  formatSpeed
} from "@/lib/move/tracking/pace";
import { useActivityTracker } from "@/lib/move/tracking/useActivityTracker";
import { recordWalk } from "@/lib/walk";
import { loadWalkState, saveWalkState } from "@/lib/walkStorage";
import { enqueueWalk } from "@/lib/walkSyncRunner";

/**
 * Recording a walk or a run.
 *
 * Four states on one route, exactly as `app/focus.tsx` is built — a recording
 * in progress is not somewhere you navigate to, and a back stack between
 * "walking" and "finished" would let someone strand a live activity behind
 * them.
 *
 *   ready ──▶ tracking ──▶ summary
 *
 * The screen owns NONE of the tracking. Every number here is read from
 * `useActivityTracker`, which reads the controller, which drives the pure
 * engine in `lib/move/tracking`. This file decides what things look like and
 * nothing else — which is why the engine could be tested without it.
 */

/** How long the map and the live card take to arrive. */
const ENTER_MS = 320;

/**
 * How often a shared move publishes its distance and reads the other side's.
 *
 * Ten seconds. Two people watching each other's kilometres do not need it faster,
 * and every step tighter multiplies both a write and a read across the whole walk.
 */
const WALK_SYNC_MS = 10_000;

/**
 * There is no Walk/Run toggle, and there is no longer a note explaining why.
 *
 * The toggle's only mechanical job was setting the filter's speed ceiling, and
 * a wrong guess threw away real movement — a jog recorded as a walk had its
 * fastest legs rejected as impossible. Plenty of outings are both, which no
 * single choice describes. So the answer is worked out from the recording, in
 * `classifyActivity`. The screen used to say all this in three lines; it says
 * nothing now, because the behaviour needs no announcement — nothing is being
 * asked of anybody.
 */

export default function MoveTrackScreen() {
  const router = useRouter();
  const { palette, isDark } = useLumo();
  const move = useMove();
  const { state, prepare, averagePace, averageSpeed, controller } = useActivityTracker();

  const [saving, setSaving] = React.useState(false);
  /**
   * True for the frame the share image is taken in.
   *
   * The picture is the whole screen — Lumo's scene included, because that is
   * what makes it a Lumo walk rather than four numbers — so the two controls
   * that are chrome rather than content are pulled for the shot. Nobody wants a
   * screenshot with a Share button in it.
   */
  const [capturing, setCapturing] = React.useState(false);
  /**
   * Who came along, from the start page.
   *
   * A route param rather than state on the activity: nothing about the
   * recording changes because somebody else is there, and the engine has no
   * business knowing. It is a line on the card, and it lives as long as the
   * screen does.
   */
  const { with: withParam } = useLocalSearchParams<{ with?: string }>();
  /**
   * Who came along.
   *
   * The route param seeds it and the ACTIVITY owns it from then on, so a walk
   * recovered after a crash still knows — the param is gone by then, the
   * recording is not.
   */
  const startingWith = React.useMemo(
    () => (typeof withParam === "string" ? withParam.split(",").map((name) => name.trim()).filter(Boolean) : []),
    [withParam]
  );
  const companions = (state?.companions ?? startingWith).join(", ");
  /**
   * A photo of the walker, standing in for Lumo's scene behind the share card.
   *
   * Held only for as long as the summary is on screen, and deliberately NOT
   * saved anywhere: it is a backdrop for one picture, not an attachment to the
   * activity, and writing somebody's selfie into app storage to draw it once
   * would be collecting something we were not asked to keep.
   */
  const [sharePhoto, setSharePhoto] = React.useState<string | null>(null);
  /** Light figures for a dark photo, dark for a bright one. */
  const [shareLight, setShareLight] = React.useState(false);
  /** What a share captures: the figures and the route, without the page bar. */
  const summaryRef = React.useRef<HostInstance>(null);
  const [showDebug, setShowDebug] = React.useState(false);
  /**
   * How far the live card has arrived, 0 to 1.
   *
   * Standing in for the countdown that used to cover this transition: without
   * something between them the ready screen was replaced by a map and a card in
   * one frame, which read as a glitch rather than as a walk beginning. The card
   * rises into place while the map settles under it.
   */
  const enter = React.useRef(new Animated.Value(0)).current;

  const { width, height: screenHeight } = useWindowDimensions();
  /** The home-indicator strip the floating bar has to sit above. */
  const insets = useSafeAreaInsets();
  const routeWidth = width - layout.screenPaddingX * 2;
  /**
   * The colour the route, the position dot and the live figures are drawn in.
   *
   * Warm rather than the app's green, and that is deliberate: on a map the
   * green sat inside the greens the tiles are already made of, and a route has
   * to be the loudest thing on it. Walked until white text clears 4.5:1, so the
   * same value can fill a button.
   */
  const accent = readableOn(MOVE_ROUTE_ACCENT, palette.white, 4.5);
  const dateKey = toDateKey();
  const sceneInset = useWalkSceneInset("walking");

  /**
   * The last position the tracker saw, accepted or not.
   *
   * Only ever used to frame the map before the route has any points of its own.
   * A rejected fix is still roughly where the phone is, which is all this needs.
   */
  const lastFix = React.useMemo(() => {
    const point = state?.rawPoints[state.rawPoints.length - 1];

    return point ? { lat: point.latitude, lon: point.longitude } : null;
  }, [state?.rawPoints]);

  const challenge = move.progress;
  const challengeFamily = challenge ? findFamily(challenge.variant.milestoneId) : undefined;

  /**
   * Runs the entrance once the recording view is on screen, and resets it when
   * the walk ends so a second walk in the same session animates in too.
   */
  const recording = Boolean(state) && state?.status !== "finished";

  React.useEffect(() => {
    if (!recording) {
      enter.setValue(0);

      return;
    }

    const animation = Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });

    animation.start();

    return () => animation.stop();
  }, [recording, enter]);

  /**
   * Asks for permission and starts sampling the moment the screen opens.
   *
   * Not at app launch: a location prompt for a feature nobody has opened is the
   * one that gets refused out of reflex. Here it arrives with the screen that
   * explains it.
   */
  React.useEffect(() => {
    void controller.beginPrepare();

    /**
     * And release it again if the screen closes without a walk starting.
     *
     * Acquisition turns the receiver on before there is anything to record.
     * Leaving without starting — a declined permission, a change of mind — must
     * turn it back off, or it runs for the life of the process. A recording in
     * progress is untouched: `releaseIfIdle` is a no-op once an activity
     * exists, which is what lets this screen be closed mid-walk.
     */
    return () => {
      void controller.releaseIfIdle();
    };
  }, [controller]);

  /**
   * An activity left behind by a crash gets offered back rather than resumed.
   *
   * Silently carrying on would put however long the app was gone into the
   * walk's elapsed time and draw a line across wherever the person went.
   */
  const [recoveryChecked, setRecoveryChecked] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    void controller.recover().then((recovered) => {
      if (cancelled) {
        return;
      }

      setRecoveryChecked(true);

      if (!recovered || recovered.status === "finished") {
        return;
      }

      Alert.alert(
        "You have a walk in progress",
        "Lumo stopped before this one was saved. The distance it recorded is safe — what happened while the app was closed is not, so nothing from that gap is counted.",
        [
          { text: "Discard", style: "destructive", onPress: () => void controller.discard() },
          { text: "Keep it", onPress: () => void controller.continueRecovered() }
        ]
      );
    });

    return () => {
      cancelled = true;
    };
  }, [controller]);

  // --- actions --------------------------------------------------------------

  /**
   * Start recording, immediately.
   *
   * There used to be a three-second countdown here. It bought nothing — the
   * engine's clock starts at `controller.start()` either way, so the count was
   * three seconds of standing still being told to wait — and it put a full
   * screen between the tap and the map. The haptic is what confirms the tap
   * now, and the walk begins on it.
   */
  function beginTracking() {
    if (prepare.permission === "unavailable") {
      Alert.alert(
        "Lumo needs location",
        "Lumo traces your route to measure how far you went. You can turn location on in Settings and start again.",
        // Nothing to do here without location, and this screen has no other
        // purpose — so the way out is the only button.
        [{ text: "OK", onPress: () => router.back() }]
      );

      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    void controller.start({ companions: startingWith });
  }

  /**
   * Recording begins the moment this screen opens.
   *
   * There was a ready screen here — a signal badge and a Start button — and it
   * was one tap too many: the page before this one already asks what kind of
   * outing this is and ends in a button that says Start Moving. Pressing start
   * twice to start once is the kind of thing nobody notices designing it and
   * everybody notices standing on the doorstep.
   *
   * Waits for `recoveryChecked`, or a walk left behind by a crash would be
   * replaced by a new one before it could be offered back. Guarded by a ref as
   * well as by `state`, because `state` arrives a tick after
   * `controller.start()` and a re-render in between would begin a second
   * activity.
   *
   * Permission is NOT waited for: `controller.start()` runs `beginPrepare`
   * itself when it has not run yet, so the prompt arrives inside the same
   * action rather than gating it.
   */
  const startedRef = React.useRef(false);
  /**
   * Set the moment this screen commits to leaving — saving, or discarding.
   *
   * WHY IT IS NEEDED, because the effect below looks like it is already guarded.
   *
   * `startedRef` is only armed when THIS screen instance started the walk. Come
   * back to a walk already running — the Moving now card on the Move tab, or
   * simply returning to the map after leaving it — and the effect sees a truthy
   * `state`, returns, and leaves the ref false.
   *
   * Saving then clears the tracker, which sets `state` back to null while this
   * screen is STILL MOUNTED: the pop is animated, so at least one more render
   * happens before the unmount. The effect read that null as "no walk yet" and
   * started a fresh one on the way out — you saved a walk, landed back on Move,
   * and it said Moving now over a recording that had begun by itself.
   *
   * A separate flag rather than arming `startedRef` when a walk is adopted,
   * because those are two different facts and only one of them is about leaving.
   * Discarding a RECOVERED walk also empties the tracker while this screen is
   * mounted, and there the auto-start is correct: you opened the map to walk,
   * and the thing you threw away was last week's crash.
   *
   * A ref rather than state: it has to hold for the very next render, and
   * nothing on screen depends on it.
   */
  const leavingRef = React.useRef(false);

  React.useEffect(() => {
    if (startedRef.current || leavingRef.current || state || !recoveryChecked) {
      return;
    }

    startedRef.current = true;
    beginTracking();
  }, [state, recoveryChecked]);

  /**
   * Tells friends this account is out, and takes it back when the recording ends.
   *
   * Driven off the tracker's own status rather than the two buttons: a walk can be
   * recovered after a crash, finished from the notification, or abandoned by
   * leaving the screen, and only the status is true in all of those. Keyed on
   * `active` alone — a pause is still being out on a move, and flickering the row
   * on every autopause would be a lot of writes to say nothing.
   */
  const recordingNow = state !== null && state.status !== "finished";

  React.useEffect(() => {
    // Presence only feeds friends' pickers, which are switched off.
    if (!recordingNow || !MOVE_WITH_FRIENDS_ENABLED) {
      return;
    }

    void challengeClient.beginPresence(state?.type === "run" ? "run" : "walk").catch(() => undefined);

    return () => {
      void challengeClient.endPresence().catch(() => undefined);
    };
  }, [recordingNow, state?.type]);

  /**
   * The shared session this walk belongs to, and what the other side is covering.
   *
   * Read from storage rather than a route param because the walk outlives the
   * screen that started it — see `lib/move/walkSession.ts`. Null on a solo walk,
   * which is most of them, and everything below it is then inert.
   */
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [peers, setPeers] = React.useState<{ userId: string; distanceM: number }[]>([]);

  React.useEffect(() => {
    let active = true;

    /**
     * Read on mount AND on a short retry, because the writer is a race.
     *
     * The start page saves the session after `startWalkTogether` answers and this
     * screen is opened in the same tick, so a single read on mount usually misses
     * it — which meant the owner's device published nothing for the whole walk and
     * their friend watched a number that never moved.
     *
     * Two seconds is longer than the round trip and short enough to be inside the
     * first GPS fix. It stops as soon as it finds one, and gives up rather than
     * polling for the life of the walk: no session by then means a solo walk.
     */
    let attempts = 0;

    const read = async () => {
      const stored = await loadWalkSession();

      if (!active) {
        return;
      }

      if (stored?.sessionId) {
        setSessionId(stored.sessionId);

        return;
      }

      attempts += 1;

      if (attempts < 4) {
        setTimeout(() => void read(), 500);
      }
    };

    void read();

    return () => {
      active = false;
    };
  }, []);

  /**
   * Publishes this device's distance and reads the others', on a timer.
   *
   * An interval rather than an effect on `distanceMeters`: that number moves with
   * every accepted fix, which would be a write every few seconds and a write per
   * peer read on top. Ten seconds is far inside what "watching each other run"
   * needs and turns a walk's worth of writes into a few dozen.
   *
   * Publish-then-read on each tick, the same order `MoveContext` uses for a team
   * challenge, so the pair of numbers on screen is never your stale one beside
   * their fresh one.
   */
  React.useEffect(() => {
    if (!sessionId || !recordingNow) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      const covered = controller.getState()?.distanceMeters ?? 0;

      await challengeClient.publishWalkDistance(sessionId, covered);

      const others = await challengeClient.fetchWalkPeers(sessionId);

      if (!cancelled) {
        setPeers(others);
      }
    };

    const run = () => void tick().catch(() => undefined);

    run();
    const timer = setInterval(run, WALK_SYNC_MS);
    // Live as well as timed: their metres land as they are covered, and the timer
    // covers a socket that never connected or has gone quiet.
    const unsubscribe = challengeClient.subscribeToWalkSession(sessionId, run);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
    };
  }, [sessionId, recordingNow]);

  async function handleFinish() {
    const finished = await controller.finish();

    if (!finished) {
      return;
    }

    // Free this account up in friends' invite lists.
    void challengeClient.endPresence().catch(() => undefined);

    /**
     * THE SHARED SESSION IS CLEARED FROM STORAGE, NOT FROM STATE — and always.
     *
     * This was `if (sessionId)`, reading the copy this screen loaded when it
     * mounted, and it caused a loop that could not be got out of:
     *
     *  1. Starting a walk with friends saves the session id from the START page,
     *     fire-and-forget, after `startWalkTogether` answers.
     *  2. This screen is opened by `replace` in the same tick and reads storage
     *     once — usually BEFORE that write lands, so `sessionId` stays null.
     *  3. Finishing therefore cleared nothing, and the session outlived the walk.
     *  4. Back on the Move tab, a stored session arms "Move Now" to skip the start
     *     page and begin recording immediately — so the next tap started another
     *     walk, which finished, which left the session again. Round and round.
     *
     * Re-reading storage here closes the race: whatever was written, however late,
     * is what gets cleared. The `clear` is unconditional because the loop came from
     * a conditional that could be wrong — there is nothing to lose by clearing a
     * key that was already empty.
     */
    const stored = await loadWalkSession();

    if (stored?.sessionId) {
      void challengeClient.leaveWalkTogether(stored.sessionId).catch(() => undefined);
    }

    await clearWalkSession();
    setSessionId(null);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }

  /**
   * Files the activity: history, habits, the sync queue, and the challenge.
   *
   * The order matters only in that the LOCAL write comes first. Everything else
   * — the upload, the habit tick — can be retried or recomputed; the recording
   * itself cannot.
   */
  async function handleSave() {
    if (!state || saving) {
      return;
    }

    // Before the first await, and before anything empties the tracker: from here
    // on this screen is on its way out and must not start a walk. See `leavingRef`.
    leavingRef.current = true;
    setSaving(true);

    const record = toWalkRecordFromActivity(state);

    if (!record) {
      await controller.discard();
      // Nothing recorded, but the pairing still has to go — see `handleFinish`.
      await clearWalkSession();
      router.back();

      return;
    }

    const stored = await loadWalkState();

    await saveWalkState(recordWalk(stored, record));
    await enqueueWalk(record.id).catch(() => undefined);

    /**
     * Challenge progress, and the one check that guards it.
     *
     * `checkIntegrity` is separate from the recording on purpose: the engine
     * decides what happened, and this decides whether what happened is
     * plausible enough to count. A failure keeps the walk and withholds only
     * its claim — and it is where an integrity score would go later.
     */
    const integrity = checkIntegrity(state);

    if (integrity.ok) {
      move.creditActivity(state.distanceMeters);
    }

    await controller.discard();
    void move.refresh().catch(() => undefined);
    setSaving(false);
    router.back();
  }

  /**
   * Shares the summary as an image.
   *
   * The same approach `AwardDialog` uses, and the same two guards: `view-shot`
   * is a native module, so a build without it must lose sharing rather than
   * crash the screen, and the OS sheet is only opened when the platform says it
   * is available.
   *
   * Captures the SUMMARY, not the whole screen — the page bar and its buttons
   * are chrome, and nobody wants a screenshot with a back arrow in it.
   */
  /**
   * Choose the photo the share card is drawn over.
   *
   * Same permission handling as the journal's attachment picker, including the
   * iOS "limited" case: a limited grant reports `granted: false` and still
   * opens a picker over the photos the user chose to share, so only a hard
   * denial that cannot be re-asked is worth blocking on.
   */
  async function pickSharePhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted && !permission.canAskAgain) {
        Alert.alert("Photo access needed", "Allow photo access for Lumo in Settings to use one of your photos.");

        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 0.9
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      setSharePhoto(result.assets[0].uri);
      // A photo is usually darker than the cream scene, so light figures are
      // the better opening guess. Still a guess — the toggle is right there.
      setShareLight(true);
    } catch (error) {
      Alert.alert("Couldn't use that photo", error instanceof Error ? error.message : "Please try again.");
    }
  }

  /**
   * The photo control, which is three things behind one button.
   *
   * With no photo it opens the picker. With one it asks, because "change" and
   * "remove" are both reasonable next steps and a second chip for the rarer one
   * would sit in the header forever to be used once.
   */
  function handlePhotoPress() {
    if (!sharePhoto) {
      void pickSharePhoto();

      return;
    }

    Alert.alert("Photo behind your card", undefined, [
      { text: "Choose another", onPress: () => void pickSharePhoto() },
      {
        text: "Remove photo",
        style: "destructive",
        onPress: () => {
          setSharePhoto(null);
          setShareLight(false);
        }
      },
      { text: "Cancel", style: "cancel" }
    ]);
  }

  async function handleShare() {
    let uri: string;

    setCapturing(true);
    // One beat for the hidden controls to leave the screen. Without it the
    // capture races the re-render and catches the buttons it just dropped.
    await new Promise((resolve) => setTimeout(resolve, 64));

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
      uri = await captureRef(summaryRef, {
        format: "png",
        quality: 1,
        // Named so the two are never left to a default that changes between
        // platforms: a file on disk is what `Sharing.shareAsync` wants.
        result: "tmpfile"
      });
    } catch {
      Alert.alert("Almost there", "Sharing needs the latest app build. Rebuild the app to enable it.");

      return;
    } finally {
      setCapturing(false);
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your walk" });
      }
    } catch {
      Alert.alert("Sharing failed", "Could not share the image. Please try again.");
    }
  }

  function confirmDiscard() {
    Alert.alert("Discard this activity?", "The route and everything it recorded will be lost.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          // Same reason as in `handleSave`, and it has to be set BEFORE the
          // discard: emptying the tracker is exactly what would otherwise trip
          // the auto-start on the way out. See `leavingRef`.
          leavingRef.current = true;
          void controller.discard();
          // Belt as well as braces: `handleFinish` clears the pairing already, but a
          // discard is the other way out of this screen and it must not be the one
          // path that leaves a session behind to arm "Move Now" again.
          void clearWalkSession().catch(() => undefined);
          router.back();
        }
      }
    ]);
  }

  // --- the summary ----------------------------------------------------------

  if (state && state.status === "finished") {
    const calories = estimateCalories({ distanceM: state.distanceMeters, movingMs: state.movingDuration });
    /**
     * What the card's figures are drawn in.
     *
     * On Lumo's own scene the palette answers this and the toggle is not shown
     * — cream is a known ground and dark ink is simply right on it. A photo is
     * an unknown ground, so the choice moves to the person who took it, and
     * every figure gets an outline: a shadow costs nothing on a flat colour and
     * is the difference between legible and not over a busy one.
     */
    const tone = sharePhoto
      ? {
          /**
           * Pure black rather than the app's warm ink.
           *
           * `palette.ink` is an amber-brown, chosen to sit on cream; over a
           * photograph it reads as a colour somebody picked rather than as
           * type, and it has less contrast against a mid-tone than black does.
           */
          ink: shareLight ? palette.white : "#000000",
          muted: alpha(shareLight ? palette.white : "#000000", "CC"),
          // Only under white letters, which need separating from a bright
          // photo. Black type has its own contrast against anything it is
          // readable on at all, and a black halo behind it only muddied the
          // edges of the stroke.
          shadow: shareLight ? styles.onPhoto : undefined
        }
      : { ink: palette.ink, muted: palette.muted, shadow: undefined };
    /**
     * The Share pill's own colours, and they do not follow the card.
     *
     * The card colour at 80%, with the page's own ink on it.
     *
     * Neutral rather than green: green is the app's colour for a thing you are
     * completing, and this sends a picture. At 80% a little of the route or the
     * photo shows through without the pill having to be read against it, and a
     * faint outline carries the edge on a cream card where the fill alone is
     * nearly the same colour as the page.
     *
     * This is a control ON the screen rather than part of the picture, and it
     * is hidden for the capture anyway, so it does not follow the card's tone.
     */
    const shareChip = { fill: alpha(palette.card, "CC"), border: alpha(palette.ink, "1F"), ink: palette.ink };

    return (
      /* The ref sits outside `Screen`, so the shot takes the backdrop with it —
         the scene Lumo is drawn into is the frame of the picture.

         The background colour is on THIS view rather than left to `Screen`.
         `captureRef` renders the layer it is given, and this one had nothing
         painted on it: the canvas is drawn by the SafeAreaView inside, which
         the snapshot treats as a child that may not have composited yet — so
         the PNG came back with a transparent ground and the figures floating on
         whatever the viewer put behind them. A photo covers this anyway; on
         Lumo's own card it IS the card. */
      <View ref={summaryRef} collapsable={false} style={[styles.fill, { backgroundColor: palette.canvas }]}>
      <Screen
        contentStyle={styles.content}
        backgroundVariant={null}
        backgroundNode={
          sharePhoto ? (
            <View style={StyleSheet.absoluteFill}>
              <Image source={{ uri: sharePhoto }} style={StyleSheet.absoluteFill} resizeMode="cover" />

              {/* A gradient rather than a flat wash.
                  The figures all sit in the upper half, so that is the only
                  part that needs holding back — and it fades to nothing well
                  before the foot of the screen, which leaves most of the photo
                  at full strength. Cast in the opposite tone to the text, so it
                  darkens under white type and lightens under black. */}
              <Svg width={width} height={screenHeight} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                  <LinearGradient id="sharePhotoScrim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={shareLight ? "#000000" : "#FFFFFF"} stopOpacity="0.8" />
                    <Stop offset="0.45" stopColor={shareLight ? "#000000" : "#FFFFFF"} stopOpacity="0.5" />
                    <Stop offset="0.85" stopColor={shareLight ? "#000000" : "#FFFFFF"} stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width={width} height={screenHeight} fill="url(#sharePhotoScrim)" />
              </Svg>
            </View>
          ) : (
            <WalkBackground plate="walkDone" />
          )
        }
      >
        {/* No title. The distance under it is the headline, and "Walk
            Complete" above a number that says the same thing was the screen
            announcing itself. */}
        <ScreenHeader
          /* Only in the picture. On the screen the distance is the headline and
             a title over it says the same thing twice — but a shared image
             leaves the app behind, so it has to carry its own name.

             `centerContent` rather than `title`, because the header's own title
             face is the serif every screen wears and this is a mark on a
             picture: caps, tracked, in the app's sans.

             Always rendered, hidden by opacity. Adding it for the shot made the
             header re-lay out one frame before the capture, which read as the
             page twitching under the finger that just pressed Share. */
          centerContent={
            /* A fixed-height slot holding both, one of them always invisible.
               They swap on capture, and stacking rather than branching is what
               keeps the header from re-laying out in the frame before the shot. */
            <View style={styles.shareCenter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={sharePhoto ? "Change or remove the photo behind this card" : "Use one of your photos behind this card"}
                accessibilityElementsHidden={capturing}
                disabled={capturing}
                onPress={handlePhotoPress}
                style={({ pressed }) => [
                  styles.sharePhotoButton,
                  { borderColor: alpha(tone.ink, "59"), opacity: capturing ? 0 : pressed ? 0.6 : 1 }
                ]}
              >
                <Icon name="gallery" size={16} color={tone.ink} weight="bulk" />
                <AppText variant="caption" color={tone.ink} numberOfLines={1}>
                  {sharePhoto ? "Change photo" : "Add photo"}
                </AppText>
              </Pressable>

              <View
                pointerEvents="none"
                style={styles.shareTitleSlot}
                accessibilityElementsHidden={!capturing}
                importantForAccessibility={capturing ? "auto" : "no-hide-descendants"}
              >
                {/* Just the name. "RUN WITH LUMO" had to fit the header's
                    centre slot, between two 38pt buttons, and on a narrow phone
                    the ellipsis landed in the middle of the mark — which is
                    worse than no mark at all. One word cannot be cropped. */}
                <AppText color={tone.ink} numberOfLines={1} style={[styles.shareTitle, tone.shadow, { opacity: capturing ? 1 : 0 }]}>
                  LUMO
                </AppText>
              </View>
            </View>
          }
          /* The tone switch, and only once there is a photo to switch it over.
             On Lumo's own scene the ground is known and dark ink is the answer,
             so the control would only offer a way to make the card unreadable. */
          leftAction={
            sharePhoto
              ? {
                  icon: shareLight ? "sun" : "moon",
                  label: shareLight ? "Light text, switch to dark" : "Dark text, switch to light",
                  onPress: () => setShareLight((current) => !current),
                  // Chrome in the card's own tone: a hairline drawn for cream
                  // disappears over a photograph, and so does dark ink over a
                  // dark one.
                  iconColor: tone.ink,
                  borderColor: alpha(tone.ink, "59"),
                  render: capturing ? <View style={styles.headerSlot} /> : undefined
                }
              : undefined
          }
          rightAction={{
            icon: "check",
            label: saving ? "Saving" : "Save this activity",
            onPress: () => void handleSave(),
            iconColor: tone.ink,
            borderColor: alpha(tone.ink, "59"),
            /* An empty box of the button's own size for the shot: `render`
               suppresses the outline too, so the slot holds its width without
               drawing anything. */
            render: capturing ? <View style={styles.headerSlot} /> : undefined
          }}
        />

        <View style={styles.summaryCapture}>
        <View style={styles.summaryHero}>
          {/* The unit at half the number's size, as on the live screen — one
              readout, two places, the same shape. */}
          <AppText color={tone.ink} style={[styles.summaryDistance, tone.shadow]} numberOfLines={1}>
            {formatDistanceValue(state.distanceMeters)}
            <AppText color={tone.ink} style={styles.summaryDistanceUnit}>
              {" km"}
            </AppText>
          </AppText>

          {/* Inside the capture, so the shared card says who it was with. */}
          {companions ? (
            <AppText variant="caption" color={tone.muted} numberOfLines={1} style={tone.shadow}>
              With {companions}
            </AppText>
          ) : null}
        </View>

        {/* Four figures, one row. Steps and elapsed time came out: the
            pedometer's count is the one number here that is not measured from
            the route, and elapsed only ever explained the gap to moving time —
            which nobody needs explaining when the walk has just ended. */}
        <View style={styles.metrics}>
          <Metric label="Moving time" value={formatDuration(state.movingDuration)} color={tone.ink} labelColor={tone.muted} textStyle={tone.shadow} />
          <Metric label="Avg. pace" value={formatPace(averagePace)} color={tone.ink} labelColor={tone.muted} textStyle={tone.shadow} />
          <Metric label="Avg. speed" value={formatSpeed(averageSpeed)} color={tone.ink} labelColor={tone.muted} textStyle={tone.shadow} />
        </View>

        {/* Two, centred rather than stretched: at a third of the width each
            they would line up under the row above and read as a five-column
            grid with a hole in it. */}
        <View style={styles.metricsPair}>
          {/* Labelled an estimate wherever it appears — see `estimateCalories`. */}
          <Metric label="Calories (est.)" value={`${calories ?? 0}`} color={tone.ink} labelColor={tone.muted} textStyle={tone.shadow} />
          <Metric
            label="Elevation"
            value={formatElevation(elevationGain(state.segments))}
            color={tone.ink}
            labelColor={tone.muted}
            textStyle={tone.shadow}
          />
        </View>

        {toWalkPoints(state).length > 0 ? (
          <WalkRoute route={toWalkPoints(state)} accent={accent} width={routeWidth} height={200} />
        ) : null}
        </View>

        {/* No Save button. The tick in the page bar files the walk, and a
            second control doing the same thing at the foot of the page made it
            look like the summary had two different endings. */}
      </Screen>

      {/* Share floats at the foot of the screen rather than sitting at the end
          of the content, the same way Start does on the ready screen: it is the
          one thing this screen offers, and on a long summary it was below the
          fold. Inside the capture wrapper and hidden by opacity — pulling it
          out of the layout shifted everything above it mid-shot.

          Always offered. It used to hide when the walk had no accepted fixes,
          on the grounds that a card with no route on it was four numbers on
          cream and not worth sending. That stopped being true the moment a
          photo could go behind it — and it meant anybody who walked indoors, or
          whose GPS never landed, found the button simply missing with nothing
          to explain it. */}
      <View style={[styles.shareBar, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share this activity"
            accessibilityElementsHidden={capturing}
            disabled={capturing}
            onPress={() => void handleShare()}
            // The app's chip wash, as on the habit form's categories: a green
            // tint with the glyph and label green to match, so it reads as one
            // control rather than dark text on a coloured patch.
            style={({ pressed }) => [
              styles.shareAction,
              {
                backgroundColor: shareChip.fill,
                borderColor: shareChip.border,
                opacity: capturing ? 0 : pressed ? 0.6 : 1
              }
            ]}
          >
            <Icon name="share" size={20} color={shareChip.ink} weight="fill" />
            <AppText color={shareChip.ink} style={styles.shareLabel}>
              Share
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  // --- recording ------------------------------------------------------------

  if (state) {
    const paused = state.status === "paused" || state.status === "autoPaused";
    /**
     * Whether the walk is stopped by the WALKER, which is the only kind of pause
     * they get to lift.
     *
     * `paused` above is what the card and the chip read from — to the person
     * holding the phone both states are "paused", and saying otherwise would be
     * pedantry. This one drives the button, and the two must not be confused:
     * the tracker's own pause means it cannot place you, so there is nothing to
     * resume into and no button to offer. It lifts itself on the first fix.
     */
    const pausedByUser = state.status === "paused";
    /**
     * The acquisition phase, on screen.
     *
     * The map and the card are already here and already reading zero, which is
     * the truth — nothing is being recorded yet. What the screen owes is the
     * reason, and the promise that no second tap is coming: the walk begins on
     * the first decent fix, or after fifteen seconds, whichever lands first.
     */
    const preparing = state.status === "preparing";
    /** Fades the map up and lifts the card into place. */
    const entering = {
      opacity: enter,
      transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }]
    };

    return (
      <Screen
        scroll={false}
        contentStyle={styles.trackingContent}
        backgroundVariant={null}
        /**
         * A map, held back to almost nothing: muted tiles, no points of
         * interest, no buildings, no traffic — see `WalkMap`.
         *
         * `center` is what stops it opening on the whole country. With no fixes
         * in the route yet there is no region to frame, and the platform's
         * answer to that is fully zoomed out; the last fix the tracker saw is a
         * far better guess than the world. After that the region follows the
         * route, re-framing on every fix.
         */
        backgroundNode={
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: enter }]}>
          <WalkMap
            route={toWalkPoints(state)}
            accent={accent}
            style={StyleSheet.absoluteFill}
            showRecenter={false}
            center={lastFix}
            // Keeps you in the middle at a fixed zoom while walking. Fitting
            // the whole route instead would pull back all hour, ending on a
            // city and a thread.
            frame="position"
          />
          </Animated.View>
        }
      >
        <ScreenHeader
          leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
          /**
           * Pause and resume live in the page bar, where the map is.
           *
           * They belong beside what they act on: the walk is the map, and the
           * bar is the only chrome over it. It also leaves the foot of the
           * screen to the one irreversible control, so the tap that ENDS a walk
           * is never next to the tap that pauses it.
           */
          rightAction={
            /**
             * Nothing to pause until the clock is running — and nothing to
             * RESUME while the tracker is the one holding it.
             *
             * An auto-pause still gets the Pause button, not a disabled Resume
             * and not an empty slot. The walk is waiting for a fix, which is a
             * running state as far as the walker's options go: they may still
             * take it over by hand, and having done so they may lift it again.
             * Offering Resume instead would be a button whose only honest
             * behaviour is to do nothing, which is what it used to be.
             */
            preparing
              ? undefined
              : {
                  icon: pausedByUser ? "play" : "pause",
                  label: pausedByUser ? "Resume" : "Pause",
                  // Filled, not outlined: a transport control is a solid shape
                  // everywhere else it appears, and at 20pt over a map an outline
                  // reads as a smudge.
                  iconWeight: "fill",
                  onPress: () => (pausedByUser ? controller.resume() : controller.pause())
                }
          }
          centerContent={
            /* No title over the map.
               "Moving" said what the whole screen was already saying, and the
               state that actually matters — paused — is on the card below,
               where the pause button and the Finish row both live.

               The slot is kept because the diagnostics toggle hides in it
               during development, and because an empty centre keeps the two
               buttons where they are. */
            <Pressable
              accessibilityRole={__DEV__ ? "button" : undefined}
              accessibilityLabel={__DEV__ ? "Tracking diagnostics" : undefined}
              disabled={!__DEV__}
              onPress={() => setShowDebug((current) => !current)}
              style={styles.trackTitle}
            />
          }
        />

        <View pointerEvents="none" style={styles.spacer} />

        {/* Dev only, and off by default even there. */}
        {__DEV__ && showDebug ? <TrackingDebugPanel state={state} lastDeltaM={0} /> : null}

        <GpsHint
          quality={state.gpsQuality}
          phase={preparing ? "preparing" : state.status === "autoPaused" ? "signalLost" : "tracking"}
        />

        {/* Said on the screen doing the recording, because it changes what that
            recording will be.

            The caveat is much smaller than it used to be, and the wording moved
            with it. Without "Allow all the time" Lumo used to stop recording at
            the lock screen; it no longer does — the walk keeps tracing with the
            screen off either way. What that permission still buys is the OS
            being allowed to wake Lumo again if it gets closed mid-walk, which is
            worth one line and not worth a warning. */}
        {prepare.permission === "while-running" ? (
          <AppText variant="caption" color={palette.subtle} style={styles.permissionNote}>
            Recording continues with the screen off. Just leave Lumo running — closing it ends the walk.
          </AppText>
        ) : null}

        <Animated.View style={[styles.card, entering, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
          <View style={styles.gpsRow}>
            <GpsIndicator quality={state.gpsQuality} accuracyM={state.lastAccuracyM} />
            {/* Distance, straight under the signal badge and as big as the card
                allows. It is the number this screen exists to show, and the one
                a glance mid-walk is looking for. */}
            {/* The unit at half the number's size: "km" is the same on every
                walk, and at full weight it took as much of the line as the
                figure that actually changes. */}
            <AppText color={palette.ink} style={styles.liveDistance} numberOfLines={1}>
              {formatDistanceValue(state.distanceMeters)}
              <AppText color={palette.ink} style={styles.liveDistanceUnit}>
                {" km"}
              </AppText>
            </AppText>
          </View>

          {/* Divided from each other rather than fenced off from the distance
              above: three figures side by side needed to be told apart, and a
              rule across the top was answering a different question. */}
          <View style={[styles.metrics, styles.metricsSpaced]}>
            {/* Moving time only. Elapsed is on the summary, where it explains
                the gap between the two; mid-walk it is just a second clock. */}
            <Metric label="Moving" value={formatDuration(state.movingDuration)} />
            <View style={[styles.metricDivider, { backgroundColor: alpha(palette.hairline, "CC") }]} />
            {/* The average only. Current pace swings on a single fix even after
                smoothing, and a number that moves while you watch it is not one
                you can act on mid-walk. */}
            <Metric label="Avg. pace" value={formatPace(averagePace)} />
            <View style={[styles.metricDivider, { backgroundColor: alpha(palette.hairline, "CC") }]} />
            <Metric label="Steps" value={(state.steps ?? 0).toLocaleString()} />
          </View>

          {/* The challenge this walk feeds, when there is one.
              A line inside the card rather than a second card under it: it is
              one of this walk's figures, and a card of its own made it look
              like a separate thing happening at the same time. */}
          {challenge && challengeFamily ? (
            <View style={[styles.challengeRow, { borderTopColor: alpha(palette.hairline, "CC") }]}>
              {/* This walk counted in, so the dial answers "am I getting there"
                  rather than "where was I when I set off". */}
              <ChallengeRing
                ratio={(challenge.currentM + state.distanceMeters) / Math.max(1, challenge.targetM)}
                size={22}
                stroke={4}
                accent={accent}
                track={alpha(palette.hairline, "99")}
              />

              <AppText variant="caption" color={palette.ink} numberOfLines={1} style={styles.challengeName}>
                {challengeFamily.title} Challenge
              </AppText>

              {/* The unit said once, at the end: "0.0 km of 1.0 km" repeated it
                  for a pair of numbers that can only ever share it. */}
              <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                {formatDistanceValue(Math.min(challenge.targetM, challenge.currentM + state.distanceMeters))} /{" "}
                {formatDistance(challenge.targetM)}
              </AppText>
            </View>
          ) : null}

          {/* Who you set out with, when the start page was told. A quiet line
              rather than a row of faces: it is context for the walk, not one of
              its figures.
              
              On a SHARED walk it stops being context and becomes a figure — their
              distance beside yours is the whole point of going out together — so
              the line carries what they have covered, refreshed every
              WALK_SYNC_MS. */}
          {peers.length > 0 ? (
            <View style={[styles.challengeRow, { borderTopColor: alpha(palette.hairline, "CC") }]}>
              <Icon name="friends" size={14} color={accent} weight="bulk" />
              <AppText variant="caption" color={palette.ink} numberOfLines={1} style={styles.challengeName}>
                {companions || "Together"}
              </AppText>
              {/* Their kilometres, in the same shape the challenge line above uses
                  for its pair — one unit, at the end. Several peers are summed
                  rather than listed: the card has one line of room, and "the others
                  have done 3.1 km between them" is the fact anyway. */}
              <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                {formatDistanceValue(peers.reduce((total, peer) => total + peer.distanceM, 0))} km
              </AppText>
            </View>
          ) : companions ? (
            <View style={styles.companions}>
              <Icon name="friends" size={13} color={palette.muted} weight="bulk" />
              <AppText variant="caption" color={palette.muted} numberOfLines={1} style={styles.companionsLabel}>
                With {companions}
              </AppText>
            </View>
          ) : null}

          {/* Inside the card, under a rule: it acts on the figures above it.
              No fill and no inset of its own — the colour alone carries the
              state, green while walking and red once paused. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Finish"
            onPress={() => void handleFinish()}
            style={({ pressed }) => [
              styles.finishRow,
              { borderTopColor: alpha(palette.hairline, "CC"), opacity: pressed ? 0.6 : 1 }
            ]}
          >
            <Icon
              name="check"
              size={16}
              color={paused ? palette.danger : readableOn(ctaFill(isDark), palette.card, 4.5)}
              weight="bold"
            />
            <AppText variant="button" color={paused ? palette.danger : readableOn(ctaFill(isDark), palette.card, 4.5)}>
              Finish
            </AppText>
          </Pressable>
        </Animated.View>

      </Screen>
    );
  }

  // --- starting -------------------------------------------------------------

  /**
   * The half-second before the first activity exists.
   *
   * Not a screen with anything on it: the decision was made on the page before
   * this one, and there is nothing to ask. Just the backdrop and a way out, so
   * the moment between the tap and the map is not a blank rectangle — and so a
   * refused permission leaves somewhere to go rather than a dead end.
   */
  return (
    <Screen contentStyle={styles.content} backgroundVariant={null} backgroundNode={<WalkBackground plate="walking" />}>
      <ScreenHeader title="Move" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      <View style={{ height: sceneInset }} />

      <View style={styles.readyHead}>
        <GpsIndicator quality={prepare.quality} accuracyM={prepare.accuracyM} />
        <GpsHint quality={prepare.quality} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1
  },
  content: {
    gap: spacing.md,
    // Clears the floating bar, so the last card is never trapped behind it.
    paddingBottom: spacing.xxl * 2
  },
  trackingContent: {
    flex: 1,
    gap: spacing.sm,
    paddingBottom: spacing.xl
  },
  spacer: {
    flex: 1
  },
  companions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    paddingTop: spacing.xs
  },
  companionsLabel: {
    flexShrink: 1
  },
  challengeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    // The card's own gap sits under this row as well, so it needs none of its
    // own — Finish is the next rule down and the two were reading as far apart
    // as the metrics block above.
    marginBottom: -spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  challengeName: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 14,
    lineHeight: 19
  },
  permissionNote: {
    textAlign: "center",
    maxWidth: 320,
    alignSelf: "center"
  },
  readyHead: {
    alignItems: "center",
    gap: spacing.xs,
    paddingBottom: spacing.md
  },
  card: {
    gap: spacing.sm,
    // Wider than it is tall: the figures inside are centred, and a square inset
    // left them looking crowded against the edges while the card itself sat
    // deeper than it needed to.
    paddingHorizontal: spacing.ml,
    paddingVertical: spacing.sm,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  gpsRow: {
    alignItems: "center",
    gap: spacing.xxs,
    // Air above the badge, so the card opens on a breath rather than on its
    // own edge.
    paddingTop: spacing.sm
  },
  liveDistanceUnit: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 26
  },
  liveDistance: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 52,
    lineHeight: 60,
    marginTop: spacing.xs
  },
  metrics: {
    flexDirection: "row",
    alignItems: "flex-end"
  },
  metricsPair: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "flex-end",
    // A third of the screen each, so the pair sits inside the row above rather
    // than spreading to its edges.
    width: "66%"
  },
  metricsSpaced: {
    // Pulled up against the card's own gap: the distance block above ends in a
    // small "Distance" caption, which already reads as a break.
    marginTop: -2
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 2
  },
  /**
   * The one control on the completion screen, so it is sized like a button rather
   * than like the header chrome.
   *
   * 44 with 10 of its own padding, up from a bare 38: it used to take
   * `ScreenHeader`'s button height because it sat between two of them, but on this
   * screen it stands alone under a saved activity and at 38 it read as chrome
   * somebody had left behind. Vertical padding as well as a floor, so the pill
   * grows with the text size rather than clipping it.
   */
  shareAction: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 44,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  headerSlot: {
    width: 38,
    height: 38
  },
  /**
   * The halo every figure wears over a photo, in either tone.
   *
   * No offset — a drop shadow implies a light source the photograph does not
   * have. This just holds the letterform: under white type it is the separation
   * from a bright frame, under black type it thickens the stroke.
   */
  onPhoto: {
    textShadowColor: "rgba(0, 0, 0, 0.25)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4
  },
  shareBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing.sm
  },
  // 38pt, which is `ScreenHeader`'s own button size — this pill sits between
  // two of them and any other height reads as a mistake.
  shareCenter: {
    height: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  sharePhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  shareTitleSlot: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center"
  },
  shareTitle: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 15,
    lineHeight: 20,
    // Wider tracking now there is room for it — four letters set as a mark
    // rather than a line of text.
    letterSpacing: 3,
    // Riding the top of the header band rather than sitting on the buttons'
    // centre line: in the picture there are no buttons to line up with, and a
    // mark belongs at the edge of the frame.
    marginTop: -spacing.sm
  },
  shareLabel: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 15,
    lineHeight: 20
  },
  summaryCapture: {
    gap: spacing.md
  },
  summaryHero: {
    alignItems: "center",
    gap: 2
  },
  summaryDistanceUnit: {
    fontFamily: fontFamilies.lexendBlack,
    // Half the figure, as on the live screen — the unit never changes, so it
    // never competes with the number that does.
    fontSize: 34
  },
  summaryDistance: {
    fontFamily: fontFamilies.lexendBlack,
    fontSize: 68,
    lineHeight: 78
  },
  // Holds the centre slot open for the dev-only diagnostics tap. Sized so the
  // target is reachable without drawing anything.
  trackTitle: {
    alignItems: "center",
    minHeight: 38,
    minWidth: 80
  },
  section: {
    gap: spacing.xs
  },
  sectionTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  habits: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  habitChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.card
  },
  finishRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth
  },
});
