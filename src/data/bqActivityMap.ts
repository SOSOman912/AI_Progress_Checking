/**
 * BQ bill ↔ Activity Schedule mapping repository.
 *
 * Owns `apc.bq-activity-bill-map.v2:<projectId>:<option>`. It used to be parsed
 * inline by both Preprocessing (owner) and SublettingPage (consumer); both now
 * go through this module.
 *
 * The mapping only exists where both documents exist (Option A / C), so it is
 * option scoped: switching the option never reuses another option's mapping.
 */

import { STORAGE_KEYS, readOptionJson, writeOptionJson } from './storage';

export interface BillMappingRow {
  scheduleNo: string;
  confirmed: boolean;
}

/** bqId → billId → mapping row */
export type BqActivityMap = Record<string, Record<string, BillMappingRow>>;

export const loadBqActivityMap = (
  projectId?: string,
  option?: string
): BqActivityMap => {
  const parsed = readOptionJson<BqActivityMap>(
    STORAGE_KEYS.bqActivityMap,
    projectId,
    option,
    {}
  );
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
};

export const saveBqActivityMap = (
  map: BqActivityMap,
  projectId?: string,
  option?: string
): boolean =>
  writeOptionJson(STORAGE_KEYS.bqActivityMap, projectId, option, map);

export const loadBillMappingsFor = (
  bqId: string | undefined,
  projectId?: string,
  option?: string
): Record<string, BillMappingRow> => {
  if (!bqId) return {};
  return loadBqActivityMap(projectId, option)[bqId] ?? {};
};

export const saveBillMappingsFor = (
  bqId: string,
  rows: Record<string, BillMappingRow>,
  projectId?: string,
  option?: string
): boolean => {
  const map = loadBqActivityMap(projectId, option);
  map[bqId] = rows;
  return saveBqActivityMap(map, projectId, option);
};

/** Every Schedule No. referenced by any BQ mapping in this project + option. */
export const loadMappedScheduleNos = (
  projectId?: string,
  option?: string
): string[] => {
  const schedules = new Set<string>();
  Object.values(loadBqActivityMap(projectId, option)).forEach(rows => {
    Object.values(rows ?? {}).forEach(row => {
      if (row?.scheduleNo) schedules.add(String(row.scheduleNo));
    });
  });
  return [...schedules];
};
