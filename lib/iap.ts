import { Platform } from "react-native";
import { ensureSignedIn, supabase } from "@/lib/supabase";

/**
 * In-App Purchase wiring for the App Store and Google Play. Two separate
 * products, sold independently:
 *
 *  - Friends & groups — auto-renewable, ₱49/month.
 *  - Unlimited habits & journals — one-off unlock, ₱149.
 *
 * They are deliberately not a tier ladder: someone who only journals can buy
 * unlimited without paying monthly for social features they will not open, and
 * someone who only wants groups is not charged for limits they never hit.
 *
 * Both products must exist in App Store Connect AND Google Play Console under
 * these same ids, and react-native-iap needs a native rebuild before any of this
 * works — every call degrades gracefully (false/null) when the native module
 * is missing, so the JS app still runs in older builds and simulators.
 *
 * ## What differs between the two stores, and why the code has to know
 *
 * The shape of a purchase request is not the same on both, and neither is what
 * "finishing" one means:
 *
 *  1. **Identifying the buyer.** Apple takes `appAccountToken`; Google takes
 *     `obfuscatedAccountId`. Both carry the Supabase user id into the store's
 *     server notifications so the entitlement webhook credits the right account.
 *  2. **Subscriptions need an OFFER on Google.** A Play subscription is a
 *     product plus a base plan plus an offer, and the purchase call wants that
 *     offer's token — which only exists after the product has been fetched.
 *     Apple has no equivalent; the sku alone is the whole request. This is why
 *     the product fetch below is load-bearing on Android rather than a cache
 *     warm-up, and why a missing offer aborts instead of trying anyway.
 *  3. **`finishTransaction` ACKNOWLEDGES on Google.** An unacknowledged Play
 *     purchase is automatically refunded after three days and the entitlement
 *     silently vanishes. On Apple the same call merely clears the transaction
 *     queue. It is the single most important call in this file on Android, which
 *     is why it runs before `settle(true)` on every path rather than after.
 */
export const FRIENDS_SUBSCRIPTION_SKU = "lumo.friends.monthly";

export const UNLIMITED_SKU = "lumo.unlimited.lifetime";

/** What each product is to StoreKit — the subscription renews, the unlock does not. */
type ProductKind = "subs" | "in-app";

const PRODUCT_KIND: Record<string, ProductKind> = {
  [FRIENDS_SUBSCRIPTION_SKU]: "subs",
  [UNLIMITED_SKU]: "in-app"
};

/**
 * The one thing this file needs from a fetched product beyond its price.
 *
 * Declared narrowly rather than reusing the library's `Product | ProductSubscription`
 * union: the union's Android and iOS arms disagree about which fields exist, and
 * every read here is already optional-chained because a store can return a
 * product with no offers at all.
 */
type OfferBearingProduct = {
  id: string;
  subscriptionOffers?: ({ offerTokenAndroid?: string | null }[]) | null;
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

/** The two stores this file knows how to talk to. Everything else — web, and any
 *  build without the native module — is handled as "no store" by the callers. */
function storeAvailable(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

/**
 * Hands one purchase to the `validate-purchase` edge function, which asks the
 * store about it and writes `entitlements` if the store agrees.
 *
 * ## Why nothing here is awaited by the purchase flow
 *
 * By the time this runs the money has already moved and the store has already
 * said yes. Anything that happens after that point — a slow function, an
 * expired session, a Supabase outage — is a problem with Lumo's records, not
 * with the purchase, and must never be reported to the buyer as a failed
 * transaction or delay the screen they are waiting on.
 *
 * The cost of not awaiting is a window where the local entitlement is true and
 * the server row does not exist yet. Two things close it: the launch-time sync
 * below, and the fact that this is retried on every launch until it sticks.
 *
 * Never throws.
 */
async function recordPurchaseServerSide(purchase: {
  productId: string;
  id?: string;
  purchaseToken?: string | null;
}): Promise<void> {
  try {
    await supabase.functions.invoke("validate-purchase", {
      body: {
        productId: purchase.productId,
        platform: Platform.OS,
        // Apple identifies the transaction; Google identifies the token. Both
        // are sent because the server decides which one it needs, and a client
        // that guessed wrong would silently fail verification.
        transactionId: purchase.id,
        purchaseToken: purchase.purchaseToken ?? undefined
      }
    });
  } catch {
    // Ignored on purpose — see the note above.
  }
}

/**
 * Re-verifies everything this store account owns, so entitlements exist
 * server-side for purchases made before verification was deployed.
 *
 * This is what repairs the existing paying subscribers: they bought months ago,
 * no row was ever written for them, and they will never buy again. Their next
 * launch is the only opportunity to notice, so it is taken on every launch
 * rather than once behind a flag.
 *
 * Best-effort and never throws; callers should not await it before rendering.
 */
export async function syncServerEntitlements(): Promise<void> {
  const iap = loadIap();

  if (!iap || !storeAvailable() || !(await connect(iap))) {
    return;
  }

  try {
    const purchases = await iap.getAvailablePurchases();

    await Promise.all(
      purchases
        .filter((entry) => entry.productId in PRODUCT_KIND)
        .map((entry) => recordPurchaseServerSide(entry))
    );
  } catch {
    // Offline, or no store. Next launch tries again.
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
  if (!iap || !storeAvailable() || !(await connect(iap))) {
    return false;
  }

  const kind = PRODUCT_KIND[sku];

  // StoreKit 2 requires the product to be loaded before it can be purchased —
  // requestPurchase throws an "invalid product" error otherwise (the cause of
  // the App Store review IAP failure). Warm the product cache on THIS
  // connection first; best-effort, so a transient miss doesn't hard-block a
  // product that may already be cached from the price fetch.
  //
  // On Google the same call is doing something stronger: it is the ONLY source
  // of the offer token a subscription purchase needs, so a miss here is fatal
  // rather than merely unhelpful. See the Android guard below.
  let products: OfferBearingProduct[] = [];
  try {
    products = ((await iap.fetchProducts({ skus: [sku], type: kind })) ?? []) as OfferBearingProduct[];
  } catch {
    // Ignore and still attempt the purchase.
  }

  // A Play subscription is a product, a base plan and an offer; the purchase
  // call wants the offer's token. Lumo publishes one base plan with no
  // promotional offers, so the first entry is the only entry — but if it is
  // absent the purchase sheet opens and cannot complete, which reads as a hang.
  // Bailing out here surfaces the paywall's own error instead.
  let googleOfferToken: string | null = null;
  if (Platform.OS === "android" && kind === "subs") {
    googleOfferToken =
      products.find((entry) => entry.id === sku)?.subscriptionOffers?.[0]?.offerTokenAndroid ?? null;

    if (!googleOfferToken) {
      return false;
    }
  }

  // Ties the store transaction to this Supabase user — `appAccountToken` on
  // Apple, `obfuscatedAccountId` on Google. Both ride along in the store's
  // server notifications, letting the entitlement webhook credit the right
  // account server-side.
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
      //
      // On Google this call is also the ACKNOWLEDGEMENT. A Play purchase left
      // unacknowledged for three days is refunded automatically and the
      // entitlement disappears with it, so this must run before the promise
      // settles — never as fire-and-forget after it.
      // Fired, not awaited: the purchase is already complete and this must not
      // be able to delay or fail it. See recordPurchaseServerSide.
      void recordPurchaseServerSide(purchase);

      iap
        .finishTransaction({ purchase, isConsumable: false })
        .catch(() => undefined)
        .finally(() => settle(true));
    });
    const errorSub = iap.purchaseErrorListener(() => settle(false));

    const apple = { sku, appAccountToken: userId ?? undefined };
    const google = { skus: [sku], obfuscatedAccountId: userId ?? undefined };

    // Split rather than a computed `type`, because the two request shapes are a
    // discriminated union — only the `subs` branch carries subscriptionOffers.
    const started =
      kind === "subs"
        ? iap.requestPurchase({
            type: "subs",
            request: {
              apple,
              google: {
                ...google,
                subscriptionOffers: googleOfferToken ? [{ sku, offerToken: googleOfferToken }] : []
              }
            }
          })
        : iap.requestPurchase({ type: "in-app", request: { apple, google } });

    started.catch(() => settle(false));
  });
}

/** Owned products this store account can restore. Null when the store is
 *  unreachable (offline, missing native module) so callers can keep the local
 *  entitlement instead of wrongly revoking it. */
async function ownedSkus(): Promise<Set<string> | null> {
  const iap = loadIap();
  if (!iap || !storeAvailable() || !(await connect(iap))) {
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
  return fetchServerProduct(FRIENDS_SUBSCRIPTION_SKU);
}

/** Server-verified ownership of the one-off unlock. Null when signed out or unreachable. */
export async function fetchServerUnlimited(): Promise<boolean | null> {
  return fetchServerProduct(UNLIMITED_SKU);
}

/**
 * One product's server-verified entitlement.
 *
 * Filtered by product id, which it was not before: with a single product any
 * row meant the subscription, and with two it does not. Unfiltered, somebody
 * who bought only the ₱149 unlock would read as a Friends subscriber and be
 * handed groups they never paid for.
 *
 * The one-off unlock is stored with Postgres's `'infinity'` timestamp, which
 * arrives here as the literal string "infinity" — and `Date.parse("infinity")`
 * is NaN, which loses every comparison. So it is checked by name BEFORE any
 * date arithmetic. Without that the ₱149 unlock would verify as unowned for
 * everybody who bought it, which is the exact failure this function exists to
 * prevent.
 */
async function fetchServerProduct(sku: string): Promise<boolean | null> {
  if (!(await ensureSignedIn())) {
    return null;
  }

  const { data, error } = await supabase
    .from("entitlements")
    .select("expires_at")
    .eq("product_id", sku);

  if (error) {
    return null;
  }

  return ((data ?? []) as { expires_at: string }[]).some(
    (row) => row.expires_at === "infinity" || Date.parse(row.expires_at) > Date.now()
  );
}

/** Localized store price ("₱49.00") for display; null when unavailable. */
export async function getProductPrice(sku: string): Promise<string | null> {
  const iap = loadIap();
  if (!iap || !storeAvailable() || !(await connect(iap))) {
    return null;
  }

  try {
    const products = await iap.fetchProducts({ skus: [sku], type: PRODUCT_KIND[sku] });
    return products?.[0]?.displayPrice ?? null;
  } catch {
    return null;
  }
}
