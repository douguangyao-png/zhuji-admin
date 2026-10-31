import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DataTable, type Columns } from './DataTable';

interface Row { id: string; a: string; b: string; c: string }
const rows: Row[] = [{ id: 'r1', a: '甲', b: '乙', c: '丙' }, { id: 'r2', a: '丁', b: '戊', c: '己' }];
const cols: Columns<Row> = [
  { id: 'a', header: '第一列', accessorKey: 'a' },
  { id: 'b', header: '第二列', accessorKey: 'b' },
  { id: 'c', header: '第三列', accessorKey: 'c' },
];

/** jsdom 不算布局：按容器宽度打桩 scrollWidth / clientWidth / offsetWidth */
function stubWidth(scroll: number, client: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('tw') ? scroll : 0; });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('tw') ? client : 0; });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(44);
}
afterEach(() => vi.restoreAllMocks());

const show = (selectable = false) => render(
  <MemoryRouter><DataTable data={rows} columns={cols} selectable={selectable} selected={new Set()} onSelect={() => {}} /></MemoryRouter>,
);

describe('表格横向滚动时冻结前两列数据列，选择框另算', () => {
  test('无选择框：冻结 2 列，第三列不带，第一列左偏移 0、第二列左偏移取第一列宽度', () => {
    stubWidth(1200, 600);
    show();
    const table = screen.getByRole('table');
    expect(table).toHaveClass('pin2');
    expect(table.style.getPropertyValue('--pin1l')).toBe('0px');
    expect(table.style.getPropertyValue('--pin2l')).toBe('44px');
    expect(document.querySelectorAll('thead th.pin')).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: '第一列' })).toHaveClass('pin', 'pin-1');
    expect(screen.getByRole('columnheader', { name: '第二列' })).toHaveClass('pin', 'pin-2');
    expect(screen.getByRole('columnheader', { name: '第三列' })).not.toHaveClass('pin');
    expect(screen.getByRole('cell', { name: '甲' })).toHaveClass('pin-1');
    expect(screen.getByRole('cell', { name: '乙' })).toHaveClass('pin-2');
    expect(screen.getByRole('cell', { name: '丙' })).not.toHaveClass('pin');
  });

  test('宽容器没有横向滚动：不冻结', () => {
    stubWidth(600, 600);
    show();
    expect(screen.getByRole('table')).not.toHaveClass('pin2');
    expect(document.querySelectorAll('.pin')).toHaveLength(0);
  });

  test('有行选择框：选择框不算数，冻结选择框加 2 列数据列共 3 列，左偏移依次累加', () => {
    stubWidth(1200, 600);
    show(true);
    const table = screen.getByRole('table');
    expect(screen.getByRole('checkbox', { name: '全选' }).closest('th')).toHaveClass('w-cb', 'pin', 'pin-cb');
    expect(screen.getByRole('checkbox', { name: '选择 r1' }).closest('td')).toHaveClass('pin', 'pin-cb');
    expect(screen.getByRole('columnheader', { name: '第一列' })).toHaveClass('pin', 'pin-1');
    expect(screen.getByRole('columnheader', { name: '第二列' })).toHaveClass('pin', 'pin-2');
    expect(screen.getByRole('columnheader', { name: '第三列' })).not.toHaveClass('pin');
    expect(screen.getByRole('cell', { name: '乙' })).toHaveClass('pin-2');
    expect(screen.getByRole('cell', { name: '丙' })).not.toHaveClass('pin');
    expect(document.querySelectorAll('thead th.pin')).toHaveLength(3);
    expect(table.style.getPropertyValue('--pin1l')).toBe('44px');
    expect(table.style.getPropertyValue('--pin2l')).toBe('88px');
  });
});
