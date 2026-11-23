/**
 * Primary IFC loader. Uses web-ifc (the engine the legacy ifc-qto.html used)
 * so real STEP files, IFC2X3/IFC4 schemas and complex geometry load reliably.
 * Loaded from the same CDN build; the STEP reader in reader.ts remains the
 * offline fallback.
 */
import type { ElementData } from '../demo';
import { classLabel, materialFromProps, type IfcModel, type IfcModelMeta } from './reader';

const CDN = 'https://cdn.jsdelivr.net/npm/web-ifc@0.0.57/';
const MAX_ELEMENTS = 1600;

type Vec3 = [number, number, number];

interface Bounds {
  min: Vec3;
  max: Vec3;
}

type PhaseReporter = (phase: { step: number; label: string; pct: number }) => void;

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

let modulePromise: Promise<any> | null = null;

const loadWebIfc = () => {
  if (!modulePromise) {
    const url = `${CDN}web-ifc-api.js`;
    modulePromise = import(/* @vite-ignore */ url);
  }
  return modulePromise;
};

const SKIP_TYPES = new Set([
  'IFCOPENINGELEMENT',
  'IFCVOIDINGFEATURE',
  'IFCFEATUREELEMENT',
  'IFCFEATUREELEMENTSUBTRACTION',
  'IFCFEATUREELEMENTADDITION',
  'IFCSPACE',
  'IFCSITE',
  'IFCBUILDING',
  'IFCBUILDINGSTOREY',
  'IFCPROJECT',
  'IFCELEMENTASSEMBLY',
  'IFCANNOTATION',
  'IFCGRID',
  'IFCVIRTUALELEMENT'
]);

const refOf = (value: any): number | null => {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.value === 'number') return value.value;
  return null;
};

const textOf = (value: any): string => {
  const raw = value && typeof value === 'object' && 'value' in value ? value.value : value;
  return raw == null ? '' : String(raw);
};

const numOf = (value: any): number | null => {
  const raw = value && typeof value === 'object' && 'value' in value ? value.value : value;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
};

const asArray = (value: any): any[] => (Array.isArray(value) ? value : []);

export async function readWithWebIfc(
  file: File,
  onPhase: PhaseReporter,
  startedAt: number
): Promise<IfcModel> {
  onPhase({ step: 0, label: 'Loading IFC engine', pct: 4 });
  const W: any = await loadWebIfc();
  if (!W || typeof W.IfcAPI !== 'function') throw new Error('web-ifc module missing');

  const api: any = new W.IfcAPI();
  api.SetWasmPath(CDN, true);
  onPhase({ step: 0, label: 'Initialising IFC WASM', pct: 12 });
  await api.Init(undefined, true);

  onPhase({ step: 1, label: 'Opening IFC model', pct: 24 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
  if (modelID < 0) throw new Error('IFC could not be opened');

  try {
    const line = (id: number | null): any => {
      if (id == null) return null;
      try {
        return api.GetLine(modelID, id, false);
      } catch {
        return null;
      }
    };
    const typeName = (id: number): string => {
      const entity = line(id);
      if (!entity) return '';
      try {
        return String(api.GetNameFromTypeCode(entity.type) || '').toUpperCase();
      } catch {
        return '';
      }
    };
    const idsOfType = (name: string, inherited = true): number[] => {
      if (!W[name]) return [];
      try {
        const vector = api.GetLineIDsWithType(modelID, W[name], inherited);
        const out: number[] = [];
        for (let index = 0; index < vector.size(); index += 1) out.push(vector.get(index));
        return out;
      } catch {
        return [];
      }
    };

    const project = line(idsOfType('IFCPROJECT', false)[0] ?? null);
    const site = line(idsOfType('IFCSITE', false)[0] ?? null);
    const building = line(idsOfType('IFCBUILDING', false)[0] ?? null);

    let lengthScale = 1;
    let unitLabel = 'm';
    const unitSet = line(refOf(project?.UnitsInContext));
    for (const unitRef of asArray(unitSet?.Units)) {
      const unit = line(refOf(unitRef));
      if (!unit) continue;
      if (textOf(unit.UnitType).toUpperCase() !== 'LENGTHUNIT') continue;
      const name = textOf(unit.Name).toUpperCase();
      const prefix = textOf(unit.Prefix).toUpperCase();
      const base = name === 'FOOT' || name === 'FEET' ? 0.3048 : name === 'INCH' ? 0.0254 : 1;
      const factor = prefix === 'MILLI' ? 0.001 : prefix === 'CENTI' ? 0.01 : prefix === 'KILO' ? 1000 : 1;
      lengthScale = base * factor;
      unitLabel = name === 'FOOT' || name === 'FEET' ? 'ft' : lengthScale === 0.001 ? 'mm' : lengthScale === 0.01 ? 'cm' : 'm';
      break;
    }

    onPhase({ step: 2, label: 'Reading properties and units', pct: 38 });
    await tick();

    const storeyIds = idsOfType('IFCBUILDINGSTOREY', false);
    const storeyNames = new Map<number, string>();
    const storeys = storeyIds.map((id, index) => {
      const entity = line(id);
      const name = textOf(entity?.Name) || textOf(entity?.LongName) || `Level ${index + 1}`;
      storeyNames.set(id, name);
      return { name, elevation: Math.round((numOf(entity?.Elevation) ?? 0) * lengthScale * 1000) / 1000 };
    });

    const parent = new Map<number, number>();
    for (const relId of idsOfType('IFCRELCONTAINEDINSPATIALSTRUCTURE', false)) {
      const rel = line(relId);
      const structure = refOf(rel?.RelatingStructure);
      if (structure == null) continue;
      asArray(rel?.RelatedElements).forEach(item => {
        const id = refOf(item);
        if (id != null) parent.set(id, structure);
      });
    }
    for (const relId of idsOfType('IFCRELAGGREGATES', false)) {
      const rel = line(relId);
      const structure = refOf(rel?.RelatingObject);
      if (structure == null) continue;
      asArray(rel?.RelatedObjects).forEach(item => {
        const id = refOf(item);
        if (id != null && !parent.has(id)) parent.set(id, structure);
      });
    }
    const levelOf = (id: number): string => {
      const seen = new Set<number>();
      let cursor: number | undefined = id;
      while (cursor != null && !seen.has(cursor)) {
        seen.add(cursor);
        const next: number | undefined = parent.get(cursor);
        if (next == null) break;
        if (storeyNames.has(next)) return storeyNames.get(next) ?? '';
        cursor = next;
      }
      return '';
    };

    const propsByProduct = new Map<number, Record<string, string>>();
    const quantityByProduct = new Map<number, { volume?: number }>();
    let propertyCount = 0;
    let quantityCount = 0;

    const readPropertySet = (definition: any) => {
      const props: Record<string, string> = {};
      asArray(definition?.HasProperties).forEach(item => {
        const property = line(refOf(item));
        if (!property) return;
        const name = textOf(property.Name);
        const value = textOf(property.NominalValue);
        if (name && value) {
          props[name] = value;
          propertyCount += 1;
        }
      });
      return props;
    };

    const readQuantitySet = (definition: any) => {
      let volume: number | undefined;
      asArray(definition?.Quantities).forEach(item => {
        const quantity = line(refOf(item));
        if (!quantity) return;
        const volumeValue = numOf(quantity.VolumeValue);
        if (volumeValue != null) {
          volume = volumeValue * lengthScale ** 3;
          quantityCount += 1;
        }
      });
      return volume;
    };

    for (const relId of idsOfType('IFCRELDEFINESBYPROPERTIES', false)) {
      const rel = line(relId);
      const definition = line(refOf(rel?.RelatingPropertyDefinition));
      if (!definition) continue;
      const props = readPropertySet(definition);
      const volume = readQuantitySet(definition);
      const targets = asArray(rel?.RelatedObjects).map(refOf).filter((id): id is number => id != null);
      targets.forEach(id => {
        propsByProduct.set(id, { ...(propsByProduct.get(id) ?? {}), ...props });
        if (volume != null) quantityByProduct.set(id, { volume });
      });
    }

    const typeByProduct = new Map<number, number>();
    const propsByType = new Map<number, Record<string, string>>();
    for (const relId of idsOfType('IFCRELDEFINESBYTYPE', false)) {
      const rel = line(relId);
      const typeId = refOf(rel?.RelatingType);
      if (typeId == null) continue;
      const typeEntity = line(typeId);
      if (!typeEntity) continue;
      let typeProps = propsByType.get(typeId) ?? {};
      asArray(typeEntity.HasPropertySets).forEach(setRef => {
        const set = line(refOf(setRef));
        if (set) typeProps = { ...typeProps, ...readPropertySet(set) };
      });
      propsByType.set(typeId, typeProps);
      asArray(rel?.RelatedObjects).forEach(item => {
        const id = refOf(item);
        if (id != null) typeByProduct.set(id, typeId);
      });
    }

    const materialNames = (id: number | null, depth = 0): string[] => {
      if (id == null || depth > 5) return [];
      const entity = line(id);
      if (!entity) return [];
      const kind = typeName(id);
      if (kind === 'IFCMATERIAL') return [textOf(entity.Name)].filter(Boolean);
      if (kind === 'IFCMATERIALLAYERSETUSAGE') return materialNames(refOf(entity.ForLayerSet), depth + 1);
      if (kind === 'IFCMATERIALLAYERSET') {
        return [
          ...new Set(
            asArray(entity.MaterialLayers)
              .flatMap(layer => materialNames(refOf(line(refOf(layer))?.Material), depth + 1))
              .filter(Boolean)
          )
        ];
      }
      if (kind === 'IFCMATERIALLAYER') return materialNames(refOf(entity.Material), depth + 1);
      if (kind === 'IFCMATERIALLIST') {
        return asArray(entity.Materials)
          .flatMap(material => materialNames(refOf(material), depth + 1))
          .filter(Boolean);
      }
      if (kind === 'IFCMATERIALPROFILESETUSAGE') return materialNames(refOf(entity.ForProfileSet), depth + 1);
      if (kind === 'IFCMATERIALPROFILESET') {
        return asArray(entity.MaterialProfiles)
          .flatMap(profile => materialNames(refOf(line(refOf(profile))?.Material), depth + 1))
          .filter(Boolean);
      }
      return [];
    };

    const materialByProduct = new Map<number, string>();
    for (const relId of idsOfType('IFCRELASSOCIATESMATERIAL', false)) {
      const rel = line(relId);
      const names = [...new Set(materialNames(refOf(rel?.RelatingMaterial)))];
      if (!names.length) continue;
      asArray(rel?.RelatedObjects).forEach(item => {
        const id = refOf(item);
        if (id != null) materialByProduct.set(id, names.join(', '));
      });
    }

    const elementIds = idsOfType('IFCELEMENT')
      .filter(id => {
        const kind = typeName(id);
        return kind && !SKIP_TYPES.has(kind);
      })
      .sort((a, b) => a - b);

    onPhase({ step: 3, label: 'Decoding model geometry', pct: 58 });
    await tick();

    const elementSet = new Set(elementIds);
    const bounds = new Map<number, Bounds>();
    const rawMeshes = new Map<number, { positions: number[]; indices: number[] }>();
    const meshSkipped = new Set<number>();
    let meshBudget = 2_000_000;
    const collect = (mesh: any) => {
      const id = Number(mesh?.expressID);
      if (!elementSet.has(id)) return;
      if (bounds.size >= MAX_ELEMENTS && !bounds.has(id)) return;
      const parts = mesh.geometries;
      for (let index = 0; index < parts.size(); index += 1) {
        const part = parts.get(index);
        let geometry: any = null;
        try {
          geometry = api.GetGeometry(modelID, part.geometryExpressID);
          const vertices = new Float32Array(
            api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
          );
          const matrix = part.flatTransformation;
          if (!vertices.length || !matrix || matrix.length !== 16) continue;
          const current = bounds.get(id) ?? {
            min: [Infinity, Infinity, Infinity] as Vec3,
            max: [-Infinity, -Infinity, -Infinity] as Vec3
          };
          const vertexCount = vertices.length / 6;
          const canStore = !meshSkipped.has(id) && meshBudget >= vertexCount;
          if (!canStore) {
            rawMeshes.delete(id);
            meshSkipped.add(id);
          }
          const record = canStore ? rawMeshes.get(id) ?? { positions: [], indices: [] } : null;
          const baseVertex = record ? record.positions.length / 3 : 0;
          for (let offset = 0; offset < vertices.length; offset += 6) {
            const x = vertices[offset];
            const y = vertices[offset + 1];
            const z = vertices[offset + 2];
            const tx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
            const ty = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
            const tz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
            if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) continue;
            current.min[0] = Math.min(current.min[0], tx);
            current.min[1] = Math.min(current.min[1], ty);
            current.min[2] = Math.min(current.min[2], tz);
            current.max[0] = Math.max(current.max[0], tx);
            current.max[1] = Math.max(current.max[1], ty);
            current.max[2] = Math.max(current.max[2], tz);
            if (record) record.positions.push(tx, ty, tz);
          }
          if (record) {
            const indices = new Uint32Array(
              api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())
            );
            for (let k = 0; k < indices.length; k += 1) {
              record.indices.push(baseVertex + indices[k]);
            }
            rawMeshes.set(id, record);
            meshBudget -= vertexCount;
          }
          bounds.set(id, current);
        } catch {
          // Skip an unreadable part; the element keeps the rest.
        } finally {
          try {
            geometry?.delete();
          } catch {
            // ignore
          }
        }
      }
      if (bounds.size % 80 === 0) {
        onPhase({
          step: 3,
          label: 'Decoding model geometry',
          pct: 58 + Math.round((bounds.size / Math.min(elementIds.length, MAX_ELEMENTS)) * 34)
        });
      }
    };

    try {
      api.StreamAllMeshes(modelID, collect);
    } catch {
      // Retry element by element on older builds.
      try {
        api.StreamMeshes(modelID, elementIds, collect);
      } catch {
        // Leave bounds empty; the caller falls back to the STEP reader.
      }
    }
    if (!bounds.size) throw new Error('No geometry returned by web-ifc');

    onPhase({ step: 4, label: 'Preparing scanning result', pct: 94 });
    await tick();

    const elements: ElementData[] = [];
    const classCounts = new Map<string, number>();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const id of elementIds) {
      if (elements.length >= MAX_ELEMENTS) break;
      const box = bounds.get(id);
      if (!box) continue;
      const entity = line(id);
      if (!entity) continue;
      const kind = typeName(id);
      const ifcClass = classLabel(kind);
      const dx = Math.max(0.02, box.max[0] - box.min[0]);
      const dy = Math.max(0.02, box.max[1] - box.min[1]);
      const dz = Math.max(0.02, box.max[2] - box.min[2]);
      const cx = (box.min[0] + box.max[0]) / 2;
      const cy = (box.min[1] + box.max[1]) / 2;
      const cz = (box.min[2] + box.max[2]) / 2;
      minX = Math.min(minX, cx - dx / 2);
      maxX = Math.max(maxX, cx + dx / 2);
      minY = Math.min(minY, cy - dy / 2);
      minZ = Math.min(minZ, cz - dz / 2);
      maxZ = Math.max(maxZ, cz + dz / 2);

      const typeId = typeByProduct.get(id);
      const props = {
        ...(typeId != null ? propsByType.get(typeId) ?? {} : {}),
        ...(propsByProduct.get(id) ?? {})
      };
      const quantity = quantityByProduct.get(id);
      const name = textOf(entity.Name) || textOf(entity.ObjectType) || ifcClass;
      const tag = textOf(entity.Tag);
      const gid = textOf(entity.GlobalId) || `#${id}`;
      const material =
        materialByProduct.get(id) ||
        (typeId != null ? materialByProduct.get(typeId) : '') ||
        materialFromProps(props);
      const bboxVolume = dx * dy * dz;
      const volume = quantity?.volume && quantity.volume > 0 ? quantity.volume : bboxVolume;
      const pset: Record<string, string> = {};
      Object.entries(props)
        .slice(0, 36)
        .forEach(([key, value]) => {
          pset[key] = value;
        });
      const raw = rawMeshes.get(id);
      const mesh =
        raw && raw.indices.length >= 3
          ? { positions: new Float32Array(raw.positions), indices: new Uint32Array(raw.indices) }
          : undefined;

      elements.push({
        id: `ifc-${id}`,
        file: 'ifc',
        mark: tag || name.slice(0, 18) || gid.slice(0, 8),
        name,
        cls: ifcClass,
        type: textOf(entity.ObjectType) || ifcClass,
        level: levelOf(id),
        zone: props.Zone || props.zone || undefined,
        mat: material,
        box: [cx, cy, cz, dx, dy, dz],
        mesh,
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

    if (!elements.length) throw new Error('No elements extracted from the IFC');
    rawMeshes.clear();

    const origin = {
      x: Math.round(((minX + maxX) / 2) * 1000) / 1000,
      y: Math.round(minY * 1000) / 1000,
      z: Math.round(((minZ + maxZ) / 2) * 1000) / 1000
    };
    elements.forEach(element => {
      element.box[0] = Math.round((element.box[0] - origin.x) * 1000) / 1000;
      element.box[1] = Math.round((element.box[1] - origin.y) * 1000) / 1000;
      element.box[2] = Math.round((element.box[2] - origin.z) * 1000) / 1000;
      const mesh = element.mesh;
      if (mesh) {
        const positions = mesh.positions;
        for (let index = 0; index < positions.length; index += 3) {
          positions[index] -= origin.x;
          positions[index + 1] -= origin.y;
          positions[index + 2] -= origin.z;
        }
      }
    });

    const meta: IfcModelMeta = {
      schema: (() => {
        try {
          return api.GetModelSchema(modelID) || 'IFC';
        } catch {
          return 'IFC';
        }
      })(),
      projectName: textOf(project?.LongName) || textOf(project?.Name),
      projectNumber: textOf(project?.Name),
      siteName: textOf(site?.Name),
      buildingName: textOf(building?.Name),
      storeys,
      units: unitLabel,
      unitScale: lengthScale,
      elementCount: elements.length,
      totalProducts: elementIds.length,
      origin,
      propertyCount,
      quantityCount,
      classes: [...classCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      fileSize: file.size,
      parseMs: Math.round(performance.now() - startedAt),
      fileName: file.name,
      truncated: elementIds.length > MAX_ELEMENTS && elements.length >= MAX_ELEMENTS,
      engine: 'web-ifc'
    };

    return {
      id: `ifc-${Date.now().toString(36)}`,
      fileName: file.name,
      meta,
      elements
    };
  } finally {
    try {
      api.CloseModel(modelID);
    } catch {
      // ignore
    }
  }
}
