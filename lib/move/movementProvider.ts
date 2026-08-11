import { Platform } from "react-native";
import { toDateKey } from "@/lib/date";
import { emptySummary, normalizeSummary } from "@/lib/move/movement";
import type { MovementSummary } from "@/lib/move/types";

/**
 * The movement data abstraction.
 *
 * Every screen and every calculation in Move reads `MovementProvider`, never
 * HealthKit or Health Connect. That is what keeps the platform SDKs at the
 * edge: the domain deals only in `MovementSummary`, so adding a provider (a
 * wearable, a manual entry, a Google Fit bridge) is a new adapter here and no
 * change anywhere else.
 *
 * ## Deferred requires
 *
 * Both SDKs resolve native modules at import time, so a plain top-level import
 * crashes any build made before they were linked. They go behind the pattern
 * from `lib/orientation.ts`: `typeof import()` for types, a three-state cache
 * (`undefined` / `null` / module), `require()` inside `try/catch`, and a
 * capability probe the UI reads. Move degrades to "not connected" rather than
 * taking the app down.
 *
 * ## The rule about absence
 *
 * Taken from `lib/iap.ts`: **absence returns null, never zero.** "No health
 * permission" and "walked nothing" are different facts, and rendering the first
 * as the second would tell someone who walked 5 km that they had not moved, and
 * would quietly fail their goals for them.
 */

export type MovementPermission = "unavailable" | "not_requested" | "granted" | "denied";

export type MovementProvider = {
  /** Which platform is answering. For copy and for the settings deep-link. */
  readonly kind: "healthkit" | "healthconnect";
  isAvailable(): Promise<boolean>;
  getPermission(): Promise<MovementPermission>;
  requestPermissions(): Promise<MovementPermission>;
  /**
   * Day-by-day movement across an inclusive local date range.
   *
   * Returns null when the data cannot be read at all. An empty array means "read
   * fine, nothing there" — a distinction the caller depends on.
   */
  getMovementSummary(startKey: string, endKey: string): Promise<MovementSummary[] | null>;
  /**
   * Movement inside an hour window on one day, for time-of-day challenges.
   *
   * Optional: a provider that cannot slice by hour simply omits it, and the
   * challenge engine reports no progress rather than guessing.
   */
  getWindowedSummary?(dateKey: string, fromHour: number, toHour: number): Promise<MovementSummary | null>;
};

// --- iOS: HealthKit ---------------------------------------------------------

type HealthKitModule = typeof import("@kingstinct/react-native-healthkit");

let healthKitModule: HealthKitModule | null | undefined;

function loadHealthKit(): HealthKitModule | null {
  if (healthKitModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      healthKitModule = require("@kingstinct/react-native-healthkit") as HealthKitModule;
    } catch {
      healthKitModule = null;
    }
  }

  return healthKitModule;
}

/**
 * The four types Lumo reads, and nothing else.
 *
 * Deliberately minimal — §15. Lumo has no use for heart rate, sleep, weight or
 * workouts, so it never asks for them: an app that requests everything is one
 * people decline. Read-only; Move never writes to Health.
 */
const HK_STEPS = "HKQuantityTypeIdentifierStepCount";
const HK_DISTANCE = "HKQuantityTypeIdentifierDistanceWalkingRunning";
const HK_EXERCISE = "HKQuantityTypeIdentifierAppleExerciseTime";

const HK_READ = [HK_STEPS, HK_DISTANCE, HK_EXERCISE] as const;

/** Local midnight for a date key. Parsed without a Z, so it is genuinely local. */
function localStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

function localEndExclusive(dateKey: string): Date {
  const date = localStart(dateKey);
  date.setDate(date.getDate() + 1);

  return date;
}

/**
 * One bucketed statistics query, folded into a date-keyed map.
 *
 * `queryStatisticsCollectionForQuantity` buckets on the device, so a month of
 * data is one call returning thirty numbers rather than thirty calls or a raw
 * sample dump — which is what §38 asks for and what keeps Move fast on an
 * account with years of history.
 */
async function hkDailySums(
  hk: HealthKitModule,
  identifier: string,
  unit: string,
  startKey: string,
  endKey: string
): Promise<Map<string, number>> {
  const out = new Map<string, number>();

  try {
    const results = await hk.queryStatisticsCollectionForQuantity(
      identifier as never,
      ["cumulativeSum"] as never,
      localStart(startKey),
      { day: 1 } as never,
      { filter: { startDate: localStart(startKey), endDate: localEndExclusive(endKey) }, unit } as never
    );

    for (const entry of results ?? []) {
      const start = entry.startDate;
      const value = entry.sumQuantity?.quantity;

      if (start && Number.isFinite(value)) {
        out.set(toDateKey(new Date(start)), (out.get(toDateKey(new Date(start))) ?? 0) + (value as number));
      }
    }
  } catch {
    // Left empty: a metric the device cannot answer contributes nothing rather
    // than failing the whole sync. Steps usually work when exercise time does not.
  }

  return out;
}

const healthKitProvider: MovementProvider = {
  kind: "healthkit",

  async isAvailable() {
    const hk = loadHealthKit();

    if (!hk) {
      return false;
    }

    try {
      return await hk.isHealthDataAvailableAsync();
    } catch {
      return false;
    }
  },

  /**
   * What we are allowed to read, without asking for anything.
   *
   * HealthKit deliberately does not reveal READ authorisation — by design, so an
   * app cannot infer that you have a condition from the fact you declined to
   * share it. `getRequestStatusForAuthorization` only says whether the sheet
   * still needs showing, so "granted" here means "we have asked", and whether
   * data actually arrives is discovered by reading it.
   */
  async getPermission() {
    const hk = loadHealthKit();

    if (!hk) {
      return "unavailable";
    }

    try {
      if (!(await hk.isHealthDataAvailableAsync())) {
        return "unavailable";
      }

      const status = await hk.getRequestStatusForAuthorization({ read: HK_READ } as never);

      // 0 = unknown, 1 = shouldRequest, 2 = unnecessary (already asked).
      return status === 2 ? "granted" : "not_requested";
    } catch {
      return "unavailable";
    }
  },

  async requestPermissions() {
    const hk = loadHealthKit();

    if (!hk) {
      return "unavailable";
    }

    try {
      const granted = await hk.requestAuthorization({ read: HK_READ } as never);

      return granted ? "granted" : "denied";
    } catch {
      return "denied";
    }
  },

  async getMovementSummary(startKey, endKey) {
    const hk = loadHealthKit();

    if (!hk) {
      return null;
    }

    try {
      const [steps, distance, exercise] = await Promise.all([
        hkDailySums(hk, HK_STEPS, "count", startKey, endKey),
        hkDailySums(hk, HK_DISTANCE, "m", startKey, endKey),
        hkDailySums(hk, HK_EXERCISE, "min", startKey, endKey)
      ]);

      const days = new Set([...steps.keys(), ...distance.keys(), ...exercise.keys()]);

      return [...days]
        .sort()
        .map(
          (date) =>
            normalizeSummary({
              date,
              steps: steps.get(date) ?? 0,
              distanceMeters: distance.get(date) ?? 0,
              activeMinutes: exercise.get(date) ?? 0
              // No walking/running split: HealthKit reports
              // DistanceWalkingRunning as ONE figure, and inventing a split
              // would be fabricating data. See the note on MovementSummary.
            }) ?? emptySummary(date)
        );
    } catch {
      return null;
    }
  },

  async getWindowedSummary(dateKey, fromHour, toHour) {
    const hk = loadHealthKit();

    if (!hk) {
      return null;
    }

    const start = localStart(dateKey);
    start.setHours(fromHour);
    const end = localStart(dateKey);
    end.setHours(Math.min(24, toHour));

    try {
      const read = async (identifier: string, unit: string) => {
        const result = await hk.queryStatisticsForQuantity(identifier as never, ["cumulativeSum"] as never, {
          filter: { startDate: start, endDate: end },
          unit
        } as never);

        return result?.sumQuantity?.quantity ?? 0;
      };

      const [steps, distanceMeters, activeMinutes] = await Promise.all([
        read(HK_STEPS, "count"),
        read(HK_DISTANCE, "m"),
        read(HK_EXERCISE, "min")
      ]);

      return normalizeSummary({ date: dateKey, steps, distanceMeters, activeMinutes });
    } catch {
      return null;
    }
  }
};

// --- Android: Health Connect ------------------------------------------------

type HealthConnectModule = typeof import("react-native-health-connect");

let healthConnectModule: HealthConnectModule | null | undefined;

function loadHealthConnect(): HealthConnectModule | null {
  if (healthConnectModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      healthConnectModule = require("react-native-health-connect") as HealthConnectModule;
    } catch {
      healthConnectModule = null;
    }
  }

  return healthConnectModule;
}

const HC_PERMISSIONS = [
  { accessType: "read", recordType: "Steps" },
  { accessType: "read", recordType: "Distance" },
  { accessType: "read", recordType: "ExerciseSession" }
] as const;

/**
 * Health Connect has no day-bucketed collection query, so each day is
 * aggregated separately.
 *
 * Bounded by the caller's range rather than unbounded — the sync only ever asks
 * for days it does not already hold, so this is typically one day.
 */
async function hcAggregate(
  hc: HealthConnectModule,
  recordType: "Steps" | "Distance" | "ExerciseSession",
  dateKey: string
): Promise<number> {
  try {
    const result = (await hc.aggregateRecord({
      recordType,
      timeRangeFilter: {
        operator: "between",
        startTime: localStart(dateKey).toISOString(),
        endTime: localEndExclusive(dateKey).toISOString()
      }
    } as never)) as Record<string, unknown>;

    if (recordType === "Steps") {
      return Number(result?.COUNT_TOTAL ?? 0);
    }

    if (recordType === "Distance") {
      const distance = result?.DISTANCE as { inMeters?: number } | undefined;

      return Number(distance?.inMeters ?? 0);
    }

    const duration = result?.EXERCISE_DURATION_TOTAL as { inSeconds?: number } | undefined;

    return Math.round(Number(duration?.inSeconds ?? 0) / 60);
  } catch {
    return 0;
  }
}

const healthConnectProvider: MovementProvider = {
  kind: "healthconnect",

  async isAvailable() {
    const hc = loadHealthConnect();

    if (!hc) {
      return false;
    }

    try {
      // 3 = SDK_AVAILABLE. Anything else means Health Connect is missing or
      // needs an update, which the permission card explains rather than
      // silently failing.
      return (await hc.getSdkStatus()) === 3;
    } catch {
      return false;
    }
  },

  async getPermission() {
    const hc = loadHealthConnect();

    if (!hc) {
      return "unavailable";
    }

    try {
      if ((await hc.getSdkStatus()) !== 3) {
        return "unavailable";
      }

      await hc.initialize();
      const granted = await hc.getGrantedPermissions();

      return granted.length >= HC_PERMISSIONS.length ? "granted" : "not_requested";
    } catch {
      return "unavailable";
    }
  },

  async requestPermissions() {
    const hc = loadHealthConnect();

    if (!hc) {
      return "unavailable";
    }

    try {
      await hc.initialize();
      const granted = await hc.requestPermission(HC_PERMISSIONS as never);

      return granted.length > 0 ? "granted" : "denied";
    } catch {
      return "denied";
    }
  },

  async getMovementSummary(startKey, endKey) {
    const hc = loadHealthConnect();

    if (!hc) {
      return null;
    }

    try {
      await hc.initialize();

      const out: MovementSummary[] = [];
      const cursor = localStart(startKey);
      const last = localStart(endKey);

      while (cursor <= last) {
        const date = toDateKey(cursor);
        const [steps, distanceMeters, activeMinutes] = await Promise.all([
          hcAggregate(hc, "Steps", date),
          hcAggregate(hc, "Distance", date),
          hcAggregate(hc, "ExerciseSession", date)
        ]);

        out.push(normalizeSummary({ date, steps, distanceMeters, activeMinutes }) ?? emptySummary(date));
        cursor.setDate(cursor.getDate() + 1);
      }

      return out;
    } catch {
      return null;
    }
  }
};

// --- selection --------------------------------------------------------------

/**
 * The provider for this platform, or null where there is none.
 *
 * Null on web and on any build without the native module linked. Move handles
 * that as an empty state rather than an error — §39.
 */
export function movementProvider(): MovementProvider | null {
  if (Platform.OS === "ios") {
    return loadHealthKit() ? healthKitProvider : null;
  }

  if (Platform.OS === "android") {
    return loadHealthConnect() ? healthConnectProvider : null;
  }

  return null;
}

/** True when this build can read movement at all. The UI hides the connect card otherwise. */
export function canReadMovement(): boolean {
  return movementProvider() !== null;
}
