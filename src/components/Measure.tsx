import type { MouseEvent } from 'react';
import type { IconName } from './Icon';
import type { ElementData, Level } from '../lib/demo';
import type { SnapInfo, SnapType } from '../three/viewport';

export const SNAP_LABEL: Record<SnapType, string> = {
  cursor: 'cursor',
  point: 'point',
  line: 'line',
  face: 'face'
};

const SNAP_BLUE = '#1d78b5';

export type Point3 = [number, number, number];

export type MeasureKind = 'distance' | 'angle' | 'coordinate' | 'laser' | 'surface' | 'shortest';

export interface Measurement {
  id: string;
  kind: MeasureKind;
  points: Point3[];
  label: string;
  detail?: string[];
  ref?: Point3;
  elementIds?: [string, string];
}

export const MEASURE_TOOLS: Array<{
  kind: MeasureKind;
  label: string;
  hint: string;
  icon: IconName;
}> = [
  { kind: 'distance', label: 'Distance', hint: 'Pick two points', icon: 'ruler' },
  { kind: 'angle', label: 'Angle', hint: 'Pick three points', icon: 'pencil-ruler' },
  { kind: 'coordinate', label: 'Spot coordinate', hint: 'Pick one point', icon: 'crosshair' },
  { kind: 'laser', label: 'Laser', hint: 'Pick one point for height to its level', icon: 'zap' },
  { kind: 'surface', label: 'Surface', hint: 'Pick three or more points, then Done', icon: 'scan' },
  { kind: 'shortest', label: 'Shortest distance', hint: 'Pick two elements', icon: 'arrow-left-right' }
];

export const measureTool = (kind: MeasureKind) => MEASURE_TOOLS.find(t => t.kind === kind)!;

export const formatLen = (value: number, unit: 'm' | 'mm', precision: number) => {
  const v = unit === 'mm' ? value * 1000 : value;
  return `${v.toFixed(precision)} ${unit}`;
};

export const formatArea = (value: number, unit: 'm' | 'mm', precision: number) => {
  const v = unit === 'mm' ? value * 1_000_000 : value;
  return `${v.toFixed(precision)} ${unit}²`;
};

export const distance = (a: Point3, b: Point3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

export function angleAt(a: Point3, b: Point3, c: Point3) {
  const v1: Point3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const v2: Point3 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const l1 = Math.hypot(...v1);
  const l2 = Math.hypot(...v2);
  if (l1 < 1e-9 || l2 < 1e-9) return 0;
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  return (Math.acos(Math.max(-1, Math.min(1, dot / (l1 * l2)))) * 180) / Math.PI;
}

export function polygonArea(points: Point3[]) {
  if (points.length < 3) return 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    nx += a[1] * b[2] - a[2] * b[1];
    ny += a[2] * b[0] - a[0] * b[2];
    nz += a[0] * b[1] - a[1] * b[0];
  }
  return Math.hypot(nx, ny, nz) / 2;
}

export function nearestLevel(levels: Level[], y: number) {
  if (!levels.length) return { name: 'Datum', y: 0 };
  return levels.reduce((best, level) => (Math.abs(level.y - y) < Math.abs(best.y - y) ? level : best), levels[0]);
}

const axisGap = (aMin: number, aMax: number, bMin: number, bMax: number) => {
  if (aMax < bMin) return { a: aMax, b: bMin, gap: bMin - aMax };
  if (bMax < aMin) return { a: aMin, b: bMax, gap: aMin - bMax };
  const mid = (Math.max(aMin, bMin) + Math.min(aMax, bMax)) / 2;
  return { a: mid, b: mid, gap: 0 };
};

export function closestElementPoints(a: ElementData, b: ElementData) {
  const box = (el: ElementData) => {
    const [x, y, z, L, H, W] = el.box;
    return {
      min: [x - L / 2, y - H / 2, z - W / 2] as Point3,
      max: [x + L / 2, y + H / 2, z + W / 2] as Point3
    };
  };
  const ba = box(a);
  const bb = box(b);
  const gx = axisGap(ba.min[0], ba.max[0], bb.min[0], bb.max[0]);
  const gy = axisGap(ba.min[1], ba.max[1], bb.min[1], bb.max[1]);
  const gz = axisGap(ba.min[2], ba.max[2], bb.min[2], bb.max[2]);
  const pa: Point3 = [gx.a, gy.a, gz.a];
  const pb: Point3 = [gx.b, gy.b, gz.b];
  return { a: pa, b: pb, value: Math.hypot(gx.gap, gy.gap, gz.gap) };
}

const COLORS: Record<MeasureKind, string> = {
  distance: '#176891',
  angle: '#6b4fb3',
  coordinate: '#1f7a4c',
  laser: '#c2412d',
  surface: '#176891',
  shortest: '#a86400'
};

const labelStyle = {
  fontSize: 11,
  fontFamily: 'IBM Plex Mono',
  fill: '#11506f',
  paintOrder: 'stroke',
  stroke: '#fff',
  strokeWidth: 3.5
} as const;

const point = (p: { x: number; y: number } | null) => p || { x: 0, y: 0 };

function Endpoint({ p, color, hollow = false }: { p: { x: number; y: number }; color: string; hollow?: boolean }) {
  return (
    <circle
      cx={p.x}
      cy={p.y}
      r={3.5}
      fill={hollow ? '#fff' : color}
      stroke={color}
      strokeWidth={1.5}
      pointerEvents="none"
    />
  );
}

function Label({
  x,
  y,
  lines,
  color,
  anchor = 'middle'
}: {
  x: number;
  y: number;
  lines: string[];
  color: string;
  anchor?: 'middle' | 'start';
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} {...labelStyle} fill={color} pointerEvents="none">
      {lines.map((line, i) => (
        <tspan key={line + i} x={x} dy={i === 0 ? 0 : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function MeasureOverlay({
  measurements,
  draft,
  draftKind,
  selected,
  interactive,
  onSelect,
  onMenu,
  project
}: {
  measurements: Measurement[];
  draft: Point3[];
  draftKind: MeasureKind;
  selected: string | null;
  interactive: boolean;
  onSelect: (id: string) => void;
  onMenu: (id: string, ev: MouseEvent<SVGGElement>) => void;
  project: (x: number, y: number, z: number) => { x: number; y: number } | null;
}) {
  const draftScreen = draft.map(p => project(...p));
  const labelLayout = new Map<string, { x: number; y: number; lines: string[]; anchor: 'middle' | 'start' }>();
  const placed: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  measurements.forEach(m => {
    const pts = m.points.map(p => project(...p));
    if (pts.some(p => !p)) return;
    const screen = pts.map(p => point(p));
    let x = 0;
    let y = 0;
    let anchor: 'middle' | 'start' = 'middle';
    if (m.kind === 'distance' || m.kind === 'shortest') {
      x = (screen[0].x + screen[1].x) / 2;
      y = (screen[0].y + screen[1].y) / 2 - 8;
    } else if (m.kind === 'angle') {
      x = screen[1].x + 12;
      y = screen[1].y - 10;
      anchor = 'start';
    } else if (m.kind === 'coordinate') {
      x = screen[0].x + 13;
      y = screen[0].y - 12;
      anchor = 'start';
    } else if (m.kind === 'laser') {
      x = screen[0].x + 10;
      y = screen[0].y - 10;
      anchor = 'start';
    } else {
      x = screen.reduce((sum, p) => sum + p.x, 0) / screen.length;
      y = screen.reduce((sum, p) => sum + p.y, 0) / screen.length - 8;
    }
    const lines = [m.label, ...(m.detail || [])];
    const width = Math.max(44, Math.max(...lines.map(line => line.length)) * 6.4);
    const height = lines.length * 12 + 3;
    const x1 = anchor === 'middle' ? x - width / 2 : x;
    let top = y - 10;
    for (let i = 0; i < 26; i += 1) {
      const hit = placed.some(
        b => x1 < b.x2 + 3 && x1 + width > b.x1 - 3 && top < b.y2 + 3 && top + height > b.y1 - 3
      );
      if (!hit || top < 6) break;
      y -= 14;
      top -= 14;
    }
    placed.push({ x1, y1: top, x2: x1 + width, y2: top + height });
    labelLayout.set(m.id, { x, y, lines, anchor });
  });

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 4 }}
      aria-label="Measurements"
    >
      {measurements.map(m => {
        const pts = m.points.map(p => project(...p));
        if (pts.some(p => !p)) return null;
        const screen = pts.map(p => point(p));
        const color = COLORS[m.kind];
        const on = selected === m.id;
        const lab = labelLayout.get(m.id)!;
        const line = (a: { x: number; y: number }, b: { x: number; y: number }, dashed = false) => (
          <>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth={14}
              pointerEvents={interactive ? 'stroke' : 'none'}
            />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={on ? '#1e6fff' : color}
              strokeWidth={on ? 2.6 : 1.7}
              strokeDasharray={dashed ? '5 3' : undefined}
              pointerEvents="none"
            />
          </>
        );

        let body = null;
        if (m.kind === 'distance' || m.kind === 'shortest') {
          body = (
            <>
              {line(screen[0], screen[1], m.kind === 'shortest')}
              <Endpoint p={screen[0]} color={color} hollow />
              <Endpoint p={screen[1]} color={color} />
              <Label x={lab.x} y={lab.y} lines={lab.lines} color={color} anchor={lab.anchor} />
            </>
          );
        } else if (m.kind === 'angle') {
          body = (
            <>
              {line(screen[0], screen[1])}
              {line(screen[1], screen[2])}
              <Endpoint p={screen[0]} color={color} hollow />
              <Endpoint p={screen[1]} color={color} />
              <Endpoint p={screen[2]} color={color} />
              <Label x={lab.x} y={lab.y} lines={lab.lines} color={color} anchor={lab.anchor} />
            </>
          );
        } else if (m.kind === 'coordinate') {
          const c = on ? '#1e6fff' : color;
          body = (
            <>
              <circle cx={screen[0].x} cy={screen[0].y} r={7} fill="none" stroke={c} strokeWidth={on ? 2 : 1.2} />
              <line x1={screen[0].x - 11} y1={screen[0].y} x2={screen[0].x + 11} y2={screen[0].y} stroke={c} strokeWidth={0.9} />
              <line x1={screen[0].x} y1={screen[0].y - 11} x2={screen[0].x} y2={screen[0].y + 11} stroke={c} strokeWidth={0.9} />
              <Endpoint p={screen[0]} color={c} />
              <Label x={lab.x} y={lab.y} lines={lab.lines} color={c} anchor={lab.anchor} />
            </>
          );
        } else if (m.kind === 'laser' && m.ref) {
          const ref = project(...m.ref);
          const end = ref ? point(ref) : screen[0];
          body = (
            <>
              {line(end, screen[0], true)}
              <Endpoint p={end} color={color} hollow />
              <Endpoint p={screen[0]} color={color} />
              <Label x={lab.x} y={lab.y} lines={lab.lines} color={color} anchor={lab.anchor} />
            </>
          );
        } else if (m.kind === 'surface') {
          const points = screen.map(p => `${p.x},${p.y}`).join(' ');
          body = (
            <>
              <polygon
                points={points}
                fill="rgba(23, 104, 145, 0.12)"
                stroke={on ? '#1e6fff' : color}
                strokeWidth={on ? 2.4 : 1.5}
                strokeDasharray="4 2"
              />
              {screen.map((p, i) => (
                <Endpoint key={i} p={p} color={color} hollow={i === 0} />
              ))}
              <Label x={lab.x} y={lab.y} lines={lab.lines} color={color} anchor={lab.anchor} />
            </>
          );
        }

        return (
          <g
            key={m.id}
            pointerEvents={interactive ? 'auto' : 'none'}
            style={{ cursor: interactive ? 'pointer' : 'default' }}
            onClick={ev => {
              ev.stopPropagation();
              onSelect(m.id);
            }}
            onContextMenu={ev => onMenu(m.id, ev)}
          >
            {body}
          </g>
        );
      })}

      {draft.length > 0 &&
        (() => {
          const first = draftScreen[0];
          if (!first) return null;
          const color = COLORS[draftKind];
          const p0 = point(first);
          if (draftKind === 'surface' && draftScreen.length > 1) {
            const pts = draftScreen.filter(Boolean).map(p => point(p));
            return (
              <g pointerEvents="none">
                <polyline
                  points={pts.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(23, 104, 145, 0.08)"
                  stroke={color}
                  strokeWidth={1.4}
                  strokeDasharray="4 2"
                />
                {pts.map((p, i) => (
                  <Endpoint key={i} p={p} color={color} hollow />
                ))}
              </g>
            );
          }
          const second = draftScreen[1];
          const p1 = second ? point(second) : null;
          return (
            <g pointerEvents="none">
              {p1 && (
                <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={color} strokeWidth={1.3} strokeDasharray="4 2" />
              )}
              {draftScreen.map((p, i) => p && <Endpoint key={i} p={point(p)} color={color} hollow />)}
            </g>
          );
        })()}
    </svg>
  );
}

export function SnapOverlay({ info }: { info: SnapInfo | null }) {
  if (!info || !info.candidates.length) return null;
  const active = info.active;
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6 }}
      aria-label="Snap candidates"
    >
      {info.candidates.map((candidate, i) => {
        const on = i === active;
        if (candidate.face) {
          return (
            <polygon
              key="face"
              points={candidate.face.map(p => `${p.x},${p.y}`).join(' ')}
              fill={SNAP_BLUE}
              fillOpacity={on ? 0.22 : 0.1}
              stroke={SNAP_BLUE}
              strokeOpacity={on ? 0.95 : 0.5}
              strokeWidth={on ? 1.8 : 1}
            />
          );
        }
        return null;
      })}
      {info.candidates.map((candidate, i) => {
        const on = i === active;
        if (!candidate.edge) return null;
        return (
          <line
            key="line"
            x1={candidate.edge[0].x}
            y1={candidate.edge[0].y}
            x2={candidate.edge[1].x}
            y2={candidate.edge[1].y}
            stroke={SNAP_BLUE}
            strokeOpacity={on ? 1 : 0.65}
            strokeWidth={on ? 2.6 : 1.4}
            strokeLinecap="round"
          />
        );
      })}
      {info.candidates.map((candidate, i) => {
        const on = i === active;
        if (candidate.type !== 'point') return null;
        const size = on ? 12 : 9;
        return (
          <rect
            key="point"
            x={candidate.screen.x - size / 2}
            y={candidate.screen.y - size / 2}
            width={size}
            height={size}
            fill={on ? '#dceefa' : '#fff'}
            stroke={SNAP_BLUE}
            strokeOpacity={on ? 1 : 0.75}
            strokeWidth={on ? 2.2 : 1.4}
          />
        );
      })}
    </svg>
  );
}
