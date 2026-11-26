import {
  STORAGE_KEYS,
  readProjectJson,
  writeProjectJson
} from '../data/storage';

export interface Subcontractor {
  id: string;
  name: string;
}

const STORAGE_BASE = STORAGE_KEYS.subcontractors;

const isSubcontractor = (value: unknown): value is Subcontractor => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Subcontractor;
  return typeof item.id === 'string' && typeof item.name === 'string';
};

export const loadSubcontractors = (projectId?: string): Subcontractor[] => {
  const parsed = readProjectJson<unknown>(STORAGE_BASE, projectId, []);
  return Array.isArray(parsed) ? parsed.filter(isSubcontractor) : [];
};

export const saveSubcontractors = (
  list: Subcontractor[],
  projectId?: string
): boolean => writeProjectJson(STORAGE_BASE, projectId, list);

export const nextSubcontractorId = (list: Subcontractor[]): string => {
  const max = list.reduce((current, item) => {
    const match = item.id.match(/^SC-(\d+)$/i);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `SC-${String(max + 1).padStart(3, '0')}`;
};
