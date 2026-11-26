import { projectStorageKey } from './projectStorage';

export type ScanAssetType = 'bim' | 'drawing' | 'scan';
export type ScanStage = 'processing' | 'review' | 'cleanse';

export interface ScanAsset {
  id: string;
  type: ScanAssetType;
  name: string;
  size: number;
  projectName: string;
  projectNumber: string;
  clientName: string;
  uploader: string;
  position: string;
  avatar?: string;
  addedAt: number;
  favorite: boolean;
  preview: number;
  stage: ScanStage;
  thumbnail?: string;
  modelId?: string;
}

const STORAGE_BASE = 'apc.scan-assets.v2';

export const SEED_SCAN_ASSETS: ScanAsset[] = [
  {
    id: 'scan-a1',
    type: 'bim',
    name: 'ND201801-BK-ST-NC-TANK_STM-300.ifc',
    size: 48_600_000,
    projectName: 'ND201801 Tank STM',
    projectNumber: 'ND201801-BK-ST-NC-TANK_STM-300',
    clientName: 'Gammon Construction',
    uploader: 'May',
    position: 'BIM Coordinator',
    avatar: '/import/May.png',
    addedAt: Date.UTC(2026, 10, 13, 9, 42),
    favorite: true,
    preview: 0,
    stage: 'review'
  },
  {
    id: 'scan-a2',
    type: 'bim',
    name: 'KT-2026-01_RC_Frame.ifc',
    size: 36_200_000,
    projectName: 'KT-2026-01 RC Frame',
    projectNumber: 'BK-KT-2026-01',
    clientName: 'Chun Wo Construction',
    uploader: 'John',
    position: 'Structural Engineer',
    avatar: '/import/john.png',
    addedAt: Date.UTC(2026, 10, 12, 15, 18),
    favorite: false,
    preview: 1,
    stage: 'cleanse'
  },
  {
    id: 'scan-a3',
    type: 'bim',
    name: 'Marina_South_Tower.ifc',
    size: 61_800_000,
    projectName: 'Marina South Tower',
    projectNumber: 'MS-2026-008',
    clientName: 'AECOM',
    uploader: 'Mary',
    position: 'Quantity Surveyor',
    avatar: '/import/Mary.png',
    addedAt: Date.UTC(2026, 10, 11, 11, 6),
    favorite: false,
    preview: 2,
    stage: 'processing'
  },
  {
    id: 'scan-d1',
    type: 'drawing',
    name: 'RW-03_S-201_General_Arrangement.pdf',
    size: 8_400_000,
    projectName: 'Tung Chung RW-03',
    projectNumber: 'CV/2026/014',
    clientName: 'Civil Engineering and Development Department',
    uploader: 'Dicky Lam',
    position: 'Quantity Surveyor',
    addedAt: Date.UTC(2026, 10, 10, 14, 20),
    favorite: false,
    preview: 0,
    stage: 'review'
  },
  {
    id: 'scan-d2',
    type: 'drawing',
    name: 'RW-03_S-301_Structural_Framing.dwg',
    size: 12_600_000,
    projectName: 'Tung Chung RW-03',
    projectNumber: 'CV/2026/014',
    clientName: 'Civil Engineering and Development Department',
    uploader: 'May',
    position: 'BIM Coordinator',
    avatar: '/import/May.png',
    addedAt: Date.UTC(2026, 10, 9, 9, 5),
    favorite: true,
    preview: 1,
    stage: 'review'
  },
  {
    id: 'scan-p1',
    type: 'scan',
    name: 'Tung_Chung_RW-03_Scan_Level1.e57',
    size: 185_000_000,
    projectName: 'Tung Chung RW-03',
    projectNumber: 'CV/2026/014',
    clientName: 'Civil Engineering and Development Department',
    uploader: 'John',
    position: 'Land Surveyor',
    avatar: '/import/john.png',
    addedAt: Date.UTC(2026, 10, 8, 16, 48),
    favorite: false,
    preview: 0,
    stage: 'review'
  },
  {
    id: 'scan-p2',
    type: 'scan',
    name: 'Tung_Chung_RW-03_Scan_Level2.las',
    size: 240_000_000,
    projectName: 'Tung Chung RW-03',
    projectNumber: 'CV/2026/014',
    clientName: 'Civil Engineering and Development Department',
    uploader: 'Mary',
    position: 'Quantity Surveyor',
    avatar: '/import/Mary.png',
    addedAt: Date.UTC(2026, 10, 7, 10, 12),
    favorite: false,
    preview: 1,
    stage: 'review'
  }
];

const isScanAsset = (value: unknown): value is ScanAsset => {
  if (!value || typeof value !== 'object') return false;
  const asset = value as Partial<ScanAsset>;
  return (
    typeof asset.id === 'string' &&
    (asset.type === 'bim' || asset.type === 'drawing' || asset.type === 'scan') &&
    typeof asset.name === 'string' &&
    typeof asset.size === 'number' &&
    typeof asset.projectName === 'string' &&
    typeof asset.projectNumber === 'string' &&
    typeof asset.clientName === 'string' &&
    typeof asset.uploader === 'string' &&
    typeof asset.position === 'string' &&
    (asset.avatar === undefined || typeof asset.avatar === 'string') &&
    typeof asset.addedAt === 'number' &&
    typeof asset.favorite === 'boolean' &&
    typeof asset.preview === 'number' &&
    (asset.stage === undefined ||
      asset.stage === 'processing' ||
      asset.stage === 'review' ||
      asset.stage === 'cleanse') &&
    (asset.thumbnail === undefined || typeof asset.thumbnail === 'string') &&
    (asset.modelId === undefined || typeof asset.modelId === 'string')
  );
};

const stageOf = (value: unknown): ScanStage =>
  value === 'processing' || value === 'cleanse' ? value : 'review';

export const loadScanAssets = (projectId?: string): ScanAsset[] => {
  try {
    const raw = window.localStorage.getItem(
      projectStorageKey(STORAGE_BASE, projectId)
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(isScanAsset).map(asset => ({
          ...asset,
          stage: stageOf(asset.stage),
          thumbnail: asset.thumbnail,
          modelId: asset.modelId
        }))
      : [];
  } catch {
    return [];
  }
};

export const saveScanAssets = (assets: ScanAsset[], projectId?: string) => {
  try {
    window.localStorage.setItem(
      projectStorageKey(STORAGE_BASE, projectId),
      JSON.stringify(assets)
    );
  } catch {
    return;
  }
};
