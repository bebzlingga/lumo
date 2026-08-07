import { Platform } from "react-native";
import { ensureSignedIn, supabase } from "@/lib/supabase";

/**
 * Apple In-App Purchase wiring. Two separate products, sold independently:
 *
 *  - Friends & groups — auto-renewable, ₱49/month.
 *  - Unlimited habits & journals — one-off unlock, ₱149.
 *
 * They are deliberately not a tier ladder: someone who only journals can buy
 * unlimited without paying monthly for social features they will not open, and
 * someone who only wants groups is not charged for limits they never hit.
 *
 * Both products must exist in App Store Connect under these ids, and
 * react-native-iap needs a native rebuild (pod install) before any of this
 * works — every call degrades gracefully (false/null) when the native module
 * is missing, so the JS app still runs in older builds and simulators.
 */
export const FRIENDS_SUBSCRIPTION_SKU = "lumo.friends.monthly";

export const UNLIMITED_SKU = "lumo.unlimited.lifetime";

/** What each product is to StoreKit — the subscription renews, the unlock does not. */
type ProductKind = "subs" | "in-app";

const PRODUCT_KIND: Record<string, ProductKind> = {
  [FRIENDS_SUBSCRIPTION_SKU]: "subs",
  [UNLIMITED_SKU]: "in-app"
};

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

/**
 * Starts the App Store purchase flow for one product. Resolves once the
 * transaction settles.
 *
 * One function for both products rather than one each: the only thing that
 * differs between them is the sku and its StoreKit kind, and the fiddly parts
 * — warming the product cache, tying the transaction to the Supabase user,
 * tearing the listeners down on every exit path — are exactly the parts that
 * would rot if there were two copies.
 */
async function purchase(sku: string): Promise<boolean> {
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
    await iap.fetchProducts({ skus: [sku], type: PRODUCT_KIND[sku] });
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
      if (purchase.productId !== sku) {
        return;
      }

      // Neither product is consumable: the subscription renews on its own and
      // the unlock is owned forever, so both must stay in the purchase history
      // for restore to find them.
      iap
        .finishTransaction({ purchase, isConsumable: false })
        .catch(() => undefined)
        .finally(() => settle(true));
    });
    const errorSub = iap.purchaseErrorListener(() => settle(false));

    iap
      .requestPurchase({
        request: { apple: { sku, appAccountToken: userId ?? undefined } },
        type: PRODUCT_KIND[sku] === "subs" ? "subs" : "in-app"
      })
      .catch(() => settle(false));
  });
}

/** Owned products this Apple ID can restore. Null when the store is
 *  unreachable (offline, missing native module) so callers can keep the local
 *  entitlement instead of wrongly revoking it. */
async function ownedSkus(): Promise<Set<string> | null> {
  const iap = loadIap();
  if (!iap || Platform.OS !== "ios" || !(await connect(iap))) {
    return null;
  }

  try {
    const purchases = await iap.getAvailablePurchases();
    return new Set(purchases.map((entry) => entry.productId));
  } catch {
    return null;
  }
}

export function purchaseFriendsSubscription(): Promise<boolean> {
  return purchase(FRIENDS_SUBSCRIPTION_SKU);
}

export function purchaseUnlimited(): Promise<boolean> {
  return purchase(UNLIMITED_SKU);
}

/** Whether the Friends subscription is active on this Apple ID. */
export async function restoreFriendsSubscription(): Promise<boolean | null> {
  const owned = await ownedSkus();
  return owned ? owned.has(FRIENDS_SUBSCRIPTION_SKU) : null;
}

/** Whether the unlimited unlock has been bought on this Apple ID. */
export async function restoreUnlimited(): Promise<boolean | null> {
  const owned = await ownedSkus();
  return owned ? owned.has(UNLIMITED_SKU) : null;
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
export async function getProductPrice(sku: string): Promise<string | null> {
  const iap = loadIap();
  if (!iap || Platform.OS !== "ios" || !(await connect(iap))) {
    return null;
  }

  try {
    const products = await iap.fetchProducts({ skus: [sku], type: PRODUCT_KIND[sku] });
    return products?.[0]?.displayPrice ?? null;
  } catch {
    return null;
  }
}
