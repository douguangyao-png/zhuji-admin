import { useMemo, useState } from 'react';
import { sortCompare } from '@/lib/sortCompare';

export type SortDir = 'asc' | 'desc';
export interface TableSort<T> {
  /** 排序后的行；没有排序时是原始顺序 */
  rows: T[];
  /** 点表头：升序、降序、取消排序 */
  toggle: (key: string) => void;
  dirOf: (key: string) => SortDir | undefined;
  /** 供 SortTh 使用 */
  keys: ReadonlySet<string>;
}

/**
 * 页面里直接写的 `<table>` 用它排序（共用的 DataTable 自带排序）。
 * accessors：列 key 到取值函数；规则与 DataTable 一致（见 lib/sortCompare.ts）。
 * 表头用 `<SortTh sort={sort} k="列key">`。
 */
export function useTableSort<T>(data: T[], accessors: Record<string, (row: T) => unknown>): TableSort<T> {
  const [cur, setCur] = useState<{ key: string; dir: SortDir } | null>(null);
  const rows = useMemo(() => {
    const get = cur && accessors[cur.key];
    if (!cur || !get) return data;
    const desc = cur.dir === 'desc';
    return data
      .map((row, i) => ({ row, i }))
      .sort((a, b) => {
        const c = sortCompare(get(a.row), get(b.row), desc);
        return (desc ? -c : c) || a.i - b.i; // 相同时保持原来的先后
      })
      .map((x) => x.row);
    // accessors 通常是每次渲染新建的对象，只看数据和当前排序
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cur]);
  const toggle = (key: string) => setCur((c) => (!c || c.key !== key ? { key, dir: 'asc' } : c.dir === 'asc' ? { key, dir: 'desc' } : null));
  return { rows, toggle, dirOf: (key) => (cur?.key === key ? cur.dir : undefined), keys: new Set(Object.keys(accessors)) };
}
