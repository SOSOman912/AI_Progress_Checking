import * as THREE from 'three';
import type { ElementData, Level } from '../lib/demo';

export type ViewMode = 'persp' | 'top' | 'elev';
export type ElevationSide = 'front' | 'back' | 'left' | 'right';
export type NavMode = 'orbit' | 'pan' | 'zoom' | 'walk';
export type SectionAxis = 'x' | 'y' | 'z';

export interface SectionBoxSettings {
  min: [number, number, number];
  max: [number, number, number];
}

export interface SectionPlaneSettings {
  axis: SectionAxis;
  offset: number;
}

export type SectionChangeKind = 'box' | 'plane';

export type HitType = 'point' | 'line' | 'face';
export type SnapType = HitType | 'cursor';

export interface SnapPoint {
  x: number;
  y: number;
}

export interface SnapCandidate {
  type: SnapType;
  point: [number, number, number];
  screen: SnapPoint;
  id: string | null;
  edge?: [SnapPoint, SnapPoint];
  face?: SnapPoint[];
}

export interface SnapInfo {
  candidates: SnapCandidate[];
  active: number;
  id: string | null;
}

export interface ViewportPaint {
  sel: string | null;
  members: string[];
  missing: string[];
  checked: string[];
  flags?: boolean;
}

export interface ViewportOptions {
  elements: ElementData[];
  levels?: Level[];
  mode?: ViewMode;
  side?: ElevationSide;
  onPick?: (id: string | null, ev: PointerEvent) => void;
  onMeasure?: (point: [number, number, number], id: string | null, hitType?: HitType) => void;
  onSnap?: (info: SnapInfo | null) => void;
  onContext?: ( id: string | null, ev: PointerEvent) => void;
  onRender?: (project: (x: number, y: number, z: number) => { x: number; y: number }) => void;
  onSectionChange?: (kind: SectionChangeKind, settings: SectionBoxSettings | SectionPlaneSettings) => void;
}

export interface ViewportApi {
  paint(state: ViewportPaint): void;
  home(): void;
  focus(ids?: string[]): void;
  setMode(mode: ViewMode, side?: ElevationSide): void;
  project(x: number, y: number, z: number): { x: number; y: number };
  setBox(on: boolean, ids?: string[], depth?: number): void;
  setMeasure(on: boolean, accepts?: SnapType[]): void;
  setNav(mode: NavMode): void;
  setActive(on: boolean): void;
  isolate(ids?: string[]): void;
  hide(ids?: string[]): void;
  showAll(): void;
  setPointCloud(offset?: [number, number, number] | null): void;
  pivot(ids?: string[]): void;
  setSectionBox(on: boolean, settings?: SectionBoxSettings): void;
  setSectionPlane(on: boolean, settings?: SectionPlaneSettings): void;
  setExplode(amount: number): void;
  snapshot(width?: number, height?: number): string | null;
  dispose(): void;
}

const COL = { base: 0xeef0f2, sel: 0xff7a1f, mem: 0xa8dc9a, miss: 0xf2b8b5, check: 0x4fb26a };

const scanRandom = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export function mount(container: HTMLDivElement, opts: ViewportOptions): ViewportApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc9d0d6, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 0.7);
  sun.position.set(8, 14, 10);
  scene.add(sun);
  const grid = new THREE.GridHelper(60, 60, 0xc3cbd2, 0xd8dde2);
  grid.position.y = -0.08;
  scene.add(grid);

  const persp = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
  const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 200);
  let mode: ViewMode = opts.mode || 'persp';
  let side: ElevationSide = opts.side || 'front';
  let theta = -0.65;
  let phi = 1.08;
  let radius = 34;
  let zoom = 1;
  const target = new THREE.Vector3(0, 1.8, 0.2);
  const pan = new THREE.Vector2(0, 0);
  let navMode: NavMode = 'orbit';
  let active = true;

  const planes = [0, 1, 2, 3, 4, 5].map(() => new THREE.Plane());
  let boxOn = false;
  const sectionPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  let planeOn = false;
  const boxHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0x1f78a8));
  boxHelper.visible = false;
  scene.add(boxHelper);

  const sectionFaces = new THREE.Group();
  scene.add(sectionFaces);
  let sectionFaceMeshes: THREE.Mesh[] = [];
  let sectionBoxSet: SectionBoxSettings | null = null;
  let sectionPlaneSet: SectionPlaneSettings | null = null;
  const AXIS_INDEX: Record<SectionAxis, number> = { x: 0, y: 1, z: 2 };

  const meshes: Record<string, any> = {};
  const basePos: Record<string, THREE.Vector3> = {};
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x6f7c88, transparent: true, opacity: 0.6 });
  opts.elements.forEach(e => {
    const [x, y, z, L, H, W] = e.box;
    const source = e.mesh;
    const custom = !!source && source.positions.length >= 9 && source.indices.length >= 3;
    const g = custom
      ? (() => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(source!.positions, 3));
          geometry.setIndex(new THREE.BufferAttribute(source!.indices, 1));
          geometry.computeVertexNormals();
          return geometry;
        })()
      : new THREE.BoxGeometry(L, H, W);
    const m = new THREE.MeshStandardMaterial({
      color: COL.base,
      roughness: 0.85,
      metalness: 0,
      clippingPlanes: planes,
      clipShadows: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    m.clippingPlanes = [];
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(custom ? 0 : x, custom ? 0 : y, custom ? 0 : z);
    basePos[e.id] = mesh.position.clone();
    mesh.userData.id = e.id;
    if (!custom) {
      const em = edgeMat.clone();
      em.clippingPlanes = [];
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), em));
      mesh.userData.edge = em;
    }
    scene.add(mesh);
    meshes[e.id] = mesh;
  });

  const levelGroup = new THREE.Group();
  (opts.levels || []).forEach(l => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-9, l.y, 0),
      new THREE.Vector3(9, l.y, 0)
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({ color: 0x1f78a8, dashSize: 0.25, gapSize: 0.18 })
    );
    line.computeLineDistances();
    levelGroup.add(line);
  });
  scene.add(levelGroup);

  let W = 1;
  let H = 1;
  const cam = () => (mode === 'persp' ? persp : ortho);

  function place() {
    levelGroup.visible = mode === 'elev';
    grid.visible = mode !== 'elev';
    if (mode === 'persp') {
      persp.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      persp.lookAt(target);
      persp.aspect = W / H;
      persp.near = Math.max(0.05, radius / 4000);
      persp.far = Math.max(500, radius * 8);
      persp.updateProjectionMatrix();
      return;
    }
    const span = 9.5 / zoom;
    const a = W / H;
    ortho.left = -span * a + pan.x;
    ortho.right = span * a + pan.x;
    ortho.top = span + pan.y;
    ortho.bottom = -span + pan.y;
    if (mode === 'top') {
      ortho.position.set(0, 50, 0.6);
      ortho.up.set(0, 0, -1);
      ortho.lookAt(0, 0, 0.6);
    } else {
      const d = { front: [0, 0, 50], back: [0, 0, -50], left: [-50, 0, 0], right: [50, 0, 0] }[side];
      ortho.position.set(d[0], 2.2, d[2]);
      ortho.up.set(0, 1, 0);
      ortho.lookAt(0, 2.2, 0);
      levelGroup.rotation.y = side === 'left' || side === 'right' ? Math.PI / 2 : 0;
    }
    ortho.updateProjectionMatrix();
  }

  function project(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(cam());
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
  }

  function render() {
    place();
    renderer.render(scene, cam());
    opts.onRender?.(project);
  }

  function snapshot(width = 640, height = 420): string | null {
    render();
    const src = renderer.domElement;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#f7f9fb');
    grad.addColorStop(0.68, '#dfe7ec');
    grad.addColorStop(1, '#d2dde5');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    const sw = src.width || width;
    const sh = src.height || height;
    const scale = Math.max(width / sw, height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(src, (width - dw) / 2, (height - dh) / 2, dw, dh);
    return out.toDataURL('image/jpeg', 0.82);
  }

  let state: ViewportPaint = { sel: null, members: [], missing: [], checked: [] };

  function paint(s: Partial<ViewportPaint>) {
    state = { ...state, ...s };
    Object.entries(meshes).forEach(([id, m]) => {
      let c = COL.base;
      if (state.missing.includes(id)) c = COL.miss;
      if (state.members.includes(id)) c = state.checked.includes(id) ? COL.check : COL.mem;
      if (id === state.sel) c = COL.sel;
      m.material.color.setHex(c);
      m.material.emissive.setHex(id === state.sel ? 0x2a1000 : 0x000000);
      const dim =
        state.members.length > 0 &&
        !state.members.includes(id) &&
        id !== state.sel &&
        !state.missing.includes(id);
      m.material.transparent = !!dim;
      m.material.opacity = dim ? 0.55 : 1;
      if (m.userData.edge) m.userData.edge.opacity = dim ? 0.25 : 0.6;
    });
    paintCaps();
    render();
  }

  let cloud: THREE.Points | null = null;
  function setPointCloud(offset?: [number, number, number] | null) {
    if (cloud) {
      scene.remove(cloud);
      cloud.geometry.dispose();
      (cloud.material as THREE.PointsMaterial).dispose();
      cloud = null;
    }
    if (!offset) {
      render();
      return;
    }
    const [ox, oy, oz] = offset;
    const random = scanRandom(20261120);
    const positions: number[] = [];
    opts.elements.forEach(e => {
      const [x, y, z, L, Hh, Wd] = e.box;
      const per = 320;
      for (let i = 0; i < per; i += 1) {
        const face = Math.floor(random() * 6);
        let px: number;
        let py: number;
        let pz: number;
        if (face < 2) {
          px = (random() - 0.5) * L;
          py = (random() - 0.5) * Hh;
          pz = (face === 0 ? 1 : -1) * (Wd / 2);
        } else if (face < 4) {
          px = (random() - 0.5) * L;
          py = (face === 2 ? 1 : -1) * (Hh / 2);
          pz = (random() - 0.5) * Wd;
        } else {
          px = (face === 4 ? 1 : -1) * (L / 2);
          py = (random() - 0.5) * Hh;
          pz = (random() - 0.5) * Wd;
        }
        const jitter = 0.014;
        positions.push(
          x + px + ox + (random() - 0.5) * jitter,
          y + py + oy + (random() - 0.5) * jitter,
          z + pz + oz + (random() - 0.5) * jitter
        );
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x1f6f9c,
      size: 0.055,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      sizeAttenuation: true
    });
    cloud = new THREE.Points(geo, mat);
    cloud.name = 'point-cloud-overlay';
    scene.add(cloud);
    render();
  }

  const capGroup = new THREE.Group();
  scene.add(capGroup);

  function buildCaps() {
    capGroup.children.slice().forEach(ch => {
      capGroup.remove(ch);
      (ch as THREE.Mesh).geometry.dispose();
      ((ch as THREE.Mesh).material as THREE.Material).dispose();
    });
    if (!boxOn || mode !== 'elev') return;
    const b = boxHelper.box;
    const axis: 'x' | 'z' = side === 'front' || side === 'back' ? 'z' : 'x';
    const near = { front: b.max.z, back: b.min.z, right: b.max.x, left: b.min.x }[side];
    const toward = { front: 1, back: -1, right: 1, left: -1 }[side];
    Object.entries(meshes).forEach(([id, m]) => {
      const eb = new THREE.Box3().setFromObject(m);
      if (!(eb.min[axis] < near && eb.max[axis] > near)) return;
      const ib = eb.clone().intersect(b);
      if (ib.isEmpty()) return;
      const w = axis === 'z' ? ib.max.x - ib.min.x : ib.max.z - ib.min.z;
      const h = ib.max.y - ib.min.y;
      if (w <= 0 || h <= 0) return;
      const cap = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true })
      );
      const cx = (ib.min.x + ib.max.x) / 2;
      const cy = (ib.min.y + ib.max.y) / 2;
      const cz = (ib.min.z + ib.max.z) / 2;
      if (axis === 'z') cap.position.set(cx, cy, near - toward * 0.001);
      else {
        cap.position.set(near - toward * 0.001, cy, cz);
        cap.rotation.y = Math.PI / 2;
      }
      cap.userData.id = id;
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(cap.geometry),
        new THREE.LineBasicMaterial({ color: 0x3d4852 })
      );
      cap.add(edge);
      capGroup.add(cap);
    });
    paintCaps();
  }

  function paintCaps() {
    capGroup.children.forEach(ch => {
      const cap = ch as THREE.Mesh;
      const m = meshes[cap.userData.id];
      (cap.material as THREE.MeshBasicMaterial).color.copy(m.material.color).multiplyScalar(0.86);
      (cap.material as THREE.MeshBasicMaterial).opacity = m.material.transparent ? m.material.opacity : 1;
    });
  }

  function clearSectionFaces() {
    sectionFaceMeshes = [];
    sectionFaces.children.slice().forEach(ch => {
      sectionFaces.remove(ch);
      (ch as THREE.Mesh).geometry.dispose();
      const material = (ch as THREE.Mesh).material;
      if (Array.isArray(material)) material.forEach(m => m.dispose());
      else material.dispose();
    });
  }

  function addSectionFace(
    w: number,
    h: number,
    pos: [number, number, number],
    rot: [number, number, number],
    face: Record<string, string>
  ) {
    const geo = new THREE.PlaneGeometry(Math.max(0.01, w), Math.max(0.01, h));
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1f78a8,
      transparent: true,
      opacity: 0.09,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.renderOrder = 4;
    mesh.userData.sectionFace = face;
    mesh.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x1f78a8, transparent: true, opacity: 0.55 })
      )
    );
    sectionFaces.add(mesh);
    sectionFaceMeshes.push(mesh);
  }

  function buildSectionFaces() {
    clearSectionFaces();
    if (sectionBoxSet) {
      const { min, max } = sectionBoxSet;
      const cx = (min[0] + max[0]) / 2;
      const cy = (min[1] + max[1]) / 2;
      const cz = (min[2] + max[2]) / 2;
      const dx = max[0] - min[0];
      const dy = max[1] - min[1];
      const dz = max[2] - min[2];
      addSectionFace(dz, dy, [min[0], cy, cz], [0, Math.PI / 2, 0], { kind: 'box', axis: 'x', side: 'min' });
      addSectionFace(dz, dy, [max[0], cy, cz], [0, Math.PI / 2, 0], { kind: 'box', axis: 'x', side: 'max' });
      addSectionFace(dx, dz, [cx, min[1], cz], [Math.PI / 2, 0, 0], { kind: 'box', axis: 'y', side: 'min' });
      addSectionFace(dx, dz, [cx, max[1], cz], [Math.PI / 2, 0, 0], { kind: 'box', axis: 'y', side: 'max' });
      addSectionFace(dx, dy, [cx, cy, min[2]], [0, 0, 0], { kind: 'box', axis: 'z', side: 'min' });
      addSectionFace(dx, dy, [cx, cy, max[2]], [0, 0, 0], { kind: 'box', axis: 'z', side: 'max' });
      return;
    }
    if (sectionPlaneSet) {
      const { axis, offset } = sectionPlaneSet;
      const b = boxOf();
      const c = b.getCenter(new THREE.Vector3());
      const s = b.getSize(new THREE.Vector3());
      const pad = 3;
      if (axis === 'x') {
        addSectionFace(s.z + pad, s.y + pad, [offset, c.y, c.z], [0, Math.PI / 2, 0], { kind: 'plane', axis });
      } else if (axis === 'y') {
        addSectionFace(s.x + pad, s.z + pad, [c.x, offset, c.z], [Math.PI / 2, 0, 0], { kind: 'plane', axis });
      } else {
        addSectionFace(s.x + pad, s.y + pad, [c.x, c.y, offset], [0, 0, 0], { kind: 'plane', axis });
      }
    }
  }

  function applySectionBox(settings: SectionBoxSettings) {
    sectionBoxSet = settings;
    boxOn = true;
    planeOn = false;
    const { min, max } = settings;
    boxHelper.box.set(new THREE.Vector3(...min), new THREE.Vector3(...max));
    boxHelper.visible = true;
    const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const c = [-min[0], max[0], -min[1], max[1], -min[2], max[2]];
    n.forEach((v, i) => planes[i].set(new THREE.Vector3(v[0], v[1], v[2]), c[i]));
    buildSectionFaces();
    applyClipping();
    buildCaps();
    render();
  }

  function applySectionPlane(settings: SectionPlaneSettings) {
    sectionPlaneSet = settings;
    boxOn = false;
    planeOn = true;
    boxHelper.visible = false;
    const v = new THREE.Vector3(settings.axis === 'x' ? 1 : 0, settings.axis === 'y' ? 1 : 0, settings.axis === 'z' ? 1 : 0);
    sectionPlane.set(v, -settings.offset);
    buildSectionFaces();
    applyClipping();
    buildCaps();
    render();
  }

  let currentBoxIds: string[] | undefined;
  let currentBoxDepth: number | undefined;

  function applyClipping() {
    const list = boxOn ? planes : planeOn ? [sectionPlane] : [];
    Object.values(meshes).forEach(m => {
      m.material.clippingPlanes = list;
      m.material.needsUpdate = true;
      if (m.userData.edge) {
        m.userData.edge.clippingPlanes = list;
        m.userData.edge.needsUpdate = true;
      }
    });
    boxHelper.visible = boxOn;
  }

  function boxOf(ids?: string[]) {
    const b = new THREE.Box3();
    const list = ids && ids.length ? ids : Object.keys(meshes);
    list.forEach(id => {
      if (meshes[id] && meshes[id].visible) b.expandByObject(meshes[id]);
    });
    if (b.isEmpty()) b.expandByObject(Object.values(meshes)[0] || new THREE.Object3D());
    return b;
  }

  function applyBox(on: boolean, ids?: string[], depth?: number) {
    boxOn = on;
    sectionBoxSet = null;
    sectionPlaneSet = null;
    clearSectionFaces();
    if (on) planeOn = false;
    if (on) {
      const b = boxOf(ids);
      b.expandByScalar(0.15);
      if (depth != null) {
        const c = b.getCenter(new THREE.Vector3());
        if (side === 'front' || side === 'back') {
          b.min.z = c.z - depth / 2;
          b.max.z = c.z + depth / 2;
        } else {
          b.min.x = c.x - depth / 2;
          b.max.x = c.x + depth / 2;
        }
      }
      boxHelper.box.copy(b);
      const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      const c = [-b.min.x, b.max.x, -b.min.y, b.max.y, -b.min.z, b.max.z];
      n.forEach((v, i) => planes[i].set(new THREE.Vector3(v[0], v[1], v[2]), c[i]));
    }
    applyClipping();
    buildCaps();
    render();
  }

  let drag: any = null;
  let moved = false;
  let measureMode = false;
  let snapCandidates: SnapCandidate[] = [];
  let snapActive = 0;
  let activeSnapType: SnapType | null = null;
  let snapAccepts: SnapType[] = ['point', 'line', 'face', 'cursor'];
  let lastPointer: { x: number; y: number } | null = null;
  let snapPinned = false;
  let snapPinnedAt: { x: number; y: number } | null = null;

  function faceScreenPolygon(mesh: THREE.Mesh, hit: THREE.Intersection): SnapPoint[] | null {
    const geo = mesh.geometry as THREE.BufferGeometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const normal = hit.face?.normal;
    if (!bb || !normal) return null;
    const axes = [0, 1, 2].sort((a, b) => Math.abs(normal.getComponent(b)) - Math.abs(normal.getComponent(a)));
    const axis = axes[0];
    const u = axes[1];
    const v = axes[2];
    const fixed = normal.getComponent(axis) >= 0 ? bb.max.getComponent(axis) : bb.min.getComponent(axis);
    mesh.updateWorldMatrix(true, false);
    const us = [bb.min.getComponent(u), bb.max.getComponent(u)];
    const vs = [bb.min.getComponent(v), bb.max.getComponent(v)];
    return [
      [us[0], vs[0]],
      [us[1], vs[0]],
      [us[1], vs[1]],
      [us[0], vs[1]]
    ].map(([uu, vv]) => {
      const p = new THREE.Vector3();
      p.setComponent(axis, fixed);
      p.setComponent(u, uu);
      p.setComponent(v, vv);
      p.applyMatrix4(mesh.matrixWorld);
      return project(p.x, p.y, p.z);
    });
  }

  function emitSnap() {
    if (!snapCandidates.length) {
      opts.onSnap?.(null);
      return;
    }
    const active = snapCandidates[snapActive];
    activeSnapType = active.type;
    opts.onSnap?.({ candidates: snapCandidates, active: snapActive, id: active.id });
  }

  function clearSnap() {
    activeSnapType = null;
    snapPinned = false;
    snapPinnedAt = null;
    if (!snapCandidates.length) return;
    snapCandidates = [];
    snapActive = 0;
    opts.onSnap?.(null);
  }

  function visibleAt(point: THREE.Vector3, screen: SnapPoint) {
    const ray = rayAtLocal(screen.x, screen.y);
    const hits = ray
      .intersectObjects(Object.values(meshes), false)
      .filter(h => h.object.visible && (!boxOn || boxHelper.box.containsPoint(h.point)));
    if (!hits[0]) return true;
    const along = point.clone().sub(ray.ray.origin).dot(ray.ray.direction);
    return hits[0].distance >= along - 0.02;
  }

  function edgeVisible(a: THREE.Vector3, b: THREE.Vector3, sa: SnapPoint, sb: SnapPoint) {
    for (const t of [0.06, 0.25, 0.5, 0.75, 0.94]) {
      const p = a.clone().lerp(b, t);
      const s = { x: sa.x + (sb.x - sa.x) * t, y: sa.y + (sb.y - sa.y) * t };
      if (!visibleAt(p, s)) return false;
    }
    return true;
  }

  function updateSnapAt(clientX: number, clientY: number) {
    if (snapPinned && snapPinnedAt && Math.hypot(clientX - snapPinnedAt.x, clientY - snapPinnedAt.y) > 6) {
      snapPinned = false;
    }
    lastPointer = { x: clientX, y: clientY };
    if (!measureMode) return;
    const rect = el.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const ray = rayAtXY(clientX, clientY);
    const hits = ray
      .intersectObjects(Object.values(meshes), false)
      .filter(h => h.object.visible && (!boxOn || boxHelper.box.containsPoint(h.point)));
    if (!hits[0]) {
      clearSnap();
      return;
    }
    const hit = hits[0];
    const mesh = hit.object as THREE.Mesh;
    const id = (mesh.userData.id as string) || null;
    const geo = mesh.geometry as THREE.BufferGeometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const cursorScreen = project(hit.point.x, hit.point.y, hit.point.z);
    const candidates: SnapCandidate[] = [
      {
        type: 'cursor',
        point: [hit.point.x, hit.point.y, hit.point.z],
        screen: cursorScreen,
        id
      }
    ];
    if (bb) {
      mesh.updateWorldMatrix(true, false);
      const corner: THREE.Vector3[] = [];
      for (const x of [bb.min.x, bb.max.x]) {
        for (const y of [bb.min.y, bb.max.y]) {
          for (const z of [bb.min.z, bb.max.z]) {
            corner.push(new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld));
          }
        }
      }
      const screen = corner.map(p => project(p.x, p.y, p.z));
      const nearPoints = screen
        .map((p, i) => ({ d: Math.hypot(p.x - mx, p.y - my), i }))
        .filter(p => p.d <= 14)
        .sort((a, b) => a.d - b.d);
      const point = nearPoints.find(p => visibleAt(corner[p.i], screen[p.i]));
      if (point) {
        const p = corner[point.i];
        candidates.push({
          type: 'point',
          point: [p.x, p.y, p.z],
          screen: screen[point.i],
          id
        });
      }
      const edges = [
        [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
        [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]
      ];
      const nearEdges = edges
        .map(([a, b], ei) => {
          const A = screen[a];
          const B = screen[b];
          const vx = B.x - A.x;
          const vy = B.y - A.y;
          const len2 = vx * vx + vy * vy;
          if (len2 < 0.001) return { d: Infinity, edge: ei, t: 0 };
          const t = Math.max(0, Math.min(1, ((mx - A.x) * vx + (my - A.y) * vy) / len2));
          const d = Math.hypot(A.x + vx * t - mx, A.y + vy * t - my);
          return { d, edge: ei, t };
        })
        .filter(e => e.d <= 10)
        .sort((a, b) => a.d - b.d);
      const edge = nearEdges.find(e => {
        const [a, b] = edges[e.edge];
        return edgeVisible(corner[a], corner[b], screen[a], screen[b]);
      });
      if (edge) {
        const [a, b] = edges[edge.edge];
        const p = corner[a].clone().lerp(corner[b], edge.t);
        candidates.push({
          type: 'line',
          point: [p.x, p.y, p.z],
          screen: { x: screen[a].x + (screen[b].x - screen[a].x) * edge.t, y: screen[a].y + (screen[b].y - screen[a].y) * edge.t },
          edge: [screen[a], screen[b]],
          id
        });
      }
    }
    const face = faceScreenPolygon(mesh, hit);
    candidates.push({
      type: 'face',
      point: [hit.point.x, hit.point.y, hit.point.z],
      screen: cursorScreen,
      face: face || undefined,
      id
    });
    snapCandidates = candidates;
    const accepted = (c: SnapCandidate) => c.type === 'cursor' || snapAccepts.includes(c.type);
    const kept = snapPinned && activeSnapType ? candidates.findIndex(c => c.type === activeSnapType) : -1;
    if (kept >= 0 && accepted(candidates[kept])) {
      snapActive = kept;
    } else {
      snapActive = 0;
      for (const type of ['point', 'line', 'face', 'cursor'] as SnapType[]) {
        const i = candidates.findIndex(c => c.type === type);
        if (i >= 0 && accepted(candidates[i])) {
          snapActive = i;
          break;
        }
      }
    }
    emitSnap();
  }

  const snapKeys = (ev: KeyboardEvent) => {
    if (!active || !measureMode || ev.key !== 'Tab' || snapCandidates.length < 2) return;
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (ev.target as HTMLElement | null)?.isContentEditable) return;
    ev.preventDefault();
    const dir = ev.shiftKey ? -1 : 1;
    snapActive = (snapActive + dir + snapCandidates.length) % snapCandidates.length;
    snapPinned = true;
    snapPinnedAt = lastPointer;
    emitSnap();
  };

  interface SectionDrag {
    face: { kind: 'box' | 'plane'; axis: SectionAxis; side?: 'min' | 'max' };
    startX: number;
    startY: number;
    hit: THREE.Vector3;
    box?: SectionBoxSettings;
    plane?: SectionPlaneSettings;
  }
  let sectionDrag: SectionDrag | null = null;

  function rayAtLocal(mx: number, my: number) {
    const v = new THREE.Vector2((mx / W) * 2 - 1, -(my / H) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, cam());
    return ray;
  }

  function rayAtXY(clientX: number, clientY: number) {
    const r = el.getBoundingClientRect();
    const v = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, cam());
    return ray;
  }

  function rayAt(ev: PointerEvent) {
    return rayAtXY(ev.clientX, ev.clientY);
  }

  function sectionHit(ev: PointerEvent) {
    if (!sectionFaceMeshes.length) return null;
    return rayAt(ev).intersectObjects(sectionFaceMeshes, false)[0] || null;
  }

  function axisDelta(faceAxis: SectionAxis, from: THREE.Vector3, startX: number, startY: number, x: number, y: number) {
    const a = project(from.x, from.y, from.z);
    const b = project(
      from.x + (faceAxis === 'x' ? 1 : 0),
      from.y + (faceAxis === 'y' ? 1 : 0),
      from.z + (faceAxis === 'z' ? 1 : 0)
    );
    const ax = b.x - a.x;
    const ay = b.y - a.y;
    const den = ax * ax + ay * ay;
    if (den < 1) return (startY - y) * 0.01;
    return ((x - startX) * ax + (y - startY) * ay) / den;
  }

  const el = renderer.domElement;
  el.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    if (!opts.onContext) return;
    const r = el.getBoundingClientRect();
    const v = new THREE.Vector2(
      ((ev.clientX - r.left) / r.width) * 2 - 1,
      -((ev.clientY - r.top) / r.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, cam());
    const hits = ray
      .intersectObjects(Object.values(meshes), false)
      .filter(h => h.object.visible && (!boxOn || boxHelper.box.containsPoint(h.point)));
    opts.onContext(hits[0] ? hits[0].object.userData.id : null, ev);
  });
  el.addEventListener('pointerdown', ev => {
    moved = false;
    const sh = sectionHit(ev);
    if (sh) {
      const face = sh.object.userData.sectionFace as SectionDrag['face'];
      sectionDrag = {
        face,
        startX: ev.clientX,
        startY: ev.clientY,
        hit: sh.point.clone(),
        box: sectionBoxSet ? { min: [...sectionBoxSet.min], max: [...sectionBoxSet.max] } : undefined,
        plane: sectionPlaneSet ? { ...sectionPlaneSet } : undefined
      };
      el.setPointerCapture(ev.pointerId);
      return;
    }
    if (measureMode) updateSnapAt(ev.clientX, ev.clientY);
    drag = { x: ev.clientX, y: ev.clientY, t: theta, p: phi, px: pan.x, py: pan.y, btn: ev.button, tx: target.x, ty: target.y };
    el.setPointerCapture(ev.pointerId);
  });
  el.addEventListener('pointermove', ev => {
    if (sectionDrag) {
      if (Math.abs(ev.clientX - sectionDrag.startX) + Math.abs(ev.clientY - sectionDrag.startY) > 1) moved = true;
      const amount = axisDelta(
        sectionDrag.face.axis,
        sectionDrag.hit,
        sectionDrag.startX,
        sectionDrag.startY,
        ev.clientX,
        ev.clientY
      );
      if (sectionDrag.face.kind === 'box' && sectionDrag.box) {
        const next: SectionBoxSettings = { min: [...sectionDrag.box.min], max: [...sectionDrag.box.max] };
        const i = AXIS_INDEX[sectionDrag.face.axis];
        if (sectionDrag.face.side === 'min') next.min[i] = Math.min(sectionDrag.box.min[i] + amount, sectionDrag.box.max[i] - 0.05);
        else next.max[i] = Math.max(sectionDrag.box.max[i] + amount, sectionDrag.box.min[i] + 0.05);
        applySectionBox(next);
        opts.onSectionChange?.('box', next);
      } else if (sectionDrag.face.kind === 'plane' && sectionDrag.plane) {
        const next: SectionPlaneSettings = { ...sectionDrag.plane, offset: sectionDrag.plane.offset + amount };
        applySectionPlane(next);
        opts.onSectionChange?.('plane', next);
      }
      return;
    }
    if (!drag) {
      if (measureMode) updateSnapAt(ev.clientX, ev.clientY);
      return;
    }
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    if (!moved) return;
    if (measureMode) clearSnap();
    if (mode === 'persp') {
      if (navMode === 'zoom') {
        radius = Math.min(80, Math.max(6, radius * (1 + dy * 0.01)));
      } else if (navMode === 'walk') {
        theta = drag.t - dx * 0.006;
        phi = Math.min(1.52, Math.max(0.2, drag.p - dy * 0.006));
      } else if (navMode === 'orbit' && drag.btn === 0) {
        theta = drag.t - dx * 0.006;
        phi = Math.min(1.52, Math.max(0.2, drag.p - dy * 0.006));
      } else {
        target.x = drag.tx - dx * 0.02;
        target.y = drag.ty + dy * 0.02;
      }
    } else {
      if (navMode === 'zoom') {
        zoom = Math.min(8, Math.max(0.4, zoom * (1 - dy * 0.01)));
      } else {
        const s = (ortho.top - ortho.bottom) / H;
        pan.x = drag.px - dx * s;
        pan.y = drag.py + dy * s;
      }
    }
    render();
  });
  el.addEventListener('pointerup', ev => {
    if (sectionDrag) {
      sectionDrag = null;
      drag = null;
      return;
    }
    if (drag && !moved) {
      if (measureMode) {
        updateSnapAt(ev.clientX, ev.clientY);
        const picked = snapCandidates[snapActive];
        if (picked) {
          opts.onMeasure?.(picked.point, picked.id, picked.type === 'cursor' ? undefined : picked.type);
        }
      } else {
        const hits = rayAt(ev)
          .intersectObjects(Object.values(meshes), false)
          .filter(h => h.object.visible && (!boxOn || boxHelper.box.containsPoint(h.point)));
        opts.onPick?.(hits[0] ? hits[0].object.userData.id : null, ev);
      }
    }
    drag = null;
    if (measureMode) updateSnapAt(ev.clientX, ev.clientY);
  });
  el.addEventListener('pointerleave', () => {
    if (!measureMode) return;
    lastPointer = null;
    clearSnap();
  });
  el.addEventListener(
    'wheel',
    ev => {
      ev.preventDefault();
      if (mode === 'persp') radius = Math.min(80, Math.max(6, radius * (1 + ev.deltaY * 0.001)));
      else zoom = Math.min(8, Math.max(0.4, zoom * (1 - ev.deltaY * 0.001)));
      render();
      if (measureMode) updateSnapAt(ev.clientX, ev.clientY);
    },
    { passive: false }
  );

  const keys = new Set<string>();
  const walk = (ev: KeyboardEvent) => {
    if (!active || navMode !== 'walk' || mode !== 'persp') return;
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (ev.target as HTMLElement | null)?.isContentEditable) return;
    const key = ev.key.toLowerCase();
    if (!['w', 'a', 's', 'd'].includes(key)) return;
    ev.preventDefault();
    if (ev.type === 'keydown') keys.add(key);
    else keys.delete(key);
    if (ev.type !== 'keydown') return;
    const forward = new THREE.Vector3().subVectors(target, persp.position);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) return;
    forward.normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(forward).normalize();
    const step = 0.35;
    if (keys.has('w')) target.addScaledVector(forward, step);
    if (keys.has('s')) target.addScaledVector(forward, -step);
    if (keys.has('d')) target.addScaledVector(right, step);
    if (keys.has('a')) target.addScaledVector(right, -step);
    render();
  };
  const clearKeys = () => keys.clear();
  window.addEventListener('keydown', walk);
  window.addEventListener('keyup', walk);
  window.addEventListener('blur', clearKeys);
  window.addEventListener('keydown', snapKeys);

  const ro = new ResizeObserver(() => {
    W = Math.max(1, container.clientWidth);
    H = Math.max(1, container.clientHeight);
    renderer.setSize(W, H);
    render();
  });
  ro.observe(container);

  function home() {
    theta = -0.65;
    phi = 1.08;
    radius = 34;
    zoom = 1;
    pan.set(0, 0);
    target.set(0, 1.8, 0.2);
    render();
  }

  function focus(ids?: string[]) {
    if (!ids || !ids.length) return home();
    const b = new THREE.Box3();
    ids.forEach(id => meshes[id] && b.expandByObject(meshes[id]));
    if (boxOn && mode === 'elev') b.intersect(boxHelper.box);
    const c = b.getCenter(new THREE.Vector3());
    const sz = b.getSize(new THREE.Vector3());
    const s = sz.length();
    if (mode === 'persp') {
      target.copy(c);
      radius = Math.max(8, s * 2.4);
    } else {
      const sw = mode === 'top' ? sz.x : side === 'front' || side === 'back' ? sz.x : sz.z;
      const sh = mode === 'top' ? sz.z : sz.y;
      const a = W / H;
      const m = 1.35;
      const zw = (2 * 9.5 * a) / Math.max(0.8, sw * m);
      const zh = (2 * 9.5) / Math.max(0.8, sh * m);
      zoom = Math.min(8, Math.max(0.4, Math.min(zw, zh)));
      if (mode === 'top') pan.set(c.x, -(c.z - 0.6));
      else pan.set(side === 'front' ? c.x : side === 'back' ? -c.x : side === 'left' ? c.z : -c.z, c.y - 2.2);
    }
    render();
  }

  function setMode(m: ViewMode, s?: ElevationSide) {
    mode = m;
    if (s) side = s;
    zoom = 1;
    pan.set(0, 0);
    if (boxOn) applyBox(true, currentBoxIds, currentBoxDepth);
    else {
      buildCaps();
      render();
    }
  }

  function pivot(ids?: string[]) {
    if (!ids || !ids.length) return;
    const b = new THREE.Box3();
    ids.forEach(id => meshes[id] && b.expandByObject(meshes[id]));
    if (b.isEmpty()) return;
    target.copy(b.getCenter(new THREE.Vector3()));
    render();
  }

  function setExplode(amount: number) {
    const b = new THREE.Box3();
    Object.keys(meshes).forEach(id => b.expandByObject(meshes[id]));
    const center = b.getCenter(new THREE.Vector3());
    Object.entries(meshes).forEach(([id, m]) => {
      const base = basePos[id];
      if (!base) return;
      const dir = base.clone().sub(center);
      dir.y = 0;
      if (dir.lengthSq() < 0.0001) dir.set(0, 1, 0);
      dir.normalize();
      m.position.copy(base).addScaledVector(dir, amount);
    });
    render();
  }

  paint({});

  return {
    paint,
    home,
    focus,
    setMode,
    project,
    setBox(on, ids, depth) {
      currentBoxIds = ids;
      currentBoxDepth = depth;
      applyBox(on, ids, depth);
      if (on && mode === 'elev' && ids && ids.length) focus(ids);
    },
    setMeasure(on, accepts) {
      measureMode = on;
      if (accepts) snapAccepts = accepts.includes('cursor') ? accepts : [...accepts, 'cursor'];
      if (!on) {
        lastPointer = null;
        activeSnapType = null;
        clearSnap();
        opts.onSnap?.(null);
        return;
      }
      if (lastPointer) updateSnapAt(lastPointer.x, lastPointer.y);
    },
    setNav(m) {
      navMode = m;
      el.style.cursor = m === 'pan' ? 'grab' : m === 'zoom' ? 'zoom-in' : m === 'walk' ? 'crosshair' : 'default';
    },
    setActive(on) {
      active = on;
      if (!on) keys.clear();
    },
    isolate(ids) {
      if (!ids || !ids.length) return;
      const set = new Set(ids);
      Object.entries(meshes).forEach(([id, m]) => {
        m.visible = set.has(id);
      });
      render();
    },
    hide(ids) {
      if (!ids || !ids.length) return;
      ids.forEach(id => {
        if (meshes[id]) meshes[id].visible = false;
      });
      render();
    },
    showAll() {
      Object.values(meshes).forEach(m => {
        m.visible = true;
      });
      render();
    },
    setPointCloud,
    pivot,
    setSectionBox(on, settings) {
      if (!on) {
        boxOn = false;
        sectionBoxSet = null;
        boxHelper.visible = false;
        clearSectionFaces();
        applyClipping();
        render();
        return;
      }
      if (settings) applySectionBox(settings);
    },
    setSectionPlane(on, settings) {
      if (!on) {
        planeOn = false;
        sectionPlaneSet = null;
        clearSectionFaces();
        applyClipping();
        render();
        return;
      }
      if (settings) applySectionPlane(settings);
    },
    setExplode,
    snapshot,
    dispose() {
      ro.disconnect();
      window.removeEventListener('keydown', walk);
      window.removeEventListener('keyup', walk);
      window.removeEventListener('blur', clearKeys);
      window.removeEventListener('keydown', snapKeys);
      renderer.dispose();
      container.innerHTML = '';
    }
  };
}
