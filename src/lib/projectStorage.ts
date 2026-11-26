export const projectStorageKey = (base: string, projectId?: string | null) =>
  `${base}:${projectId ?? 'unassigned'}`;

export const DOCUMENTS_STORAGE_BASE = 'apc.documents.v3';

export const documentsStorageKey = (projectId?: string | null) =>
  projectStorageKey(DOCUMENTS_STORAGE_BASE, projectId);
