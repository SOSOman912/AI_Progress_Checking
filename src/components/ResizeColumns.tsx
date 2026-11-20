import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export function useColumnWidths(initial: number[], min = 44, max = 720) {
  const [widths, setWidths] = useState(initial);
  const drag = useRef<{ i: number; x: number; w: number } | null>(null);

  const start = (i: number, shownWidth = widths[i]) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { i, x: e.clientX, w: shownWidth };
  };

  const move = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    const { i, x, w } = drag.current;
    const next = Math.min(max, Math.max(min, w + e.clientX - x));
    setWidths(current => {
      if (current[i] === next) return current;
      const copy = [...current];
      copy[i] = next;
      return copy;
    });
  };

  const end = () => {
    drag.current = null;
  };

  return { widths, start, move, end, total: widths.reduce((sum, w) => sum + w, 0) };
}

export function ColGroup({ widths }: { widths: number[] }) {
  return (
    <colgroup>
      {widths.map((width, i) => (
        <col key={i} style={{ width }} />
      ))}
    </colgroup>
  );
}

export function ColResize({
  index,
  start,
  move,
  end
}: {
  index: number;
  start: (index: number) => (e: ReactPointerEvent<HTMLSpanElement>) => void;
  move: (e: ReactPointerEvent<HTMLSpanElement>) => void;
  end: () => void;
}) {
  return (
    <span
      className="apc-colresize"
      onPointerDown={start(index)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}
