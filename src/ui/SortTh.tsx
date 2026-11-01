import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { TableSort } from './useTableSort';

/** 可排序表头：鼠标点击、Enter、空格都能排序，`aria-sort` 随状态变化。配合 useTableSort。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SortTh({ sort, k, className, style, children }: { sort: TableSort<any>; k: string; className?: string; style?: React.CSSProperties; children: ReactNode }) {
  const dir = sort.dirOf(k);
  return (
    <th className={[className, 'sort'].filter(Boolean).join(' ')} style={style} tabIndex={0}
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
      onClick={() => sort.toggle(k)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort.toggle(k); } }}>
      {children}
      {dir && <Icon name="sortdown" style={dir === 'asc' ? { transform: 'rotate(180deg)' } : undefined} />}
    </th>
  );
}
