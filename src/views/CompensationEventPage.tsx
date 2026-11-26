import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent
} from 'react';
import { FlowTabs, type DocFlow } from '../components/FlowTabs';
import { Icon } from '../components/Icon';
import { ACTIVITY_ITEMS, ProcessingPanel } from './Preprocessing';
import { optionInfo, type NecOption } from '../lib/projects';
import { usePricingMode } from '../lib/pricingMode';
import { formatBqQty, parseNumberInput } from '../lib/numberFormat';
import { BQ_ITEMS, type BqOption } from '../lib/ceLinks';
import {
  ceLinkTarget,
  ceRecordAmount,
  loadCeLinks,
  loadCeRecords,
  loadPricingOptions,
  removeCeLink,
  saveCeLink,
  saveCeRecords,
  type CeFields,
  type CeLink,
  type CeOcrItem,
  type CeRecord,
  type CeRegion,
  type CeTargetType
} from '../data/ce';

interface CeDraft {
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'ready';
  dataUrl?: string;
  mime?: string;
}

type CePhase = 'upload' | 'bq' | 'processing' | 'complete';
type CeView = 'records' | 'result';

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

const loadRecords = loadCeRecords;

const seedQuantity = seedItem.reduce((sum, item) => sum + item.qty, 0);

const buildRegions = (
  code: string,
  date: string,
  reference: string,
  quantity: number,
  amount: string
): CeRegion[] => [
  { id: 'title', label: 'Subject', value: 'Additional drainage works', x: 8, y: 8, w: 64, h: 5, confidence: 98.6 },
  { id: 'ce-number', label: 'CE number', value: code, x: 8, y: 15, w: 36, h: 4.5, confidence: 99.2 },
  { id: 'date', label: 'Date', value: date, x: 8, y: 20.5, w: 32, h: 4.5, confidence: 97.4 },
  { id: 'reference', label: 'Reference', value: reference, x: 8, y: 26, w: 36, h: 4.5, confidence: 98.1 },
  { id: 'quantity', label: 'Quantity change', value: String(quantity), x: 8, y: 31.5, w: 44, h: 4.5, confidence: 96.3 },
  { id: 'amount', label: 'Assessed value', value: amount, x: 8, y: 60, w: 56, h: 5, confidence: 97.8 }
];

const makeOcrRecord = (draft: CeDraft, index: number): CeRecord => {
  const now = Date.now();
  const code = `CE-2026-${String(15 + index).padStart(3, '0')}`;
  const date = dateLabel(now);
  const reference = `CE/2026/${String(15 + index).padStart(3, '0')}`;
  const amount = 'HK$ 128,500.00';
  return {
    id: `ce-${now}-${Math.random().toString(36).slice(2, 7)}`,
    code,
    name: draft.name,
    receivedAt: now,
    confidence: 97.8,
    fields: {
      ceNumber: code,
      date,
      reference,
      amount,
      quantity: String(seedQuantity),
      title: 'Additional drainage works'
    },
    quantity: seedQuantity,
    text: seedText,
    items: seedItem,
    document: draft.dataUrl
      ? { dataUrl: draft.dataUrl, mime: draft.mime }
      : undefined,
    regions: buildRegions(code, date, reference, seedQuantity, amount)
  };
};

function BqOptionPicker({
  options,
  value,
  onChange
}: {
  options: BqOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="apc-map-doclist apc-ce-pickerlist">
      {options.map(option => {
        const selected = value === option.id;
        return (
          <button
            type="button"
            key={option.id}
            className={`apc-map-doc${selected ? ' on' : ''}`}
            onClick={() => onChange(option.id)}
            aria-pressed={selected}
          >
            <span className="apc-map-doc__icon is-bq">
              <Icon name="file-spreadsheet" size={16} />
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
  );
}

export function CompensationEventPage({
  onFlow,
  initialRecordId,
  necOption,
  projectId
}: {
  onFlow: (flow: DocFlow) => void;
  initialRecordId?: string;
  necOption?: NecOption;
  projectId?: string;
}) {
  const [pricingMode] = usePricingMode(projectId);
  const moneyVisible = pricingMode === 'priced';
  const initialRecords = useMemo(
    () => loadRecords(projectId, necOption),
    [projectId, necOption]
  );
  const [records, setRecords] = useState<CeRecord[]>(initialRecords);
  const openedInitial = useRef<string | null>(null);
  const [view, setView] = useState<CeView>('records');
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [phase, setPhase] = useState<CePhase>('upload');
  const [pct, setPct] = useState(0);
  const [draft, setDraft] = useState<CeDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const option = optionInfo(necOption);
  const targetType: CeTargetType = option.ceTarget;
  const targetLabel = targetType === 'activity' ? 'Activity Schedule' : 'BQ';
  const targetItems = targetType === 'activity' ? ACTIVITY_ITEMS : BQ_ITEMS;
  const targetOptions = useMemo(
    () => loadPricingOptions(projectId, targetType, necOption),
    [projectId, targetType, necOption]
  );
  const [links, setLinks] = useState<CeLink[]>(() =>
    loadCeLinks(projectId, necOption)
  );
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkItemIds, setLinkItemIds] = useState<string[]>([]);
  const [relinkOpen, setRelinkOpen] = useState(false);
  const [relinkTargetId, setRelinkTargetId] = useState('');
  const [relinkItemIds, setRelinkItemIds] = useState<string[]>([]);

  useEffect(() => {
    saveCeRecords(records, projectId, necOption);
  }, [records, projectId, necOption]);

  useEffect(() => {
    if (!initialRecordId || openedInitial.current === initialRecordId) return;
    const record = records.find(item => item.id === initialRecordId);
    if (!record) return;
    openedInitial.current = initialRecordId;
    setActiveRecordId(record.id);
    setView('result');
    setMenuId(null);
  }, [initialRecordId, records]);

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
          const target = targetOptions.find(doc => doc.id === linkTargetId);
          if (target) {
            const next = saveCeLink(
              {
                ceId: record.id,
                ceCode: record.code,
                ceName: record.name,
                title: record.fields.title,
                amount: ceRecordAmount(record),
                quantity: record.quantity,
                date: record.fields.date,
                reference: record.fields.reference,
                targetType,
                targetId: target.id,
                targetCode: target.code,
                targetName: target.name,
                bqId: targetType === 'bq' ? target.id : undefined,
                bqCode: targetType === 'bq' ? target.code : undefined,
                bqName: targetType === 'bq' ? target.name : undefined,
                itemIds: linkItemIds
              },
              projectId,
              necOption
            );
            setLinks(next);
          }
        }
        setPhase('complete');
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [
    phase,
    draft,
    records.length,
    targetOptions,
    linkTargetId,
    linkItemIds,
    targetType
  ]);

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter(record =>
      [record.name, record.code, dateLabel(record.receivedAt)].join(' ').toLowerCase().includes(needle)
    );
  }, [records, query]);

  const activeRecord = records.find(record => record.id === activeRecordId) ?? null;
  const activeLink = activeRecord
    ? links.find(link => link.ceId === activeRecord.id) ?? null
    : null;
  const activeTarget = activeLink ? ceLinkTarget(activeLink) : null;
  const activeLinkItems = activeLink
    ? (activeTarget?.type === 'activity' ? ACTIVITY_ITEMS : BQ_ITEMS).filter(item =>
        activeLink.itemIds.includes(item.id)
      )
    : [];
  const activeAllocation =
    activeLink && activeLinkItems.length
      ? activeLink.amount / activeLinkItems.length
      : 0;
  const relinkTarget = targetOptions.find(option => option.id === relinkTargetId);
  const relinkItems =
    targetType === 'activity' && relinkTarget?.itemIds?.length
      ? ACTIVITY_ITEMS.filter(item => relinkTarget.itemIds?.includes(item.id))
      : targetItems;

  const openImport = () => {
    setDraft(null);
    setError(null);
    setPhase('upload');
    setPct(0);
    setLinkTargetId('');
    setLinkItemIds([]);
    setImportOpen(true);
    setMenuId(null);
  };

  const closeImport = () => {
    setImportOpen(false);
    setPhase('upload');
    setDraft(null);
    setPct(0);
    setError(null);
    setLinkTargetId('');
    setLinkItemIds([]);
  };

  const pickFile = (file: File | null) => {
    if (!file) return;
    setDraft({ name: file.name, size: file.size, progress: 0, status: 'uploading' });
    setError(null);
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl =
        typeof reader.result === 'string' ? reader.result : undefined;
      if (!dataUrl) return;
      const apply = (value: string, mime: string) =>
        setDraft(prev => (prev ? { ...prev, dataUrl: value, mime } : prev));
      const image = new Image();
      image.onload = () => {
        const max = 1200;
        const scale = Math.min(1, max / image.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          apply(dataUrl, file.type);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        apply(canvas.toDataURL('image/jpeg', 0.82), 'image/jpeg');
      };
      image.onerror = () => apply(dataUrl, file.type);
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
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

  const goLinkTarget = () => {
    if (!draft || draft.status !== 'ready') {
      setError('Upload the CE document before continuing.');
      return;
    }
    setError(null);
    setPhase('bq');
  };

  const aiLinkedItems = () => {
    const linked = targetItems.filter(item => item.ce > 0).map(item => item.id);
    if (linked.length) return linked;
    return targetType === 'activity' ? [] : targetItems.map(item => item.id);
  };

  const chooseLinkTarget = (id: string) => {
    setLinkTargetId(id);
    setLinkItemIds(aiLinkedItems());
    setError(null);
  };

  const startProcessing = () => {
    if (!draft || draft.status !== 'ready') {
      setError('Upload the CE document before continuing.');
      return;
    }
    if (!linkTargetId) {
      setError(`Choose the ${targetLabel} this CE links to.`);
      return;
    }
    setError(null);
    setLinkItemIds(aiLinkedItems());
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
    removeCeLink(id, projectId, necOption);
    setLinks(loadCeLinks(projectId, necOption));
    setMenuId(null);
    if (activeRecordId === id) {
      setActiveRecordId(null);
      setView('records');
    }
  };

  const openRelink = () => {
    if (!activeRecord) return;
    const link = links.find(item => item.ceId === activeRecord.id);
    const linkedTarget = link ? ceLinkTarget(link) : null;
    const targetExists =
      !!linkedTarget && targetOptions.some(option => option.id === linkedTarget.id);
    const nextTargetId = targetExists ? linkedTarget.id : targetOptions[0]?.id ?? '';
    const nextTarget = targetOptions.find(option => option.id === nextTargetId);
    const nextItems =
      targetType === 'activity' && nextTarget?.itemIds?.length
        ? ACTIVITY_ITEMS.filter(item => nextTarget.itemIds?.includes(item.id))
        : targetItems;
    setRelinkTargetId(nextTargetId);
    setRelinkItemIds(
      targetExists
        ? (link?.itemIds ?? []).filter(id => nextItems.some(item => item.id === id))
        : []
    );
    setRelinkOpen(true);
  };

  const toggleRelinkItem = (id: string) => {
    setRelinkItemIds(prev =>
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  };

  const saveRelink = () => {
    if (!activeRecord) return;
    const target = targetOptions.find(doc => doc.id === relinkTargetId);
    const selectedIds = relinkItemIds.filter(id =>
      relinkItems.some(item => item.id === id)
    );
    if (!target || !selectedIds.length) return;
    const next = saveCeLink(
      {
        ceId: activeRecord.id,
        ceCode: activeRecord.code,
        ceName: activeRecord.name,
        title: activeRecord.fields.title,
        amount: ceRecordAmount(activeRecord),
        quantity: activeRecord.quantity,
        date: activeRecord.fields.date,
        reference: activeRecord.fields.reference,
        targetType,
        targetId: target.id,
        targetCode: target.code,
        targetName: target.name,
        bqId: targetType === 'bq' ? target.id : undefined,
        bqCode: targetType === 'bq' ? target.code : undefined,
        bqName: targetType === 'bq' ? target.name : undefined,
        itemIds: selectedIds
      },
      projectId,
      necOption
    );
    setLinks(next);
    setRelinkOpen(false);
  };

  const selectFlow = (flow: DocFlow) => {
    if (flow === 'ce') {
      setView('records');
      setActiveRecordId(null);
      return;
    }
    onFlow(flow);
  };

  return (
    <main className="apc-docpage">
      <header className="apc-docpage__head">
        <div className="apc-docpage__title">
          <h1>Document Management</h1>
          <span>Compensation Event records</span>
        </div>
        {view === 'records' && (
          <button className="apc-docpage__new" onClick={openImport}>
            <span aria-hidden>+</span>
            Import CE
          </button>
        )}
      </header>

      <FlowTabs activeFlow="ce" onSelect={selectFlow} necOption={necOption} />

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
                  <button className="apc-ce-download" onClick={openRelink}>
                    <Icon name="file-text" size={13} />
                    Relink
                  </button>
                </div>
              </div>

              <div className="apc-ce-result__grid">
                <section className="apc-ce-paper apc-cedoc">
                  <div className="apc-cedoc__head">
                    <div>
                      <b>{activeRecord.name}</b>
                      <span>
                        Original document
                        {activeRecord.document?.dataUrl ? '' : ' (no preview stored)'} · page 1 of 1
                      </span>
                    </div>
                    <span className="apc-cedoc__count">
                      {(activeRecord.regions ?? []).length} extracted regions
                    </span>
                  </div>

                  <div className="apc-cedoc__page">
                    {activeRecord.document?.dataUrl ? (
                      <img
                        className="apc-cedoc__image"
                        src={activeRecord.document.dataUrl}
                        alt={activeRecord.name}
                      />
                    ) : (
                      <div className="apc-cedoc__mock">
                        <div className="apc-ce-paper__top">
                          <span>Compensation event</span>
                          <span>{activeRecord.code}</span>
                        </div>
                        <h3>{activeRecord.fields.title}</h3>
                        <dl>
                          <div><dt>CE No.</dt><dd>{activeRecord.fields.ceNumber}</dd></div>
                          <div><dt>Date</dt><dd>{activeRecord.fields.date}</dd></div>
                          <div><dt>Reference</dt><dd>{activeRecord.fields.reference}</dd></div>
                          <div><dt>Quantity change</dt><dd>{activeRecord.fields.quantity}</dd></div>
                          <div><dt>Assessed value</dt><dd>{activeRecord.fields.amount}</dd></div>
                        </dl>
                        <p>
                          The Contractor is instructed to carry out additional drainage works at the south service
                          yard, including trench excavation, pipework and inspection chambers.
                        </p>
                        <p>
                          The assessed value of this compensation event is {activeRecord.fields.amount} and is to be
                          incorporated into the Cleanse{' '}
                          {activeTarget?.type === 'activity' ? 'Activity Schedule' : 'BQ'} CE column.
                        </p>
                      </div>
                    )}
                    {(activeRecord.regions ?? []).map(region => (
                      <span
                        key={region.id}
                        className="apc-cedoc__region"
                        style={{
                          left: `${region.x}%`,
                          top: `${region.y}%`,
                          width: `${region.w}%`,
                          height: `${region.h}%`
                        }}
                        title={`${region.label}: ${region.value} · ${region.confidence}% confidence`}
                      >
                        <i>{region.label}</i>
                        <b>{region.value}</b>
                      </span>
                    ))}
                  </div>

                  <div className="apc-ce-linked">
                    <div className="apc-ce-linked__head">
                      <b>
                        Linked{' '}
                        {activeTarget?.type === 'activity' ? 'Activity Schedule' : 'BQ'}
                      </b>
                      {activeTarget && <span>{activeTarget.code}</span>}
                      <button className="apc-ce-linked__change" onClick={openRelink}>
                        Change
                      </button>
                    </div>
                    {activeLink && activeLinkItems.length ? (
                      <>
                        <div className="apc-ce-linked__target">
                          {activeTarget?.code} · {activeTarget?.name}
                        </div>
                        <table className="apc-ce-linked__table">
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Description</th>
                              <th>Unit</th>
                              {moneyVisible && (
                                <th className="num">Allocated (HK$)</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {activeLinkItems.map(item => (
                              <tr key={item.id}>
                                <td className="mono">{item.no}</td>
                                <td>{item.label}</td>
                                <td>{item.unit || '—'}</td>
                                {moneyVisible && (
                                  <td className="num">
                                    {activeAllocation.toLocaleString('en-HK', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2
                                    })}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    ) : (
                      <div className="apc-ce-linked__empty">
                        No linked items. Use Relink to choose items.
                      </div>
                    )}
                  </div>
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
                    <div><span>Quantity change</span><b>{activeRecord.fields.quantity}</b></div>
                    {moneyVisible && (
                      <div><span>Assessed value</span><b>{activeRecord.fields.amount}</b></div>
                    )}
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
                        {moneyVisible && <th>Rate</th>}
                        {moneyVisible && <th>Amount</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {activeRecord.items.map(item => (
                        <tr key={item.description}>
                          <td>{item.description}</td>
                          <td>{item.unit}</td>
                          <td className="num">{formatBqQty(item.qty)}</td>
                          {moneyVisible && (
                            <td className="num">{item.rate.toFixed(2)}</td>
                          )}
                          {moneyVisible && (
                            <td className="num">{item.amount.toFixed(2)}</td>
                          )}
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
                    <th className="num">Qty</th>
                    {moneyVisible && <th className="num">Amount</th>}
                    <th>Received</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map(record => {
                    const amountValue = parseNumberInput(record.fields.amount);
                    return (
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
                      <td className="num">
                        {record.quantity == null ? '—' : formatBqQty(record.quantity)}
                      </td>
                      {moneyVisible && (
                        <td className="num">
                          {amountValue == null
                            ? '—'
                            : amountValue.toLocaleString('en-HK', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                        </td>
                      )}
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
                    );
                  })}
                  {!filteredRecords.length && (
                    <tr>
                      <td
                        colSpan={moneyVisible ? 7 : 6}
                        className="apc-records__empty"
                      >
                        No CE documents found.
                      </td>
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
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                    onChange={onFile}
                  />
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
                      <img className="apc-importcard__art" src="/import/ce.png" alt="" />
                      <b>Compensation Event document</b>
                      <span className="apc-importcard__copy">
                        Drag and drop your file here, or <strong>click to select</strong>.
                      </span>
                      <small>Supported formats: PDF, Word or Excel · images (PNG/JPG) are kept for the OCR comparison view</small>
                    </>
                  )}
                </label>

                {error && <div className="apc-home__error">{error}</div>}
              </div>

              <div className="apc-importpop__foot">
                <span>{draft ? '1 CE document selected' : 'Upload one CE document to continue.'}</span>
                <button className="apc-docpage__import" onClick={goLinkTarget}>
                  Next Step
                </button>
              </div>
            </section>
          ) : phase === 'bq' ? (
            <section
              className="apc-ceimportpop"
              role="dialog"
              aria-label={`Link CE to ${targetLabel}`}
            >
              <div className="apc-importpop__head">
                <div>
                  <b>Link CE to {targetLabel}</b>
                </div>
                <button className="apc-iconbtn" onClick={closeImport} aria-label="Close link dialog">
                  <Icon name="x" size={15} />
                </button>
              </div>
              <div className="apc-ceimportpop__body">
                <BqOptionPicker
                  options={targetOptions}
                  value={linkTargetId}
                  onChange={chooseLinkTarget}
                />
                {error && <div className="apc-home__error">{error}</div>}
              </div>
              <div className="apc-importpop__foot">
                <span>
                  {linkTargetId
                    ? `Linked to ${
                        targetOptions.find(option => option.id === linkTargetId)?.code ??
                        targetLabel
                      }`
                    : `Choose a ${targetLabel} record to continue.`}
                </span>
                <button className="apc-ce-back" onClick={() => setPhase('upload')}>
                  Back
                </button>
                <button
                  className="apc-docpage__import"
                  disabled={!linkTargetId}
                  onClick={startProcessing}
                >
                  Start OCR
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

      {relinkOpen && activeRecord && (
        <div className="apc-docpage__scrim">
          <section className="apc-ceimportpop apc-ce-relink" role="dialog" aria-label="Relink CE">
            <div className="apc-importpop__head">
              <div>
                <b>Relink CE</b>
                <span>{activeRecord.code}</span>
              </div>
              <button className="apc-iconbtn" onClick={() => setRelinkOpen(false)} aria-label="Close relink dialog">
                <Icon name="x" size={15} />
              </button>
            </div>
            <div className="apc-ceimportpop__body">
              <div className="apc-ce-linklabel">{targetLabel}</div>
              <BqOptionPicker
                options={targetOptions}
                value={relinkTargetId}
                onChange={id => {
                  setRelinkTargetId(id);
                  setRelinkItemIds([]);
                }}
              />
              <div className="apc-ce-itemselect__head">
                <b>{targetLabel} items</b>
                <span>{relinkItemIds.length} selected</span>
                <button onClick={() => setRelinkItemIds(relinkItems.map(item => item.id))}>
                  Select all
                </button>
                <button onClick={() => setRelinkItemIds([])}>Clear</button>
              </div>
              <div className="apc-ce-itemselect__scroll">
                <table className="apc-ce-itemselect">
                  <thead>
                    <tr>
                      <th />
                      <th>Item</th>
                      <th>Description</th>
                      <th>Unit</th>
                      <th className="num">Qty</th>
                      {moneyVisible && <th className="num">Rate</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {relinkItems.map(item => {
                      const selected = relinkItemIds.includes(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={selected ? 'on' : undefined}
                          onClick={() => toggleRelinkItem(item.id)}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleRelinkItem(item.id)}
                              onClick={event => event.stopPropagation()}
                            />
                          </td>
                          <td className="mono">{item.no}</td>
                          <td>{item.label}</td>
                          <td>{item.unit || '—'}</td>
                          <td className="num">{formatBqQty(item.qty)}</td>
                          {moneyVisible && (
                            <td className="num">
                              {item.rate == null
                                ? '—'
                                : item.rate.toLocaleString('en-HK', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="apc-importpop__foot">
              <span>
                {relinkTargetId && relinkItemIds.length
                  ? `${relinkItemIds.length} ${targetLabel} items linked.`
                  : `Select ${targetLabel} items to continue.`}
              </span>
              <button className="apc-ce-back" onClick={() => setRelinkOpen(false)}>
                Cancel
              </button>
              <button
                className="apc-docpage__import"
                disabled={!relinkTargetId || !relinkItemIds.length}
                onClick={saveRelink}
              >
                Save link
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
