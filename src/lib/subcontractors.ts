import { projectStorageKey } from './projectStorage';

export interface Subcontractor {
  id: string;
  name: string;
}

const STORAGE_BASE = 'apc.subcontractors.v1';

const isSubcontractor = (value: unknown): value is Subcontractor => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Subcontractor;
  return typeof item.id === 'string' && typeof item.name === 'string';
};

export const loadSubcontractors = (projectId?: string): Subcontractor[] => {
  try {
    const raw = window.localStorage.getItem(
      projectStorageKey(STORAGE_BASE, projectId)
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSubcontractor) : [];
  } catch {
    return [];
  }
};

export const saveSubcontractors = (
  list: Subcontractor[],
  projectId?: string
) => {
  try {
    window.localStorage.setItem(
      projectStorageKey(STORAGE_BASE, projectId),
      JSON.stringify(list)
    );
  } catch {
    return;
  }
};

export const nextSubcontractorId = (list: Subcontractor[]): string => {
  const max = list.reduce((current, item) => {
    const match = item.id.match(/^SC-(\d+)$/i);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `SC-${String(max + 1).padStart(3, '0')}`;
};
