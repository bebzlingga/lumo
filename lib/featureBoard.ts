import * as FileSystem from "expo-file-system/legacy";
import type { AvatarConfig } from "@/lib/avatar";
import { ensureSignedIn, isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { FeatureRequest, FeatureRequestType } from "@/types/habit";

export type RequestVoter = {
  lumoId: string;
  nickname: string;
  avatar?: AvatarConfig;
  /** ISO timestamp of when the vote was cast. */
  votedAt: string;
};

export type RequestUpdate = {
  id: string;
  body: string;
  createdAt: string;
};

/**
 * Cloud feature-request board (see the feature_requests / feature_votes tables
 * and the feature-photos bucket in supabase/schema.sql). Reads resolve empty
 * and writes resolve false when Supabase is unconfigured or unreachable.
 */

const PHOTO_BUCKET = "feature-photos";

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Minimal base64 decoder — avoids depending on global atob, which is not
// guaranteed across Hermes versions.
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;

  for (let index = 0; index < clean.length; index += 4) {
    const chunk =
      (BASE64_CHARS.indexOf(clean[index]) << 18) |
      (BASE64_CHARS.indexOf(clean[index + 1]) << 12) |
      ((BASE64_CHARS.indexOf(clean[index + 2]) & 63) << 6) |
      (BASE64_CHARS.indexOf(clean[index + 3]) & 63);

    bytes[byteIndex++] = (chunk >> 16) & 255;
    if (clean[index + 2] !== undefined) {
      bytes[byteIndex++] = (chunk >> 8) & 255;
    }
    if (clean[index + 3] !== undefined) {
      bytes[byteIndex++] = chunk & 255;
    }
  }

  return bytes;
}

async function uploadPhoto(userId: string, uri: string): Promise<string | null> {
  try {
    const extension = (uri.split("?")[0].split(".").pop() || "jpg").toLowerCase();
    const contentType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
    const path = `${userId}/${Date.now().toString(36)}.${extension}`;
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const bytes = base64ToBytes(base64);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, body, { contentType });

    return error ? null : path;
  } catch {
    return null;
  }
}

function photoUrl(path: string | null): string | undefined {
  if (!path) {
    return undefined;
  }

  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

type RequestRow = {
  id: string;
  author: string;
  title: string;
  description: string | null;
  type: FeatureRequestType;
  photo_path: string | null;
  status: FeatureRequest["status"];
  created_at: string;
  feature_votes: { voter: string }[];
  profiles: { nickname: string | null } | null;
};

// profiles must name the author FK: feature_votes also links requests to
// profiles (many-to-many), so a bare profiles() embed is ambiguous (PGRST201).
const REQUEST_COLUMNS =
  "id, author, title, description, type, photo_path, status, created_at, feature_votes(voter), profiles!feature_requests_author_fkey(nickname)";

function mapRequestRow(row: RequestRow, userId: string): FeatureRequest {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.type ?? "feature",
    photoUri: photoUrl(row.photo_path),
    votes: (row.feature_votes ?? []).length,
    votedByMe: (row.feature_votes ?? []).some((vote) => vote.voter === userId),
    mine: row.author === userId,
    status: row.status,
    createdAt: row.created_at,
    authorName: row.profiles?.nickname?.trim() || undefined
  };
}

export const featureBoardService = {
  status(): "offline" | "ready" {
    return isSupabaseConfigured ? "ready" : "offline";
  },

  async listRequests(): Promise<FeatureRequest[]> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return [];
    }

    const { data } = await supabase.from("feature_requests").select(REQUEST_COLUMNS).order("created_at", { ascending: false });

    return ((data ?? []) as unknown as RequestRow[]).map((row) => mapRequestRow(row, userId));
  },

  async getRequest(id: string): Promise<FeatureRequest | null> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return null;
    }

    const { data } = await supabase.from("feature_requests").select(REQUEST_COLUMNS).eq("id", id).maybeSingle();

    return data ? mapRequestRow(data as unknown as RequestRow, userId) : null;
  },

  /** Voters for a request, newest first, paginated for the detail screen. */
  async listVoters(requestId: string, offset: number, limit = 10): Promise<RequestVoter[]> {
    if (!(await ensureSignedIn())) {
      return [];
    }

    const { data } = await supabase
      .from("feature_votes")
      .select("created_at, profiles(id, lumo_id, nickname, avatar)")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    type VoterRow = {
      created_at: string;
      profiles: { id: string; lumo_id: string; nickname: string | null; avatar: AvatarConfig | null } | null;
    };

    return ((data ?? []) as unknown as VoterRow[])
      .filter((row) => row.profiles)
      .map((row) => ({
        lumoId: row.profiles!.lumo_id,
        nickname: row.profiles!.nickname ?? "",
        avatar: row.profiles!.avatar ?? undefined,
        votedAt: row.created_at
      }));
  },

  /** Creates a request, uploading the single optional photo first. */
  async submitRequest({
    title,
    description,
    photoUri,
    type = "feature"
  }: {
    title: string;
    description?: string;
    photoUri?: string;
    type?: FeatureRequestType;
  }): Promise<boolean> {
    const userId = await ensureSignedIn();
    const cleanTitle = title.trim();
    if (!userId || !cleanTitle) {
      return false;
    }

    const photoPath = photoUri ? await uploadPhoto(userId, photoUri) : null;
    const { error } = await supabase.from("feature_requests").insert({
      author: userId,
      title: cleanTitle,
      description: description?.trim() || null,
      type,
      photo_path: photoPath
    });

    return !error;
  },

  /**
   * Edits the owner's request. The database only permits this until someone
   * else has voted (RLS policy), so a locked request updates zero rows —
   * detected via the returned row and reported as false. When `photo.changed`
   * is set, a local `photo.uri` replaces the stored photo (undefined removes
   * it) and the old storage object is cleaned up best-effort.
   */
  async updateRequest(
    id: string,
    fields: { title: string; description?: string; type?: FeatureRequestType; photo?: { changed: boolean; uri?: string } }
  ): Promise<boolean> {
    const userId = await ensureSignedIn();
    const cleanTitle = fields.title.trim();
    if (!userId || !cleanTitle) {
      return false;
    }

    const patch: Record<string, unknown> = {
      title: cleanTitle,
      description: fields.description?.trim() || null
    };
    if (fields.type) {
      patch.type = fields.type;
    }

    let oldPhotoPath: string | null = null;
    if (fields.photo?.changed) {
      const { data: existing } = await supabase.from("feature_requests").select("photo_path").eq("id", id).maybeSingle();
      oldPhotoPath = (existing as { photo_path: string | null } | null)?.photo_path ?? null;
      patch.photo_path = fields.photo.uri ? await uploadPhoto(userId, fields.photo.uri) : null;
    }

    const { data, error } = await supabase.from("feature_requests").update(patch).eq("id", id).select("id");
    const ok = !error && ((data ?? []) as { id: string }[]).length > 0;

    if (ok && fields.photo?.changed && oldPhotoPath && oldPhotoPath !== patch.photo_path) {
      supabase.storage
        .from(PHOTO_BUCKET)
        .remove([oldPhotoPath])
        .then(() => undefined, () => undefined);
    }

    return ok;
  },

  /** Owner's appended updates, oldest first (they read as a timeline). */
  async listUpdates(requestId: string): Promise<RequestUpdate[]> {
    if (!(await ensureSignedIn())) {
      return [];
    }

    const { data } = await supabase
      .from("request_updates")
      .select("id, body, created_at")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });

    type UpdateRow = { id: string; body: string; created_at: string };

    return ((data ?? []) as UpdateRow[]).map((row) => ({ id: row.id, body: row.body, createdAt: row.created_at }));
  },

  async addUpdate(requestId: string, body: string): Promise<boolean> {
    const userId = await ensureSignedIn();
    const cleanBody = body.trim();
    if (!userId || !cleanBody) {
      return false;
    }

    const { error } = await supabase.from("request_updates").insert({ request_id: requestId, author: userId, body: cleanBody });

    return !error;
  },

  /** Deletes the owner's request (votes, updates, and rows cascade). */
  async deleteRequest(id: string): Promise<boolean> {
    if (!(await ensureSignedIn())) {
      return false;
    }

    const { data, error } = await supabase.from("feature_requests").delete().eq("id", id).select("id");

    return !error && ((data ?? []) as { id: string }[]).length > 0;
  },

  async deleteUpdate(updateId: string): Promise<boolean> {
    if (!(await ensureSignedIn())) {
      return false;
    }

    // RLS silently skips rows the caller doesn't own — verify one was removed.
    const { data, error } = await supabase.from("request_updates").delete().eq("id", updateId).select("id");

    return !error && ((data ?? []) as { id: string }[]).length > 0;
  },

  async setVote(requestId: string, voted: boolean): Promise<boolean> {
    const userId = await ensureSignedIn();
    if (!userId) {
      return false;
    }

    const { error } = voted
      ? await supabase.from("feature_votes").insert({ request_id: requestId, voter: userId })
      : await supabase.from("feature_votes").delete().eq("request_id", requestId).eq("voter", userId);

    return !error;
  }
};
