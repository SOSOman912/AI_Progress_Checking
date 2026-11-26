import {
  STORAGE_KEYS,
  readJson,
  readRaw,
  removeKey,
  writeJson,
  writeRaw
} from '../data/storage';

export type ProjectStandard = 'HKSMM4' | 'CESMM';
export type NecOption = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type MainPricingDoc = 'activity' | 'bq' | 'cost' | 'activity-cost';

/** Tabs a NEC option exposes inside Document Management, in display order. */
export type PricingFlow = 'activity' | 'bq' | 'ce' | 'rate';

export type CostDocType =
  | 'bq'
  | 'ce'
  | 'invoices'
  | 'activity'
  | 'programme'
  | 'rates';

export type DocRequirement = 'required' | 'optional' | 'conditional' | 'na';

/**
 * Single source of truth for NEC option behaviour.
 *
 * Everything that used to be hard-coded (`necOption === 'A' || 'C'`) or defined a
 * second time in `costPlans.ts` now reads this table:
 * - which tabs appear in Document Management (`flows`)
 * - whether Activity Schedule / BQ reference / Subletting exist
 * - what a Compensation Event links to (`ceTarget`)
 * - which documents the option requires (`documents`)
 */
export interface NecOptionInfo {
  id: NecOption;
  name: string;
  contract: string;
  main: MainPricingDoc;
  mainLabel: string;
  flows: PricingFlow[];
  /** Project has an Activity Schedule (main for A/C, part of main for F). */
  activitySchedule: boolean;
  /** BQ exists only as a reference behind the Activity Schedule. */
  bqReference: boolean;
  /** Sub-Contractor (subletting) navigation is available. */
  subletting: boolean;
  /** Item set a Compensation Event links to. */
  ceTarget: 'activity' | 'bq';
  documents: Record<CostDocType, DocRequirement>;
}

export const NEC_OPTION_INFO: Record<NecOption, NecOptionInfo> = {
  A: {
    id: 'A',
    name: 'Option A',
    contract: 'Priced contract with activity schedule',
    main: 'activity',
    mainLabel: 'Activity Schedule',
    flows: ['activity', 'bq', 'ce'],
    activitySchedule: true,
    bqReference: true,
    subletting: true,
    ceTarget: 'activity',
    documents: {
      bq: 'na',
      ce: 'optional',
      invoices: 'conditional',
      activity: 'required',
      programme: 'optional',
      rates: 'conditional'
    }
  },
  B: {
    id: 'B',
    name: 'Option B',
    contract: 'Priced contract with bill of quantities',
    main: 'bq',
    mainLabel: 'Bill of Quantities',
    flows: ['bq', 'ce'],
    activitySchedule: false,
    bqReference: false,
    subletting: false,
    ceTarget: 'bq',
    documents: {
      bq: 'required',
      ce: 'optional',
      invoices: 'conditional',
      activity: 'na',
      programme: 'optional',
      rates: 'conditional'
    }
  },
  C: {
    id: 'C',
    name: 'Option C',
    contract: 'Target cost contract with activity schedule',
    main: 'activity',
    mainLabel: 'Activity Schedule',
    flows: ['activity', 'bq', 'ce'],
    activitySchedule: true,
    bqReference: true,
    subletting: true,
    ceTarget: 'activity',
    documents: {
      bq: 'na',
      ce: 'optional',
      invoices: 'required',
      activity: 'required',
      programme: 'optional',
      rates: 'conditional'
    }
  },
  D: {
    id: 'D',
    name: 'Option D',
    contract: 'Target cost contract with bill of quantities',
    main: 'bq',
    mainLabel: 'Bill of Quantities',
    flows: ['bq', 'ce'],
    activitySchedule: false,
    bqReference: false,
    subletting: false,
    ceTarget: 'bq',
    documents: {
      bq: 'required',
      ce: 'optional',
      invoices: 'required',
      activity: 'na',
      programme: 'optional',
      rates: 'conditional'
    }
  },
  E: {
    id: 'E',
    name: 'Option E',
    contract: 'Cost reimbursable contract',
    main: 'cost',
    mainLabel: 'Cost records',
    flows: ['bq', 'ce'],
    activitySchedule: false,
    bqReference: false,
    subletting: false,
    ceTarget: 'bq',
    documents: {
      bq: 'na',
      ce: 'optional',
      invoices: 'required',
      activity: 'na',
      programme: 'optional',
      rates: 'conditional'
    }
  },
  F: {
    id: 'F',
    name: 'Option F',
    contract: 'Management contract',
    main: 'activity-cost',
    mainLabel: 'Activity Schedule + cost records',
    flows: ['activity', 'bq', 'ce'],
    activitySchedule: true,
    bqReference: true,
    subletting: false,
    ceTarget: 'activity',
    documents: {
      bq: 'conditional',
      ce: 'optional',
      invoices: 'required',
      activity: 'required',
      programme: 'optional',
      rates: 'conditional'
    }
  }
};

export const REQUIREMENT_LABEL: Record<DocRequirement, string> = {
  required: 'Required',
  optional: 'Optional',
  conditional: 'If required',
  na: 'Not applicable'
};

/** Safe accessor — unknown / missing option falls back to the first option. */
export const optionInfo = (option?: NecOption): NecOptionInfo =>
  (option && NEC_OPTION_INFO[option]) || NEC_OPTION_INFO.A;

export const optionFlows = (option?: NecOption): PricingFlow[] =>
  optionInfo(option).flows;

export const applicableDocs = (option?: NecOption): CostDocType[] => {
  const documents = optionInfo(option).documents;
  return (Object.keys(documents) as CostDocType[]).filter(
    type => documents[type] !== 'na'
  );
};

export const requiredDocs = (option?: NecOption): CostDocType[] => {
  const documents = optionInfo(option).documents;
  return (Object.keys(documents) as CostDocType[]).filter(
    type => documents[type] === 'required'
  );
};

export const NEC_OPTION_IDS = Object.keys(NEC_OPTION_INFO) as NecOption[];

export interface ProjectRecord {
  id: string;
  name: string;
  number: string;
  description: string;
  standard: ProjectStandard;
  necOption: NecOption;
  createdAt: number;
}

const STORAGE_KEY = STORAGE_KEYS.projects;

export const SEED_PROJECTS: ProjectRecord[] = [
  {
    id: 'p-tank',
    name: 'ND201801 Tank STM',
    number: 'ND201801-BK-ST-NC-TANK_STM-300',
    description: 'Structural concrete tank package',
    standard: 'HKSMM4',
    necOption: 'A',
    createdAt: Date.UTC(2026, 10, 13)
  },
  {
    id: 'p-rc-frame',
    name: 'KT-2026-01 RC Frame',
    number: 'BK-KT-2026-01',
    description: 'Reinforced concrete frame and basement',
    standard: 'HKSMM4',
    necOption: 'D',
    createdAt: Date.UTC(2026, 10, 9)
  },
  {
    id: 'p-drainage',
    name: 'CESMM4 Drainage Upgrade',
    number: 'CE-2026-014',
    description: 'Site drainage and external works',
    standard: 'CESMM',
    necOption: 'B',
    createdAt: Date.UTC(2026, 9, 28)
  }
];

const isProject = (value: unknown): value is ProjectRecord => {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<ProjectRecord>;
  return (
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    typeof project.number === 'string' &&
    typeof project.description === 'string' &&
    (project.standard === 'HKSMM4' || project.standard === 'CESMM') &&
    typeof project.createdAt === 'number'
  );
};

export const loadProjects = (): ProjectRecord[] => {
  const parsed = readJson<unknown>(STORAGE_KEY, SEED_PROJECTS);
  if (!Array.isArray(parsed)) return SEED_PROJECTS;
  const projects = parsed.filter(isProject).map(project => ({
    ...project,
    necOption: NEC_OPTION_IDS.includes(project.necOption)
      ? project.necOption
      : 'B'
  }));
  return projects.length ? projects : SEED_PROJECTS;
};

export const saveProjects = (projects: ProjectRecord[]): boolean =>
  writeJson(STORAGE_KEYS.projects, projects);

/* --------------------------------------------------------- active project */

export const loadActiveProjectId = (): string | null =>
  readRaw(STORAGE_KEYS.activeProject);

export const saveActiveProjectId = (id: string | null): void => {
  if (id) writeRaw(STORAGE_KEYS.activeProject, id);
  else removeKey(STORAGE_KEYS.activeProject);
};
