import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Select } from './Select';

export const PAGE_SIZES = [10, 25, 50, 100];
const n = (v: number) => v.toLocaleString('zh-CN');

/** First, last and the pages around the current one, with gaps as '…' (mockup app.js pgList). */
export function pageList(cur: number, pages: number): (number | '…')[] {
  const a = [...new Set([1, pages, cur - 1, cur, cur + 1].filter((x) => x >= 1 && x <= pages))].sort((x, y) => x - y);
  const out: (number | '…')[] = [];
  a.forEach((x, i) => { if (i && x - a[i - 1] > 1) out.push('…'); out.push(x); });
  return out;
}

const readSize = (id: string) => {
  try { const v = Number(localStorage.getItem(`aitj.pg.${id}`)); return PAGE_SIZES.includes(v) ? v : 10; } catch { return 10; }
};

export interface Paging { page: number; pages: number; size: number; from: number; to: number; total: number; label: string; go: (p: number) => void; setSize: (s: number) => void }

/** Page state for a list of `total` rows; the page size is remembered per list id. */
export function usePaging(id: string, total: number): Paging {
  const [size, setSizeState] = useState(() => readSize(id));
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(page, pages);
  const from = total ? (cur - 1) * size + 1 : 0, to = Math.min(total, cur * size);
  return {
    page: cur, pages, size, from, to, total,
    label: total ? `第 ${n(from)}–${n(to)} 条，共 ${n(total)} 条` : '共 0 条',
    go: (p) => setPage(Math.max(1, Math.min(pages, p))),
    setSize: (s) => {
      setSizeState(s); setPage(1);
      try { localStorage.setItem(`aitj.pg.${id}`, String(s)); } catch { /* private mode: lasts for this tab */ }
    },
  };
}

/** The list footer: range, rows per page, page buttons; ←/→ move between pages (mockup app.js pagerHTML). */
export function Pager({ paging: p }: { paging: Paging }) {
  const b = (go: number, label: string, body: React.ReactNode, dis: boolean, cur = false) => (
    <button key={label} type="button" className={`btn btn-sm${cur ? ' on' : ' btn-g'}${typeof body === 'number' ? ' kp-p' : ' btn-ic'}`}
      disabled={dis} aria-current={cur ? 'page' : undefined} aria-label={label} onClick={() => p.go(go)}>{body}</button>
  );
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && p.page > 1) { e.preventDefault(); p.go(p.page - 1); }
    if (e.key === 'ArrowRight' && p.page < p.pages) { e.preventDefault(); p.go(p.page + 1); }
  };
  return (
    <div className="pager kp" role="navigation" aria-label="分页" onKeyDown={keys}>
      <span className="kp-l">{p.label}</span>
      <label className="kp-s">每页 <Select className="input" aria-label="每页条数" value={p.size} onChange={(e) => p.setSize(Number(e.target.value))}>
        {PAGE_SIZES.map((s) => <option key={s}>{s}</option>)}
      </Select></label>
      <div className="kp-n push">
        {b(1, '第一页', <><Icon name="left" /><Icon name="left" /></>, p.page <= 1)}
        {b(p.page - 1, '上一页', <Icon name="left" />, p.page <= 1)}
        {pageList(p.page, p.pages).map((x, i) => (x === '…' ? <span key={`e${i}`} className="kp-e">…</span> : b(x, `第 ${x} 页`, x, false, x === p.page)))}
        {b(p.page + 1, '下一页', <Icon name="right" />, p.page >= p.pages)}
        {b(p.pages, '最后一页', <><Icon name="right" /><Icon name="right" /></>, p.page >= p.pages)}
      </div>
    </div>
  );
}

/** One page of `rows` through `children`, then the pager; for tables whose rows are computed after an early return. */
export function Paged<T>({ id, rows, children }: { id: string; rows: T[]; children: (page: T[]) => ReactNode }) {
  const p = usePaging(id, rows.length);
  return <>{children(rows.slice(p.from - 1, p.to))}{rows.length > 0 && <Pager paging={p} />}</>;
}
