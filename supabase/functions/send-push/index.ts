// Supabase Edge Function: sends an Expo push notification when a friend
// request / group invite / cheer / nudge row is inserted.
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt
//
// Then create three Database Webhooks (Database → Webhooks), each on INSERT,
// pointing at this function's URL, for the tables:
//   friendships, group_members, group_reactions
//
// Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const rest = (path: string) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  }).then((r) => r.json());

async function nickname(userId: string): Promise<string> {
  const rows = await rest(`profiles?id=eq.${userId}&select=nickname`);
  return (rows?.[0]?.nickname || "").trim() || "Someone";
}

async function groupName(groupId: string): Promise<string> {
  const rows = await rest(`groups?id=eq.${groupId}&select=name`);
  return rows?.[0]?.name || "a group";
}

async function tokensFor(userId: string): Promise<string[]> {
  const rows = await rest(`device_tokens?user_id=eq.${userId}&select=token`);
  return (rows ?? []).map((r: { token: string }) => r.token);
}

async function sendExpoPush(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  const messages = tokens.map((to) => ({ to, title, body, data, sound: "default" }));
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages)
  });
}

const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  let payload: { type?: string; table?: string; record?: Record<string, string> };
  try {
    payload = await req.json();
  } catch {
    return ok();
  }

  const { type, table, record } = payload;
  if (type !== "INSERT" || !record) {
    return ok();
  }

  let recipientId: string | undefined;
  let title = "";
  let body = "";
  let route = "/profile";

  if (table === "friendships") {
    recipientId = record.addressee;
    const name = await nickname(record.requester);
    title = "New friend request";
    body = `${name} wants to be friends on Lumo.`;
  } else if (table === "group_members") {
    if (record.status !== "pending") {
      return ok();
    }
    recipientId = record.member;
    title = "Group invitation";
    body = `You've been invited to ${await groupName(record.group_id)}.`;
  } else if (table === "group_reactions") {
    recipientId = record.recipient;
    const name = await nickname(record.sender);
    title = record.kind === "cheer" ? "You got a cheer" : "You got a nudge";
    body = record.kind === "cheer" ? `${name} cheered you on!` : `${name} nudged you to check in.`;
    route = `/group/${record.group_id}`;
  } else {
    return ok();
  }

  if (!recipientId) {
    return ok();
  }

  const tokens = await tokensFor(recipientId);
  if (tokens.length) {
    await sendExpoPush(tokens, title, body, { route });
  }

  return ok();
});
