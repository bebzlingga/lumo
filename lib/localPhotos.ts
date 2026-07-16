import * as FileSystem from "expo-file-system";

/**
 * Local staging for picked feature-board photos: the picker cache can be
 * cleared by the OS before upload, so picks are copied into the app's document
 * directory and removed once uploaded (or discarded).
 */
export const FEATURE_PHOTO_DIRECTORY = `${FileSystem.documentDirectory}feature-photos/`;

export async function persistPickedPhoto(uri: string) {
  await FileSystem.makeDirectoryAsync(FEATURE_PHOTO_DIRECTORY, { intermediates: true });
  const extension = uri.split("?")[0].split(".").pop() || "jpg";
  const destination = `${FEATURE_PHOTO_DIRECTORY}${new Date().getTime()}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

export async function removePickedPhoto(uri?: string) {
  if (!uri || !uri.startsWith(FEATURE_PHOTO_DIRECTORY)) {
    return;
  }
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
