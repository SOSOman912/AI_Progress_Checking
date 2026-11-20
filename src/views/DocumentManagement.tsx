import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { CompensationEventPage } from './CompensationEventPage';
import { FlowTabs, type DocFlow } from '../components/FlowTabs';
import {
  BqRecordTable,
  CleanseBqView,
  PreprocessingResult,
  ProcessingPanel,
  type BqRecordRow,
  type ViewerDoc
} from './Preprocessing';

type DocKind = 'bq' | 'sp' | 'pp' | 'drawing';
type DocStatus = 'uploading' | 'ready';
type WorkspaceView = 'documents' | 'result' | 'cleanse';
type ImportPhase = 'upload' | 'processing' | 'complete';
type ResultMode = 'review' | 'reprocess';

interface DocFile {
  id: string;
  kind: DocKind;
  name: string;
  size: number;
  progress: number;
  status: DocStatus;
  addedAt: number;
}

interface BqRecord {
  id: string;
  code: string;
  name: string;
  files: DocFile[];
  status: 'pending' | 'confirm';
  processedAt: number;
}

interface StoredRecords {
  records: BqRecord[];
}

interface LegacyStoredDocuments {
  files?: unknown;
  bqRecordStatus?: unknown;
}

const STORAGE_KEY = 'apc.documents.v2';
const LEGACY_STORAGE_KEY = 'apc.documents.v1';

const isDocFile = (value: unknown): value is DocFile => {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<DocFile>;
  return (
    typeof file.id === 'string' &&
    (file.kind === 'bq' || file.kind === 'sp' || file.kind === 'pp' || file.kind === 'drawing') &&
    typeof file.name === 'string' &&
    typeof file.size === 'number' &&
    typeof file.progress === 'number' &&
    (file.status === 'uploading' || file.status === 'ready') &&
    typeof file.addedAt === 'number'
  );
};

const isBqRecord = (value: unknown): value is BqRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<BqRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.code === 'string' &&
    typeof record.name === 'string' &&
    Array.isArray(record.files) &&
    record.files.every(isDocFile) &&
    (record.status === 'pending' || record.status === 'confirm') &&
    typeof record.processedAt === 'number'
  );
};

const loadRecords = (): BqRecord[] => {
  try {
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current) {
      const parsed = JSON.parse(current) as Partial<StoredRecords>;
      if (Array.isArray(parsed.records)) return parsed.records.filter(isBqRecord);
    }

    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return [];
    const data = JSON.parse(legacy) as LegacyStoredDocuments;
    const files = Array.isArray(data.files) ? data.files.filter(isDocFile) : [];
    if (!files.length) return [];
    if (data.bqRecordStatus !== 'pending' && data.bqRecordStatus !== 'confirm') return [];
    const bq = files.find(file => file.kind === 'bq' && file.status === 'ready') ?? files.find(file => file.kind === 'bq');
    const record: BqRecord = {
      id: `legacy-${Date.now()}`,
      code: 'BQ-2026-001',
      name: bq?.name ?? 'BQ record',
      files,
      status: data.bqRecordStatus,
      processedAt: Date.now()
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ records: [record] }));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return [record];
  } catch {
    return [];
  }
};

const nextRecordCode = (records: BqRecord[]) => {
  const max = records.reduce((value, record) => {
    const number = Number(record.code.split('-').pop());
    return Number.isFinite(number) ? Math.max(value, number) : value;
  }, 0);
  return `BQ-2026-${String(max + 1).padStart(3, '0')}`;
};

const DOC_TYPES: Array<{
  id: DocKind;
  label: string;
  short: string;
  icon: IconName;
  art: string;
  accept: string;
  hint: string;
}> = [
  {
    id: 'bq',
    label: 'Bill of Quantity (BQ)',
    short: 'BQ',
    icon: 'file-spreadsheet',
    art: '/import/bq.png',
    accept: '.xlsx,.xls,.csv',
    hint: 'XLSX, XLS or CSV'
  },
  {
    id: 'sp',
    label: 'Special Preamble',
    short: 'SP',
    icon: 'file-text',
    art: '/import/special-preamble.png',
    accept: '.pdf,.doc,.docx,.xlsx,.xls',
    hint: 'PDF, Word or Excel'
  },
  {
    id: 'pp',
    label: 'Particular Preamble',
    short: 'PP',
    icon: 'book-open-text',
    art: '/import/particular-preamble.png',
    accept: '.pdf,.doc,.docx,.xlsx,.xls',
    hint: 'PDF, Word or Excel'
  },
  {
    id: 'drawing',
    label: 'Drawing',
    short: 'DWG',
    icon: 'drafting-compass',
    art: '/import/drawing.png',
    accept: '.pdf,.dwg,.dxf,.rvt,.ifc',
    hint: 'PDF, DWG, DXF, RVT or IFC'
  }
];

const sizeLabel = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const dateLabel = (time: number) =>
  new Date(time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const kindMeta = (kind: DocKind) => DOC_TYPES.find(d => d.id === kind)!;

export function DocumentManagement({ mode }: { mode: 'pricing' | 'invoice' }) {
  const initialRecords = useMemo(loadRecords, []);
  const [records, setRecords] = useState<BqRecord[]>(initialRecords);
  const [draftFiles, setDraftFiles] = useState<DocFile[]>([]);
  const [workflowRecordId, setWorkflowRecordId] = useState<string | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [resultMode, setResultMode] = useState<ResultMode>('review');
  const [recordMenuId, setRecordMenuId] = useState<string | null>(null);
  const [activeFlow, setActiveFlow] = useState<DocFlow>('bq');
  const [importOpen, setImportOpen] = useState(false);
  const [importPhase, setImportPhase] = useState<ImportPhase>('upload');
  const [processingPct, setProcessingPct] = useState(0);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('documents');
  const [confirming, setConfirming] = useState(false);
  const [missingTypes, setMissingTypes] = useState<DocKind[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [recordQuery, setRecordQuery] = useState('');

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ records }));
    } catch {
      return;
    }
  }, [records]);

  useEffect(() => {
    if (!recordMenuId) return;
    const close = () => setRecordMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [recordMenuId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDraftFiles(prev => {
        let changed = false;
        const next = prev.map(file => {
          if (file.status !== 'uploading') return file;
          changed = true;
          const progress = Math.min(100, file.progress + 9);
          return {
            ...file,
            progress,
            status: progress >= 100 ? 'ready' : 'uploading'
          } as DocFile;
        });
        return changed ? next : prev;
      });
    }, 320);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (importPhase !== 'processing') return;
    const started = Date.now();
    const snapshot = draftFiles
      .filter(file => file.status === 'ready')
      .map(file => ({ ...file, progress: 100, status: 'ready' as const }));
    const bqName = snapshot.find(file => file.kind === 'bq')?.name ?? 'BQ record';
    const timer = window.setInterval(() => {
      const next = Math.min(100, Math.round(((Date.now() - started) / 10000) * 100));
      setProcessingPct(next);
      if (next >= 100) {
        window.clearInterval(timer);
        const now = Date.now();
        if (workflowRecordId) {
          setRecords(prev =>
            prev.map(record =>
              record.id === workflowRecordId
                ? { ...record, files: snapshot, name: bqName, status: 'pending', processedAt: now }
                : record
            )
          );
          setActiveRecordId(workflowRecordId);
        } else {
          const id = `rec-${now}-${Math.random().toString(36).slice(2, 7)}`;
          setRecords(prev => [
            ...prev,
            {
              id,
              code: nextRecordCode(prev),
              name: bqName,
              files: snapshot,
              status: 'pending',
              processedAt: now
            }
          ]);
          setActiveRecordId(id);
        }
        setImportPhase('complete');
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [importPhase, draftFiles, workflowRecordId]);

  const readyDraftDocs = draftFiles.filter(file => file.status === 'ready');
  const filesForType = (kind: DocKind) =>
    draftFiles.filter(file => file.kind === kind).sort((a, b) => b.addedAt - a.addedAt);
  const hasAllTypes = DOC_TYPES.every(type => {
    const list = filesForType(type.id);
    return list.length > 0 && list.every(file => file.status === 'ready');
  });
  const activeRecord = records.find(record => record.id === activeRecordId) ?? null;

  const viewerDocs = useMemo<ViewerDoc[]>(
    () =>
      activeRecord
        ? DOC_TYPES.flatMap(type =>
            activeRecord.files
              .filter(file => file.kind === type.id)
              .sort((a, b) => a.addedAt - b.addedAt)
              .map(file => ({ id: file.id, kind: type.id, name: file.name }))
          )
        : [],
    [activeRecord]
  );

  const recordRows = useMemo<BqRecordRow[]>(
    () =>
      [...records]
        .sort((a, b) => b.processedAt - a.processedAt)
        .map(record => ({
          id: record.id,
          code: record.code,
          name: record.name,
          processedAt: dateLabel(record.processedAt),
          status: record.status
        })),
    [records]
  );

  const filteredRecordRows = useMemo(() => {
    const needle = recordQuery.trim().toLowerCase();
    if (!needle) return recordRows;
    return recordRows.filter(record =>
      [record.name, record.code, record.processedAt, record.status]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [recordRows, recordQuery]);

  const addFileList = (kind: DocKind, picked: File[]) => {
    if (!picked.length) return;
    const now = Date.now();
    const next = picked.map((file, index): DocFile => ({
      id: `${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'uploading',
      addedAt: now + index
    }));
    setDraftFiles(prev => [...prev, ...next]);
    setMissingTypes(prev => prev.filter(id => id !== kind));
    setImportError(null);
  };

  const addFiles = (kind: DocKind, event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = '';
    addFileList(kind, picked);
  };

  const dropFiles = (kind: DocKind, event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    addFileList(kind, Array.from(event.dataTransfer.files || []));
  };

  const removeFile = (id: string) => {
    setDraftFiles(prev => prev.filter(file => file.id !== id));
  };

  const resetImportState = () => {
    setImportOpen(false);
    setImportPhase('upload');
    setProcessingPct(0);
    setDraftFiles([]);
    setWorkflowRecordId(null);
    setMissingTypes([]);
    setImportError(null);
  };

  const selectFlow = (flow: DocFlow) => {
    setActiveFlow(flow);
    setWorkspaceView('documents');
    setConfirming(false);
    setRecordMenuId(null);
  };

  const startNewImport = () => {
    setWorkflowRecordId(null);
    setDraftFiles([]);
    setImportOpen(true);
    setImportPhase('upload');
    setProcessingPct(0);
    setMissingTypes([]);
    setImportError(null);
    setRecordMenuId(null);
  };

  const finishImport = () => {
    const missing = DOC_TYPES.filter(type => !filesForType(type.id).length).map(type => type.id);
    if (missing.length) {
      setMissingTypes(missing);
      setImportError('Upload the highlighted document types to continue.');
      return;
    }
    if (!hasAllTypes) {
      setMissingTypes([]);
      setImportError('Please wait for the uploads to finish.');
      return;
    }
    setMissingTypes([]);
    setImportError(null);
    setProcessingPct(0);
    setImportPhase('processing');
  };

  const seeResult = () => {
    setImportOpen(false);
    setImportPhase('upload');
    setProcessingPct(0);
    setDraftFiles([]);
    setWorkflowRecordId(null);
    setMissingTypes([]);
    setImportError(null);
    setResultMode('review');
    setWorkspaceView('result');
  };

  const confirmBq = () => {
    if (!activeRecordId) return;
    setConfirming(true);
  };

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => {
      if (activeRecordId) {
        setRecords(prev =>
          prev.map(record =>
            record.id === activeRecordId ? { ...record, status: 'confirm' } : record
          )
        );
      }
      setWorkspaceView('cleanse');
      setConfirming(false);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [confirming, activeRecordId]);

  const openRecord = (record: BqRecordRow) => {
    setActiveRecordId(record.id);
    setRecordMenuId(null);
    if (record.status === 'confirm') {
      setWorkspaceView('cleanse');
    } else {
      setResultMode('review');
      setWorkspaceView('result');
    }
  };

  const openRecordResult = (record: BqRecordRow) => {
    setActiveRecordId(record.id);
    setResultMode('reprocess');
    setWorkspaceView('result');
    setRecordMenuId(null);
  };

  const startReprocess = () => {
    if (!activeRecord) return;
    setWorkflowRecordId(activeRecord.id);
    setDraftFiles(activeRecord.files.map(file => ({ ...file, progress: 100, status: 'ready' as const })));
    setImportOpen(true);
    setImportPhase('upload');
    setProcessingPct(0);
    setMissingTypes([]);
    setImportError(null);
  };

  const deleteRecord = (id: string) => {
    setRecords(prev => prev.filter(record => record.id !== id));
    setRecordMenuId(null);
    if (activeRecordId === id) {
      setActiveRecordId(null);
      setWorkspaceView('documents');
    }
  };

  if (mode === 'invoice') {
    return (
      <main className="apc-docpage">
        <header className="apc-docpage__head">
          <h1>Invoice / DN</h1>
        </header>
        <div className="apc-docpage__empty">
          <Icon name="invoice-dn" size={28} />
          <b>Invoice / DN</b>
          <span>This workspace will handle invoice and delivery-note uploads.</span>
        </div>
      </main>
    );
  }

  if (activeFlow === 'ce') {
    return <CompensationEventPage onFlow={selectFlow} />;
  }

  return (
    <main className="apc-docpage">
      <header className="apc-docpage__head">
        <div className="apc-docpage__title">
          <h1>BQ records</h1>
          <span>Manage, reprocess and confirm BQ workflows.</span>
        </div>
        {workspaceView === 'documents' && (
          <button className="apc-docpage__new" onClick={startNewImport}>
            <span aria-hidden>+</span>
            Import
          </button>
        )}
      </header>

      <FlowTabs activeFlow={activeFlow} onSelect={selectFlow} />

      <div className="apc-docpage__body">
        {workspaceView === 'result' ? (
          <div className="apc-docpage__content apc-docpage__content--result">
            <PreprocessingResult
              docs={viewerDocs}
              actionLabel={
                resultMode === 'reprocess'
                  ? 'Submission Additional document and Reprocess'
                  : 'Confirm & generate Cleanse BQ'
              }
              onAction={resultMode === 'reprocess' ? startReprocess : confirmBq}
            />
          </div>
        ) : workspaceView === 'cleanse' ? (
          <CleanseBqView />
        ) : (
          <div className="apc-docpage__content apc-docpage__content--records">
            <div className="apc-recordstoolbar">
              <div className="apc-recordstoolbar__title">
                <b>All records</b>
                <span>{filteredRecordRows.length}</span>
              </div>
              <label className="apc-recordsearch">
                <Icon name="search" size={14} />
                <input
                  value={recordQuery}
                  onChange={event => setRecordQuery(event.target.value)}
                  placeholder="Search records..."
                />
              </label>
            </div>

            <BqRecordTable
              records={filteredRecordRows}
              menuId={recordMenuId}
              onOpen={openRecord}
              onToggleMenu={id => setRecordMenuId(prev => (prev === id ? null : id))}
              onReprocess={openRecordResult}
              onDelete={deleteRecord}
            />
          </div>
        )}
      </div>

      {confirming && (
        <div className="apc-docpage__scrim apc-confirm-scrim">
          <div className="apc-confirmload" role="status" aria-label="Generating Cleanse BQ">
            <span className="apc-confirmload__halo">
              <span className="apc-confirmload__spinner" />
            </span>
            <span>Generating Cleanse BQ…</span>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="apc-docpage__scrim">
          {importPhase === 'upload' ? (
            <section className="apc-importpop" role="dialog" aria-label="Import pricing documents">
              <div className="apc-importpop__head">
                <div>
                  <b>{workflowRecordId ? 'Update pricing documents' : 'Import pricing documents'}</b>
                  <span>
                    {workflowRecordId
                      ? 'Add or remove documents, then reprocess this BQ record.'
                      : 'Add the four document types before working in this module.'}
                  </span>
                </div>
                <button className="apc-iconbtn" onClick={resetImportState} aria-label="Close import">
                  <Icon name="x" size={15} />
                </button>
              </div>

              <div className="apc-importpop__scroll">
                <div className="apc-importgrid">
                  {DOC_TYPES.map(type => {
                    const list = filesForType(type.id);
                    const file = list[0];
                    const multiple = list.length > 1;
                    const allReady = list.length > 0 && list.every(item => item.status === 'ready');
                    const missing = missingTypes.includes(type.id);
                    return (
                      <label
                        key={type.id}
                        className={`apc-importcard${list.length ? ' is-filled' : ''}${allReady ? ' is-ready' : ''}${multiple ? ' is-multi' : ''}${missing ? ' is-missing' : ''}`}
                        onDragOver={event => event.preventDefault()}
                        onDrop={event => dropFiles(type.id, event)}
                      >
                        <input
                          type="file"
                          multiple
                          accept={type.accept}
                          onChange={event => addFiles(type.id, event)}
                        />
                        {list.length === 0 ? (
                          <>
                            <img className="apc-importcard__art" src={type.art} alt="" />
                            <b>{type.label}</b>
                            <span className="apc-importcard__copy">
                              Drag and drop your file here, or <strong>click to select</strong>.
                            </span>
                            <small>Supported formats: {type.hint}</small>
                            {missing && <span className="apc-importcard__required">Required</span>}
                          </>
                        ) : multiple ? (
                          <div className="apc-importcard__multi">
                            <span className="apc-importcard__kind">{type.short}</span>
                            <span className="apc-importcard__count">{list.length} files</span>
                            <div className="apc-importcard__multiscroll">
                              <table className="apc-importcard__multitable">
                                <thead>
                                  <tr>
                                    <th>File</th>
                                    <th>Size</th>
                                    <th>Status</th>
                                    <th />
                                  </tr>
                                </thead>
                                <tbody>
                                  {list.map(item => (
                                    <tr key={item.id}>
                                      <td>
                                        <b title={item.name}>{item.name}</b>
                                        <div className="apc-importcard__minibar">
                                          <i style={{ width: `${item.progress}%` }} />
                                        </div>
                                      </td>
                                      <td>{sizeLabel(item.size)}</td>
                                      <td>
                                        <span className={`apc-importcard__rowstatus${item.status === 'ready' ? ' ready' : ''}`}>
                                          {item.status === 'ready' ? 'Uploaded' : `${item.progress}%`}
                                        </span>
                                      </td>
                                      <td>
                                        <button
                                          className="apc-importcard__rowdel"
                                          onClick={event => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            removeFile(item.id);
                                          }}
                                          aria-label={`Remove ${item.name}`}
                                        >
                                          <Icon name="trash-2" size={12} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <span className="apc-importcard__add">+ Add file</span>
                          </div>
                        ) : (
                          <div className="apc-importcard__loaded">
                            <span className="apc-importcard__kind">{type.short}</span>
                            <button
                              className="apc-importcard__remove"
                              onClick={event => {
                                event.preventDefault();
                                event.stopPropagation();
                                removeFile(file.id);
                              }}
                              aria-label={`Remove ${file.name}`}
                            >
                              <Icon name="trash-2" size={14} />
                            </button>
                            <span className="apc-importcard__fileicon">
                              <Icon name={type.icon} size={22} />
                            </span>
                            <b className="apc-importcard__filename" title={file.name}>
                              {file.name}
                            </b>
                            <span className="apc-importcard__filesize">
                              {kindMeta(type.id).label} · {sizeLabel(file.size)}
                            </span>
                            <div
                              className="apc-importcard__progress"
                              aria-label={`${type.label} upload ${file.progress}%`}
                            >
                              <i style={{ width: `${file.progress}%` }} />
                            </div>
                            <span className={`apc-importcard__status${file.status === 'ready' ? ' ready' : ''}`}>
                              {file.status === 'ready' ? (
                                <>
                                  <Icon name="check" size={11} />
                                  Uploaded
                                </>
                              ) : (
                                `Uploading · ${file.progress}%`
                              )}
                            </span>
                          </div>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="apc-importpop__foot">
                <span className={importError ? 'apc-importpop__error' : undefined}>
                  {importError ??
                    (hasAllTypes
                      ? `${readyDraftDocs.length} ${readyDraftDocs.length === 1 ? 'document' : 'documents'} imported`
                      : draftFiles.some(file => file.status === 'uploading')
                        ? 'Uploading documents…'
                        : 'Upload one file for each of the four document types.')}
                </span>
                <button type="button" className="apc-docpage__import" onClick={finishImport}>
                  {workflowRecordId ? 'Reprocess' : 'Next Step'}
                </button>
              </div>
            </section>
          ) : (
            <ProcessingPanel
              pct={processingPct}
              complete={importPhase === 'complete'}
              onClose={resetImportState}
              onSeeResult={seeResult}
            />
          )}
        </div>
      )}
    </main>
  );
}
