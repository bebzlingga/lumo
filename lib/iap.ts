import { Platform } from "react-native";
import { ensureSignedIn, supabase } from "@/lib/supabase";

/**
 * Apple In-App Purchase wiring for the Friends & Feature Board subscription
 * (auto-renewable, ₱49/month). The product must exist in App Store Connect
 * under this id, and react-native-iap needs a native rebuild (pod install)
 * before any of this works — every call degrades gracefully (false/null)
 * when the native module is missing, so the JS app still runs in older
 * builds and simulators.
 */
export const FRIENDS_SUBSCRIPTION_SKU = "lumo.friends.monthly";

type IapModule = typeof import("react-native-iap");

let iapModule: IapModule | null | undefined;

function loadIap(): IapModule | null {
  if (iapModule !== undefined) {
    return iapModule;
  }

  try {
    // Deferred require: importing at module scope would crash builds that
    // haven't linked the native module yet.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    iapModule = require("react-native-iap") as IapModule;
  } catch {
    iapModule = null;
  }

  return iapModule;
}

async function connect(iap: IapModule): Promise<boolean> {
  try {
    await iap.initConnection();
    return true;
  } catch {
    return false;
  }
}

/** Starts the App Store purchase flow. Resolves once the transaction settles. */
export async function purchaseFriendsSubscription(): Promise<boolean> {
  const iap = loadIap();
  if (!iap || Platform.OS !== "ios" || !(await connect(iap))) {
    return false;
  }

  // StoreKit 2 requires the product to be loaded before it can be purchased —
  // requestPurchase throws an "invalid product" error otherwise (the cause of
  // the App Store review IAP failure). Warm the product cache on THIS
  // connection first; best-effort, so a transient miss doesn't hard-block a
  // product that may already be cached from the price fetch.
  try {
    await iap.fetchProducts({ skus: [FRIENDS_SUBSCRIPTION_SKU], type: "subs" });
  } catch {
    // Ignore and still attempt the purchase.
  }

  // Ties the Apple transaction to this Supabase user: appAccountToken rides
  // along in App Store Server Notifications, letting the entitlement webhook
  // credit the right account server-side.
  const userId = await ensureSignedIn();

  return new Promise<boolean>((resolve) => {
    const settle = (result: boolean) => {
      purchaseSub.remove();
      errorSub.remove();
      resolve(result);
    };

    const purchaseSub = iap.purchaseUpdatedListener((purchase) => {
      if (purchase.productId !== FRIENDS_SUBSCRIPTION_SKU) {
        return;
      }

      iap
        .finishTransaction({ purchase, isConsumable: false })
        .catch(() => undefined)
        .finally(() => settle(true));
    });
    const errorSub = iap.purchaseErrorListener(() => settle(false));

    iap
      .requestPurchase({
        request: { apple: { sku: FRIENDS_SUBSCRIPTION_SKU, appAccountToken: userId ?? undefined } },
        type: "subs"
      })
      .catch(() => settle(false));
  });
}

/**
 * Checks the store for an active subscription. Returns null when the store is
 * unreachable (offline, missing native module) so callers can keep the local
 * entitlement instead of wrongly revoking it.
 */
export async function restoreFriendsSubscription(): Promise<boolean | null> {
  const iap = loadIap();
  if (!iap || Platform.OS !== "ios" || !(await connect(iap))) {
    return null;
  }

  try {
    const purchases = await iap.getAvailablePurchases();
    return purchases.some((purchase) => purchase.productId === FRIENDS_SUBSCRIPTION_SKU);
  } catch {
    return null;
  }
}

/**
 * Server-verified entitlement from the Supabase `entitlements` table (written
 * only by server-side receipt validation — see supabase/schema.sql). This is
 * the authoritative check; returns null when signed out or unreachable.
 */
export async function fetchServerEntitlement(): Promise<boolean | null> {
  if (!(await ensureSignedIn())) {
    return null;
  }

  const { data, error } = await supabase.from("entitlements").select("expires_at");

  if (error) {
    return null;
  }

  return ((data ?? []) as { expires_at: string }[]).some((row) => Date.parse(row.expires_at) > Date.now());
}

/** Localized store price ("₱49.00") for display; null when unavailable. */
export async function getFriendsSubscriptionPrice(): Promise<string | null> {
  const iap = loadIap();
  if (!iap || Platform.OS !== "ios" || !(await connect(iap))) {
    return null;
  }

  try {
    const products = await iap.fetchProducts({ skus: [FRIENDS_SUBSCRIPTION_SKU], type: "subs" });
    return products?.[0]?.displayPrice ?? null;
  } catch {
    return null;
  }
}
