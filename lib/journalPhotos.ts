import * as FileSystem from "expo-file-system";

/**
 * Journal photo attachments, stored inside the app's Documents directory.
 *
 * WHY ONLY THE FILENAME IS PERSISTED
 * An entry used to store the absolute URI it was copied to:
 *
 *   file:///var/mobile/Containers/Data/Application/<UUID>/Documents/journal-photos/2026-08-06-1.jpg
 *
 * That `<UUID>` is the app's container, and iOS mints a NEW one on every
 * install — which in practice means every rebuild of a dev client, and every
 * TestFlight or App Store update for real users. The FILE survives (iOS moves
 * the Documents contents into the new container); the stored path does not, so
 * every attachment silently turned into a broken image the next time the app
 * launched.
 *
 * So the entry stores `2026-08-06-1.jpg` and the absolute URI is rebuilt from
 * whatever the container happens to be right now. Nothing durable is allowed to
 * hold an absolute path.
 */
const PHOTO_FOLDER = "journal-photos";

/** The photo directory as it stands in THIS launch of the app. */
function photoDirectory() {
  return `${FileSystem.documentDirectory ?? ""}${PHOTO_FOLDER}/`;
}

/**
 * The last path segment, whatever it is handed. Entries saved before this
 * change hold a full absolute URI, so their filename has to be recovered from
 * it — which is also what repairs those attachments rather than leaving them
 * broken for anyone who already had some.
 */
function fileNameOf(stored: string) {
  return stored.split("?")[0].split("/").pop() ?? "";
}

/**
 * Copies a picked image into the app's own storage and returns the value to
 * persist — a bare filename, never a path.
 */
export async function persistJournalPhoto(uri: string, dateKey: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(photoDirectory(), { intermediates: true });

  const extension = uri.split("?")[0].split(".").pop() || "jpg";
  const fileName = `${dateKey}-${Date.now()}.${extension}`;

  await FileSystem.copyAsync({ from: uri, to: `${photoDirectory()}${fileName}` });

  return fileName;
}

/** The absolute URI to render, resolved against this launch's container. */
export function journalPhotoUri(stored?: string): string | undefined {
  if (!stored) {
    return undefined;
  }

  const fileName = fileNameOf(stored);

  return fileName ? `${photoDirectory()}${fileName}` : undefined;
}

/** Deletes the file behind a stored value. Safe to call with anything. */
export async function removeJournalPhoto(stored?: string) {
  const uri = journalPhotoUri(stored);

  if (!uri) {
    return;
  }

  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
