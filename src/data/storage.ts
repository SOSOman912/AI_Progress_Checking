/**
 * The single place in the application that talks to window.localStorage.
 *
 * Rules:
 * - Views and components must never call `localStorage` directly; they import a
 *   repository from `src/data/*`.
 * - Every key is declared once in `STORAGE_KEYS` so a rename happens in one place.
 * - Storage has three scopes:
 *     global   `apc.x`
 *     project  `apc.x:<projectId>`            (option-independent data)
 *     option   `apc.x:<projectId>:<option>`   (data whose shape/meaning is NEC option specific)
 *   When there is no active project the fallback bucket is `:unassigned`.
 * - Data written before option scoping existed sits on the plain project key.
 *   `readProjectJson` transparently reads it once and copies it into the option
 *   bucket, so upgrading never loses work.
 */

export type StorageScope = 'global' | 'project' | 'option' | 'scenario';

export const STORAGE_KEYS = {
  /* global ------------------------------------------------------------- */
  projects: 'apc.projects.v1',
  activeProject: 'apc.active-project.v1',
  role: 'apc.role',

  /* option-scoped: the NEC option changes the schema or the meaning ------ */
  documents: 'apc.documents.v3',
  ceRecords: 'apc.ce-records.v2',
  ceLinks: 'apc.ce-links.v2',
  bqActivityMap: 'apc.bq-activity-bill-map.v2',
  mappingScenarios: 'apc.mapping-scenarios.v2',
  sublettingContracts: 'apc.subletting-contracts.v1',
  sublettingSchedule: 'apc.subletting-schedule.v1',
  sublettingDraft: 'apc.subletting-draft.v1',

  /* project-scoped: identical meaning for every option ------------------- */
  scanAssets: 'apc.scan-assets.v2',
  measurementLibrary: 'apc.measurement-library.v2',
  subcontractors: 'apc.subcontractors.v1',
  pricingMode: 'apc.pricing-mode.v1',

  /* scenario ------------------------------------------------------------ */
  smmMaterials: 'apc.smm-materials'
} as const;

export const UNASSIGNED_PROJECT = 'unassigned';

const projectBucket = (projectId?: string | null): string =>
  projectId ?? UNASSIGNED_PROJECT;

/** Project-scoped key: `<base>:<projectId>` (option-independent data). */
export const projectKey = (
  base: string,
  projectId?: string | null
): string => `${base}:${projectBucket(projectId)}`;

/**
 * Option-scoped key: `<base>:<projectId>:<option>`.
 *
 * A project only ever has one NEC option, but the option is part of the key so
 * that data written under one contract form can never be read back by another.
 */
export const optionKey = (
  base: string,
  projectId: string | null | undefined,
  option: string
): string => `${base}:${projectBucket(projectId)}:${option}`;

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

/**
 * Read an option-scoped JSON document.
 *
 * Order:
 * 1. `<base>:<projectId>:<option>`          — current location
 * 2. `<base>:<projectId>`                   — pre-option-scoping data, copied
 *    forward once so the user keeps their work
 */
export const readOptionJson = <T>(
  base: string,
  projectId: string | undefined,
  option: string | undefined,
  fallback: T
): T => {
  if (!option) return readProjectJson(base, projectId, fallback);
  const scoped = optionKey(base, projectId, option);
  const raw = readRaw(scoped);
  if (raw !== null) {
    const parsed = readJson<T | null>(scoped, null);
    return parsed ?? fallback;
  }
  const legacyRaw = readRaw(projectKey(base, projectId));
  if (legacyRaw === null) return fallback;
  const legacy = readJson<T | null>(projectKey(base, projectId), null);
  if (legacy === null) return fallback;
  /* first read after the upgrade: copy into the option bucket */
  writeJson(scoped, legacy);
  return legacy;
};

/** Write an option-scoped JSON document. */
export const writeOptionJson = (
  base: string,
  projectId: string | undefined,
  option: string | undefined,
  value: unknown
): boolean => {
  if (!option) return writeProjectJson(base, projectId, value);
  return writeJson(optionKey(base, projectId, option), value);
};

/** Remove an option-scoped key. */
export const removeOptionKey = (
  base: string,
  projectId: string | undefined,
  option: string | undefined
): void => {
  if (!option) removeKey(projectKey(base, projectId));
  else removeKey(optionKey(base, projectId, option));
};
