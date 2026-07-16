import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True once real keys are in .env — lets callers keep working offline-first
 * while the backend is being wired up. Only client-safe keys are accepted:
 * the publishable key (sb_publishable_...) or the legacy anon JWT (eyJ...).
 * Secret keys (sb_secret_...) bypass row-level security and must never ship
 * in the app, so they are deliberately rejected here. */
export const isSupabaseConfigured =
  supabaseUrl.startsWith("https://") &&
  (supabaseAnonKey.startsWith("sb_publishable_") || supabaseAnonKey.startsWith("eyJ"));

export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseAnonKey || "placeholder", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No web URL callbacks in a native app.
    detectSessionInUrl: false
  }
});

// Refresh auth tokens only while the app is foregrounded (per the official
// Supabase React Native guide).
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

/**
 * Ensures there is a signed-in Supabase user, creating an anonymous account on
 * first run. Anonymous auth keeps onboarding friction-free; the optional email
 * collected during onboarding can later upgrade the account via
 * `supabase.auth.updateUser({ email })` so the Lumo ID becomes recoverable.
 *
 * Returns the user id, or null when Supabase isn't configured or unreachable
 * (callers treat that as the existing offline mode).
 */
export async function ensureSignedIn(): Promise<string | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      return sessionData.session.user.id;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      return null;
    }
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
