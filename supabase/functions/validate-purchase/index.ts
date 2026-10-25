// Supabase Edge Function: turns a store purchase into a server-verified row in
// `entitlements`.
//
// Deploy:
//   supabase functions deploy validate-purchase
//
// NOTE: no --no-verify-jwt here, unlike send-push. That function is called by
// database webhooks and has no user; this one is called BY THE APP and its
// whole job is to answer "what does THIS person own", so the caller's JWT is
// the input that matters most.
//
// Env (Supabase → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   — injected automatically
//   APPLE_ISSUER_ID       App Store Connect → Users and Access → Integrations
//   APPLE_KEY_ID          the In-App Purchase key's id
//   APPLE_PRIVATE_KEY     the .p8 file's contents, newlines and all
//   APPLE_BUNDLE_ID       com.lumo.habits
//   GOOGLE_SERVICE_ACCOUNT_JSON  the Play service account key, whole JSON
//   ANDROID_PACKAGE_NAME  com.lumo.habits
//
// Apple and Google credentials are independent: with only Apple's set, iOS
// verifies and Android returns "unverified" rather than failing the deploy.
//
// ## Why the app is not trusted about what it owns
//
// Everything the client sends here is a claim. A transaction id is a string,
// and a patched build can send any string it likes. So nothing in the request
// body reaches the database: the id is used only to ASK the store, and what the
// store answers is what gets written. The request is a question, not a record.
//
// ## Why this fails closed
//
// Every path that cannot reach a definite "yes, they own it, until this date"
// writes nothing and reports it. A verification that granted access when the
// store was unreachable would be a paywall anybody could bypass by breaking
// their network at the right moment.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FRIENDS_SKU = "lumo.friends.monthly";
const UNLIMITED_SKU = "lumo.unlimited.lifetime";

/** Postgres understands this as "later than every possible now()". */
const NEVER = "infinity";

type Verdict =
  | { owned: true; productId: string; expiresAt: string; transactionId: string }
  | { owned: false; reason: string };

// --- small helpers ----------------------------------------------------------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/**
 * Reads a JWS payload WITHOUT verifying its signature.
 *
 * Safe only because of where these strings come from: both callers below have
 * just received them over TLS from an endpoint they authenticated to with a
 * private key. The signature would prove the same thing the transport already
 * proved. This must never be pointed at a JWS that arrived from the client.
 */
function readJwsPayload(jws: string): Record<string, unknown> {
  const middle = jws.split(".")[1];
  const padded = middle.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)));
}

async function signJwt(
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
  key: CryptoKey,
  algorithm: AlgorithmIdentifier | EcdsaParams
): Promise<string> {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(algorithm, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}

// --- Apple ------------------------------------------------------------------

/**
 * Bearer token for the App Store Server API. Short-lived by Apple's rule
 * (20 minutes maximum) and cheap to mint, so it is made per request rather than
 * cached — a cache here would be one more thing that can go stale in a process
 * that may only handle a handful of calls before it is recycled.
 */
async function appleToken(): Promise<string> {
  const pem = Deno.env.get("APPLE_PRIVATE_KEY")!;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);

  return signJwt(
    { alg: "ES256", kid: Deno.env.get("APPLE_KEY_ID"), typ: "JWT" },
    {
      iss: Deno.env.get("APPLE_ISSUER_ID"),
      iat: now,
      exp: now + 15 * 60,
      aud: "appstoreconnect-v1",
      bid: Deno.env.get("APPLE_BUNDLE_ID")
    },
    key,
    // WebCrypto returns ECDSA signatures as raw r||s, which is exactly the
    // 64-byte form JWS ES256 wants — no DER unwrapping needed.
    { name: "ECDSA", hash: "SHA-256" }
  );
}

async function verifyApple(transactionId: string): Promise<Verdict> {
  if (!Deno.env.get("APPLE_PRIVATE_KEY")) {
    return { owned: false, reason: "apple-not-configured" };
  }

  const token = await appleToken();

  // Production first, then sandbox. Apple does not tell you which environment a
  // transaction belongs to, and TestFlight builds transact against sandbox
  // while pointing at the same app record — so a 404 from production is not
  // "no such purchase", it is "ask the other one".
  const hosts = ["https://api.storekit.itunes.apple.com", "https://api.storekit-sandbox.itunes.apple.com"];

  for (const host of hosts) {
    const response = await fetch(`${host}/inApps/v1/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      return { owned: false, reason: `apple-http-${response.status}` };
    }

    const { signedTransactionInfo } = await response.json();
    const claims = readJwsPayload(signedTransactionInfo) as {
      productId?: string;
      expiresDate?: number;
      originalTransactionId?: string;
      revocationDate?: number;
    };

    // A refunded or family-revoked purchase still resolves here; the revocation
    // date is the only thing that says so.
    if (claims.revocationDate) {
      return { owned: false, reason: "apple-revoked" };
    }

    if (!claims.productId) {
      return { owned: false, reason: "apple-malformed" };
    }

    return {
      owned: true,
      productId: claims.productId,
      // A non-consumable carries no expiry; a subscription always does.
      expiresAt: claims.expiresDate ? new Date(claims.expiresDate).toISOString() : NEVER,
      transactionId: claims.originalTransactionId ?? transactionId
    };
  }

  return { owned: false, reason: "apple-unknown-transaction" };
}

// --- Google -----------------------------------------------------------------

async function googleToken(): Promise<string | null> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

  if (!raw) {
    return null;
  }

  const account = JSON.parse(raw) as { client_email: string; private_key: string };
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    },
    key,
    "RSASSA-PKCS1-v1_5"
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()).access_token ?? null;
}

async function verifyGoogle(productId: string, purchaseToken: string): Promise<Verdict> {
  const token = await googleToken();

  if (!token) {
    return { owned: false, reason: "google-not-configured" };
  }

  const pkg = Deno.env.get("ANDROID_PACKAGE_NAME") ?? "com.lumo.habits";
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases`;
  const auth = { Authorization: `Bearer ${token}` };

  // The two product kinds live at different endpoints and answer in different
  // shapes, which is why the sku decides the call rather than a generic lookup.
  if (productId === FRIENDS_SKU) {
    const response = await fetch(`${base}/subscriptionsv2/tokens/${purchaseToken}`, { headers: auth });

    if (!response.ok) {
      return { owned: false, reason: `google-http-${response.status}` };
    }

    const body = await response.json() as {
      subscriptionState?: string;
      lineItems?: { expiryTime?: string }[];
    };

    // Only these two states are somebody who should have the feature. Notably
    // ON_HOLD and PAUSED are not: the subscription exists but is not paid up.
    const active =
      body.subscriptionState === "SUBSCRIPTION_STATE_ACTIVE" ||
      body.subscriptionState === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD";

    if (!active) {
      return { owned: false, reason: `google-${body.subscriptionState ?? "unknown-state"}` };
    }

    const expiry = body.lineItems?.[0]?.expiryTime;

    if (!expiry) {
      return { owned: false, reason: "google-no-expiry" };
    }

    return { owned: true, productId, expiresAt: expiry, transactionId: purchaseToken };
  }

  const response = await fetch(`${base}/products/${productId}/tokens/${purchaseToken}`, { headers: auth });

  if (!response.ok) {
    return { owned: false, reason: `google-http-${response.status}` };
  }

  const body = await response.json() as { purchaseState?: number };

  // 0 = purchased. 1 = cancelled, 2 = pending — neither is ownership, and
  // pending in particular is a purchase that may still fail.
  if (body.purchaseState !== 0) {
    return { owned: false, reason: `google-purchase-state-${body.purchaseState}` };
  }

  return { owned: true, productId, expiresAt: NEVER, transactionId: purchaseToken };
}

// --- entry point ------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  // Who is asking. Taken from the token, never from the body — the body is the
  // one thing here a modified client controls completely.
  const authorization = request.headers.get("Authorization") ?? "";
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: SERVICE_KEY }
  });

  if (!who.ok) {
    return json({ error: "not signed in" }, 401);
  }

  const userId = (await who.json())?.id;

  if (!userId) {
    return json({ error: "not signed in" }, 401);
  }

  let body: { productId?: string; transactionId?: string; purchaseToken?: string; platform?: string };

  try {
    body = await request.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  const { productId, transactionId, purchaseToken, platform } = body;

  if (productId !== FRIENDS_SKU && productId !== UNLIMITED_SKU) {
    return json({ error: "unknown product" }, 400);
  }

  const verdict =
    platform === "android"
      ? purchaseToken
        ? await verifyGoogle(productId, purchaseToken)
        : ({ owned: false, reason: "missing-purchase-token" } as Verdict)
      : transactionId
        ? await verifyApple(transactionId)
        : ({ owned: false, reason: "missing-transaction-id" } as Verdict);

  if (!verdict.owned) {
    return json({ entitled: false, reason: verdict.reason });
  }

  // The store may name a different product than the client claimed — a renewal
  // resolving to the base sku, say. The store's answer wins.
  const upsert = await fetch(`${SUPABASE_URL}/rest/v1/entitlements?on_conflict=user_id,product_id`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      user_id: userId,
      product_id: verdict.productId,
      expires_at: verdict.expiresAt,
      original_transaction_id: verdict.transactionId,
      updated_at: new Date().toISOString()
    })
  });

  if (!upsert.ok) {
    return json({ entitled: false, reason: `store-write-${upsert.status}` }, 500);
  }

  return json({ entitled: true, productId: verdict.productId, expiresAt: verdict.expiresAt });
});
