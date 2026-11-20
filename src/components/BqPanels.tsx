import { useEffect, useRef, useState } from 'react';
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
  { key: 'abim', label: 'Amount HK$ (BIM)', num: true, width: 132 },
  { key: 'amount', label: 'Amount HK$', num: true, width: 108 },
  { key: 'ce', label: 'CE', num: true, width: 96 }
];
const MONEY_COLS = new Set(['rate', 'abim', 'amount', 'ce']);

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
  affectedIds?: { missing?: string[]; override?: string[] };
}) {
  const baseCols = showCe ? COLS : COLS.filter(c => c.key !== 'ce');
  const cols = showMoney ? baseCols : baseCols.filter(c => !MONEY_COLS.has(c.key));
  const { widths, start, move, end, total } = useColumnWidths(cols.map(c => c.width));
  const box = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

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
                  <td colSpan={cols.length}>{l.label}</td>
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
            return (
              <tr
                key={l.id}
                className={`apc-bqtable__item${activeLine === l.id ? ' on' : ''}${affected ? ` affected affected--${affected}` : ''}`}
                onClick={() => {
                  setActiveLine(l.id);
                  onInspect?.(l.id);
                }}
              >
                <td className="mono" title={l.no}>
                  {l.no}
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
                {showMoney && <td className="num">{bimAmount == null ? '—' : f2(bimAmount)}</td>}
                {showMoney && <td className="num">{amount == null ? 'Unpriced' : f2(amount)}</td>}
                {showCe && showMoney && <td className="num">{f2(l.ce)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
