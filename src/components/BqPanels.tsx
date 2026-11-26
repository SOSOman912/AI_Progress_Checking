import { Fragment, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ColGroup, ColResize, useColumnWidths } from './ResizeColumns';
import type { BillLine } from '../lib/demo';

const f3 = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f2 = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fq = (v: number | null | undefined, u: string) => (u === 'nr' ? String(v ?? '—') : f3(v));

const COLS = [
  { key: 'item', label: 'Item', width: 78 },
  { key: 'desc', label: 'Description', width: 250 },
  { key: 'unit', label: 'Unit', width: 52 },
  { key: 'qbim', label: 'Qty (BIM)', num: true, width: 92 },
  { key: 'qty', label: 'Qty', num: true, width: 76 },
  { key: 'rate', label: 'Rate', num: true, width: 88 },
  { key: 'ce', label: 'CE', num: true, width: 96 },
  { key: 'abim', label: 'Amount HK$ (BIM)', num: true, width: 132 },
  { key: 'amount', label: 'Amount HK$', num: true, width: 108 },
  { key: 'final', label: 'Final Amount HK$', num: true, width: 132 }
];
const MONEY_COLS = new Set(['rate', 'abim', 'amount', 'final', 'ce']);

export function filterBillLines(lines: BillLine[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return lines;
  const out: BillLine[] = [];
  let headings: BillLine[] = [];
  for (const line of lines) {
    if (line.type === 'section' || line.type === 'group' || line.type === 'note') {
      headings.push(line);
      continue;
    }
    if (line.type !== 'item') continue;
    if ((line.no || '').toLowerCase().includes(q) || line.label.toLowerCase().includes(q)) {
      out.push(...headings, line);
      headings = [];
    }
  }
  return out;
}

function EditableNumber({
  value,
  unit,
  mode,
  onCommit
}: {
  value: number | null;
  unit: string;
  mode: 'qty' | 'rate';
  onCommit: (value: number | null) => void;
}) {
  const text = mode === 'qty' ? fq(value, unit) : value == null ? '' : f2(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  const commit = () => {
    setEditing(false);
    const raw = draft.replace(/,/g, '').trim();
    if (!raw) {
      onCommit(null);
      setDraft(text);
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      setDraft(text);
      return;
    }
    onCommit(next);
  };

  return (
    <input
      className={`apc-cellinput num${editing ? ' editing' : ''}`}
      value={draft}
      placeholder="—"
      inputMode="decimal"
      onFocus={() => setEditing(true)}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    />
  );
}

export function LineBadge({ line, showMoney = true }: { line: BillLine; showMoney?: boolean }) {
  const eff = line.override ?? line.contractQty ?? line.calc ?? 0;
  return (
    <div className="apc-badge">
      <div className="t-xs t-faint">Item {line.no} · Bill 2</div>
      <h2 className="t-h2" style={{ marginTop: 2 }}>
        {line.label}
      </h2>
      <div className="apc-qty">
        <div>
          <span>Calculated</span>
          <b className="t-mono">{fq(line.calc ?? 0, line.unit || '')}</b>
        </div>
        <div>
          <span>Override</span>
          <b className="t-mono" style={{ color: line.override != null ? 'var(--amber-ink)' : 'var(--fg3)' }}>
            {line.override != null ? fq(line.override, line.unit || '') : '—'}
          </b>
        </div>
        <div>
          <span>Effective</span>
          <b className="t-mono">
            {fq(eff, line.unit || '')} <i>{line.unit}</i>
          </b>
        </div>
        {showMoney && (
          <div>
            <span>Amount HK$</span>
            <b className="t-mono" style={{ color: line.rate == null ? 'var(--fg3)' : undefined }}>
              {line.rate == null ? 'Unpriced' : f2(eff * line.rate)}
            </b>
          </div>
        )}
      </div>
      {line.reason && (
        <div className="t-xs t-muted" style={{ marginTop: 8 }}>
          <Icon name="pencil-line" size={11} style={{ verticalAlign: -1 }} /> {line.reason}
        </div>
      )}
    </div>
  );
}

export interface BqCeDetail {
  ceId?: string;
  ref: string;
  title: string;
  amount?: number;
  date?: string;
  reference?: string;
  assessed?: number;
}

export function BqTable({
  lines,
  activeLine,
  setActiveLine,
  onQtyChange,
  onRateChange,
  onInspect,
  readOnly = false,
  showMoney = true,
  showCe = false,
  ceDetails,
  onOpenCe,
  expandCe = true,
  colWidths,
  affectedIds
}: {
  lines: BillLine[];
  activeLine: string;
  setActiveLine: (id: string) => void;
  onQtyChange?: (id: string, value: number | null) => void;
  onRateChange?: (id: string, value: number | null) => void;
  onInspect?: (id: string) => void;
  readOnly?: boolean;
  showMoney?: boolean;
  showCe?: boolean;
  ceDetails?: Record<string, BqCeDetail[]>;
  onOpenCe?: (ceId: string) => void;
  expandCe?: boolean;
  colWidths?: Partial<Record<string, number>>;
  affectedIds?: { missing?: string[]; override?: string[] };
}) {
  const baseCols = showCe
    ? COLS
    : COLS.filter(c => c.key !== 'ce' && c.key !== 'final');
  const cols = showMoney ? baseCols : baseCols.filter(c => !MONEY_COLS.has(c.key));
  const { widths, start, move, end, total } = useColumnWidths(
    cols.map(c => colWidths?.[c.key] ?? c.width)
  );
  const box = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const [expandedCe, setExpandedCe] = useState('');

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setAvailable(node.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const headTotal = widths.slice(0, -1).reduce((sum, w) => sum + w, 0);
  const last = Math.max(72, Math.max(total, available) - headTotal);
  const shown = [...widths.slice(0, -1), last];
  const tableWidth = headTotal + last;

  return (
    <div className="apc-tablefill" ref={box} style={{ minWidth: total }}>
      <table className="apc-bqtable" style={{ width: tableWidth }}>
        <ColGroup widths={shown} />
        <thead>
          <tr>
            {cols.map((col, i) => (
              <th key={col.key} className={col.num ? 'num' : undefined} style={{ width: shown[i] }}>
                <span className="apc-thlabel">{col.label}</span>
                <ColResize index={i} start={index => start(index, shown[index])} move={move} end={end} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map(l => {
            if (l.type === 'section')
              return (
                <tr key={l.id} className="apc-bqtable__sec">
                  <td colSpan={cols.length}>{l.label}</td>
                </tr>
              );
            if (l.type === 'group')
              return (
                <tr key={l.id} className="apc-bqtable__grp">
                  <td className="apc-bqtable__grpname" colSpan={cols.length}>
                    {l.label}
                  </td>
                </tr>
              );
            if (l.type !== 'item') return null;
            const qty = l.override ?? l.contractQty ?? l.calc ?? 0;
            const amount = l.rate != null ? qty * l.rate : null;
            const bimQty = l.calc ?? 0;
            const bimAmount = l.rate != null ? bimQty * l.rate : null;
            const affected = affectedIds?.missing?.includes(l.id)
              ? 'missing'
              : affectedIds?.override?.includes(l.id)
                ? 'override'
                : null;
            const details = ceDetails?.[l.id] ?? [];
            const open = expandedCe === l.id;
            const ceTotal = details.reduce(
              (sum, detail) => sum + (detail.assessed ?? detail.amount ?? 0),
              0
            );
            const finalAmount = amount == null ? null : amount + ceTotal;
            return (
              <Fragment key={l.id}>
                <tr
                  className={`apc-bqtable__item${activeLine === l.id ? ' on' : ''}${affected ? ` affected affected--${affected}` : ''}`}
                  onClick={() => {
                    setActiveLine(l.id);
                    onInspect?.(l.id);
                    if (expandCe && details.length) setExpandedCe(open ? '' : l.id);
                  }}
                >
                  <td className="mono apc-bqtable__itemno" title={l.no}>
                    <span>{l.no}</span>
                  </td>
                  <td title={l.label}>{l.label}</td>
                  <td>{l.unit}</td>
                  <td className="num">{fq(bimQty, l.unit || '')}</td>
                  <td className="num">
                    {!readOnly && onQtyChange ? (
                      <EditableNumber value={qty} unit={l.unit || ''} mode="qty" onCommit={v => onQtyChange(l.id, v)} />
                    ) : (
                      fq(qty, l.unit || '')
                    )}
                  </td>
                  {showMoney && (
                    <td className="num">
                      {!readOnly && onRateChange ? (
                        <EditableNumber value={l.rate ?? null} unit={l.unit || ''} mode="rate" onCommit={v => onRateChange(l.id, v)} />
                      ) : (
                        l.rate == null ? '—' : f2(l.rate)
                      )}
                    </td>
                  )}
                  {showCe && showMoney && (
                    <td className="num" title={details.length ? 'Click the row to view linked CEs' : undefined}>
                      {details.length ? f2(ceTotal) : '—'}
                    </td>
                  )}
                  {showMoney && <td className="num">{bimAmount == null ? '—' : f2(bimAmount)}</td>}
                  {showMoney && <td className="num">{amount == null ? 'Unpriced' : f2(amount)}</td>}
                  {showMoney && (
                    <td className="num">{finalAmount == null ? 'Unpriced' : f2(finalAmount)}</td>
                  )}
                </tr>
                {showCe && expandCe && open && details.length > 0 && (
                  <tr className="apc-ce-detail apc-bq-ce-expand">
                    <td colSpan={cols.length}>
                      <div className="apc-ce-detail-card">
                        <div className="apc-ce-detail-card__head">
                          <Icon name="layout-grid" size={12} />
                          <b>CE Detail</b>
                        </div>
                        <table className="apc-ce-detail-card__table">
                          <thead>
                            <tr>
                              <th>CE No.</th>
                              <th>Description</th>
                              <th>Date</th>
                              <th>Reference</th>
                              <th className="num">Allocated Amount (HK$)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {details.map(detail => (
                              <tr
                                key={detail.ceId ?? detail.ref}
                                className={detail.ceId ? 'is-openable' : undefined}
                                onClick={() => {
                                  if (detail.ceId) onOpenCe?.(detail.ceId);
                                }}
                                title={detail.ceId ? 'Open CE AI OCR result' : undefined}
                              >
                                <td className="mono">{detail.ref}</td>
                                <td>{detail.title || 'Compensation event'}</td>
                                <td>{detail.date || '—'}</td>
                                <td>{detail.reference || '—'}</td>
                                <td className="num">{f2(detail.assessed ?? detail.amount ?? 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
