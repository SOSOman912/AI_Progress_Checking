/**
 * Cost / document requirement helpers.
 *
 * The NEC option data itself lives in `src/lib/projects.ts` (single source of
 * truth). This module only adds the document *labels* and keeps the historical
 * export names so nothing else has to change.
 */

import {
  NEC_OPTION_IDS,
  NEC_OPTION_INFO,
  REQUIREMENT_LABEL,
  applicableDocs,
  requiredDocs,
  type CostDocType,
  type DocRequirement,
  type NecOption,
  type NecOptionInfo
} from './projects';

export type { CostDocType, DocRequirement, NecOption, NecOptionInfo };
export { REQUIREMENT_LABEL, applicableDocs, requiredDocs };

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

export const NEC_OPTIONS: NecOptionInfo[] = NEC_OPTION_IDS.map(
  id => NEC_OPTION_INFO[id]
);

/** Documents required per NEC option — derived, never edited here. */
export const COST_DOC_MATRIX: Record<
  NecOption,
  Record<CostDocType, DocRequirement>
> = Object.fromEntries(
  NEC_OPTION_IDS.map(id => [id, NEC_OPTION_INFO[id].documents])
) as Record<NecOption, Record<CostDocType, DocRequirement>>;

export const optionInfo = (option?: NecOption): NecOptionInfo =>
  (option && NEC_OPTION_INFO[option]) || NEC_OPTION_INFO.A;
