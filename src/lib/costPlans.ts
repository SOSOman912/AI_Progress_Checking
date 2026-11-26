export type NecOption = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type CostDocType = 'bq' | 'ce' | 'invoices' | 'activity' | 'programme' | 'rates';
export type DocRequirement = 'required' | 'optional' | 'conditional' | 'na';

export interface NecOptionInfo {
  id: NecOption;
  name: string;
  contract: string;
  note: string;
}

export const NEC_OPTIONS: NecOptionInfo[] = [
  {
    id: 'A',
    name: 'Option A',
    contract: 'Priced contract with activity schedule',
    note: 'Priced from the activity schedule'
  },
  {
    id: 'B',
    name: 'Option B',
    contract: 'Priced contract with bill of quantities',
    note: 'Priced from the bill of quantities'
  },
  {
    id: 'C',
    name: 'Option C',
    contract: 'Target cost contract with activity schedule',
    note: 'Target cost with activity schedule and invoices'
  },
  {
    id: 'D',
    name: 'Option D',
    contract: 'Target cost contract with bill of quantities',
    note: 'Target cost with BQ and invoices'
  },
  {
    id: 'E',
    name: 'Option E',
    contract: 'Cost reimbursable contract',
    note: 'Actual cost with invoices'
  },
  {
    id: 'F',
    name: 'Option F',
    contract: 'Management contract',
    note: 'Management contract with conditional BQ and activity schedule'
  }
];

export const COST_DOC_TYPES: CostDocType[] = [
  'bq',
  'ce',
  'invoices',
  'activity',
  'programme',
  'rates'
];

export const COST_DOC_INFO: Record<
  CostDocType,
  { label: string; short: string; description: string }
> = {
  bq: {
    label: 'Bill of Quantities (BQ / BoQ)',
    short: 'BQ',
    description: 'Priced bill used for valuation and payment.'
  },
  ce: {
    label: 'Compensation Event (CE) Documents',
    short: 'CE',
    description: 'CE quotations, assessments and supporting records.'
  },
  invoices: {
    label: 'Invoices / Cost Supporting Records',
    short: 'Invoices',
    description: 'Invoices and cost records supporting payment.'
  },
  activity: {
    label: 'Activity Schedule',
    short: 'Activity schedule',
    description: 'Priced activity schedule used to value work done.'
  },
  programme: {
    label: 'Master Programme / Accepted Programme',
    short: 'Programme',
    description: 'Accepted programme used for timing and delay checks.'
  },
  rates: {
    label: 'Schedule of Rates',
    short: 'Rates',
    description: 'Rates or daywork schedule used where the contract requires.'
  }
};

export const COST_DOC_MATRIX: Record<NecOption, Record<CostDocType, DocRequirement>> = {
  A: {
    bq: 'na',
    ce: 'optional',
    invoices: 'conditional',
    activity: 'required',
    programme: 'optional',
    rates: 'conditional'
  },
  B: {
    bq: 'required',
    ce: 'optional',
    invoices: 'conditional',
    activity: 'na',
    programme: 'optional',
    rates: 'conditional'
  },
  C: {
    bq: 'na',
    ce: 'optional',
    invoices: 'required',
    activity: 'required',
    programme: 'optional',
    rates: 'conditional'
  },
  D: {
    bq: 'required',
    ce: 'optional',
    invoices: 'required',
    activity: 'na',
    programme: 'optional',
    rates: 'conditional'
  },
  E: {
    bq: 'na',
    ce: 'optional',
    invoices: 'required',
    activity: 'na',
    programme: 'optional',
    rates: 'conditional'
  },
  F: {
    bq: 'conditional',
    ce: 'optional',
    invoices: 'required',
    activity: 'conditional',
    programme: 'optional',
    rates: 'conditional'
  }
};

export const REQUIREMENT_LABEL: Record<DocRequirement, string> = {
  required: 'Required',
  optional: 'Optional',
  conditional: 'If required',
  na: 'Not applicable'
};

export const optionInfo = (option: NecOption) =>
  NEC_OPTIONS.find(item => item.id === option) ?? NEC_OPTIONS[0];

export const applicableDocs = (option: NecOption): CostDocType[] =>
  COST_DOC_TYPES.filter(type => COST_DOC_MATRIX[option][type] !== 'na');

export const requiredDocs = (option: NecOption): CostDocType[] =>
  COST_DOC_TYPES.filter(type => COST_DOC_MATRIX[option][type] === 'required');
