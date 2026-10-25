/**
 * The device side of Walk that the tracker still uses: steps and a stable id.
 * (Location and its permission live in `lib/move/tracking/backgroundLocation.ts`.)
 *
 * Every native module here is behind the deferred-require pattern from
 * `lib/orientation.ts` — `typeof import()` for the types, a three-state cache,
 * and `require()` inside a `try/catch`. Walk pulls in five native modules at
 * once, and a top-level import of any of them would crash the whole app on a
 * build made before they were added. The JS bundle reloads instantly; the native
 * binary does not, and the gap between them should cost a feature rather than
 * the app.
 *
 * The other rule, taken from `lib/iap.ts`: **absence returns null, never zero.**
 * "No pedometer" and "walked zero steps" are different facts, and rendering the
 * first as the second is a lie the whole walk is then built on.
 */

type SensorsModule = typeof import("expo-sensors");
type CryptoModule = typeof import("expo-crypto");

let sensorsModule: SensorsModule | null | undefined;
let cryptoModule: CryptoModule | null | undefined;

function loadSensors(): SensorsModule | null {
  if (sensorsModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sensorsModule = require("expo-sensors") as SensorsModule;
    } catch {
      sensorsModule = null;
    }
  }

  return sensorsModule;
}

function loadCrypto(): CryptoModule | null {
  if (cryptoModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cryptoModule = require("expo-crypto") as CryptoModule;
    } catch {
      cryptoModule = null;
    }
  }

  return cryptoModule;
}

// --- permissions ------------------------------------------------------------

// --- location ---------------------------------------------------------------

// --- steps ------------------------------------------------------------------

/** Handle for a running pedometer watch. */
export type StepWatch = { stop: () => void };

/**
 * Counts steps for the duration of a walk.
 *
 * Returns null when there is no pedometer — many Android devices, every
 * simulator, and any device where motion permission was refused. Callers keep
 * `steps: null` in that case rather than showing a zero.
 */
export async function watchSteps(onSteps: (steps: number) => void): Promise<StepWatch | null> {
  const sensors = loadSensors();

  if (!sensors) {
    return null;
  }

  try {
    if (!(await sensors.Pedometer.isAvailableAsync())) {
      return null;
    }

    const subscription = sensors.Pedometer.watchStepCount((result) => onSteps(result.steps));

    return { stop: () => subscription.remove() };
  } catch {
    return null;
  }
}

// --- ids --------------------------------------------------------------------

/**
 * A stable id for a walk, minted on the device before anything reaches a server.
 *
 * That is what lets a walk recorded in airplane mode sync later without the
 * server having to guess whether it already has it. Falls back to the app's own
 * `createId` when expo-crypto is missing — a weaker id, but the alternative is
 * refusing to start a walk, and any stable id serves the idempotency purpose.
 */
export function createWalkId(): string {
  const crypto = loadCrypto();

  if (crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through.
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("@/lib/id") as typeof import("@/lib/id")).createId();
}
