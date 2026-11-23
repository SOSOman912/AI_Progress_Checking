import type { ElementData } from '../demo';

const DB_NAME = 'apc-ifc-meshes';
const STORE = 'models';

interface CachedMesh {
  id: string;
  positions: Float32Array;
  indices: Uint32Array;
}

const openDb = () =>
  new Promise<IDBDatabase | null>(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

/** Keeps the real triangle geometry so a reloaded model is not reduced to boxes. */
export async function saveModelMeshes(modelId: string, elements: ElementData[]): Promise<void> {
  const entries: CachedMesh[] = elements
    .filter(element => element.mesh && element.mesh.indices.length >= 3)
    .map(element => ({
      id: element.id,
      positions: element.mesh!.positions,
      indices: element.mesh!.indices
    }));
  if (!entries.length) return;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entries, modelId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

export async function loadModelMeshes(
  modelId: string
): Promise<Map<string, { positions: Float32Array; indices: Uint32Array }>> {
  const db = await openDb();
  if (!db) return new Map();
  const entries = await new Promise<CachedMesh[]>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(modelId);
      request.onsuccess = () => resolve((request.result as CachedMesh[]) ?? []);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
  db.close();
  return new Map(entries.map(entry => [entry.id, { positions: entry.positions, indices: entry.indices }]));
}
