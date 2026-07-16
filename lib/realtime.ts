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
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
