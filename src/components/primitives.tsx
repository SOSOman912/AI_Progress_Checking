import { Fragment, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export const STATE_LABEL: Record<string, string> = {
  generated: 'Generated',
  calculated: 'Calculated',
  user: 'User-provided',
  override: 'Override pending',
  missing: 'Missing data',
  ambiguous: 'Ambiguous',
  confirmed: 'Confirmed',
  custom: 'Custom'
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  icon?: IconName | string;
  children?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', icon, children, className = '', ...rest }: ButtonProps) {
  const cls = `apc-btn apc-btn--${variant} apc-btn--${size}${children ? '' : ' apc-btn--icon'}${className ? ' ' + className : ''}`;
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 15} />}
      {children}
    </button>
  );
}

export function Pill({ state, children, outline }: { state: string; children?: ReactNode; outline?: boolean }) {
  return (
    <span
      className={`apc-pill${outline ? ' apc-pill--outline' : ''}`}
      style={{
        color: `var(--st-${state})`,
        background: outline ? 'transparent' : `var(--st-${state}-bg)`
      }}
    >
      <i />
      {children || STATE_LABEL[state]}
    </span>
  );
}

export interface SegOption {
  value: string;
  label: string;
}

export function Seg({
  options,
  value,
  onChange,
  size
}: {
  options: Array<string | SegOption>;
  value: string;
  onChange: (value: string) => void;
  size?: 'sm';
}) {
  return (
    <div className={`apc-seg${size === 'sm' ? ' apc-seg--sm' : ''}`}>
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return (
          <Fragment key={v}>
            <button className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
              {l}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  children,
  error,
  hint
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="apc-field">
      <span className="t-label">{label}</span>
      {children}
      {error ? <span className="apc-field__err">{error}</span> : hint ? <span className="t-xs t-faint">{hint}</span> : null}
    </label>
  );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="t-eyebrow" style={style}>
      {children}
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  return <button className={`apc-toggle${on ? ' on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />;
}

export type { InputHTMLAttributes };
