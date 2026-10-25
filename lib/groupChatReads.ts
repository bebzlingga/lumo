import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * When this device last looked at each group's chat.
 *
 * ## Why unread lives on the device
 *
 * The alternative is a row per member per message on the server — the largest table
 * in the app by an order of magnitude — to answer a question each device can answer
 * for itself: "what has arrived since I last looked?" A timestamp per group is the
 * whole state, and counting against it is one indexed query (see
 * `friendsService.countUnreadMessages`).
 *
 * The cost is honest and small: unread is per DEVICE, so reading on a phone does not
 * clear the badge on a tablet. For a habit app's group chat that is a fair trade
 * against a table that would dwarf every other one here.
 *
 * Every read fails to an empty map, which reads as "everything is unread" — the safe
 * direction. A badge that should not be there is a glance; a message nobody is told
 * about is the failure that matters.
 */
const READS_KEY = "lumo.groupChat.reads.v1";

type Reads = Record<string, string>;

export async function loadGroupChatReads(): Promise<Reads> {
  try {
    const raw = await AsyncStorage.getItem(READS_KEY);

    return raw ? ((JSON.parse(raw) ?? {}) as Reads) : {};
  } catch {
    return {};
  }
}

/**
 * Stamps a group as read, now.
 *
 * Read-modify-write on purpose rather than holding the map in memory: two screens
 * can stamp different groups within a second of each other (a chat closing while a
 * notification opens another), and a cached map would have one overwrite the other.
 */
export async function markGroupChatRead(groupId: string): Promise<void> {
  try {
    const reads = await loadGroupChatReads();

    await AsyncStorage.setItem(READS_KEY, JSON.stringify({ ...reads, [groupId]: new Date().toISOString() }));
  } catch {
    // A badge that fails to clear is a cosmetic fault, and the next successful
    // stamp fixes it. Never worth failing a screen over.
  }
}

export async function groupChatLastRead(groupId: string): Promise<string | null> {
  return (await loadGroupChatReads())[groupId] ?? null;
}
