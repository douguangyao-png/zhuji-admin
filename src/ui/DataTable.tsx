import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Table,
} from '@tanstack/react-table';
import { Icon } from './Icon';
import { Empty } from './primitives';
import { Pager, usePaging } from './Pager';
import { sortCompare } from '@/lib/sortCompare';

/** TanStack types the value generic as `any`; alias it once so pages don't each restate it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Columns<T> = ColumnDef<T, any>[];

/** Per-column extras a spec can set: the td class, the th class and a width. */
export interface ColMeta { className?: string; th?: string; width?: number | string }
const metaOf = (c: { columnDef: { meta?: unknown } }): ColMeta => (c.columnDef.meta ?? {}) as ColMeta;

/** A `.cb` box that behaves like a checkbox for keyboard and screen readers. */
function Check({ on, mix, label, onToggle }: { on: boolean; mix?: boolean; label: string; onToggle: () => void }) {
  const key = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(); } };
  return (
    <span className={`cb${on ? ' on' : mix ? ' mix' : ''}`} role="checkbox" tabIndex={0} aria-checked={mix ? 'mixed' : on} aria-label={label}
      onClick={(e) => { e.stopPropagation(); onToggle(); }} onKeyDown={key} />
  );
}

/**
 * 表格出现横向滚动条时冻结前两列数据列；有行选择框时选择框另外冻结，共 3 列。
 * 返回容器 ref、表格 ref 和是否冻结；两列数据列的左偏移按前面各列表头的实际宽度累加，写在表格的 --pin1l、--pin2l 上。
 */
function usePin2() {
  const wrap = useRef<HTMLDivElement>(null);
  const tbl = useRef<HTMLTableElement>(null);
  const [pin, setPin] = useState(false);
  const check = useRef(() => {});
  check.current = () => {
    const w = wrap.current, t = tbl.current;
    if (!w || !t) return;
    setPin(w.scrollWidth > w.clientWidth + 1);
    const ths = t.querySelectorAll<HTMLElement>('thead tr:last-child > th');
    const cb = ths[0]?.classList.contains('w-cb') ? ths[0].offsetWidth : 0;
    const first = ths[cb ? 1 : 0]?.offsetWidth ?? 0;
    t.style.setProperty('--pin1l', `${cb}px`);
    t.style.setProperty('--pin2l', `${cb + first}px`);
  };
  // 每次渲染后重算（换页、筛选、展开行都会改变宽度）；尺寸变化由 ResizeObserver 和窗口 resize 触发
  useLayoutEffect(() => check.current());
  useLayoutEffect(() => {
    const run = () => check.current();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run);
    if (wrap.current) ro?.observe(wrap.current);
    if (tbl.current) ro?.observe(tbl.current);
    window.addEventListener('resize', run);
    return () => { ro?.disconnect(); window.removeEventListener('resize', run); };
  }, []);
  return { wrap, tbl, pin };
}

export function DataTable<T>({
  data,
  columns,
  defaultSort,
  onRowClick,
  emptyText,
  nameColumn,
  detailHref,
  selectable,
  selected,
  onSelect,
  rowKey,
  pageId,
  expand,
  open,
  onToggle,
  tableClass,
  rowClass,
}: {
  data: T[];
  columns: Columns<T>;
  /** Lists default to newest first, so this is usually a timestamp column, descending. */
  defaultSort?: SortingState;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  /** Column id whose cell becomes an `a.name` link to `detailHref(row)`. */
  nameColumn?: string;
  detailHref?: (row: T) => string;
  selectable?: boolean;
  selected?: Set<string>;
  onSelect?: (ids: Set<string>) => void;
  rowKey?: (row: T) => string;
  /** Pages the rows and remembers the page size under this id (SH-12). */
  pageId?: string;
  /** A detail row under each row; clicking the row (not a link or button in it) toggles it. */
  expand?: (row: T) => ReactNode;
  open?: Set<string>;
  onToggle?: (key: string) => void;
  /** Extra class on the table, for the page's own column rules (e.g. `gt`). */
  tableClass?: string;
  /** Extra class per row, e.g. `void` for rows shown greyed out. */
  rowClass?: (row: T) => string | undefined;
}) {
  const [sorting, setSorting] = useState<SortingState>(defaultSort ?? []);
  const getRowKey = rowKey ?? ((row: T) => (row as { id: string }).id);
  const sel = selected ?? new Set<string>();

  const resolvedColumns = useMemo(() => {
    if (!nameColumn || !detailHref) return columns;
    return columns.map((col) => {
      if (col.id !== nameColumn) return col;
      const originalCell = col.cell;
      return {
        ...col,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cell: (ctx: any) => (
          <Link className="name" to={detailHref(ctx.row.original)}>
            {originalCell ? flexRender(originalCell, ctx) : ctx.getValue()}
          </Link>
        ),
      };
    });
  }, [columns, nameColumn, detailHref]);

  // 排序规则统一用 sortCompare；降序时 TanStack 会把比较结果取反，所以要告诉它当前方向，空值才能始终排最后
  const tableRef = useRef<Table<T> | null>(null);
  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: { sorting },
    onSortingChange: setSorting,
    defaultColumn: {
      sortDescFirst: false, // 第一次点击一律升序（TanStack 默认数字列先降序）
      sortingFn: (a, b, id) => sortCompare(a.getValue(id), b.getValue(id), tableRef.current?.getColumn(id)?.getIsSorted() === 'desc'),
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  tableRef.current = table;
  const allRows = table.getRowModel().rows;
  const paging = usePaging(pageId ?? 'unpaged', allRows.length);
  // 排序一变就回到第 1 页，不然停在第 3 页看到的是另一批行
  const firstSort = useRef(true);
  useEffect(() => {
    if (firstSort.current) { firstSort.current = false; return; }
    paging.go(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorting]);
  const rows = pageId ? allRows.slice(paging.from - 1, paging.to) : allRows;

  const picked = rows.filter((r) => sel.has(getRowKey(r.original))).length;
  const toggleAll = () => {
    if (!onSelect) return;
    const next = new Set(sel);
    rows.forEach((r) => (picked === rows.length ? next.delete(getRowKey(r.original)) : next.add(getRowKey(r.original))));
    onSelect(next);
  };
  const toggleRow = (key: string) => {
    if (!onSelect) return;
    const next = new Set(sel);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelect(next);
  };

  const { wrap, tbl, pin } = usePin2();
  /** 第 i 个数据列（不含选择框）冻结时的类名 */
  const pinOf = (i: number) => {
    if (!pin) return undefined;
    return i === 0 ? 'pin pin-1' : i === 1 ? 'pin pin-2' : undefined;
  };
  const join = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ') || undefined;

  return (
    <>
      <div className="tw" ref={wrap}>
        <table ref={tbl} className={join('tbl', tableClass, pin && 'pin2')}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {selectable && (
                  <th className={join('w-cb', pin && 'pin pin-cb')}><Check on={rows.length > 0 && picked === rows.length} mix={picked > 0 && picked < rows.length} label="全选" onToggle={toggleAll} /></th>
                )}
                {hg.headers.map((h, i) => {
                  const sortable = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  const m = metaOf(h.column);
                  const num = m.className?.split(' ').includes('num');
                  const cls = join(m.th, num && 'num', sortable && 'sort', pinOf(i));
                  return (
                    <th key={h.id} className={cls} style={m.width ? { width: m.width } : undefined}
                      aria-sort={sortable ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined}
                      tabIndex={sortable ? 0 : undefined}
                      onClick={sortable ? h.column.getToggleSortingHandler() : undefined}
                      onKeyDown={sortable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.column.getToggleSortingHandler()?.(e); } } : undefined}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {dir && <Icon name="sortdown" style={dir === 'asc' ? { transform: 'rotate(180deg)' } : undefined} />}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = getRowKey(r.original);
              const on = selectable && sel.has(key);
              const isOpen = Boolean(expand && open?.has(key));
              const click = expand
                ? (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('a, button, [role="checkbox"]')) onToggle?.(key); }
                : onRowClick ? () => onRowClick(r.original) : undefined;
              const cls = [on && 'sel', isOpen && 'open', rowClass?.(r.original)].filter(Boolean).join(' ') || undefined;
              return (
                <Fragment key={r.id}>
                  <tr className={cls} data-exp={expand ? '' : undefined} aria-expanded={expand ? isOpen : undefined} style={onRowClick && !expand ? { cursor: 'pointer' } : undefined} onClick={click}>
                    {selectable && <td className={pin ? 'pin pin-cb' : undefined}><Check on={sel.has(key)} label={`选择 ${key}`} onToggle={() => toggleRow(key)} /></td>}
                    {r.getVisibleCells().map((c, i) => (
                      <td key={c.id} className={join(metaOf(c.column).className, pinOf(i))}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                    ))}
                  </tr>
                  {isOpen && <tr className="exp"><td colSpan={r.getVisibleCells().length + (selectable ? 1 : 0)}>{expand!(r.original)}</td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <Empty text={emptyText} />}
      {pageId && allRows.length > 0 && <Pager paging={paging} />}
    </>
  );
}
