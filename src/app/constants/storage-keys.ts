/** localStorage key for the Enka UID history (character tab); cleared with the rest of the user data. */
export const UID_HISTORY_STORAGE_KEY = 'zzz_uid_history';

/**
 * localStorage key for the UID whose Enka import last completed on this device (character tab). An
 * import from a different UID that would overwrite builds asks first. Device-local: not in backups;
 * cleared with the rest of the user data.
 */
export const OWNING_UID_STORAGE_KEY = 'zzz_owning_uid';
