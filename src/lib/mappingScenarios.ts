import type { NecOption } from './costPlans';
import {
  STORAGE_KEYS,
  readProjectJson,
  writeProjectJson
} from '../data/storage';

export type MappingType = 'progress' | 'cost' | 'hybrid';
export type MappingStatus = 'draft' | 'in-progress' | 'complete';
export type MappingDocType =
  | 'bim'
  | 'pointCloud'
  | 'programme'
  | 'bq'
  | 'ce'
  | 'invoices'
  | 'activity'
  | 'rates';

export interface MappingSources {
  bim?: string;
  bimAssetId?: string;
  bimModelId?: string;
  pointCloud?: string;
  pointCloudAssetId?: string;
  programme?: string;
  bq?: string;
  necOption?: NecOption;
  ce?: string;
  invoices?: string;
  activity?: string;
  rates?: string;
}

export const MAPPING_DOC_TYPES: Record<MappingType, MappingDocType[]> = {
  progress: ['bim', 'pointCloud', 'programme'],
  cost: [],
  hybrid: ['bim', 'pointCloud', 'programme', 'bq']
};

export const MAPPING_DOC_LABEL: Record<MappingDocType, string> = {
  bim: 'BIM model',
  pointCloud: 'Point cloud',
  programme: 'Master programme',
  bq: 'Bill of Quantities',
  ce: 'CE documents',
  invoices: 'Invoices',
  activity: 'Activity Schedule',
  rates: 'Schedule of rates'
};

export const MAPPING_DOC_ICON: Record<MappingDocType, string> = {
  bim: 'box',
  pointCloud: 'scan',
  programme: 'file-text',
  bq: 'file-spreadsheet',
  ce: 'file-text',
  invoices: 'invoice-dn',
  activity: 'clipboard-check',
  rates: 'list-tree'
};

export interface MappingScenario {
  id: string;
  name: string;
  type: MappingType;
  projectName: string;
  projectNumber: string;
  modelName: string;
  standard: string;
  elementCount: number;
  smmItemCount: number;
  mappedCount: number;
  status: MappingStatus;
  sources?: MappingSources;
  createdAt: number;
  updatedAt: number;
}

export const countSources = (scenario: MappingScenario) => {
  const sources = scenario.sources ?? {};
  return [
    sources.bim,
    sources.pointCloud,
    sources.programme,
    sources.bq,
    sources.ce,
    sources.invoices,
    sources.activity,
    sources.rates
  ].filter(Boolean).length;
};

export const MAPPING_TYPE_LABEL: Record<MappingType, string> = {
  progress: 'Progress tracking',
  cost: 'Cost management',
  hybrid: 'Mapping Model'
};

export const MAPPING_STATUS_LABEL: Record<MappingStatus, string> = {
  draft: 'Draft',
  'in-progress': 'In progress',
  complete: 'Complete'
};

export const MAPPING_STANDARDS = ['HKCESMM 2011', 'HKSMM4', 'CESMM'];

const STORAGE_BASE = STORAGE_KEYS.mappingScenarios;
const DAY = 86_400_000;

const seedScenarios = (): MappingScenario[] => {
  const now = Date.now();
  return [
    {
      id: 'map-seed-progress',
      name: 'Tank STM AI progress checking',
      type: 'hybrid',
      projectName: 'ND201801 Tank STM',
      projectNumber: 'ND201801-BK-ST-NC',
      modelName: 'ND201801-BK-ST-NC-TANK_STM-300 7.ifc',
      standard: 'HKCESMM 2011',
      elementCount: 11,
      smmItemCount: 1240,
      mappedCount: 8,
      status: 'in-progress',
      sources: {
        bim: 'ND201801-BK-ST-NC-TANK_STM-300 7.ifc',
        pointCloud: 'Tank_STM_Scan_2026-11.e57',
        activity: 'ND201801 Activity Schedule Rev B.xlsx',
        programme: 'ND201801_P6_Update_Nov.xer',
        necOption: 'A'
      },
      createdAt: now - DAY * 4,
      updatedAt: now - DAY
    },
    {
      id: 'map-seed-cost',
      name: 'KT-2026-01 AI progress checking',
      type: 'hybrid',
      projectName: 'KT-2026-01 RC Frame',
      projectNumber: 'BK-KT-2026-01',
      modelName: 'KT-2026-01_RC_Frame.ifc',
      standard: 'HKSMM4',
      elementCount: 11,
      smmItemCount: 910,
      mappedCount: 11,
      status: 'complete',
      sources: {
        bim: 'KT-2026-01_RC_Frame.ifc',
        pointCloud: 'KT-2026-01_Scan_2026-09.e57',
        necOption: 'D',
        bq: 'KT-2026-01 BQ Rev C.xlsx',
        invoices: 'RW-03 Invoice Pack 2026-10.pdf',
        ce: 'KT-2026-01 CE 2026-10.xlsx'
      },
      createdAt: now - DAY * 9,
      updatedAt: now - DAY * 2
    },
    {
      id: 'map-seed-hybrid',
      name: 'Marina South AI progress checking',
      type: 'hybrid',
      projectName: 'Marina South Tower',
      projectNumber: 'MS-2026-008',
      modelName: 'Marina_South_Tower.ifc',
      standard: 'CESMM',
      elementCount: 11,
      smmItemCount: 1680,
      mappedCount: 6,
      status: 'draft',
      sources: {
        bim: 'Marina_South_Tower.ifc',
        pointCloud: 'Marina_South_Scan_2026-10.las',
        programme: 'Marina_South_P6_Programme.xer',
        bq: 'RW-03 BQ Rev C.xlsx',
        activity: 'RW-03 Activity Schedule Rev B.xlsx',
        invoices: 'RW-03 Invoice Pack 2026-10.pdf',
        necOption: 'F'
      },
      createdAt: now - DAY * 2,
      updatedAt: now - DAY * 2
    }
  ];
};

const isScenario = (value: unknown): value is MappingScenario => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MappingScenario>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    (item.type === 'progress' || item.type === 'cost' || item.type === 'hybrid') &&
    typeof item.projectName === 'string' &&
    typeof item.projectNumber === 'string' &&
    typeof item.modelName === 'string' &&
    typeof item.standard === 'string' &&
    typeof item.elementCount === 'number' &&
    typeof item.smmItemCount === 'number' &&
    typeof item.mappedCount === 'number' &&
    (item.status === 'draft' || item.status === 'in-progress' || item.status === 'complete') &&
    (item.sources === undefined ||
      (typeof item.sources === 'object' &&
        item.sources !== null &&
        [
          'bim',
          'pointCloud',
          'programme',
          'bq',
          'bimAssetId',
          'bimModelId',
          'pointCloudAssetId',
          'ce',
          'invoices',
          'activity',
          'rates',
          'necOption'
        ].every(
          key => (item.sources as Record<string, unknown>)[key] === undefined ||
            typeof (item.sources as Record<string, unknown>)[key] === 'string'
        ) &&
        ((item.sources as Record<string, unknown>).necOption === undefined ||
          ['A', 'B', 'C', 'D', 'E', 'F'].includes(
            (item.sources as Record<string, unknown>).necOption as string
          )))) &&
    typeof item.createdAt === 'number' &&
    typeof item.updatedAt === 'number'
  );
};

export const loadMappingScenarios = (projectId?: string): MappingScenario[] => {
  const parsed = readProjectJson<unknown>(STORAGE_BASE, projectId, []);
  return Array.isArray(parsed) ? parsed.filter(isScenario) : [];
};

export const saveMappingScenarios = (
  scenarios: MappingScenario[],
  projectId?: string
): boolean => writeProjectJson(STORAGE_BASE, projectId, scenarios);

export const newMappingScenarioId = () =>
  `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
