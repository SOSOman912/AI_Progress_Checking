import { saveModelMeshes } from './meshCache';
import { buildIfcModel, type IfcModel } from './reader';
import { parseStep } from './step';
import { readWithWebIfc } from './webIfc';

export type { IfcModel, IfcModelMeta, IfcStoreyInfo } from './reader';

export interface IfcPhase {
  step: number;
  label: string;
  pct: number;
}

export const IFC_PHASES = [
  'Loading IFC engine',
  'Opening IFC model',
  'Reading properties and units',
  'Decoding model geometry',
  'Preparing scanning result'
];

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 40));

/**
 * Reads an IFC file in the browser.
 * web-ifc is the primary engine (same approach as the legacy ifc-qto.html).
 * If the CDN module or WASM cannot load, the built-in STEP reader takes over so
 * the page still works offline.
 */
export async function readIfcFile(
  file: File,
  onPhase: (phase: IfcPhase) => void
): Promise<IfcModel> {
  const started = performance.now();

  try {
    const model = await readWithWebIfc(file, onPhase, started);
    model.meta.parseMs = Math.round(performance.now() - started);
    void saveModelMeshes(model.id, model.elements);
    return model;
  } catch {
    onPhase({ step: 0, label: 'Reading IFC file', pct: 6 });
    await tick();
  }

  const text = await file.text();
  onPhase({ step: 1, label: 'Parsing IFC entities', pct: 24 });
  await tick();

  const { entities, schema } = parseStep(text);
  const parseMs = performance.now() - started;
  onPhase({ step: 2, label: 'Extracting attributes', pct: 48 });
  await tick();

  const model = await buildIfcModel(entities, {
    fileName: file.name,
    fileSize: file.size,
    schema,
    parseMs,
    onProgress: fraction =>
      onPhase({
        step: 3,
        label: 'Building model geometry',
        pct: 48 + Math.round(fraction * 44)
      })
  });

  onPhase({ step: 4, label: 'Preparing scanning result', pct: 96 });
  await tick();

  model.meta.parseMs = Math.round(performance.now() - started);
  void saveModelMeshes(model.id, model.elements);
  return model;
}
