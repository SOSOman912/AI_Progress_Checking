/**
 * Measurement Library repository.
 *
 * Owns `apc.measurement-library.v2:<projectId>`. The SMM reference items live in
 * `src/lib/measurementLibrary.ts`; this module only persists the user overrides.
 */

import {
  SMM_ITEMS,
  defaultRows,
  type MeasureMapRow
} from '../lib/measurementLibrary';
import { STORAGE_KEYS, readProjectJson, writeProjectJson } from './storage';

export type LibraryRows = Record<string, MeasureMapRow[]>;

export const defaultLibraryRows = (): LibraryRows =>
  Object.fromEntries(SMM_ITEMS.map(item => [item.id, defaultRows(item.id)]));

export const loadLibraryRows = (projectId?: string): LibraryRows => {
  const defaults = defaultLibraryRows();
  const parsed = readProjectJson<LibraryRows>(
    STORAGE_KEYS.measurementLibrary,
    projectId,
    {}
  );
  if (!parsed || typeof parsed !== 'object') return defaults;
  Object.keys(defaults).forEach(id => {
    if (Array.isArray(parsed[id])) defaults[id] = parsed[id];
  });
  return defaults;
};

export const saveLibraryRows = (
  rows: LibraryRows,
  projectId?: string
): boolean => writeProjectJson(STORAGE_KEYS.measurementLibrary, projectId, rows);
