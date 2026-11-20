import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Button, Eyebrow, Seg } from './primitives';
import { ColGroup, ColResize, useColumnWidths } from './ResizeColumns';
import { Hint } from './Hint';
import { parseMat, type BillLine, type ElementData, type EvaluatedLine, type ProjectData, type RuleDef } from '../lib/demo';

const f3 = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-HK', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const f2 = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fq = (v: number | null | undefined, u: string) => (u === 'nr' ? String(v ?? '—') : f3(v));

function RailSection({
  title,
  right,
  children,
  open: initial = true
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="apc-rs">
      <button className="apc-rs__head" onClick={() => setOpen(!open)}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} style={{ color: 'var(--fg3)' }} />
        <span>{title}</span>
        <span style={{ flex: 1 }} />
        {right}
      </button>
      {open && <div className="apc-rs__body">{children}</div>}
    </section>
  );
}

function RuleTrace({
  line,
  rule,
  evald,
  sel,
  setSel
}: {
  line: BillLine;
  rule: RuleDef;
  evald: EvaluatedLine;
  sel: string | null;
  setSel: (id: string) => void;
}) {
  const { members, missing, excluded } = evald;
  const vol = line.unit !== 'nr';
  const { widths, start, move, end } = useColumnWidths([260, 120, 100]);
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
  const base = vol ? widths : [widths[0], widths[2]];
  const headTotal = base.slice(0, -1).reduce((sum, w) => sum + w, 0);
  const last = Math.max(64, Math.max(base.reduce((sum, w) => sum + w, 0), available) - headTotal);
  const colWidths = [...base.slice(0, -1), last];
  const total = headTotal + last;
  return (
    <>
      <div className="apc-rule">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="t-mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue-600)' }}>
            {rule.id}
          </span>
          <span className="t-xs t-faint">
            v{rule.version}
            {rule.draft ? ' · draft' : ''}
          </span>
          <span style={{ flex: 1 }} />
          <span className="t-xs t-faint" style={{ whiteSpace: 'nowrap' }}>
            CESMM §12
          </span>
        </div>
        <div className="apc-formula">
          {vol ? (
            <>
              Σ <i>GrossVolume</i>(e)
            </>
          ) : (
            <>count(e)</>
          )}
          <span className="t-faint"> for e ∈ </span>
          {line.filter?.cls}
          <span className="t-faint"> where </span>
          {line.filter?.grade ? (
            <>
              Grade = {line.filter.grade} ∧ Cement = {line.filter.cement}
            </>
          ) : (
            <>Type = {line.filter?.ptype}</>
          )}
        </div>
        <dl className="apc-dl">
          <dt>Basis</dt>
          <dd>{rule.basis}</dd>
          <dt>Source</dt>
          <dd>{rule.source}</dd>
          {rule.extract.map(x => (
            <Fragment key={x.slot}>
              <dt>{x.slot}</dt>
              <dd>
                <span className="t-mono" style={{ fontSize: 11 }}>
                  {x.attr} ~ /{x.regex}/
                </span>
              </dd>
            </Fragment>
          ))}
          {rule.deductions.map(d => (
            <Fragment key={d.t}>
              <dt>Deduction</dt>
              <dd>
                {d.t} — <b style={{ fontWeight: 500 }}>{d.d}</b>
              </dd>
            </Fragment>
          ))}
          <dt>Rounding</dt>
          <dd>{rule.rounding}</dd>
        </dl>
      </div>
      <div className="apc-tablefill" ref={box} style={{ minWidth: base.reduce((sum, w) => sum + w, 0) }}>
        <table className="apc-table apc-trace" style={{ width: total }}>
        <ColGroup widths={colWidths} />
        <thead>
          <tr>
            <th style={{ width: widths[0] }}>
              <span className="apc-thlabel">Element</span>
              <ColResize index={0} start={start} move={move} end={end} />
            </th>
            {vol && (
              <th className="num" style={{ width: widths[1] }}>
                <span className="apc-thlabel">L × H × W</span>
                <ColResize index={1} start={start} move={move} end={end} />
              </th>
            )}
            <th className="num" style={{ width: widths[2] }}>
              <span className="apc-thlabel">{vol ? 'm³' : 'nr'}</span>
              <ColResize index={2} start={start} move={move} end={end} />
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map(e => (
            <tr key={e.id} className={`click${sel === e.id ? ' on' : ''}`} onClick={() => setSel(e.id)}>
              <td>
                <span className="t-mono" style={{ fontWeight: 600 }}>
                  {e.mark}
                </span>{' '}
                <span className="t-faint">{e.name}</span>
                {e.matSource && e.matSource !== 'IFC' && (
                  <Hint label={'Grade from ' + e.matSource}>
                    <span className="t-xs t-faint">({e.matSource})</span>
                  </Hint>
                )}
              </td>
              {vol && (
                <td className="num t-faint">
                  {e.box[3].toFixed(2)} × {e.box[4].toFixed(2)} × {e.box[5].toFixed(2)}
                </td>
              )}
              <td className="num">{vol ? f3(e.vol) : 1}</td>
            </tr>
          ))}
          {missing.map(e => (
            <tr key={e.id} className={`click apc-trace--miss${sel === e.id ? ' on' : ''}`} onClick={() => setSel(e.id)}>
              <td>
                <span className="t-mono" style={{ fontWeight: 600 }}>
                  {e.mark}
                </span>{' '}
                <span>{e.name}</span>
              </td>
              {vol && <td className="num">no grade</td>}
              <td className="num">not counted</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={vol ? 2 : 1}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Calculated quantity
                {vol && members.some(e => e.openings > 0) && (
                  <Hint label={`Openings ${f3(members[0].openings)} m³ each ≤ 0.1 m³ — not deducted. IFC NetVolume ignored.`}>
                    <Icon name="info" size={12} style={{ color: 'var(--fg3)' }} />
                  </Hint>
                )}
              </span>
            </td>
            <td className="num">{fq(line.calc, line.unit || '')}</td>
          </tr>
        </tfoot>
        </table>
      </div>
      {excluded.length > 0 && (
        <div className="t-xs t-faint" style={{ marginTop: 6 }}>
          {excluded.length} {line.filter?.cls} element{excluded.length > 1 ? 's' : ''} excluded — grade does not fit this line.
        </div>
      )}
    </>
  );
}

export function ElementPanel({
  el,
  onApplyEvidence,
  lineOf,
  readOnly
}: {
  el: ElementData | undefined;
  data: ProjectData;
  onApplyEvidence: (id: string) => void;
  lineOf: (id: string) => BillLine | undefined;
  readOnly?: boolean;
}) {
  if (!el)
    return (
      <div className="t-sm t-muted" style={{ padding: '4px 2px' }}>
        No element selected.
      </div>
    );
  const m = parseMat(el.mat);
  const ln = lineOf(el.id);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 14, fontWeight: 600 }}>{el.name}</b>
        <span className="t-mono t-faint" style={{ fontSize: 11 }}>
          {el.mark}
        </span>
      </div>
      <div className="t-xs t-faint t-mono" style={{ margin: '2px 0 12px' }}>
        {el.gid} · {el.cls}
      </div>

      <div className="apc-kv">
        <span className="k">Type</span>
        <span className="v">{el.type}</span>
        <span className="k">Level</span>
        <span className="v">{el.level}</span>
        <span className="k">Material</span>
        <span
          className="v"
          style={{ color: el.mat ? undefined : 'var(--red-ink)', justifyContent: 'space-between' }}
        >
          {el.mat || '— not in IFC'}
          {el.matSource && el.matSource !== 'IFC' && (
            <Hint label={'Value from ' + el.matSource}>
              <span className="t-xs t-faint">({el.matSource})</span>
            </Hint>
          )}
        </span>
        <span className="k">→ Grade</span>
        <span className="v">{m.grade || m.ptype || '—'}</span>
        {Object.entries(el.pset)
          .slice(0, 2)
          .map(([k, v]) => (
            <Fragment key={k}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </Fragment>
          ))}
      </div>

      <Eyebrow style={{ margin: '14px 0 6px' }}>Qto base quantities</Eyebrow>
      <div className="apc-kv">
        <span className="k">Length</span>
        <span className="v apc-v--num">
          {f3(el.box[3])}
          <i>m</i>
        </span>
        <span className="k">Height</span>
        <span className="v apc-v--num">
          {f3(el.box[4])}
          <i>m</i>
        </span>
        <span className="k">Width</span>
        <span className="v apc-v--num">
          {f3(el.box[5])}
          <i>m</i>
        </span>
        <span className="k">GrossVolume</span>
        <span
          className="v apc-v--num"
          style={{ boxShadow: ln && ln.unit !== 'nr' ? 'inset 0 0 0 1px var(--blue-200)' : undefined }}
        >
          {f3(el.gross)}
          <i>m³</i>
        </span>
        <span className="k">NetVolume</span>
        <span className="v apc-v--num">
          {f3(el.net)}
          <i>m³</i>
        </span>
      </div>

      {el.evidence && !el.mat && (
        <div className="apc-evid">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon name="file-text" size={15} style={{ color: 'var(--blue-600)', marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div className="t-sm" style={{ fontWeight: 600 }}>
                Drawing {el.evidence.sheet} gives a grade
              </div>
              <div className="t-xs t-muted" style={{ marginTop: 2 }}>
                {el.evidence.note}
              </div>
            </div>
          </div>
          {!readOnly && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <Hint label="Stored as user-provided with the sheet reference. The IFC is not changed.">
                <Button size="sm" variant="primary" onClick={() => onApplyEvidence(el.id)}>
                  Use {el.evidence.value.replace('_', ' ')} from {el.evidence.sheet}
                </Button>
              </Hint>
            </div>
          )}
        </div>
      )}
      {el.drawingDiff && (
        <div className="apc-evid apc-evid--warn">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon name="triangle-alert" size={15} style={{ color: 'var(--amber-ink)', marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div className="t-sm" style={{ fontWeight: 600 }}>
                Model differs from {el.drawingDiff.sheet}
              </div>
              <div className="t-xs t-muted" style={{ marginTop: 2 }}>
                {el.drawingDiff.field}: model{' '}
                <span className="t-mono">{(el.drawingDiff.model * 1000).toFixed(0)}</span>, drawing{' '}
                <span className="t-mono">{(el.drawingDiff.drawing * 1000).toFixed(0)}</span> mm. Quantity uses the model.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function VerifyRail({
  data,
  line,
  rule,
  evald,
  sel,
  setSel,
  checked,
  toggleCheck,
  onConfirm,
  onOverride,
  onApplyEvidence,
  lineOf,
  tab,
  setTab
}: {
  data: ProjectData;
  line: BillLine | undefined;
  rule: RuleDef | undefined;
  evald: EvaluatedLine;
  sel: string | null;
  setSel: (id: string) => void;
  checked: string[];
  toggleCheck: (id: string) => void;
  onConfirm: (id: string) => void;
  onOverride: (id: string, value: number | null, reason: string) => void;
  onApplyEvidence: (id: string) => void;
  lineOf: (id: string) => BillLine | undefined;
  tab: 'line' | 'el';
  setTab: (tab: 'line' | 'el') => void;
}) {
  const el = data.elements.find(e => e.id === sel);
  const [ov, setOv] = useState(false);
  const [val, setVal] = useState('');
  const [why, setWhy] = useState('');
  useEffect(() => {
    setOv(false);
    setVal('');
    setWhy('');
  }, [line?.id]);

  const members = line?.members || [];
  const missingIds = line?.missingIds || [];
  const nChecked = line ? members.filter(id => checked.includes(id)).length : 0;
  const allChecked = !!line && members.length > 0 && nChecked === members.length;
  const eff = line ? (line.override ?? line.calc ?? null) : null;

  return (
    <aside className="apc-rail">
      <div className="apc-rail__tabs">
        <Seg
          size="sm"
          options={[
            { value: 'line', label: 'BQ line' },
            { value: 'el', label: 'Element' }
          ]}
          value={tab}
          onChange={v => setTab(v as 'line' | 'el')}
        />
      </div>
      {tab === 'line' && line && rule && (
        <div className="apc-rail__scroll">
          <div style={{ padding: '14px 16px 4px' }}>
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
              <div>
                <span>Amount HK$</span>
                <b className="t-mono" style={{ color: line.rate == null ? 'var(--fg3)' : undefined }}>
                  {line.rate == null || eff == null ? 'Unpriced' : f2(eff * line.rate)}
                </b>
              </div>
            </div>
            {line.override != null && (
              <div className="t-xs t-muted" style={{ marginTop: 6 }}>
                <Icon name="pencil-line" size={11} style={{ verticalAlign: -1 }} /> {line.reason}
              </div>
            )}
          </div>

          {missingIds.length > 0 && (
            <div className="apc-alert">
              <Icon name="circle-alert" size={15} style={{ color: 'var(--red-ink)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <b>{missingIds.length} element not counted.</b>{' '}
                {data.elements.find(e => e.id === missingIds[0])?.name} has no grade in IFC Material.
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setSel(missingIds[0]);
                  setTab('el');
                }}
              >
                Open
              </Button>
            </div>
          )}

          <RailSection title="Calculation rule">
            <RuleTrace line={line} rule={rule} evald={evald} sel={sel} setSel={setSel} />
          </RailSection>

          <RailSection
            title="Verify contributors"
            right={
              <span className="t-xs t-mono" style={{ color: allChecked ? 'var(--green-ink)' : 'var(--fg3)' }}>
                {nChecked}/{members.length}
              </span>
            }
          >
            <div className="apc-bar">
              <i style={{ width: (members.length ? (nChecked / members.length) * 100 : 0) + '%' }} />
            </div>
            <div style={{ marginTop: 8 }}>
              {evald.members.map(e => (
                <label key={e.id} className={`apc-check${sel === e.id ? ' on' : ''}`}>
                  <input type="checkbox" checked={checked.includes(e.id)} onChange={() => toggleCheck(e.id)} />
                  <span className="t-mono" style={{ fontWeight: 600, width: 38 }}>
                    {e.mark}
                  </span>
                  <span
                    style={{ flex: 1 }}
                    onClick={ev => {
                      ev.preventDefault();
                      setSel(e.id);
                    }}
                  >
                    {e.name}
                  </span>
                  {e.drawingDiff && <Icon name="triangle-alert" size={13} style={{ color: 'var(--amber-ink)' }} />}
                  <span className="t-mono t-faint" style={{ fontSize: 11 }}>
                    {line.unit === 'nr' ? '1' : f3(e.vol)}
                  </span>
                </label>
              ))}
            </div>
          </RailSection>

          <div className="apc-rail__foot">
            {ov ? (
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, marginBottom: 10 }}>
                <input
                  className="apc-input apc-input--num"
                  placeholder={fq(line.calc ?? 0, line.unit || '')}
                  value={val}
                  onChange={e => setVal(e.target.value)}
                />
                <input
                  className="apc-input"
                  placeholder="Reason (required)"
                  value={why}
                  onChange={e => setWhy(e.target.value)}
                />
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8 }}>
              {ov ? (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!val || !why}
                    onClick={() => {
                      onOverride(line.id, parseFloat(val), why);
                      setOv(false);
                    }}
                  >
                    Save override
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setOv(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" icon="pencil-line" onClick={() => setOv(true)}>
                    Override
                  </Button>
                  {line.override != null && (
                    <Button size="sm" variant="ghost" onClick={() => onOverride(line.id, null, '')}>
                      Use calculated
                    </Button>
                  )}
                  <span style={{ flex: 1 }} />
                  {line.state === 'confirmed' ? (
                    <span
                      className="apc-pill"
                      style={{ color: 'var(--st-confirmed)', background: 'var(--st-confirmed-bg)' }}
                    >
                      <i />
                      Confirmed
                    </span>
                  ) : (
                    <Hint label={!allChecked ? 'Check every contributor first' : 'Confirm this measured line'}>
                      <Button
                        size="sm"
                        variant="primary"
                        icon="check"
                        disabled={!allChecked || missingIds.length > 0}
                        onClick={() => onConfirm(line.id)}
                      >
                        Confirm line
                      </Button>
                    </Hint>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {tab === 'line' && (!line || !rule) && (
        <div className="t-sm t-muted" style={{ padding: 16 }}>
          Pick a BQ item on the left.
        </div>
      )}
      {tab === 'el' && (
        <div className="apc-rail__scroll" style={{ padding: '14px 16px' }}>
          <ElementPanel el={el} data={data} onApplyEvidence={onApplyEvidence} lineOf={lineOf} />
        </div>
      )}
    </aside>
  );
}
