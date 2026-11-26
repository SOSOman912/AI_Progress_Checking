/**
 * Document Management repository.
 *
 * Owns `apc.documents.v3:<projectId>` — the BQ / Activity Schedule / CE / Rates
 * file records and their import results. Other domains (CE link pickers, mapping)
 * must read documents through this module, never by parsing the key themselves.
 */

import { STORAGE_KEYS, readOptionJson, writeOptionJson } from './storage';

export type DocumentFlow = 'bq' | 'activity';
export type DocFileKind = 'bq' | 'sp' | 'pp' | 'drawing';
export type DocFileStatus = 'uploading' | 'ready';

export interface StoredDocumentFile {
  id: string;
  kind: DocFileKind;
  name: string;
  size: number;
  progress: number;
  status: DocFileStatus;
  addedAt: number;
}

export interface StoredDocument {
  id: string;
  code: string;
  name: string;
  files: StoredDocumentFile[];
  status: 'pending' | 'confirm';
  flow?: DocumentFlow;
  processedAt: number;
  activityItemIds?: string[];
  linkedActivityId?: string;
  linkedActivityCode?: string;
  linkedActivityName?: string;
}

/** Lightweight option used by CE / mapping pickers. */
export interface DocumentOption {
  id: string;
  code: string;
  name: string;
  itemIds?: string[];
}

interface StoredDocuments {
  records?: unknown;
}

const isDocumentFile = (value: unknown): value is StoredDocumentFile => {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<StoredDocumentFile>;
  return (
    typeof file.id === 'string' &&
    (file.kind === 'bq' ||
      file.kind === 'sp' ||
      file.kind === 'pp' ||
      file.kind === 'drawing') &&
    typeof file.name === 'string' &&
    typeof file.size === 'number' &&
    typeof file.progress === 'number' &&
    (file.status === 'uploading' || file.status === 'ready') &&
    typeof file.addedAt === 'number'
  );
};

const isDocument = (value: unknown): value is StoredDocument => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<StoredDocument>;
  return (
    typeof record.id === 'string' &&
    typeof record.code === 'string' &&
    typeof record.name === 'string' &&
    Array.isArray(record.files) &&
    record.files.every(isDocumentFile) &&
    (record.status === 'pending' || record.status === 'confirm') &&
    typeof record.processedAt === 'number' &&
    (record.activityItemIds === undefined ||
      (Array.isArray(record.activityItemIds) &&
        record.activityItemIds.every(id => typeof id === 'string'))) &&
    (record.linkedActivityId === undefined ||
      typeof record.linkedActivityId === 'string') &&
    (record.linkedActivityCode === undefined ||
      typeof record.linkedActivityCode === 'string') &&
    (record.linkedActivityName === undefined ||
      typeof record.linkedActivityName === 'string')
  );
};

export const loadDocuments = (
  projectId?: string,
  option?: string
): StoredDocument[] => {
  const parsed = readOptionJson<StoredDocuments>(
    STORAGE_KEYS.documents,
    projectId,
    option,
    {}
  );
  return Array.isArray(parsed.records)
    ? parsed.records.filter(isDocument)
    : [];
};

export const saveDocuments = (
  records: StoredDocument[],
  projectId?: string,
  option?: string
): boolean =>
  writeOptionJson(STORAGE_KEYS.documents, projectId, option, { records });

export const upsertDocument = (
  record: StoredDocument,
  projectId?: string,
  option?: string
): StoredDocument[] => {
  const existing = loadDocuments(projectId, option);
  const next = existing.some(item => item.id === record.id)
    ? existing.map(item => (item.id === record.id ? record : item))
    : [record, ...existing];
  saveDocuments(next, projectId, option);
  return next;
};

export const nextDocumentCode = (
  records: StoredDocument[],
  flow: DocumentFlow = 'bq'
): string => {
  const prefix = flow === 'activity' ? 'AS' : 'BQ';
  const max = records
    .filter(record => (record.flow ?? 'bq') === flow)
    .reduce((value, record) => {
      const number = Number(record.code.split('-').pop());
      return Number.isFinite(number) ? Math.max(value, number) : value;
    }, 0);
  return `${prefix}-2026-${String(max + 1).padStart(3, '0')}`;
};

export const documentsOfFlow = (
  records: StoredDocument[],
  flow: DocumentFlow
): StoredDocument[] => records.filter(record => (record.flow ?? 'bq') === flow);

/** Options for a CE / mapping picker, resolved from stored documents. */
export const loadDocumentOptions = (
  projectId: string | undefined,
  flow: DocumentFlow,
  option?: string
): DocumentOption[] =>
  documentsOfFlow(loadDocuments(projectId, option), flow).map(record => ({
    id: record.id,
    code: record.code,
    name: record.name,
    itemIds: record.activityItemIds
  }));
