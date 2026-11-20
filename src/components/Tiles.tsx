import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { Icon, type IconName } from './Icon';
import { Hint } from './Hint';
import {
  MEASURE_TOOLS,
  SNAP_LABEL,
  MeasureOverlay,
  SnapOverlay,
  angleAt,
  closestElementPoints,
  distance as pointDistance,
  formatArea,
  formatLen,
  measureTool,
  nearestLevel,
  polygonArea,
  type MeasureKind,
  type Measurement,
  type Point3
} from './Measure';
import { Seg } from './primitives';
import type { Drawing, Panorama, ProjectData } from '../lib/demo';
import {
  mount,
  type ElevationSide,
  type NavMode,
  type SectionAxis,
  type SectionBoxSettings,
  type SectionChangeKind,
  type SectionPlaneSettings,
  type SnapInfo,
  type SnapType,
  type ViewMode,
  type ViewportApi,
  type ViewportPaint
} from '../three/viewport';

export const VIEW_OPTS: Array<{ v: ViewMode | 'plan'; l: string; i: IconName }> = [
  { v: 'persp', l: 'Perspective', i: 'box' },
  { v: 'top', l: 'Top view', i: 'square-dashed' },
  { v: 'elev', l: 'Elevation', i: 'panel-bottom' },
  { v: 'plan', l: 'Plan (drawing)', i: 'file-text' }
];

export interface TileConfig {
  id: string;
  view: ViewMode | 'plan';
  side: ElevationSide;
  box: boolean;
  depth: number;
  sheet: string;
}

export interface ElementHud {
  id: string;
  mark: string;
  center: [number, number, number];
  size: [number, number, number];
  volume: number;
  amount: number | null;
  bqIds: string[];
}

function hudScreenPosition(
  _hud: ElementHud,
  _project: (x: number, y: number, z: number) => { x: number; y: number },
  _width: number,
  _height: number
) {
  return { left: 12, top: 12 };
}

function DimensionOverlay({
  hud,
  project
}: {
  hud: ElementHud | null;
  project: (x: number, y: number, z: number) => { x: number; y: number } | null;
}) {
  if (!hud) return null;
  const [cx, cy, cz] = hud.center;
  const [L, H, W] = hud.size;
  const x0 = cx - L / 2;
  const x1 = cx + L / 2;
  const y0 = cy - H / 2;
  const y1 = cy + H / 2;
  const z0 = cz - W / 2;
  const z1 = cz + W / 2;
  const off = 0.05;
  const segs = [
    { a: [x0, y0 - off, z1 + off] as Point3, b: [x1, y0 - off, z1 + off] as Point3, label: `L ${L.toFixed(2)} m` },
    { a: [x1 + off, y0 - off, z0] as Point3, b: [x1 + off, y0 - off, z1] as Point3, label: `W ${W.toFixed(2)} m` },
    { a: [x1 + off, y0, z0 - off] as Point3, b: [x1 + off, y1, z0 - off] as Point3, label: `H ${H.toFixed(2)} m` }
  ];
  const ext = [
    [[x0, y0, z1], [x0, y0 - off, z1 + off]],
    [[x1, y0, z1], [x1, y0 - off, z1 + off]],
    [[x1, y0, z0], [x1 + off, y0 - off, z0]],
    [[x1, y0, z1], [x1 + off, y0 - off, z1]],
    [[x1, y0, z0], [x1 + off, y0, z0 - off]],
    [[x1, y1, z0], [x1 + off, y1, z0 - off]]
  ] as Array<[Point3, Point3]>;
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }}
      aria-label="Element dimensions"
    >
      {ext.map(([ea, eb], i) => {
        const a = project(...ea);
        const b = project(...eb);
        if (!a || !b) return null;
        return (
          <line
            key={`ext-${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#d6a56b"
            strokeWidth={0.9}
            strokeDasharray="3 2"
          />
        );
      })}
      {segs.map(seg => {
        const a = project(...seg.a);
        const b = project(...seg.b);
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const center = project(...hud.center) ?? a;
        const dx = mx - center.x;
        const dy = my - center.y;
        const len = Math.hypot(dx, dy);
        const lx = len > 0.5 ? mx + (dx / len) * 30 : mx + 5;
        const ly = len > 0.5 ? my + (dy / len) * 30 : my - 5;
        return (
          <g key={seg.label}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b45309" strokeWidth={1.6} />
            <circle cx={a.x} cy={a.y} r={2.2} fill="#fff" stroke="#b45309" strokeWidth={1.3} />
            <circle cx={b.x} cy={b.y} r={2.2} fill="#fff" stroke="#b45309" strokeWidth={1.3} />
            <text
              x={lx}
              y={ly}
              fill="#8a3f07"
              fontSize={10.5}
              fontFamily="IBM Plex Mono"
              paintOrder="stroke"
              stroke="#fff"
              strokeWidth={3.5}
              textAnchor={dx >= 0 ? 'start' : 'end'}
            >
              {seg.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type Tool = 'select' | 'measure';

const AXIS_INDEX: Record<SectionAxis, number> = { x: 0, y: 1, z: 2 };

function boundsFor(data: ProjectData, ids: string[], pad = 0.15) {
  const chosen = ids.length ? data.elements.filter(e => ids.includes(e.id)) : data.elements;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  chosen.forEach(e => {
    const [x, y, z, L, H, W] = e.box;
    min[0] = Math.min(min[0], x - L / 2 - pad);
    min[1] = Math.min(min[1], y - H / 2 - pad);
    min[2] = Math.min(min[2], z - W / 2 - pad);
    max[0] = Math.max(max[0], x + L / 2 + pad);
    max[1] = Math.max(max[1], y + H / 2 + pad);
    max[2] = Math.max(max[2], z + W / 2 + pad);
  });
  if (!Number.isFinite(min[0])) return { min: [-1, -1, -1] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
  return { min, max };
}

const centerOf = (b: { min: [number, number, number]; max: [number, number, number] }, axis: SectionAxis) =>
  (b.min[AXIS_INDEX[axis]] + b.max[AXIS_INDEX[axis]]) / 2;

type HitType = 'point' | 'line' | 'face';

const MEASURE_ACCEPTS: Record<MeasureKind, HitType[]> = {
  distance: ['point', 'line'],
  angle: ['point', 'line'],
  coordinate: ['point', 'face'],
  laser: ['point', 'face'],
  surface: ['face'],
  shortest: ['point', 'line', 'face']
};



function SectionControls({
  box,
  plane,
  bottom,
  onBox,
  onPlane,
  onAxis,
  onClose
}: {
  box: SectionBoxSettings | null;
  plane: SectionPlaneSettings | null;
  bottom: number;
  onBox: (next: SectionBoxSettings) => void;
  onPlane: (next: SectionPlaneSettings) => void;
  onAxis: (axis: SectionAxis) => void;
  onClose: () => void;
}) {
  return (
    <div className="apc-sectionpanel" style={{ bottom }} onPointerDown={e => e.stopPropagation()}>
      <div className="apc-sectionpanel__head">
        <Icon name={box ? 'box' : 'columns-2'} size={13} />
        <b>{box ? 'Section box' : 'Section plane'}</b>
        <span style={{ flex: 1 }} />
        <button className="apc-iconbtn" onClick={onClose} aria-label="Close section controls">
          <Icon name="x" size={12} />
        </button>
      </div>
      {box ? (
        <>
          <div className="apc-sectionpanel__grid">
            {(['x', 'y', 'z'] as SectionAxis[]).map(axis => {
              const i = AXIS_INDEX[axis];
              return (
                <div className="apc-sectionrow" key={axis}>
                  <b>{axis.toUpperCase()}</b>
                  <label>
                    <span>min</span>
                    <input
                      type="number"
                      step="0.1"
                      value={Number(box.min[i].toFixed(3))}
                      onChange={e => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v)) return;
                        const min = [...box.min] as [number, number, number];
                        min[i] = Math.min(v, box.max[i] - 0.05);
                        onBox({ ...box, min });
                      }}
                    />
                  </label>
                  <label>
                    <span>max</span>
                    <input
                      type="number"
                      step="0.1"
                      value={Number(box.max[i].toFixed(3))}
                      onChange={e => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v)) return;
                        const max = [...box.max] as [number, number, number];
                        max[i] = Math.max(v, box.min[i] + 0.05);
                        onBox({ ...box, max });
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
          <div className="apc-sectionpanel__note">Drag any coloured face in the model to move it.</div>
        </>
      ) : plane ? (
        <>
          <div className="apc-sectionpanel__grid">
            <div className="apc-sectionrow">
              <b>Axis</b>
              <Seg
                size="sm"
                options={[
                  { value: 'x', label: 'X' },
                  { value: 'y', label: 'Y' },
                  { value: 'z', label: 'Z' }
                ]}
                value={plane.axis}
                onChange={v => onAxis(v as SectionAxis)}
              />
            </div>
            <div className="apc-sectionrow">
              <b>{plane.axis.toUpperCase()}</b>
              <label>
                <span>coordinate</span>
                <input
                  type="number"
                  step="0.1"
                  value={Number(plane.offset.toFixed(3))}
                  onChange={e => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onPlane({ ...plane, offset: v });
                  }}
                />
              </label>
            </div>
          </div>
          <div className="apc-sectionpanel__note">Drag the plane face in the model to move it.</div>
        </>
      ) : null}
    </div>
  );
}

function TileTools({
  nav,
  setNav,
  section,
  onSectionBox,
  onSectionPlane,
  unit,
  setUnit,
  precision,
  setPrecision,
  measuring,
  measureKind,
  setMeasureKind,
  onMeasure,
  onDone,
  draftCount,
  snap,
  notice,
  onFit,
  onHome,
  canWalk,
  bottomInset = 0
}: {
  nav: NavMode;
  setNav: (mode: NavMode) => void;
  section: 'none' | 'box' | 'plane';
  onSectionBox: () => void;
  onSectionPlane: () => void;
  unit: 'm' | 'mm';
  setUnit: (unit: 'm' | 'mm') => void;
  precision: number;
  setPrecision: (n: number) => void;
  measuring: boolean;
  measureKind: MeasureKind;
  setMeasureKind: (kind: MeasureKind) => void;
  onMeasure: () => void;
  onDone: () => void;
  draftCount: number;
  snap: SnapInfo | null;
  notice: string;
  onFit: () => void;
  onHome: () => void;
  canWalk: boolean;
  bottomInset?: number;
}) {
  const [unitsOpen, setUnitsOpen] = useState(false);
  const current = measureTool(measureKind);
  return (
    <div className="apc-tools" style={{ bottom: bottomInset + 9 }} onPointerDown={e => e.stopPropagation()}>
      <span className="apc-toolgroup">
        <Hint delay={0} label="Orbit">
          <button className={`apc-tool${nav === 'orbit' ? ' on' : ''}`} onClick={() => setNav('orbit')} aria-label="Orbit">
            <Icon name="orbit" size={15} />
          </button>
        </Hint>
        <Hint delay={0} label="Pan">
          <button className={`apc-tool${nav === 'pan' ? ' on' : ''}`} onClick={() => setNav('pan')} aria-label="Pan">
            <Icon name="hand" size={15} />
          </button>
        </Hint>
        <Hint delay={0} label="Zoom">
          <button className={`apc-tool${nav === 'zoom' ? ' on' : ''}`} onClick={() => setNav('zoom')} aria-label="Zoom">
            <Icon name="zoom-in" size={15} />
          </button>
        </Hint>
        <Hint delay={0} label={canWalk ? 'First person walk (W A S D)' : 'Walk is available in perspective'}>
          <button
            className={`apc-tool${nav === 'walk' ? ' on' : ''}`}
            onClick={() => canWalk && setNav('walk')}
            disabled={!canWalk}
            aria-label="Walk"
          >
            <Icon name="person-standing" size={15} />
          </button>
        </Hint>
        <Hint delay={0} label="Fit to view">
          <button className="apc-tool" onClick={onFit} aria-label="Fit">
            <Icon name="focus" size={15} />
          </button>
        </Hint>
        <Hint delay={0} label="Reset view">
          <button className="apc-tool" onClick={onHome} aria-label="Reset view">
            <Icon name="rotate-ccw" size={15} />
          </button>
        </Hint>
      </span>

      {!measuring ? (
        <>
          <span className="apc-toolgroup">
            <Hint delay={0} label="Section box">
              <button
                className={`apc-tool${section === 'box' ? ' on' : ''}`}
                onClick={onSectionBox}
                aria-label="Section box"
              >
                <Icon name="box" size={15} />
              </button>
            </Hint>
            <Hint delay={0} label="Section plane">
              <button
                className={`apc-tool${section === 'plane' ? ' on' : ''}`}
                onClick={onSectionPlane}
                aria-label="Section plane"
              >
                <Icon name="columns-2" size={15} />
              </button>
            </Hint>
          </span>
          <span className="apc-toolgroup">
            <Hint delay={0} label="Measurement mode">
              <button className="apc-tool" onClick={onMeasure} aria-label="Measurement mode">
                <Icon name="ruler" size={15} />
              </button>
            </Hint>
          </span>
        </>
      ) : (
        <>
          <span className="apc-toolgroup apc-measuretools">
            {MEASURE_TOOLS.map(tool => (
              <Hint key={tool.kind} delay={0} label={`${tool.label} — ${tool.hint}`}>
                <button
                  className={`apc-tool${measureKind === tool.kind ? ' on' : ''}`}
                  onClick={() => setMeasureKind(tool.kind)}
                  aria-label={tool.label}
                >
                  <Icon name={tool.icon} size={15} />
                </button>
              </Hint>
            ))}
          </span>
          <span className="apc-toolgroup">
            <span className="apc-unitswrap">
              <Hint delay={0} label="Units and precision">
                <button className="apc-tool apc-tool--txt" onClick={() => setUnitsOpen(v => !v)} aria-label="Units and precision">
                  {unit}
                </button>
              </Hint>
              {unitsOpen && (
                <div className="apc-unitspop" onPointerLeave={() => setUnitsOpen(false)}>
                  <div className="apc-unitsrow">
                    <span>Unit</span>
                    <Seg
                      size="sm"
                      options={[
                        { value: 'm', label: 'm' },
                        { value: 'mm', label: 'mm' }
                      ]}
                      value={unit}
                      onChange={v => setUnit(v as 'm' | 'mm')}
                    />
                  </div>
                  <div className="apc-unitsrow">
                    <span>Precision</span>
                    <Seg
                      size="sm"
                      options={['0', '1', '2', '3']}
                      value={String(precision)}
                      onChange={v => setPrecision(Number(v))}
                    />
                  </div>
                </div>
              )}
            </span>
          </span>
          <span className="apc-toolgroup">
            <button className="apc-donebtn" onClick={onDone} aria-label="Done measuring">
              <Icon name="check" size={13} /> Done
            </button>
          </span>
        </>
      )}

      {measuring && (
        <div className={`apc-measurestatus${notice ? ' apc-measurestatus--warn' : ''}`} role="status">
          <b>{current.label}</b>
          <span>
            {notice || current.hint}
            {!notice && snap
              ? (() => {
                  const c = snap.candidates[snap.active];
                  if (!c) return '';
                  const valid = c.type === 'cursor' || MEASURE_ACCEPTS[measureKind].includes(c.type);
                  return ` · ${SNAP_LABEL[c.type]}${valid ? '' : ' (not valid)'} · Tab ${snap.active + 1}/${snap.candidates.length}`;
                })()
              : ''}
          </span>
          {draftCount > 0 && <em>{draftCount} picked</em>}
        </div>
      )}
    </div>
  );
}

function View3D({
  tile,
  data,
  paint,
  boxIds,
  onPick,
  onContext,
  register,
  measuring,
  measurements,
  draft,
  draftKind,
  selectedMeasure,
  onMeasurePoint,
  onMeasureHover,
  onMeasureSelect,
  onMeasureMenu,
  onSectionChange,
  nav,
  active,
  hud
}: {
  tile: TileConfig;
  data: ProjectData;
  paint: ViewportPaint;
  boxIds: string[];
  hud: ElementHud | null;
  onPick: (id: string | null, ev?: PointerEvent) => void;
  onContext: (id: string | null, ev: PointerEvent) => void;
  register: (id: string, api: ViewportApi | null) => void;
  measuring: boolean;
  measurements: Measurement[];
  draft: Point3[];
  draftKind: MeasureKind;
  selectedMeasure: string | null;
  onMeasurePoint: (point: Point3, id: string | null, hitType?: 'point' | 'line' | 'face') => void;
  onMeasureHover: (info: SnapInfo | null) => void;
  onMeasureSelect: (id: string) => void;
  onMeasureMenu: (id: string, ev: ReactMouseEvent<SVGGElement>) => void;
  onSectionChange: (kind: SectionChangeKind, settings: SectionBoxSettings | SectionPlaneSettings) => void;
  nav: NavMode;
  active: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ViewportApi | null>(null);
  const lv = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const contextRef = useRef(onContext);
  contextRef.current = onContext;
  const measureRef = useRef(onMeasurePoint);
  measureRef.current = onMeasurePoint;
  const hoverRef = useRef(onMeasureHover);
  hoverRef.current = onMeasureHover;
  const sectionChangeRef = useRef(onSectionChange);
  sectionChangeRef.current = onSectionChange;
  const modeRef = useRef(tile.view);
  modeRef.current = tile.view;
  const hasMarks = measurements.length > 0 || draft.length > 0 || !!hud;
  const hasMarksRef = useRef(hasMarks);
  hasMarksRef.current = hasMarks;
  const [snap, setSnap] = useState<SnapInfo | null>(null);
  const hudNode = useRef<HTMLDivElement>(null);
  const hudRef = useRef(hud);
  hudRef.current = hud;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!host.current) return;
    api.current = mount(host.current, {
      elements: data.elements,
      levels: data.levels,
      mode: tile.view === 'plan' ? 'persp' : tile.view,
      side: tile.side,
      onPick: (id, ev) => pickRef.current(id, ev),
      onContext: (id, ev) => contextRef.current(id, ev),
      onMeasure: (point, id, hitType) => measureRef.current(point, id, hitType),
      onSnap: info => {
        setSnap(info);
        hoverRef.current(info);
      },
      onSectionChange: (kind, settings) => sectionChangeRef.current(kind, settings),
      onRender: project => {
        const node = hudNode.current;
        if (node) {
          const h = hudRef.current;
          if (h) {
            const w = host.current?.clientWidth || 1;
            const ht = host.current?.clientHeight || 1;
            const pos = hudScreenPosition(h, project, w, ht);
            node.style.left = `${pos.left}px`;
            node.style.top = `${pos.top}px`;
            node.style.opacity = '1';
          } else {
            node.style.opacity = '0';
          }
        }
        const box = lv.current;
        if (box) {
          box.style.display = modeRef.current === 'elev' ? 'block' : 'none';
          if (modeRef.current === 'elev') {
            data.levels.forEach((l, i) => {
              const n = box.children[i] as HTMLElement | undefined;
              if (!n) return;
              n.style.top = project(0, l.y, 0).y - 9 + (i === 0 ? 8 : i === 1 ? -6 : 0) + 'px';
            });
          }
        }
        if (hasMarksRef.current) setTick(t => t + 1);
      }
    });
    register(tile.id, api.current);
    return () => {
      register(tile.id, null);
      api.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tile.view === 'plan') return;
    api.current?.setMode(tile.view, tile.side);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.view, tile.side]);

  useEffect(() => {
    api.current?.setBox(tile.view === 'elev' && tile.box, boxIds, tile.depth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.view, tile.box, tile.depth, tile.side, boxIds.join(',')]);

  useEffect(() => {
    api.current?.paint(paint);
  }, [paint]);

  useEffect(() => {
    api.current?.setMeasure(
      measuring,
      measuring ? ([...MEASURE_ACCEPTS[draftKind], 'cursor'] as SnapType[]) : undefined
    );
  }, [measuring, draftKind]);

  useEffect(() => {
    if (!measuring) setSnap(null);
  }, [measuring]);

  useEffect(() => {
    api.current?.setNav(nav);
  }, [nav]);

  useEffect(() => {
    api.current?.setActive(active);
  }, [active]);

  useEffect(() => {
    const node = hudNode.current;
    if (!node) return;
    if (!hud) {
      node.style.opacity = '0';
      return;
    }
    const project = api.current?.project;
    if (!project) return;
    const w = host.current?.clientWidth || 1;
    const ht = host.current?.clientHeight || 1;
    const pos = hudScreenPosition(hud, project, w, ht);
    node.style.left = `${pos.left}px`;
    node.style.top = `${pos.top}px`;
    node.style.opacity = '1';
  }, [hud, active]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        cursor:
          measuring
            ? 'crosshair'
            : nav === 'pan'
              ? 'grab'
              : nav === 'zoom'
                ? 'zoom-in'
                : nav === 'walk'
                  ? 'crosshair'
                  : 'default'
      }}
    >
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div ref={lv} style={{ position: 'absolute', left: 8, top: 0, bottom: 0, pointerEvents: 'none' }}>
        {data.levels.map(l => (
          <div key={l.name} className="apc-lvl">
            <b>{l.name}</b> {l.y >= 0 ? '+' : ''}
            {l.y.toFixed(3)}
          </div>
        ))}
      </div>
      <DimensionOverlay hud={hud} project={(x, y, z) => api.current?.project(x, y, z) || null} />
      <div ref={hudNode} className="apc-elhud" style={{ opacity: 0 }}>
        {hud && (
          <>
            <b>{hud.mark}</b>
            <div>
              <span>Volume</span>
              <em>{hud.volume.toFixed(2)} m³</em>
            </div>
            <div>
              <span>Amount</span>
              <em>
                {hud.amount != null
                  ? `HK$${hud.amount.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </em>
            </div>
            <div>
              <span>BQ item</span>
              <em>{hud.bqIds.length ? hud.bqIds.join(', ') : '—'}</em>
            </div>
          </>
        )}
      </div>
      <SnapOverlay info={measuring ? snap : null} />
      <MeasureOverlay
        measurements={measurements}
        draft={draft}
        draftKind={draftKind}
        selected={selectedMeasure}
        interactive={!measuring}
        onSelect={onMeasureSelect}
        onMenu={onMeasureMenu}
        project={(x, y, z) => api.current?.project(x, y, z) || null}
      />
    </div>
  );
}

export function PlanSheet({
  data,
  sheetId,
  paint,
  onPick,
  tool,
  resetMeasure,
  resetView
}: {
  data: ProjectData;
  sheetId: string;
  paint: ViewportPaint;
  onPick: (id: string) => void;
  tool: Tool;
  resetMeasure: number;
  resetView: number;
}) {
  const d: Drawing = data.drawings.find(x => x.id === sheetId) || data.drawings[0];
  const S = 40;
  const OX = 8;
  const OZ = 2.6;
  const X = (x: number) => (x + OX) * S;
  const Y = (z: number) => (z + OZ) * S;
  const cut = parseFloat(d.cut);
  const [vb, setVb] = useState<[number, number, number, number]>([0, 0, 640, 300]);
  const [pts, setPts] = useState<Array<{ x: number; z: number }>>([]);
  const drag = useRef<{ x: number; y: number; vb: [number, number, number, number]; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => setVb([0, 0, 640, 300]), [sheetId, resetView]);
  useEffect(() => setPts([]), [resetMeasure, sheetId]);

  const items = data.elements
    .filter(e => d.show.includes(e.cls))
    .map(e => {
      const [x, y, , L, H, W] = e.box;
      const lo = y - H / 2;
      const hi = y + H / 2;
      const kind: 'cut' | 'below' | 'above' = cut >= lo && cut <= hi ? 'cut' : hi < cut ? 'below' : 'above';
      return { e, x, z: e.box[2], L, W, kind };
    })
    .filter(i => i.kind !== 'above')
    .sort((a, b) => Number(a.kind === 'cut') - Number(b.kind === 'cut'));

  const corners = items.flatMap(({ x, z, L, W }) => [
    { x: x - L / 2, z: z - W / 2 },
    { x: x + L / 2, z: z - W / 2 },
    { x: x - L / 2, z: z + W / 2 },
    { x: x + L / 2, z: z + W / 2 }
  ]);

  const fillFor = (id: string, kind: string) => {
    if (id === paint.sel) return 'oklch(0.93 0.06 55)';
    if (paint.members.includes(id)) return paint.checked.includes(id) ? 'oklch(0.9 0.08 152)' : 'oklch(0.95 0.04 152)';
    if (paint.missing.includes(id)) return 'oklch(0.95 0.035 25)';
    return kind === 'cut' ? 'url(#apc-hatch)' : 'none';
  };
  const strokeFor = (id: string, kind: string) =>
    id === paint.sel
      ? '#ff7a1f'
      : paint.members.includes(id)
        ? 'oklch(0.52 0.12 152)'
        : paint.missing.includes(id)
          ? 'oklch(0.53 0.16 25)'
          : '#25303a';

  const walls = items.filter(i => i.kind === 'cut' && i.e.cls === (d.id === 'd1' ? 'IfcWall' : 'IfcBeam'));
  const dimZ = -1.75;

  const toModel = (ev: ReactPointerEvent<SVGSVGElement>) => {
    const node = svg.current;
    if (!node) return null;
    const ctm = node.getScreenCTM();
    if (!ctm) return null;
    const p = node.createSVGPoint();
    p.x = ev.clientX;
    p.y = ev.clientY;
    const loc = p.matrixTransform(ctm.inverse());
    let best: { x: number; z: number } | null = null;
    let bestD = 10;
    corners.forEach(c => {
      const dx = X(c.x) - loc.x;
      const dz = Y(c.z) - loc.y;
      const dist = Math.hypot(dx, dz);
      if (dist < bestD) {
        bestD = dist;
        best = c;
      }
    });
    return best || { x: loc.x / S - OX, z: loc.y / S - OZ };
  };

  useEffect(() => {
    const n = svg.current;
    if (!n) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = n.getBoundingClientRect();
      const k = ev.deltaY > 0 ? 1.12 : 0.89;
      const mx = vb[0] + ((ev.clientX - r.left) / r.width) * vb[2];
      const my = vb[1] + ((ev.clientY - r.top) / r.height) * vb[3];
      setVb([mx - (mx - vb[0]) * k, my - (my - vb[1]) * k, vb[2] * k, vb[3] * k]);
    };
    n.addEventListener('wheel', onWheel, { passive: false });
    return () => n.removeEventListener('wheel', onWheel);
  }, [vb]);

  const dist =
    pts.length === 2 ? Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z) : null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--n-100)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <svg
        ref={svg}
        viewBox={vb.join(' ')}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', cursor: tool === 'measure' ? 'crosshair' : drag.current ? 'grabbing' : 'default' }}
        onPointerDown={ev => {
          drag.current = { x: ev.clientX, y: ev.clientY, vb, moved: false };
        }}
        onPointerMove={ev => {
          if (!drag.current || !svg.current) return;
          const r = svg.current.getBoundingClientRect();
          const dx = ev.clientX - drag.current.x;
          const dy = ev.clientY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
          if (!drag.current.moved) return;
          const s = Math.max(drag.current.vb[2] / r.width, drag.current.vb[3] / r.height);
          setVb([drag.current.vb[0] - dx * s, drag.current.vb[1] - dy * s, vb[2], vb[3]]);
        }}
        onPointerUp={ev => {
          if (drag.current && !drag.current.moved && tool === 'measure') {
            const p = toModel(ev);
            if (p) setPts(prev => (prev.length >= 2 ? [p] : [...prev, p]));
          }
          setTimeout(() => {
            drag.current = null;
          }, 0);
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
        <defs>
          <pattern id="apc-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="#fff" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="#8c98a3" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect x="6" y="6" width="628" height="288" fill="#fff" stroke="#d3d9df" strokeWidth="0.8" />
        <rect x="12" y="12" width="616" height="276" fill="none" stroke="#25303a" strokeWidth="0.6" />
        {data.grids.x.map(g => (
          <g key={g.n}>
            <line x1={X(g.v)} y1={34} x2={X(g.v)} y2={210} stroke="#8c98a3" strokeWidth="0.4" strokeDasharray="8 2 1.5 2" />
            <circle cx={X(g.v)} cy={26} r={7.5} fill="#fff" stroke="#25303a" strokeWidth="0.6" />
            <text x={X(g.v)} y={29} textAnchor="middle" fontSize="8" fontFamily="IBM Plex Mono" fill="#25303a">
              {g.n}
            </text>
          </g>
        ))}
        {data.grids.z.map(g => (
          <g key={g.n}>
            <line x1={34} y1={Y(g.v)} x2={590} y2={Y(g.v)} stroke="#8c98a3" strokeWidth="0.4" strokeDasharray="8 2 1.5 2" />
            <circle cx={26} cy={Y(g.v)} r={7.5} fill="#fff" stroke="#25303a" strokeWidth="0.6" />
            <text x={26} y={Y(g.v) + 3} textAnchor="middle" fontSize="8" fontFamily="IBM Plex Mono" fill="#25303a">
              {g.n}
            </text>
          </g>
        ))}
        {items.map(({ e, x, z, L, W, kind }) => (
          <g
            key={e.id}
            style={{ cursor: tool === 'measure' ? 'crosshair' : 'pointer' }}
            onClick={() => {
              if (tool !== 'measure' && (!drag.current || !drag.current.moved)) onPick(e.id);
            }}
          >
            <rect
              x={X(x - L / 2)}
              y={Y(z - W / 2)}
              width={L * S}
              height={W * S}
              fill={fillFor(e.id, kind)}
              stroke={strokeFor(e.id, kind)}
              strokeWidth={kind === 'cut' ? 1.3 : 0.5}
              strokeDasharray={e.cls === 'IfcSlab' ? '3 2' : undefined}
            />
            {kind === 'cut' && (
              <text
                x={X(x)}
                y={Y(z) + 2.5}
                textAnchor="middle"
                fontSize="6.5"
                fontFamily="IBM Plex Mono"
                fill="#25303a"
                style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 2.5 }}
              >
                {e.mark}
              </text>
            )}
          </g>
        ))}
        {walls.map(({ e, x, L }) => {
          const dv = e.drawingDiff ? e.drawingDiff.drawing : L;
          const bad = !!e.drawingDiff && !!paint.flags;
          const x1 = X(x - L / 2);
          const x2 = X(x + L / 2);
          const y = Y(dimZ);
          return (
            <g key={'d' + e.id}>
              <line x1={x1} y1={y} x2={x2} y2={y} stroke="#25303a" strokeWidth="0.4" />
              <line x1={x1 - 2} y1={y + 2} x2={x1 + 2} y2={y - 2} stroke="#25303a" strokeWidth="0.7" />
              <line x1={x2 - 2} y1={y + 2} x2={x2 + 2} y2={y - 2} stroke="#25303a" strokeWidth="0.7" />
              <line x1={x1} y1={y - 4} x2={x1} y2={y + 8} stroke="#25303a" strokeWidth="0.3" />
              <line x1={x2} y1={y - 4} x2={x2} y2={y + 8} stroke="#25303a" strokeWidth="0.3" />
              <text
                x={(x1 + x2) / 2}
                y={y - 3}
                textAnchor="middle"
                fontSize="7"
                fontFamily="IBM Plex Mono"
                fill={bad ? 'oklch(0.53 0.16 25)' : '#25303a'}
              >
                {(dv * 1000).toFixed(0)}
              </text>
              {bad && (
                <g>
                  <ellipse
                    cx={(x1 + x2) / 2}
                    cy={y - 5.5}
                    rx={16}
                    ry={7}
                    fill="none"
                    stroke="oklch(0.53 0.16 25)"
                    strokeWidth="0.7"
                    strokeDasharray="2 1.4"
                  />
                </g>
              )}
            </g>
          );
        })}
        {pts.length === 2 && (
          <g pointerEvents="none">
            <line x1={X(pts[0].x)} y1={Y(pts[0].z)} x2={X(pts[1].x)} y2={Y(pts[1].z)} stroke="#176891" strokeWidth={1.2} />
            <circle cx={X(pts[0].x)} cy={Y(pts[0].z)} r={3} fill="#fff" stroke="#176891" strokeWidth={1.2} />
            <circle cx={X(pts[1].x)} cy={Y(pts[1].z)} r={3} fill="#176891" stroke="#fff" strokeWidth={1.2} />
            {dist != null && (
              <text
                x={(X(pts[0].x) + X(pts[1].x)) / 2}
                y={(Y(pts[0].z) + Y(pts[1].z)) / 2 - 5}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fontFamily="IBM Plex Mono"
                fill="#11506f"
                style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3.5 }}
              >
                {Math.round(dist * 1000)} mm
              </text>
            )}
          </g>
        )}
        {pts.length === 1 && (
          <circle cx={X(pts[0].x)} cy={Y(pts[0].z)} r={3} fill="#fff" stroke="#176891" strokeWidth={1.2} />
        )}
        <g fontFamily="IBM Plex Sans" fill="#25303a">
          <rect x="430" y="232" width="198" height="56" fill="#fff" stroke="#25303a" strokeWidth="0.6" />
          <line x1="430" y1="250" x2="628" y2="250" stroke="#25303a" strokeWidth="0.4" />
          <line x1="560" y1="250" x2="560" y2="288" stroke="#25303a" strokeWidth="0.4" />
          <text x="436" y="244" fontSize="7.5" fontWeight="600">
            {data.project.name} · {data.project.contract}
          </text>
          <text x="436" y="262" fontSize="7">
            {d.title}
          </text>
          <text x="436" y="273" fontSize="6" fill="#66737e">
            Cut plane {d.cut} · Scale 1:100
          </text>
          <text x="436" y="283" fontSize="6" fill="#66737e">
            Extracted from IFC · IfcAnnotation
          </text>
          <text x="566" y="263" fontSize="6" fill="#66737e">
            Sheet
          </text>
          <text x="566" y="279" fontSize="12" fontWeight="600" fontFamily="IBM Plex Mono">
            {d.no}
          </text>
        </g>
        <g fontFamily="IBM Plex Sans" fontSize="6.5" fill="#66737e">
          <text x="20" y="246">
            NOTES
          </text>
          <text x="20" y="257">
            1. All structural concrete C35/20 OPC unless noted otherwise.
          </text>
          <text x="20" y="267">
            2. Blinding C20/20, 75 mm thick under all bases.
          </text>
          <text x="20" y="277">
            3. Dimensions in millimetres. Levels in metres PD.
          </text>
        </g>
      </svg>
    </div>
  );
}

export interface WorkspaceView {
  id: string;
  view: ViewMode;
  side: ElevationSide;
  label: string;
  icon: IconName;
}

export function ViewWorkspace({
  data,
  paint,
  onPick,
  onShowProps,
  onAlign2D,
  onClearSelection,
  showTools,
  bottomInset,
  views,
  isolateIds,
  hud
}: {
  data: ProjectData;
  paint: ViewportPaint;
  onPick: (id: string | null) => void;
  onShowProps: () => void;
  onAlign2D: () => void;
  onClearSelection: () => void;
  showTools: boolean;
  bottomInset: number;
  views: WorkspaceView[];
  isolateIds?: string[] | null;
  hud?: ElementHud | null;
}) {
  const [nav, setNav] = useState<NavMode>('orbit');
  const [unit, setUnit] = useState<'m' | 'mm'>('m');
  const [precision, setPrecision] = useState(3);
  const [section, setSection] = useState<Record<string, 'none' | 'box' | 'plane'>>({});
  const [sectionBoxes, setSectionBoxes] = useState<Record<string, SectionBoxSettings | undefined>>({});
  const [sectionPlanes, setSectionPlanes] = useState<Record<string, SectionPlaneSettings | undefined>>({});
  const [measuring, setMeasuring] = useState(false);
  const [measureKind, setMeasureKind] = useState<MeasureKind>('distance');
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [draft, setDraft] = useState<Point3[]>([]);
  const [draftIds, setDraftIds] = useState<Array<string | null>>([]);
  const [selectedMeasure, setSelectedMeasure] = useState<string | null>(null);
  const [measureMenu, setMeasureMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [snapInfo, setSnapInfo] = useState<SnapInfo | null>(null);
  const [measureNotice, setMeasureNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(views[0]?.id || 'persp');
  const [menu, setMenu] = useState<{ viewId: string; id: string | null; x: number; y: number } | null>(null);
  const [sectionSub, setSectionSub] = useState(false);
  const seq = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const apis = useRef<Record<string, ViewportApi | null>>({});
  const register = (id: string, api: ViewportApi | null) => {
    apis.current[id] = api;
  };
  const activeId = views.some(v => v.id === active) ? active : views[0]?.id || 'persp';
  const activeView = views.find(v => v.id === activeId);
  const sectionMode = section[activeId] || 'none';
  const activeBox = sectionBoxes[activeId] || null;
  const activePlane = sectionPlanes[activeId] || null;

  useEffect(() => {
    if (!views.some(v => v.id === active)) setActive(views[0]?.id || 'persp');
  }, [views, active]);

  const isolateSig = isolateIds?.join(',') || '';
  const viewSig = views.map(v => v.id).join(',');
  useEffect(() => {
    views.forEach(v => {
      const api = apis.current[v.id];
      if (!api) return;
      if (isolateIds && isolateIds.length) api.isolate(isolateIds);
      else api.showAll();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isolateSig, viewSig]);

  useEffect(() => {
    if (!showTools) {
      setMeasuring(false);
      setDraft([]);
      setDraftIds([]);
      setSnapInfo(null);
    }
  }, [showTools]);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  const showNotice = (message: string) => {
    setMeasureNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setMeasureNotice(''), 2400);
  };

  const clearDraft = () => {
    setDraft([]);
    setDraftIds([]);
  };
  const addMeasurement = (m: Omit<Measurement, 'id'>) => {
    seq.current += 1;
    const id = `m${seq.current}`;
    setMeasurements(prev => [...prev, { ...m, id }]);
    setSelectedMeasure(null);
    return id;
  };
  const commitSurface = (points: Point3[]) => {
    if (points.length < 3) return;
    addMeasurement({
      kind: 'surface',
      points: [...points],
      label: formatArea(polygonArea(points), unit, precision),
      detail: [`${points.length} points`]
    });
  };
  const measurePoint = (point: Point3, id: string | null, hitType?: HitType) => {
    if (!measuring) return;
    if (hitType && !MEASURE_ACCEPTS[measureKind].includes(hitType)) {
      const wants = MEASURE_ACCEPTS[measureKind].join(' or ');
      showNotice(`${measureTool(measureKind).label} accepts ${wants}, not a ${hitType}.`);
      return;
    }
    setMeasureNotice('');
    if (measureKind === 'distance') {
      if (!draft.length) {
        setDraft([point]);
        return;
      }
      addMeasurement({
        kind: 'distance',
        points: [draft[0], point],
        label: formatLen(pointDistance(draft[0], point), unit, precision)
      });
      clearDraft();
      return;
    }
    if (measureKind === 'angle') {
      if (draft.length < 2) {
        setDraft(prev => [...prev, point]);
        return;
      }
      addMeasurement({
        kind: 'angle',
        points: [draft[0], draft[1], point],
        label: `${angleAt(draft[0], draft[1], point).toFixed(1)}°`
      });
      clearDraft();
      return;
    }
    if (measureKind === 'coordinate') {
      addMeasurement({
        kind: 'coordinate',
        points: [point],
        label: `X ${formatLen(point[0], unit, precision)}`,
        detail: [`Y ${formatLen(point[1], unit, precision)}`, `Z ${formatLen(point[2], unit, precision)}`]
      });
      return;
    }
    if (measureKind === 'laser') {
      const level = nearestLevel(data.levels, point[1]);
      const delta = point[1] - level.y;
      addMeasurement({
        kind: 'laser',
        points: [point],
        ref: [point[0], level.y, point[2]],
        label: `Δ ${delta >= 0 ? '+' : '−'}${formatLen(Math.abs(delta), unit, precision)}`,
        detail: [`${level.name} · EL ${formatLen(level.y, unit, precision)}`]
      });
      return;
    }
    if (measureKind === 'surface') {
      setDraft(prev => [...prev, point]);
      return;
    }
    if (!id) return;
    if (!draftIds[0]) {
      setDraft([point]);
      setDraftIds([id]);
      return;
    }
    const a = data.elements.find(e => e.id === draftIds[0]);
    const b = data.elements.find(e => e.id === id);
    if (!a || !b) return;
    const gap = closestElementPoints(a, b);
    addMeasurement({
      kind: 'shortest',
      points: [gap.a, gap.b],
      label: formatLen(gap.value, unit, precision),
      detail: [`${a.mark} → ${b.mark}`],
      elementIds: [a.id, b.id]
    });
    clearDraft();
  };
  const enterMeasure = () => {
    setMeasuring(true);
    setMeasureKind('distance');
    setSelectedMeasure(null);
    setMeasureNotice('');
    setSnapInfo(null);
    clearDraft();
  };
  const doneMeasure = () => {
    if (measureKind === 'surface' && draft.length >= 3) commitSurface(draft);
    clearDraft();
    setMeasuring(false);
    setSelectedMeasure(null);
    setMeasureNotice('');
    setSnapInfo(null);
  };
  const changeMeasureKind = (kind: MeasureKind) => {
    setMeasureKind(kind);
    setMeasureNotice('');
    setSnapInfo(null);
    clearDraft();
  };
  const openMeasureMenu = (id: string, ev: ReactMouseEvent<SVGGElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    const r = root.current?.getBoundingClientRect();
    if (!r) return;
    setSelectedMeasure(id);
    setMeasureMenu({
      id,
      x: Math.max(8, Math.min(ev.clientX - r.left, r.width - 190)),
      y: Math.max(8, Math.min(ev.clientY - r.top, r.height - 70))
    });
    setMenu(null);
  };
  const deleteMeasurement = (id: string) => {
    setMeasurements(prev => prev.filter(m => m.id !== id));
    if (selectedMeasure === id) setSelectedMeasure(null);
    setMeasureMenu(null);
  };

  const home = () => apis.current[activeId]?.home();
  const fit = () => apis.current[activeId]?.focus(paint.sel ? [paint.sel] : paint.members);
  const selected = (id?: string | null) => (id ? [id] : paint.sel ? [paint.sel] : paint.members);
  const closeMenu = () => {
    setMenu(null);
    setSectionSub(false);
  };

  const applyBoxMode = (viewId: string, on: boolean, id?: string | null) => {
    const api = apis.current[viewId];
    if (!on) {
      setSection(s => ({ ...s, [viewId]: 'none' }));
      setSectionBoxes(s => ({ ...s, [viewId]: undefined }));
      api?.setSectionBox(false);
      return;
    }
    const b = boundsFor(data, selected(id));
    const settings: SectionBoxSettings = { min: b.min, max: b.max };
    setSection(s => ({ ...s, [viewId]: 'box' }));
    setSectionPlanes(s => ({ ...s, [viewId]: undefined }));
    setSectionBoxes(s => ({ ...s, [viewId]: settings }));
    api?.setSectionPlane(false);
    api?.setSectionBox(true, settings);
  };

  const applyPlaneMode = (viewId: string, on: boolean, id?: string | null) => {
    const api = apis.current[viewId];
    if (!on) {
      setSection(s => ({ ...s, [viewId]: 'none' }));
      setSectionPlanes(s => ({ ...s, [viewId]: undefined }));
      api?.setSectionPlane(false);
      return;
    }
    const b = boundsFor(data, selected(id));
    const axis = sectionPlanes[viewId]?.axis || 'x';
    const settings: SectionPlaneSettings = { axis, offset: centerOf(b, axis) };
    setSection(s => ({ ...s, [viewId]: 'plane' }));
    setSectionBoxes(s => ({ ...s, [viewId]: undefined }));
    setSectionPlanes(s => ({ ...s, [viewId]: settings }));
    api?.setSectionBox(false);
    api?.setSectionPlane(true, settings);
  };

  const toggleSection = (kind: 'box' | 'plane', viewId = activeId, id?: string | null) => {
    const next = section[viewId] !== kind;
    if (kind === 'box') applyBoxMode(viewId, next, id);
    else applyPlaneMode(viewId, next, id);
  };

  const updateBox = (viewId: string, settings: SectionBoxSettings) => {
    setSectionBoxes(s => ({ ...s, [viewId]: settings }));
    apis.current[viewId]?.setSectionBox(true, settings);
  };

  const updatePlane = (viewId: string, settings: SectionPlaneSettings) => {
    setSectionPlanes(s => ({ ...s, [viewId]: settings }));
    apis.current[viewId]?.setSectionPlane(true, settings);
  };

  const changePlaneAxis = (viewId: string, axis: SectionAxis) => {
    const b = boundsFor(data, selected());
    const settings: SectionPlaneSettings = { axis, offset: centerOf(b, axis) };
    updatePlane(viewId, settings);
  };

  const openContext = (viewId: string, id: string | null, ev: PointerEvent) => {
    setActive(viewId);
    if (id) onPick(id);
    const r = root.current?.getBoundingClientRect();
    if (!r) return;
    setMenu({
      viewId,
      id,
      x: Math.max(0, Math.min(ev.clientX - r.left, r.width - 220)),
      y: Math.max(0, Math.min(ev.clientY - r.top, r.height - 370))
    });
    setSectionSub(false);
  };

  return (
    <div className="apc-singleview" ref={root}>
      <div
        className={`apc-viewgrid apc-viewgrid--${Math.min(views.length, 6)}`}
        style={views.length > 1 ? { bottom: bottomInset } : undefined}
      >
        {views.map(v => (
          <section
            key={v.id}
            className={`apc-viewtile${views.length > 1 && activeId === v.id ? ' on' : ''}`}
            onPointerDown={() => setActive(v.id)}
          >
            <View3D
              tile={{ id: v.id, view: v.view, side: v.side, box: false, depth: 4, sheet: 'd1' }}
              data={data}
              paint={paint}
              boxIds={[]}
              hud={activeId === v.id ? hud ?? null : null}
              onPick={onPick}
              onContext={(id, ev) => openContext(v.id, id, ev)}
              register={register}
              measuring={measuring}
              measurements={measurements}
              draft={draft}
              draftKind={measureKind}
              selectedMeasure={selectedMeasure}
              onMeasurePoint={measurePoint}
              onMeasureHover={setSnapInfo}
              onMeasureSelect={setSelectedMeasure}
              onMeasureMenu={openMeasureMenu}
              onSectionChange={(kind, settings) => {
                if (kind === 'box') setSectionBoxes(s => ({ ...s, [v.id]: settings as SectionBoxSettings }));
                else setSectionPlanes(s => ({ ...s, [v.id]: settings as SectionPlaneSettings }));
              }}
              nav={nav}
              active={activeId === v.id}
            />
            <div className="apc-viewtile__label">
              <Icon name={v.icon} size={12} />
              {v.label}
            </div>
          </section>
        ))}
      </div>
      {showTools && (
        <TileTools
          nav={nav}
          setNav={setNav}
          section={sectionMode}
          onSectionBox={() => toggleSection('box')}
          onSectionPlane={() => toggleSection('plane')}
          unit={unit}
          setUnit={setUnit}
          precision={precision}
          setPrecision={setPrecision}
          measuring={measuring}
          measureKind={measureKind}
          setMeasureKind={changeMeasureKind}
          onMeasure={enterMeasure}
          onDone={doneMeasure}
          draftCount={draft.length}
          snap={snapInfo}
          notice={measureNotice}
          onFit={fit}
          onHome={home}
          canWalk={activeView?.view === 'persp'}
          bottomInset={bottomInset}
        />
      )}

      {showTools && !measuring && sectionMode !== 'none' && (
        <SectionControls
          box={sectionMode === 'box' ? activeBox : null}
          plane={sectionMode === 'plane' ? activePlane : null}
          bottom={bottomInset + 50}
          onBox={next => updateBox(activeId, next)}
          onPlane={next => updatePlane(activeId, next)}
          onAxis={axis => changePlaneAxis(activeId, axis)}
          onClose={() => toggleSection(sectionMode)}
        />
      )}

      {menu && (
        <>
          <div className="apc-ctxscrim" onPointerDown={closeMenu} />
          <div
            className="apc-ctxmenu"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={e => e.stopPropagation()}
          >
            <button
              className="apc-ctxitem"
              onClick={() => {
                onShowProps();
                closeMenu();
              }}
            >
              Show Properties
            </button>
            <button
              className="apc-ctxitem"
              onClick={() => {
                apis.current[menu.viewId]?.isolate(selected(menu.id));
                closeMenu();
              }}
            >
              Isolate
            </button>
            <button
              className="apc-ctxitem"
              onClick={() => {
                apis.current[menu.viewId]?.hide(selected(menu.id));
                closeMenu();
              }}
            >
              Hide Selected
            </button>
            <button
              className="apc-ctxitem"
              onClick={() => {
                apis.current[menu.viewId]?.showAll();
                closeMenu();
              }}
            >
              Show All Objects
            </button>
            <button
              className="apc-ctxitem"
              onClick={() => {
                apis.current[menu.viewId]?.focus(selected(menu.id));
                closeMenu();
              }}
            >
              Focus
            </button>
            <button
              className="apc-ctxitem"
              onClick={() => {
                apis.current[menu.viewId]?.pivot(selected(menu.id));
                closeMenu();
              }}
            >
              Pivot
            </button>
            <button
              className="apc-ctxitem"
              onClick={() => {
                onClearSelection();
                closeMenu();
              }}
            >
              Clear Selection
            </button>
            <button
              className="apc-ctxitem"
              onClick={() => {
                onAlign2D();
                closeMenu();
              }}
            >
              Align to 2D
            </button>
            <button className="apc-ctxitem" disabled>
              Paste
            </button>
            <div
              className="apc-ctxwrap"
              onMouseEnter={() => setSectionSub(true)}
              onMouseLeave={() => setSectionSub(false)}
            >
              <button className="apc-ctxitem apc-ctxitem--sub" onClick={() => setSectionSub(v => !v)}>
                Section <Icon name="chevron-right" size={12} />
              </button>
              {sectionSub && (
                <div className={`apc-ctxsub${menu.x > 640 ? ' apc-ctxsub--left' : ''}`}>
                  <button
                    className="apc-ctxitem"
                    onClick={() => {
                      toggleSection('box', menu.viewId, menu.id);
                      closeMenu();
                    }}
                  >
                    Section Box
                  </button>
                  <button
                    className="apc-ctxitem"
                    onClick={() => {
                      toggleSection('plane', menu.viewId, menu.id);
                      closeMenu();
                    }}
                  >
                    Section Plane
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {measureMenu && (
        <>
          <div className="apc-ctxscrim" onPointerDown={() => setMeasureMenu(null)} />
          <div
            className="apc-ctxmenu"
            style={{ left: measureMenu.x, top: measureMenu.y }}
            onPointerDown={e => e.stopPropagation()}
          >
            <button className="apc-ctxitem" onClick={() => deleteMeasurement(measureMenu.id)}>
              Delete measurement
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function PanoramaView({ pano }: { pano: Panorama }) {
  const [yaw, setYaw] = useState(-18);
  const drag = useRef<{ x: number; yaw: number; w: number } | null>(null);

  return (
    <div
      className="apc-pano"
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, yaw, w: e.currentTarget.clientWidth };
      }}
      onPointerMove={e => {
        const d = drag.current;
        if (!d) return;
        const next = d.yaw + ((e.clientX - d.x) / Math.max(1, d.w)) * 100;
        setYaw(Math.max(-50, Math.min(0, next)));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <div className="apc-pano__scene" style={{ transform: `translateX(${yaw}%)` }}>
        <svg viewBox="0 0 2400 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="apc-pano-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c8dbe7" />
              <stop offset="0.68" stopColor="#e6eef3" />
              <stop offset="1" stopColor="#f1f3f2" />
            </linearGradient>
            <linearGradient id="apc-pano-ground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d8d4c8" />
              <stop offset="1" stopColor="#b8b4a8" />
            </linearGradient>
            <linearGradient id="apc-pano-wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f7f5ef" />
              <stop offset="1" stopColor="#d9d6cc" />
            </linearGradient>
          </defs>
          <rect width="2400" height="560" fill="url(#apc-pano-sky)" />
          <rect y="560" width="2400" height="340" fill="url(#apc-pano-ground)" />
          <circle cx="1960" cy="150" r="64" fill="#fff8dc" opacity="0.8" />
          <path d="M0 540 L170 470 L340 520 L520 455 L720 525 L900 485 L1120 535 L1320 470 L1510 520 L1720 465 L1930 525 L2140 480 L2400 535 L2400 580 L0 580 Z" fill="#c7d1cf" opacity="0.75" />
          <g fill="none" stroke="#7c8a90" strokeWidth="2" opacity="0.5">
            <path d="M0 650 H2400" />
            <path d="M0 720 H2400" />
            <path d="M0 800 H2400" />
            <path d="M240 560 V900" />
            <path d="M600 560 V900" />
            <path d="M960 560 V900" />
            <path d="M1320 560 V900" />
            <path d="M1680 560 V900" />
            <path d="M2040 560 V900" />
          </g>
          <g>
            <rect x="305" y="275" width="420" height="300" fill="url(#apc-pano-wall)" stroke="#8f9798" strokeWidth="3" />
            <rect x="765" y="305" width="410" height="270" fill="url(#apc-pano-wall)" stroke="#8f9798" strokeWidth="3" />
            <rect x="1215" y="255" width="440" height="320" fill="url(#apc-pano-wall)" stroke="#8f9798" strokeWidth="3" />
            <rect x="1695" y="315" width="390" height="260" fill="url(#apc-pano-wall)" stroke="#8f9798" strokeWidth="3" />
            <g fill="#b6b7ae">
              <rect x="280" y="555" width="470" height="38" />
              <rect x="740" y="555" width="460" height="38" />
              <rect x="1190" y="555" width="490" height="38" />
              <rect x="1670" y="555" width="440" height="38" />
            </g>
            {[340, 440, 540, 640, 800, 900, 1000, 1100, 1250, 1350, 1450, 1550, 1730, 1830, 1930, 2030].map(x => (
              <g key={x}>
                <rect x={x} y="300" width="9" height="255" fill="#c9c9c0" opacity="0.7" />
              </g>
            ))}
          </g>
          <g fill="none" stroke="#a45b45" strokeWidth="5" opacity="0.65">
            <path d="M80 590 H520" />
            <path d="M80 650 H520" />
            <path d="M110 565 V670" />
            <path d="M250 565 V670" />
            <path d="M390 565 V670" />
          </g>
          <g transform="translate(2100 585)">
            <rect x="0" y="0" width="210" height="150" fill="#d8d4c8" stroke="#8f9798" strokeWidth="2" />
            <rect x="12" y="12" width="82" height="56" fill="#aebec4" />
            <rect x="106" y="12" width="92" height="126" fill="#b8c8ce" />
            <rect x="12" y="80" width="82" height="58" fill="#c3d1d5" />
          </g>
          <g fontFamily="IBM Plex Mono" fontSize="17" fill="#6f7c83">
            <text x="822" y="465">RW-03 · ZONE A</text>
            <text x="1274" y="425">RW-03 · ZONE B</text>
          </g>
          <g opacity="0.55" fill="#6f7c83">
            <circle cx="70" cy="90" r="8" />
            <circle cx="130" cy="90" r="8" />
            <circle cx="190" cy="90" r="8" />
            <circle cx="250" cy="90" r="8" />
          </g>
        </svg>
      </div>
      <div className="apc-pano__readout">
        {pano.no} · 360°
      </div>
    </div>
  );
}
