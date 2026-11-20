export type SmmStandard = 'cesmm' | 'hksmm';

export interface SmmGroup {
  id: string;
  name: string;
  feature: string;
}

export interface SmmItem {
  id: string;
  standard: SmmStandard;
  sectionNo: number;
  name: string;
  unit: string;
  basis: string;
  bq?: string;
  groups: SmmGroup[];
}

export interface MeasureMapRow {
  id: string;
  target: string;
  attribute: string;
  separator: string;
  regex: string;
  displayName: string;
}

export const SMM_SECTIONS: Array<[number, string]> = [
  [1, 'Preliminaries'],
  [2, 'Ground investigation'],
  [3, 'Site clearance'],
  [4, 'Fencing'],
  [5, 'Drainage and ducts'],
  [6, 'Pipework'],
  [7, 'Earthworks'],
  [8, 'Roads and pavings'],
  [9, 'Piling'],
  [10, 'Formwork'],
  [11, 'Steel reinforcement'],
  [12, 'Concrete'],
  [13, 'Post-tensioned prestressing'],
  [14, 'Steelwork'],
  [15, 'Waterproofing'],
  [16, 'Bearings and movement joints'],
  [17, 'Marine works'],
  [18, 'Tunnelling'],
  [19, 'Geotechnical works'],
  [20, 'Railway works'],
  [21, 'Solid waste disposal'],
  [22, 'Brickwork and masonry'],
  [23, 'Finishings'],
  [24, 'Landscape softworks'],
  [25, 'Testing'],
  [26, 'Miscellaneous'],
  [27, 'Daywork']
];

export const SMM_ITEMS: SmmItem[] = [
  {
    id: 's12-insitu',
    standard: 'cesmm',
    sectionNo: 12,
    name: 'In-situ concrete',
    unit: 'm³',
    basis: 'Volume',
    bq: 'A-C35',
    groups: [
      { id: 'grade', name: 'Concrete grade', feature: 'Different grades of concrete' },
      { id: 'cement', name: 'Cement or pulverised fuel ash', feature: 'Different types of cement, or pulverised fuel ash' },
      { id: 'special', name: 'Blinding or no-fines', feature: 'Blinding concrete, or no-fines concrete' }
    ]
  },
  {
    id: 's12-precast',
    standard: 'cesmm',
    sectionNo: 12,
    name: 'Precast concrete',
    unit: 'nr',
    basis: 'Number, or linear metre for uniform copings',
    bq: 'B-PC',
    groups: [
      { id: 'kind', name: 'Member kind', feature: 'Precast copings, or members, slabs, units and specially moulded blocks' },
      { id: 'type', name: 'Type', feature: 'Different types' },
      { id: 'size', name: 'Size', feature: 'Different sizes' },
      { id: 'curved', name: 'Curved', feature: 'Curved' }
    ]
  },
  {
    id: 's12-face',
    standard: 'cesmm',
    sectionNo: 12,
    name: 'Treatment to faces of in-situ concrete',
    unit: 'm²',
    basis: 'Area',
    groups: [
      {
        id: 'treatment',
        name: 'Face treatment',
        feature:
          'Exposed aggregate, point tooled, bush hammered, broken rib, light blasting, heavy blasting, or another stated treatment'
      }
    ]
  },
  {
    id: 's7-excavation',
    standard: 'cesmm',
    sectionNo: 7,
    name: 'Excavation',
    unit: 'm³',
    basis: 'Volume',
    groups: []
  },
  {
    id: 's7-deposition',
    standard: 'cesmm',
    sectionNo: 7,
    name: 'Deposition of fill',
    unit: 'm³',
    basis: 'Volume',
    groups: []
  },
  {
    id: 's7-disposal',
    standard: 'cesmm',
    sectionNo: 7,
    name: 'Disposal of material',
    unit: 'm³',
    basis: 'Volume',
    groups: []
  },
  {
    id: 's7-imported',
    standard: 'cesmm',
    sectionNo: 7,
    name: 'Imported fill',
    unit: 'm³',
    basis: 'Volume',
    groups: []
  },
  {
    id: 's7-compaction',
    standard: 'cesmm',
    sectionNo: 7,
    name: 'Compaction of fill',
    unit: 'm³',
    basis: 'Volume',
    groups: []
  },
  {
    id: 's10-formwork',
    standard: 'cesmm',
    sectionNo: 10,
    name: 'Formwork',
    unit: 'm²',
    basis: 'Area',
    groups: []
  },
  {
    id: 's11-reinforcement',
    standard: 'cesmm',
    sectionNo: 11,
    name: 'Reinforcement',
    unit: 't',
    basis: 'Weight',
    groups: []
  }
];

const INSITU_ROWS: MeasureMapRow[] = [
  {
    id: 'ins-item',
    target: 'item',
    attribute: 'Material',
    separator: '',
    regex: '(INSTIU|INSITU)',
    displayName: 'Member'
  },
  {
    id: 'ins-grade',
    target: 'grade',
    attribute: 'Material',
    separator: '_',
    regex: '(C\\d+\\s*/\\s*\\d+)',
    displayName: 'Concrete grade'
  },
  {
    id: 'ins-cement',
    target: 'cement',
    attribute: 'Material',
    separator: '_',
    regex: '([^_]+)',
    displayName: 'Cement'
  },
  {
    id: 'ins-special',
    target: 'special',
    attribute: 'Material',
    separator: '_',
    regex: '([^_]+)',
    displayName: 'Concrete class'
  }
];

export function defaultRows(itemId: string): MeasureMapRow[] {
  return itemId === 's12-insitu' ? INSITU_ROWS.map(r => ({ ...r })) : [];
}

export function rowsFor(
  rows: Record<string, MeasureMapRow[]>,
  itemId: string
): MeasureMapRow[] {
  return rows[itemId] || [];
}

export function rowSlot(rows: MeasureMapRow[], index: number): number {
  const attribute = rows[index]?.attribute;
  if (!attribute) return 1;
  let slot = 1;
  for (let i = 0; i < index; i++) {
    if (rows[i].attribute === attribute) slot++;
  }
  return slot;
}

export interface RuleLine {
  text: string;
  marker?: string;
}

export interface CalculationRule {
  formula: string;
  measurementRules: RuleLine[];
}

const INSITU_RULES: RuleLine[] = [
  { text: 'No deduction shall be made for :' },
  { marker: '(a)', text: 'built-in items, holes, ducts, pockets, sockets, mortices and the like each not exceeding 0.15 cubic metres in volume;' },
  { marker: '(b)', text: 'reinforcement;' },
  { marker: '(c)', text: 'individual fillets, chamfers, splays, drips, rebates, recesses, grooves and the like not exceeding 100 millimetres in girth measured on the faces in contact with the formwork;' },
  { marker: '(d)', text: 'in the case of concrete with profiled face, any indentations of 100 millimetres total girth or less when measured in contact with the profiled formwork.' }
];

const TREATMENT_FACES_RULES: RuleLine[] = [
  { text: 'The unit of measurement shall be :' },
  { marker: '(i)', text: 'treatment to faces of in-situ concrete .......................... square metre.' },
  { text: 'The measurement shall be the area of the treated face shown on the Drawings, except for concrete faces formed with profiled formwork in which case the measurement shall be the same area as that for the profiled formwork.' },
  { text: 'Separate items shall be provided for treatment to faces of in-situ concrete in accordance with General Principles paragraphs 3 and 4 and the following :' },
  { marker: 'Group I', text: 'Exposed aggregate; Point tooled; Bush hammered; Broken rib; Light blasting; Heavy blasting; Other stated treatments.' }
];

const BY_UNIT: RuleLine[] = [{ text: 'By Measurement Unit specified' }];

export function calculationRule(item: SmmItem): CalculationRule {
  if (item.unit === 'm³') {
    return {
      formula: 'Volume = length × width × height',
      measurementRules: item.id === 's12-insitu' ? INSITU_RULES : BY_UNIT
    };
  }
  if (item.unit === 'm²') {
    return {
      formula: 'Area = length × width',
      measurementRules: item.id === 's12-face' ? TREATMENT_FACES_RULES : BY_UNIT
    };
  }
  if (item.unit === 'nr') {
    return {
      formula: 'Number = count of matching elements',
      measurementRules: BY_UNIT
    };
  }
  if (item.unit === 't') {
    return {
      formula: 'Weight = volume × density, or bar length × unit mass',
      measurementRules: BY_UNIT
    };
  }
  return {
    formula: 'Length = measured run',
    measurementRules: BY_UNIT
  };
}

export function targetLabel(item: SmmItem, target: string): string {
  if (target === 'item') return item.name;
  return item.groups.find(g => g.id === target)?.name || item.name;
}
