import { useRef, useState, type ReactNode } from 'react';

export function Hint({
  label,
  children,
  side = 'top',
  delay = 3000
}: {
  label: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'left';
  delay?: number;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const enter = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const leave = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };
  return (
    <span className="apc-hint" onMouseEnter={enter} onMouseLeave={leave} onPointerDown={leave}>
      {children}
      {open && <span className={`apc-hint__pop apc-hint__pop--${side}`}>{label}</span>}
    </span>
  );
}
