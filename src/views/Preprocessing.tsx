import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { BqTable } from '../components/BqPanels';
import { demoData, type BillLine } from '../lib/demo';

type DocKind = 'bq' | 'sp' | 'pp' | 'drawing';

export interface ViewerDoc {
  id: string;
  kind: DocKind;
  name: string;
}

const PAGE_COUNTS: Record<DocKind, number> = {
  bq: 12,
  sp: 18,
  pp: 9,
  drawing: 4
};

const DOC_LABELS: Record<DocKind, string> = {
  bq: 'Bill of Quantity',
  sp: 'Special Preamble',
  pp: 'Particular Preamble',
  drawing: 'Drawing'
};

export const PROCESS_STEPS = [
  {
    title: 'Checking PP against SP',
    body: 'Particular Preamble overrides the Standard Preamble where the two conflict.'
  },
  {
    title: 'Checking drawings against the BQ',
    body: 'Scanning drawing notes and components for work omitted from the Bill of Quantity.'
  },
  {
    title: 'Applying CE updates',
    body: 'Keeping the Cleanse BQ aligned with the current CE column.'
  }
];

interface CheckRow {
  id: string;
  type: 'MISSING_ITEM' | 'PP_OVERRIDE';
  source: string;
  description: string;
  suggestion: string;
  quantity: string;
  status: string;
  targetKind: DocKind;
  targetPage: number;
}

const CHECK_ROWS: CheckRow[] = [
  {
    id: 'CHK-01',
    type: 'MISSING_ITEM',
    source: 'Drawing STR-L02-GA Note 4',
    description: 'Drawing note L02 base requires 50 mm non-shrink grout, but the BQ omits this item.',
    suggestion: '3.01.09',
    quantity: '18 m² @ HK$undefined',
    status: 'Auto-Injected to Cleanse BQ',
    targetKind: 'drawing',
    targetPage: 4
  },
  {
    id: 'CHK-02',
    type: 'PP_OVERRIDE',
    source: 'Particular Preamble Cl. 6.14',
    description: 'PP overrides SP (HKSMM4): concrete opening deduction threshold from >0.10 m³ to >0.50 m³.',
    suggestion: 'MR-VOL',
    quantity: 'Rule threshold override',
    status: 'Override Active',
    targetKind: 'pp',
    targetPage: 6
  }
];

const DEFAULT_NAMES: Record<DocKind, string> = {
  bq: 'Bill3_Concrete_Rev2.xlsx',
  sp: 'HKSMM4_Standard_Preamble.pdf',
  pp: 'Contract_Particular_Preamble_Cl6.pdf',
  drawing: 'STR-L02-GA-RevC.dwg'
};

export function ProcessingPanel({
  pct,
  complete,
  onClose,
  onSeeResult,
  steps = PROCESS_STEPS,
  doneTitle = 'Preprocessing complete',
  doneBody = '2 corrections were found and written to the Cleanse BQ.',
  ctaLabel = 'See Preprocessing Result'
}: {
  pct: number;
  complete: boolean;
  onClose: () => void;
  onSeeResult: () => void;
  steps?: Array<{ title: string; body: string }>;
  doneTitle?: string;
  doneBody?: string;
  ctaLabel?: string;
}) {
  const stepSize = 100 / steps.length;
  const step = Math.min(steps.length - 1, Math.floor(pct / stepSize));
  const activeStep = steps[step];

  return (
    <section className="apc-processpop" role="dialog" aria-label="Processing pricing documents">
      <button className="apc-processpop__close apc-iconbtn" onClick={onClose} aria-label="Close processing">
        <Icon name="x" size={15} />
      </button>

      {complete ? (
        <div className="apc-processpop__done">
          <div className="apc-processpop__tick">
            <Icon name="check" size={38} stroke={2.2} />
          </div>
          <h2>{doneTitle}</h2>
          <p>{doneBody}</p>
          <button className="apc-processpop__cta" onClick={onSeeResult}>
            {ctaLabel}
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="apc-processpop__visual">
            <div
              className="apc-processpop__ring"
              style={{ background: `conic-gradient(#20b26b ${pct * 3.6}deg, #dcf2e5 0deg)` }}
            >
              <div className="apc-processpop__ringin">
                <div className="apc-processpop__disc">
                  <Icon name="scan" size={32} stroke={1.5} />
                </div>
              </div>
            </div>
            <span className="apc-processpop__pct">{pct}%</span>
          </div>

          <div className="apc-processpop__copy" aria-live="polite">
            <span className="apc-processpop__eyebrow">Step {step + 1} of {steps.length}</span>
            <h2>Give us a sec…</h2>
            <p>{activeStep.body}</p>
          </div>

          <div className="apc-processpop__steps">
            {steps.map((item, index) => (
              <div
                key={item.title}
                className={`apc-processpop__step${index < step ? ' done' : ''}${index === step ? ' on' : ''}`}
              >
                <i>{index < step ? <Icon name="check" size={10} stroke={2.4} /> : null}</i>
                <span>{item.title}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function PreprocessingResult({
  docs,
  actionLabel,
  onAction
}: {
  docs: ViewerDoc[];
  actionLabel: string;
  onAction: () => void;
}) {
  const viewerDocs = docs.length
    ? docs
    : (Object.keys(DEFAULT_NAMES) as DocKind[]).map(kind => ({
        id: `mock-${kind}`,
        kind,
        name: DEFAULT_NAMES[kind]
      }));
  const [activeDocId, setActiveDocId] = useState(viewerDocs[0].id);
  const [viewerPage, setViewerPage] = useState(1);
  const [activeCheck, setActiveCheck] = useState<string | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const activeDoc = viewerDocs.find(doc => doc.id === activeDocId) ?? viewerDocs[0];
  const pageCount = PAGE_COUNTS[activeDoc.kind];
  const page = Math.min(viewerPage, pageCount);

  const docOf = (kind: DocKind) => viewerDocs.find(doc => doc.kind === kind);
  const listOf = (kind: DocKind) => viewerDocs.filter(doc => doc.kind === kind);
  const nameOf = (kind: DocKind) => docOf(kind)?.name ?? DEFAULT_NAMES[kind];
  const labelOf = (kind: DocKind) => {
    const list = listOf(kind);
    return list.length > 1 ? `${list[0].name} +${list.length - 1} more` : nameOf(kind);
  };
  const tabLabel = (doc: ViewerDoc) => {
    const list = listOf(doc.kind);
    const index = list.findIndex(item => item.id === doc.id) + 1;
    return list.length > 1 ? `${doc.kind.toUpperCase()} ${index}` : doc.kind.toUpperCase();
  };

  useEffect(() => {
    if (!activeCheck) return;
    const stage = viewerRef.current?.querySelector<HTMLElement>('.apc-pdf__stage');
    const hit = stage?.querySelector<HTMLElement>('.apc-pdf__hit');
    if (!stage || !hit) return;
    const offset = hit.getBoundingClientRect().top - stage.getBoundingClientRect().top;
    stage.scrollTo({ top: Math.max(0, stage.scrollTop + offset - 70), behavior: 'smooth' });
  }, [activeCheck, activeDocId, viewerPage]);

  const selectCheck = (row: CheckRow) => {
    const target = docOf(row.targetKind);
    setActiveCheck(row.id);
    setViewerPage(row.targetPage);
    if (target) setActiveDocId(target.id);
  };

  const openDoc = (doc: ViewerDoc) => {
    setActiveDocId(doc.id);
    setViewerPage(1);
    setActiveCheck(null);
  };

  const goPage = (next: number) => {
    setViewerPage(Math.max(1, Math.min(pageCount, next)));
    setActiveCheck(null);
  };

  return (
    <div className="apc-pre">
      <header className="apc-pre__topbar">
        <div className="apc-pre__title">
          <span>BQ preprocessing</span>
          <h2>{nameOf('bq')}</h2>
        </div>
      </header>

      <div className="apc-pre__workbench">
        <aside className="apc-pre__left">
          <section className="apc-pre__panel">
            <div className="apc-pre__panelhead">
              <b>Input package and SMM processing configuration</b>
            </div>
            <ol className="apc-pre__inputs">
              <li>
                <span>BQ bill file</span>
                <b>{labelOf('bq')}</b>
              </li>
              <li>
                <span>Standard Preamble (SP)</span>
                <b>{labelOf('sp')}</b>
              </li>
              <li>
                <span>Particular Preamble (PP)</span>
                <b>{labelOf('pp')}</b>
              </li>
              <li>
                <span>2D construction drawing</span>
                <b>{labelOf('drawing')}</b>
              </li>
            </ol>
          </section>

          <section className="apc-pre__panel">
            <div className="apc-pre__panelhead">
              <b>Processing &amp; Configuration logic</b>
            </div>
            <div className="apc-pre__logic">
              <ul>
                <li>
                  <strong>SP vs PP priority check:</strong> where PP and SP (HKSMM4/CESMM4) conflict, PP
                  overrides automatically, e.g. Cl. 6.14 opening deduction changed to &gt;0.50 m³.
                </li>
                <li>
                  <strong>Drawing vs BQ missing item check:</strong> drawing notes and components are scanned;
                  required work omitted from the BQ is written to the Cleanse BQ as a compensation candidate.
                </li>
                <li>
                  <strong>CE dynamic column linkage:</strong> new or approved compensation events update the
                  Cleanse BQ CE column immediately.
                </li>
              </ul>
            </div>
          </section>
        </aside>

        <section className="apc-pre__center">
          <div className="apc-pre__viewer" ref={viewerRef}>
            <div className="apc-pdf__head">
              <div>
                <b>Document review</b>
              </div>
              <span className="apc-pdf__count">{pageCount} pages</span>
            </div>
            <div className="apc-pdf__tabs">
              {viewerDocs.map(doc => (
                <button
                  key={doc.id}
                  className={`apc-pdf__tab${doc.id === activeDoc.id ? ' on' : ''}`}
                  onClick={() => openDoc(doc)}
                  title={`${DOC_LABELS[doc.kind]} · ${doc.name}`}
                >
                  <Icon name={doc.kind === 'bq' ? 'file-spreadsheet' : doc.kind === 'drawing' ? 'drafting-compass' : 'file-text'} size={13} />
                  <span>{tabLabel(doc)}</span>
                </button>
              ))}
            </div>
            <div className="apc-pdf__stage">
              <MockDocPage
                key={`${activeDoc.id}-${page}-${activeCheck ?? 'none'}`}
                kind={activeDoc.kind}
                page={page}
                activeCheck={activeCheck}
                name={activeDoc.name}
              />
            </div>
            <div className="apc-pdf__nav">
              <button onClick={() => goPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
                ‹
              </button>
              <span>
                Page {page} / {pageCount}
              </span>
              <button onClick={() => goPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
                ›
              </button>
            </div>
          </div>
        </section>

        <aside className="apc-pre__right">
          <section className="apc-pre__panel">
            <div className="apc-pre__panelhead">
              <b>Dashboard</b>
            </div>
            <div className="apc-pre__kpis">
              <div className="apc-pre__kpi">
                <span>Current SMM configuration</span>
                <b>Building · HKSMM4</b>
                <small>Deductions and classification applied automatically</small>
              </div>
              <div className="apc-pre__kpi">
                <span>Uploaded document package</span>
                <b>BQ + SP + PP + Drw</b>
                <small>{viewerDocs.length} documents ready</small>
              </div>
              <div className="apc-pre__kpi">
                <span>Missing Item / Override check</span>
                <b>2 corrections</b>
                <small>Auto-written to the Cleanse BQ</small>
              </div>
            </div>
          </section>

          <section className="apc-pre__panel apc-pre__reportpanel">
            <div className="apc-pre__panelhead">
              <b>Missing items report</b>
              <span>2 checks</span>
            </div>
            <div className="apc-missingwrap">
              <table className="apc-missingtable">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Exception</th>
                    <th>Source</th>
                    <th>Difference / override</th>
                    <th>Suggested item</th>
                    <th>Qty / rate</th>
                  </tr>
                </thead>
                <tbody>
                  {CHECK_ROWS.map(row => (
                    <tr
                      key={row.id}
                      className={activeCheck === row.id ? 'on' : undefined}
                      onClick={() => selectCheck(row)}
                    >
                      <td className="mono">
                        <b>{row.id}</b>
                      </td>
                      <td>
                        <span className={`apc-missingtable__type apc-missingtable__type--${row.type.toLowerCase().replace('_', '-')}`}>
                          {row.type}
                        </span>
                      </td>
                      <td title={row.source}>{row.source}</td>
                      <td title={row.description}>{row.description}</td>
                      <td className="mono">{row.suggestion}</td>
                      <td>{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="apc-pre__actions">
              <button className="apc-pre__confirmbtn" onClick={onAction}>
                {actionLabel}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export interface BqRecordRow {
  id: string;
  code: string;
  name: string;
  processedAt: string;
  status: 'pending' | 'confirm';
}

export function BqRecordTable({
  records,
  menuId,
  onOpen,
  onToggleMenu,
  onReprocess,
  onDelete
}: {
  records: BqRecordRow[];
  menuId: string | null;
  onOpen: (record: BqRecordRow) => void;
  onToggleMenu: (id: string) => void;
  onReprocess: (record: BqRecordRow) => void;
  onDelete: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelected(prev => new Set([...prev].filter(id => records.some(record => record.id === id))));
  }, [records]);

  const allSelected = records.length > 0 && records.every(record => selected.has(record.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(records.map(record => record.id)));
  };
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="apc-recordtablewrap">
        <table className="apc-recordtable">
          <thead>
            <tr>
              <th className="apc-recordtable__pick">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all BQ records"
                />
              </th>
              <th>BQ record</th>
              <th>Record ID</th>
              <th>Checks</th>
              <th>Processed</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} className="apc-records__empty">No BQ records found.</td>
              </tr>
            ) : (
              records.map(record => (
                <tr
                  key={record.id}
                  className={selected.has(record.id) ? 'selected' : undefined}
                  onClick={() => onOpen(record)}
                >
                  <td className="apc-recordtable__pick">
                    <input
                      type="checkbox"
                      checked={selected.has(record.id)}
                      onClick={event => event.stopPropagation()}
                      onChange={() => toggleOne(record.id)}
                      aria-label={`Select ${record.name}`}
                    />
                  </td>
                  <td>
                    <div className="apc-records__name">
                      <span className="apc-records__icon">
                        <Icon name="file-spreadsheet" size={18} />
                      </span>
                      <b>{record.name}</b>
                    </div>
                  </td>
                  <td className="apc-records__id">{record.code}</td>
                  <td className="apc-recordtable__checks">2</td>
                  <td>{record.processedAt}</td>
                  <td>
                    <span className={`apc-recordstatus ${record.status}`}>
                      {record.status === 'confirm' ? 'Confirm' : 'Pending'}
                    </span>
                  </td>
                  <td className="apc-records__menuCell">
                    <button
                      className="apc-records__menuBtn"
                      onClick={event => {
                        event.stopPropagation();
                        onToggleMenu(record.id);
                      }}
                      aria-label={`More actions for ${record.name}`}
                    >
                      ⋯
                    </button>
                    {menuId === record.id && (
                      <div className="apc-recordmenu" onClick={event => event.stopPropagation()}>
                        <button onClick={() => onReprocess(record)}>Preprocessing result</button>
                        <button className="danger" onClick={() => onDelete(record.id)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="apc-recordbulk">
          <span>{selected.size} selected</span>
          <button
            className="danger"
            onClick={() => {
              selected.forEach(id => onDelete(id));
              setSelected(new Set());
            }}
          >
            Delete
          </button>
          <button onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
    </>
  );
}

function MockDocPage({
  kind,
  page,
  activeCheck,
  name
}: {
  kind: DocKind;
  page: number;
  activeCheck: string | null;
  name: string;
}) {
  if (kind === 'drawing') {
    const hit = activeCheck === 'CHK-01' && page === 4;
    return (
      <div className="apc-paper apc-paper--drawing">
        <div className="apc-paper__top">
          <span>STR-L02-GA · Rev C</span>
          <span>L02 general arrangement</span>
        </div>
        <h3>{page === 4 ? 'L02 — General Arrangement' : `Drawing sheet ${page}`}</h3>
        <svg className="apc-paper__plan" viewBox="0 0 420 270" aria-label="Drawing preview">
          <defs>
            <pattern id="grid" width="21" height="21" patternUnits="userSpaceOnUse">
              <path d="M21 0H0V21" fill="none" stroke="#dbe4ec" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect x="8" y="8" width="404" height="254" fill="url(#grid)" stroke="#c4d1dc" />
          <rect x="52" y="58" width="316" height="154" fill="none" stroke="#2f4558" strokeWidth="2.2" />
          <path d="M52 92h316M52 176h316M116 58v154M208 58v154M300 58v154" stroke="#687d8e" strokeWidth="1.5" />
          {[78, 138, 198, 258, 318].map(x => (
            <rect key={x} x={x} y="78" width="9" height="9" fill="#2f4558" />
          ))}
          <path d="M104 138h36M122 120v36" stroke="#1f78a8" strokeWidth="2" />
          <path d="M355 122l28 15-28 15z" fill="#fff" stroke="#2f4558" />
          <path d="M46 226h328M46 220v12M374 220v12" stroke="#687d8e" />
          <text x="202" y="240" textAnchor="middle" fill="#4c6173" fontSize="10">
            6 400
          </text>
        </svg>
        <div className={`apc-paper__callout${hit ? ' apc-pdf__hit' : ''}`}>
          <b>Note 4</b>
          <span>50 mm non-shrink grout to base plate.</span>
          {hit && <em>MISSING ITEM</em>}
        </div>
        <div className="apc-paper__foot">
          <span>{name}</span>
          <span>Sheet {page} of 4</span>
        </div>
      </div>
    );
  }

  if (kind === 'pp' || kind === 'sp') {
    const isPP = kind === 'pp';
    const hit = isPP && activeCheck === 'CHK-02' && page === 6;
    const threshold = isPP ? '0.50 m³' : '0.10 m³';
    return (
      <div className={`apc-paper apc-paper--serif${isPP ? ' apc-paper--pp' : ''}`}>
        <div className="apc-paper__top">
          <span>{isPP ? 'Contract Particular Preamble' : 'HKSMM4 Standard Preamble'}</span>
          <span>Section 6 · Concrete</span>
        </div>
        <h3>{page === 6 ? '6.14 Concrete openings' : `Clause 6.${8 + page}`}</h3>
        <p>
          Measurement shall be the net volume of concrete after deducting openings, voids and
          obstructions not required to be filled with concrete.
        </p>
        <div className={`apc-paper__clause${hit ? ' apc-pdf__hit' : ''}`}>
          <span>Openings exceeding {threshold} shall be deducted from the measured volume.</span>
          {hit && <em>PP OVERRIDE</em>}
        </div>
        <p>
          The Contractor shall allow for all labour, material, plant and temporary works necessary
          for the execution of the work described.
        </p>
        <p className="apc-paper__muted">
          {isPP
            ? 'Particular conditions take precedence over the standard measurement rules where a conflict exists.'
            : 'This preamble is read together with the CESMM4 / HKSMM4 measurement rules.'}
        </p>
        <div className="apc-paper__foot">
          <span>{name}</span>
          <span>Page {page}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="apc-paper apc-paper--bq">
      <div className="apc-paper__top">
        <span>Bill No. 2 · Concrete</span>
        <span>Rev 2</span>
      </div>
      <h3>Bill of quantities</h3>
      <div className="apc-paper__bqhead">
        <span>Item</span>
        <span>Description</span>
        <span>Qty</span>
      </div>
      {[
        ['2.10', 'Grade C35/20, OPC; in bases', '12.50'],
        ['2.11', 'Grade C35/20, OPC; in walls', '35.00'],
        ['2.12', 'Grade C20/20 blinding, 75 mm thick', '2.80'],
        ['2.20', 'Copings, type CP1, 900 × 200 mm', '3']
      ].map(([no, desc, qty]) => (
        <div key={no} className="apc-paper__bqrow">
          <span>{no}</span>
          <span>{desc}</span>
          <span>{qty}</span>
        </div>
      ))}
      <div className="apc-paper__foot">
        <span>{name}</span>
        <span>Page {page}</span>
      </div>
    </div>
  );
}

const cleanseExtra: BillLine[] = [
  { id: 'cleanse-sec', type: 'section', label: 'Section 3  Miscellaneous', lv: 0 },
  { id: 'cleanse-grp', type: 'group', label: 'Base plates and holding-down bolts', lv: 1 },
  {
    id: 'cleanse-grout',
    type: 'item',
    no: '3.01.09',
    label: 'Non-shrink grout, 50 mm thick, to base plate',
    unit: 'm²',
    rate: null,
    contractQty: 18,
    override: 18,
    calc: 18,
    state: 'override',
    reason: 'Auto-injected from Drawing STR-L02-GA Note 4.'
  }
];

const escapeCsv = (value: string | number | null | undefined) =>
  `"${String(value ?? '').replace(/"/g, '""')}"`;

export function CleanseBqView() {
  const lines = useMemo(() => [...demoData.bill.lines, ...cleanseExtra], []);
  const [activeLine, setActiveLine] = useState('');

  const download = () => {
    const items = lines.filter(line => line.type === 'item');
    const rows = [
      ['Item', 'Description', 'Unit', 'Qty', 'Rate HK$', 'Amount HK$'],
      ...items.map(line => {
        const qty = line.override ?? line.contractQty ?? line.calc ?? 0;
        return [
          line.no ?? '',
          line.label,
          line.unit ?? '',
          qty,
          line.rate ?? '',
          line.rate == null ? '' : qty * line.rate
        ];
      })
    ];
    const csv = rows.map(row => row.map(value => escapeCsv(value)).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'cleanse-bq-bill-2.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="apc-cleanse">
      <div className="apc-cleanse__bar">
        <div className="apc-cleanse__title">
          <span>Preprocessing result</span>
          <h2>Cleanse BQ</h2>
        </div>
        <div className="apc-cleanse__actions">
          <button className="apc-cleanse__download" onClick={download}>
            <Icon name="download" size={13} />
            Download Cleanse BQ
          </button>
        </div>
      </div>

      <div className="apc-cleanse__table">
        <BqTable
          lines={lines}
          activeLine={activeLine}
          setActiveLine={setActiveLine}
          readOnly
          showMoney
          affectedIds={{ missing: ['cleanse-grout'], override: ['n3', 'n4', 'n5'] }}
        />
      </div>
    </div>
  );
}
