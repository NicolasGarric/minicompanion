import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isDark } from '../lib/color';
import { useT } from '../i18n';

const ICONS: Record<string, ReactNode> = {
  brush: <><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 114.03 4.03l-8.06 8.08" /><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 00-3-3.02z" /></>,
  eraser: <><path d="M7 21l-4.3-4.3a1 1 0 010-1.4l10-10a1 1 0 011.4 0l5.6 5.6a1 1 0 010 1.4L12 20.6" /><path d="M22 21H7" /><path d="M5 11l9 9" /></>,
  wand: <><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h.01M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5" /></>,
  lasso: <><path d="M7 22a5 5 0 01-2-4" /><path d="M3.3 14A6.8 6.8 0 012 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 01-5-1" /><path d="M5 18a2 2 0 100-4 2 2 0 000 4z" /></>,
  picker: <><path d="M2 22l1-1h3l9-9" /><path d="M3 21v-3l9-9" /><path d="M15 6l3.4-3.4a2.1 2.1 0 113 3L18 9l.4.4a2.1 2.1 0 11-3 3l-3.8-3.8a2.1 2.1 0 113-3L15 6" /></>,
  hand: <><path d="M18 11V6a2 2 0 00-4 0v5M14 10V4a2 2 0 00-4 0v2M10 10.5V6a2 2 0 00-4 0v8" /><path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 012.83-2.82L7 15" /></>,
  undo: <><path d="M3 7v6h6" /><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" /></>,
  redo: <><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" /></>,
  eye: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M9.88 9.88a3 3 0 104.24 4.24M10.73 5.08A10.4 10.4 0 0112 5c7 0 10 7 10 7a13.2 13.2 0 01-1.67 2.68M6.61 6.61A13.5 13.5 0 002 12s3 7 10 7a9.7 9.7 0 005.39-1.61M2 2l20 20" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>,
  up: <path d="M18 15l-6-6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  split: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18" /></>,
  layers: <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></>,
  download: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></>,
  upload: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
  home: <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M9 22V12h6v10" /></>,
  star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  check: <path d="M20 6L9 17l-5-5" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  fit: <><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" /></>,
  zoomIn: <><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35M8 11h6" /></>,
  palette: <><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 011.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6.01 17.46 2 12 2z" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></>,
  wheel: <><circle cx="12" cy="12" r="10" /><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" /></>,
  compare: <><rect x="2" y="4" width="8" height="16" rx="1" /><rect x="14" y="4" width="8" height="16" rx="1" /></>,
  save: <><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  mask: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 000 18z" fill="currentColor" /></>,
  sparkle: <path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" />,
  more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>,
  link: <><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" /></>,
  map: <><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" /><path d="M8 2v16M16 6v16" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 16v-4M12 16V8M17 16v-7" /></>,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  keyboard: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></>,
};

export function Icon({ name, size = 18, className }: { name: keyof typeof ICONS | string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export function IconButton({
  icon,
  label,
  active,
  onClick,
  disabled,
  size = 18,
  className = '',
  shortcut,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  size?: number;
  className?: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'active' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className={`slider ${disabled ? 'disabled' : ''}`}>
      <span className="slider-head">
        <span>{label}</span>
        <span className="slider-value">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track"><span className="thumb" /></span>
      {label && <span>{label}</span>}
    </label>
  );
}

export function Swatch({ hex, size = 22, title, ring }: { hex: string; size?: number; title?: string; ring?: boolean }) {
  return <span className={`swatch ${ring ? 'ring' : ''}`} title={title} style={{ background: hex, width: size, height: size }} />;
}

export function ColorInput({ value, onChange, title }: { value: string; onChange: (hex: string) => void; title?: string }) {
  const t = useT();
  return (
    <label className="color-input" title={title ?? t('common.customColor')} style={{ background: value, color: isDark(value) ? '#fff' : '#111' }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <Icon name="picker" size={12} />
    </label>
  );
}

/** Simple dropdown anchored under its trigger. */
export function Menu({ trigger, children, align = 'right' }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger(() => setOpen((o) => !o))}
      {open && <div className={`menu ${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <IconButton icon="x" label={t('common.close')} onClick={onClose} />
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
