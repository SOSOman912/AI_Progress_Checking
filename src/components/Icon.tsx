import type { CSSProperties } from 'react';
import {
  ArrowLeftRight,
  ArrowUpDown,
  BadgeCheck,
  Bell,
  BookOpenText,
  Box,
  BoxSelect,
  Building2,
  ClipboardCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CloudUpload,
  Columns2,
  CreditCard,
  Crosshair,
  Download,
  DraftingCompass,
  Eraser,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Focus,
  Folder,
  FolderClosed,
  Footprints,
  Hand,
  Image,
  Info,
  HelpCircle,
  LayoutGrid,
  LayoutPanelLeft,
  ListTree,
  LogOut,
  Maximize2,
  Minimize2,
  MousePointer2,
  Move3d,
  Orbit,
  PanelBottom,
  PencilLine,
  PencilRuler,
  PersonStanding,
  RotateCcw,
  Rows2,
  Ruler,
  Save,
  Scan,
  Search,
  Settings,
  SlidersHorizontal,
  Square,
  SquareDashed,
  Star,
  Trash2,
  TriangleAlert,
  User,
  X,
  Zap,
  ZoomIn
} from 'lucide-react';

function PricingDocumentIcon({
  size = 24,
  strokeWidth = 2,
  className,
  style
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 11v8" />
      <path d="M14.3 12.8c-.5-.7-1.3-1.1-2.3-1.1-1.2 0-2.1.6-2.1 1.5s.8 1.3 2.1 1.6 2.2.7 2.2 1.6-.9 1.5-2.2 1.5c-1 0-1.9-.4-2.4-1.1" />
    </svg>
  );
}

function InvoiceDnIcon({
  size = 24,
  strokeWidth = 2,
  className,
  style
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path d="M6 2h12v20l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
      <path d="M15 18.5h4M17.5 16.5l2 2-2 2" />
    </svg>
  );
}

const REGISTRY = {
  'badge-check': BadgeCheck,
  bell: Bell,
  'book-open-text': BookOpenText,
  'building-2': Building2,
  'clipboard-check': ClipboardCheck,
  'credit-card': CreditCard,
  'arrow-left-right': ArrowLeftRight,
  'arrow-up-down': ArrowUpDown,
  crosshair: Crosshair,
  download: Download,
  'drafting-compass': DraftingCompass,
  eraser: Eraser,
  eye: Eye,
  'eye-off': EyeOff,
  footprints: Footprints,
  'person-standing': PersonStanding,
  hand: Hand,
  'move-3d': Move3d,
  orbit: Orbit,
  'zoom-in': ZoomIn,
  'file-spreadsheet': FileSpreadsheet,
  'help-circle': HelpCircle,
  'list-tree': ListTree,
  'log-out': LogOut,
  'mouse-pointer-2': MousePointer2,
  ruler: Ruler,
  settings: Settings,
  user: User,
  box: Box,
  'box-select': BoxSelect,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'circle-alert': CircleAlert,
  'cloud-upload': CloudUpload,
  'columns-2': Columns2,
  'file-text': FileText,
  focus: Focus,
  folder: Folder,
  image: Image,
  'folder-closed': FolderClosed,
  info: Info,
  'layout-grid': LayoutGrid,
  'layout-panel-left': LayoutPanelLeft,
  'maximize-2': Maximize2,
  'minimize-2': Minimize2,
  'panel-bottom': PanelBottom,
  'pencil-line': PencilLine,
  'pencil-ruler': PencilRuler,
  'pricing-document': PricingDocumentIcon,
  'invoice-dn': InvoiceDnIcon,
  'rotate-ccw': RotateCcw,
  'rows-2': Rows2,
  save: Save,
  scan: Scan,
  search: Search,
  'sliders-horizontal': SlidersHorizontal,
  square: Square,
  star: Star,
  'trash-2': Trash2,
  'square-dashed': SquareDashed,
  'triangle-alert': TriangleAlert,
  x: X,
  zap: Zap
} as const;

export type IconName = keyof typeof REGISTRY;

interface IconProps {
  name: IconName | string;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 16, stroke = 1.6, style, className }: IconProps) {
  const Cmp = REGISTRY[name as IconName];
  if (!Cmp) return <span style={{ width: size, height: size, display: 'inline-block' }} />;
  return <Cmp size={size} strokeWidth={stroke} style={{ flexShrink: 0, ...style }} className={className} />;
}
