import { demoData } from './demo';
import { documentsStorageKey, projectStorageKey } from './projectStorage';

export interface BqOption {
  id: string;
  code: string;
  name: string;
  itemIds?: string[];
}

export interface BqItemOption {
  id: string;
  no: string;
  label: string;
  unit: string;
  qty: number;
  rate: number | null;
  ce: number;
}

export type CeTargetType = 'bq' | 'activity';

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

export const ceLinkTarget = (link: CeLink) => ({
  type: (link.targetType ?? 'bq') as CeTargetType,
  id: link.targetId ?? link.bqId ?? '',
  code: link.targetCode ?? link.bqCode ?? '',
  name: link.targetName ?? link.bqName ?? ''
});

const STORAGE_BASE = 'apc.ce-links.v2';

export const BQ_ITEMS: BqItemOption[] = demoData.bill.lines
  .filter(line => line.type === 'item')
  .map(line => ({
    id: line.id,
    no: line.no ?? '',
    label: line.label,
    unit: line.unit ?? '',
    qty: line.override ?? line.contractQty ?? 0,
    rate: line.rate ?? null,
    ce: Number(line.ce) || 0
  }));

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

export const loadPricingOptions = (
  projectId: string | undefined,
  target: CeTargetType
): BqOption[] => {
  try {
    const raw = window.localStorage.getItem(documentsStorageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { records?: unknown };
    if (!Array.isArray(parsed.records)) return [];
    const options: BqOption[] = [];
    parsed.records.forEach(record => {
      const flow = (record as { flow?: string }).flow ?? 'bq';
      if (flow !== target) return;
      const item = record as Partial<BqOption> & { activityItemIds?: string[] };
      if (!item.id || !item.code || !item.name) return;
      options.push({
        id: item.id,
        code: item.code,
        name: item.name,
        itemIds: Array.isArray(item.activityItemIds)
          ? item.activityItemIds
          : undefined
      });
    });
    return options;
  } catch {
    return [];
  }
};

export const loadBqOptions = (projectId?: string): BqOption[] =>
  loadPricingOptions(projectId, 'bq');

export const loadCeLinks = (projectId?: string): CeLink[] => {
  try {
    const raw = window.localStorage.getItem(
      projectStorageKey(STORAGE_BASE, projectId)
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isCeLink) : [];
  } catch {
    return [];
  }
};

export const saveCeLink = (link: CeLink, projectId?: string) => {
  const links = loadCeLinks(projectId).filter(item => item.ceId !== link.ceId);
  const next = [link, ...links];
  try {
    window.localStorage.setItem(
      projectStorageKey(STORAGE_BASE, projectId),
      JSON.stringify(next)
    );
  } catch {
    // ignore storage failures
  }
  return next;
};

export const removeCeLink = (ceId: string, projectId?: string) => {
  const next = loadCeLinks(projectId).filter(link => link.ceId !== ceId);
  try {
    window.localStorage.setItem(
      projectStorageKey(STORAGE_BASE, projectId),
      JSON.stringify(next)
    );
  } catch {
    // ignore storage failures
  }
};

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
