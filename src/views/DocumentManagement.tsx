import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { CompensationEventPage } from './CompensationEventPage';
import { SublettingPage } from './SublettingPage';
import { FlowTabs, type DocFlow } from '../components/FlowTabs';
import type { NecOption } from '../lib/projects';
import { documentsStorageKey } from '../lib/projectStorage';
import {
  ACTIVITY_ITEMS,
  BqRecordTable,
  CleanseBqView,
  PreprocessingResult,
  PROCESS_STEPS,
  ProcessingPanel,
  type BqRecordRow,
  type ViewerDoc
} from './Preprocessing';

type DocKind = 'bq' | 'sp' | 'pp' | 'drawing';
type DocStatus = 'uploading' | 'ready';
type WorkspaceView = 'documents' | 'result' | 'cleanse';
type ImportPhase = 'upload' | 'link' | 'processing' | 'complete';
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
  flow?: 'bq' | 'activity';
  processedAt: number;
  activityItemIds?: string[];
  linkedActivityId?: string;
  linkedActivityCode?: string;
  linkedActivityName?: string;
}

interface StoredRecords {
  records: BqRecord[];
}

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

const loadRecords = (projectId?: string): BqRecord[] => {
  try {
    const current = window.localStorage.getItem(documentsStorageKey(projectId));
    if (!current) return [];
    const parsed = JSON.parse(current) as Partial<StoredRecords>;
    return Array.isArray(parsed.records)
      ? parsed.records.filter(isBqRecord)
      : [];
  } catch {
    return [];
  }
};

const nextRecordCode = (records: BqRecord[], flow: 'bq' | 'activity' = 'bq') => {
  const prefix = flow === 'activity' ? 'AS' : 'BQ';
  const max = records
    .filter(record => (record.flow ?? 'bq') === flow)
    .reduce((value, record) => {
      const number = Number(record.code.split('-').pop());
      return Number.isFinite(number) ? Math.max(value, number) : value;
    }, 0);
  return `${prefix}-2026-${String(max + 1).padStart(3, '0')}`;
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
  }
];

const sizeLabel = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const dateLabel = (time: number) =>
  new Date(time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const kindMeta = (kind: DocKind) => DOC_TYPES.find(d => d.id === kind)!;

export function DocumentManagement({
  mode,
  necOption,
  standard,
  projectId
}: {
  mode: 'pricing' | 'invoice';
  necOption?: NecOption;
  standard?: string;
  projectId?: string;
}) {
  const initialRecords = useMemo(() => loadRecords(projectId), [projectId]);
  const [records, setRecords] = useState<BqRecord[]>(initialRecords);
  const [draftFiles, setDraftFiles] = useState<DocFile[]>([]);
  const [workflowRecordId, setWorkflowRecordId] = useState<string | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [resultMode, setResultMode] = useState<ResultMode>('review');
  const [recordMenuId, setRecordMenuId] = useState<string | null>(null);
  const [activeFlow, setActiveFlow] = useState<DocFlow>(
    necOption === 'A' || necOption === 'C' ? 'activity' : 'bq'
  );
  const [ceRecordId, setCeRecordId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importPhase, setImportPhase] = useState<ImportPhase>('upload');
  const [linkActivityId, setLinkActivityId] = useState('');
  const activityOptions = useMemo(
    () =>
      records
        .filter(record => record.flow === 'activity')
        .map(record => ({
          id: record.id,
          code: record.code,
          name: record.name,
          itemIds: record.activityItemIds
        })),
    [records]
  );
  const [processingPct, setProcessingPct] = useState(0);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('documents');
  const [confirming, setConfirming] = useState(false);
  const [missingTypes, setMissingTypes] = useState<DocKind[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [recordQuery, setRecordQuery] = useState('');
  const isActivityFlow = activeFlow === 'activity';
  const activityMain = necOption === 'A' || necOption === 'C';
  const isBqReference = activityMain && !isActivityFlow;
  const mappingMode = activityMain && !isActivityFlow;
  const flowKind: 'bq' | 'activity' = isActivityFlow ? 'activity' : 'bq';
  const importTypes = DOC_TYPES.map((type, index) => {
    if (index === 0) {
      return isActivityFlow
        ? { ...type, label: 'Activity Schedule', short: 'AS', icon: 'clipboard-check' as IconName }
        : type;
    }
    return { ...type, label: `${type.label} (optional)` };
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        documentsStorageKey(projectId),
        JSON.stringify({ records })
      );
    } catch {
      return;
    }
  }, [records, projectId]);

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
    const bqFiles = snapshot.filter(file => file.kind === 'bq');
    const preambleFiles = snapshot.filter(file => file.kind !== 'bq');
    const linkedActivity = activityOptions.find(
      option => option.id === linkActivityId
    );
    const linkedActivityFields =
      isBqReference && linkedActivity
        ? {
            linkedActivityId: linkedActivity.id,
            linkedActivityCode: linkedActivity.code,
            linkedActivityName: linkedActivity.name
          }
        : {};
    const splitBq = flowKind === 'bq' && bqFiles.length > 1;
    const splitIds = splitBq
      ? bqFiles.map(
          (_, index) =>
            `rec-${Date.now() + index}-${Math.random().toString(36).slice(2, 7)}`
        )
      : [];
    const timer = window.setInterval(() => {
      const next = Math.min(100, Math.round(((Date.now() - started) / 3000) * 100));
      setProcessingPct(next);
      if (next >= 100) {
        window.clearInterval(timer);
        const now = Date.now();
        if (splitBq && !workflowRecordId) {
          setRecords(prev => {
            const working = [...prev];
            bqFiles.forEach((bqFile, index) => {
              working.push({
                id: splitIds[index],
                code: nextRecordCode(working, 'bq'),
                name: bqFile.name,
                files: [bqFile, ...preambleFiles],
                status: 'pending',
                flow: 'bq',
                processedAt: now + index,
                ...linkedActivityFields
              });
            });
            return working;
          });
          setActiveRecordId(splitIds[0]);
        } else if (workflowRecordId) {
          setRecords(prev =>
            prev.map(record =>
              record.id === workflowRecordId
                ? {
                    ...record,
                    files: snapshot,
                    name: bqName,
                    status: 'pending',
                    processedAt: now,
                    activityItemIds:
                      flowKind === 'activity'
                        ? ACTIVITY_ITEMS.map(item => item.id)
                        : record.activityItemIds,
                    ...linkedActivityFields
                  }
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
              code: nextRecordCode(prev, flowKind),
              name: bqName,
              files: snapshot,
              status: 'pending',
              flow: flowKind,
              processedAt: now,
              activityItemIds:
                flowKind === 'activity'
                  ? ACTIVITY_ITEMS.map(item => item.id)
                  : undefined,
              ...linkedActivityFields
            }
          ]);
          setActiveRecordId(id);
        }
        setImportPhase('complete');
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [
    importPhase,
    draftFiles,
    workflowRecordId,
    flowKind,
    linkActivityId,
    activityOptions,
    isBqReference
  ]);

  const readyDraftDocs = draftFiles.filter(file => file.status === 'ready');
  const processingHasSp = readyDraftDocs.some(file => file.kind === 'sp');
  const processingHasPp = readyDraftDocs.some(file => file.kind === 'pp');
  const processingSteps = PROCESS_STEPS.filter(
    step =>
      step.title !== 'Checking PP against SP' ||
      (processingHasSp && processingHasPp)
  );
  const processingDoneBody =
    processingHasSp || processingHasPp
      ? `${processingHasSp && processingHasPp ? 2 : 1} ${
          processingHasSp && processingHasPp ? 'corrections were' : 'correction was'
        } found and written to the Cleanse ${
          isActivityFlow ? 'Activity Schedule' : 'BQ'
        }.`
      : `The ${isActivityFlow ? 'Activity Schedule' : 'Bill of Quantity'} has been processed.`;
  const filesForType = (kind: DocKind) =>
    draftFiles.filter(file => file.kind === kind).sort((a, b) => b.addedAt - a.addedAt);
  const hasMainDoc = filesForType('bq').length > 0 && filesForType('bq').every(
    file => file.status === 'ready'
  );
  const flowRecords = records.filter(
    record => (record.flow ?? 'bq') === flowKind
  );
  const activeRecord = flowRecords.find(record => record.id === activeRecordId) ?? null;
  const activeLinkedActivity =
    activeRecord?.linkedActivityCode
      ? {
          code: activeRecord.linkedActivityCode,
          name: activeRecord.linkedActivityName ?? 'Activity Schedule'
        }
      : undefined;
  const linkedBqRecords =
    activeRecord && isActivityFlow
      ? records
          .filter(
            record =>
              record.flow !== 'activity' &&
              (record.linkedActivityId === activeRecord.id ||
                record.linkedActivityCode === activeRecord.code)
          )
          .map(record => ({ code: record.code, name: record.name }))
      : [];

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
        .filter(record => (record.flow ?? 'bq') === flowKind)
        .sort((a, b) => b.processedAt - a.processedAt)
        .map(record => ({
          id: record.id,
          code: record.code,
          name: record.name,
          processedAt: dateLabel(record.processedAt),
          status: record.status
        })),
    [records, flowKind]
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
    setCeRecordId(null);
    setActiveRecordId(null);
    setWorkspaceView('documents');
    setConfirming(false);
    setRecordMenuId(null);
  };

  const openCeResult = (ceId: string) => {
    setCeRecordId(ceId);
    setActiveFlow('ce');
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
    if (!filesForType('bq').length) {
      setMissingTypes(['bq']);
      setImportError(
        `Upload the ${isActivityFlow ? 'Activity Schedule' : 'Bill of Quantity'} to continue.`
      );
      return;
    }
    if (!hasMainDoc) {
      setMissingTypes([]);
      setImportError('Please wait for the uploads to finish.');
      return;
    }
    setMissingTypes([]);
    setImportError(null);
    setProcessingPct(0);
    if (isBqReference) {
      setLinkActivityId(activeRecord?.linkedActivityId ?? '');
      setImportPhase('link');
      return;
    }
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
          <div className="apc-docpage__title">
            <h1>Document Management</h1>
            <span>Invoice / DN</span>
          </div>
        </header>
        <div className="apc-docpage__empty">
          <Icon name="invoice-dn" size={28} />
          <b>Invoice / DN</b>
          <span>No invoice or delivery note uploaded.</span>
        </div>
      </main>
    );
  }

  if (activeFlow === 'ce') {
    return (
      <CompensationEventPage
        onFlow={selectFlow}
        initialRecordId={ceRecordId ?? undefined}
        necOption={necOption}
        projectId={projectId}
      />
    );
  }

  if (activeFlow === 'subletting') {
    return (
      <SublettingPage
        projectId={projectId}
        necOption={necOption}
        onFlow={selectFlow}
      />
    );
  }

  return (
    <main className="apc-docpage">
      <header className="apc-docpage__head">
        <div className="apc-docpage__title">
          <h1>Document Management</h1>
          <span>
            {isActivityFlow
              ? 'Activity Schedule records'
              : activityMain
                ? 'Bill of Quantity reference records'
                : 'Bill of Quantity records'}
          </span>
        </div>
        {workspaceView === 'documents' && (
          <button className="apc-docpage__new" onClick={startNewImport}>
            <span aria-hidden>+</span>
            Import
          </button>
        )}
      </header>

      <FlowTabs activeFlow={activeFlow} onSelect={selectFlow} necOption={necOption} />

      <div className="apc-docpage__body">
        {workspaceView === 'result' ? (
          <div className="apc-docpage__content apc-docpage__content--result">
            <PreprocessingResult
              docs={viewerDocs}
              actionLabel={
                mappingMode
                  ? resultMode === 'reprocess'
                    ? 'Confirm mapping & reprocess'
                    : 'Confirm mapping & generate Cleanse BQ'
                  : resultMode === 'reprocess'
                    ? 'Submission Additional document and Reprocess'
                    : `Confirm & generate ${isActivityFlow ? 'Cleanse Activity Schedule' : 'Cleanse BQ'}`
              }
              flowLabel={isActivityFlow ? 'Activity Schedule' : 'BQ'}
              smmStandard={standard ?? 'HKSMM4'}
              mappingMode={mappingMode}
              structuredBq={!isActivityFlow}
              showMissingReport={!activityMain}
              bqId={activeRecord?.id}
              bqCode={activeRecord?.code}
              projectId={projectId}
              linkedActivity={activeLinkedActivity}
              onAction={resultMode === 'reprocess' ? startReprocess : confirmBq}
            />
          </div>
        ) : workspaceView === 'cleanse' ? (
          <CleanseBqView
            bqId={activeRecord?.id}
            bqCode={activeRecord?.code}
            bqName={activeRecord?.name}
            heading={isActivityFlow ? 'Cleanse Activity Schedule' : 'Cleanse BQ'}
            onOpenCe={openCeResult}
            projectId={projectId}
            linkedActivity={activeLinkedActivity}
            linkedBqs={linkedBqRecords}
            sampleBq={activityMain && !isActivityFlow}
          />
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
              recordLabel={isActivityFlow ? 'Activity Schedule record' : 'BQ record'}
              emptyText={
                isActivityFlow
                  ? 'No Activity Schedule records found.'
                  : 'No BQ records found.'
              }
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
                  <b>
                    {workflowRecordId
                      ? 'Update pricing documents'
                      : `Import ${isActivityFlow ? 'activity schedule' : 'pricing'} documents`}
                  </b>
                </div>
                <button className="apc-iconbtn" onClick={resetImportState} aria-label="Close import">
                  <Icon name="x" size={15} />
                </button>
              </div>

              <div className="apc-importpop__scroll">
                <div className="apc-importgrid">
                  {importTypes.map(type => {
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
                    (hasMainDoc
                      ? `${readyDraftDocs.length} ${
                          readyDraftDocs.length === 1 ? 'document' : 'documents'
                        } imported · preambles optional`
                      : draftFiles.some(file => file.status === 'uploading')
                        ? 'Uploading documents…'
                        : `Upload the ${
                            isActivityFlow ? 'Activity Schedule' : 'Bill of Quantity'
                          }; preambles are optional.`)}
                </span>
                <button type="button" className="apc-docpage__import" onClick={finishImport}>
                  {workflowRecordId ? 'Reprocess' : 'Next Step'}
                </button>
              </div>
            </section>
          ) : importPhase === 'link' ? (
            <section
              className="apc-ceimportpop apc-bqlinkpop"
              role="dialog"
              aria-label="Link BQ to Activity Schedule"
            >
              <div className="apc-importpop__head">
                <div>
                  <b>Link BQ to Activity Schedule</b>
                </div>
                <button
                  className="apc-iconbtn"
                  onClick={resetImportState}
                  aria-label="Close link dialog"
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
              <div className="apc-importpop__body">
                {activityOptions.length ? (
                  <div className="apc-map-doclist apc-ce-pickerlist">
                    {activityOptions.map(option => {
                      const selected = linkActivityId === option.id;
                      return (
                        <button
                          type="button"
                          key={option.id}
                          className={`apc-map-doc${selected ? ' on' : ''}`}
                          onClick={() => setLinkActivityId(option.id)}
                          aria-pressed={selected}
                        >
                          <span className="apc-map-doc__icon is-bq">
                            <Icon name="list-tree" size={16} />
                          </span>
                          <span className="apc-map-doc__body">
                            <b>{option.code}</b>
                            <span>{option.name}</span>
                          </span>
                          <i className="apc-map-doc__check">
                            {selected && <Icon name="check" size={11} stroke={3} />}
                          </i>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="apc-pre__reportempty">
                    No Activity Schedule records found. Import an Activity Schedule first.
                  </div>
                )}
              </div>
              <div className="apc-importpop__foot">
                <span>
                  {linkActivityId
                    ? `Linked to ${
                        activityOptions.find(option => option.id === linkActivityId)?.code ??
                        'Activity Schedule'
                      }`
                    : 'Select an Activity Schedule to continue.'}
                </span>
                <button
                  type="button"
                  className="apc-ce-back"
                  onClick={() => setImportPhase('upload')}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="apc-docpage__import"
                  disabled={!linkActivityId}
                  onClick={() => setImportPhase('processing')}
                >
                  Start Processing
                </button>
              </div>
            </section>
          ) : (
            <ProcessingPanel
              pct={processingPct}
              complete={importPhase === 'complete'}
              onClose={resetImportState}
              onSeeResult={seeResult}
              steps={processingSteps}
              doneBody={processingDoneBody}
            />
          )}
        </div>
      )}
    </main>
  );
}
