/**
 * BQ bill ↔ Activity Schedule mapping repository.
 *
 * Owns `apc.bq-activity-bill-map.v2:<projectId>`. It used to be parsed inline by
 * both Preprocessing (owner) and SublettingPage (consumer); both now go through
 * this module.
 */

import { STORAGE_KEYS, readProjectJson, writeProjectJson } from './storage';

export interface BillMappingRow {
  scheduleNo: string;
  confirmed: boolean;
}

/** bqId → billId → mapping row */
export type BqActivityMap = Record<string, Record<string, BillMappingRow>>;

export const loadBqActivityMap = (projectId?: string): BqActivityMap => {
  const parsed = readProjectJson<BqActivityMap>(
    STORAGE_KEYS.bqActivityMap,
    projectId,
    {}
  );
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
};

export const saveBqActivityMap = (
  map: BqActivityMap,
  projectId?: string
): boolean => writeProjectJson(STORAGE_KEYS.bqActivityMap, projectId, map);

export const loadBillMappingsFor = (
  bqId: string | undefined,
  projectId?: string
): Record<string, BillMappingRow> => {
  if (!bqId) return {};
  return loadBqActivityMap(projectId)[bqId] ?? {};
};

export const saveBillMappingsFor = (
  bqId: string,
  rows: Record<string, BillMappingRow>,
  projectId?: string
): boolean => {
  const map = loadBqActivityMap(projectId);
  map[bqId] = rows;
  return saveBqActivityMap(map, projectId);
};

/** Every Schedule No. referenced by any BQ mapping in this project. */
export const loadMappedScheduleNos = (projectId?: string): string[] => {
  const schedules = new Set<string>();
  Object.values(loadBqActivityMap(projectId)).forEach(rows => {
    Object.values(rows ?? {}).forEach(row => {
      if (row?.scheduleNo) schedules.add(String(row.scheduleNo));
    });
  });
  return [...schedules];
};
