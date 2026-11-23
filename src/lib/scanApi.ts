import type { ElementData } from './demo';
import type { IfcModelMeta } from './ifc';
import type { ScanAsset, ScanStage } from './scanAssets';

/**
 * Optional demo API client.
 * Every call fails fast; the AI Scanning page keeps its local simulation when
 * the demo backend folder is not running or has been removed.
 */
const BASE = 'http://localhost:8781';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeout?: number;
}

interface RawAsset {
  id: string;
  type: 'bim' | 'drawing' | 'scan';
  name: string;
  size?: number;
  projectName?: string;
  projectNumber?: string;
  clientName?: string;
  uploader?: string;
  position?: string;
  avatar?: string;
  addedAt?: number;
  favorite?: boolean;
  preview?: number;
  stage?: string;
  thumbnail?: string;
  modelId?: string;
}

export interface ScanImportFile {
  id: string;
  type: string;
  name: string;
  size: number;
  projectName: string;
  projectNumber: string;
  clientName: string;
  uploader: string;
  position: string;
  avatar?: string;
  preview: number;
}

export interface ScanJobState {
  jobId: string;
  status: 'running' | 'done';
  pct: number;
  stage: string;
  asset?: RawAsset;
}

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeout ?? 1500);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Demo API ${response.status}`);
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
};

const stageOf = (value: unknown): ScanStage =>
  value === 'processing' || value === 'cleanse' ? value : 'review';

export const normalizeScanAsset = (raw: RawAsset): ScanAsset => ({
  id: raw.id,
  type: raw.type,
  name: raw.name,
  size: raw.size ?? 0,
  projectName: raw.projectName ?? 'Demo project',
  projectNumber: raw.projectNumber ?? 'DEMO-001',
  clientName: raw.clientName ?? 'Client not set',
  uploader: raw.uploader ?? 'Dicky Lam',
  position: raw.position ?? 'Quantity Surveyor',
  avatar: raw.avatar,
  addedAt: raw.addedAt ?? Date.now(),
  favorite: !!raw.favorite,
  preview: raw.preview ?? 0,
  stage: stageOf(raw.stage),
  thumbnail: typeof raw.thumbnail === 'string' ? raw.thumbnail : undefined,
  modelId: typeof raw.modelId === 'string' ? raw.modelId : undefined
});

export const probeScanApi = async (): Promise<boolean> => {
  try {
    const result = await request<{ ok: boolean }>('/api/health', { timeout: 1000 });
    return !!result.ok;
  } catch {
    return false;
  }
};

export const listScanAssets = async (): Promise<ScanAsset[]> => {
  const result = await request<{ assets: RawAsset[] }>('/api/scan/assets');
  return (result.assets ?? []).map(normalizeScanAsset);
};

export const startScanImport = (files: ScanImportFile[]) =>
  request<{ jobId: string }>('/api/scan/imports', {
    method: 'POST',
    body: { files },
    timeout: 4000
  });

export const fetchScanJob = (jobId: string) =>
  request<ScanJobState>(`/api/scan/jobs/${encodeURIComponent(jobId)}`);

export const patchScanAsset = (
  id: string,
  patch: { stage?: ScanStage; favorite?: boolean; thumbnail?: string }
) =>
  request<{ ok: boolean }>(`/api/scan/assets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
    timeout: 4000
  });

export const saveScanAsset = (asset: ScanAsset) =>
  request<{ ok: boolean }>('/api/scan/assets', {
    method: 'POST',
    body: asset,
    timeout: 5000
  });

export const deleteScanAsset = (id: string) =>
  request<{ ok: boolean }>(`/api/scan/assets/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });

export const cleanseScanAsset = (id: string) =>
  request<{ ok: boolean }>(`/api/scan/runs/${encodeURIComponent(id)}/cleanse`, {
    method: 'POST',
    timeout: 4000
  });

export interface IfcModelPayload {
  id: string;
  fileName: string;
  meta: IfcModelMeta;
  elements: ElementData[];
}

export const getIfcModel = (modelId: string) =>
  request<{ id: string; fileName: string; meta: IfcModelMeta; elements: ElementData[] }>(
    `/api/ifc/models/${encodeURIComponent(modelId)}`,
    { timeout: 4000 }
  );

const withoutMesh = (element: ElementData) => {
  const { mesh, ...rest } = element;
  void mesh;
  return rest;
};

export const upsertIfcModel = (model: IfcModelPayload) =>
  request<{ ok: boolean }>('/api/ifc/models', {
    method: 'POST',
    body: { ...model, elements: model.elements.map(withoutMesh) },
    timeout: 8000
  });

export const patchIfcElement = (
  modelId: string,
  elementId: string,
  patch: { mat?: string; level?: string; zone?: string; quantity?: string; status?: string; resolved?: boolean }
) =>
  request<{ ok: boolean }>(
    `/api/ifc/models/${encodeURIComponent(modelId)}/elements/${encodeURIComponent(elementId)}`,
    { method: 'PATCH', body: patch, timeout: 4000 }
  );

export const cleanseIfcModel = (modelId: string) =>
  request<{ ok: boolean }>(`/api/ifc/models/${encodeURIComponent(modelId)}/cleanse`, {
    method: 'POST',
    timeout: 4000
  });
