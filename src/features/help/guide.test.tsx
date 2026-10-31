import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { matchPath } from 'react-router-dom';
import { put } from '@/api/http';
import type { Settings } from '@/api/types';
import { MODULES } from '@/app/modules';
import { useSession } from '@/core/session';
import { freshDb, openApp } from '@/test/render';
import { allSteps } from './guide';
import { helpModule } from './index';
import { RELEASES } from './releases';

beforeEach(() => freshDb());

// 外壳里的页面不属于任何模块
const SHELL = ['/', '/approvals', '/messages'];
const PATHS = [...SHELL, ...MODULES.flatMap((m) => m.routes.map((r) => r.path!))];
const MENU = MODULES.flatMap((m) => m.menu);
const exists = (to: string) => PATHS.some((p) => matchPath({ path: p, end: true }, to.split(/[?#]/)[0]));

test('操作说明和版本说明里的每个链接都指向存在的页面', () => {
  const links = [...allSteps().map((s) => s.to), ...RELEASES.flatMap((r) => r.groups.flatMap((g) => g.items.map((i) => i.to)))].filter((x): x is string => Boolean(x));
  expect(links.length).toBeGreaterThan(20);
  expect(links.filter((to) => !exists(to))).toEqual([]);
});

test('步骤的权限与该页菜单的权限一致，没有权限的人不显示「打开」', () => {
  const wrong = allSteps().filter((s) => s.to).flatMap((s) => {
    const m = MENU.find((i) => i.to === s.to!.split(/[?#]/)[0]);
    return m && m.perm !== s.perm ? [`${s.title} ${s.to}: ${s.perm ?? '无'} ≠ ${m.perm ?? '无'}`] : [];
  });
  expect(wrong).toEqual([]);
});

test('帮助菜单顺序：操作说明、问题反馈、版本说明、数据库查询、项目文档', () => {
  expect(helpModule.menu.map((m) => m.name)).toEqual(['操作说明', '问题反馈', '版本说明', '数据库查询', '项目文档']);
});

test('普通用户看操作说明：按主题切换，关掉示例模块后不显示它，没有权限的步骤不显示「打开」', async () => {
  const user = userEvent.setup();
  useSession.getState().login('U01');
  openApp('/help/guide?t=example', 'U04');
  expect(await screen.findByRole('heading', { level: 2, name: '示例模块' })).toBeInTheDocument();
  const mine = screen.getByText('1. 登记与提交').closest('li')!;
  expect(within(mine).getByRole('link', { name: '打开 →' })).toHaveAttribute('href', '/example/mine');
  const all = screen.getByText('2. 查看全部与导出').closest('li')!;
  expect(within(all).queryByRole('link', { name: '打开 →' })).toBeNull();

  const nav = screen.getByRole('navigation', { name: '操作说明主题' });
  await user.click(within(nav).getByRole('link', { name: '状态说明' }));
  expect(await screen.findByRole('heading', { level: 2, name: '状态说明' })).toBeInTheDocument();
  expect(screen.getAllByText('已驳回').length).toBeGreaterThan(0);
});

test('关掉示例模块后，操作说明里不再有这个主题', async () => {
  useSession.getState().login('U01');
  await put<Settings>('/settings', { features: { example: false } });
  openApp('/help/guide', 'U04');
  const nav = await screen.findByRole('navigation', { name: '操作说明主题' });
  expect(within(nav).queryByRole('link', { name: '示例模块' })).toBeNull();
  expect(within(nav).getByRole('link', { name: '系统管理' })).toBeInTheDocument();
});

test('版本说明列出 v1.0', async () => {
  openApp('/help/releases', 'U05');
  expect(await screen.findByText('v1.0')).toBeInTheDocument();
  expect(screen.getByText('2026-10-31')).toBeInTheDocument();
});
