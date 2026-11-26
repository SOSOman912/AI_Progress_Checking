import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { BqTable, type BqCeDetail } from '../components/BqPanels';
import { DraggablePanel } from '../components/DraggablePanel';
import { linksForActivity, linksForBq } from '../lib/ceLinks';
import { SMM_SECTIONS } from '../lib/measurementLibrary';
import { projectStorageKey } from '../lib/projectStorage';
import { usePricingMode } from '../lib/pricingMode';
import { formatBqNumber } from '../lib/numberFormat';
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
    title: 'Checking document completeness',
    body: 'Checking the main pricing document against the uploaded preambles and measurement basis.'
  },
  {
    title: 'Applying CE updates',
    body: 'Keeping the Cleanse pricing document aligned with the current CE column.'
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
    source: 'BQ completeness check',
    description: 'BQ item coverage against the uploaded preambles identified 50 mm non-shrink grout, but the BQ omits this item.',
    suggestion: '3.01.09',
    quantity: '18 m² @ HK$undefined',
    status: 'Auto-Injected to Cleanse BQ',
    targetKind: 'bq',
    targetPage: 2
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
              className="apc-scan-processing__ring"
              style={{
                background: `conic-gradient(#151719 ${pct}%, #e8edf0 ${pct}% 100%)`
              }}
            >
              <span>{pct}%</span>
            </div>
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

type BillMappingRow = {
  scheduleNo: string;
  confirmed: boolean;
};

const BQ_BILL_MAP_BASE = 'apc.bq-activity-bill-map.v2';

const loadBillMappings = (
  bqId?: string,
  projectId?: string
): Record<string, BillMappingRow> => {
  if (!bqId) return {};
  try {
    const raw = window.localStorage.getItem(
      projectStorageKey(BQ_BILL_MAP_BASE, projectId)
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, BillMappingRow>>;
    return parsed[bqId] ?? {};
  } catch {
    return {};
  }
};

const saveBillMappings = (
  bqId: string,
  rows: Record<string, BillMappingRow>,
  projectId?: string
) => {
  try {
    const key = projectStorageKey(BQ_BILL_MAP_BASE, projectId);
    const raw = window.localStorage.getItem(key);
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, Record<string, BillMappingRow>>)
      : {};
    parsed[bqId] = rows;
    window.localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    return;
  }
};

const mergeBillMappings = (
  defaults: Record<string, BillMappingRow>,
  stored: Record<string, BillMappingRow>
): Record<string, BillMappingRow> =>
  Object.fromEntries(
    Object.entries(defaults).map(([billId, fallback]) => {
      const saved = stored[billId];
      return [
        billId,
        {
          scheduleNo: fallback.scheduleNo,
          confirmed: Boolean(
            saved?.confirmed && saved.scheduleNo === fallback.scheduleNo
          )
        }
      ];
    })
  );

const siteFormationItems: Array<{
  no: string;
  label: string;
  unit: string;
  qty: number;
}> = [
  {
    no: '1',
    label:
      'Excavation for structures or foundations, material other than rock or artificial hard material, structure or foundation maximum depth exceeding 21.00 m but not exceeding 24.00 m',
    unit: 'm3',
    qty: 1164.52
  },
  {
    no: '2',
    label: 'Deposition, general fill material, adjacent to structures',
    unit: 'm3',
    qty: 1067.45
  },
  {
    no: '3',
    label: 'Disposal of material, in tips provided by the Employer',
    unit: 'm3',
    qty: 97.07
  },
  {
    no: '4',
    label: 'Imported general fill material, adjacent to structures',
    unit: 'm3',
    qty: 11396.16
  },
  {
    no: '5',
    label: 'General fill material, adjacent to structures',
    unit: 'm3',
    qty: 12463.61
  },
  {
    no: '6',
    label:
      'Formwork to give Class F1 finish, exceeding 300mm wide, at any inclination.',
    unit: 'm2',
    qty: 3179.35
  },
  {
    no: '7',
    label:
      'Formwork to give Class F2 finish, exceeding 300mm wide, at any inclination.',
    unit: 'm2',
    qty: 360.4
  },
  {
    no: '8',
    label:
      'Formwork to give Class F5 finish, exceeding 300mm wide, at any inclination.',
    unit: 'm2',
    qty: 2303.74
  },
  {
    no: '9',
    label:
      'Bar reinforcement, high yield steel (grade 500B), bars not exceeding 12.00m in length — not exceeding 16mm diameter',
    unit: 't',
    qty: 5.2
  },
  {
    no: '10',
    label:
      'Bar reinforcement, high yield steel (grade 500B), bars not exceeding 12.00m in length — exceeding 16mm but not exceeding 40mm diameter',
    unit: 't',
    qty: 1964.2
  },
  {
    no: '11',
    label: 'Concrete grade 50/20',
    unit: 'm3',
    qty: 5736.04
  },
  {
    no: '12',
    label: 'Concrete grade 20/20 (blinding concrete)',
    unit: 'm3',
    qty: 89.94
  }
];

export const BQ_SAMPLE_ITEMS = siteFormationItems;

const siteFormationSections = [
  { id: 'sf-sec-7', no: 'Section 7', number: '7', name: 'Earthworks', itemRange: [0, 5] },
  { id: 'sf-sec-10', no: 'Section 10', number: '10', name: 'Formwork', itemRange: [5, 8] },
  {
    id: 'sf-sec-11',
    no: 'Section 11',
    number: '11',
    name: 'Steel Reinforcement',
    itemRange: [8, 10]
  },
  { id: 'sf-sec-12', no: 'Section 12', number: '12', name: 'Concrete', itemRange: [10, 12] }
].map(section => ({
  id: section.id,
  no: section.no,
  number: section.number,
  name: section.name,
  items: siteFormationItems
    .slice(section.itemRange[0], section.itemRange[1])
    .map(
      item =>
        ({
          id: `sf-item-${item.no}`,
          type: 'item' as const,
          no: item.no,
          label: item.label,
          unit: item.unit,
          rate: null,
          contractQty: item.qty,
          calc: item.qty,
          state: 'confirmed' as const
        }) as BillLine
    )
}));

const siteFormationLines: BillLine[] = siteFormationSections.flatMap(section => [
  {
    id: section.id,
    type: 'section' as const,
    label: `${section.no}  ${section.name}`,
    lv: 0,
    billNo: '3',
    billTitle: 'Site Formation',
    scheduleNo: '3'
  },
  ...section.items
]);

export function PreprocessingResult({
  docs,
  actionLabel,
  onAction,
  flowLabel = 'BQ',
  smmStandard = 'HKSMM4',
  showDashboard = true,
  showMissingReport = true,
  mappingMode = false,
  structuredBq = false,
  bqId,
  bqCode,
  projectId,
  linkedActivity
}: {
  docs: ViewerDoc[];
  actionLabel: string;
  onAction: () => void;
  flowLabel?: string;
  smmStandard?: string;
  showDashboard?: boolean;
  showMissingReport?: boolean;
  mappingMode?: boolean;
  structuredBq?: boolean;
  bqId?: string;
  bqCode?: string;
  projectId?: string;
  linkedActivity?: { code: string; name: string };
}) {
  const viewerDocs = docs.length
    ? docs
    : [
        {
          id: 'mock-bq',
          kind: 'bq' as DocKind,
          name: DEFAULT_NAMES.bq
        }
      ];
  const [pricingMode] = usePricingMode(projectId);
  const moneyVisible = pricingMode === 'priced';
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
  const docTab = (kind: DocKind) =>
    flowLabel === 'Activity Schedule' && kind === 'bq' ? 'ACTIVITY' : kind.toUpperCase();
  const tabLabel = (doc: ViewerDoc) => {
    const list = listOf(doc.kind);
    const index = list.findIndex(item => item.id === doc.id) + 1;
    return list.length > 1 ? `${docTab(doc.kind)} ${index}` : docTab(doc.kind);
  };
  const docTitle = (kind: DocKind) =>
    flowLabel === 'Activity Schedule' && kind === 'bq'
      ? 'Activity Schedule'
      : DOC_LABELS[kind];
  const hasSp = !!docOf('sp');
  const hasPp = !!docOf('pp');
  const hasPreamble = hasSp || hasPp;
  const packageLabel = (['bq', 'sp', 'pp'] as DocKind[])
    .filter(kind => viewerDocs.some(doc => doc.kind === kind))
    .map(kind =>
      kind === 'bq' ? (flowLabel === 'Activity Schedule' ? 'AS' : 'BQ') : kind.toUpperCase()
    )
    .join(' + ');
  const flowChecks = CHECK_ROWS.map(row =>
    row.id === 'CHK-01' && flowLabel === 'Activity Schedule'
      ? {
          ...row,
          source: 'Activity Schedule completeness check',
          description:
            'Activity Schedule item coverage against the uploaded preambles identified 50 mm non-shrink grout, but the Activity Schedule omits this item.',
          status: 'Auto-Injected to Cleanse Activity Schedule'
        }
      : row
  );
  const visibleChecks = hasPreamble
    ? flowChecks.filter(row => row.id !== 'CHK-02' || (hasSp && hasPp))
    : [];
  const smmConfigLabel = `${smmStandard === 'CESMM' ? 'Civil' : 'Building'} · ${smmStandard}`;
  const formatMoney = (value: number | null | undefined) =>
    value == null
      ? '—'
      : value.toLocaleString('en-HK', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
  const smmForSection = (section: { number: string; name: string }) => {
    const sectionName = section.name.toLowerCase();
    if (sectionName.includes('miscellaneous')) {
      return SMM_SECTIONS.find(([no]) => no === 26);
    }
    if (sectionName.includes('concrete')) {
      return SMM_SECTIONS.find(([no]) => no === 12);
    }
    return SMM_SECTIONS.find(([no, name]) => {
      return String(no) === section.number && name.toLowerCase().includes(sectionName);
    });
  };

  const bqBills = useMemo(() => {
    if (mappingMode) {
      return [
        {
          id: 'bill-3',
          billNo: '3',
          billTitle: 'Site Formation',
          scheduleNo: '3',
          pageIndex: 0,
          sections: siteFormationSections.map(section => ({
            ...section,
            itemCount: section.items.length
          }))
        }
      ];
    }
    const sourceLines = [...demoData.bill.lines, ...cleanseExtra];
    const sections = sourceLines.filter(line => line.type === 'section');
    const byBill = new Map<
      string,
      {
        id: string;
        billNo: string;
        billTitle: string;
        scheduleNo: string;
        pageIndex: number;
        sections: Array<{
          id: string;
          no: string;
          number: string;
          name: string;
          itemCount: number;
          items: BillLine[];
        }>;
      }
    >();
    sections.forEach((section, index) => {
      const start = sourceLines.indexOf(section);
      const end =
        index + 1 < sections.length
          ? sourceLines.indexOf(sections[index + 1])
          : sourceLines.length;
      const label = section.label;
      const match = label.match(/^Section\s+(\d+)\s+(.*)$/i);
      const billNo = section.billNo ?? match?.[1] ?? '';
      const billTitle = section.billTitle ?? match?.[2] ?? label;
      const scheduleNo = section.scheduleNo ?? match?.[1] ?? '';
      const items = sourceLines
        .slice(start, end)
        .filter(line => line.type === 'item') as BillLine[];
      const key = billNo || section.id;
      const existing = byBill.get(key);
      const entry = {
        id: section.id,
        no: match ? `Section ${match[1]}` : 'Section',
        number: match?.[1] ?? '',
        name: match?.[2] ?? label,
        itemCount: items.length,
        items
      };
      if (existing) {
        existing.sections.push(entry);
      } else {
        byBill.set(key, {
          id: `bill-${key}`,
          billNo,
          billTitle,
          scheduleNo,
          pageIndex: index,
          sections: [entry]
        });
      }
    });
    return [...byBill.values()];
  }, [mappingMode]);
  const billDefaults = useMemo(
    () =>
      Object.fromEntries(
        bqBills.map(bill => [
          bill.id,
          { scheduleNo: bill.scheduleNo, confirmed: false }
        ])
      ) as Record<string, BillMappingRow>,
    [bqBills]
  );
  const [billMappings, setBillMappings] = useState<Record<string, BillMappingRow>>(
    () => mergeBillMappings(billDefaults, loadBillMappings(bqId, projectId))
  );
  const [selectedBillId, setSelectedBillId] = useState(bqBills[0]?.id ?? '');

  useEffect(() => {
    if (!bqId) return;
    setBillMappings(mergeBillMappings(billDefaults, loadBillMappings(bqId, projectId)));
  }, [bqId, billDefaults]);

  useEffect(() => {
    if (mappingMode && bqId) saveBillMappings(bqId, billMappings, projectId);
  }, [mappingMode, bqId, billMappings]);

  const selectedBill =
    bqBills.find(bill => bill.id === selectedBillId) ?? bqBills[0];
  const selectedBillRow = selectedBill
    ? billMappings[selectedBill.id] ?? billDefaults[selectedBill.id]
    : null;
  const billSchedule = activitySchedules.find(
    schedule => schedule.no === selectedBillRow?.scheduleNo
  );
  const selectedBillMapped = Boolean(billSchedule);
  const allBillsMapped = bqBills.every(bill => {
    const row = billMappings[bill.id] ?? billDefaults[bill.id];
    return activitySchedules.some(schedule => schedule.no === row?.scheduleNo);
  });
  const confirmedCount = Object.values(billMappings).filter(row => row.confirmed).length;
  const mappingTotal = bqBills.length;

  const selectBill = (bill: (typeof bqBills)[number]) => {
    setSelectedBillId(bill.id);
  };

  const updateBillSchedule = (scheduleNo: string) => {
    if (!selectedBill) return;
    setBillMappings(prev => ({
      ...prev,
      [selectedBill.id]: { scheduleNo, confirmed: false }
    }));
  };

  const confirmMapping = () => {
    if (!allBillsMapped) return;
    const next: Record<string, BillMappingRow> = {};
    Object.keys(billDefaults).forEach(billId => {
      const row = billMappings[billId] ?? billDefaults[billId];
      next[billId] = { ...row, confirmed: true };
    });
    setBillMappings(next);
    if (bqId) saveBillMappings(bqId, next, projectId);
    onAction();
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
          <span>{flowLabel} preprocessing</span>
          <h2>{nameOf('bq')}</h2>
        </div>
      </header>

      <div className={`apc-pre__workbench${showDashboard ? '' : ' is-single'}`}>
        <aside className="apc-pre__left">
          {structuredBq ? (
            <section className="apc-pre__panel apc-mapbqpanel">
              <div className="apc-pre__panelhead">
                <b>Bills &amp; sections</b>
                <span>{bqBills.length}</span>
              </div>
              <div className="apc-mapbq__scroll">
                {bqBills.map(bill => {
                  const row = billMappings[bill.id] ?? billDefaults[bill.id];
                  const schedule = activitySchedules.find(
                    entry => entry.no === row?.scheduleNo
                  );
                  const mapped = Boolean(schedule);
                  return (
                    <div key={bill.id} className="apc-billmap__group">
                      <button
                        className={`apc-billmap__row${selectedBillId === bill.id ? ' on' : ''}`}
                        onClick={() => selectBill(bill)}
                      >
                        <span className="apc-billmap__top">
                          <span className="apc-billmap__no">Bill No. {bill.billNo}</span>
                          <b className="apc-billmap__name">{bill.billTitle}</b>
                          {mappingMode ? (
                            <span
                              className={`apc-billmap__status${mapped ? ' is-mapped' : ' is-unmapped'}`}
                            >
                              {mapped ? 'Mapped' : 'Unmapped'}
                            </span>
                          ) : (
                            <span className="apc-billmap__count">
                              {bill.sections.length}{' '}
                              {bill.sections.length === 1 ? 'section' : 'sections'}
                            </span>
                          )}
                        </span>
                        {mappingMode && (
                          <span className="apc-billmap__pair">
                            <Icon name="arrow-left-right" size={10} />
                            {mapped
                              ? `Schedule No. ${row?.scheduleNo} — ${schedule?.title}`
                              : `Schedule No. ${row?.scheduleNo || '—'} not found`}
                          </span>
                        )}
                      </button>
                      <div className="apc-billmap__sectionlist">
                        {bill.sections.map(section => (
                          <button
                            key={section.id}
                            className="apc-billmap__sectionitem"
                            onClick={() => selectBill(bill)}
                          >
                            <span>{section.no}</span>
                            <b title={section.name}>{section.name}</b>
                            <em>{section.itemCount}</em>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="apc-pre__panel">
              <div className="apc-pre__panelhead">
                <b>
                  Input package and{' '}
                  {flowLabel === 'Activity Schedule' ? 'processing' : 'SMM processing'} configuration
                </b>
              </div>
              <ol className="apc-pre__inputs">
                <li>
                  <span>{flowLabel} bill file</span>
                  <b>{labelOf('bq')}</b>
                </li>
                {hasSp && (
                  <li>
                    <span>Standard Preamble (SP)</span>
                    <b>{labelOf('sp')}</b>
                  </li>
                )}
                {hasPp && (
                  <li>
                    <span>Particular Preamble (PP)</span>
                    <b>{labelOf('pp')}</b>
                  </li>
                )}
              </ol>
            </section>
          )}
        </aside>

        <section className={`apc-pre__center${showDashboard ? '' : ' is-single'}`}>
          {structuredBq ? (
            <div className="apc-mapbqtable">
              <div className="apc-mapbqtable__head">
                <div>
                  <span>Bill No. {selectedBill?.billNo ?? '—'}</span>
                  <b>{selectedBill?.billTitle ?? 'Select a BQ bill'}</b>
                </div>
                <span>
                  {selectedBill?.sections.length ?? 0}{' '}
                  {(selectedBill?.sections.length ?? 0) === 1 ? 'section' : 'sections'} ·{' '}
                  {selectedBill?.sections.reduce(
                    (sum, section) => sum + section.items.length,
                    0
                  ) ?? 0}{' '}
                  items
                </span>
              </div>
              <div className="apc-mapbqtable__scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Description</th>
                      <th>Unit</th>
                      <th className="num">Qty</th>
                      {moneyVisible && <th className="num">Rate (HK$)</th>}
                      {moneyVisible && <th className="num">Amount (HK$)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBill?.sections.map(section => [
                      <tr key={`${section.id}-head`} className="apc-mapbqtable__sectionrow">
                        <td colSpan={moneyVisible ? 6 : 4}>
                          <span className="apc-mapbqtable__sectiontitle">
                            <b>{section.no}</b> {section.name}
                          </span>
                          <span className="apc-mapbqtable__smm">
                            {(() => {
                              const smm = smmForSection(section);
                              return smm
                                ? `SMM library · Section ${smm[0]} — ${smm[1]}`
                                : 'SMM library · Unmapped';
                            })()}
                          </span>
                        </td>
                      </tr>,
                      ...section.items.map(item => {
                        const qty =
                          item.contractQty ?? item.override ?? item.calc ?? null;
                        const amount =
                          qty != null && item.rate != null ? qty * item.rate : null;
                        return (
                          <tr key={item.id}>
                            <td className="mono">{item.no}</td>
                            <td>{item.label}</td>
                            <td>{item.unit || '—'}</td>
                            <td className="num">{formatMoney(qty)}</td>
                            {moneyVisible && (
                              <td className="num">{formatMoney(item.rate)}</td>
                            )}
                            {moneyVisible && (
                              <td className="num">{formatMoney(amount)}</td>
                            )}
                          </tr>
                        );
                      })
                    ])}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
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
                    title={`${docTitle(doc.kind)} · ${doc.name}`}
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
                  flowLabel={flowLabel}
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
          )}
          {!showDashboard && (
            <div className="apc-pre__centeraction">
              <button className="apc-pre__confirmbtn" onClick={onAction}>
                {actionLabel}
              </button>
            </div>
          )}
        </section>

        {showDashboard && mappingMode && (
          <aside className="apc-pre__right">
            <section className="apc-pre__panel">
              <div className="apc-pre__panelhead">
                <b>BQ ↔ Activity Schedule</b>
                <span>
                  {confirmedCount}/{mappingTotal}
                </span>
              </div>
              <div className="apc-mapbq__detail">
                <div className="apc-mapbq__current">
                  <span>{bqCode ?? 'BQ record'}</span>
                  <b>
                    Bill No. {selectedBill?.billNo ?? '—'} —{' '}
                    {selectedBill?.billTitle ?? 'Select a BQ bill'}
                  </b>
                </div>

                <div className="apc-mapbq__source">
                  <span>Linked Activity Schedule</span>
                  <b>
                    {linkedActivity
                      ? `${linkedActivity.code} · ${linkedActivity.name}`
                      : 'Not linked'}
                  </b>
                </div>

                <label className="apc-mapbq__field">
                  <span>Schedule No.</span>
                  <select
                    value={selectedBillRow?.scheduleNo ?? ''}
                    onChange={event => updateBillSchedule(event.target.value)}
                  >
                    <option value="">Not linked</option>
                    {activitySchedules.map(schedule => (
                      <option key={schedule.no} value={schedule.no}>
                        Schedule No. {schedule.no} — {schedule.title}
                      </option>
                    ))}
                  </select>
                </label>

                <div
                  className={`apc-mapbq__state${selectedBillRow?.confirmed ? ' is-confirmed' : ''}`}
                >
                  <Icon
                    name={selectedBillRow?.confirmed ? 'check' : 'badge-check'}
                    size={12}
                  />
                  {!selectedBillMapped
                    ? 'Unmapped — no matching Schedule No.'
                    : selectedBillRow?.confirmed
                      ? 'Mapping confirmed'
                      : 'Suggested mapping — review and confirm'}
                </div>
              </div>
              <div className="apc-pre__actions">
                <button
                  className="apc-pre__confirmbtn"
                  onClick={confirmMapping}
                  disabled={!selectedBill || !selectedBillMapped || !allBillsMapped}
                >
                  {actionLabel}
                </button>
              </div>
            </section>
          </aside>
        )}

        {showDashboard && !mappingMode && (
        <aside className="apc-pre__right">
          <section className="apc-pre__panel">
            <div className="apc-pre__panelhead">
              <b>Dashboard</b>
            </div>
            <div className="apc-pre__kpis">
              <div className="apc-pre__kpi">
                <span>Current SMM configuration</span>
                <b>{smmConfigLabel}</b>
              </div>
              <div className="apc-pre__kpi">
                <span>Uploaded document package</span>
                <b>{packageLabel || '—'}</b>
                <small>
                  {viewerDocs.length} {viewerDocs.length === 1 ? 'document' : 'documents'} ready
                </small>
              </div>
              {showMissingReport && (
                <div className="apc-pre__kpi">
                  <span>Missing Item / Override check</span>
                  <b>{visibleChecks.length} corrections</b>
                  <small>
                    {visibleChecks.length
                      ? `Auto-written to the Cleanse ${flowLabel}`
                      : 'No missing item corrections'}
                  </small>
                </div>
              )}
            </div>
          </section>

          {showMissingReport ? (
            <section className="apc-pre__panel apc-pre__reportpanel">
              <div className="apc-pre__panelhead">
                <b>Missing items report</b>
                <span>{visibleChecks.length} checks</span>
              </div>
              {visibleChecks.length ? (
                <div className="apc-missingwrap">
                  <table className="apc-missingtable apc-missingtable--compact">
                    <thead>
                      <tr>
                        <th>Check</th>
                        <th>Exception</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleChecks.map(row => (
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
                          <td>
                            <div className="apc-missingtable__detail">
                              <b className="mono">{row.suggestion}</b>
                              <span>{row.quantity}</span>
                              <p>{row.description}</p>
                              <small>{row.source}</small>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="apc-pre__reportempty">No missing items.</div>
              )}
              <div className="apc-pre__actions">
                <button className="apc-pre__confirmbtn" onClick={onAction}>
                  {actionLabel}
                </button>
              </div>
            </section>
          ) : (
            <div className="apc-pre__actions apc-pre__actions--standalone">
              <button className="apc-pre__confirmbtn" onClick={onAction}>
                {actionLabel}
              </button>
            </div>
          )}
        </aside>
        )}
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
  onDelete,
  recordLabel = 'BQ record',
  emptyText = 'No BQ records found.'
}: {
  records: BqRecordRow[];
  menuId: string | null;
  onOpen: (record: BqRecordRow) => void;
  onToggleMenu: (id: string) => void;
  onReprocess: (record: BqRecordRow) => void;
  onDelete: (id: string) => void;
  recordLabel?: string;
  emptyText?: string;
}) {
  return (
    <>
      <div className="apc-recordtablewrap">
        <table className="apc-recordtable">
          <thead>
            <tr>
              <th>{recordLabel}</th>
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
                <td colSpan={6} className="apc-records__empty">{emptyText}</td>
              </tr>
            ) : (
              records.map(record => (
                <tr key={record.id} onClick={() => onOpen(record)}>
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
    </>
  );
}

function MockDocPage({
  kind,
  page,
  activeCheck,
  name,
  flowLabel = 'BQ'
}: {
  kind: DocKind;
  page: number;
  activeCheck: string | null;
  name: string;
  flowLabel?: string;
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

  if (kind === 'bq' && flowLabel === 'Activity Schedule') {
    const schedule =
      activitySchedules[Math.min(page - 1, activitySchedules.length - 1)] ??
      activitySchedules[0];
    return (
      <div className="apc-paper apc-paper--bq apc-paper--activity">
        <div className="apc-paper__top">
          <span>Activity Schedule</span>
          <span>Schedule No. {schedule.no}</span>
        </div>
        <h3>{schedule.title}</h3>
        <div className="apc-paper__activityhead">
          <span>Item</span>
          <span>Activity</span>
          <span>Price (HK$)</span>
        </div>
        {schedule.items.map(item => (
          <div key={item.no} className="apc-paper__activityrow">
            <span>{item.no}</span>
            <span>{item.label}</span>
            <span>{item.price.toLocaleString('en-HK', { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
        <div className="apc-paper__foot">
          <span>{name}</span>
          <span>Page {page}</span>
        </div>
      </div>
    );
  }

  const bqSection =
    page === 2
      ? {
          top: 'Bill No. 10 · Miscellaneous Works',
          title: 'Section 3 — Miscellaneous',
          rows: [['3.01.09', 'Non-shrink grout, 50 mm thick, to base plate', '18.00']]
        }
      : {
          top: 'Bill No. 3 · Site Formation',
          title: 'Section 12 — In-situ concrete',
          rows: [
            ['2.10', 'Grade C35/20, OPC; in bases', '12.50'],
            ['2.11', 'Grade C35/20, OPC; in walls', '35.00'],
            ['2.12', 'Grade C20/20 blinding, 75 mm thick', '2.80'],
            ['2.20', 'Copings, type CP1, 900 × 200 mm', '3']
          ]
        };

  return (
    <div className="apc-paper apc-paper--bq">
      <div className="apc-paper__top">
        <span>{bqSection.top}</span>
        <span>Rev 2</span>
      </div>
      <h3>{bqSection.title}</h3>
      <div className="apc-paper__bqhead">
        <span>Item</span>
        <span>Description</span>
        <span>Qty</span>
      </div>
      {bqSection.rows.map(([no, desc, qty]) => (
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

const activitySchedules: Array<{
  no: string;
  title: string;
  items: Array<{ no: string; label: string; price: number }>;
}> = [
  {
    no: '1',
    title: 'Preliminaries',
    items: [
      { no: '1.001', label: 'Principal offices for the Project Manager and the Supervisor', price: 30000000 },
      { no: '1.002', label: 'Temporary accommodation for the Contractor', price: 80000000 },
      { no: '1.003', label: 'Third party insurance', price: 1000000 },
      { no: '1.011', label: 'Hoarding, temporary fences and signboards', price: 3026500 }
    ]
  },
  {
    no: '2',
    title: 'Ground Investigation and Monitoring',
    items: [
      { no: '2.001', label: 'Ground investigation works', price: 6500000 },
      { no: '2.002', label: 'Instrumentation and monitoring', price: 1250000 }
    ]
  },
  {
    no: '3',
    title: 'Site Formation',
    items: [
      { no: '3.001', label: 'Site clearance and grubbing', price: 12500000 },
      { no: '3.002', label: 'Excavation and lateral support', price: 28000000 }
    ]
  },
  {
    no: '4',
    title: 'Footbridge',
    items: [
      { no: '4.001', label: 'Footbridge structural steelwork', price: 15750000 },
      { no: '4.002', label: 'Bearings and expansion joints', price: 2400000 }
    ]
  },
  {
    no: '5',
    title: 'Drainage',
    items: [
      { no: '5.001', label: 'Drainage trench excavation', price: 8750000 },
      { no: '5.002', label: 'Pipework and inspection chambers', price: 14200000 }
    ]
  },
  {
    no: '6',
    title: 'Sewerage',
    items: [
      { no: '6.001', label: 'Sewer construction', price: 9800000 },
      { no: '6.002', label: 'Manholes and connections', price: 4600000 }
    ]
  },
  {
    no: '7',
    title: 'Waterworks',
    items: [
      { no: '7.001', label: 'Water mains', price: 7300000 },
      { no: '7.002', label: 'Valves and fittings', price: 1900000 }
    ]
  },
  {
    no: '8',
    title: 'Roadworks',
    items: [
      { no: '8.001', label: 'Carriageway construction', price: 18400000 },
      { no: '8.002', label: 'Road markings and signage', price: 1150000 }
    ]
  },
  {
    no: '9',
    title: 'Landscape Softworks and Establishment Works',
    items: [
      { no: '9.001', label: 'Soft landscaping', price: 3800000 },
      { no: '9.002', label: 'Establishment works', price: 950000 }
    ]
  },
  {
    no: '10',
    title: 'Miscellaneous Works',
    items: [{ no: '10.001', label: 'Miscellaneous works', price: 2250000 }]
  },
  {
    no: '11',
    title: 'Site Safety',
    items: [{ no: '11.001', label: 'Site safety measures', price: 1600000 }]
  },
  {
    no: '12',
    title: 'Monitoring Payment of Wages',
    items: [{ no: '12.001', label: 'Monitoring payment of wages', price: 800000 }]
  },
  {
    no: '13',
    title: 'Site Cleanliness and Tidiness',
    items: [{ no: '13.001', label: 'Site cleanliness and tidiness', price: 700000 }]
  }
];

export const ACTIVITY_ITEMS = activitySchedules.flatMap(schedule =>
  schedule.items.map(item => ({
    id: `as-${item.no.replace('.', '-')}`,
    no: item.no,
    label: item.label,
    unit: 'item',
    qty: 1,
    rate: item.price,
    ce: 0,
    scheduleNo: schedule.no,
    scheduleTitle: schedule.title
  }))
);

const activityScheduleLines: BillLine[] = activitySchedules.flatMap(schedule => [
  {
    id: `as-sec-${schedule.no}`,
    type: 'section' as const,
    label: `Schedule No. ${schedule.no}  ${schedule.title}`,
    lv: 0
  },
  ...schedule.items.map(item => ({
    id: `as-${item.no.replace('.', '-')}`,
    type: 'item' as const,
    no: item.no,
    label: item.label,
    unit: 'item',
    rate: item.price,
    contractQty: 1,
    override: 1,
    calc: 1,
    state: 'confirmed' as const
  }))
]);

const cleanseExtra: BillLine[] = [
  {
    id: 'cleanse-sec',
    type: 'section',
    label: 'Section 3  Miscellaneous',
    lv: 0,
    billNo: '10',
    billTitle: 'Miscellaneous Works',
    scheduleNo: '10'
  },
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
    reason: 'Auto-injected from the BQ completeness check.'
  }
];

const escapeCsv = (value: string | number | null | undefined) =>
  `"${String(value ?? '').replace(/"/g, '""')}"`;

export function CleanseBqView({
  bqId,
  bqCode,
  bqName,
  heading = 'Cleanse BQ',
  onOpenCe,
  projectId,
  linkedActivity,
  linkedBqs = [],
  sampleBq = false
}: {
  bqId?: string;
  bqCode?: string;
  bqName?: string;
  heading?: string;
  onOpenCe?: (ceId: string) => void;
  projectId?: string;
  linkedActivity?: { code: string; name: string };
  linkedBqs?: Array<{ code: string; name: string }>;
  sampleBq?: boolean;
}) {
  const isActivity = heading === 'Cleanse Activity Schedule';
  const [pricingMode] = usePricingMode(projectId);
  const moneyVisible = pricingMode === 'priced';
  const [resultTab, setResultTab] = useState<'schedule' | 'ce-summary'>(
    'schedule'
  );
  const lines = useMemo(
    () =>
      isActivity
        ? activityScheduleLines
        : sampleBq
          ? siteFormationLines
          : [...demoData.bill.lines, ...cleanseExtra],
    [isActivity, sampleBq]
  );
  const [activeLine, setActiveLine] = useState('');
  const [activeSection, setActiveSection] = useState('all');
  const [linksOpen, setLinksOpen] = useState(false);
  const links = useMemo(
    () =>
      isActivity
        ? linksForActivity(bqId, projectId)
        : linksForBq(bqId, projectId),
    [bqId, projectId, isActivity]
  );
  const docLabel = isActivity ? 'Activity Schedule' : 'BQ';

  const ceDetails = useMemo(() => {
    const map: Record<string, BqCeDetail[]> = {};
    links.forEach(link => {
      const linkedCount = link.itemIds.length;
      const allocated = linkedCount ? link.amount / linkedCount : link.amount;
      link.itemIds.forEach(itemId => {
        const line = lines.find(item => item.id === itemId);
        if (!line) return;
        const current = map[itemId] ?? [];
        current.push({
          ceId: link.ceId,
          ref: link.ceCode,
          title: link.title,
          amount: allocated,
          date: link.date,
          reference: link.reference,
          assessed: allocated
        });
        map[itemId] = current;
      });
    });
    return map;
  }, [links, lines]);

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

  const sectionSlices = useMemo(() => {
    const sections = lines
      .map((line, index) => ({ line, index }))
      .filter(item => item.line.type === 'section');
    return sections.map((entry, index) => {
      const end = sections[index + 1]?.index ?? lines.length;
      const slice = lines.slice(entry.index, end);
      const label = entry.line.label;
      const sectionMatch = label.match(/^Section\s+(\d+)\s+(.*)$/i);
      const billMatch = label.match(/^Bill(?: No\.?)?\s*(\d+)\s+(.*)$/i);
      const scheduleMatch = label.match(/^Schedule No\.\s*(\d+)\s+(.*)$/i);
      const no = sectionMatch
        ? `Section ${sectionMatch[1]}`
        : billMatch
          ? `Bill ${billMatch[1]}`
          : scheduleMatch
            ? `Schedule ${scheduleMatch[1]}`
            : 'Bill';
      const name = sectionMatch?.[2] ?? billMatch?.[2] ?? scheduleMatch?.[2] ?? label;
      return {
        id: entry.line.id,
        no,
        name,
        count: slice.filter(line => line.type === 'item').length,
        lines: slice
      };
    });
  }, [lines]);
  const activeSlice =
    activeSection === 'all'
      ? null
      : sectionSlices.find(section => section.id === activeSection) ?? null;
  const visibleLines = activeSlice?.lines ?? lines;

  const ceSummary = useMemo(() => {
    const seen = new Set<string>();
    return links.filter(link => {
      if (seen.has(link.ceId)) return false;
      seen.add(link.ceId);
      return true;
    });
  }, [links]);

  const ceNetTotal = ceSummary.reduce((sum, link) => sum + link.amount, 0);
  const showCeTabs = isActivity || sampleBq;

  return (
    <div className="apc-cleanse">
      <div className="apc-cleanse__bar">
        <div className="apc-cleanse__title">
          <span>Preprocessing result</span>
          <h2>{heading}</h2>
        </div>
        <div className="apc-cleanse__actions">
          <button className="apc-cleanse__download" onClick={() => setLinksOpen(true)}>
            <Icon name="file-text" size={13} />
            Linked documents
          </button>
          <button className="apc-cleanse__download" onClick={download}>
            <Icon name="download" size={13} />
            Download {heading}
          </button>
        </div>
      </div>

      {showCeTabs && (
        <div className="apc-docpage__tabsbar apc-docpage__tabsbar--sub apc-cleanse__subtabs">
          <div className="apc-seg apc-seg--sm">
            <button
              className={resultTab === 'schedule' ? 'on' : ''}
              onClick={() => setResultTab('schedule')}
            >
              {isActivity ? 'Activity Schedule' : 'Bill of Quantities'}
            </button>
            <button
              className={resultTab === 'ce-summary' ? 'on' : ''}
              onClick={() => setResultTab('ce-summary')}
            >
              Compensation Event Summary
            </button>
          </div>
          <span className="apc-docpage__subhint">
            {ceSummary.length} compensation event
            {ceSummary.length === 1 ? '' : 's'} linked to this {docLabel}
          </span>
        </div>
      )}

      <div className="apc-cleanse__content">
        {resultTab === 'schedule' && (
          <nav className="apc-billsnav" aria-label={isActivity ? 'Schedules' : 'Bills and sections'}>
          <div className="apc-billsnav__head">
            <b>{isActivity ? 'Schedules' : 'Bills & sections'}</b>
            <span>{sectionSlices.length}</span>
          </div>
          <div className="apc-billsnav__scroll">
            <button
              className={`apc-billrow apc-billrow--all${activeSection === 'all' ? ' on' : ''}`}
              onClick={() => {
                setActiveSection('all');
                setActiveLine('');
              }}
            >
              <span className="apc-billrow__no">All</span>
              <span className="apc-billrow__name">
                {isActivity ? 'All schedules' : 'All sections'}
              </span>
              <span className="apc-billrow__count">
                {lines.filter(line => line.type === 'item').length}
              </span>
            </button>
            {sectionSlices.map(section => (
              <button
                key={section.id}
                className={`apc-billrow${activeSection === section.id ? ' on' : ''}`}
                onClick={() => {
                  setActiveSection(section.id);
                  setActiveLine('');
                }}
              >
                <span className="apc-billrow__no">{section.no}</span>
                <span className="apc-billrow__name" title={section.name}>
                  {section.name}
                </span>
                <span className="apc-billrow__count">{section.count}</span>
              </button>
            ))}
          </div>
          </nav>
        )}
        <div className="apc-cleanse__table">
          {resultTab === 'schedule' ? (
          <BqTable
            key={activeSection}
            lines={visibleLines}
            activeLine={activeLine}
            setActiveLine={setActiveLine}
            readOnly
            showMoney={moneyVisible}
            showCe={moneyVisible}
            expandCe={moneyVisible}
            ceDetails={ceDetails}
            onOpenCe={onOpenCe}
            colWidths={
              isActivity
                ? { rate: 128, abim: 150, amount: 136, final: 150 }
                : undefined
            }
            affectedIds={
              isActivity
                ? { missing: [], override: [] }
                : { missing: ['cleanse-grout'], override: ['n3', 'n4', 'n5'] }
            }
          />
          ) : (
            <table className="apc-bqtable apc-cesummary">
              <thead>
                <tr>
                  <th>CE No.</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Reference</th>
                  <th className="num">Linked {docLabel} items</th>
                  {moneyVisible && <th className="num">Net Amount (HK$)</th>}
                </tr>
              </thead>
              <tbody>
                {ceSummary.length === 0 ? (
                  <tr>
                    <td className="apc-cesummary__empty" colSpan={moneyVisible ? 6 : 5}>
                      No compensation event is linked to this {docLabel}.
                    </td>
                  </tr>
                ) : (
                  ceSummary.map(link => (
                    <tr
                      key={link.ceId}
                      className={onOpenCe ? 'is-openable' : undefined}
                      onClick={() => onOpenCe?.(link.ceId)}
                      title={onOpenCe ? 'Open CE AI OCR result' : undefined}
                    >
                      <td className="mono">{link.ceCode}</td>
                      <td>{link.title || 'Compensation event'}</td>
                      <td>{link.date || '—'}</td>
                      <td>{link.reference || '—'}</td>
                      <td className="num">{link.itemIds.length}</td>
                      {moneyVisible && (
                        <td className="num">{formatBqNumber(link.amount)}</td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              {moneyVisible && ceSummary.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={5}>Total net amount of all linked CEs</td>
                    <td className="num">{formatBqNumber(ceNetTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>

      {linksOpen && (
        <DraggablePanel
          title="Linked documents"
          icon="file-text"
          headerExtra={<span className="apc-cleanse__linkbq">{bqCode ?? 'BQ'}</span>}
          initial={{ x: 24, y: 24, w: 380, h: 340 }}
          minWidth={300}
          minHeight={220}
          onClose={() => setLinksOpen(false)}
        >
          <div className="apc-cleanse__links">
            <div className="apc-cleanse__linkbqname">{bqName ?? heading}</div>
            <div className="apc-cleanse__linkgroup">
              <b>CE documents</b>
              {links.map(link => (
                <div key={link.ceId} className="apc-cleanse__linkrow">
                  <span className="apc-cleanse__linkicon is-ce">
                    <Icon name="file-text" size={13} />
                  </span>
                  <div>
                    <b>{link.ceCode}</b>
                    <span>{link.title}</span>
                    <small>{link.itemIds.length} {docLabel} items linked</small>
                  </div>
                  <em>HK$ {link.amount.toLocaleString('en-HK')}</em>
                </div>
              ))}
              {!links.length && (
                <div className="apc-cleanse__linkempty">No CE document linked to this {docLabel}.</div>
              )}
            </div>
            {linkedBqs.length > 0 && (
              <div className="apc-cleanse__linkgroup">
                <b>Bill of Quantity</b>
                {linkedBqs.map(record => (
                  <div key={record.code} className="apc-cleanse__linkrow">
                    <span className="apc-cleanse__linkicon is-bq">
                      <Icon name="file-spreadsheet" size={13} />
                    </span>
                    <div>
                      <b>{record.code}</b>
                      <span>{record.name}</span>
                      <small>Reference linked to this Activity Schedule.</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {linkedActivity && (
              <div className="apc-cleanse__linkgroup">
                <b>Activity Schedule</b>
                <div className="apc-cleanse__linkrow">
                  <span className="apc-cleanse__linkicon is-bq">
                    <Icon name="list-tree" size={13} />
                  </span>
                  <div>
                    <b>{linkedActivity.code}</b>
                    <span>{linkedActivity.name}</span>
                    <small>BQ reference linked to this Activity Schedule.</small>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DraggablePanel>
      )}
    </div>
  );
}
