import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import { Icon, type IconName } from './Icon';

interface DraggablePanelProps {
  title: string;
  icon?: IconName;
  headerExtra?: ReactNode;
  initial: { x?: number; y?: number; w: number; h: number };
  minWidth?: number;
  minHeight?: number;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Floating panel that never takes layout space.
 * - draggable by its header
 * - resizable from the bottom-right corner
 * - content is clipped and scrolls when the panel is too small
 * - always closable from the header
 */
export function DraggablePanel({
  title,
  icon,
  headerExtra,
  initial,
  minWidth = 260,
  minHeight = 180,
  onClose,
  children,
  className
}: DraggablePanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: initial.w, h: initial.h });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const bounds = () => ref.current?.parentElement?.getBoundingClientRect();

  useLayoutEffect(() => {
    const rect = bounds();
    const width = rect?.width ?? window.innerWidth;
    const height = rect?.height ?? window.innerHeight;
    const w = Math.min(Math.max(minWidth, initial.w), Math.max(minWidth, width - 32));
    const h = Math.min(Math.max(minHeight, initial.h), Math.max(minHeight, height - 32));
    setSize({ w, h });
    setPos({
      x: initial.x ?? Math.max(8, width - w - 16),
      y: initial.y ?? 16
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    const rect = bounds();
    if (!rect) return;
    const { w, h } = sizeRef.current;
    const x = Math.min(
      Math.max(8, event.clientX - rect.left - drag.current.dx),
      Math.max(8, rect.width - w - 8)
    );
    const y = Math.min(
      Math.max(8, event.clientY - rect.top - drag.current.dy),
      Math.max(8, rect.height - h - 8)
    );
    setPos({ x, y });
  };

  const endDrag = () => {
    drag.current = null;
  };

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    resize.current = { x: event.clientX, y: event.clientY, w: size.w, h: size.h };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!resize.current) return;
    const rect = bounds();
    const x = pos?.x ?? 8;
    const y = pos?.y ?? 8;
    const maxW = rect ? rect.width - x - 8 : window.innerWidth;
    const maxH = rect ? rect.height - y - 8 : window.innerHeight;
    const w = Math.min(
      Math.max(minWidth, resize.current.w + (event.clientX - resize.current.x)),
      Math.max(minWidth, maxW)
    );
    const h = Math.min(
      Math.max(minHeight, resize.current.h + (event.clientY - resize.current.y)),
      Math.max(minHeight, maxH)
    );
    setSize({ w, h });
  };

  const endResize = () => {
    resize.current = null;
  };

  return (
    <section
      ref={ref}
      className={`apc-dragpanel${className ? ` ${className}` : ''}`}
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        width: size.w,
        height: size.h,
        visibility: pos ? 'visible' : 'hidden'
      }}
      aria-label={title}
    >
      <header
        className="apc-dragpanel__head"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {icon && <Icon name={icon} size={13} />}
        <b className="apc-dragpanel__title">{title}</b>
        {headerExtra}
        <button className="apc-iconbtn" onClick={onClose} aria-label={`Close ${title}`}>
          <Icon name="x" size={13} />
        </button>
      </header>

      <div className="apc-dragpanel__body">{children}</div>

      <span
        className="apc-dragpanel__resize"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        role="separator"
        aria-label="Resize panel"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M9 1 1 9M9 5 5 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      </span>
    </section>
  );
}
