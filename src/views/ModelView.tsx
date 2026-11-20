import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import { Icon, type IconName } from '../components/Icon';
import { BqTable, filterBillLines, LineBadge } from '../components/BqPanels';
import { PanoramaView, PlanSheet, ViewWorkspace, type ElementHud, type WorkspaceView } from '../components/Tiles';
import { parseMat, type BillLine, type ElementData, type Panorama, type ProjectData, type RuleDef } from '../lib/demo';
import type { ViewportPaint } from '../three/viewport';

type ViewId = 'persp' | 'plan' | 'north' | 'east' | 'south' | 'west';

const VIEWS: Record<ViewId, WorkspaceView> = {
  persp: { id: 'persp', view: 'persp', side: 'front', label: 'Perspective', icon: 'box' },
  plan: { id: 'plan', view: 'top', side: 'front', label: 'Plan', icon: 'square-dashed' },
  north: { id: 'north', view: 'elev', side: 'front', label: 'North elevation', icon: 'panel-bottom' },
  east: { id: 'east', view: 'elev', side: 'right', label: 'East elevation', icon: 'panel-bottom' },
  south: { id: 'south', view: 'elev', side: 'back', label: 'South elevation', icon: 'panel-bottom' },
  west: { id: 'west', view: 'elev', side: 'left', label: 'West elevation', icon: 'panel-bottom' }
};

const VIEW_ORDER: ViewId[] = ['plan', 'north', 'east', 'south', 'west'];

function ViewBar({
  tiles,
  selected,
  onTiles,
  onView
}: {
  tiles: boolean;
  selected: ViewId[];
  onTiles: () => void;
  onView: (id: ViewId) => void;
}) {
  return (
    <div className="apc-viewbar" aria-label="View function bar">
      <button className={`apc-viewbtn apc-viewbtn--lead${tiles ? ' on' : ''}`} onClick={onTiles}>
        <Icon name="layout-grid" size={14} /> Tiles
      </button>
      <span className="apc-viewbar__sep" />
      {VIEW_ORDER.map(id => {
        const active = selected.includes(id);
        return (
          <button
            key={id}
            className={`apc-viewbtn${active ? ' on' : ''}`}
            disabled={!active && selected.length >= 5}
            onClick={() => onView(id)}
            title={VIEWS[id].label}
          >
            <Icon name={VIEWS[id].icon} size={13} />
            {id === 'plan' ? 'Plan' : id[0].toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

function ProjectBrowser({
  data,
  active,
  setActive,
  onOpenDrawing
}: {
  data: ProjectData;
  active: string | null;
  setActive: (id: string | null) => void;
  onOpenDrawing: (sheetId: string) => void;
}) {
  const [openFiles, setOpenFiles] = useState<Record<string, boolean>>({ f1: true, f2: false });
  const [openClasses, setOpenClasses] = useState<Record<string, boolean>>({});

  return (
    <div className="apc-side__scroll" style={{ paddingTop: 2 }}>
      <div className="t-eyebrow" style={{ padding: '10px 6px 4px' }}>
        IFC models
      </div>
      {data.files.map(f => {
        const els = data.elements.filter(e => e.file === f.id);
        const classes = [...new Set(els.map(e => e.cls))];
        return (
          <div key={f.id}>
            <button className="apc-browser__head" onClick={() => setOpenFiles(s => ({ ...s, [f.id]: !s[f.id] }))}>
              <Icon name="folder-closed" size={14} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <small className="t-mono t-faint">{f.count}</small>
              <Icon name={openFiles[f.id] ? 'chevron-down' : 'chevron-right'} size={13} style={{ color: 'var(--fg3)' }} />
            </button>
            {openFiles[f.id] && (
              <>
                {classes.map(cls => {
                  const rows = els.filter(e => e.cls === cls);
                  const key = f.id + ':' + cls;
                  const isOpen = openClasses[key] !== false;
                  return (
                    <div key={key}>
                      <button
                        className="apc-browser__sub"
                        onClick={() => setOpenClasses(s => ({ ...s, [key]: !isOpen }))}
                        style={{ paddingLeft: 18 }}
                      >
                        <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={12} style={{ color: 'var(--fg3)' }} />
                        <span style={{ flex: 1 }}>{cls.replace('Ifc', '')}</span>
                        <small>{rows.length}</small>
                      </button>
                      {isOpen &&
                        rows.map(e => (
                          <button
                            key={e.id}
                            className={`apc-row${active === e.id ? ' on' : ''}`}
                            onClick={() => setActive(e.id)}
                            style={{ paddingLeft: 34 }}
                          >
                            <Icon name="box" size={13} />
                            <span
                              style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {e.mark} · {e.name}
                            </span>
                          </button>
                        ))}
                    </div>
                  );
                })}
                {els.length === 0 && (
                  <div className="t-xs t-faint" style={{ padding: '4px 22px 8px' }}>
                    Geometry not parsed · listed from Import IFC
                  </div>
                )}
                {f.drawings.length > 0 && (
                  <>
                    <div className="t-eyebrow" style={{ padding: '10px 10px 4px 22px' }}>
                      Drawings in IFC
                    </div>
                    {f.drawings.map(did => {
                      const d = data.drawings.find(x => x.id === did);
                      if (!d) return null;
                      return (
                        <button key={did} className="apc-row" onClick={() => onOpenDrawing(did)} style={{ paddingLeft: 30 }}>
                          <Icon name="file-text" size={13} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.no} · {d.title}
                          </span>
                        </button>
                      );
                    })}
                  </>
                )}

              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function BqStrip({
  lines,
  activeLine,
  setActiveLine,
  height,
  setHeight,
  onQtyChange,
  onRateChange,
  onInspect,
  onClose,
  showMoney
}: {
  lines: BillLine[];
  activeLine: string;
  setActiveLine: (id: string) => void;
  height: number;
  setHeight: (height: number) => void;
  onQtyChange: (id: string, value: number | null) => void;
  onRateChange: (id: string, value: number | null) => void;
  onInspect: (id: string) => void;
  onClose: () => void;
  showMoney: boolean;
}) {
  const [query, setQuery] = useState('');
  const shown = filterBillLines(lines, query);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const max = Math.max(180, Math.min(620, window.innerHeight - 170));

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: height };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setHeight(clamp(drag.current.h - (e.clientY - drag.current.y), 120, max));
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <section className="apc-bqpanel" style={{ height }}>
      <div
        className="apc-bqresize"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Resize BQ panel"
      />
      <div className="apc-bqpanel__head">
        <b>Bill of quantities</b>
        <div className="apc-bqsearch">
          <Icon name="search" size={12} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search BQ items"
            aria-label="Search BQ items"
          />
        </div>
        <span style={{ flex: 1 }} />
        <button className="apc-iconbtn" onClick={onClose} aria-label="Close BQ list">
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="apc-bqpanel__scroll">
        <BqTable
          lines={shown}
          activeLine={activeLine}
          setActiveLine={setActiveLine}
          onQtyChange={onQtyChange}
          onRateChange={onRateChange}
          onInspect={onInspect}
          readOnly
          showMoney={showMoney}
          showCe
        />
      </div>
    </section>
  );
}

const fmt3 = (v: number) => v.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtQty = (v: number, unit = '') => (unit === 'nr' ? String(v) : fmt3(v));
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${fmt3(Math.abs(v))}`;
const money = (v: number | null | undefined) =>
  v == null ? 'Unpriced' : `HK$${v.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};
const pctOf = (v: number, base: number) => (base ? (v / base) * 100 : 0);
const pctSigned = (v: number, base: number) => `${v >= 0 ? '+' : '−'}${Math.abs(pctOf(v, base)).toFixed(2)}%`;

function BqDetails({
  line,
  data,
  selectedId,
  onSelect,
  onClose,
  showMoney
}: {
  line: BillLine;
  data: ProjectData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  showMoney: boolean;
}) {
  const [level, setLevel] = useState('all');
  const [zone, setZone] = useState('all');
  const [cls, setCls] = useState('all');
  const [groupsOpen, setGroupsOpen] = useState(true);
  const members = (line.members || [])
    .map(id => data.elements.find(e => e.id === id))
    .filter((e): e is ProjectData['elements'][number] => !!e);
  const contractQty = line.contractQty ?? line.override ?? line.calc ?? 0;
  const bimQty = line.calc ?? members.reduce((sum, e) => sum + e.vol, 0);
  const diff = bimQty - contractQty;
  const adjustments = line.adjustments || {};
  const rows = members.map(e => {
    const bim = line.unit === 'nr' ? 1 : e.vol;
    const adj = adjustments[e.id] || 0;
    return { e, bim, adj, accepted: bim + adj, zone: e.zone || '—', cls: e.cls.replace('Ifc', '') };
  });
  const levels = [...new Set(rows.map(r => r.e.level))];
  const zones = [...new Set(rows.map(r => r.zone))];
  const classes = [...new Set(rows.map(r => r.cls))];
  const filtered = rows.filter(
    r => (level === 'all' || r.e.level === level) && (zone === 'all' || r.zone === zone) && (cls === 'all' || r.cls === cls)
  );
  const acceptedTotal = filtered.reduce((sum, r) => sum + r.accepted, 0);
  const filteredAdjustment = filtered.reduce((sum, r) => sum + r.adj, 0);
  const certs = line.certifications || [];
  const cumulative = certs.reduce((sum, c) => sum + c.qty, 0);
  const remaining = bimQty - cumulative;
  const rule = line.rule ? data.rules[line.rule] : undefined;
  const lineIndex = data.bill.lines.findIndex(l => l.id === line.id);
  const section = [...data.bill.lines.slice(0, lineIndex)].reverse().find(l => l.type === 'section');
  const group = [...data.bill.lines.slice(0, lineIndex)].reverse().find(l => l.type === 'group');
  const sectionTitle = (section?.label || 'Measurement group').replace(/^Section\s+\d+\s+/, '');
  const measureUnit = rule?.unit || line.unit || '';
  const measureNameRaw = (rule?.title.split('—').pop() || 'Volume').trim();
  const measureName = measureNameRaw.charAt(0).toUpperCase() + measureNameRaw.slice(1);
  const measureGroups =
    section?.measureGroups?.length
      ? section.measureGroups
      : group
        ? [{ title: group.label, description: rule?.basis || '' }]
        : [];
  let running = 0;

  return (
    <aside className="apc-bqdetails" aria-label="BQ Details">
      <div className="apc-bqdetails__head">
        <Icon name="list-tree" size={13} />
        <b>BQ Details</b>
        <span style={{ flex: 1 }} />
        <button className="apc-iconbtn" onClick={onClose} aria-label="Close BQ Details">
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="apc-bqdetails__scroll">
        <div className="apc-bqdetails__title">
          <span className="t-mono">{line.no}</span>
          <h3>{line.label}</h3>
        </div>

        <div className="apc-bqdetails__sectionhead">
          <span>1</span>
          <b>BQ and valuation summary</b>
        </div>
        <div className="apc-tablescroll">
          <table className="apc-grid apc-bqdetails__summary">
          <tbody>
            <tr>
              <th>BQ item</th>
              <td>{line.label}</td>
            </tr>
            <tr>
              <th>Contract BQ qty</th>
              <td className="num">
                {fmtQty(contractQty, line.unit)} <i>{line.unit}</i>
              </td>
            </tr>
            {showMoney && (
              <>
                <tr>
                  <th>Contract rate</th>
                  <td className="num">
                    {line.rate == null ? 'Unpriced' : `${money(line.rate)} / ${line.unit}`}
                  </td>
                </tr>
                <tr>
                  <th>Contract BQ amount</th>
                  <td className="num">{line.rate == null ? 'Unpriced' : money(contractQty * line.rate)}</td>
                </tr>
              </>
            )}
            <tr>
              <th>BIM corresponding qty</th>
              <td className="num">
                {fmtQty(bimQty, line.unit)} <i>{line.unit}</i>
              </td>
            </tr>
            <tr>
              <th>BIM vs BQ difference</th>
              <td className={`num ${diff >= 0 ? 'pos' : 'neg'}`}>
                {signed(diff)} {line.unit}
                <em>{pctSigned(diff, contractQty)}</em>
              </td>
            </tr>
            <tr className="apc-bqdetails__bands">
              <th>Cumulative verified</th>
              <td className="num">
                {fmtQty(cumulative, line.unit)} {line.unit}
                <em>{pctOf(cumulative, bimQty).toFixed(2)}%</em>
              </td>
            </tr>
            {showMoney && (
              <tr>
                <th>Cumulative certified amount</th>
                <td className="num">{line.rate == null ? 'Unpriced' : money(cumulative * line.rate)}</td>
              </tr>
            )}
          </tbody>
          </table>
        </div>

        <div className="apc-bqdetails__sectionhead">
          <span>2</span>
          <b>BQ basis and BIM mapping</b>
        </div>
        <div className="apc-bqdetails__subhead">A. BQ original and measurement basis</div>
        <div className="apc-tablescroll">
          <div className="apc-measuregroups">
            <button
              type="button"
              className="apc-measuregroups__head"
              onClick={() => setGroupsOpen(open => !open)}
              aria-expanded={groupsOpen}
            >
              <Icon name={groupsOpen ? 'chevron-down' : 'chevron-right'} size={13} />
              <b>{sectionTitle}</b>
            </button>
            {groupsOpen && (
              <div className="apc-measuregroups__body">
                <div className="apc-measuregroups__unit">
                  Measurement unit: <b>{measureUnit}</b>
                  <span> · {measureName}</span>
                </div>
                {measureGroups.map((g, i) => (
                  <div className="apc-measuregroups__group" key={g.title}>
                    <b>
                      Group {i + 1}. {g.title}
                    </b>
                    <span>{g.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="apc-tablescroll">
          <table className="apc-grid apc-bqdetails__basis">
          <tbody>
            <tr>
              <th>Measurement rule</th>
              <td>{rule?.ref || 'No linked measurement rule'}</td>
            </tr>
            <tr>
              <th>Basis</th>
              <td>{rule?.basis || 'Measured from the BQ item description.'}</td>
            </tr>
            <tr>
              <th>Source</th>
              <td>{rule?.source || 'BIM quantities from the linked model.'}</td>
            </tr>
            <tr>
              <th>Rounding</th>
              <td>{rule?.rounding || 'Per BQ measurement rules.'}</td>
            </tr>
          </tbody>
        </table>
        </div>
        <div className="apc-tablescroll">
          <table className="apc-grid apc-bqdetails__scope">
          <thead>
            <tr className="apc-bqdetails__grouphead">
              <th colSpan={2}>Including</th>
            </tr>
          </thead>
          <tbody>
            {[rule?.basis || 'Work described in the BQ item', 'Curing and protection'].map((item, i) => (
              <tr key={item}>
                <td className="mono">{i + 1}</td>
                <td>{item}</td>
              </tr>
            ))}
          </tbody>
          <thead>
            <tr className="apc-bqdetails__grouphead">
              <th colSpan={2}>Excluding</th>
            </tr>
          </thead>
          <tbody>
            {rule?.deductions.length ? (
              rule.deductions.map((d, i) => (
                <tr key={d.t}>
                  <td className="mono">{i + 1}</td>
                  <td>
                    {d.t} — {d.d}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2}>No exclusions recorded.</td>
              </tr>
            )}
          </tbody>
          </table>
        </div>

        <div className="apc-bqdetails__subhead">B. BIM mapping and quantity detail</div>
        <div className="apc-bqdetails__filters">
          <label>
            Level
            <select value={level} onChange={e => setLevel(e.target.value)}>
              <option value="all">All</option>
              {levels.map(v => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zone
            <select value={zone} onChange={e => setZone(e.target.value)}>
              <option value="all">All</option>
              {zones.map(v => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={cls} onChange={e => setCls(e.target.value)}>
              <option value="all">All</option>
              {classes.map(v => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        {filtered.length ? (
          <div className="apc-tablescroll">
            <table className="apc-grid apc-bqdetails__grid">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Location</th>
                  <th>IFC type</th>
                  <th className="num">BIM qty</th>
                  <th className="num">Adjust</th>
                  <th className="num">Accepted</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr
                    key={r.e.id}
                    className={`apc-bqdetails__clickrow${selectedId === r.e.id ? ' on' : ''}`}
                    onClick={() => onSelect(r.e.id)}
                  >
                    <td>
                      <b>{r.e.mark}</b>
                      <span>{r.e.name}</span>
                    </td>
                    <td>
                      {r.e.level}
                      <span>{r.zone}</span>
                    </td>
                    <td>{r.e.cls}</td>
                    <td className="num">{line.unit === 'nr' ? '1' : fmt3(r.bim)}</td>
                    <td className="num">{r.adj ? signed(r.adj) : '—'}</td>
                    <td className="num">{line.unit === 'nr' ? '1' : fmt3(r.accepted)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    {filtered.length} of {rows.length} elements
                  </td>
                  <td className="num">
                    {line.unit === 'nr' ? filtered.length : fmt3(filtered.reduce((s, r) => s + r.bim, 0))}
                  </td>
                  <td className="num">{filteredAdjustment ? signed(filteredAdjustment) : '—'}</td>
                  <td className="num">{line.unit === 'nr' ? filtered.length : fmt3(acceptedTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="apc-bqdetails__empty">No mapped BIM elements match these filters.</div>
        )}

        <div className="apc-bqdetails__sectionhead">
          <span>3</span>
          <b>Period quantity verification</b>
        </div>
        {certs.length ? (
          <div className="apc-tablescroll">
            <table className="apc-grid apc-bqdetails__grid apc-bqdetails__payments">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Date</th>
                  <th className="num">Certified ({line.unit})</th>
                  <th className="num">% of QTY(BIM)</th>
                  <th className="num">Cumulative ({line.unit})</th>
                  <th className="num">Cum. %</th>
                </tr>
              </thead>
              <tbody>
                {certs.map(c => {
                  running += c.qty;
                  return (
                    <tr key={c.period}>
                      <td>{c.period}</td>
                      <td className="nowrap">{fmtDate(c.date)}</td>
                      <td className="num">{fmtQty(c.qty, line.unit)}</td>
                      <td className="num">{pctOf(c.qty, bimQty).toFixed(2)}%</td>
                      <td className="num">{fmtQty(running, line.unit)}</td>
                      <td className="num">{pctOf(running, bimQty).toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="apc-bqdetails__totals">
                  <td colSpan={4}>Cumulative completed</td>
                  <td className="num">{fmtQty(cumulative, line.unit)}</td>
                  <td className="num">{pctOf(cumulative, bimQty).toFixed(2)}%</td>
                </tr>
                <tr className="apc-bqdetails__totals">
                  <td colSpan={4}>Remaining</td>
                  <td className="num">{fmtQty(remaining, line.unit)}</td>
                  <td className="num">{pctOf(remaining, bimQty).toFixed(2)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="apc-bqdetails__empty">No interim payment certificates recorded.</div>
        )}
      </div>
    </aside>
  );
}

interface DockItem {
  key: string;
  node: ReactNode;
}

function DockStack({
  items,
  width,
  onWidth,
  side = 'right',
  initialWeights,
  minWidthPx = 0
}: {
  items: DockItem[];
  width: number | null;
  onWidth: (width: number) => void;
  side?: 'left' | 'right';
  initialWeights?: number[];
  minWidthPx?: number;
}) {
  const keySig = items.map(i => i.key).join('|');
  const defaults = () => items.map((_, i) => initialWeights?.[i] ?? (i === 0 ? 1.5 : 1));
  const [weights, setWeights] = useState<number[]>(defaults);
  const stack = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; y: number; weights: number[]; total: number; height: number } | null>(null);
  const widthDrag = useRef<{ x: number; width: number; min: number; max: number } | null>(null);
  const minWidth = useRef(0);

  useEffect(() => {
    setWeights(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig]);

  const down = (i: number, e: ReactPointerEvent<HTMLDivElement>) => {
    if (!stack.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      i,
      y: e.clientY,
      weights: [...weights],
      total: weights.reduce((sum, w) => sum + w, 0),
      height: Math.max(1, stack.current.clientHeight)
    };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const delta = ((e.clientY - d.y) / d.height) * d.total;
    const min = 0.32;
    let a = d.weights[d.i] + delta;
    let b = d.weights[d.i + 1] - delta;
    if (a < min) {
      b -= min - a;
      a = min;
    }
    if (b < min) {
      a -= min - b;
      b = min;
    }
    const next = [...d.weights];
    next[d.i] = a;
    next[d.i + 1] = b;
    setWeights(next);
  };
  const up = () => {
    drag.current = null;
  };

  const widthDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const node = stack.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const current = node.getBoundingClientRect().width;
    if (!minWidth.current) minWidth.current = current;
    widthDrag.current = {
      x: e.clientX,
      width: current,
      min: minWidthPx > 0 ? minWidthPx : minWidth.current,
      max: Math.max(minWidthPx > 0 ? minWidthPx : minWidth.current, parent.clientWidth - 320)
    };
  };
  const widthMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = widthDrag.current;
    if (!d) return;
    const delta = e.clientX - d.x;
    const next = side === 'left' ? d.width + delta : d.width - delta;
    onWidth(Math.min(d.max, Math.max(d.min, next)));
  };
  const widthUp = () => {
    widthDrag.current = null;
  };

  return (
    <div className={`apc-dock apc-dock--${side}`} ref={stack} style={width ? { width } : undefined}>
      <div
        className="apc-dockwidth"
        onPointerDown={widthDown}
        onPointerMove={widthMove}
        onPointerUp={widthUp}
        onPointerCancel={widthUp}
        aria-label={`Resize ${side} dock width`}
      />
      {items.map((item, i) => (
        <Fragment key={item.key}>
          <div className="apc-dockslot" style={{ flexGrow: weights[i] ?? 1 }}>
            {item.node}
          </div>
          {i < items.length - 1 && (
            <div
              className="apc-dockresize"
              onPointerDown={e => down(i, e)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              aria-label={`Resize ${item.key} panel`}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

let floatZ = 20;

function FloatingWindow({
  title,
  icon,
  onClose,
  bottom,
  children,
  align = 'right',
  docked = false,
  onDock,
  onUndock,
  onSnapHint,
  width: initialW = 460,
  height: initialH = 340,
  minW = 320,
  minH = 240,
  maxW = 900,
  maxH = 700
}: {
  title: string;
  icon: IconName;
  onClose: () => void;
  bottom: number;
  children: ReactNode;
  align?: 'left' | 'right';
  docked?: boolean;
  onDock?: () => void;
  onUndock?: () => void;
  onSnapHint?: (on: boolean) => void;
  width?: number;
  height?: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}) {
  const [w, setW] = useState(initialW);
  const [h, setH] = useState(initialH);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [snapped, setSnapped] = useState(false);
  const pop = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const node = pop.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const ro = new ResizeObserver(() => {
      setPos(p =>
        p
          ? {
              x: clamp(p.x, 0, Math.max(0, parent.clientWidth - w)),
              y: clamp(p.y, 0, Math.max(0, parent.clientHeight - h))
            }
          : p
      );
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [w, h]);
  const moveDrag = useRef<{ x: number; y: number; left: number; top: number; dock: boolean } | null>(null);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, w, h };
    setSnapped(false);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setW(clamp(drag.current.w + (e.clientX - drag.current.x), minW, maxW));
    setH(clamp(drag.current.h + (e.clientY - drag.current.y), minH, maxH));
  };
  const up = () => {
    drag.current = null;
  };

  const headDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (docked || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const parent = pop.current?.parentElement;
    if (!parent || !pop.current) return;
    const pr = parent.getBoundingClientRect();
    const r = pop.current.getBoundingClientRect();
    const left = r.left - pr.left;
    const top = r.top - pr.top;
    setPos({ x: left, y: top });
    setSnapped(false);
    onSnapHint?.(false);
    moveDrag.current = { x: e.clientX, y: e.clientY, left, top, dock: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const headMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = moveDrag.current;
    const parent = pop.current?.parentElement;
    if (!d || !parent) return;
    const maxX = Math.max(0, parent.clientWidth - w);
    const maxY = Math.max(0, parent.clientHeight - h);
    const rawX = d.left + e.clientX - d.x;
    const rawY = d.top + e.clientY - d.y;
    const edge = 20;
    const dock = !!onDock && rawX >= maxX - edge;
    if (d.dock !== dock) onSnapHint?.(dock);
    d.dock = dock;
    setSnapped(dock);
    setPos({ x: dock ? maxX : clamp(rawX, 0, maxX), y: clamp(rawY, 0, maxY) });
  };
  const headUp = () => {
    onSnapHint?.(false);
    if (moveDrag.current?.dock) onDock?.();
    moveDrag.current = null;
  };

  return (
    <section
      ref={pop}
      className={`apc-drawingpop${snapped ? ' snapped' : ''}${docked ? ' docked' : ''}`}
      onPointerDown={() => {
        if (docked) return;
        floatZ += 1;
        if (pop.current) pop.current.style.zIndex = String(floatZ);
      }}
      style={
        docked
          ? undefined
          : pos
            ? { width: w, height: h, left: pos.x, top: pos.y, right: 'auto' }
            : align === 'left'
              ? { width: w, height: h, left: 16, bottom, right: 'auto' }
              : { width: w, height: h, bottom }
      }
    >
      <div
        className="apc-drawingpop__head"
        onPointerDown={headDown}
        onPointerMove={headMove}
        onPointerUp={headUp}
        onPointerCancel={headUp}
      >
        <Icon name={icon} size={13} />
        <b>{title}</b>
        <span style={{ flex: 1 }} />
        {docked && onUndock && (
          <button className="apc-iconbtn" onClick={onUndock} aria-label={'Float ' + title}>
            <Icon name="maximize-2" size={13} />
          </button>
        )}
        <button className="apc-iconbtn" onClick={onClose} aria-label={'Close ' + title}>
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="apc-drawingpop__body">{children}</div>
      {!docked && (
        <div
          className="apc-resize"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label={'Resize ' + title}
        />
      )}
    </section>
  );
}

function DrawingPopup({
  data,
  sheetId,
  paint,
  onPick,
  onClose,
  bottom,
  docked,
  onDock,
  onUndock,
  onSnapHint
}: {
  data: ProjectData;
  sheetId: string;
  paint: ViewportPaint;
  onPick: (id: string) => void;
  onClose: () => void;
  bottom: number;
  docked?: boolean;
  onDock?: () => void;
  onUndock?: () => void;
  onSnapHint?: (on: boolean) => void;
}) {
  const sheet = data.drawings.find(d => d.id === sheetId) || data.drawings[0];
  return (
    <FloatingWindow
      title={`${sheet.no} · ${sheet.title}`}
      icon="file-text"
      onClose={onClose}
      bottom={bottom}
      docked={docked}
      onDock={onDock}
      onUndock={onUndock}
      onSnapHint={onSnapHint}
    >
      <PlanSheet
        data={data}
        sheetId={sheetId}
        paint={paint}
        onPick={onPick}
        tool="select"
        resetMeasure={0}
        resetView={0}
      />
    </FloatingWindow>
  );
}

function PanoPopup({
  pano,
  onClose,
  bottom,
  docked,
  onDock,
  onUndock,
  onSnapHint
}: {
  pano: Panorama;
  onClose: () => void;
  bottom: number;
  docked?: boolean;
  onDock?: () => void;
  onUndock?: () => void;
  onSnapHint?: (on: boolean) => void;
}) {
  return (
    <FloatingWindow
      title={`${pano.no} · ${pano.title}`}
      icon="image"
      onClose={onClose}
      bottom={bottom}
      align="left"
      docked={docked}
      onDock={onDock}
      onUndock={onUndock}
      onSnapHint={onSnapHint}
      width={540}
      height={380}
      minW={360}
      minH={260}
      maxW={1000}
      maxH={760}
    >
      <PanoramaView pano={pano} />
    </FloatingWindow>
  );
}

function BadgePopup({ line, onClose, showMoney }: { line: BillLine; onClose: () => void; showMoney: boolean }) {
  const [w, setW] = useState(380);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setW(clamp(drag.current.w + (e.clientX - drag.current.x), 320, 560));
  };
  const up = () => {
    drag.current = null;
  };
  return (
    <section className="apc-floatpop apc-floatpop--badge" style={{ width: w }}>
      <div className="apc-floatpop__head">
        <b>BQ line</b>
        <span style={{ flex: 1 }} />
        <button className="apc-iconbtn" onClick={onClose} aria-label="Close BQ line badge">
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="apc-floatpop__body">
        <LineBadge line={line} showMoney={showMoney} />
      </div>
      <div
        className="apc-wresize"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Resize BQ line badge"
      />
    </section>
  );
}

function ElementProperties({
  el,
  line,
  rule,
  onClose
}: {
  el: ElementData | null;
  line?: BillLine;
  rule?: RuleDef;
  onClose: () => void;
}) {
  if (!el) {
    return (
      <aside className="apc-props" aria-label="Element properties">
        <div className="apc-props__head">
          <Icon name="list-tree" size={13} />
          <b>Properties</b>
          <span style={{ flex: 1 }} />
          <button className="apc-iconbtn" onClick={onClose} aria-label="Close properties">
            <Icon name="x" size={13} />
          </button>
        </div>
        <div className="apc-props__empty">Select Element to View Properties</div>
      </aside>
    );
  }
  const p = el.props;
  const grade = p?.grade ?? parseMat(el.mat).grade ?? '—';
  const deduction = p?.deduction ?? -el.openings;
  const net = p?.netConcrete ?? el.net;
  const formwork = p?.formwork ?? 2 * (el.box[3] + el.box[5]) * el.box[4];
  const rebar = p?.rebar ?? 0;
  const isNumber = line?.unit === 'nr';
  const [L, H, W] = [el.box[3], el.box[4], el.box[5]];
  const formula = isNumber ? 'Number = count of matching elements' : 'Volume = length × width × height';
  const calculation = isNumber
    ? '1 nr'
    : `${L.toFixed(3)} × ${W.toFixed(3)} × ${H.toFixed(3)} = ${(L * W * H).toFixed(3)} m³`;
  return (
    <aside className="apc-props" aria-label="Element properties">
      <div className="apc-props__head">
        <Icon name="list-tree" size={13} />
        <b>Properties</b>
        <span style={{ flex: 1 }} />
        <button className="apc-iconbtn" onClick={onClose} aria-label="Close properties">
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="apc-props__scroll">
        <div className="apc-props__title">
          <span>{el.mark}</span>
          <h3>{el.name}</h3>
        </div>
        <div className="apc-bqdetails__subhead">Document &amp; Contract Context</div>
        <div className="apc-tablescroll">
          <table className="apc-grid apc-props__table">
            <tbody>
              <tr>
                <th>Project Code</th>
                <td>{p?.projectCode ?? 'BK-KT-2026-01'}</td>
              </tr>
              <tr>
                <th>上家 / 下家</th>
                <td>{p?.role ?? '下家 (Subcontractor)'}</td>
              </tr>
              <tr>
                <th>Vendor 公司</th>
                <td>{p?.vendor ?? '泰昌結構混凝土工程有限公司 (Tai Cheong RC Subcontractor - 下家)'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="apc-bqdetails__subhead">CIC / Cleanse BIM 屬性</div>
        <div className="apc-tablescroll">
          <table className="apc-grid apc-props__table">
            <tbody>
              <tr>
                <th>GlobalId</th>
                <td className="mono">{p?.globalId ?? el.gid}</td>
              </tr>
              <tr>
                <th>Storey / Zone</th>
                <td>
                  {p?.storey ?? el.level} / {p?.zone ?? el.zone ?? '—'}
                </td>
              </tr>
              <tr>
                <th>Concrete Grade</th>
                <td>{grade}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="apc-bqdetails__subhead">SMM 算量快照 (BUILDING)</div>
        <div className="apc-tablescroll">
          <table className="apc-grid apc-props__table">
            <tbody>
              <tr>
                <th>開孔 + 交接扣減</th>
                <td className="num">
                  {deduction < 0 ? '−' : ''}
                  {Math.abs(deduction).toFixed(3)} m³
                </td>
              </tr>
              <tr>
                <th>混凝土合約淨量</th>
                <td className="num">{net.toFixed(3)} m³</td>
              </tr>
              <tr>
                <th>模板淨接觸面</th>
                <td className="num">{formwork.toFixed(3)} m²</td>
              </tr>
              <tr>
                <th>BBS 鋼筋總重</th>
                <td className="num">{rebar.toFixed(3)} t</td>
              </tr>
              <tr>
                <th>IP11 申報 / P1 核實</th>
                <td>{p?.ip11 ?? '100% / 100%'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="apc-bqdetails__subhead">Measurement basis (SMM)</div>
        <div className="apc-tablescroll">
          <table className="apc-grid apc-props__table">
            <tbody>
              <tr>
                <th>SMM reference</th>
                <td>{rule?.ref ?? 'HKCESMM 2011 · Section 12'}</td>
              </tr>
              <tr>
                <th>Measurement basis</th>
                <td>{rule?.basis ?? (isNumber ? 'Number of units' : 'Volume of concrete placed')}</td>
              </tr>
              <tr>
                <th>Formula</th>
                <td>{formula}</td>
              </tr>
              <tr>
                <th>Calculation</th>
                <td className="mono">{calculation}</td>
              </tr>
              {!isNumber && (
                <>
                  <tr>
                    <th>Less openings</th>
                    <td className="num">
                      {deduction < 0 ? '−' : ''}
                      {Math.abs(deduction).toFixed(3)} m³
                    </td>
                  </tr>
                  <tr>
                    <th>Net volume</th>
                    <td className="num">{net.toFixed(3)} m³</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </aside>
  );
}

export function ModelView({
  data,
  active,
  setActive,
  activeLine,
  setActiveLine,
  showBrowser,
  onCloseBrowser,
  showTools,
  showBqList,
  onHideBqList,
  showBadge,
  onCloseBadge,
  showProps,
  onCloseProps,
  infoLine,
  setInfoLine,
  showPano,
  onShowProps,
  drawingSheet,
  onOpenDrawing,
  onCloseDrawing,
  onQtyChange,
  onRateChange,
  showMoney
}: {
  data: ProjectData;
  active: string | null;
  setActive: (id: string | null) => void;
  activeLine: string;
  setActiveLine: (id: string) => void;
  showBrowser: boolean;
  onCloseBrowser: () => void;
  showTools: boolean;
  showBqList: boolean;
  onHideBqList: () => void;
  showBadge: boolean;
  onCloseBadge: () => void;
  showProps: boolean;
  onCloseProps: () => void;
  infoLine: string | null;
  setInfoLine: (id: string | null) => void;
  showPano: boolean;
  onShowProps: () => void;
  drawingSheet: string | null;
  onOpenDrawing: (sheetId: string) => void;
  onCloseDrawing: () => void;
  onQtyChange: (id: string, value: number | null) => void;
  onRateChange: (id: string, value: number | null) => void;
  showMoney: boolean;
}) {
  const [bqHeight, setBqHeight] = useState(190);
  const [dockWidth, setDockWidth] = useState<number | null>(null);
  const [browserWidth, setBrowserWidth] = useState<number | null>(null);
  const [tiles, setTiles] = useState(false);
  const [selectedViews, setSelectedViews] = useState<ViewId[]>([]);
  const [panoId, setPanoId] = useState<string | null>(null);
  const [drawingDocked, setDrawingDocked] = useState(false);
  const [panoDocked, setPanoDocked] = useState(false);
  const [snapHint, setSnapHint] = useState<'drawing' | 'pano' | null>(null);
  const pano = data.panoramas.find(p => p.id === panoId);
  const dockCount =
    Number(!!drawingSheet && drawingDocked) + Number(!!showPano && !!pano && panoDocked);
  const showDetails = showBqList && !!infoLine;
  const rightDock = dockCount > 0 || showDetails;
  const toggleInfo = (id: string) => setInfoLine(infoLine === id ? null : id);

  useEffect(() => {
    if (showPano) {
      setPanoId(id => id ?? data.panoramas[0]?.id ?? null);
      setPanoDocked(true);
    } else {
      setPanoDocked(false);
      setPanoId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPano]);
  useEffect(() => {
    setDrawingDocked(!!drawingSheet);
  }, [drawingSheet]);
  useEffect(() => {
    if (!showBqList) setInfoLine(null);
  }, [showBqList]);
  const views: WorkspaceView[] = tiles
    ? [VIEWS.persp, ...VIEW_ORDER.filter(id => selectedViews.includes(id)).map(id => VIEWS[id])]
    : [VIEWS.persp];
  const toggleTiles = () => {
    if (!tiles) {
      setTiles(true);
      if (selectedViews.length === 0) setSelectedViews(['plan']);
    } else {
      setTiles(false);
      setSelectedViews([]);
    }
  };
  const toggleView = (id: ViewId) => {
    if (!tiles) {
      setTiles(true);
      if (!selectedViews.includes(id)) setSelectedViews([...selectedViews, id]);
      return;
    }
    if (selectedViews.includes(id)) {
      const next = selectedViews.filter(v => v !== id);
      setSelectedViews(next);
      if (next.length === 0) setTiles(false);
      return;
    }
    if (selectedViews.length >= 5) return;
    setSelectedViews([...selectedViews, id]);
  };
  const align2D = () => {
    setTiles(true);
    setSelectedViews(v => (v.includes('plan') ? v : [...v, 'plan']));
  };
  const items = data.bill.lines.filter(l => l.type === 'item');
  const line = items.find(l => l.id === activeLine);
  const inspect = items.find(l => l.id === infoLine);
  const lineOf = (id: string) => items.find(l => (l.members || []).includes(id));
  const elsel = data.elements.find(e => e.id === active);
  const elLine = elsel ? lineOf(elsel.id) : undefined;
  const elRule = elLine?.rule ? data.rules[elLine.rule] : undefined;
  const hud: ElementHud | null = elsel
    ? (() => {
        const amount =
          showMoney && elLine?.rate != null
            ? (elLine.unit === 'nr' ? elLine.rate : elsel.vol * elLine.rate)
            : null;
        const bqIds = items
          .filter(l => (l.members || []).includes(elsel.id))
          .map(l => l.no)
          .filter((no): no is string => !!no);
        return {
          id: elsel.id,
          mark: elsel.mark,
          center: [elsel.box[0], elsel.box[1], elsel.box[2]],
          size: [elsel.box[3], elsel.box[4], elsel.box[5]],
          volume: elsel.vol,
          amount,
          bqIds
        };
      })()
    : null;

  const paint: ViewportPaint = {
    sel: active,
    members: line?.members || [],
    missing: line?.missingIds || [],
    checked: [],
    flags: true
  };

  return (
    <>
      {showBrowser && (
        <DockStack
          side="left"
          width={browserWidth ?? 272}
          onWidth={setBrowserWidth}
          initialWeights={[1.15, 1]}
          items={
            [
              ...(showProps
                ? [
                    {
                      key: 'props',
                      node: (
                        <ElementProperties
                          el={elsel ?? null}
                          line={elLine}
                          rule={elRule}
                          onClose={onCloseProps}
                        />
                      )
                    }
                  ]
                : []),
              {
                key: 'browser',
                node: (
                  <aside className="apc-browserpanel">
                    <div className="apc-panelhead">
                      <b>Project Browser</b>
                      <span style={{ flex: 1 }} />
                      <button className="apc-iconbtn" onClick={onCloseBrowser} aria-label="Close Project Browser">
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                    <ProjectBrowser data={data} active={active} setActive={setActive} onOpenDrawing={onOpenDrawing} />
                  </aside>
                )
              }
            ] as DockItem[]
          }
        />
      )}

      <div className={`apc-work apc-work--single${rightDock ? ' has-dock' : ''}`}>
        <div className="apc-canvasrow">
          <div className="apc-viewpane">
            <ViewWorkspace
              data={data}
              paint={paint}
              onPick={id => setActive(id)}
              onShowProps={onShowProps}
              onAlign2D={align2D}
              onClearSelection={() => setActive(null)}
              showTools={showTools}
              bottomInset={0}
              views={views}
              isolateIds={showDetails && inspect ? inspect.members || [] : null}
              hud={hud}
            />
            <ViewBar tiles={tiles} selected={selectedViews} onTiles={toggleTiles} onView={toggleView} />
            {drawingSheet && !drawingDocked && (
              <DrawingPopup
                data={data}
                sheetId={drawingSheet}
                paint={paint}
                onPick={id => setActive(id)}
                onClose={onCloseDrawing}
                onDock={() => setDrawingDocked(true)}
                onSnapHint={on => setSnapHint(on ? 'drawing' : null)}
                bottom={12}
              />
            )}
            {showPano && pano && !panoDocked && (
              <PanoPopup
                pano={pano}
                onClose={() => setPanoId(null)}
                onDock={() => setPanoDocked(true)}
                onSnapHint={on => setSnapHint(on ? 'pano' : null)}
                bottom={12}
              />
            )}
            {showBadge && line && <BadgePopup line={line} onClose={onCloseBadge} showMoney={showMoney} />}
          </div>
          {rightDock && (
            <DockStack
              width={dockWidth}
              onWidth={setDockWidth}
              minWidthPx={460}
              items={
                [
                  ...(showDetails && inspect
                    ? [
                        {
                          key: 'bq',
                          node: (
                            <BqDetails
                              line={inspect}
                              data={data}
                              selectedId={active}
                              onSelect={id => setActive(id)}
                              onClose={() => setInfoLine(null)}
                              showMoney={showMoney}
                            />
                          )
                        }
                      ]
                    : []),
                  ...(showPano && pano && panoDocked
                    ? [
                        {
                          key: 'pano',
                          node: (
                            <PanoPopup
                              pano={pano}
                              docked
                              onDock={() => setPanoDocked(true)}
                              onUndock={() => setPanoDocked(false)}
                              onClose={() => {
                                setPanoDocked(false);
                                setPanoId(null);
                              }}
                              bottom={0}
                            />
                          )
                        }
                      ]
                    : []),
                  ...(drawingSheet && drawingDocked
                    ? [
                        {
                          key: 'drawing',
                          node: (
                            <DrawingPopup
                              data={data}
                              sheetId={drawingSheet}
                              paint={paint}
                              onPick={id => setActive(id)}
                              docked
                              onDock={() => setDrawingDocked(true)}
                              onUndock={() => setDrawingDocked(false)}
                              onClose={() => {
                                setDrawingDocked(false);
                                onCloseDrawing();
                              }}
                              bottom={0}
                            />
                          )
                        }
                      ]
                    : [])
                ] as DockItem[]
              }
            />
          )}
          {snapHint && dockCount < 2 && (
            <div
              className="apc-dockpreview"
              style={
                dockCount === 0
                  ? undefined
                  : panoDocked
                    ? { top: '50%', bottom: 0, height: 'auto' }
                    : { top: 0, height: '50%' }
              }
            />
          )}
        </div>
        {showBqList && (
          <BqStrip
            lines={data.bill.lines}
            activeLine={activeLine}
            setActiveLine={setActiveLine}
            height={bqHeight}
            setHeight={setBqHeight}
            onQtyChange={onQtyChange}
            onRateChange={onRateChange}
            onInspect={toggleInfo}
            onClose={onHideBqList}
            showMoney={showMoney}
          />
        )}
      </div>
    </>
  );
}
