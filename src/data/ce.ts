/**
 * Compensation Event repository.
 *
 * Owns both CE keys and, more importantly, is the *only* source of CE money:
 * - `apc.ce-records.v2:<projectId>` — OCR result of each CE document
 * - `apc.ce-links.v2:<projectId>`   — CE → BQ / Activity link (amount, quantity)
 *
 * Every screen that shows a CE amount (BQ/AS table, CE detail, cost result,
 * subletting) must derive it from `loadCeLinks` / `ceAmountByItem` so the numbers
 * can never diverge.
 */

import {
  STORAGE_KEYS,
  readProjectJson,
  writeProjectJson
} from './storage';
import { loadDocumentOptions } from './documents';
import type { DocumentOption } from './documents';

export type CeTargetType = 'bq' | 'activity';

export interface CeOcrItem {
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface CeFields {
  ceNumber: string;
  date: string;
  reference: string;
  amount: string;
  quantity: string;
  title: string;
}

/** A region of the original document the OCR result was extracted from. */
export interface CeRegion {
  id: string;
  label: string;
  value: string;
  /** Percentages of the page box. */
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
}

export interface CeDocumentImage {
  dataUrl?: string;
  mime?: string;
}

export interface CeRecord {
  id: string;
  code: string;
  name: string;
  receivedAt: number;
  confidence: number;
  fields: CeFields;
  text: string;
  items: CeOcrItem[];
  quantity?: number;
  document?: CeDocumentImage;
  regions?: CeRegion[];
}

export interface CeLink {
  ceId: string;
  ceCode: string;
  ceName: string;
  title: string;
  amount: number;
  /** Quantity change extracted from the CE document. */
  quantity?: number;
  date?: string;
  reference?: string;
  targetType?: CeTargetType;
  targetId?: string;
  targetCode?: string;
  targetName?: string;
  bqId?: string;
  bqCode?: string;
  bqName?: string;
  itemIds: string[];
}

export interface CeTotals {
  amount: number;
  quantity: number;
  count: number;
}

const isCeRecord = (value: unknown): value is CeRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<CeRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.code === 'string' &&
    typeof record.name === 'string' &&
    typeof record.receivedAt === 'number' &&
    typeof record.confidence === 'number' &&
    Boolean(record.fields) &&
    typeof record.text === 'string' &&
    Array.isArray(record.items)
  );
};

const isCeLink = (value: unknown): value is CeLink => {
  if (!value || typeof value !== 'object') return false;
  const item = value as CeLink;
  return (
    typeof item.ceId === 'string' &&
    typeof item.ceCode === 'string' &&
    typeof item.ceName === 'string' &&
    typeof item.title === 'string' &&
    typeof item.amount === 'number' &&
    Array.isArray(item.itemIds) &&
    item.itemIds.every(id => typeof id === 'string')
  );
};

/* ------------------------------------------------------------------ records */

export const loadCeRecords = (projectId?: string): CeRecord[] => {
  const parsed = readProjectJson<unknown[]>(
    STORAGE_KEYS.ceRecords,
    projectId,
    []
  );
  return Array.isArray(parsed) ? parsed.filter(isCeRecord) : [];
};

export const saveCeRecords = (
  records: CeRecord[],
  projectId?: string
): boolean => writeProjectJson(STORAGE_KEYS.ceRecords, projectId, records);

export const upsertCeRecord = (
  record: CeRecord,
  projectId?: string
): CeRecord[] => {
  const existing = loadCeRecords(projectId);
  const next = existing.some(item => item.id === record.id)
    ? existing.map(item => (item.id === record.id ? record : item))
    : [record, ...existing];
  saveCeRecords(next, projectId);
  return next;
};

export const findCeRecord = (
  ceId: string,
  projectId?: string
): CeRecord | null =>
  loadCeRecords(projectId).find(record => record.id === ceId) ?? null;

/* -------------------------------------------------------------------- links */

export const loadCeLinks = (projectId?: string): CeLink[] => {
  const parsed = readProjectJson<unknown[]>(
    STORAGE_KEYS.ceLinks,
    projectId,
    []
  );
  return Array.isArray(parsed) ? parsed.filter(isCeLink) : [];
};

export const saveCeLinks = (links: CeLink[], projectId?: string): boolean =>
  writeProjectJson(STORAGE_KEYS.ceLinks, projectId, links);

export const saveCeLink = (link: CeLink, projectId?: string): CeLink[] => {
  const next = [
    link,
    ...loadCeLinks(projectId).filter(item => item.ceId !== link.ceId)
  ];
  saveCeLinks(next, projectId);
  return next;
};

export const removeCeLink = (ceId: string, projectId?: string): CeLink[] => {
  const next = loadCeLinks(projectId).filter(link => link.ceId !== ceId);
  saveCeLinks(next, projectId);
  return next;
};

export const ceLinkTarget = (link: CeLink) => ({
  type: (link.targetType ?? 'bq') as CeTargetType,
  id: link.targetId ?? link.bqId ?? '',
  code: link.targetCode ?? link.bqCode ?? '',
  name: link.targetName ?? link.bqName ?? ''
});

export const linksForTarget = (
  targetId: string | undefined,
  targetType: CeTargetType,
  projectId?: string
): CeLink[] => {
  const links = loadCeLinks(projectId);
  if (!targetId) return links;
  return links.filter(link => {
    const target = ceLinkTarget(link);
    return target.type === targetType && target.id === targetId;
  });
};

export const linksForBq = (bqId?: string, projectId?: string): CeLink[] =>
  linksForTarget(bqId, 'bq', projectId);

export const linksForActivity = (
  activityId?: string,
  projectId?: string
): CeLink[] => linksForTarget(activityId, 'activity', projectId);

/* ------------------------------------------------------------ derived money */

/**
 * CE amount per BQ / Activity item. A CE covering several items is split evenly,
 * which is the same rule the Cleanse table uses — keep both on this helper.
 */
export const ceAmountByItem = (
  links: CeLink[]
): Map<string, { amount: number; quantity: number }> => {
  const map = new Map<string, { amount: number; quantity: number }>();
  links.forEach(link => {
    const count = link.itemIds.length;
    if (!count) return;
    const amount = link.amount / count;
    const quantity = (link.quantity ?? 0) / count;
    link.itemIds.forEach(itemId => {
      const current = map.get(itemId) ?? { amount: 0, quantity: 0 };
      map.set(itemId, {
        amount: current.amount + amount,
        quantity: current.quantity + quantity
      });
    });
  });
  return map;
};

export const ceTotals = (links: CeLink[]): CeTotals => {
  const seen = new Set<string>();
  let amount = 0;
  let quantity = 0;
  let count = 0;
  links.forEach(link => {
    if (seen.has(link.ceId)) return;
    seen.add(link.ceId);
    amount += link.amount;
    quantity += link.quantity ?? 0;
    count += 1;
  });
  return { amount, quantity, count };
};

/** Parse a CE amount string such as `HK$ 128,500.00`. */
export const parseCeAmount = (value: string | undefined): number => {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Amount for a CE record, preferring the extracted field over the line items. */
export const ceRecordAmount = (record: CeRecord): number => {
  const fromField = parseCeAmount(record.fields?.amount);
  if (fromField) return fromField;
  return record.items.reduce((sum, item) => sum + (item.amount || 0), 0);
};

/* ------------------------------------------------------------------ options */

/** BQ / Activity documents available as a CE link target. */
export const loadPricingOptions = (
  projectId: string | undefined,
  target: CeTargetType
): DocumentOption[] => loadDocumentOptions(projectId, target);

export const loadBqOptions = (projectId?: string): DocumentOption[] =>
  loadPricingOptions(projectId, 'bq');
