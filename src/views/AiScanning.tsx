import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { Icon, type IconName } from '../components/Icon';
import { Hint } from '../components/Hint';
import { MappingResultPage } from './BimMapping';
import { demoData, type ElementData } from '../lib/demo';
import { buildMappingResult } from '../lib/mappingResult';
import type { MappingScenario } from '../lib/mappingScenarios';
import { mount as mountViewport, type ViewportApi } from '../three/viewport';
import {
  loadScanAssets,
  saveScanAssets,
  type ScanAsset,
  type ScanAssetType,
  type ScanStage
} from '../lib/scanAssets';
import {
  cleanseIfcModel,
  cleanseScanAsset,
  deleteScanAsset,
  fetchScanJob,
  getIfcModel,
  listScanAssets,
  normalizeScanAsset,
  patchIfcElement,
  patchScanAsset,
  probeScanApi,
  saveScanAsset,
  startScanImport,
  upsertIfcModel
} from '../lib/scanApi';
import { IFC_PHASES, readIfcFile, type IfcModel, type IfcPhase } from '../lib/ifc';
import { loadModelMeshes } from '../lib/ifc/meshCache';

type ViewMode = 'grid' | 'list';

interface DraftAsset extends ScanAsset {
  progress: number;
  status: 'uploading' | 'ready';
}

const SCAN_TYPES: Record<
  ScanAssetType,
  {
    label: string;
    short: string;
    icon: IconName;
    accept: string;
    hint: string;
    empty: string;
    art: string;
  }
> = {
  scan: {
    label: '3D Scanning',
    short: '3D scan',
    icon: 'scan',
    accept: '.e57,.las,.laz,.ply,.xyz,.pts',
    hint: 'E57, LAS, LAZ, PLY, XYZ or PTS',
    empty: 'Drop a point-cloud capture here, or click to select.',
    art: '/import/scan-cloud.svg'
  },
  drawing: {
    label: 'Drawing',
    short: 'Drawing',
    icon: 'drafting-compass',
    accept: '.pdf,.dwg,.dxf,.rvt',
    hint: 'PDF, DWG, DXF or RVT',
    empty: 'Drop a drawing here, or click to select.',
    art: '/import/drawing.png'
  },
  bim: {
    label: 'BIM Model',
    short: 'BIM model',
    icon: 'box',
    accept: '.ifc,.rvt,.nwc',
    hint: 'IFC, RVT or NWC',
    empty: 'Drop an IFC model here, or click to select.',
    art: '/import/bim-model.svg'
  }
};

const SCAN_TAB_ORDER: ScanAssetType[] = ['bim'];

const SCAN_TAB_LABEL: Record<ScanAssetType, string> = {
  bim: 'BIM models',
  drawing: 'Drawings',
  scan: 'Point clouds'
};

const SCAN_TAB_UNIT: Record<ScanAssetType, [string, string]> = {
  bim: ['model', 'models'],
  drawing: ['drawing', 'drawings'],
  scan: ['point cloud', 'point clouds']
};

const SCAN_IMPORT_LABEL: Record<ScanAssetType, string> = {
  bim: 'Import IFC',
  drawing: 'Import IFC',
  scan: 'Import Point Cloud'
};

const sizeLabel = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const dateLabel = (time: number) =>
  new Date(time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

const isBim = (asset: ScanAsset) => asset.type === 'bim';

function BimPreview({ variant }: { variant: number }) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, '');
  const mode = Math.abs(variant) % 3;

  return (
    <svg viewBox="0 0 640 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef4f8" />
          <stop offset="0.62" stopColor="#d8e3ea" />
          <stop offset="1" stopColor="#c3d2de" />
        </linearGradient>
        <linearGradient id={`ground-${uid}`} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#dbe5eb" />
          <stop offset="1" stopColor="#b6c8d3" />
        </linearGradient>
        <linearGradient id={`left-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#56708a" />
          <stop offset="1" stopColor="#2d455c" />
        </linearGradient>
        <linearGradient id={`right-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#849bb0" />
          <stop offset="1" stopColor="#5d7892" />
        </linearGradient>
        <linearGradient id={`top-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b7c8d6" />
          <stop offset="1" stopColor="#849db2" />
        </linearGradient>
        <linearGradient id={`glass-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9d7e4" stopOpacity="0.72" />
          <stop offset="1" stopColor="#6ea6bf" stopOpacity="0.74" />
        </linearGradient>
        <filter id={`blur-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>

      <rect width="640" height="420" fill={`url(#sky-${uid})`} />
      <circle cx="538" cy="76" r="68" fill="#ffffff" opacity="0.22" />
      <circle cx="538" cy="76" r="42" fill="#ffffff" opacity="0.26" />
      <path d="M0 310 L640 240 V420 H0Z" fill={`url(#ground-${uid})`} />
      <g stroke="#ffffff" strokeWidth="0.8" opacity="0.35">
        <path d="M-30 362 L670 280" />
        <path d="M-30 392 L670 310" />
        <path d="M88 420 L168 252" />
        <path d="M230 420 L310 252" />
        <path d="M372 420 L452 252" />
        <path d="M514 420 L594 252" />
      </g>

      <ellipse cx="330" cy="348" rx={mode === 1 ? 226 : 164} ry="34" fill="#456277" opacity="0.25" filter={`url(#blur-${uid})`} />

      {mode === 0 && (
        <g transform="translate(282 108)">
          <polygon points="0,184 22,199 22,258 0,241" fill="#425d74" />
          <polygon points="22,199 112,160 112,218 22,258" fill="#718ba0" />
          <polygon points="0,184 90,145 112,160 22,199" fill="#a7becc" />
          <g stroke="#d7e4ea" strokeWidth="1" opacity="0.62">
            <path d="M8 196 L99 157 M8 207 L99 168 M8 218 L99 179 M8 229 L99 190 M8 240 L99 201" />
            <path d="M29 205 L29 264 M44 198 L44 257 M59 191 L59 250 M74 184 L74 243 M89 177 L89 236" />
          </g>

          <polygon points="86,7 190,49 190,268 86,225" fill={`url(#left-${uid})`} />
          <polygon points="190,49 284,6 284,225 190,268" fill={`url(#right-${uid})`} />
          <polygon points="86,7 180,-34 284,6 190,49" fill={`url(#top-${uid})`} />
          <g fill={`url(#glass-${uid})`}>
            <polygon points="98,26 178,60 178,84 98,50" />
            <polygon points="198,61 272,29 272,53 198,85" />
            <polygon points="98,62 178,96 178,120 98,86" />
            <polygon points="198,97 272,65 272,89 198,121" />
            <polygon points="98,98 178,132 178,156 98,122" />
            <polygon points="198,133 272,101 272,125 198,157" />
            <polygon points="98,134 178,168 178,192 98,158" />
            <polygon points="198,169 272,137 272,161 198,193" />
            <polygon points="98,170 178,204 178,228 98,194" />
            <polygon points="198,205 272,173 272,197 198,229" />
            <polygon points="98,206 178,240 178,256 98,222" />
          </g>
          <g stroke="#d9e7ed" strokeWidth="1.2" opacity="0.75">
            <path d="M86 7 L190 49 L284 6 M190 49 L190 268 M86 7 L86 225 L190 268 L284 225 L284 6" fill="none" />
            <path d="M98 180 L178 214 M198 215 L272 183" />
          </g>
          <polygon points="212,-8 218,-8 218,55 212,55" fill="#9badb9" />
          <path d="M244 7 L244 66 L262 59" stroke="#9badb9" strokeWidth="2" fill="none" />
        </g>
      )}

      {mode === 1 && (
        <g transform="translate(168 176)">
          <polygon points="0,56 80,24 164,59 84,94" fill="#b8cad6" />
          <polygon points="0,56 84,94 84,152 0,112" fill="#506b81" />
          <polygon points="84,94 164,59 164,117 84,152" fill="#7e96a9" />
          <polygon points="12,58 84,89 84,118 12,88" fill={`url(#glass-${uid})`} opacity="0.9" />
          <polygon points="96,95 152,72 152,100 96,123" fill={`url(#glass-${uid})`} opacity="0.9" />
          <g stroke="#dce8ee" strokeWidth="1" opacity="0.72">
            <path d="M22 63 L84 89 M22 73 L84 99 M22 83 L84 109 M104 97 L148 79 M104 107 L148 89" />
          </g>

          <polygon points="46,2 156,48 156,112 46,66" fill="#4d687f" />
          <polygon points="156,48 242,10 242,74 156,112" fill="#7891a5" />
          <polygon points="46,2 132,-36 242,10 156,48" fill="#b3c5d2" />
          <g fill={`url(#glass-${uid})`}>
            <polygon points="59,17 146,53 146,69 59,33" />
            <polygon points="166,55 230,29 230,45 166,71" />
            <polygon points="59,46 146,82 146,98 59,62" />
            <polygon points="166,84 230,58 230,74 166,100" />
            <polygon points="59,75 146,111 146,122 59,86" />
          </g>
          <g stroke="#d9e6ed" strokeWidth="1.2" fill="none" opacity="0.7">
            <path d="M46 2 L156 48 L242 10 M156 48 L156 112" />
            <path d="M46 2 L46 66 L156 112 L242 74 L242 10" />
          </g>
          <polygon points="264,39 269,39 269,101 264,101" fill="#9eafbb" />
          <path d="M292 20 L292 108 L318 98" stroke="#9eafbb" strokeWidth="2" fill="none" />
          <path d="M282 30 L282 116 L306 106" stroke="#9eafbb" strokeWidth="1.5" fill="none" opacity="0.8" />
        </g>
      )}

      {mode === 2 && (
        <g transform="translate(246 78)">
          <polygon points="0,158 54,181 54,256 0,231" fill="#4a657c" />
          <polygon points="54,181 158,140 158,216 54,256" fill="#7891a4" />
          <polygon points="0,158 104,117 158,140 54,181" fill="#aec2cf" />
          <g fill={`url(#glass-${uid})`}>
            <polygon points="12,165 44,179 44,196 12,182" />
            <polygon points="66,183 146,151 146,168 66,200" />
            <polygon points="12,194 44,208 44,225 12,211" />
            <polygon points="66,212 146,180 146,197 66,229" />
          </g>

          <polygon points="62,31 158,70 158,243 62,204" fill={`url(#left-${uid})`} />
          <polygon points="158,70 218,44 218,216 158,243" fill={`url(#right-${uid})`} />
          <polygon points="62,31 122,4 218,44 158,70" fill={`url(#top-${uid})`} />
          <g fill={`url(#glass-${uid})`}>
            <polygon points="74,48 146,76 146,90 74,62" />
            <polygon points="169,75 207,59 207,73 169,89" />
            <polygon points="74,81 146,109 146,123 74,95" />
            <polygon points="169,108 207,92 207,106 169,122" />
            <polygon points="74,114 146,142 146,156 74,128" />
            <polygon points="169,141 207,125 207,139 169,155" />
            <polygon points="74,147 146,175 146,189 74,161" />
            <polygon points="169,174 207,158 207,172 169,188" />
          </g>
          <g stroke="#dce8ee" strokeWidth="1.2" fill="none" opacity="0.76">
            <path d="M62 31 L158 70 L218 44 M158 70 L158 243" />
            <path d="M62 31 L62 204 L158 243 L218 216 L218 44" />
          </g>
          <polygon points="238,45 243,45 243,131 238,131" fill="#9eafbb" />
        </g>
      )}

      <g fill="#7e9a86" opacity="0.82">
        <circle cx="96" cy="330" r="12" />
        <circle cx="112" cy="342" r="9" />
        <circle cx="530" cy="303" r="10" />
        <circle cx="548" cy="315" r="8" />
        <circle cx="505" cy="328" r="7" />
      </g>
      <g fill="#4d6a58" opacity="0.48">
        <rect x="94" y="338" width="3" height="14" rx="1.5" />
        <rect x="529" y="311" width="3" height="13" rx="1.5" />
      </g>
      <rect width="640" height="420" fill="none" stroke="#ffffff" strokeOpacity="0.3" />
    </svg>
  );
}

function DrawingPreview({ variant }: { variant: number }) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, '');
  const alternate = Math.abs(variant) % 2 === 1;

  return (
    <svg viewBox="0 0 640 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`desk-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9e2e8" />
          <stop offset="1" stopColor="#bccbd5" />
        </linearGradient>
        <filter id={`paper-${uid}`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="9" stdDeviation="10" floodColor="#29455a" floodOpacity="0.22" />
        </filter>
        <pattern id={`hatch-${uid}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#9cb7c9" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="640" height="420" fill={`url(#desk-${uid})`} />
      <g opacity="0.45" stroke="#ffffff" strokeWidth="1">
        <path d="M0 48 H640 M0 96 H640 M0 144 H640 M0 192 H640 M0 240 H640 M0 288 H640 M0 336 H640 M0 384 H640" />
        <path d="M64 0 V420 M128 0 V420 M192 0 V420 M256 0 V420 M320 0 V420 M384 0 V420 M448 0 V420 M512 0 V420 M576 0 V420" />
      </g>
      <g filter={`url(#paper-${uid})`}>
        <rect x="58" y="24" width="524" height="374" rx="1" fill="#fbfcfa" stroke="#dfe5e4" />
      </g>
      <g stroke="#d5dedf" strokeWidth="1">
        <path d="M356 36 V380 M66 312 H566" />
      </g>
      <g fill="none" stroke="#31536b" strokeWidth={alternate ? 2.1 : 1.8} strokeLinecap="square">
        <rect x="104" y="72" width="182" height="198" />
        <rect x={alternate ? 318 : 330} y="82" width={alternate ? 164 : 178} height="134" />
        <rect x="104" y="270" width="182" height="40" />
        <rect x="352" y="216" width="132" height="94" />
        <path d="M286 72 H330 V216" />
        <path d="M152 270 V232 H256 V270" />
        <path d="M286 128 H256 V176 H152" />
        <path d="M318 82 V60 H482 V82" />
        <path d="M442 216 V188 H484" />
      </g>
      <g fill="none" stroke="#6d91a8" strokeWidth="1.2">
        <path d="M114 82 H276 M114 260 H276" />
        <path d="M192 72 V270 M266 82 V216" />
        <path d="M124 104 H182 V156 H124Z" />
        <path d="M124 176 H182 V218 H124Z" />
        <path d="M198 104 H254 V144 H198Z" />
        <path d="M330 94 H494 M330 204 H494" />
        <path d="M368 94 V204 M424 94 V204" />
        <path d="M362 228 H474 M362 280 H474" />
      </g>
      <g fill={`url(#hatch-${uid})`} stroke="#31536b" strokeWidth="1.4">
        <rect x="114" y="82" width="18" height="178" />
        <rect x="266" y="82" width="10" height="134" />
        <rect x="340" y="216" width="12" height="94" />
      </g>
      <g fill="none" stroke="#31536b" strokeWidth="2.1">
        <circle cx="116" cy="76" r="5" />
        <circle cx="168" cy="76" r="5" />
        <circle cx="276" cy="76" r="5" />
        <circle cx="168" cy="216" r="5" />
        <circle cx="424" cy="88" r="5" />
        <circle cx="480" cy="88" r="5" />
      </g>
      <g fill="none" stroke="#8ba6b7" strokeWidth="0.9">
        <path d="M104 52 H286 M104 47 V58 M286 47 V58" />
        <path d="M315 82 V52 M305 52 H325" />
        <path d="M318 306 H514 M318 301 V312 M514 301 V312" />
      </g>
      <g fill="#5d7889" fontFamily="Inter, Arial, sans-serif" fontSize="8" letterSpacing="0.8">
        <text x="182" y="48" textAnchor="middle">18 400</text>
        <text x="422" y="300">7 200</text>
        <text x="128" y="116">TANK A</text>
        <text x="128" y="186">PUMP</text>
        <text x="134" y="197">ROOM</text>
        <text x="350" y="120">ACCESS</text>
        <text x="350" y="132">GALLERY</text>
        <text x="380" y="246">STAIR 02</text>
        <text x="360" y="336">SECTION A–A</text>
      </g>
      <g stroke="#8ba6b7" strokeWidth="1">
        <path d="M360 350 H438 M360 356 H438 M360 362 H438" />
      </g>
      <text x="554" y="382" textAnchor="end" fill="#31536b" fontFamily="Inter, Arial, sans-serif" fontSize="9" fontWeight="600">
        {alternate ? 'S-202' : 'S-201'}
      </text>
      <text x="554" y="394" textAnchor="end" fill="#8497a4" fontFamily="Inter, Arial, sans-serif" fontSize="6.5" letterSpacing="1">
        GENERAL ARRANGEMENT
      </text>
      <path d="M528 340 H554" stroke="#31536b" strokeWidth="1" />
      <path d="M528 340 L522 336 M528 340 L522 344" stroke="#31536b" strokeWidth="1" fill="none" />
      <text x="528" y="334" fill="#5d7889" fontFamily="Inter, Arial, sans-serif" fontSize="6.5">
        N
      </text>
    </svg>
  );
}

function ScanPreview({ variant }: { variant: number }) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, '');
  const points = useMemo(() => {
    let seed = Math.abs(variant) * 71 + 29;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    return Array.from({ length: 1050 }, (_, index) => {
      const band = Math.floor(random() * 3);
      const x = 86 + random() * 468;
      const y = 74 + random() * 260;
      const tower = band === 0 ? x > 180 && x < 410 : band === 1 ? x > 254 && x < 474 : x > 112 && x < 330;
      const reason = tower ? random() : 0;
      return {
        x: reason > 0.16 ? x : 60 + random() * 520,
        y: reason > 0.16 ? y : 246 + random() * 132,
        r: 0.55 + random() * 1.35,
        hot: random() > 0.963,
        alpha: 0.34 + random() * 0.56,
        index
      };
    });
  }, [variant]);

  return (
    <svg viewBox="0 0 640 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={`space-${uid}`} cx="0.48" cy="0.42" r="0.72">
          <stop offset="0" stopColor="#1a3d4b" />
          <stop offset="0.55" stopColor="#102630" />
          <stop offset="1" stopColor="#07131a" />
        </radialGradient>
        <radialGradient id={`glow-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#6bd4cb" stopOpacity="0.24" />
          <stop offset="1" stopColor="#6bd4cb" stopOpacity="0" />
        </radialGradient>
        <filter id={`soft-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <rect width="640" height="420" fill={`url(#space-${uid})`} />
      <circle cx="322" cy="212" r="230" fill={`url(#glow-${uid})`} />
      <g stroke="#3d7f87" strokeWidth="0.7" opacity="0.32">
        <path d="M0 332 L640 298" />
        <path d="M0 360 L640 326" />
        <path d="M0 390 L640 356" />
        <path d="M94 420 L158 286" />
        <path d="M230 420 L294 286" />
        <path d="M366 420 L430 286" />
        <path d="M502 420 L566 286" />
      </g>
      <g filter={`url(#soft-${uid})`} opacity="0.25">
        <polygon points="212,276 322,230 446,276 336,326" fill="#5fc5c2" />
      </g>
      <g>
        {points.map(point => (
          <circle
            key={point.index}
            cx={point.x}
            cy={point.y}
            r={point.hot ? point.r + 0.8 : point.r}
            fill={point.hot ? '#ffc46b' : point.index % 11 === 0 ? '#b1fff4' : '#70cfc5'}
            opacity={point.alpha}
          />
        ))}
      </g>
      <g fill="none" stroke="#7ce3d6" strokeWidth="1.2" opacity="0.65">
        <path d="M206 285 L318 235 L444 283 L332 335 Z" />
        <path d="M318 235 V326" />
      </g>
      <g fill="none" stroke="#ffcf82" strokeWidth="1.4">
        <circle cx="318" cy="232" r="7" />
        <path d="M318 219 V225 M318 239 V245 M305 232 H311 M325 232 H331" />
      </g>
      <g fill="#a7ede5" fontFamily="Inter, Arial, sans-serif" fontSize="7" letterSpacing="1.2" opacity="0.8">
        <text x="28" y="34">POINT CLOUD / REGISTERED</text>
        <text x="584" y="388" textAnchor="end">
          {Math.abs(variant) % 2 === 0 ? 'E57  ·  42.6 M PTS' : 'LAS  ·  38.1 M PTS'}
        </text>
      </g>
      <rect width="640" height="420" fill="none" stroke="#7ce3d6" strokeOpacity="0.16" />
    </svg>
  );
}

function AssetPreview({ asset }: { asset: ScanAsset }) {
  if (asset.thumbnail) {
    return <img className="apc-scan-card__shot" src={asset.thumbnail} alt={`${asset.name} preview`} />;
  }
  if (asset.type === 'bim') return <BimPreview variant={asset.preview} />;
  if (asset.type === 'drawing') return <DrawingPreview variant={asset.preview} />;
  return <ScanPreview variant={asset.preview} />;
}

function TypeChip({ type }: { type: ScanAssetType }) {
  return (
    <span className={`apc-scan__type apc-scan__type--${type}`}>
      <i />
      {SCAN_TYPES[type].short}
    </span>
  );
}

function AssetMenu({
  asset,
  open,
  onToggle,
  onRemove
}: {
  asset: ScanAsset;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="apc-scan__menuwrap">
      <button
        className={`apc-scan__more${open ? ' on' : ''}`}
        onClick={event => {
          event.stopPropagation();
          onToggle();
        }}
        aria-label={`Actions for ${asset.name}`}
      >
        <span />
        <span />
        <span />
      </button>
      {open && (
        <div className="apc-scan__menu" onClick={event => event.stopPropagation()}>
          <div className="apc-scan__menuhead">
            <b>{SCAN_TYPES[asset.type].label}</b>
            <span>{sizeLabel(asset.size)}</span>
          </div>
          <button onClick={onRemove}>
            <Icon name="trash-2" size={13} />
            Remove from project
          </button>
        </div>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  menuOpen,
  onToggleMenu,
  onRemove,
  onFavorite,
  onOpen
}: {
  asset: ScanAsset;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onRemove: () => void;
  onFavorite: () => void;
  onOpen: () => void;
}) {
  const openable = isBim(asset);
  return (
    <article
      className={`apc-scan-card apc-scan-card--${asset.type}${openable ? '' : ' is-reference'}`}
      onClick={openable ? onOpen : undefined}
      onKeyDown={
        openable
          ? event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      role={openable ? 'button' : undefined}
      tabIndex={openable ? 0 : undefined}
    >
      <div className="apc-scan-card__preview">
        <AssetPreview asset={asset} />
        <TypeChip type={asset.type} />
        {openable && (
          <span className={`apc-scan__stage is-${asset.stage}`}>
            <i />
            {asset.stage === 'processing' ? 'Processing' : asset.stage === 'review' ? 'In review' : 'Cleanse'}
          </span>
        )}
        <button
          className={`apc-scan-card__favorite${asset.favorite ? ' on' : ''}`}
          onClick={event => {
            event.stopPropagation();
            onFavorite();
          }}
          aria-label={asset.favorite ? 'Remove from favourites' : 'Add to favourites'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={asset.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
        </button>
      </div>

      <div className={`apc-scan-card__foot${isBim(asset) ? '' : ' is-simple'}`}>
        <div className="apc-scan-card__titlerow">
          <h3 title={asset.name}>{asset.name}</h3>
          <AssetMenu
            asset={asset}
            open={menuOpen}
            onToggle={onToggleMenu}
            onRemove={onRemove}
          />
        </div>

        {!isBim(asset) && (
          <div className="apc-scan-card__simplemeta">
            <span title={asset.projectName}>{asset.projectName}</span>
            <b>{sizeLabel(asset.size)}</b>
          </div>
        )}

        {isBim(asset) && (
          <>
            <div className="apc-scan-card__project" title={asset.projectName}>
              {asset.projectName}
            </div>
            <div className="apc-scan-card__meta">
              <div>
                <span>Project no.</span>
                <b title={asset.projectNumber}>{asset.projectNumber}</b>
              </div>
              <div>
                <span>Client</span>
                <b title={asset.clientName}>{asset.clientName}</b>
              </div>
            </div>
            <div className="apc-scan-card__person">
              <span>Uploaded by</span>
              <div className="apc-scan-card__personrow">
                <i>{asset.avatar ? <img src={asset.avatar} alt="" /> : initials(asset.uploader)}</i>
                <div>
                  <b>{asset.uploader}</b>
                  <span>{asset.position}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function ResultTable({
  assets,
  menuId,
  onToggleMenu,
  onRemove,
  onFavorite,
  onOpen
}: {
  assets: ScanAsset[];
  menuId: string | null;
  onToggleMenu: (id: string) => void;
  onRemove: (id: string) => void;
  onFavorite: (id: string) => void;
  onOpen: (asset: ScanAsset) => void;
}) {
  return (
    <div className="apc-scan__listwrap">
      <table className="apc-scan-list">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Type</th>
            <th>Project</th>
            <th>Project no.</th>
            <th>Client</th>
            <th>Uploaded by</th>
            <th>Position</th>
            <th>Added</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {assets.map(asset => (
            <tr key={asset.id} onClick={() => onOpen(asset)} className="is-openable">
              <td>
                <div className="apc-scan__listname">
                  <span className={`apc-scan__listicon apc-scan__listicon--${asset.type}`}>
                    <Icon name={SCAN_TYPES[asset.type].icon} size={14} />
                  </span>
                  <b title={asset.name}>{asset.name}</b>
                </div>
              </td>
              <td>
                <TypeChip type={asset.type} />
              </td>
              <td title={isBim(asset) ? asset.projectName : undefined}>
                {isBim(asset) ? asset.projectName : '—'}
              </td>
              <td className="mono" title={isBim(asset) ? asset.projectNumber : undefined}>
                {isBim(asset) ? asset.projectNumber : '—'}
              </td>
              <td title={isBim(asset) ? asset.clientName : undefined}>
                {isBim(asset) ? asset.clientName : '—'}
              </td>
              <td>{isBim(asset) ? asset.uploader : '—'}</td>
              <td>{isBim(asset) ? asset.position : '—'}</td>
              <td className="apc-scan__listdate">{dateLabel(asset.addedAt)}</td>
              <td className="apc-scan__listactions">
                <button
                  className={`apc-scan__listheart${asset.favorite ? ' on' : ''}`}
                  onClick={event => {
                    event.stopPropagation();
                    onFavorite(asset.id);
                  }}
                  aria-label={asset.favorite ? 'Remove from favourites' : 'Add to favourites'}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill={asset.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
                  </svg>
                </button>
                <AssetMenu
                  asset={asset}
                  open={menuId === asset.id}
                  onToggle={() => onToggleMenu(asset.id)}
                  onRemove={() => onRemove(asset.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ImportStep = 'ifc' | 'drawings' | 'programme' | 'pointcloud';

interface ProgrammeFile {
  name: string;
  size: number;
}

interface ScanRun {
  id: string;
  primary: ScanAsset;
  references: ScanAsset[];
  createdAt: number;
  model?: IfcModel;
  programme?: ProgrammeFile;
  pointCloud?: ProgrammeFile;
}

interface ProjectCoords {
  easting: number;
  northing: number;
  level: number;
  rotation: number;
}

interface ProjectInfo {
  name: string;
  number: string;
  client: string;
  standard: string;
}

interface ReferenceFile {
  name: string;
  size: number;
  addedAt: number;
}

const BIM_COORDS: ProjectCoords = {
  easting: 836542.318,
  northing: 819264.905,
  level: 4.5,
  rotation: 0
};
const COORD_TOLERANCE = 0.05;
const fCoord = (value: number) =>
  value.toLocaleString('en-HK', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fDelta = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(3)}`;
const formatFileSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const toScanAsset = (file: DraftAsset): ScanAsset => ({
  id: file.id,
  type: file.type,
  name: file.name,
  size: file.size,
  projectName: file.projectName,
  projectNumber: file.projectNumber,
  clientName: file.clientName,
  uploader: file.uploader,
  position: file.position,
  avatar: file.avatar,
  addedAt: file.addedAt,
  favorite: file.favorite,
  preview: file.preview,
  stage: file.stage,
  thumbnail: file.thumbnail,
  modelId: file.modelId
});

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};


function ProgrammeUploadCard({
  programme,
  onChange
}: {
  programme: ProgrammeFile | null;
  onChange: (file: ProgrammeFile | null) => void;
}) {
  const pick = (file: File | null) => {
    if (file) onChange({ name: file.name, size: file.size });
  };
  return (
    <label
      className={`apc-importcard${programme ? ' is-filled is-ready' : ''}`}
      onDragOver={event => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        pick(event.dataTransfer.files?.[0] ?? null);
      }}
    >
      <input
        type="file"
        accept=".xer,.xml,.xlsx,.xls,.pdf"
        onChange={event => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          pick(file);
        }}
      />
      {programme ? (
        <div className="apc-importcard__loaded">
          <span className="apc-importcard__kind">MP</span>
          <button
            className="apc-importcard__remove"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              onChange(null);
            }}
            aria-label="Remove master programme"
          >
            <Icon name="trash-2" size={14} />
          </button>
          <span className="apc-importcard__fileicon">
            <Icon name="file-text" size={22} />
          </span>
          <b className="apc-importcard__filename" title={programme.name}>
            {programme.name}
          </b>
          <span className="apc-importcard__filesize">
            Master programme · {formatFileSize(programme.size)}
          </span>
          <span className="apc-importcard__status ready">
            <Icon name="check" size={11} />
            Uploaded
          </span>
        </div>
      ) : (
        <>
          <img className="apc-importcard__art" src="/import/programme.svg" alt="" />
          <b>Master programme</b>
          <span className="apc-importcard__copy">
            Drag and drop your file here, or <strong>click to select</strong>.
          </span>
          <small>Supported formats: P6 XER/XML, Excel or PDF</small>
        </>
      )}
    </label>
  );
}

function PointCloudUploadCard({
  pointCloud,
  onChange
}: {
  pointCloud: ProgrammeFile | null;
  onChange: (file: ProgrammeFile | null) => void;
}) {
  const pick = (file: File | null) => {
    if (file) onChange({ name: file.name, size: file.size });
  };
  return (
    <label
      className={`apc-importcard${pointCloud ? ' is-filled is-ready' : ''}`}
      onDragOver={event => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        pick(event.dataTransfer.files?.[0] ?? null);
      }}
    >
      <input
        type="file"
        accept=".ply,.e57,.las,.laz,.xyz,.pts,.rcp"
        onChange={event => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          pick(file);
        }}
      />
      {pointCloud ? (
        <div className="apc-importcard__loaded">
          <span className="apc-importcard__kind">PC</span>
          <button
            className="apc-importcard__remove"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              onChange(null);
            }}
            aria-label="Remove point cloud"
          >
            <Icon name="trash-2" size={14} />
          </button>
          <span className="apc-importcard__fileicon">
            <Icon name="box" size={22} />
          </span>
          <b className="apc-importcard__filename" title={pointCloud.name}>
            {pointCloud.name}
          </b>
          <span className="apc-importcard__filesize">
            Point cloud · {formatFileSize(pointCloud.size)}
          </span>
          <span className="apc-importcard__status ready">
            <Icon name="check" size={11} />
            Uploaded
          </span>
        </div>
      ) : (
        <>
          <img className="apc-importcard__art" src="/import/scan-cloud.svg" alt="" />
          <b>Point cloud</b>
          <span className="apc-importcard__copy">
            Drag and drop your file here, or <strong>click to select</strong>.
          </span>
          <small>Supported formats: PLY, E57, LAS/LAZ, XYZ, PTS or RCP</small>
        </>
      )}
    </label>
  );
}

function UploadTypeCard({
  type,
  draft,
  onAddFiles,
  onRemoveFile
}: {
  type: ScanAssetType;
  draft: DraftAsset[];
  onAddFiles: (type: ScanAssetType, event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (id: string) => void;
}) {
  const meta = SCAN_TYPES[type];
  const files = draft.filter(file => file.type === type);
  const file = files[0];
  const multiple = files.length > 1;
  const allReady = files.length > 0 && files.every(item => item.status === 'ready');

  return (
    <label
      className={`apc-importcard${files.length ? ' is-filled' : ''}${allReady ? ' is-ready' : ''}${multiple ? ' is-multi' : ''}`}
      onDragOver={event => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        const transfer = event.dataTransfer;
        if (!transfer.files.length) return;
        const fake = { target: { files: transfer.files, value: '' } } as ChangeEvent<HTMLInputElement>;
        onAddFiles(type, fake);
      }}
    >
      <input type="file" multiple accept={meta.accept} onChange={event => onAddFiles(type, event)} />
      {files.length === 0 ? (
        <>
          <img className="apc-importcard__art" src={meta.art} alt="" />
          <b>{meta.label}</b>
          <span className="apc-importcard__copy">
            Drag and drop your file here, or <strong>click to select</strong>.
          </span>
          <small>Supported formats: {meta.hint}</small>
        </>
      ) : multiple ? (
        <div className="apc-importcard__multi">
          <span className="apc-importcard__kind">{meta.short}</span>
          <span className="apc-importcard__count">{files.length} files</span>
          <div className="apc-importcard__multiscroll">
            <table className="apc-importcard__multitable">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {files.map(item => (
                  <tr key={item.id}>
                    <td>
                      <b title={item.name}>{item.name}</b>
                      <div className="apc-importcard__minibar">
                        <i style={{ width: `${item.progress}%` }} />
                      </div>
                    </td>
                    <td>{sizeLabel(item.size)}</td>
                    <td>
                      <span className={`apc-importcard__rowstatus${item.status === 'ready' ? ' ready' : ''}`}>
                        {item.status === 'ready' ? 'Uploaded' : `${item.progress}%`}
                      </span>
                    </td>
                    <td>
                      <button
                        className="apc-importcard__rowdel"
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          onRemoveFile(item.id);
                        }}
                        aria-label={`Remove ${item.name}`}
                      >
                        <Icon name="trash-2" size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="apc-importcard__add">+ Add file</span>
        </div>
      ) : (
        <div className="apc-importcard__loaded">
          <span className="apc-importcard__kind">{meta.short}</span>
          <button
            className="apc-importcard__remove"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              onRemoveFile(file.id);
            }}
            aria-label={`Remove ${file.name}`}
          >
            <Icon name="trash-2" size={14} />
          </button>
          <span className="apc-importcard__fileicon">
            <Icon name={meta.icon} size={22} />
          </span>
          <b className="apc-importcard__filename" title={file.name}>
            {file.name}
          </b>
          <span className="apc-importcard__filesize">
            {meta.label} · {sizeLabel(file.size)}
          </span>
          <div className="apc-importcard__progress" aria-label={`${meta.label} upload ${file.progress}%`}>
            <i style={{ width: `${file.progress}%` }} />
          </div>
          <span className={`apc-importcard__status${file.status === 'ready' ? ' ready' : ''}`}>
            {file.status === 'ready' ? (
              <>
                <Icon name="check" size={11} />
                Uploaded
              </>
            ) : (
              `Uploading · ${file.progress}%`
            )}
          </span>
        </div>
      )}
    </label>
  );
}

function ScanImportWizard({
  type,
  step,
  projectName,
  projectNumber,
  draft,
  programme,
  pointCloud,
  onClose,
  onAddFiles,
  onRemoveFile,
  onProgramme,
  onPointCloud,
  onNext,
  onBack,
  onProcess,
  onConfirm
}: {
  type: ScanAssetType;
  step: ImportStep;
  projectName: string;
  projectNumber: string;
  draft: DraftAsset[];
  programme: ProgrammeFile | null;
  pointCloud: ProgrammeFile | null;
  onClose: () => void;
  onAddFiles: (type: ScanAssetType, event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (id: string) => void;
  onProgramme: (file: ProgrammeFile | null) => void;
  onPointCloud: (file: ProgrammeFile | null) => void;
  onNext: () => void;
  onBack: () => void;
  onProcess: () => void;
  onConfirm: () => void;
}) {
  const pointCloudOnly = type === 'scan';
  const bimFiles = draft.filter(file => file.type === 'bim');
  const drawingFiles = draft.filter(file => file.type === 'drawing');
  const activeFiles = pointCloudOnly ? draft.filter(file => file.type === 'scan') : step === 'ifc' ? bimFiles : drawingFiles;
  const uploading = activeFiles.some(file => file.status === 'uploading');
  const ready = activeFiles.filter(file => file.status === 'ready');
  const bimReady = bimFiles.length > 0 && bimFiles.every(file => file.status === 'ready');

  return (
    <div className="apc-docpage__scrim">
      <section
        className="apc-importpop"
        role="dialog"
        aria-label={pointCloudOnly ? 'Import point cloud' : 'Import IFC model'}
      >
        <div className="apc-importpop__head">
          <div>
            <b>
              {pointCloudOnly
                ? 'Import point cloud'
                : step === 'ifc'
                  ? 'Import IFC model'
                  : step === 'drawings'
                    ? 'Add drawings'
                    : step === 'programme'
                      ? 'Add master programme'
                      : 'Add point cloud'}
            </b>
            <span>
              {pointCloudOnly
                ? `Add a point cloud for ${projectName} (${projectNumber}).`
                : step === 'ifc'
                  ? `Step 1 of 4 · Add the IFC model for ${projectName} (${projectNumber}).`
                  : step === 'drawings'
                    ? 'Step 2 of 4 · Drawings are optional references that travel with this model.'
                    : step === 'programme'
                      ? 'Step 3 of 4 · Master programme is optional for progress checking.'
                      : 'Step 4 of 4 · Point cloud is optional for progress verification.'}
            </span>
          </div>
          <button className="apc-iconbtn" onClick={onClose} aria-label="Close import">
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="apc-importpop__scroll">
          {!pointCloudOnly && step === 'programme' ? (
            <div className="apc-importgrid is-one">
              <ProgrammeUploadCard programme={programme} onChange={onProgramme} />
            </div>
          ) : !pointCloudOnly && step === 'pointcloud' ? (
            <div className="apc-importgrid is-one">
              <PointCloudUploadCard pointCloud={pointCloud} onChange={onPointCloud} />
            </div>
          ) : (
            <div className="apc-importgrid is-one">
              <UploadTypeCard
                type={pointCloudOnly ? 'scan' : step === 'ifc' ? 'bim' : 'drawing'}
                draft={draft}
                onAddFiles={onAddFiles}
                onRemoveFile={onRemoveFile}
              />
            </div>
          )}
        </div>

        <div className="apc-importpop__foot">
          <span>
            {!pointCloudOnly && step === 'programme'
              ? programme
                ? 'Master programme attached.'
                : 'Master programme is optional.'
              : !pointCloudOnly && step === 'pointcloud'
                ? pointCloud
                  ? 'Point cloud attached.'
                  : 'Point cloud is optional.'
                : !activeFiles.length
                  ? pointCloudOnly
                    ? 'Select a point cloud to continue.'
                    : step === 'ifc'
                      ? 'Upload one IFC model to continue.'
                      : 'Drawings are optional.'
                  : uploading
                    ? 'Uploading…'
                    : `${ready.length} ${ready.length === 1 ? 'file' : 'files'} ready.`}
          </span>
          {!pointCloudOnly &&
            (step === 'drawings' || step === 'programme' || step === 'pointcloud') && (
              <button className="apc-scan-import__backlink" onClick={onBack}>
                Back
              </button>
            )}
          {pointCloudOnly ? (
            <button className="apc-docpage__import" disabled={!ready.length || uploading} onClick={onConfirm}>
              Add to Library
            </button>
          ) : step === 'ifc' ? (
            <button className="apc-docpage__import" disabled={!bimReady || uploading} onClick={onNext}>
              Next Step
            </button>
          ) : step === 'pointcloud' ? (
            <button className="apc-docpage__import" disabled={uploading} onClick={onProcess}>
              Start Processing
            </button>
          ) : (
            <button className="apc-docpage__import" disabled={uploading} onClick={onNext}>
              Next Step
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function ReferenceImportDialog({
  type,
  draft,
  onAddFiles,
  onRemoveFile,
  onClose,
  onConfirm
}: {
  type: ScanAssetType;
  draft: DraftAsset[];
  onAddFiles: (type: ScanAssetType, event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const meta = SCAN_TYPES[type];
  const files = draft.filter(file => file.type === type);
  const uploading = files.some(file => file.status === 'uploading');
  const ready = files.filter(file => file.status === 'ready');

  return (
    <div className="apc-docpage__scrim">
      <section className="apc-importpop apc-scan-refimport" role="dialog" aria-label={`Import ${meta.label}`}>
        <div className="apc-importpop__head">
          <div>
            <b>Import {meta.label}</b>
            <span>
              {type === 'drawing'
                ? 'Attach a drawing to this scanning result. Drawings are reference only.'
                : 'Attach a point cloud to overlay and check against the BIM model.'}
            </span>
          </div>
          <button className="apc-iconbtn" onClick={onClose} aria-label="Close import">
            <Icon name="x" size={15} />
          </button>
        </div>
        <div className="apc-importpop__scroll">
          <div className="apc-importgrid is-one">
            <UploadTypeCard type={type} draft={draft} onAddFiles={onAddFiles} onRemoveFile={onRemoveFile} />
          </div>
        </div>
        <div className="apc-importpop__foot">
          <span>
            {!files.length
              ? `Select ${type === 'drawing' ? 'a drawing' : 'a point cloud'} to continue.`
              : uploading
                ? 'Uploading…'
                : `${ready.length} ${ready.length === 1 ? 'file' : 'files'} ready.`}
          </span>
          <button className="apc-docpage__import" disabled={!ready.length || uploading} onClick={onConfirm}>
            Import
          </button>
        </div>
      </section>
    </div>
  );
}

function ScanProcessing({
  pct,
  referenceCount,
  modelName,
  steps,
  active = 0,
  title
}: {
  pct: number;
  referenceCount: number;
  modelName: string;
  steps?: string[];
  active?: number;
  title?: string;
}) {
  const stage = pct < 34 ? 0 : pct < 67 ? 1 : 2;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 100);
    return () => window.clearInterval(timer);
  }, []);
  const list =
    steps ??
    [
      'Reading IFC quantities',
      referenceCount
        ? `Registering ${referenceCount} reference ${referenceCount === 1 ? 'file' : 'files'}`
        : 'Checking optional references',
      'Comparing overall progress'
    ];
  const current = steps ? active : stage;

  return (
    <div className="apc-docpage__scrim apc-scan-processing__scrim">
      <section className="apc-scan-processing" role="status" aria-label="Processing AI scan">
        <div
          className="apc-scan-processing__ring"
          style={{ background: `conic-gradient(#151719 ${pct}%, #e8edf0 ${pct}% 100%)` }}
        >
          <span>{pct}%</span>
        </div>
        <b>{title ?? 'Analysing project progress'}</b>
        <span className="apc-scan-processing__model" title={modelName}>
          {modelName}
        </span>
        <span className="apc-scan-processing__time">
          Loading time {elapsed < 1000 ? `${Math.max(1, Math.round(elapsed))} ms` : `${(elapsed / 1000).toFixed(1)} s`}
        </span>
        <div className="apc-scan-processing__steps">
          {list.map((label, index) => (
            <div key={label} className={index <= current ? 'on' : ''}>
              <Icon name={index < current ? 'check' : index === current ? 'scan' : 'box'} size={13} />
              {label}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

type ElementIssue = 'Missing storey' | 'Missing material' | 'Invalid quantity' | 'Zone not mapped' | null;

interface ElementEdit {
  resolved: boolean;
  storey: string;
  material: string;
  quantity: string;
}

interface ElementReviewRow {
  el: ElementData;
  issue: ElementIssue;
  resolved: boolean;
  status: 'Compliant' | 'Needs rework';
  storey: string;
  material: string;
  quantity: string;
  suggestion: {
    storey: string;
    material: string;
    quantity: string;
    action: string;
  };
}

const elementIssue = (el: ElementData, real = false): ElementIssue => {
  if (!el.mat) return 'Missing material';
  if (real) {
    if (!el.level) return 'Missing storey';
    if (!(el.vol > 0)) return 'Invalid quantity';
    return null;
  }
  if (el.drawingDiff) return 'Invalid quantity';
  const variant = hashString(el.id) % 17;
  if (variant === 0) return 'Missing storey';
  if (variant === 1) return 'Zone not mapped';
  return null;
};

const suggestionFor = (el: ElementData, issue: ElementIssue) => ({
  storey: el.level || demoData.levels[0]?.name || 'L01',
  material: el.mat || 'C35/20_OPC',
  quantity: el.vol.toFixed(3),
  action:
    issue === 'Missing storey'
      ? 'Assign IFC storey'
      : issue === 'Missing material'
        ? 'Map material to CIC grade'
        : issue === 'Invalid quantity'
          ? 'Recalculate from IFC geometry'
          : issue === 'Zone not mapped'
            ? 'Assign zone / location'
            : ''
});

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

function BimReviewViewer({
  elements,
  selectedId,
  compliantIds,
  failingIds,
  cloudOffset,
  onPick,
  onApi,
  onSnapshot
}: {
  elements: ElementData[];
  selectedId: string | null;
  compliantIds: string[];
  failingIds: string[];
  cloudOffset: [number, number, number] | null;
  onPick: (id: string | null) => void;
  onApi: (api: ViewportApi | null) => void;
  onSnapshot: (dataUrl: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ViewportApi | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const snapshotRef = useRef(onSnapshot);
  snapshotRef.current = onSnapshot;

  useEffect(() => {
    if (!host.current) return;
    const api = mountViewport(host.current, {
      elements,
      levels: demoData.levels,
      onPick: id => pickRef.current(id)
    });
    apiRef.current = api;
    onApi(api);
    if (elements.length) api.focus(elements.map(element => element.id));
    else api.home();
    return () => {
      api.dispose();
      apiRef.current = null;
      onApi(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiRef.current?.paint({
      sel: selectedId,
      members: compliantIds,
      missing: failingIds,
      checked: [],
      flags: true
    });
  }, [selectedId, compliantIds, failingIds]);

  useEffect(() => {
    apiRef.current?.setPointCloud(cloudOffset);
  }, [cloudOffset]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const shot = apiRef.current?.snapshot(640, 420);
      if (shot) snapshotRef.current(shot);
    }, 520);
    return () => window.clearTimeout(timer);
  }, []);

  return <div className="apc-scan-review__canvas" ref={host} />;
}

function CleanseComplete({ count, onClose }: { count: number; onClose: () => void }) {
  return (
    <div className="apc-docpage__scrim apc-cleansepop__scrim">
      <section className="apc-cleansepop" role="dialog" aria-label="Cleanse BIM created">
        <button className="apc-cleansepop__close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={17} />
        </button>
        <div className="apc-cleansepop__mark">
          <Icon name="check" size={54} stroke={3.4} />
        </div>
        <h2>Cleanse BIM created</h2>
        <p>{count} elements cleansed and written to the Cleanse BIM model for QS review.</p>
        <button className="apc-cleansepop__cta" onClick={onClose}>
          Back to AI Scanning
          <Icon name="chevron-right" size={14} />
        </button>
      </section>
    </div>
  );
}

export function ScanReviewPage({
  run,
  apiOnline,
  onBack,
  onCapturePreview,
  onCleanse
}: {
  run: ScanRun;
  apiOnline: boolean;
  onBack: () => void;
  onCapturePreview: (assetId: string, dataUrl: string) => void;
  onCleanse: () => void;
}) {
  const model = run.model;
  const elements = model?.elements ?? demoData.elements;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [complianceOpen, setComplianceOpen] = useState(true);
  const [filterFails, setFilterFails] = useState(false);
  const [query, setQuery] = useState('');
  const [panelHeight, setPanelHeight] = useState(286);
  const [edits, setEdits] = useState<Record<string, ElementEdit>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ storey: '', material: '', quantity: '' });
  const [materialEditId, setMaterialEditId] = useState<string | null>(null);
  const [materialDraft, setMaterialDraft] = useState('');
  const materialCancel = useRef(false);
  const [cleansed, setCleansed] = useState(false);
  const [cleanseOpen, setCleanseOpen] = useState(false);
  const backRef = useRef(onBack);
  backRef.current = onBack;
  const [notice, setNotice] = useState('');
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({
    name: model?.meta.projectName || run.primary.projectName,
    number: model?.meta.projectNumber || run.primary.projectNumber,
    client: run.primary.clientName,
    standard: 'HKSMM4'
  });
  const [drawings, setDrawings] = useState<ReferenceFile[]>([]);
  const [cloud, setCloud] = useState<(ReferenceFile & { coords: ProjectCoords }) | null>(null);
  const [refImport, setRefImport] = useState<ScanAssetType | null>(null);
  const [refDraft, setRefDraft] = useState<DraftAsset[]>([]);
  const viewerApi = useRef<ViewportApi | null>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!cleanseOpen) return;
    const timer = window.setTimeout(() => backRef.current(), 2000);
    return () => window.clearTimeout(timer);
  }, [cleanseOpen]);

  useEffect(() => {
    if (!refImport) return;
    const timer = window.setInterval(() => {
      setRefDraft(prev => {
        let changed = false;
        const next = prev.map(file => {
          if (file.status !== 'uploading') return file;
          changed = true;
          const progress = Math.min(100, file.progress + 11);
          return {
            ...file,
            progress,
            status: progress >= 100 ? ('ready' as const) : ('uploading' as const)
          };
        });
        return changed ? next : prev;
      });
    }, 150);
    return () => window.clearInterval(timer);
  }, [refImport]);

  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(`scan-element-${selectedId}`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const rows = useMemo<ElementReviewRow[]>(
    () =>
      elements.map(el => {
        const issue = elementIssue(el, !!model);
        const edit = edits[el.id];
        const resolved = !!edit?.resolved;
        const suggestion = suggestionFor(el, issue);
        return {
          el,
          issue,
          resolved,
          status: issue && !resolved ? 'Needs rework' : 'Compliant',
          storey: edit?.storey ?? suggestion.storey,
          material: edit?.material ?? suggestion.material,
          quantity: edit?.quantity ?? suggestion.quantity,
          suggestion
        };
      }),
    [edits, elements, model]
  );

  const failingRows = rows.filter(row => row.status === 'Needs rework');
  const compliantRows = rows.filter(row => row.status === 'Compliant');
  const total = rows.length;
  const overall = total ? Math.round((compliantRows.length / total) * 100) : 100;
  const failPercent = 100 - overall;

  const requirement = (issues: Array<Exclude<ElementIssue, null>>) => {
    const failed = rows.filter(row => row.issue && !row.resolved && issues.includes(row.issue)).length;
    return Math.round(((total - failed) / total) * 100);
  };

  const stats = [
    { label: 'Storey / zone', pct: requirement(['Missing storey', 'Zone not mapped']) },
    { label: 'Material mapping', pct: requirement(['Missing material']) },
    { label: 'Quantity integrity', pct: requirement(['Invalid quantity']) }
  ];

  const projectFields: Array<{ key: keyof ProjectInfo; label: string; value: string }> = [
    { key: 'name', label: 'Project name', value: projectInfo.name },
    { key: 'number', label: 'Project number', value: projectInfo.number },
    { key: 'client', label: 'Client', value: projectInfo.client },
    { key: 'standard', label: 'Standard', value: projectInfo.standard }
  ];
  const projectComplete = !!(projectInfo.name.trim() && projectInfo.number.trim() && projectInfo.client.trim());

  const coordRows = [
    { label: 'Easting', unit: 'm', bim: BIM_COORDS.easting, cloud: cloud?.coords.easting },
    { label: 'Northing', unit: 'm', bim: BIM_COORDS.northing, cloud: cloud?.coords.northing },
    { label: 'Level', unit: 'm', bim: BIM_COORDS.level, cloud: cloud?.coords.level },
    { label: 'Rotation', unit: '°', bim: BIM_COORDS.rotation, cloud: cloud?.coords.rotation }
  ];
  const coordDrift = Math.max(
    0,
    ...coordRows.map(row => (row.cloud == null ? 0 : Math.abs(row.cloud - row.bim)))
  );
  const coordAligned = cloud ? coordDrift <= COORD_TOLERANCE : null;

  const cloudOffset = useMemo<[number, number, number] | null>(
    () =>
      cloud
        ? [
            cloud.coords.easting - BIM_COORDS.easting,
            cloud.coords.level - BIM_COORDS.level,
            -(cloud.coords.northing - BIM_COORDS.northing)
          ]
        : null,
    [cloud]
  );

  const shownRows = rows.filter(row => {
    if (filterFails && row.status !== 'Needs rework') return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [row.el.mark, row.el.name, row.el.cls, row.el.level, row.material, row.issue ?? '']
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });

  const startEdit = (row: ElementReviewRow) => {
    setSelectedId(row.el.id);
    setEditingId(row.el.id);
    setEditForm({ storey: row.storey, material: row.material, quantity: row.quantity });
  };

  const saveEdit = () => {
    if (!editingId) return;
    setEdits(prev => ({
      ...prev,
      [editingId]: { resolved: true, ...editForm }
    }));
    if (apiOnline && model) {
      void patchIfcElement(model.id, editingId, {
        level: editForm.storey,
        mat: editForm.material,
        quantity: editForm.quantity,
        status: 'Compliant'
      }).catch(() => undefined);
    }
    setEditingId(null);
    if (failingRows.length === 1) setFilterFails(false);
    setNotice('Attribute update saved. Element is now compliant.');
  };

  const startMaterialEdit = (row: ElementReviewRow) => {
    setSelectedId(row.el.id);
    setMaterialEditId(row.el.id);
    setMaterialDraft(row.material);
    materialCancel.current = false;
  };

  const commitMaterialEdit = (id: string) => {
    setMaterialEditId(null);
    if (materialCancel.current) {
      materialCancel.current = false;
      return;
    }
    const row = rows.find(item => item.el.id === id);
    if (!row) return;
    const material = materialDraft.trim();
    if (material === row.material) return;
    setEdits(prev => {
      const current = prev[id];
      return {
        ...prev,
        [id]: {
          resolved:
            row.issue === 'Missing material' ? !!material : (current?.resolved ?? row.resolved),
          storey: current?.storey ?? row.storey,
          material,
          quantity: current?.quantity ?? row.quantity
        }
      };
    });
    if (apiOnline && model) {
      void patchIfcElement(model.id, id, {
        mat: material,
        status: row.issue === 'Missing material' && material ? 'Compliant' : row.status
      }).catch(() => undefined);
    }
    if (row.issue === 'Missing material' && material && failingRows.length === 1) setFilterFails(false);
    setNotice(`${row.el.mark} material updated.`);
  };

  const autoFixAll = () => {
    if (!failingRows.length) {
      setNotice('No failing elements remain.');
      return;
    }
    setEdits(prev => {
      const next = { ...prev };
      failingRows.forEach(row => {
        next[row.el.id] = {
          resolved: true,
          storey: row.suggestion.storey,
          material: row.suggestion.material,
          quantity: row.suggestion.quantity
        };
      });
      return next;
    });
    if (apiOnline && model) {
      failingRows.forEach(row => {
        void patchIfcElement(model.id, row.el.id, {
          level: row.suggestion.storey,
          mat: row.suggestion.material,
          quantity: row.suggestion.quantity,
          status: 'Compliant'
        }).catch(() => undefined);
      });
    }
    setFilterFails(false);
    viewerApi.current?.showAll();
    setNotice(`${failingRows.length} elements auto-fixed. Cleansed model ready to generate.`);
  };

  const createCleanse = () => {
    if (failingRows.length) {
      setNotice(`Resolve ${failingRows.length} remaining ${failingRows.length === 1 ? 'element' : 'elements'} before creating the cleanse BIM.`);
      return;
    }
    setCleansed(true);
    viewerApi.current?.showAll();
    if (apiOnline && model) void cleanseIfcModel(model.id).catch(() => undefined);
    onCleanse();
    setCleanseOpen(true);
  };

  const exportUpdates = () => {
    const header = [
      'IfcGlobalId',
      'Mark',
      'Element',
      'IfcClass',
      'Storey / Zone',
      'Material',
      'Quantity',
      'Issue',
      'Required action',
      'Suggested storey',
      'Suggested material',
      'Suggested quantity',
      'Status'
    ];
    const lines = rows.map(row => [
      row.el.gid,
      row.el.mark,
      row.el.name,
      row.el.cls,
      `${row.storey} / ${row.el.zone ?? '—'}`,
      row.material,
      row.quantity,
      row.issue ?? '',
      row.issue ? row.suggestion.action : '',
      row.issue ? row.suggestion.storey : '',
      row.issue ? row.suggestion.material : '',
      row.issue ? row.suggestion.quantity : '',
      row.status
    ]);
    const csv = [header, ...lines].map(line => line.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cleanse-bim-attribute-updates.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    setNotice('Excel-compatible attribute update file exported.');
  };

  const isolateFailing = () => {
    if (!failingRows.length) {
      setNotice('All elements are compliant.');
      return;
    }
    viewerApi.current?.isolate(failingRows.map(row => row.el.id));
  };

  const openReferenceImport = (type: ScanAssetType) => {
    setRefImport(type);
    setRefDraft([]);
    setProjectOpen(false);
  };

  const addReferenceFiles = (type: ScanAssetType, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setRefDraft(prev => [
      ...prev,
      ...files.map((file, index) => ({
        id: `ref-${Date.now()}-${index}`,
        type,
        name: file.name,
        size: file.size,
        projectName: projectInfo.name,
        projectNumber: projectInfo.number,
        clientName: projectInfo.client,
        uploader: 'Dicky Lam',
        position: 'Quantity Surveyor',
        addedAt: Date.now(),
        favorite: false,
        preview: 0,
        stage: 'processing' as const,
        progress: 0,
        status: 'uploading' as const
      }))
    ]);
  };

  const confirmReferenceImport = () => {
    if (!refImport) return;
    const ready = refDraft.filter(file => file.status === 'ready');
    if (!ready.length) return;
    if (refImport === 'drawing') {
      setDrawings(prev => [
        ...prev,
        ...ready.map(file => ({ name: file.name, size: file.size, addedAt: file.addedAt }))
      ]);
      setNotice(
        `${ready.length} drawing ${ready.length === 1 ? 'file' : 'files'} attached to this result.`
      );
    } else {
      const file = ready[ready.length - 1];
      const seed = hashString(file.name);
      const coords: ProjectCoords = {
        easting: BIM_COORDS.easting + ((seed % 45) - 20) / 1000,
        northing: BIM_COORDS.northing + ((seed % 37) - 20) / 1000,
        level: BIM_COORDS.level + ((seed % 29) - 14) / 1000,
        rotation: 0
      };
      setCloud({ name: file.name, size: file.size, addedAt: file.addedAt, coords });
      setNotice('Point cloud registered and overlaid on the BIM model.');
    }
    setRefImport(null);
    setRefDraft([]);
  };

  const updateProjectInfo = (key: keyof ProjectInfo, value: string) => {
    setProjectInfo(prev => ({ ...prev, [key]: value }));
  };

  const pickElement = (id: string | null) => {
    setSelectedId(id);
    if (id) viewerApi.current?.focus([id]);
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, h: panelHeight };
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const max = Math.max(220, Math.min(560, window.innerHeight - 190));
    setPanelHeight(Math.max(150, Math.min(max, drag.current.h - (event.clientY - drag.current.y))));
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <main className="apc-scan-review">
      <header className="apc-scan-review__head">
        <button className="apc-scan-review__back" onClick={onBack} aria-label="Back to AI Scanning">
          <Icon name="arrow-left" size={16} />
        </button>
        <div className="apc-scan-review__title">
          <h1>Scanning result</h1>
          <span>
            {run.primary.name} · {run.primary.projectName} · {total} BIM elements
          </span>
        </div>
        <span
          className={`apc-scan-review__state${cleansed ? ' is-cleansed' : failingRows.length ? ' is-review' : ' is-ready'}`}
        >
          {cleansed ? 'Cleanse ready' : failingRows.length ? `${failingRows.length} need rework` : 'Ready to cleanse'}
        </span>
        <button
          className="apc-scan-review__cleanse"
          onClick={createCleanse}
          disabled={!!failingRows.length || cleansed}
        >
          <Icon name={cleansed ? 'check' : 'save'} size={13} />
          {cleansed ? 'Cleanse created' : 'Create Cleanse BIM'}
        </button>
      </header>

      <div className="apc-scan-review__workspace">
        <div className="apc-scan-review__stage">
          <BimReviewViewer
            elements={elements}
            selectedId={selectedId}
            compliantIds={compliantRows.map(row => row.el.id)}
            failingIds={failingRows.map(row => row.el.id)}
            cloudOffset={cloudOffset}
            onPick={id => setSelectedId(id)}
            onApi={api => {
              viewerApi.current = api;
            }}
            onSnapshot={shot => onCapturePreview(run.primary.id, shot)}
          />

          <div className="apc-scan-review__bar">
            <span className="apc-toolgroup">
              <Hint delay={0} label="AI readiness">
                <button
                  className={`apc-tool${complianceOpen ? ' on' : ''}`}
                  onClick={() => setComplianceOpen(open => !open)}
                  aria-label="AI readiness"
                >
                  <Icon name="badge-check" size={15} />
                </button>
              </Hint>
              <i className="apc-toolsep" aria-hidden="true" />
              <Hint delay={0} label="Isolate failing elements">
                <button
                  className="apc-tool"
                  onClick={isolateFailing}
                  disabled={!failingRows.length}
                  aria-label="Isolate fails"
                >
                  <Icon name="circle-alert" size={15} />
                </button>
              </Hint>
              <Hint delay={0} label="Show all">
                <button className="apc-tool" onClick={() => viewerApi.current?.showAll()} aria-label="Show all">
                  <Icon name="eye" size={15} />
                </button>
              </Hint>
              <i className="apc-toolsep" aria-hidden="true" />
              <Hint delay={0} label="Auto-fix all">
                <button
                  className="apc-tool"
                  onClick={autoFixAll}
                  disabled={!failingRows.length}
                  aria-label="Auto-fix all"
                >
                  <Icon name="zap" size={15} />
                </button>
              </Hint>
              <Hint delay={0} label="Export Excel">
                <button className="apc-tool" onClick={exportUpdates} aria-label="Export Excel">
                  <Icon name="download" size={15} />
                </button>
              </Hint>
              <i className="apc-toolsep" aria-hidden="true" />
              <Hint delay={0} label="Import drawing">
                <button
                  className={`apc-tool${drawings.length ? ' on' : ''}`}
                  onClick={() => openReferenceImport('drawing')}
                  aria-label="Import drawing"
                >
                  <Icon name="drafting-compass" size={15} />
                </button>
              </Hint>
              <Hint delay={0} label="Import point cloud">
                <button
                  className={`apc-tool${cloud ? ' on' : ''}`}
                  onClick={() => openReferenceImport('scan')}
                  aria-label="Import point cloud"
                >
                  <Icon name="scan" size={15} />
                </button>
              </Hint>
              <i className="apc-toolsep" aria-hidden="true" />
              <Hint delay={0} label="Project information">
                <button
                  className={`apc-tool${projectOpen ? ' on' : ''}`}
                  onClick={() => setProjectOpen(open => !open)}
                  aria-label="Project information"
                >
                  <Icon name="building-2" size={15} />
                </button>
              </Hint>
            </span>
          </div>

          {complianceOpen && (
            <section className="apc-floatpop apc-scan-readiness" aria-label="AI readiness">
              <div className="apc-floatpop__head">
                <Icon name="badge-check" size={13} />
                <b>AI readiness</b>
                <span style={{ flex: 1 }} />
                <button className="apc-iconbtn" onClick={() => setComplianceOpen(false)} aria-label="Close AI readiness">
                  <Icon name="x" size={13} />
                </button>
              </div>
              <div className="apc-scan-readiness__body">
                <div className="apc-scan-readiness__hero">
                  <div
                    className="apc-scan-readiness__ring"
                    style={{ background: `conic-gradient(#2f9e5f ${overall}%, #f0c9c2 ${overall}% 100%)` }}
                  >
                    <div>
                      <b>{overall}%</b>
                      <span>compliant</span>
                    </div>
                  </div>
                  <div className="apc-scan-readiness__legend">
                    <div>
                      <i className="is-pass" />
                      <span>Fulfil requirement</span>
                      <b>{compliantRows.length}</b>
                    </div>
                    <div>
                      <i className="is-fail" />
                      <span>Need rework</span>
                      <b>{failingRows.length}</b>
                    </div>
                    <div>
                      <i className="is-failpct" />
                      <span>Non-compliant</span>
                      <b>{failPercent}%</b>
                    </div>
                  </div>
                </div>

                <div className="apc-scan-readiness__reqs">
                  <span>Requirement coverage</span>
                  {stats.map(item => (
                    <div key={item.label}>
                      <label>
                        <span>{item.label}</span>
                        <b>{item.pct}%</b>
                      </label>
                      <div className="apc-scan-readiness__bar">
                        <i style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="apc-scan-readiness__refs">
                  <span>Optional references</span>
                  <b>{run.references.length ? `${run.references.length} attached` : 'None'}</b>
                </div>

                <button
                  className="apc-scan-readiness__review"
                  disabled={!failingRows.length}
                  onClick={() => {
                    setFilterFails(true);
                    setComplianceOpen(false);
                  }}
                >
                  Review failing elements
                  <Icon name="arrow-left-right" size={12} />
                </button>
              </div>
            </section>
          )}

          {projectOpen && (
            <section className="apc-floatpop apc-scan-project" aria-label="Project information">
              <div className="apc-floatpop__head">
                <Icon name="building-2" size={13} />
                <b>Project information</b>
                <span className={`apc-scan-project__badge is-${projectComplete ? 'ok' : 'warn'}`}>
                  {projectComplete ? 'Complete' : 'Incomplete'}
                </span>
                <button
                  className="apc-iconbtn"
                  onClick={() => setProjectOpen(false)}
                  aria-label="Close project information"
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
              <div className="apc-floatpop__body apc-scan-project__body">
                <div className="apc-scan-project__form">
                  {projectFields.map(field => (
                    <label key={field.key}>
                      <span>
                        {field.label}
                        <i className={field.value.trim() ? 'is-ok' : 'is-miss'} />
                      </span>
                      {field.key === 'standard' ? (
                        <select
                          value={projectInfo.standard}
                          onChange={event => updateProjectInfo('standard', event.target.value)}
                        >
                          <option value="HKSMM4">HKSMM4</option>
                          <option value="CESMM">CESMM</option>
                        </select>
                      ) : (
                        <input
                          value={field.value}
                          onChange={event => updateProjectInfo(field.key, event.target.value)}
                        />
                      )}
                    </label>
                  ))}
                </div>

                <div className="apc-scan-project__coords">
                  <div className="apc-scan-project__coordhead">
                    <span>Project coordination</span>
                    <b>HK1980 grid</b>
                  </div>
                  <table className="apc-scan-project__table">
                    <thead>
                      <tr>
                        <th />
                        <th>BIM model</th>
                        {cloud && <th>Point cloud</th>}
                        {cloud && <th>Δ</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {coordRows.map(row => (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td className="num">
                            {fCoord(row.bim)}
                            {row.unit}
                          </td>
                          {cloud && row.cloud != null && (
                            <>
                              <td className="num">
                                {fCoord(row.cloud)}
                                {row.unit}
                              </td>
                              <td className="num">{fDelta(row.cloud - row.bim)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {cloud ? (
                    <div className={`apc-scan-project__check is-${coordAligned ? 'ok' : 'warn'}`}>
                      <Icon name={coordAligned ? 'check' : 'circle-alert'} size={12} />
                      {coordAligned
                        ? 'Aligned within ±0.050 m on the HK1980 grid.'
                        : 'Offset exceeds ±0.050 m. Re-register the point cloud before cleansing.'}
                    </div>
                  ) : (
                    <div className="apc-scan-project__check is-muted">
                      <Icon name="scan" size={12} />
                      Import a point cloud to compare its coordinates with the BIM model.
                    </div>
                  )}
                </div>

                {model && (
                  <div className="apc-scan-project__ifc">
                    <div className="apc-scan-project__coordhead">
                      <span>IFC extraction</span>
                      <b>{model.meta.schema}</b>
                    </div>
                    <div className="apc-scan-project__kv">
                      <div>
                        <span>Building</span>
                        <b>{model.meta.buildingName || '—'}</b>
                      </div>
                      <div>
                        <span>Storeys</span>
                        <b>{model.meta.storeys.length}</b>
                      </div>
                      <div>
                        <span>Elements</span>
                        <b>
                          {model.meta.elementCount} / {model.meta.totalProducts}
                        </b>
                      </div>
                      <div>
                        <span>Properties</span>
                        <b>{model.meta.propertyCount}</b>
                      </div>
                      <div>
                        <span>Units</span>
                        <b>{model.meta.units}</b>
                      </div>
                      <div>
                        <span>Engine</span>
                        <b>{model.meta.engine}</b>
                      </div>
                      <div>
                        <span>Parse time</span>
                        <b>{(model.meta.parseMs / 1000).toFixed(2)} s</b>
                      </div>
                      <div>
                        <span>File size</span>
                        <b>{sizeLabel(model.meta.fileSize)}</b>
                      </div>
                      <div>
                        <span>Classes</span>
                        <b>{model.meta.classes.length}</b>
                      </div>
                    </div>
                    <div className="apc-scan-project__classes">
                      {model.meta.classes.slice(0, 5).map(item => (
                        <span key={item.name}>
                          {item.name.replace('Ifc', '')} <b>{item.count}</b>
                        </span>
                      ))}
                    </div>
                    <div className="apc-scan-project__origin">
                      Normalised from IFC origin {fCoord(model.meta.origin.x)}, {fCoord(model.meta.origin.y)},{' '}
                      {fCoord(model.meta.origin.z)} m
                    </div>
                  </div>
                )}

                {(drawings.length > 0 || cloud) && (
                  <div className="apc-scan-project__refs">
                    <span>Attached references</span>
                    {drawings.map(file => (
                      <div key={`${file.name}-${file.addedAt}`}>
                        <Icon name="drafting-compass" size={11} />
                        <b title={file.name}>{file.name}</b>
                        <span>{sizeLabel(file.size)}</span>
                      </div>
                    ))}
                    {cloud && (
                      <div>
                        <Icon name="scan" size={11} />
                        <b title={cloud.name}>{cloud.name}</b>
                        <span>{sizeLabel(cloud.size)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {notice && <div className="apc-scan-review__notice">{notice}</div>}
        </div>

        <section className="apc-bqpanel apc-scan-elements" style={{ height: panelHeight }}>
          <div
            className="apc-bqresize"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            aria-label="Resize BIM element panel"
          />
          <div className="apc-bqpanel__head apc-scan-elements__head">
            <b>BIM elements</b>
            <div className="apc-bqsearch apc-scan-elements__search">
              <Icon name="search" size={12} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search elements"
                aria-label="Search BIM elements"
              />
            </div>
            <button
              className={`apc-scan-elements__filter${filterFails ? ' on' : ''}`}
              disabled={!failingRows.length}
              onClick={() => setFilterFails(value => !value)}
            >
              <Icon name="circle-alert" size={12} />
              Needs rework
              <b>{failingRows.length}</b>
            </button>
          </div>

          <div className="apc-bqpanel__scroll">
            <div className="apc-tablefill apc-scan-elements__tablefill">
              <table className="apc-bqtable apc-scan-elements__table">
                <thead>
                <tr>
                  <th>Element</th>
                  <th>IFC class</th>
                  <th>Storey / zone</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map(row => (
                  <Fragment key={row.el.id}>
                    <tr
                      id={`scan-element-${row.el.id}`}
                      className={`apc-bqtable__item${selectedId === row.el.id ? ' on' : ''}`}
                      onClick={() => pickElement(row.el.id)}
                    >
                      <td>
                        <b>{row.el.mark}</b>
                      </td>
                      <td>{row.el.cls.replace('Ifc', '')}</td>
                      <td>
                        {row.storey} / {row.el.zone ?? '—'}
                      </td>
                      <td className="num">{row.quantity}</td>
                    </tr>
                    {selectedId === row.el.id && (
                      <tr className="apc-scan-elements__proprow">
                        <td colSpan={4}>
                          <div className="apc-scan-elements__props">
                            <span>IFC properties</span>
                            {Object.entries(row.el.pset)
                              .slice(0, 10)
                              .map(([key, value]) => (
                                <div key={key}>
                                  <b>{key}</b>
                                  <span>{value}</span>
                                </div>
                              ))}
                            {Object.keys(row.el.pset).length > 10 && (
                              <em>+{Object.keys(row.el.pset).length - 10} more in the database</em>
                            )}
                            {!Object.keys(row.el.pset).length && <em>No property set on this IFC entity.</em>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!shownRows.length && (
                  <tr>
                    <td colSpan={4} className="apc-scan-elements__empty">
                      No BIM elements match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {cleanseOpen && <CleanseComplete count={total} onClose={() => backRef.current()} />}

      {refImport && (
        <ReferenceImportDialog
          type={refImport}
          draft={refDraft}
          onAddFiles={addReferenceFiles}
          onRemoveFile={id => setRefDraft(prev => prev.filter(file => file.id !== id))}
          onClose={() => {
            setRefImport(null);
            setRefDraft([]);
          }}
          onConfirm={confirmReferenceImport}
        />
      )}
    </main>
  );
}

export function AiScanning({
  projectName,
  projectNumber,
  showProgramme,
  onCloseProgramme,
  onToggleProgramme,
  projectId
}: {
  projectName: string;
  projectNumber: string;
  showProgramme: boolean;
  onCloseProgramme: () => void;
  onToggleProgramme: () => void;
  projectId?: string;
}) {
  const [assets, setAssets] = useState<ScanAsset[]>(() =>
    loadScanAssets(projectId)
  );
  const [runs, setRuns] = useState<Record<string, ScanRun>>({});
  const [view, setView] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<ScanAssetType>('bim');
  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState<ScanAssetType>('bim');
  const [importStep, setImportStep] = useState<ImportStep>('ifc');
  const [programmeDraft, setProgrammeDraft] = useState<ProgrammeFile | null>(null);
  const [pointCloudDraft, setPointCloudDraft] = useState<ProgrammeFile | null>(null);
  const [draft, setDraft] = useState<DraftAsset[]>([]);
  const [processingOpen, setProcessingOpen] = useState(false);
  const [processingPct, setProcessingPct] = useState(0);
  const [processingPhase, setProcessingPhase] = useState<IfcPhase | null>(null);
  const filesRef = useRef<Record<string, File>>({});
  const [run, setRun] = useState<ScanRun | null>(null);
  const [page, setPage] = useState<'library' | 'result'>('library');
  const [apiOnline, setApiOnline] = useState(false);
  const [notice, setNotice] = useState('');
  const draftCount = useRef(0);
  const processingDone = useRef(false);
  const finishTimer = useRef<number>();

  useEffect(() => {
    saveScanAssets(assets, projectId);
  }, [assets]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let alive = true;
    probeScanApi().then(online => {
      if (!alive) return;
      setApiOnline(online);
      if (!online) return;
      listScanAssets()
        .then(list => {
          if (!alive) return;
          setAssets(prev =>
            list.map(asset => ({
              ...asset,
              thumbnail: asset.thumbnail ?? prev.find(item => item.id === asset.id)?.thumbnail
            }))
          );
        })
        .catch(() => undefined);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuId]);

  useEffect(() => {
    if (!importOpen) return;
    const timer = window.setInterval(() => {
      setDraft(prev => {
        let changed = false;
        const next = prev.map(file => {
          if (file.status !== 'uploading') return file;
          changed = true;
          const progress = Math.min(100, file.progress + 8);
          return {
            ...file,
            progress,
            status: progress >= 100 ? 'ready' as const : 'uploading' as const
          };
        });
        return changed ? next : prev;
      });
    }, 170);
    return () => window.clearInterval(timer);
  }, [importOpen]);

  useEffect(() => {
    if (!processingOpen) return;
    const files = draft.filter(file => file.status === 'ready').map(toScanAsset);
    const primary = files.find(asset => asset.type === 'bim');
    if (!primary) {
      setProcessingOpen(false);
      return;
    }
    processingDone.current = false;
    let cancelled = false;
    let localTimer: number | undefined;
    let pollTimer: number | undefined;

    const finish = (bimAssets: ScanAsset[], model?: IfcModel) => {
      if (cancelled || processingDone.current) return;
      processingDone.current = true;
      if (localTimer) window.clearInterval(localTimer);
      if (pollTimer) window.clearInterval(pollTimer);
      const drawingAssets = files.filter(asset => asset.type === 'drawing');
      const nextRun: ScanRun = {
        id: `run-${Date.now()}`,
        primary,
        references: drawingAssets,
        createdAt: Date.now(),
        model,
        programme: programmeDraft ?? undefined,
        pointCloud: pointCloudDraft ?? undefined
      };
      setAssets(prev => [...bimAssets, ...drawingAssets, ...prev]);
      setRuns(prev => ({ ...prev, [primary.id]: nextRun }));
      setRun(nextRun);
      setProcessingOpen(false);
      setProcessingPct(0);
      setProcessingPhase(null);
      setDraft([]);
      setProgrammeDraft(null);
      setPage('result');
      if (apiOnline) {
        [...bimAssets, ...drawingAssets].forEach(asset => {
          void saveScanAsset(asset).catch(() => undefined);
        });
      }
      if (model && apiOnline) {
        void upsertIfcModel({
          id: model.id,
          fileName: model.fileName,
          meta: model.meta,
          elements: model.elements
        }).catch(() => undefined);
      }
    };

    const finishLocal = () => {
      finishTimer.current = window.setTimeout(() => {
        finish(
          files
            .filter(asset => asset.type === 'bim')
            .map(asset => ({ ...asset, stage: 'review' as const }))
        );
      }, 420);
    };

    const startLocal = () => {
      const started = Date.now();
      localTimer = window.setInterval(() => {
        if (cancelled) return;
        const pct = Math.min(100, Math.round(((Date.now() - started) / 10_000) * 100));
        setProcessingPct(pct);
        if (pct >= 100) {
          window.clearInterval(localTimer);
          finishLocal();
        }
      }, 100);
    };

    const bimFile = filesRef.current[primary.id];
    if (bimFile) {
      readIfcFile(bimFile, phase => {
        if (cancelled) return;
        setProcessingPhase(phase);
        setProcessingPct(phase.pct);
      })
        .then(model => {
          if (cancelled) return;
          finish([{ ...primary, stage: 'review' as const, thumbnail: undefined, modelId: model.id }], model);
        })
        .catch(() => {
          if (!cancelled) startLocal();
        });
    } else if (apiOnline) {
      startScanImport(
        files.map(file => ({
          id: file.id,
          type: file.type,
          name: file.name,
          size: file.size,
          projectName: file.projectName,
          projectNumber: file.projectNumber,
          clientName: file.clientName,
          uploader: file.uploader,
          position: file.position,
          avatar: file.avatar,
          preview: file.preview
        }))
      )
        .then(job => {
          if (cancelled) return;
          let busy = false;
          pollTimer = window.setInterval(() => {
            if (busy || cancelled) return;
            busy = true;
            fetchScanJob(job.jobId)
              .then(state => {
                if (cancelled) return;
                setProcessingPct(state.pct);
                if (state.status === 'done') {
                  window.clearInterval(pollTimer);
                  finish(
                    state.asset
                      ? [{ ...normalizeScanAsset(state.asset), stage: 'review' }]
                      : files
                          .filter(asset => asset.type === 'bim')
                          .map(asset => ({ ...asset, stage: 'review' as const }))
                  );
                }
              })
              .catch(() => {
                window.clearInterval(pollTimer);
                if (!processingDone.current) startLocal();
              })
              .finally(() => {
                busy = false;
              });
          }, 400);
        })
        .catch(() => startLocal());
    } else {
      startLocal();
    }

    return () => {
      cancelled = true;
      if (localTimer) window.clearInterval(localTimer);
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [processingOpen, apiOnline]);

  useEffect(
    () => () => {
      if (finishTimer.current) window.clearTimeout(finishTimer.current);
    },
    []
  );

  const typeCounts = useMemo(
    () => ({
      bim: assets.filter(asset => asset.type === 'bim').length,
      drawing: assets.filter(asset => asset.type === 'drawing').length,
      scan: assets.filter(asset => asset.type === 'scan').length
    }),
    [assets]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets
      .filter(asset => asset.type === activeType)
      .filter(asset => {
        if (!needle) return true;
        return [
          asset.name,
          asset.projectName,
          asset.projectNumber,
          asset.clientName,
          asset.uploader,
          asset.position
        ].some(value => value.toLowerCase().includes(needle));
      });
  }, [assets, query, activeType]);

  const toggleFavorite = (id: string) => {
    const target = assets.find(asset => asset.id === id);
    if (!target) return;
    const favorite = !target.favorite;
    setAssets(prev => prev.map(asset => (asset.id === id ? { ...asset, favorite } : asset)));
    if (apiOnline) void patchScanAsset(id, { favorite }).catch(() => undefined);
  };

  const removeAsset = (id: string) => {
    setAssets(prev => prev.filter(asset => asset.id !== id));
    setMenuId(null);
    if (apiOnline) void deleteScanAsset(id).catch(() => undefined);
  };

  const openImport = (type: ScanAssetType = activeType) => {
    setDraft([]);
    setImportType(type === 'scan' ? 'scan' : 'bim');
    setImportStep('ifc');
    setPointCloudDraft(null);
    draftCount.current = 0;
    setImportOpen(true);
  };

  const closeImport = () => {
    setImportOpen(false);
    setDraft([]);
    setPointCloudDraft(null);
  };

  const addFiles = (type: ScanAssetType, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const mapped = files.map(file => {
      draftCount.current += 1;
      const id = `draft-${Date.now()}-${draftCount.current}`;
      filesRef.current[id] = file;
      return {
        id,
        type,
        name: file.name,
        size: file.size,
        projectName,
        projectNumber,
        clientName: 'Client not set',
        uploader: 'Dicky Lam',
        position: 'Quantity Surveyor',
        addedAt: Date.now(),
        favorite: false,
        preview: draftCount.current % 3,
        stage: 'processing' as const,
        progress: 0,
        status: 'uploading' as const
      };
    });
    setDraft(prev => [...prev, ...mapped]);
  };

  const startProcessing = () => {
    const readyBim = draft.some(file => file.type === 'bim' && file.status === 'ready');
    if (!readyBim || draft.some(file => file.status === 'uploading')) return;
    setImportOpen(false);
    setProcessingPct(0);
    setProcessingPhase(null);
    setProcessingOpen(true);
  };

  const confirmImport = () => {
    if (importType === 'bim') {
      startProcessing();
      return;
    }
    const ready = draft
      .filter(file => file.type === importType && file.status === 'ready')
      .map(toScanAsset);
    if (!ready.length) return;
    setAssets(prev => [...ready, ...prev]);
    if (apiOnline) {
      ready.forEach(asset => {
        void saveScanAsset(asset).catch(() => undefined);
      });
    }
    setImportOpen(false);
    setDraft([]);
    setNotice(
      `${ready.length} ${SCAN_TAB_UNIT[importType][ready.length === 1 ? 0 : 1]} added to the library.`
    );
  };

  const openAsset = (asset: ScanAsset) => {
    if (asset.type !== 'bim') return;
    const nextStage: ScanStage = asset.stage === 'cleanse' ? 'cleanse' : 'review';
    setAssets(prev =>
      prev.map(item => (item.id === asset.id ? { ...item, stage: nextStage } : item))
    );
    if (apiOnline) void patchScanAsset(asset.id, { stage: nextStage }).catch(() => undefined);

    const saved = runs[asset.id];
    if (saved) {
      setRun(saved);
      setPage('result');
      return;
    }

    const nextRun: ScanRun = {
      id: `view-${asset.id}`,
      primary: asset,
      references: [],
      createdAt: Date.now()
    };

    if (asset.modelId && apiOnline) {
      getIfcModel(asset.modelId)
        .then(async model => {
          const meshes = await loadModelMeshes(asset.modelId ?? '');
          const merged = meshes.size
            ? {
                ...model,
                elements: model.elements.map(element => {
                  const mesh = meshes.get(element.id);
                  return mesh ? { ...element, mesh } : element;
                })
              }
            : model;
          setRun({ ...nextRun, model: merged });
          setPage('result');
        })
        .catch(() => {
          setRun(nextRun);
          setPage('result');
        });
      return;
    }

    setRun(nextRun);
    setPage('result');
  };

  if (page === 'result' && run) {
    const scanElements = run.model?.elements ?? demoData.elements;
    const pointCloudAsset = assets.find(asset => asset.type === 'scan');
    const scanScenario: MappingScenario = {
      id: run.id,
      name: run.primary.name,
      type: 'hybrid',
      projectName: run.primary.projectName,
      projectNumber: run.primary.projectNumber,
      modelName: run.primary.name,
      standard: 'HKSMM4',
      elementCount: scanElements.length,
      smmItemCount: 1240,
      mappedCount: scanElements.length,
      status: 'complete',
      sources: {
        bim: run.primary.name,
        pointCloud:
          pointCloudAsset?.name ??
          run.references.find(reference => reference.type === 'scan')?.name,
        programme: run.programme?.name
      },
      createdAt: run.createdAt,
      updatedAt: Date.now()
    };
    const scanResult = buildMappingResult(scanScenario, scanElements, !!run.programme);
    return (
      <MappingResultPage
        run={{ scenario: scanScenario, result: scanResult }}
        onBack={() => setPage('library')}
        showProgramme={showProgramme}
        onCloseProgramme={onCloseProgramme}
        onToggleProgramme={onToggleProgramme}
      />
    );
  }

  return (
    <main className="apc-docpage apc-scan">
      <header className="apc-docpage__head">
        <div className="apc-docpage__title">
          <h1>AI Scanning</h1>
          <span>BIM models</span>
        </div>
        <button className="apc-docpage__new" onClick={() => openImport(activeType)}>
          <span aria-hidden>+</span>
          {SCAN_IMPORT_LABEL[activeType]}
        </button>
      </header>

      <div className="apc-scan__body">
        <div className="apc-scan__inner">
          <div className="apc-scan__tabs" role="tablist" aria-label="Uploaded file types">
            {SCAN_TAB_ORDER.map(type => (
              <button
                key={type}
                role="tab"
                aria-selected={activeType === type}
                className={`apc-scan__tab${activeType === type ? ' on' : ''}`}
                onClick={() => {
                  setActiveType(type);
                  setQuery('');
                }}
              >
                <Icon name={SCAN_TYPES[type].icon} size={13} />
                {SCAN_TAB_LABEL[type]}
                <b>{typeCounts[type]}</b>
              </button>
            ))}
          </div>

          <div className="apc-scan__summary">
            <div>
              <b>{SCAN_TAB_LABEL[activeType]}</b>
              <span>
                {filtered.length} {SCAN_TAB_UNIT[activeType][filtered.length === 1 ? 0 : 1]}
              </span>
            </div>
            <div className="apc-scan__tools">
              <label className="apc-recordsearch apc-scan__search">
                <Icon name="search" size={14} />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder={`Search ${SCAN_TAB_LABEL[activeType].toLowerCase()}...`}
                />
                {query && (
                  <button className="apc-scan__searchclear" onClick={() => setQuery('')} aria-label="Clear search">
                    <Icon name="x" size={11} />
                  </button>
                )}
              </label>
              <div className="apc-scan__viewtoggle" role="group" aria-label="View style">
                <button
                  className={view === 'grid' ? 'on' : ''}
                  onClick={() => setView('grid')}
                  aria-label="Grid view"
                  title="Grid view"
                >
                  <Icon name="layout-grid" size={14} />
                </button>
                <button
                  className={view === 'list' ? 'on' : ''}
                  onClick={() => setView('list')}
                  aria-label="List view"
                  title="List view"
                >
                  <Icon name="rows-2" size={14} />
                </button>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="apc-scan__empty">
              <span>
                <Icon name={SCAN_TYPES[activeType].icon} size={24} />
              </span>
              <b>
                {query
                  ? `No matching ${SCAN_TAB_UNIT[activeType][1]}`
                  : `No ${SCAN_TAB_UNIT[activeType][1]} yet`}
              </b>
              <p>{query ? 'No matching file.' : 'No files uploaded.'}</p>
              {!query && (
                <button onClick={() => openImport(activeType)}>
                  <span aria-hidden>+</span>
                  {SCAN_IMPORT_LABEL[activeType]}
                </button>
              )}
            </div>
          ) : view === 'grid' ? (
            <div className="apc-scan__grid">
              {filtered.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  menuOpen={menuId === asset.id}
                  onToggleMenu={() => setMenuId(prev => (prev === asset.id ? null : asset.id))}
                  onRemove={() => removeAsset(asset.id)}
                  onFavorite={() => toggleFavorite(asset.id)}
                  onOpen={() => openAsset(asset)}
                />
              ))}
            </div>
          ) : (
            <ResultTable
              assets={filtered}
              menuId={menuId}
              onToggleMenu={id => setMenuId(prev => (prev === id ? null : id))}
              onRemove={removeAsset}
              onFavorite={toggleFavorite}
              onOpen={openAsset}
            />
          )}
        </div>
      </div>

      {importOpen && (
        <ScanImportWizard
          type={importType}
          step={importStep}
          projectName={projectName}
          projectNumber={projectNumber}
          draft={draft}
          programme={programmeDraft}
          pointCloud={pointCloudDraft}
          onClose={closeImport}
          onAddFiles={addFiles}
          onRemoveFile={id => setDraft(prev => prev.filter(file => file.id !== id))}
          onProgramme={setProgrammeDraft}
          onPointCloud={setPointCloudDraft}
          onNext={() =>
            setImportStep(current =>
              current === 'ifc'
                ? 'drawings'
                : current === 'drawings'
                  ? 'programme'
                  : 'pointcloud'
            )
          }
          onBack={() =>
            setImportStep(current =>
              current === 'pointcloud'
                ? 'programme'
                : current === 'programme'
                  ? 'drawings'
                  : 'ifc'
            )
          }
          onProcess={startProcessing}
          onConfirm={confirmImport}
        />
      )}

      {processingOpen && (
        <ScanProcessing
          pct={processingPct}
          referenceCount={draft.filter(file => file.type !== 'bim').length}
          modelName={draft.find(file => file.type === 'bim')?.name ?? 'IFC model'}
          steps={processingPhase ? IFC_PHASES : undefined}
          active={processingPhase?.step ?? 0}
          title={processingPhase ? 'Reading IFC model' : undefined}
        />
      )}

      {notice && <div className="apc-scan__toast">{notice}</div>}
    </main>
  );
}
