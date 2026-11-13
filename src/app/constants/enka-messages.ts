// User-facing Enka import messages shared by EnkaApiService and the character tab. They live here,
// not in the service, because the character tab loads the service lazily and must not import it
// eagerly just for a string. Wording chosen by the user on 2026-11-12 (trunk's text).

/** Shown when a build has no Worker URL (forks, local builds without `environment.local.ts`). */
export const ENKA_NOT_CONFIGURED_MESSAGE =
  'Profile import is not configured for this deployment, so there is no import service to contact.';

/** Shown for an empty or non-numeric UID, in the import modal and for an HTTP 400. */
export const ENKA_INVALID_UID_MESSAGE =
  'That UID is not formatted correctly. A ZZZ UID is numbers only, usually 8-10 digits, ' +
  'shown in the bottom right of the in-game menu.';
