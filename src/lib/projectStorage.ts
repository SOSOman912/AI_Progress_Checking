/**
 * Backwards-compatible key helpers.
 *
 * Storage itself lives in `src/data/storage.ts`; this module only re-exports the
 * key builder under its historical name.
 */

import { STORAGE_KEYS, projectKey } from '../data/storage';

export const projectStorageKey = (
  base: string,
  projectId?: string | null
): string => projectKey(base, projectId);

export const DOCUMENTS_STORAGE_BASE = STORAGE_KEYS.documents;

export const documentsStorageKey = (projectId?: string | null): string =>
  projectKey(STORAGE_KEYS.documents, projectId);
