import { JournalEntry } from "@/types/habit";

/**
 * Whether an entry actually holds something the user wrote.
 *
 * Opening the editor and backing straight out used to leave a record behind —
 * the mood defaulted to a value, so the "delete the empty one" branch never
 * fired. Those placeholders are invisible in the list but still count against
 * their day, which is why every per-day check runs through this rather than
 * counting raw records.
 */
export function journalHasContent(entry: JournalEntry) {
  return Boolean(entry.content.trim() || entry.title?.trim() || entry.photoUri);
}
