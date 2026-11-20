import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import { FlowTabs, type DocFlow } from '../components/FlowTabs';
import { Icon } from '../components/Icon';
import { ProcessingPanel } from './Preprocessing';

interface CeOcrItem {
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
}

interface CeFields {
  ceNumber: string;
  date: string;
  reference: string;
  amount: string;
  title: string;
}

interface CeRecord {
  id: string;
  code: string;
  name: string;
  receivedAt: number;
  confidence: number;
  fields: CeFields;
  text: string;
  items: CeOcrItem[];
}

interface CeDraft {
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'ready';
}

type CePhase = 'upload' | 'processing' | 'complete';
type CeView = 'records' | 'result';

const STORAGE_KEY = 'apc.ce-records.v1';

const CE_STEPS = [
  {
    title: 'Reading CE document',
    body: 'Opening the uploaded compensation event document and its supporting pages.'
  },
  {
    title: 'Extracting text with OCR',
    body: 'Reading the document layout, clauses, references and priced items.'
  },
  {
    title: 'Structuring the OCR result',
    body: 'Mapping the extracted text into CE fields and line items.'
  }
];

const dateLabel = (time: number) =>
  new Date(time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const sizeLabel = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const seedItem: CeOcrItem[] = [
  { description: 'Additional drainage trench excavation', unit: 'm', qty: 120, rate: 350, amount: 42000 },
  { description: 'Extra uPVC drainage pipe, 225 mm diameter', unit: 'm', qty: 95, rate: 480, amount: 45600 },
  { description: 'Additional precast inspection chamber', unit: 'nr', qty: 3, rate: 13633.33, amount: 40900 }
];

const seedText = `COMPENSATION EVENT NOTICE
CE No.: CE-2026-014
Date: 13 November 2026
Reference: CE/2026/014
Subject: Additional drainage works

The Contractor is instructed to carry out additional drainage works at the south service yard. The change includes additional trench excavation, uPVC pipework and precast inspection chambers.

The assessed value of this compensation event is HK$ 128,500.00. The instruction is issued under Clause 6.14 and is to be incorporated into the Cleanse BQ CE column.`;

const SEED_RECORD: CeRecord = {
  id: 'ce-seed',
  code: 'CE-2026-014',
  name: 'CE-014 Additional drainage works.pdf',
  receivedAt: Date.UTC(2026, 10, 13),
  confidence: 98.6,
  fields: {
    ceNumber: 'CE-2026-014',
    date: '13 Nov 2026',
    reference: 'CE/2026/014',
    amount: 'HK$ 128,500.00',
    title: 'Additional drainage works'
  },
  text: seedText,
  items: seedItem
};

const isCeRecord = (value: unknown): value is CeRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<CeRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.code === 'string' &&
    typeof record.name === 'string' &&
    typeof record.receivedAt === 'number' &&
    typeof record.confidence === 'number' &&
    Boolean(record.fields) &&
    typeof record.text === 'string' &&
    Array.isArray(record.items)
  );
};

const loadRecords = (): CeRecord[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [SEED_RECORD];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [SEED_RECORD];
    return parsed.filter(isCeRecord);
  } catch {
    return [SEED_RECORD];
  }
};

const makeOcrRecord = (draft: CeDraft, index: number): CeRecord => {
  const now = Date.now();
  const code = `CE-2026-${String(15 + index).padStart(3, '0')}`;
  return {
    id: `ce-${now}-${Math.random().toString(36).slice(2, 7)}`,
    code,
    name: draft.name,
    receivedAt: now,
    confidence: 97.8,
    fields: {
      ceNumber: code,
      date: dateLabel(now),
      reference: `CE/2026/${String(15 + index).padStart(3, '0')}`,
      amount: 'HK$ 128,500.00',
      title: 'Additional drainage works'
    },
    text: seedText,
    items: seedItem
  };
};

export function CompensationEventPage({ onFlow }: { onFlow: (flow: DocFlow) => void }) {
  const initialRecords = useMemo(loadRecords, []);
  const [records, setRecords] = useState<CeRecord[]>(initialRecords);
  const [view, setView] = useState<CeView>('records');
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [phase, setPhase] = useState<CePhase>('upload');
  const [pct, setPct] = useState(0);
  const [draft, setDraft] = useState<CeDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      return;
    }
  }, [records]);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuId]);

  useEffect(() => {
    if (!draft || draft.status !== 'uploading') return;
    const timer = window.setInterval(() => {
      setDraft(prev => {
        if (!prev || prev.status !== 'uploading') return prev;
        const progress = Math.min(100, prev.progress + 9);
        return { ...prev, progress, status: progress >= 100 ? 'ready' : 'uploading' };
      });
    }, 320);
    return () => window.clearInterval(timer);
  }, [draft]);

  useEffect(() => {
    if (phase !== 'processing') return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const next = Math.min(100, Math.round(((Date.now() - started) / 10000) * 100));
      setPct(next);
      if (next >= 100) {
        window.clearInterval(timer);
        if (draft) {
          const record = makeOcrRecord(draft, records.length);
          setRecords(prev => [record, ...prev]);
          setActiveRecordId(record.id);
        }
        setPhase('complete');
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [phase, draft, records.length]);

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter(record =>
      [record.name, record.code, dateLabel(record.receivedAt)].join(' ').toLowerCase().includes(needle)
    );
  }, [records, query]);

  const activeRecord = records.find(record => record.id === activeRecordId) ?? null;

  const openImport = () => {
    setDraft(null);
    setError(null);
    setPhase('upload');
    setPct(0);
    setImportOpen(true);
    setMenuId(null);
  };

  const closeImport = () => {
    setImportOpen(false);
    setPhase('upload');
    setDraft(null);
    setPct(0);
    setError(null);
  };

  const pickFile = (file: File | null) => {
    if (!file) return;
    setDraft({ name: file.name, size: file.size, progress: 0, status: 'uploading' });
    setError(null);
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    pickFile(file);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    pickFile(event.dataTransfer.files?.[0] ?? null);
  };

  const startProcessing = () => {
    if (!draft || draft.status !== 'ready') {
      setError('Upload the CE document before continuing.');
      return;
    }
    setError(null);
    setPct(0);
    setPhase('processing');
  };

  const seeResult = () => {
    setImportOpen(false);
    setPhase('upload');
    setPct(0);
    setDraft(null);
    setView('result');
  };

  const openResult = (record: CeRecord) => {
    setActiveRecordId(record.id);
    setView('result');
    setMenuId(null);
  };

  const deleteRecord = (id: string) => {
    setRecords(prev => prev.filter(record => record.id !== id));
    setMenuId(null);
    if (activeRecordId === id) {
      setActiveRecordId(null);
      setView('records');
    }
  };

  const selectFlow = (flow: DocFlow) => {
    if (flow === 'ce') {
      setView('records');
      setActiveRecordId(null);
      return;
    }
    onFlow(flow);
  };

  const downloadOcr = () => {
    if (!activeRecord) return;
    const lines = [
      `CE Number: ${activeRecord.fields.ceNumber}`,
      `Date: ${activeRecord.fields.date}`,
      `Reference: ${activeRecord.fields.reference}`,
      `Amount: ${activeRecord.fields.amount}`,
      '',
      activeRecord.text,
      '',
      ...activeRecord.items.map(item => `${item.description} | ${item.qty} ${item.unit} | ${item.rate} | ${item.amount}`)
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeRecord.code}-ocr.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="apc-docpage">
      <header className="apc-docpage__head">
        <div className="apc-docpage__title">
          <h1>CE records</h1>
          <span>Upload and OCR compensation event documents.</span>
        </div>
        {view === 'records' && (
          <button className="apc-docpage__new" onClick={openImport}>
            <span aria-hidden>+</span>
            Import CE
          </button>
        )}
      </header>

      <FlowTabs activeFlow="ce" onSelect={selectFlow} />

      <div className="apc-docpage__body">
        {view === 'result' && activeRecord ? (
          <div className="apc-docpage__content apc-docpage__content--records">
            <div className="apc-ce-result">
              <div className="apc-ce-result__head">
                <div>
                  <span>AI OCR RESULT</span>
                  <h2>{activeRecord.name}</h2>
                </div>
                <div className="apc-ce-result__actions">
                  <span className="apc-ce-confidence">
                    <Icon name="check" size={12} />
                    {activeRecord.confidence}% confidence
                  </span>
                  <button className="apc-ce-download" onClick={downloadOcr}>
                    <Icon name="download" size={13} />
                    Download OCR
                  </button>
                </div>
              </div>

              <div className="apc-ce-result__grid">
                <section className="apc-ce-paper">
                  <div className="apc-ce-paper__top">
                    <span>Compensation event</span>
                    <span>{activeRecord.code}</span>
                  </div>
                  <h3>{activeRecord.fields.title}</h3>
                  <dl>
                    <div><dt>CE No.</dt><dd>{activeRecord.fields.ceNumber}</dd></div>
                    <div><dt>Date</dt><dd>{activeRecord.fields.date}</dd></div>
                    <div><dt>Reference</dt><dd>{activeRecord.fields.reference}</dd></div>
                    <div><dt>Assessed value</dt><dd>{activeRecord.fields.amount}</dd></div>
                  </dl>
                  <p>
                    The Contractor is instructed to carry out additional drainage works at the south service
                    yard, including trench excavation, pipework and inspection chambers.
                  </p>
                  <p>
                    The assessed value of this compensation event is {activeRecord.fields.amount} and is to be
                    incorporated into the Cleanse BQ CE column.
                  </p>
                  <div className="apc-ce-paper__stamp">AI OCR</div>
                </section>

                <section className="apc-ce-ocr">
                  <div className="apc-ce-ocr__head">
                    <b>AI OCR result</b>
                    <span>{activeRecord.confidence}% confidence</span>
                  </div>
                  <div className="apc-ce-fields">
                    <div><span>CE Number</span><b>{activeRecord.fields.ceNumber}</b></div>
                    <div><span>Date</span><b>{activeRecord.fields.date}</b></div>
                    <div><span>Reference</span><b>{activeRecord.fields.reference}</b></div>
                    <div><span>Assessed value</span><b>{activeRecord.fields.amount}</b></div>
                  </div>
                  <div className="apc-ce-ocr__label">Extracted text</div>
                  <pre className="apc-ce-text">{activeRecord.text}</pre>
                  <div className="apc-ce-ocr__label">Extracted items</div>
                  <table className="apc-ce-items">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Unit</th>
                        <th>Qty</th>
                        <th>Rate</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRecord.items.map(item => (
                        <tr key={item.description}>
                          <td>{item.description}</td>
                          <td>{item.unit}</td>
                          <td className="num">{item.qty.toFixed(2)}</td>
                          <td className="num">{item.rate.toFixed(2)}</td>
                          <td className="num">{item.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            </div>
          </div>
        ) : (
          <div className="apc-docpage__content apc-docpage__content--records">
            <div className="apc-recordstoolbar">
              <div className="apc-recordstoolbar__title">
                <b>CE documents</b>
                <span>{filteredRecords.length}</span>
              </div>
              <label className="apc-recordsearch">
                <Icon name="search" size={14} />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search CE documents..."
                />
              </label>
            </div>

            <div className="apc-recordtablewrap">
              <table className="apc-recordtable apc-cetable">
                <thead>
                  <tr>
                    <th>CE document</th>
                    <th>CE number</th>
                    <th>Received</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map(record => (
                    <tr key={record.id} onClick={() => openResult(record)}>
                      <td>
                        <div className="apc-records__name">
                          <span className="apc-records__icon">
                            <Icon name="file-text" size={18} />
                          </span>
                          <b>{record.name}</b>
                        </div>
                      </td>
                      <td className="apc-records__id">{record.code}</td>
                      <td>{dateLabel(record.receivedAt)}</td>
                      <td>
                        <span className="apc-recordstatus confirm">OCR ready</span>
                      </td>
                      <td className="apc-records__menuCell">
                        <button
                          className="apc-records__menuBtn"
                          onClick={event => {
                            event.stopPropagation();
                            setMenuId(prev => (prev === record.id ? null : record.id));
                          }}
                          aria-label={`More actions for ${record.name}`}
                        >
                          ⋯
                        </button>
                        {menuId === record.id && (
                          <div className="apc-recordmenu" onClick={event => event.stopPropagation()}>
                            <button onClick={() => openResult(record)}>View AI OCR result</button>
                            <button className="danger" onClick={() => deleteRecord(record.id)}>Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!filteredRecords.length && (
                    <tr>
                      <td colSpan={5} className="apc-records__empty">No CE documents found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {importOpen && (
        <div className="apc-docpage__scrim">
          {phase === 'upload' ? (
            <section className="apc-ceimportpop" role="dialog" aria-label="Import compensation event document">
              <div className="apc-importpop__head">
                <div>
                  <b>Import CE document</b>
                  <span>Upload a compensation event document for AI OCR.</span>
                </div>
                <button className="apc-iconbtn" onClick={closeImport} aria-label="Close import">
                  <Icon name="x" size={15} />
                </button>
              </div>

              <div className="apc-ceimportpop__body">
                <label
                  className={`apc-importcard apc-cecard${draft ? ' is-filled' : ''}${draft?.status === 'ready' ? ' is-ready' : ''}`}
                  onDragOver={event => event.preventDefault()}
                  onDrop={onDrop}
                >
                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={onFile} />
                  {draft ? (
                    <div className="apc-importcard__loaded">
                      <span className="apc-importcard__kind">CE</span>
                      <button
                        className="apc-importcard__remove"
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDraft(null);
                        }}
                        aria-label="Remove CE document"
                      >
                        <Icon name="trash-2" size={14} />
                      </button>
                      <span className="apc-importcard__fileicon">
                        <Icon name="file-text" size={22} />
                      </span>
                      <b className="apc-importcard__filename" title={draft.name}>
                        {draft.name}
                      </b>
                      <span className="apc-importcard__filesize">
                        Compensation Event · {sizeLabel(draft.size)}
                      </span>
                      <div className="apc-importcard__progress" aria-label={`CE document upload ${draft.progress}%`}>
                        <i style={{ width: `${draft.progress}%` }} />
                      </div>
                      <span className={`apc-importcard__status${draft.status === 'ready' ? ' ready' : ''}`}>
                        {draft.status === 'ready' ? (
                          <>
                            <Icon name="check" size={11} />
                            Uploaded
                          </>
                        ) : (
                          `Uploading · ${draft.progress}%`
                        )}
                      </span>
                    </div>
                  ) : (
                    <>
                      <span className="apc-importcard__kind">CE</span>
                      <span className="apc-cecard__emptyicon">
                        <Icon name="file-text" size={28} />
                      </span>
                      <b>Compensation Event document</b>
                      <span className="apc-importcard__copy">
                        Drag and drop your file here, or <strong>click to select</strong>.
                      </span>
                      <small>Supported formats: PDF, Word or Excel</small>
                    </>
                  )}
                </label>

                {error && <div className="apc-home__error">{error}</div>}
              </div>

              <div className="apc-importpop__foot">
                <span>{draft ? '1 CE document selected' : 'Upload one CE document to continue.'}</span>
                <button className="apc-docpage__import" onClick={startProcessing}>
                  Next Step
                </button>
              </div>
            </section>
          ) : (
            <ProcessingPanel
              pct={pct}
              complete={phase === 'complete'}
              onClose={closeImport}
              onSeeResult={seeResult}
              steps={CE_STEPS}
              doneTitle="OCR complete"
              doneBody="The CE document has been read and its fields and items extracted."
              ctaLabel="See AI OCR Result"
            />
          )}
        </div>
      )}
    </main>
  );
}
