import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { matchPeople, personLabel, type Person } from '@/lib/people';
import { Icon } from '@/ui/Icon';
import { Popover } from '@/ui/Popover';

export type { Person };
const LIMIT = 20;

function useDebounced<T>(v: T, ms = 200) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/**
 * 选人：边输边查，姓名包含、工号前缀都能找到，列表显示「姓名 · 工号 · 科室」区分重名。
 * 不给 options 时到后端搜（防抖 200ms，最多 20 条）；给 options 时只在这些候选人里选。
 */
export function PersonPicker({ id, value, onChange, options, empty, placeholder = '输入姓名或工号', disabled, exclude, 'aria-label': ariaLabel }: {
  id?: string;
  /** 选中的人；只有 id 时到 options 里找 */
  value?: Person | string | null;
  onChange: (p: Person | null) => void;
  options?: readonly Person[];
  /** 可以不选时那一项的文字，如「不指定」 */
  empty?: string;
  placeholder?: string;
  disabled?: boolean;
  /** 不出现在候选里的人，如已选的 */
  exclude?: readonly string[];
  'aria-label'?: string;
}) {
  const anchor = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const dq = useDebounced(q);
  const remote = useQuery({
    queryKey: ['user-opts', dq], queryFn: () => coreApi.userOptions(dq, LIMIT + 1),
    enabled: open && !options, placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const cur = typeof value === 'string' ? options?.find((p) => p.id === value) ?? null : value ?? null;
  const found = (options ? matchPeople(options, q, LIMIT + 1) : remote.data ?? []).filter((p) => !exclude?.includes(p.id));
  const more = found.length > LIMIT;
  const shown = found.slice(0, LIMIT);
  const items: (Person | null)[] = empty && !q.trim() ? [null, ...shown] : shown;
  useEffect(() => { setHi(0); }, [dq, open]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView?.({ block: 'nearest' }); }, [hi]);

  const pick = (p: Person | null) => { onChange(p); setOpen(false); setQ(''); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setHi((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { if (open && hi < items.length) { e.preventDefault(); pick(items[hi]); } }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setQ(''); } // 只收起列表，不关外面的弹窗
    else if (e.key === 'Tab') setOpen(false);
  };
  const w = anchor.current?.offsetWidth ?? 0;

  return (
    <>
      <span className="pp-in">
        <input ref={anchor} id={id} className="input" autoComplete="off" disabled={disabled} aria-label={ariaLabel}
          role="combobox" aria-expanded={open} aria-autocomplete="list"
          placeholder={cur ? personLabel(cur) : empty ?? placeholder}
          value={open ? q : cur ? personLabel(cur) : ''}
          onFocus={() => { setOpen(true); setQ(''); }} onClick={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={key} />
        <Icon name="search" />
      </span>
      <Popover anchor={anchor} open={open} onClose={() => { setOpen(false); setQ(''); }} className="pp-pop">
        <div ref={listRef} role="listbox" aria-label="候选人员" style={{ minWidth: Math.max(w, 260) }}>
          {items.length === 0 && <div className="sel-e">{remote.isFetching ? '查找中…' : q.trim() ? `没有找到「${q.trim()}」` : '输入姓名或工号查找'}</div>}
          {items.map((p, i) => (
            <div key={p?.id ?? ''} data-i={i} role="option" aria-selected={(p?.id ?? null) === (cur?.id ?? null)}
              className={`pp-o${i === hi ? ' hi' : ''}${(p?.id ?? null) === (cur?.id ?? null) ? ' on' : ''}`}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              {p ? <><b>{p.name}</b><span className="mono fg3">{p.no}</span><span className="fg3">{p.unitName}</span></> : <span className="fg3">{empty}</span>}
            </div>
          ))}
          {more && <div className="pp-more">只列出前 {LIMIT} 人，输入更多字缩小范围</div>}
        </div>
      </Popover>
    </>
  );
}

/** 选多人：已选的列成标签，后面接一个 PersonPicker 继续添加 */
export function PeoplePicker({ id, value, onChange, options, placeholder = '输入姓名或工号添加' }: {
  id?: string;
  value: readonly Person[];
  onChange: (list: Person[]) => void;
  options?: readonly Person[];
  placeholder?: string;
}) {
  return (
    <div className="pp-multi">
      {value.length > 0 && (
        <div className="chips">
          {value.map((p) => (
            <span key={p.id} className="chip on" title={personLabel(p)}>{p.name}{p.no && <span className="n">{p.no}</span>}
              <button type="button" className="x" aria-label={`移除 ${p.name}`} onClick={() => onChange(value.filter((x) => x.id !== p.id))}><Icon name="x" /></button>
            </span>
          ))}
        </div>
      )}
      <PersonPicker id={id} value={null} options={options} placeholder={placeholder} exclude={value.map((p) => p.id)}
        onChange={(p) => { if (p) onChange([...value, p]); }} />
    </div>
  );
}
