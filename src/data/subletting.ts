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
  optionKey,
  projectKey,
  readJson,
  readOptionJson,
  removeOptionKey,
  writeJson,
  writeOptionJson
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

export const loadContracts = (
  projectId?: string,
  option?: string
): SublettingContract[] => {
  const parsed = readOptionJson<unknown>(
    STORAGE_KEYS.sublettingContracts,
    projectId,
    option,
    []
  );
  return Array.isArray(parsed) ? parsed.filter(isContract) : [];
};

export const saveContracts = (
  contracts: SublettingContract[],
  projectId?: string,
  option?: string
): boolean =>
  writeOptionJson(STORAGE_KEYS.sublettingContracts, projectId, option, contracts);

/* --------------------------------------------------- per-activity drafts */

const draftKey = (
  projectId: string | undefined,
  option: string | undefined,
  activityId: string
): string =>
  option
    ? optionKey(`${STORAGE_KEYS.sublettingDraft}.${activityId}`, projectId, option)
    : projectKey(`${STORAGE_KEYS.sublettingDraft}.${activityId}`, projectId);

export const loadDraftAssignments = (
  projectId: string | undefined,
  activityId: string,
  option?: string
): Record<string, string> => {
  if (!activityId) return {};
  const parsed = readJson<unknown>(draftKey(projectId, option, activityId), {});
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
  assignments: Record<string, string>,
  option?: string
): boolean => writeJson(draftKey(projectId, option, activityId), assignments);

export const clearDraftAssignments = (
  projectId: string | undefined,
  activityId: string,
  option?: string
): void => removeOptionKey(`${STORAGE_KEYS.sublettingDraft}.${activityId}`, projectId, option);

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
