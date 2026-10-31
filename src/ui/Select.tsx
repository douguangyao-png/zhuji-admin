import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Popover } from './Popover';

type Opt = { value: string; label: string; disabled?: boolean; group?: string };
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  value?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
};

const textOf = (n: ReactNode): string => Children.toArray(n)
  .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : ''))
  .join('');

function collect(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const p = c.props as { value?: unknown; children?: ReactNode; disabled?: boolean; label?: string };
    if (c.type === 'option') {
      const label = textOf(p.children);
      out.push({ value: p.value === undefined ? label : String(p.value), label, disabled: p.disabled, group });
    } else collect(p.children, c.type === 'optgroup' ? p.label : group, out);
  });
  return out;
}

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** 原生 select 的替身：点开就能输入筛选，键盘上下选、回车确定；隐藏的原生 select 留着给表单标签和测试用 */
export function Select({ value, onChange, children, className = 'input', style, disabled, title, ...rest }: Props) {
  const [touch] = useState(coarse);
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const opts = useMemo(() => collect(children), [children]);
  const cur = opts.find((o) => o.value === String(value ?? '')) ?? (value === undefined ? opts[0] : undefined);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? opts.filter((o) => o.label.toLowerCase().includes(k) || o.value.toLowerCase().includes(k) || o.group?.toLowerCase().includes(k)) : opts;
  }, [opts, q]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setHi(q ? 0 : Math.max(0, opts.findIndex((o) => o === cur))); else setQ(''); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // 触屏上不自动弹键盘，点筛选框再输入
  useEffect(() => { if (open && touch) listRef.current?.focus(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView?.({ block: 'nearest' }); }, [hi, open]);

  const native = (
    <select {...rest} className="sel-native" tabIndex={-1} disabled={disabled} title={title}
      value={value} onChange={(e) => onChange?.({ target: { value: e.target.value } })}>{children}</select>
  );

  const pick = (o?: Opt) => {
    if (!o || o.disabled) return;
    setOpen(false);
    btn.current?.focus();
    if (o.value !== String(value ?? '')) onChange?.({ target: { value: o.value } });
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[hi]); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } // 只收起下拉，不关外面的弹窗
  };
  const w = btn.current?.offsetWidth ?? 0;

  return (
    <>
      {native}
      <button ref={btn} type="button" className={`${className} sel-btn`} style={style} disabled={disabled} title={title ?? cur?.label}
        aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
          else if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setQ(e.key); setOpen(true); } // 直接打字就开始筛选
        }}>
        <span className={cur ? undefined : 'fg4'}>{cur?.label || '请选择'}</span>
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} className="sel-pop" label={rest['aria-label'] ?? '选项'}>
        <div style={{ minWidth: Math.max(w, 180) }}>
          <input className="input sel-q" autoFocus={!touch} placeholder="输入筛选" aria-label="筛选选项" value={q}
            onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={key} />
          <div ref={listRef} className="sel-l" role="listbox" tabIndex={-1} onKeyDown={key}>
            {shown.length === 0 && <div className="sel-e">没有匹配的选项</div>}
            {shown.map((o, i) => (
              <div key={`${o.value}-${i}`}>
                {o.group && o.group !== shown[i - 1]?.group && <div className="sel-g">{o.group}</div>}
                <div data-i={i} role="option" aria-selected={o === cur} aria-disabled={o.disabled || undefined}
                  className={`sel-o${i === hi ? ' hi' : ''}${o === cur ? ' on' : ''}${o.disabled ? ' dis' : ''}`}
                  onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
                  {o.label || <span className="fg4">（空）</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}
