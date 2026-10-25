// Supabase Edge Function: sends an Expo push notification when a friend
// request / group invite / cheer / nudge / Move-challenge invite row is
// inserted.
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt
//
// Then create four Database Webhooks (Database → Webhooks), each on INSERT,
// pointing at this function's URL, for the tables:
//   friendships, group_members, group_reactions, move_challenge_invites,
//   move_walk_invites, group_messages
//
// The fourth is what makes a Move invitation arrive while the app is closed.
// Without it the invite still lands — the row is the invitation, and the Move tab
// picks it up on focus — but nobody is told until they next open Lumo.
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

// A Move challenge's title lives in the APP, not the database — the ladder is
// client-side config, so the row only carries "10k-timed". This function has no
// copy of that mapping and should not grow one: a second list of titles on the
// server is a second thing to update when a rung is renamed. The push says which
// friend and where to go; the card in the app names the challenge.
async function moveInviterName(inviter: string): Promise<string> {
  return nickname(inviter);
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
  } else if (table === "group_messages") {
    /**
     * A group message goes to every member EXCEPT its author.
     *
     * The only branch here that notifies more than one person, which is why it
     * returns early rather than falling through to the single-recipient send at the
     * foot of the function. The body is the group's name and who spoke; the message
     * itself is deliberately not in the push — a lock screen is not the place to
     * quote a private conversation, and tapping it opens the thread.
     */
    const members = await rest(
      `group_members?group_id=eq.${record.group_id}&status=eq.accepted&select=member`
    );
    const recipients = (members ?? [])
      .map((row: { member: string }) => row.member)
      .filter((member: string) => member !== record.author);

    if (!recipients.length) {
      return ok();
    }

    const [who, groupLabel] = await Promise.all([nickname(record.author), groupName(record.group_id)]);
    const tokens = (await Promise.all(recipients.map((member: string) => tokensFor(member)))).flat();

    if (tokens.length) {
      await sendExpoPush(tokens, groupLabel, `${who} sent a message.`, { route: `/group/chat?id=${record.group_id}` });
    }

    return ok();
  } else if (table === "move_walk_invites") {
    // An ordinary move happening right now. With a session id there is a Join
    // waiting in the app; without one this is a row from before sessions existed,
    // which was a statement rather than a question — so the two are worded
    // differently and nobody opens the app looking for a button that is not there.
    recipientId = record.recipient;
    title = record.session_id ? "Coming along?" : "Out for a move";
    body = record.session_id
      ? `${await nickname(record.sender)} is out for a move — join them?`
      : `${await nickname(record.sender)} set out for a move with you.`;
    route = "/move";
  } else if (table === "move_challenge_invites") {
    if (record.status !== "pending") {
      return ok();
    }
    recipientId = record.invitee;
    title = "Move invitation";
    body = `${await moveInviterName(record.inviter)} invited you to a Move challenge.`;
    route = "/move";
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
