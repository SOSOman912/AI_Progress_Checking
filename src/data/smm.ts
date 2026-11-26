/**
 * SMM material override repository (Mapping Model / SMM result panel).
 *
 * Key: `apc.smm-materials.<scenarioId>` — the one scenario-scoped key in the app.
 * It is intentionally NOT prefixed with the project id today; the key is kept so
 * existing data stays readable. Migration note: when the key gains a project
 * prefix, read both keys and rewrite on first save.
 */

import {
  STORAGE_KEYS,
  readJson,
  scenarioKey,
  writeJson
} from './storage';

export type SmmMaterialOverrides = Record<string, string>;

const keyFor = (scenarioId: string): string =>
  scenarioKey(STORAGE_KEYS.smmMaterials, scenarioId);

export const loadSmmMaterials = (
  scenarioId: string
): SmmMaterialOverrides => {
  const parsed = readJson<unknown>(keyFor(scenarioId), {});
  if (!parsed || typeof parsed !== 'object') return {};
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
};

export const saveSmmMaterials = (
  scenarioId: string,
  overrides: SmmMaterialOverrides
): boolean => writeJson(keyFor(scenarioId), overrides);
