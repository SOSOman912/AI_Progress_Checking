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

const STORAGE_KEY = 'apc.scan-assets.v1';

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

export const loadScanAssets = (): ScanAsset[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_SCAN_ASSETS.filter(asset => asset.type === 'bim');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return SEED_SCAN_ASSETS;
    return parsed
      .filter(isScanAsset)
      .filter(asset => asset.type === 'bim')
      .map(asset => {
        const seed = SEED_SCAN_ASSETS.find(item => item.id === asset.id);
        const base = seed ? { ...seed, favorite: asset.favorite } : asset;
        return {
          ...base,
          stage: stageOf(asset.stage ?? seed?.stage),
          thumbnail: asset.thumbnail,
          modelId: asset.modelId
        };
      });
  } catch {
    return SEED_SCAN_ASSETS;
  }
};

export const saveScanAssets = (assets: ScanAsset[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  } catch {
    return;
  }
};
