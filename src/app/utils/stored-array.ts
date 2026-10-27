export interface StoredArrayRead<T> {
  items: T[];
  /** Set when the stored text was not a JSON array and was copied here; `items` is then empty. */
  backupKey?: string;
  /** The stored text was unreadable and the backup copy failed, so writing the key would destroy it. */
  saveBlocked: boolean;
}

/**
 * Reads a JSON array that a service keeps in localStorage.
 *
 * An unreadable value used to load as an empty list, and the next save then overwrote it.
 * Here it is copied to `<key>-backup` first (or `<key>-backup-<timestamp>` when an older,
 * different backup is already there), so the original text survives the next save.
 */
export function readStoredArray<T>(key: string): StoredArrayRead<T> {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return { items: [], saveBlocked: false };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // The entries are not validated here; callers read them as they always have.
      return { items: parsed as T[], saveBlocked: false };
    }
  } catch {
    // Not valid JSON: handled below, the same as valid JSON that is not an array.
  }

  const backupKey = backUpStoredValue(key, raw);
  return backupKey ? { items: [], backupKey, saveBlocked: false } : { items: [], saveBlocked: true };
}

/** Copies `raw` to a backup key next to `key`. Returns the key used, or null if the copy failed. */
export function backUpStoredValue(key: string, raw: string): string | null {
  let backupKey = `${key}-backup`;
  try {
    const existing = localStorage.getItem(backupKey);
    if (existing !== null && existing !== raw) {
      backupKey = `${backupKey}-${Date.now()}`;
    }
    if (existing !== raw) {
      localStorage.setItem(backupKey, raw);
    }
    console.error(`Saved data under "${key}" could not be read; a copy is kept under "${backupKey}"`);
    return backupKey;
  } catch (error: unknown) {
    console.error(`Saved data under "${key}" could not be read or backed up:`, error);
    return null;
  }
}

/** The notice shown when `readStoredArray` could not read a store; null when it could. `label` is plural, e.g. "builds". */
export function storageReadNotice(label: string, read: StoredArrayRead<unknown>): string | null {
  if (read.saveBlocked) {
    return `Your saved ${label} could not be read. Saving ${label} is paused until you reload the page.`;
  }
  if (read.backupKey) {
    return `Your saved ${label} could not be read. A copy was kept in browser storage as ${read.backupKey}.`;
  }
  return null;
}
