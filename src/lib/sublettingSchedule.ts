import {
  STORAGE_KEYS,
  readOptionJson,
  writeOptionJson
} from '../data/storage';

/**
 * Data model for BK-CP03.02-FR01 Subletting Schedule Plan.
 * Column order follows the Excel template (A .. AG).
 *
 * Only `packageName` and `tenderBudget` are mandatory. Every other column is
 * optional so the schedule can be started early and completed later, once the
 * tender / award information becomes available.
 */
export interface SublettingScheduleRow {
  id: string;
  item: string;
  packageName: string;
  awardedSubcontractor: string;
  tenderBudget: string;
  budgetRelease: string;
  awardedTenderSum: string;
  targetOnBoard: string;
  sublettingBy: string;
  qsInCharge: string;
  mpAward: string;
  mpWorksStart: string;
  tendererListTentative: string;
  tendererListActual: string;
  tenderOutTentative: string;
  tenderOutActual: string;
  tenderReturnTentative: string;
  tenderReturnActual: string;
  tenderInterviewTentative: string;
  tenderInterviewActual: string;
  clarificationTentative: string;
  clarificationActual: string;
  recommendationTentative: string;
  recommendationActual: string;
  loaTentative: string;
  loaActual: string;
  workOrderNo: string;
  loaDocTentative: string;
  loaDocIssue: string;
  loaDocSigned: string;
  workOrderIssue: string;
  workOrderSigned: string;
  remarks: string;
  createdAt: number;
  updatedAt: number;
}

export type ScheduleColumnKey =
  | Exclude<keyof SublettingScheduleRow, 'id' | 'createdAt' | 'updatedAt'>
  | 'savingLoss';

export type ScheduleColumnKind = 'text' | 'money' | 'date' | 'computed';

export interface ScheduleColumn {
  key: ScheduleColumnKey;
  label: string;
  kind: ScheduleColumnKind;
  width: number;
  required?: boolean;
}

export interface ScheduleColumnGroup {
  label: string;
  columns: ScheduleColumn[];
}

export const STORAGE_BASE = 'apc.subletting-schedule.v1';

export const REQUIRED_LABEL = 'Sub-Contract Package and Tender Budget';

export const SCHEDULE_GROUPS: ScheduleColumnGroup[] = [
  { label: 'Item', columns: [{ key: 'item', label: 'Item', kind: 'text', width: 52 }] },
  {
    label: 'Sub-Contract Packages',
    columns: [
      { key: 'packageName', label: 'Sub-Contract Packages', kind: 'text', width: 190, required: true }
    ]
  },
  {
    label: 'Awarded Sub-Contractor',
    columns: [
      { key: 'awardedSubcontractor', label: 'Awarded Sub-Contractor', kind: 'text', width: 168 }
    ]
  },
  {
    label: 'Tender Budget (HK$)',
    columns: [{ key: 'tenderBudget', label: 'Tender Budget (HK$)', kind: 'money', width: 108, required: true }]
  },
  {
    label: 'Budget Release (HK$)',
    columns: [{ key: 'budgetRelease', label: 'Budget Release (HK$)', kind: 'money', width: 108 }]
  },
  {
    label: 'Awarded Tender Sum (HK$)',
    columns: [{ key: 'awardedTenderSum', label: 'Awarded Tender Sum (HK$)', kind: 'money', width: 112 }]
  },
  {
    label: 'Saving / (Loss)',
    columns: [{ key: 'savingLoss', label: 'Saving / (Loss)', kind: 'computed', width: 108 }]
  },
  {
    label: 'Target on Board',
    columns: [{ key: 'targetOnBoard', label: 'Target on Board', kind: 'date', width: 104 }]
  },
  {
    label: 'Subletting by (Site Team / CSP)',
    columns: [{ key: 'sublettingBy', label: 'Subletting by', kind: 'text', width: 128 }]
  },
  {
    label: 'QS In Charge',
    columns: [{ key: 'qsInCharge', label: 'QS In Charge', kind: 'text', width: 108 }]
  },
  {
    label: 'Master Programme Rev.',
    columns: [
      { key: 'mpAward', label: 'Award', kind: 'date', width: 96 },
      { key: 'mpWorksStart', label: 'Works Start', kind: 'date', width: 96 }
    ]
  },
  {
    label: 'Tenderer List Approval',
    columns: [
      { key: 'tendererListTentative', label: 'Tentative', kind: 'date', width: 96 },
      { key: 'tendererListActual', label: 'Actual', kind: 'date', width: 96 }
    ]
  },
  {
    label: 'Tender Out',
    columns: [
      { key: 'tenderOutTentative', label: 'Tentative', kind: 'date', width: 96 },
      { key: 'tenderOutActual', label: 'Actual', kind: 'date', width: 96 }
    ]
  },
  {
    label: 'Tender Return',
    columns: [
      { key: 'tenderReturnTentative', label: 'Tentative', kind: 'date', width: 96 },
      { key: 'tenderReturnActual', label: 'Actual', kind: 'date', width: 96 }
    ]
  },
  {
    label: 'Tender Interview',
    columns: [
      { key: 'tenderInterviewTentative', label: 'Tentative', kind: 'date', width: 96 },
      { key: 'tenderInterviewActual', label: 'Actual', kind: 'date', width: 96 }
    ]
  },
  {
    label: 'Clarification / Best Offer',
    columns: [
      { key: 'clarificationTentative', label: 'Tentative', kind: 'date', width: 96 },
      { key: 'clarificationActual', label: 'Actual', kind: 'date', width: 96 }
    ]
  },
  {
    label: 'Recommendation / Approval for Award',
    columns: [
      { key: 'recommendationTentative', label: 'Tentative', kind: 'date', width: 96 },
      { key: 'recommendationActual', label: 'Actual', kind: 'date', width: 96 }
    ]
  },
  {
    label: 'LOA if necessary (Within 7 Days After Approval)',
    columns: [
      { key: 'loaTentative', label: 'Tentative', kind: 'date', width: 96 },
      { key: 'loaActual', label: 'Actual', kind: 'date', width: 96 }
    ]
  },
  {
    label: 'Sub-Contract / Work Order No.',
    columns: [{ key: 'workOrderNo', label: 'Sub-Contract / Work Order No.', kind: 'text', width: 150 }]
  },
  {
    label: 'LOA',
    columns: [
      { key: 'loaDocTentative', label: 'Tentative', kind: 'date', width: 96 },
      { key: 'loaDocIssue', label: 'Issue', kind: 'date', width: 96 },
      { key: 'loaDocSigned', label: 'Signed (BK)', kind: 'date', width: 96 }
    ]
  },
  {
    label: 'Sub-Contract / Work Order (Within 1 month after approval)',
    columns: [
      { key: 'workOrderIssue', label: 'Issue', kind: 'date', width: 96 },
      { key: 'workOrderSigned', label: 'Signed (by BK)', kind: 'date', width: 96 }
    ]
  },
  { label: 'Remarks', columns: [{ key: 'remarks', label: 'Remarks', kind: 'text', width: 190 }] }
];

export const SCHEDULE_FIELD_KEYS = SCHEDULE_GROUPS.flatMap(group =>
  group.columns
    .filter(column => column.key !== 'savingLoss')
    .map(column => column.key as Exclude<ScheduleColumnKey, 'savingLoss'>)
);

export const REQUIRED_KEYS: ScheduleColumnKey[] = SCHEDULE_GROUPS.flatMap(group =>
  group.columns.filter(column => column.required).map(column => column.key)
);

export const parseAmount = (value: string): number | null => {
  const cleaned = value.replace(/[,\s$]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatAmount = (value: number): string =>
  value.toLocaleString('en-HK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

export const savingLoss = (row: SublettingScheduleRow): number | null => {
  const budget = parseAmount(row.tenderBudget);
  const awarded = parseAmount(row.awardedTenderSum);
  if (budget === null || awarded === null) return null;
  return budget - awarded;
};

export const MONEY_COLUMN_KEYS: ScheduleColumnKey[] = [
  'tenderBudget',
  'budgetRelease',
  'awardedTenderSum',
  'savingLoss'
];

export const requiredKeysFor = (
  showMoney: boolean
): ScheduleColumnKey[] =>
  showMoney
    ? REQUIRED_KEYS
    : REQUIRED_KEYS.filter(key => !MONEY_COLUMN_KEYS.includes(key));

export const missingRequired = (
  row: SublettingScheduleRow,
  keys: ScheduleColumnKey[] = REQUIRED_KEYS
): ScheduleColumnKey[] =>
  keys.filter(key => {
    if (key === 'savingLoss') return false;
    const value = row[key as Exclude<ScheduleColumnKey, 'savingLoss'>];
    return !String(value ?? '').trim();
  });

export const isRowComplete = (
  row: SublettingScheduleRow,
  keys: ScheduleColumnKey[] = REQUIRED_KEYS
): boolean => missingRequired(row, keys).length === 0;

const nextItemNo = (rows: SublettingScheduleRow[]): string => {
  const max = rows.reduce((current, row) => {
    const number = Number(row.item);
    return Number.isFinite(number) ? Math.max(current, number) : current;
  }, 0);
  return String(max + 1);
};

export const createScheduleRow = (rows: SublettingScheduleRow[]): SublettingScheduleRow => {
  const now = Date.now();
  const row: SublettingScheduleRow = {
    id: `sched-${now}-${Math.random().toString(36).slice(2, 6)}`,
    item: nextItemNo(rows),
    packageName: '',
    awardedSubcontractor: '',
    tenderBudget: '',
    budgetRelease: '',
    awardedTenderSum: '',
    targetOnBoard: '',
    sublettingBy: '',
    qsInCharge: '',
    mpAward: '',
    mpWorksStart: '',
    tendererListTentative: '',
    tendererListActual: '',
    tenderOutTentative: '',
    tenderOutActual: '',
    tenderReturnTentative: '',
    tenderReturnActual: '',
    tenderInterviewTentative: '',
    tenderInterviewActual: '',
    clarificationTentative: '',
    clarificationActual: '',
    recommendationTentative: '',
    recommendationActual: '',
    loaTentative: '',
    loaActual: '',
    workOrderNo: '',
    loaDocTentative: '',
    loaDocIssue: '',
    loaDocSigned: '',
    workOrderIssue: '',
    workOrderSigned: '',
    remarks: '',
    createdAt: now,
    updatedAt: now
  };
  return row;
};

const normaliseRow = (value: unknown, index: number): SublettingScheduleRow | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const base = createScheduleRow([]);
  const row: SublettingScheduleRow = {
    ...base,
    id:
      typeof source.id === 'string' && source.id
        ? source.id
        : `sched-restored-${index}`,
    item:
      typeof source.item === 'string' && source.item.trim()
        ? source.item
        : String(index + 1),
    createdAt: typeof source.createdAt === 'number' ? source.createdAt : Date.now(),
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : Date.now()
  };
  SCHEDULE_FIELD_KEYS.forEach(key => {
    if (key === 'item') return;
    const raw = source[key];
    (row as unknown as Record<string, string>)[key] =
      raw === null || raw === undefined ? '' : String(raw);
  });
  return row;
};

export const loadScheduleRows = (
  projectId?: string,
  option?: string
): SublettingScheduleRow[] => {
  const parsed = readOptionJson<unknown>(STORAGE_BASE, projectId, option, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((value, index) => normaliseRow(value, index))
    .filter((row): row is SublettingScheduleRow => row !== null);
};

export const saveScheduleRows = (
  rows: SublettingScheduleRow[],
  projectId?: string,
  option?: string
): boolean => writeOptionJson(STORAGE_BASE, projectId, option, rows);

export interface ScheduleTotals {
  packages: number;
  complete: number;
  pending: number;
  tenderBudget: number;
  awardedTenderSum: number;
  savingLoss: number;
  savingLossKnown: boolean;
}

export const scheduleTotals = (
  rows: SublettingScheduleRow[],
  keys: ScheduleColumnKey[] = REQUIRED_KEYS
): ScheduleTotals => {
  let tenderBudget = 0;
  let awardedTenderSum = 0;
  let savingLossTotal = 0;
  let savingLossKnown = false;
  rows.forEach(row => {
    const budget = parseAmount(row.tenderBudget);
    const awarded = parseAmount(row.awardedTenderSum);
    if (budget !== null) tenderBudget += budget;
    if (awarded !== null) awardedTenderSum += awarded;
    const saving = savingLoss(row);
    if (saving !== null) {
      savingLossKnown = true;
      savingLossTotal += saving;
    }
  });
  const complete = rows.filter(row => isRowComplete(row, keys)).length;
  return {
    packages: rows.length,
    complete,
    pending: rows.length - complete,
    tenderBudget,
    awardedTenderSum,
    savingLoss: savingLossTotal,
    savingLossKnown
  };
};
