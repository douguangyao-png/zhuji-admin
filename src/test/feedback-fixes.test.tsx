import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { get } from '@/api/http';
import type { Page, User } from '@/api/types';
import { Select } from '@/ui/Select';
import { freshDb, openApp } from './render';

beforeEach(() => freshDb());

function Demo() {
  const [v, setV] = useState('b');
  const names = ['甲', '乙', '丙', '丁', '戊', '己', '庚'];
  return (
    <>
      <label htmlFor="s">科室</label>
      <Select id="s" value={v} onChange={(e) => setV(e.target.value)}>{names.map((n, i) => <option key={n} value={String.fromCharCode(97 + i)}>{n}科</option>)}</Select>
      <output>{v}</output>
    </>
  );
}

test('下拉可以输入筛选，回车选中', async () => {
  render(<Demo />);
  fireEvent.click(screen.getByRole('button', { name: '乙科' }));
  const q = await screen.findByRole('textbox', { name: '筛选选项' });
  fireEvent.change(q, { target: { value: '戊' } });
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
  fireEvent.keyDown(q, { key: 'Enter' });
  expect(screen.getByRole('status')).toHaveTextContent('e');
  // 隐藏的原生 select 仍然跟着标签走
  fireEvent.change(screen.getByLabelText('科室'), { target: { value: 'g' } });
  expect(screen.getByRole('status')).toHaveTextContent('g');
});

test('侧栏有消息入口和未读数', async () => {
  openApp('/');
  const link = await within(await screen.findByRole('navigation', { name: '主导航' })).findByRole('link', { name: /^消息\s*\d*$/ });
  await waitFor(() => expect(link).toHaveTextContent(/\d/));
});

test('导出先选列：默认全选，取消一列后只导出其余列', async () => {
  openApp('/example', 'U01');
  const exportBtn = await screen.findByRole('button', { name: /导出/ });
  await waitFor(() => expect(exportBtn).toBeEnabled());
  fireEvent.click(exportBtn);
  const dlg = await screen.findByRole('dialog');
  const status = within(dlg).getByRole('checkbox', { name: '状态' });
  expect(status).toBeChecked();
  fireEvent.click(status);
  fireEvent.click(within(dlg).getByRole('button', { name: '导出' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('字典项可以删除，删掉的进回收列表，能恢复', async () => {
  openApp('/system/dicts', 'U01');
  fireEvent.click(await screen.findByRole('button', { name: '删除 中' }));
  const ask = await screen.findByRole('alertdialog');
  fireEvent.click(within(ask).getByRole('button', { name: '删除' }));
  const removed = await screen.findByRole('button', { name: /已删除（1）/ });
  fireEvent.click(removed);
  const dlg = await screen.findByRole('dialog');
  expect(within(dlg).getByText('中')).toBeInTheDocument();
  fireEvent.click(within(dlg).getByRole('button', { name: '恢复' }));
  await waitFor(() => expect(within(dlg).queryByText('中')).not.toBeInTheDocument());
});

test('字典分类支持两级，有子分类的父分类不能直接配字典项', async () => {
  openApp('/system/dicts', 'U01');
  fireEvent.click(await screen.findByRole('button', { name: '一级分类' }));
  let dlg = await screen.findByRole('dialog');
  fireEvent.change(within(dlg).getByLabelText('名称'), { target: { value: '测试分类' } });
  fireEvent.click(within(dlg).getByRole('button', { name: '保存' }));
  fireEvent.click(await screen.findByRole('button', { name: /测试分类/ }));
  // 加子分类、改名、删除在树顶部「全部」这一行，不在树下面
  const addKid = await screen.findByRole('button', { name: '给 测试分类 加子分类' });
  expect(addKid.closest('.tree-top')).not.toBeNull();
  expect(screen.getByRole('button', { name: '改名 测试分类' }).closest('.tree-top')).not.toBeNull();
  fireEvent.click(addKid);
  dlg = await screen.findByRole('dialog');
  fireEvent.change(within(dlg).getByLabelText('名称'), { target: { value: '测试子类' } });
  fireEvent.click(within(dlg).getByRole('button', { name: '保存' }));
  expect(await screen.findByText(/还有子分类/)).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: '展开 测试分类' }));
  fireEvent.click(await screen.findByRole('button', { name: /测试子类/ }));
  fireEvent.change(await screen.findByLabelText('新增字典项'), { target: { value: '甲' } });
  fireEvent.click(screen.getByRole('button', { name: /添加/ }));
  expect(await screen.findByDisplayValue('甲')).toBeInTheDocument();
});

test('人员导入：按工号新增和更新，部门不存在的行标出来', async () => {
  openApp('/system/users');
  fireEvent.click(await screen.findByRole('button', { name: '导入' }));
  const dlg = await screen.findByRole('dialog');
  fireEvent.change(within(dlg).getByLabelText('导入内容'), { target: { value: '工号,姓名,部门,角色\nT9001,测试甲,业务一部,普通用户\nT9002,测试乙,不存在科,\n' } });
  expect(await within(dlg).findByText(/没有部门「不存在科」/)).toBeInTheDocument();
  fireEvent.click(within(dlg).getByRole('button', { name: '导入 1 行' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const r = await get<Page<User>>('/org/users', { q: 'T9001' });
  expect(r.items[0]).toMatchObject({ name: '测试甲', roleKeys: ['user'] });
});
