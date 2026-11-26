import { demoData } from './demo';
import { buildMappingResult } from './mappingResult';
import { COST_DOC_INFO, optionInfo, type CostDocType, type NecOption } from './costPlans';
import type { MappingScenario } from './mappingScenarios';

export type CostResultMode = 'bq' | 'activity' | 'records';

export interface CostCeRecord {
  id: string;
  ref: string;
  title: string;
  amount: number;
  itemIndexes: number[];
}

export const COST_CE_RECORDS: CostCeRecord[] = [
  {
    id: 'ce-01',
    ref: 'CE-01',
    title: 'Additional reinforcement to foundation',
    amount: 12000,
    itemIndexes: [0, 3]
  },
  {
    id: 'ce-02',
    ref: 'CE-02',
    title: 'Revised slab thickness at Level 1',
    amount: 15600,
    itemIndexes: [1, 2]
  },
  {
    id: 'ce-03',
    ref: 'CE-03',
    title: 'Prolongation and revised sequence',
    amount: 10900,
    itemIndexes: [2, 3]
  }
];

export interface CostCeDetail {
  id: string;
  ref: string;
  title: string;
  amount: number;
  total: number;
}

export interface CostBqLine {
  id: string;
  code: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  ceTotal: number;
  ceDetails: CostCeDetail[];
}

export interface CostActivityLine {
  id: string;
  code: string;
  name: string;
  start: string;
  finish: string;
  pct: number;
  value: number;
  ceTotal: number;
  ceDetails: CostCeDetail[];
}

export interface CostRecordLine {
  id: string;
  ref: string;
  period: string;
  date: string;
  amount: number;
  status: string;
}

export interface CostSupportDoc {
  type: CostDocType;
  name: string;
  role: string;
}

export interface CostResult {
  option: NecOption;
  optionName: string;
  contract: string;
  modes: CostResultMode[];
  bq: CostBqLine[];
  activity: CostActivityLine[];
  records: CostRecordLine[];
  total: number;
  certified: number;
  ceTotal: number;
  supports: CostSupportDoc[];
  mainDocs: string[];
}

const RATE_FALLBACK = 980;

const pad = (value: number) => String(value).padStart(2, '0');

const activityName = (index: number, names: string[]) =>
  names.length ? names[index % names.length] : '—';

const mergeCeDetails = (details: CostCeDetail[]) => {
  const merged = new Map<string, CostCeDetail>();
  details.forEach(detail => {
    const current = merged.get(detail.id);
    if (current) current.amount += detail.amount;
    else merged.set(detail.id, { ...detail });
  });
  return Array.from(merged.values());
};

export const buildCostResult = (
  scenario: MappingScenario,
  selectedCeIds?: string[]
): CostResult => {
  const sources = scenario.sources ?? {};
  const option: NecOption = sources.necOption ?? 'B';
  const info = optionInfo(option);
  const hasBq = option === 'B' || option === 'D' || !!sources.bq;
  const hasActivity = option === 'A' || option === 'C' || !!sources.activity;
  const modes: CostResultMode[] = [];
  if (hasBq) modes.push('bq');
  if (hasActivity) modes.push('activity');
  if (!modes.length) modes.push('records');

  const programme = buildMappingResult(
    { ...scenario, sources: { ...sources, programme: sources.programme ?? 'cost-activity-schedule' } },
    demoData.elements,
    true
  );
  const activities = programme.activities.filter(activity => activity.id !== 'handover');
  const activityNames = activities.map(activity => activity.name);

  const ceAvailable = !!sources.ce;
  const selectedCe = ceAvailable
    ? selectedCeIds ?? COST_CE_RECORDS.map(record => record.id)
    : [];
  const selectedCeRecords = COST_CE_RECORDS.filter(record => selectedCe.includes(record.id));

  const bqItems = demoData.bill.lines.filter(line => line.type === 'item');
  const bq: CostBqLine[] = bqItems.map((line, index) => {
    const qty = line.override ?? line.contractQty ?? 0;
    const rate = line.rate ?? RATE_FALLBACK;
    const ceDetails = selectedCeRecords
      .filter(record => record.itemIndexes.includes(index))
      .map(record => ({
        id: record.id,
        ref: record.ref,
        title: record.title,
        amount: Math.round(record.amount / record.itemIndexes.length),
        total: record.amount
      }));
    return {
      id: line.id,
      code: line.no ?? `2.${pad(index + 1)}`,
      description: line.label,
      unit: line.unit ?? 'item',
      qty,
      rate,
      amount: Math.round(qty * rate),
      ceTotal: ceDetails.reduce((sum, detail) => sum + detail.amount, 0),
      ceDetails
    };
  });

  const total = bq.reduce((sum, line) => sum + line.amount, 0);
  const sumElements = activities.reduce((sum, activity) => sum + activity.elementCount, 0) || 1;
  let allocated = 0;
  const activity: CostActivityLine[] = activities.map((item, index) => {
    const value =
      index === activities.length - 1
        ? Math.max(0, total - allocated)
        : Math.round(total * (item.elementCount / sumElements));
    allocated += value;
    const ceDetails = mergeCeDetails(
      bq
        .filter((_, itemIndex) => itemIndex % activities.length === index)
        .flatMap(line => line.ceDetails)
    );
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      start: item.start,
      finish: item.end,
      pct: item.actualPct,
      value,
      ceTotal: ceDetails.reduce((sum, detail) => sum + detail.amount, 0),
      ceDetails
    };
  });

  const certified = bqItems.reduce((sum, line) => {
    const rate = line.rate ?? RATE_FALLBACK;
    const qty = (line.certifications ?? []).reduce((sub, item) => sub + item.qty, 0);
    return sum + qty * rate;
  }, 0);
  const ceTotal = selectedCeRecords.reduce((sum, record) => sum + record.amount, 0);

  let invoiced = 0;
  const invoiceLines: CostRecordLine[] = sources.invoices
    ? [0, 1, 2].map(index => {
        const amount =
          index === 2 ? Math.max(0, certified - invoiced) : Math.round(certified / 3);
        invoiced += amount;
        return {
          id: `inv-${index + 1}`,
          ref: `INV-2026-${pad(10 + index)}`,
          period: `IP-0${index + 1}`,
          date: ['30 Sep 2026', '30 Oct 2026', '13 Nov 2026'][index],
          amount,
          status: index < 2 ? 'Paid' : 'Submitted'
        };
      })
    : [];

  const supports: CostSupportDoc[] = [];
  const addSupport = (type: CostDocType, role: string) => {
    const name = sources[type as keyof typeof sources];
    if (typeof name === 'string' && name) {
      supports.push({ type, name, role });
    }
  };
  addSupport('bq', 'Main BQ schedule');
  addSupport('activity', 'Main activity schedule');
  addSupport('ce', 'CE references');
  addSupport('invoices', 'Invoice / payment reference');
  addSupport('programme', 'Activity dates');
  addSupport('rates', 'Rate basis');

  const mainDocs = [sources.bq, sources.activity].filter(
    (name): name is string => typeof name === 'string' && !!name
  );

  return {
    option,
    optionName: info.name,
    contract: info.contract,
    modes,
    bq,
    activity,
    records: invoiceLines,
    total,
    certified,
    ceTotal,
    supports,
    mainDocs
  };
};

export const costDocLabel = (type: CostDocType) => COST_DOC_INFO[type].label;
