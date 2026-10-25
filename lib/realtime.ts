import { GROUP_CHAT_ENABLED } from "@/lib/friends";
import { notifyMoveInvitesChanged } from "@/lib/move/challengeClient";
import { findVariant } from "@/lib/move/challengeDefs";
import { presentLocalNotification } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";

// Live in-app notifications (Supabase Realtime). While the app is foregrounded
// this presents a local banner the instant a friend request / group invite /
// cheer / nudge row lands. RLS applies to realtime too, so a client only
// receives rows it's allowed to read (its own).
//
// Background delivery (app closed) is handled separately by the push Edge
// Function (supabase/functions/send-push) — see that file's header.

async function nicknameFor(userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("nickname").eq("id", userId).maybeSingle();
  return (data as { nickname: string | null } | null)?.nickname?.trim() || "Someone";
}

async function groupNameFor(groupId: string): Promise<string> {
  const { data } = await supabase.from("groups").select("name").eq("id", groupId).maybeSingle();
  return (data as { name: string } | null)?.name || "a group";
}

/**
 * What a Move challenge is called, resolved from its variant id.
 *
 * The title is not on the row: the ladder is client-side config, so the server
 * stores "10k-timed" and this build decides what that means (see
 * `challengeDefs`). Falls back to a plain noun rather than the raw id — "invited
 * you to 10k-timed" reads like a leaked database field.
 *
 * Readable at all only because an invitee may now select a challenge they were
 * invited to; before that policy this lookup would have returned nothing.
 */
async function moveChallengeTitleFor(challengeId: string): Promise<string> {
  const { data } = await supabase.from("move_challenges").select("variant_id").eq("id", challengeId).maybeSingle();
  const variantId = (data as { variant_id: string } | null)?.variant_id;

  return (variantId ? findVariant(variantId)?.title : null) ?? "a Move challenge";
}

/**
 * Subscribes to this user's incoming social events and shows a local banner
 * for each. `onChange` (optional) fires too, so screens can refresh live.
 * Returns an unsubscribe function.
 */
export function subscribeToUserNotifications(userId: string, onChange?: () => void): () => void {
  const channel = supabase
    .channel(`notify-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "friendships", filter: `addressee=eq.${userId}` },
      async (payload) => {
        const name = await nicknameFor((payload.new as { requester: string }).requester);
        presentLocalNotification("New friend request", `${name} wants to be friends on Lumo.`, { route: "/profile" });
        onChange?.();
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "group_members", filter: `member=eq.${userId}` },
      async (payload) => {
        const row = payload.new as { group_id: string; status: string };
        if (row.status !== "pending") {
          return;
        }
        const groupName = await groupNameFor(row.group_id);
        presentLocalNotification("Group invitation", `You've been invited to ${groupName}.`, { route: "/profile" });
        onChange?.();
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "group_reactions", filter: `recipient=eq.${userId}` },
      async (payload) => {
        const row = payload.new as { group_id: string; sender: string; kind: "cheer" | "nudge" };
        const name = await nicknameFor(row.sender);
        presentLocalNotification(
          row.kind === "cheer" ? "You got a cheer" : "You got a nudge",
          row.kind === "cheer" ? `${name} cheered you on!` : `${name} nudged you to check in.`,
          { route: `/group/${row.group_id}` }
        );
        onChange?.();
      }
    )
    /**
     * A friend asking you onto a Move challenge.
     *
     * Rings the Move tab as well as showing the banner, because unlike the three
     * above this one has a card waiting for an answer: without
     * `notifyMoveInvitesChanged` the invitation would not appear until the tab
     * was next focused, which on the tab you are already standing on is never.
     *
     * The route is `/move` rather than a screen of its own — the card lives at
     * the top of that tab, with the details and both buttons on it.
     */
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "move_challenge_invites", filter: `invitee=eq.${userId}` },
      async (payload) => {
        const row = payload.new as { challenge_id: string; inviter: string; status: string };

        // Only a fresh ask. The same row is UPDATEd when it is answered, and this
        // is an INSERT subscription — but a re-invite arrives as an upsert, so the
        // status is checked rather than assumed.
        if (row.status !== "pending") {
          return;
        }

        const [name, title] = await Promise.all([nicknameFor(row.inviter), moveChallengeTitleFor(row.challenge_id)]);

        presentLocalNotification("Move invitation", `${name} invited you to ${title}.`, { route: "/move" });
        notifyMoveInvitesChanged();
        onChange?.();
      }
    )
    /**
     * A friend heading out on an ordinary move and asking you along.
     *
     * Rings the Move tab as well as banner, exactly like the challenge invite: this
     * one has a card with Join and Not now on it, and a walk somebody is on right
     * now is the worst possible thing to hold until the next focus.
     *
     * The wording turns on whether there is a session to join. A row without one is
     * the notification-only invite this feature started as — kept working rather
     * than dropped, because an older build's rows are still in the table.
     */
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "move_walk_invites", filter: `recipient=eq.${userId}` },
      async (payload) => {
        const row = payload.new as { sender: string; session_id: string | null };
        const name = await nicknameFor(row.sender);

        presentLocalNotification(
          row.session_id ? "Coming along?" : "Out for a move",
          row.session_id ? `${name} is out for a move — join them?` : `${name} set out for a move with you.`,
          { route: "/move" }
        );
        notifyMoveInvitesChanged();
        onChange?.();
      }
    )
    /**
     * A shared walk ending — which hides every invitation to it.
     *
     * No banner: nobody needs telling that something they were not obliged to answer
     * is over. It only rings the tab, so a card for a finished walk goes while
     * somebody is looking at it rather than waiting for the next time they open Move.
     *
     * Unfiltered, and it does not need to be: RLS applies to realtime, and only this
     * session's owner, its participants and its invitees can read the row at all. An
     * UPDATE also carries the new record by default, so unlike a delete this needs
     * nothing special of the table.
     */
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "move_walk_sessions" },
      () => {
        notifyMoveInvitesChanged();
        onChange?.();
      }
    )
    /**
     * A message in a group you are in.
     *
     * UNFILTERED, unlike everything above it — a message names a group, not a
     * recipient, so there is no column to match on. RLS does the work: the select
     * policy on `group_messages` is `is_group_member`, so a client is only sent
     * messages from groups it belongs to.
     *
     * Which means the one thing this must do itself is drop its OWN messages. They
     * arrive down the same channel, and a banner for the sentence you just typed is
     * the most annoying notification an app can produce.
     */
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages" }, async (payload) => {
      const row = payload.new as { group_id: string; author: string };

      // Hidden feature, silent notification: a banner that opens a screen with no
      // way into it would be the app contradicting itself. See GROUP_CHAT_ENABLED.
      if (!GROUP_CHAT_ENABLED || row.author === userId) {
        return;
      }

      const [name, groupName] = await Promise.all([nicknameFor(row.author), groupNameFor(row.group_id)]);

      presentLocalNotification(groupName, `${name} sent a message.`, { route: `/group/chat?id=${row.group_id}` });
      onChange?.();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
