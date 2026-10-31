import { useId, type ReactNode } from 'react';
import { InfoHint } from './InfoHint';

/** A v2 `.field`: label (with optional ⓘ and "optional"), the control, then a hint or an error. */
export function Field({ label, info, optional, required, hint, error, children, style }: {
  label: string;
  info?: string;
  optional?: boolean;
  /** 必填：标签前加红星，和提交校验保持一致 */
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string) => ReactNode;
  style?: React.CSSProperties;
}) {
  const id = useId();
  return (
    <div className="field" style={style}>
      <label htmlFor={id} className={required ? 'req' : undefined}><span className="fl-t">{label}</span>{info && <> <InfoHint text={info} /></>}{optional && <> <span className="opt">选填</span></>}</label>
      {children(id)}
      {error ? <span className="hint err" role="alert">{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/** Segmented choice (mockup `.seg`); a disabled option carries its reason as a title. */
export function Seg<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string; disabled?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label} style={{ width: 'max-content' }}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : undefined}
          disabled={Boolean(o.disabled)} title={o.disabled} style={o.disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
