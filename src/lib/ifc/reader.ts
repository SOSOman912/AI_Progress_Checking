import type { ElementData } from '../demo';
import type { StepEntity, StepValue } from './step';

type Vec3 = [number, number, number];
type Vec2 = [number, number];

interface Bounds {
  min: Vec3;
  max: Vec3;
}
interface Bounds2 {
  min: Vec2;
  max: Vec2;
}

export interface IfcStoreyInfo {
  name: string;
  elevation: number;
}

export interface IfcModelMeta {
  schema: string;
  projectName: string;
  projectNumber: string;
  siteName: string;
  buildingName: string;
  storeys: IfcStoreyInfo[];
  units: string;
  unitScale: number;
  elementCount: number;
  totalProducts: number;
  origin: { x: number; y: number; z: number };
  propertyCount: number;
  quantityCount: number;
  classes: Array<{ name: string; count: number }>;
  fileSize: number;
  parseMs: number;
  fileName: string;
  truncated: boolean;
  engine: 'web-ifc' | 'step';
}

export interface IfcModel {
  id: string;
  fileName: string;
  meta: IfcModelMeta;
  elements: ElementData[];
}

export interface BuildOptions {
  fileName: string;
  fileSize: number;
  schema: string;
  parseMs: number;
  onProgress?: (fraction: number) => void;
}

const MAX_ELEMENTS = 1600;

const PRODUCT_TYPES = new Set([
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCSLAB',
  'IFCBEAM',
  'IFCCOLUMN',
  'IFCFOOTING',
  'IFCPILE',
  'IFCMEMBER',
  'IFCPLATE',
  'IFCCOVERING',
  'IFCSTAIR',
  'IFCSTAIRFLIGHT',
  'IFCRAMP',
  'IFCROOF',
  'IFCWINDOW',
  'IFCDOOR',
  'IFCCURTAINWALL',
  'IFCBUILDINGELEMENTPROXY',
  'IFCRAILING',
  'IFCFLOWSEGMENT',
  'IFCFLOWFITTING',
  'IFCFLOWTERMINAL',
  'IFCDUCTSEGMENT',
  'IFCDUCTFITTING',
  'IFCPIPESEGMENT',
  'IFCPIPEFITTING',
  'IFCSANITARYTERMINAL',
  'IFCFURNISHINGELEMENT',
  'IFCTRANSPORTELEMENT',
  'IFCDISCRETEACCESSORY',
  'IFCMECHANICALFASTENER'
]);

const CLASS_LABELS: Record<string, string> = {
  IFCWALL: 'IfcWall',
  IFCWALLSTANDARDCASE: 'IfcWallStandardCase',
  IFCSLAB: 'IfcSlab',
  IFCBEAM: 'IfcBeam',
  IFCCOLUMN: 'IfcColumn',
  IFCFOOTING: 'IfcFooting',
  IFCPILE: 'IfcPile',
  IFCMEMBER: 'IfcMember',
  IFCPLATE: 'IfcPlate',
  IFCCOVERING: 'IfcCovering',
  IFCSTAIR: 'IfcStair',
  IFCSTAIRFLIGHT: 'IfcStairFlight',
  IFCRAMP: 'IfcRamp',
  IFCROOF: 'IfcRoof',
  IFCWINDOW: 'IfcWindow',
  IFCDOOR: 'IfcDoor',
  IFCCURTAINWALL: 'IfcCurtainWall',
  IFCBUILDINGELEMENTPROXY: 'IfcBuildingElementProxy',
  IFCRAILING: 'IfcRailing',
  IFCFLOWSEGMENT: 'IfcFlowSegment',
  IFCFLOWFITTING: 'IfcFlowFitting',
  IFCFLOWTERMINAL: 'IfcFlowTerminal',
  IFCDUCTSEGMENT: 'IfcDuctSegment',
  IFCDUCTFITTING: 'IfcDuctFitting',
  IFCPIPESEGMENT: 'IfcPipeSegment',
  IFCPIPEFITTING: 'IfcPipeFitting',
  IFCSANITARYTERMINAL: 'IfcSanitaryTerminal',
  IFCFURNISHINGELEMENT: 'IfcFurnishingElement',
  IFCTRANSPORTELEMENT: 'IfcTransportElement',
  IFCDISCRETEACCESSORY: 'IfcDiscreteAccessory',
  IFCMECHANICALFASTENER: 'IfcMechanicalFastener'
};

export const classLabel = (type: string) =>
  CLASS_LABELS[type] ?? `Ifc${type.replace(/^IFC/, '').toLowerCase()}`;

const MATERIAL_KEYS = new Set(['material', 'materials', 'structuralmaterial', 'materialname', 'ifcmaterial']);

/** IFC exports name the material property differently: Material, Materials, Structural Material… */
export const materialFromProps = (props: Record<string, string>): string => {
  for (const [key, value] of Object.entries(props)) {
    if (!value || !value.trim()) continue;
    const normalized = key.toLowerCase().replace(/[\s_-]/g, '');
    if (MATERIAL_KEYS.has(normalized)) return value.trim();
  }
  return '';
};

const ref = (value?: StepValue): number | null => (value && value.t === 'ref' ? value.id : null);
const num = (value?: StepValue): number | null => (value && value.t === 'num' ? value.v : null);
const text = (value?: StepValue): string => (value && value.t === 'str' ? value.v : '');
const items = (value?: StepValue): StepValue[] => (value && value.t === 'list' ? value.v : []);

const valueText = (value?: StepValue): string => {
  if (!value) return '';
  switch (value.t) {
    case 'str':
      return value.v;
    case 'num':
      return Number.isInteger(value.v) ? String(value.v) : String(Math.round(value.v * 1000) / 1000);
    case 'enum':
      return value.v;
    case 'list':
      return value.v.map(valueText).filter(Boolean).join(', ');
    default:
      return '';
  }
};

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const detectUnits = (entities: Map<number, StepEntity>) => {
  for (const entity of entities.values()) {
    if (entity.type !== 'IFCSIUNIT') continue;
    const unitType = entity.args[1]?.t === 'enum' ? entity.args[1].v : '';
    if (unitType !== 'LENGTHUNIT') continue;
    const prefix = entity.args[2]?.t === 'enum' ? entity.args[2].v : '';
    const name = entity.args[3]?.t === 'enum' ? entity.args[3].v : '';
    const base = name === 'FOOT' ? 0.3048 : name === 'INCH' ? 0.0254 : 1;
    const multiplier = prefix === 'MILLI' ? 0.001 : prefix === 'CENTI' ? 0.01 : prefix === 'KILO' ? 1000 : 1;
    const scale = base * multiplier;
    return { scale, label: name === 'FOOT' ? 'ft' : scale === 0.001 ? 'mm' : scale === 0.01 ? 'cm' : 'm' };
  }
  const conversion = [...entities.values()].find(entity => entity.type === 'IFCCONVERSIONBASEDUNIT');
  if (conversion) return { scale: 1, label: 'm' };
  return { scale: 1, label: 'm' };
};

export async function buildIfcModel(
  entities: Map<number, StepEntity>,
  options: BuildOptions
): Promise<IfcModel> {
  const { scale, label: unitLabel } = detectUnits(entities);

  const project = [...entities.values()].find(entity => entity.type === 'IFCPROJECT');
  const site = [...entities.values()].find(entity => entity.type === 'IFCSITE');
  const building = [...entities.values()].find(entity => entity.type === 'IFCBUILDING');

  const storeyEntities = [...entities.values()].filter(entity => entity.type === 'IFCBUILDINGSTOREY');
  const storeys = storeyEntities.map((entity, index) => ({
    id: entity.id,
    name: text(entity.args[2]) || text(entity.args[7]) || `Level ${index + 1}`,
    elevation: (num(entity.args[9]) ?? 0) * scale
  }));
  const storeyName = new Map(storeys.map(storey => [storey.id, storey.name]));

  const containing = new Map<number, number>();
  for (const entity of entities.values()) {
    if (entity.type !== 'IFCRELCONTAINEDINSPATIALSTRUCTURE') continue;
    const structure = ref(entity.args[5]);
    if (!structure) continue;
    items(entity.args[4]).forEach(item => {
      const id = ref(item);
      if (id) containing.set(id, structure);
    });
  }

  const materialName = (id: number | null, depth = 0): string => {
    if (!id || depth > 5) return '';
    const entity = entities.get(id);
    if (!entity) return '';
    if (entity.type === 'IFCMATERIAL') return text(entity.args[0]);
    if (entity.type === 'IFCMATERIALLAYERSETUSAGE') return materialName(ref(entity.args[0]), depth + 1);
    if (entity.type === 'IFCMATERIALLAYERSET') {
      const names = items(entity.args[0])
        .map(layer => materialName(ref(layer), depth + 1))
        .filter(Boolean);
      return [...new Set(names)].join(', ');
    }
    if (entity.type === 'IFCMATERIALLAYER') return materialName(ref(entity.args[0]), depth + 1);
    if (entity.type === 'IFCMATERIALLIST') {
      return items(entity.args[0])
        .map(material => materialName(ref(material), depth + 1))
        .filter(Boolean)
        .join(', ');
    }
    return '';
  };

  const materialByProduct = new Map<number, string>();
  for (const entity of entities.values()) {
    if (entity.type !== 'IFCRELASSOCIATESMATERIAL') continue;
    const material = materialName(ref(entity.args[5]));
    if (!material) continue;
    items(entity.args[4]).forEach(item => {
      const id = ref(item);
      if (id) materialByProduct.set(id, material);
    });
  }

  const propsByProduct = new Map<number, Record<string, string>>();
  const quantityByProduct = new Map<number, { volume?: number; area?: number }>();
  let propertyCount = 0;
  let quantityCount = 0;

  for (const entity of entities.values()) {
    if (entity.type !== 'IFCRELDEFINESBYPROPERTIES') continue;
    const definitionId = ref(entity.args[5]);
    const definition = definitionId ? entities.get(definitionId) : null;
    if (!definition) continue;
    const targets = items(entity.args[4])
      .map(ref)
      .filter((id): id is number => !!id);
    if (!targets.length) continue;

    if (definition.type === 'IFCPROPERTYSET') {
      const props: Record<string, string> = {};
      items(definition.args[4]).forEach(item => {
        const property = entities.get(ref(item) ?? -1);
        if (!property || property.type !== 'IFCPROPERTYSINGLEVALUE') return;
        const name = text(property.args[0]);
        const value = valueText(property.args[2]);
        if (name && value) {
          props[name] = value;
          propertyCount += 1;
        }
      });
      targets.forEach(id => propsByProduct.set(id, { ...(propsByProduct.get(id) ?? {}), ...props }));
    } else if (definition.type === 'IFCELEMENTQUANTITY') {
      let volume: number | undefined;
      let area: number | undefined;
      items(definition.args[5]).forEach(item => {
        const quantity = entities.get(ref(item) ?? -1);
        if (!quantity) return;
        const value = num(quantity.args[3]);
        if (value == null) return;
        if (quantity.type === 'IFCQUANTITYVOLUME') {
          volume = value * scale ** 3;
          quantityCount += 1;
        }
        if (quantity.type === 'IFCQUANTITYAREA') {
          area = value * scale ** 2;
          quantityCount += 1;
        }
      });
      targets.forEach(id =>
        quantityByProduct.set(id, { ...(quantityByProduct.get(id) ?? {}), volume, area })
      );
    }
  }

  const typeByProduct = new Map<number, number>();
  const propsByType = new Map<number, Record<string, string>>();
  for (const entity of entities.values()) {
    if (entity.type !== 'IFCRELDEFINESBYTYPE') continue;
    const typeId = ref(entity.args[5]);
    if (typeId == null) continue;
    const typeEntity = entities.get(typeId);
    if (!typeEntity) continue;
    const props: Record<string, string> = {};
    items(typeEntity.args[5]).forEach(setRef => {
      const set = entities.get(ref(setRef) ?? -1);
      if (!set || set.type !== 'IFCPROPERTYSET') return;
      items(set.args[4]).forEach(item => {
        const property = entities.get(ref(item) ?? -1);
        if (!property || property.type !== 'IFCPROPERTYSINGLEVALUE') return;
        const name = text(property.args[0]);
        const value = valueText(property.args[2]);
        if (name && value) {
          props[name] = value;
          propertyCount += 1;
        }
      });
    });
    propsByType.set(typeId, props);
    items(entity.args[4]).forEach(item => {
      const id = ref(item);
      if (id) typeByProduct.set(id, typeId);
    });
  }

  const point = (id: number | null): Vec3 => {
    const entity = id ? entities.get(id) : null;
    if (!entity || entity.type !== 'IFCCARTESIANPOINT') return [0, 0, 0];
    const coords = items(entity.args[0]).map(value => (value.t === 'num' ? value.v : 0));
    return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0];
  };

  const axisOrigin = (id: number | null): Vec3 => {
    const entity = id ? entities.get(id) : null;
    if (!entity) return [0, 0, 0];
    if (entity.type === 'IFCAXIS2PLACEMENT3D' || entity.type === 'IFCAXIS2PLACEMENT2D') {
      return point(ref(entity.args[0]));
    }
    if (entity.type === 'IFCCARTESIANTRANSFORMATIONOPERATOR3D') {
      return point(ref(entity.args[2]));
    }
    return [0, 0, 0];
  };

  const placementOrigin = (id: number | null, depth = 0): Vec3 => {
    if (!id || depth > 10) return [0, 0, 0];
    const entity = entities.get(id);
    if (!entity) return [0, 0, 0];
    if (entity.type === 'IFCLOCALPLACEMENT') {
      const parent = placementOrigin(ref(entity.args[0]), depth + 1);
      const local = axisOrigin(ref(entity.args[1]));
      return [parent[0] + local[0], parent[1] + local[1], parent[2] + local[2]];
    }
    return axisOrigin(id);
  };

  const directionSign = (id: number | null) => {
    const entity = id ? entities.get(id) : null;
    if (!entity || entity.type !== 'IFCDIRECTION') return 1;
    const coords = items(entity.args[0]).map(value => (value.t === 'num' ? value.v : 0));
    return (coords[2] ?? 0) < 0 ? -1 : 1;
  };

  const curveBounds = (id: number | null, depth = 0): Bounds2 | null => {
    if (!id || depth > 6) return null;
    const entity = entities.get(id);
    if (!entity) return null;
    if (entity.type === 'IFCPOLYLINE') {
      const points = items(entity.args[0])
        .map(item => point(ref(item)))
        .filter((value): value is Vec3 => !!value);
      if (!points.length) return null;
      return {
        min: [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1]))],
        max: [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]
      };
    }
    if (entity.type === 'IFCCOMPOSITECURVE') {
      let bounds: Bounds2 | null = null;
      for (const segment of items(entity.args[0])) {
        const segmentEntity = entities.get(ref(segment) ?? -1);
        if (!segmentEntity) continue;
        const next = curveBounds(ref(segmentEntity.args[2]), depth + 1);
        if (next) bounds = union2(bounds, next);
      }
      return bounds;
    }
    if (entity.type === 'IFCTRIMMEDCURVE') return curveBounds(ref(entity.args[0]), depth + 1);
    return null;
  };

  const profileBounds = (id: number | null): Bounds2 | null => {
    const entity = id ? entities.get(id) : null;
    if (!entity) return null;
    const origin = axisOrigin(ref(entity.args[2]));
    const centered = (width: number, height: number): Bounds2 => ({
      min: [origin[0] - width / 2, origin[1] - height / 2],
      max: [origin[0] + width / 2, origin[1] + height / 2]
    });
    switch (entity.type) {
      case 'IFCRECTANGLEPROFILEDEF': {
        const width = num(entity.args[3]) ?? 0;
        const height = num(entity.args[4]) ?? 0;
        return width && height ? centered(width, height) : null;
      }
      case 'IFCCIRCLEPROFILEDEF': {
        const radius = num(entity.args[3]) ?? 0;
        return radius ? centered(radius * 2, radius * 2) : null;
      }
      case 'IFCISHAPEPROFILEDEF': {
        const width = num(entity.args[3]) ?? 0;
        const height = num(entity.args[4]) ?? 0;
        return width && height ? centered(width, height) : null;
      }
      case 'IFCARBITRARYCLOSEDPROFILEDEF':
        return curveBounds(ref(entity.args[2]));
      case 'IFCARBITRARYPROFILEDEFWITHVOIDS':
        return curveBounds(ref(entity.args[2]));
      default:
        return null;
    }
  };

  const shellPoints = (shellId: number | null, depth = 0): Vec3[] => {
    if (!shellId || depth > 4) return [];
    const shell = entities.get(shellId);
    if (!shell) return [];
    if (shell.type === 'IFCCLOSEDSHELL' || shell.type === 'IFCOPENSHELL') {
      const points: Vec3[] = [];
      for (const faceRef of items(shell.args[0])) {
        const face = entities.get(ref(faceRef) ?? -1);
        if (!face) continue;
        const bound = entities.get(ref(face.args[0]) ?? -1);
        if (!bound) continue;
        const loop = entities.get(ref(bound.args[0]) ?? -1);
        if (!loop) continue;
        const pointList = items(loop.args[0]);
        for (const pointRef of pointList) {
          const id = ref(pointRef);
          if (id) points.push(point(id));
        }
      }
      return points;
    }
    return [];
  };

  const boundsFromPoints = (points: Vec3[]): Bounds | null => {
    if (!points.length) return null;
    return {
      min: [
        Math.min(...points.map(p => p[0])),
        Math.min(...points.map(p => p[1])),
        Math.min(...points.map(p => p[2]))
      ],
      max: [
        Math.max(...points.map(p => p[0])),
        Math.max(...points.map(p => p[1])),
        Math.max(...points.map(p => p[2]))
      ]
    };
  };

  const itemBounds = (id: number | null, depth = 0): Bounds | null => {
    if (!id || depth > 6) return null;
    const entity = entities.get(id);
    if (!entity) return null;
    switch (entity.type) {
      case 'IFCEXTRUDEDAREASOLID': {
        const profile = profileBounds(ref(entity.args[0]));
        const depthValue = num(entity.args[3]) ?? 0;
        if (!profile || !depthValue) return null;
        const position = axisOrigin(ref(entity.args[1]));
        const sign = directionSign(ref(entity.args[2]));
        const z0 = position[2] + sign * depthValue;
        const z1 = position[2];
        return {
          min: [
            position[0] + profile.min[0],
            position[1] + profile.min[1],
            Math.min(z0, z1)
          ],
          max: [
            position[0] + profile.max[0],
            position[1] + profile.max[1],
            Math.max(z0, z1)
          ]
        };
      }
      case 'IFCFACETEDBREP':
        return boundsFromPoints(shellPoints(ref(entity.args[0])));
      case 'IFCMAPPEDITEM': {
        const map = entities.get(ref(entity.args[0]) ?? -1);
        const operator = entities.get(ref(entity.args[1]) ?? -1);
        if (!map) return null;
        const mapOrigin = axisOrigin(ref(map.args[0]));
        const operatorOrigin = operator ? axisOrigin(ref(entity.args[1])) : ([0, 0, 0] as Vec3);
        const shape = entities.get(ref(map.args[1]) ?? -1);
        if (!shape) return null;
        let bounds: Bounds | null = null;
        for (const itemRef of items(shape.args[3])) {
          const next = itemBounds(ref(itemRef), depth + 1);
          if (next) bounds = union3(bounds, next);
        }
        if (!bounds) return null;
        const offset: Vec3 = [
          mapOrigin[0] + operatorOrigin[0],
          mapOrigin[1] + operatorOrigin[1],
          mapOrigin[2] + operatorOrigin[2]
        ];
        return {
          min: [bounds.min[0] + offset[0], bounds.min[1] + offset[1], bounds.min[2] + offset[2]],
          max: [bounds.max[0] + offset[0], bounds.max[1] + offset[1], bounds.max[2] + offset[2]]
        };
      }
      case 'IFCBOOLEANRESULT':
      case 'IFCBOOLEANCLIPPINGRESULT':
        return itemBounds(ref(entity.args[0]), depth + 1);
      case 'IFCSWEPTDISKSOLID': {
        const radius = num(entity.args[3]) ?? 0;
        const curve = curveBounds(ref(entity.args[0]));
        if (!curve || !radius) return null;
        return {
          min: [curve.min[0] - radius, curve.min[1] - radius, -radius],
          max: [curve.max[0] + radius, curve.max[1] + radius, radius]
        };
      }
      default:
        return null;
    }
  };

  const productBounds = (representationId: number | null): Bounds | null => {
    const shape = representationId ? entities.get(representationId) : null;
    if (!shape || shape.type !== 'IFCPRODUCTDEFINITIONSHAPE') return null;
    let bounds: Bounds | null = null;
    for (const repRef of items(shape.args[2])) {
      const representation = entities.get(ref(repRef) ?? -1);
      if (!representation || representation.type !== 'IFCSHAPEREPRESENTATION') continue;
      const identifier = text(representation.args[1]).toLowerCase();
      if (identifier && !identifier.includes('body')) continue;
      for (const itemRef of items(representation.args[3])) {
        const next = itemBounds(ref(itemRef));
        if (next) bounds = union3(bounds, next);
      }
    }
    return bounds;
  };

  const products = [...entities.values()].filter(entity => PRODUCT_TYPES.has(entity.type));
  const elements: ElementData[] = [];
  const classCounts = new Map<string, number>();

  for (let index = 0; index < products.length; index += 1) {
    if (elements.length >= MAX_ELEMENTS) break;
    const entity = products[index];
    if (index > 0 && index % 120 === 0) {
      options.onProgress?.(Math.min(1, index / products.length));
      await tick();
    }

    const bounds = productBounds(ref(entity.args[6]));
    if (!bounds) continue;

    const origin = placementOrigin(ref(entity.args[5]));
    const x0 = bounds.min[0];
    const x1 = bounds.max[0];
    const y0 = bounds.min[1];
    const y1 = bounds.max[1];
    const z0 = bounds.min[2];
    const z1 = bounds.max[2];

    const dx = Math.max(0.02, (x1 - x0) * scale);
    const dy = Math.max(0.02, (y1 - y0) * scale);
    const dz = Math.max(0.02, (z1 - z0) * scale);

    const centerX = ((x0 + x1) / 2 + origin[0]) * scale;
    const centerY = ((z0 + z1) / 2 + origin[2]) * scale;
    const centerZ = -((y0 + y1) / 2 + origin[1]) * scale;

    const ifcClass = classLabel(entity.type);
    const name = text(entity.args[2]) || text(entity.args[4]) || ifcClass;
    const tag = text(entity.args[7]);
    const gid = text(entity.args[0]) || `#${entity.id}`;
    const typeId = typeByProduct.get(entity.id);
    const props = {
      ...(typeId ? propsByType.get(typeId) ?? {} : {}),
      ...(propsByProduct.get(entity.id) ?? {})
    };
    const quantity = quantityByProduct.get(entity.id);
    const storey = storeyName.get(containing.get(entity.id) ?? -1) ?? '';
    const material =
      materialByProduct.get(entity.id) ||
      (typeId ? materialByProduct.get(typeId) : '') ||
      materialFromProps(props);
    const zone = props.Zone || props.zone || '';
    const bboxVolume = dx * dy * dz;
    const volume = quantity?.volume && quantity.volume > 0 ? quantity.volume : bboxVolume;

    const pset: Record<string, string> = {};
    Object.entries(props)
      .slice(0, 36)
      .forEach(([key, value]) => {
        pset[key] = value;
      });

    elements.push({
      id: `ifc-${entity.id}`,
      file: 'ifc',
      mark: tag || name.slice(0, 18) || gid.slice(0, 8),
      name,
      cls: ifcClass,
      type: text(entity.args[4]) || ifcClass,
      level: storey,
      zone: zone || undefined,
      mat: material,
      box: [centerX, centerY, centerZ, dx, dz, dy],
      openings: 0,
      pset,
      gross: Math.round(bboxVolume * 1000) / 1000,
      vol: Math.round(volume * 1000) / 1000,
      net: Math.round(volume * 1000) / 1000,
      gid,
      matSource: material ? 'IFC' : null
    });

    classCounts.set(ifcClass, (classCounts.get(ifcClass) ?? 0) + 1);
  }

  const classes = [...classCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const origin = { x: 0, y: 0, z: 0 };
  if (elements.length) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    elements.forEach(element => {
      const [x, y, z, length, height, width] = element.box;
      minX = Math.min(minX, x - length / 2);
      maxX = Math.max(maxX, x + length / 2);
      minY = Math.min(minY, y - height / 2);
      minZ = Math.min(minZ, z - width / 2);
      maxZ = Math.max(maxZ, z + width / 2);
    });
    origin.x = Math.round(((minX + maxX) / 2) * 1000) / 1000;
    origin.y = Math.round(minY * 1000) / 1000;
    origin.z = Math.round(((minZ + maxZ) / 2) * 1000) / 1000;
    elements.forEach(element => {
      element.box[0] = Math.round((element.box[0] - origin.x) * 1000) / 1000;
      element.box[1] = Math.round((element.box[1] - origin.y) * 1000) / 1000;
      element.box[2] = Math.round((element.box[2] - origin.z) * 1000) / 1000;
    });
  }

  return {
    id: `ifc-${Date.now().toString(36)}`,
    fileName: options.fileName,
    meta: {
      schema: options.schema,
      projectName: project ? text(project.args[5]) || text(project.args[2]) : '',
      projectNumber: project ? text(project.args[2]) : '',
      siteName: site ? text(site.args[2]) : '',
      buildingName: building ? text(building.args[2]) : '',
      storeys: storeys.map(storey => ({ name: storey.name, elevation: Math.round(storey.elevation * 1000) / 1000 })),
      units: unitLabel,
      unitScale: scale,
      elementCount: elements.length,
      totalProducts: products.length,
      origin,
      propertyCount,
      quantityCount,
      classes,
      fileSize: options.fileSize,
      parseMs: options.parseMs,
      fileName: options.fileName,
      truncated: products.length > elements.length && elements.length >= MAX_ELEMENTS,
      engine: 'step'
    },
    elements
  };
}

const union3 = (current: Bounds | null, next: Bounds): Bounds =>
  current
    ? {
        min: [
          Math.min(current.min[0], next.min[0]),
          Math.min(current.min[1], next.min[1]),
          Math.min(current.min[2], next.min[2])
        ],
        max: [
          Math.max(current.max[0], next.max[0]),
          Math.max(current.max[1], next.max[1]),
          Math.max(current.max[2], next.max[2])
        ]
      }
    : next;

const union2 = (current: Bounds2 | null, next: Bounds2): Bounds2 =>
  current
    ? {
        min: [Math.min(current.min[0], next.min[0]), Math.min(current.min[1], next.min[1])],
        max: [Math.max(current.max[0], next.max[0]), Math.max(current.max[1], next.max[1])]
      }
    : next;
