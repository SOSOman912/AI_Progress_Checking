export type BqState =
  | 'generated'
  | 'calculated'
  | 'user'
  | 'override'
  | 'missing'
  | 'ambiguous'
  | 'confirmed'
  | 'custom';

export type Box = [number, number, number, number, number, number];

export interface Evidence {
  sheet: string;
  note: string;
  value: string;
}

export interface DrawingDiff {
  sheet: string;
  field: string;
  drawing: number;
  model: number;
}

export interface ElementDemoProps {
  status: string;
  projectCode: string;
  role: string;
  vendor: string;
  globalId: string;
  storey: string;
  zone: string;
  grade: string;
  audit: string;
  deduction: number;
  netConcrete: number;
  formwork: number;
  rebar: number;
  ip11: string;
}

export interface ElementData {
  id: string;
  file: string;
  mark: string;
  name: string;
  cls: string;
  type: string;
  level: string;
  zone?: string;
  mat: string;
  box: Box;
  openings: number;
  pset: Record<string, string>;
  evidence?: Evidence;
  drawingDiff?: DrawingDiff;
  props?: ElementDemoProps;
  gross: number;
  vol: number;
  net: number;
  gid: string;
  matSource: string | null;
}

export interface RuleDeduction {
  t: string;
  d: string;
}

export interface RuleExtract {
  slot: string;
  attr: string;
  regex: string;
}

export interface RuleDef {
  id: string;
  title: string;
  version: string;
  draft: boolean;
  ref: string;
  unit: string;
  basis: string;
  source: string;
  extract: RuleExtract[];
  deductions: RuleDeduction[];
  rounding: string;
}

export interface LineFilter {
  cls: string;
  grade?: string;
  cement?: string;
  ptype?: string;
}

export interface Certification {
  period: string;
  date: string;
  qty: number;
}

export interface MeasureGroup {
  title: string;
  description: string;
}

export interface BillLine {
  id: string;
  type: 'section' | 'group' | 'item' | 'note';
  label: string;
  lv?: number;
  measureGroups?: MeasureGroup[];
  no?: string;
  unit?: string;
  rate?: number | null;
  ce?: number | null;
  rule?: string;
  filter?: LineFilter;
  override?: number | null;
  contractQty?: number;
  certifications?: Certification[];
  adjustments?: Record<string, number>;
  reason?: string;
  state?: BqState;
  calc?: number;
  members?: string[];
  missingIds?: string[];
}

export interface ProjectInfo {
  name: string;
  contract: string;
  standard: string;
  revision: string;
}

export interface IfcFile {
  id: string;
  name: string;
  count: number;
  drawings: string[];
}

export interface Drawing {
  id: string;
  file: string;
  no: string;
  title: string;
  cut: string;
  show: string[];
}

export interface Panorama {
  id: string;
  file: string;
  no: string;
  title: string;
  location: string;
  captured: string;
}

export interface Level {
  name: string;
  y: number;
}

export interface GridLine {
  n: string;
  v: number;
}

export interface ProjectData {
  project: ProjectInfo;
  files: IfcFile[];
  drawings: Drawing[];
  panoramas: Panorama[];
  levels: Level[];
  grids: { x: GridLine[]; z: GridLine[] };
  elements: ElementData[];
  rules: Record<string, RuleDef>;
  bill: { title: string; lines: BillLine[] };
}

export interface EvaluatedLine {
  members: ElementData[];
  missing: ElementData[];
  excluded: ElementData[];
  byClass: ElementData[];
  calc: number;
}

export interface MaterialParts {
  grade: string | null;
  cement: string | null;
  ptype: string | null;
}

const rawElements: Omit<ElementData, 'gross' | 'vol' | 'net' | 'gid' | 'matSource'>[] = [
  { id: 'e1', file: 'f1', mark: 'W-A', name: 'Stem A', cls: 'IfcWall', type: 'RW stem 800', level: 'L01', mat: 'C35/20_OPC', box: [-4.05, 2.45, -0.5, 4.0, 3.7, 0.8], openings: 0.021, pset: { Reference: 'RW-800', LoadBearing: 'TRUE', IsExternal: 'TRUE' } },
  { id: 'e2', file: 'f1', mark: 'W-B', name: 'Stem B', cls: 'IfcWall', type: 'RW stem 800', level: 'L01', mat: 'C35/20_OPC', box: [0, 2.45, -0.5, 4.0, 3.7, 0.8], openings: 0.021, pset: { Reference: 'RW-800', LoadBearing: 'TRUE', IsExternal: 'TRUE' } },
  { id: 'e3', file: 'f1', mark: 'W-C', name: 'Stem C', cls: 'IfcWall', type: 'RW stem 800', level: 'L01', mat: 'C35/20_OPC', box: [4.1, 2.45, -0.5, 4.1, 3.7, 0.8], openings: 0.021, pset: { Reference: 'RW-800', LoadBearing: 'TRUE', IsExternal: 'TRUE' }, drawingDiff: { sheet: 'S-201', field: 'Length', drawing: 4.0, model: 4.1 } },
  { id: 'e4', file: 'f1', mark: 'B-A', name: 'Base A', cls: 'IfcFooting', type: 'RW base 2600', level: 'L00', mat: 'C35/20_OPC', box: [-4.05, 0.3, 0, 4.0, 0.6, 2.6], openings: 0, pset: { Reference: 'RW-B2600', LoadBearing: 'TRUE' } },
  { id: 'e5', file: 'f1', mark: 'B-B', name: 'Base B', cls: 'IfcFooting', type: 'RW base 2600', level: 'L00', mat: '', box: [0, 0.3, 0, 4.0, 0.6, 2.6], openings: 0, pset: { Reference: 'RW-B2600', LoadBearing: 'TRUE' }, evidence: { sheet: 'S-201', note: 'Note 1 — All structural concrete C35/20 OPC unless noted otherwise.', value: 'C35/20_OPC' } },
  { id: 'e6', file: 'f1', mark: 'B-C', name: 'Base C', cls: 'IfcFooting', type: 'RW base 2600', level: 'L00', mat: 'C35/20_OPC', box: [4.1, 0.3, 0, 4.1, 0.6, 2.6], openings: 0, pset: { Reference: 'RW-B2600', LoadBearing: 'TRUE' } },
  { id: 'e7', file: 'f1', mark: 'BL-1', name: 'Blinding', cls: 'IfcSlab', type: 'Blinding 75', level: 'L00', mat: 'C20/20_BLINDING', box: [0.025, -0.0375, 0, 12.2, 0.075, 2.8], openings: 0, pset: { Reference: 'BL-75', PredefinedType: 'BASESLAB' } },
  { id: 'e8', file: 'f1', mark: 'CP-A', name: 'Coping A', cls: 'IfcBeam', type: 'Precast coping CP1', level: 'L02', mat: 'PRECAST_CP1', box: [-4.05, 4.4, -0.5, 4.0, 0.2, 0.9], openings: 0, pset: { Reference: 'CP1' } },
  { id: 'e9', file: 'f1', mark: 'CP-B', name: 'Coping B', cls: 'IfcBeam', type: 'Precast coping CP1', level: 'L02', mat: 'PRECAST_CP1', box: [0, 4.4, -0.5, 4.0, 0.2, 0.9], openings: 0, pset: { Reference: 'CP1' } },
  { id: 'e10', file: 'f1', mark: 'CP-C', name: 'Coping C', cls: 'IfcBeam', type: 'Precast coping CP1', level: 'L02', mat: 'PRECAST_CP1', box: [4.1, 4.4, -0.5, 4.1, 0.2, 0.9], openings: 0, pset: { Reference: 'CP1' } },
  {
    id: 'e11',
    file: 'f1',
    mark: 'C-201',
    name: 'RC Column C1',
    cls: 'IfcColumn',
    type: 'RC column 800',
    level: 'L02',
    zone: 'Zone A',
    mat: 'C60/20_OPC',
    box: [7.4, 5.9, 0.2, 0.8, 3.2, 0.8],
    openings: 0.128,
    pset: { Reference: 'HK-BIM-R04', LoadBearing: 'TRUE' },
    props: {
      status: 'Cleansed',
      projectCode: 'BK-KT-2026-01',
      role: '下家 (Subcontractor)',
      vendor: '泰昌結構混凝土工程有限公司 (Tai Cheong RC Subcontractor - 下家)',
      globalId: '3K9Ts$p1A5Bc9PQrw1XMNP',
      storey: 'L02',
      zone: 'Zone A',
      grade: 'C60/20',
      audit: '✓ 參數齊備',
      deduction: -0.128,
      netConcrete: 1.92,
      formwork: 9.6,
      rebar: 0.386,
      ip11: '100% / 100%'
    }
  }
];

const elements: ElementData[] = rawElements.map((e, i) => {
  const [, , , L, H, W] = e.box;
  const gross = +(L * H * W).toFixed(3);
  return {
    ...e,
    zone: e.zone || (e.mark.endsWith('-C') ? 'Zone B' : 'Zone A'),
    gross,
    vol: gross,
    net: +(gross - e.openings).toFixed(3),
    gid: '2Xb$8kq1T0vH6p3QZ1aA' + String(i + 1).padStart(2, '0'),
    matSource: e.mat ? 'IFC' : null
  };
});

const rawData: ProjectData = {
  project: { name: 'Tung Chung RW-03', contract: 'CV/2026/014', standard: 'HKCESMM 2011', revision: 'Rev C' },
  files: [
    { id: 'f1', name: 'RW-03_Structure.ifc', count: 11, drawings: ['d1', 'd2'] },
    { id: 'f2', name: 'RW-03_Earthworks.ifc', count: 3, drawings: [] }
  ],
  drawings: [
    { id: 'd1', file: 'f1', no: 'S-201', title: 'General arrangement plan', cut: '+1.500', show: ['IfcFooting', 'IfcWall', 'IfcSlab'] },
    { id: 'd2', file: 'f1', no: 'S-202', title: 'Plan at top of wall', cut: '+4.500', show: ['IfcWall', 'IfcBeam'] }
  ],
  panoramas: [
    { id: 'p1', file: 'f1', no: 'P-01', title: 'Site walkthrough — Zone A', location: 'North working platform', captured: '10 Nov 2026 09:42' },
    { id: 'p2', file: 'f1', no: 'P-02', title: 'Site walkthrough — Zone B', location: 'East access ramp', captured: '10 Nov 2026 10:15' }
  ],
  levels: [{ name: 'L00', y: 0 }, { name: 'L01', y: 0.6 }, { name: 'L02', y: 4.3 }],
  grids: {
    x: [{ n: '1', v: -6.05 }, { n: '2', v: -2.05 }, { n: '3', v: 2.05 }, { n: '4', v: 6.15 }],
    z: [{ n: 'A', v: -0.5 }, { n: 'B', v: 1.3 }]
  },
  elements,
  rules: {
    'S12-INSITU-VOL': {
      id: 'S12-INSITU-VOL',
      title: 'In-situ concrete — volume',
      version: '0.3',
      draft: true,
      ref: 'HKCESMM 2011 · Section 12',
      unit: 'm³',
      basis: 'Volume of concrete placed',
      source: 'Gross volume — IFC base quantities (Qto_*BaseQuantities.GrossVolume)',
      extract: [
        { slot: 'Grade', attr: 'Material', regex: '(C\\d+\\s*/\\s*\\d+)' },
        { slot: 'Cement', attr: 'Material', regex: '_([^_]+)$' }
      ],
      deductions: [
        { t: 'Openings and voids, each ≤ 0.1 m³', d: 'Not deducted' },
        { t: 'Reinforcement and cast-in components', d: 'Not deducted' }
      ],
      rounding: 'Sum of elements, then round to 3 dp'
    },
    'S12-PRECAST-NR': {
      id: 'S12-PRECAST-NR',
      title: 'Precast concrete — number',
      version: '0.2',
      draft: true,
      ref: 'HKCESMM 2011 · Section 12',
      unit: 'nr',
      basis: 'Number of units of each type and size',
      source: 'Count of elements with matching type mark',
      extract: [{ slot: 'Type', attr: 'Material', regex: 'PRECAST_(\\w+)' }],
      deductions: [],
      rounding: 'Whole number'
    }
  },
  bill: {
    title: 'Bill No. 2 — Concrete',
    lines: [
      {
        id: 'n1',
        type: 'section',
        label: 'Section 12  In-situ concrete',
        lv: 0,
        measureGroups: [
          { title: 'Concrete grade', description: 'Different grades of concrete' },
          { title: 'Cement or pulverised fuel ash', description: 'Different types of cement, or pulverised fuel ash' },
          { title: 'Blinding or no-fines', description: 'Blinding concrete, or no-fines concrete' }
        ]
      },
      { id: 'n2', type: 'group', label: 'Provision of concrete, designed mix', lv: 1 },
      { id: 'n3', type: 'item', no: '2.10', label: 'Grade C35/20, OPC; in bases', unit: 'm³', rate: 1420, rule: 'S12-INSITU-VOL', filter: { cls: 'IfcFooting', grade: 'C35/20', cement: 'OPC' }, override: null, contractQty: 12.5, certifications: [{ period: 'IP-01', date: '2026-09-30', qty: 4.2 }, { period: 'IP-02', date: '2026-10-30', qty: 3.3 }, { period: 'IP-03', date: '2026-11-13', qty: 1.5 }], ce: 42000, state: 'calculated' },
      { id: 'n4', type: 'item', no: '2.11', label: 'Grade C35/20, OPC; in walls', unit: 'm³', rate: 1420, rule: 'S12-INSITU-VOL', filter: { cls: 'IfcWall', grade: 'C35/20', cement: 'OPC' }, override: null, contractQty: 35, certifications: [{ period: 'IP-01', date: '2026-09-30', qty: 12.5 }, { period: 'IP-02', date: '2026-10-30', qty: 8.5 }, { period: 'IP-03', date: '2026-11-13', qty: 6 }], ce: 45600, state: 'calculated' },
      { id: 'n5', type: 'item', no: '2.12', label: 'Grade C20/20 blinding, 75 mm thick', unit: 'm³', rate: 1180, rule: 'S12-INSITU-VOL', filter: { cls: 'IfcSlab', grade: 'C20/20', cement: 'BLINDING' }, override: 2.8, contractQty: 2.8, adjustments: { e7: 0.238 }, certifications: [{ period: 'IP-01', date: '2026-09-30', qty: 0.9 }, { period: 'IP-02', date: '2026-10-30', qty: 0.9 }, { period: 'IP-03', date: '2026-11-13', qty: 0.6 }], reason: 'Over-break allowance agreed at site meeting 04.', ce: 40900, state: 'override' },
      { id: 'n6', type: 'group', label: 'Precast concrete', lv: 1 },
      { id: 'n7', type: 'item', no: '2.20', label: 'Copings, type CP1, 900 × 200 mm', unit: 'nr', rate: null, rule: 'S12-PRECAST-NR', filter: { cls: 'IfcBeam', ptype: 'CP1' }, override: null, contractQty: 3, certifications: [{ period: 'IP-01', date: '2026-09-30', qty: 1 }, { period: 'IP-02', date: '2026-10-30', qty: 1 }, { period: 'IP-03', date: '2026-11-13', qty: 0 }], state: 'confirmed' },
      { id: 'n8', type: 'note', label: 'Rates include for curing and protection.', lv: 1 }
    ]
  }
};

export function parseMat(mat: string): MaterialParts {
  const g = (mat || '').match(/C\d+\s*\/\s*\d+/);
  const p = (mat || '').match(/PRECAST_(\w+)/);
  const parts = (mat || '').split('_');
  return {
    grade: g ? g[0].replace(/\s/g, '') : null,
    cement: g && parts.length > 1 ? parts[parts.length - 1] : null,
    ptype: p ? p[1] : null
  };
}

export function evaluate(line: BillLine, pool: ElementData[]): EvaluatedLine {
  const f = line.filter as LineFilter;
  const byClass = pool.filter(e => e.cls === f.cls);
  const members: ElementData[] = [];
  const missing: ElementData[] = [];
  const excluded: ElementData[] = [];
  byClass.forEach(e => {
    const m = parseMat(e.mat);
    if (f.ptype) {
      (m.ptype === f.ptype ? members : excluded).push(e);
      return;
    }
    if (!m.grade) {
      missing.push(e);
      return;
    }
    (m.grade === f.grade && m.cement === f.cement ? members : excluded).push(e);
  });
  const calc = line.unit === 'nr' ? members.length : +members.reduce((s, e) => s + e.vol, 0).toFixed(3);
  return { members, missing, excluded, byClass, calc };
}

export function recalc(data: ProjectData): ProjectData {
  const lines = data.bill.lines.map(l => {
    if (l.type !== 'item') return l;
    const r = evaluate(l, data.elements);
    let state: BqState = (l.state || 'calculated') as BqState;
    if (l.override != null) state = 'override';
    else if (r.missing.length) state = 'missing';
    else if (r.members.some(e => e.matSource && e.matSource !== 'IFC')) state = l.state === 'confirmed' ? 'confirmed' : 'user';
    else if (state !== 'confirmed') state = 'calculated';
    return { ...l, calc: r.calc, members: r.members.map(e => e.id), missingIds: r.missing.map(e => e.id), state };
  });
  return { ...data, bill: { ...data.bill, lines } };
}

export const demoData: ProjectData = recalc(rawData);
