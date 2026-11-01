import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { freshDb, openApp } from './render';

// 页面里直接写的表格：点表头排序（共用的 DataTable 的排序在 ui/DataTable.sort.test.tsx）
beforeEach(() => freshDb());

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const firstCol = (table: HTMLElement) => within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent ?? '');

async function checkSortable(path: string, header: string, tableName?: string) {
  const user = userEvent.setup();
  openApp(path);
  const th = await screen.findByRole('columnheader', { name: header });
  const table = th.closest('table') as HTMLElement;
  expect(tableName ? screen.getByRole('table', { name: tableName }) : table).toBe(table);
  expect(th).toHaveAttribute('aria-sort', 'none');
  await waitFor(() => expect(firstCol(table).length).toBeGreaterThan(1)); // 数据是异步取的
  const before = firstCol(table);
  await user.click(th);
  expect(th).toHaveAttribute('aria-sort', 'ascending');
  const asc = firstCol(table);
  expect(asc).toEqual([...before].sort((a, b) => collator.compare(a, b)));
  th.focus();
  await user.keyboard('{Enter}');
  expect(th).toHaveAttribute('aria-sort', 'descending');
  expect(firstCol(table)).toEqual([...asc].reverse());
  await user.keyboard(' ');
  expect(th).toHaveAttribute('aria-sort', 'none');
  expect(firstCol(table)).toEqual(before);
}

test('消息推送：点「事件」表头排序，Enter 切降序，空格取消', () => checkSortable('/system/notify', '事件'));
test('人员属性：点「名称」表头排序（内置与扩展属性混在一起排）', () => checkSortable('/system/user-attrs', '名称'));
test('接口配置：点「方式」表头排序', () => checkSortable('/system/devices', '方式'));
