/**
 * Subletting repository.
 *
 * Owns the sub-contract contracts and the per-activity assignment drafts. The
 * subcontractor list and the BK-CP03.02 schedule keep their own modules
 * (`lib/subcontractors`, `lib/sublettingSchedule`) and are re-exported here so
 * views import a single `data/subletting` entry point.
 */

import {
  STORAGE_KEYS,
  projectKey,
  readJson,
  readProjectJson,
  removeKey,
  writeJson,
  writeProjectJson
} from './storage';

export interface SublettingContract {
  id: string;
  code: string;
  subcontractor: string;
  subcontractorId?: string;
  activityId: string;
  activityCode: string;
  activityName: string;
  itemIds: string[];
  createdAt: number;
}

const isContract = (value: unknown): value is SublettingContract => {
  if (!value || typeof value !== 'object') return false;
  const item = value as SublettingContract;
  return (
    typeof item.id === 'string' &&
    typeof item.code === 'string' &&
    typeof item.subcontractor === 'string' &&
    typeof item.activityId === 'string' &&
    typeof item.activityCode === 'string' &&
    typeof item.activityName === 'string' &&
    Array.isArray(item.itemIds) &&
    item.itemIds.every(id => typeof id === 'string') &&
    typeof item.createdAt === 'number'
  );
};

export const loadContracts = (projectId?: string): SublettingContract[] => {
  const parsed = readProjectJson<unknown>(
    STORAGE_KEYS.sublettingContracts,
    projectId,
    []
  );
  return Array.isArray(parsed) ? parsed.filter(isContract) : [];
};

export const saveContracts = (
  contracts: SublettingContract[],
  projectId?: string
): boolean =>
  writeProjectJson(STORAGE_KEYS.sublettingContracts, projectId, contracts);

/* --------------------------------------------------- per-activity drafts */

const draftKey = (projectId: string | undefined, activityId: string): string =>
  projectKey(`${STORAGE_KEYS.sublettingDraft}.${activityId}`, projectId);

export const loadDraftAssignments = (
  projectId: string | undefined,
  activityId: string
): Record<string, string> => {
  if (!activityId) return {};
  const parsed = readJson<unknown>(draftKey(projectId, activityId), {});
  if (!parsed || typeof parsed !== 'object') return {};
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
};

export const saveDraftAssignments = (
  projectId: string | undefined,
  activityId: string,
  assignments: Record<string, string>
): boolean => writeJson(draftKey(projectId, activityId), assignments);

export const clearDraftAssignments = (
  projectId: string | undefined,
  activityId: string
): void => removeKey(draftKey(projectId, activityId));

/* ------------------------------------------------------------- re-exports */

export {
  loadSubcontractors,
  nextSubcontractorId,
  saveSubcontractors,
  type Subcontractor
} from '../lib/subcontractors';

export {
  loadScheduleRows,
  saveScheduleRows,
  type SublettingScheduleRow
} from '../lib/sublettingSchedule';

export { loadMappedScheduleNos } from './bqActivityMap';
