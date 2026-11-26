/**
 * The single place in the application that talks to window.localStorage.
 *
 * Rules:
 * - Views and components must never call `localStorage` directly; they import a
 *   repository from `src/data/*`.
 * - Every key is declared once in `STORAGE_KEYS` so a rename happens in one place.
 * - Project data is always namespaced with `<base>:<projectId>`; when there is no
 *   active project the fallback bucket is `:unassigned`.
 * - Scenario-scoped data (only SMM material overrides) is namespaced with
 *   `<base>.<scenarioId>` and is the documented exception to the project rule.
 */

export type StorageScope = 'global' | 'project' | 'scenario';

export const STORAGE_KEYS = {
  /* global */
  projects: 'apc.projects.v1',
  activeProject: 'apc.active-project.v1',
  role: 'apc.role',
  /* project */
  documents: 'apc.documents.v3',
  ceRecords: 'apc.ce-records.v2',
  ceLinks: 'apc.ce-links.v2',
  bqActivityMap: 'apc.bq-activity-bill-map.v2',
  mappingScenarios: 'apc.mapping-scenarios.v2',
  scanAssets: 'apc.scan-assets.v2',
  measurementLibrary: 'apc.measurement-library.v2',
  subcontractors: 'apc.subcontractors.v1',
  sublettingContracts: 'apc.subletting-contracts.v1',
  sublettingSchedule: 'apc.subletting-schedule.v1',
  sublettingDraft: 'apc.subletting-draft.v1',
  pricingMode: 'apc.pricing-mode.v1',
  /* scenario */
  smmMaterials: 'apc.smm-materials'
} as const;

export const UNASSIGNED_PROJECT = 'unassigned';

/** Project-scoped key: `<base>:<projectId>`. */
export const projectKey = (
  base: string,
  projectId?: string | null
): string => `${base}:${projectId ?? UNASSIGNED_PROJECT}`;

/** Scenario-scoped key: `<base>.<scenarioId>` (documented exception). */
export const scenarioKey = (base: string, scenarioId: string): string =>
  `${base}.${scenarioId}`;

const bucket = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const readRaw = (key: string): string | null => {
  try {
    return bucket()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export const readJson = <T>(key: string, fallback: T): T => {
  const raw = readRaw(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

export const writeJson = (key: string, value: unknown): boolean => {
  try {
    bucket()?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    /* quota / private mode: callers treat this as "not persisted" */
    return false;
  }
};

export const writeRaw = (key: string, value: string): boolean => {
  try {
    bucket()?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeKey = (key: string): void => {
  try {
    bucket()?.removeItem(key);
  } catch {
    return;
  }
};

/** Read a project-scoped JSON document. */
export const readProjectJson = <T>(
  base: string,
  projectId: string | undefined,
  fallback: T
): T => readJson<T>(projectKey(base, projectId), fallback);

/** Write a project-scoped JSON document. */
export const writeProjectJson = (
  base: string,
  projectId: string | undefined,
  value: unknown
): boolean => writeJson(projectKey(base, projectId), value);
