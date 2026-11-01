import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DataTable, type Columns } from './DataTable';
import { sortCompare } from '@/lib/sortCompare';

interface Row { id: string; name: string; n: number | null; at: string; tag: string | number | null }

const show = (data: Row[], extra: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}, onDelete?: (r: Row) => void) => {
  const cols: Columns<Row> = [
    { id: 'name', header: '姓名', accessorKey: 'name' },
    { id: 'n', header: '数量', accessorKey: 'n' },
    { id: 'at', header: '时间', accessorKey: 'at' },
    { id: 'tag', header: '标签', accessorKey: 'tag' },
    { id: 'act', header: '', enableSorting: false, cell: (c) => <button onClick={() => onDelete?.(c.row.original)}>删除{c.row.original.id}</button> },
  ];
  return render(<MemoryRouter><DataTable data={data} columns={cols} {...extra} /></MemoryRouter>);
};
const base: Row[] = [
  { id: 'r1', name: '张三', n: 10, at: '2026-10-05 08:00', tag: null },
  { id: 'r2', name: '李四', n: 2, at: '2026-9-30 08:00', tag: '乙' },
  { id: 'r3', name: '王五', n: 1, at: '2026-10-05 07:00', tag: 3 },
];
const col = (i: number) => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[i].textContent);
const th = (name: string) => screen.getByRole('columnheader', { name });

describe('表头排序', () => {
  test('点三次：升序、降序、取消排序（回到数据原始顺序）', async () => {
    const user = userEvent.setup();
    show(base);
    expect(col(0)).toEqual(['张三', '李四', '王五']);
    await user.click(th('数量'));
    expect(col(1)).toEqual(['1', '2', '10']);
    expect(th('数量')).toHaveAttribute('aria-sort', 'ascending');
    await user.click(th('数量'));
    expect(col(1)).toEqual(['10', '2', '1']);
    expect(th('数量')).toHaveAttribute('aria-sort', 'descending');
    await user.click(th('数量'));
    expect(col(0)).toEqual(['张三', '李四', '王五']);
    expect(th('数量')).toHaveAttribute('aria-sort', 'none');
  });

  test('一列的值全相同时点击不改变行序', async () => {
    const user = userEvent.setup();
    show(base.map((r) => ({ ...r, tag: '同' })));
    await user.click(th('标签'));
    expect(col(0)).toEqual(['张三', '李四', '王五']);
  });

  test('键盘：可排序表头可聚焦，Enter 和空格都能触发；操作列不可聚焦', async () => {
    const user = userEvent.setup();
    show(base);
    expect(th('姓名')).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('columnheader').at(-1)).not.toHaveAttribute('tabindex');
    th('数量').focus();
    await user.keyboard('{Enter}');
    expect(th('数量')).toHaveAttribute('aria-sort', 'ascending');
    await user.keyboard(' ');
    expect(th('数量')).toHaveAttribute('aria-sort', 'descending');
  });

  test('没排序的列 aria-sort 为 none，操作列没有 aria-sort', () => {
    show(base);
    expect(th('姓名')).toHaveAttribute('aria-sort', 'none');
    expect(screen.getAllByRole('columnheader').at(-1)).not.toHaveAttribute('aria-sort');
  });

  test('中文按拼音：李四、王五、张三', async () => {
    const user = userEvent.setup();
    show(base);
    await user.click(th('姓名'));
    expect(col(0)).toEqual(['李四', '王五', '张三']);
  });

  test('日期时间字符串按时间，月份不补零也不乱', async () => {
    const user = userEvent.setup();
    show(base);
    await user.click(th('时间'));
    expect(col(2)).toEqual(['2026-9-30 08:00', '2026-10-05 07:00', '2026-10-05 08:00']);
  });

  test('空值在升序和降序下都排最后；数字排在文字前', async () => {
    const user = userEvent.setup();
    show(base);
    await user.click(th('标签'));
    expect(col(3)).toEqual(['3', '乙', '']);
    await user.click(th('标签'));
    expect(col(3)).toEqual(['乙', '3', '']);
  });

  test('排序后点行里的删除，作用于屏幕上那一行对应的记录', async () => {
    const user = userEvent.setup();
    const del = vi.fn();
    show(base, {}, del);
    await user.click(th('数量'));
    await user.click(screen.getAllByRole('button', { name: /删除/ })[0]);
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ id: 'r3' }));
  });

  test('分页列表在第 2 页点表头后回到第 1 页', async () => {
    const user = userEvent.setup();
    const many: Row[] = Array.from({ length: 25 }, (_, i) => ({ id: `x${i}`, name: `人${String(i).padStart(2, '0')}`, n: i, at: '2026-10-01', tag: 'a' }));
    show(many, { pageId: 'sort-test' });
    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByRole('button', { name: '第 2 页' })).toHaveAttribute('aria-current', 'page');
    await user.click(th('数量'));
    expect(screen.getByRole('button', { name: '第 1 页' })).toHaveAttribute('aria-current', 'page');
    expect(col(1)[0]).toBe('0');
  });
});

describe('sortCompare', () => {
  test('数字段按数值，字符串按拼音，数字在文字前，空值排最后（含降序）', () => {
    const asc = ['10', '2', '1'].sort((a, b) => sortCompare(a, b));
    expect(asc).toEqual(['1', '2', '10']);
    expect(sortCompare(5, '甲')).toBeLessThan(0);
    expect(sortCompare('', '甲')).toBeGreaterThan(0);
    expect(sortCompare('', '甲', true)).toBeLessThan(0); // 降序时调用方会取反，所以仍在最后
    expect(sortCompare(null, undefined)).toBe(0);
    expect(sortCompare(new Date('2026-01-02'), new Date('2026-01-01'))).toBeGreaterThan(0);
  });
});
