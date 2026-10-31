import { fireEvent, screen, within } from '@testing-library/react';
import { useSession } from '@/core/session';
import { freshDb, openApp } from './render';
import '@/app/modules';

beforeEach(() => { freshDb(); useSession.getState().login('U01'); document.documentElement.classList.remove('nav-c'); });
afterEach(() => document.documentElement.classList.remove('nav-c'));

test('收起菜单按钮只有图标，没有可见文字（读屏仍念「收起菜单」）', async () => {
  openApp('/');
  const btn = await screen.findByRole('button', { name: '收起菜单' });
  expect(btn.textContent).toBe('收起菜单');
  expect(btn.querySelector('.sr-only')).not.toBeNull();
  expect(btn.querySelector('svg')).not.toBeNull();
});

test('菜单收起后，鼠标移到一级菜单图标上，右边弹出一级菜单名和二级菜单；移开后消失', async () => {
  openApp('/');
  const nav = await screen.findByRole('navigation', { name: '主导航' });
  document.documentElement.classList.add('nav-c');
  const grp = await within(nav).findByRole('button', { name: /示例模块/ });
  fireEvent.mouseEnter(grp);
  const fly = await screen.findByRole('menu', { name: '子菜单' });
  expect(within(fly).getAllByRole('link').length).toBeGreaterThan(1);
  expect(within(fly).getByRole('link', { name: '示例登记' })).toBeInTheDocument();
  fireEvent.mouseLeave(nav);
  expect(screen.queryByRole('menu', { name: '子菜单' })).toBeNull();
});

test('菜单没收起时鼠标移上去不弹子菜单', async () => {
  openApp('/');
  const nav = await screen.findByRole('navigation', { name: '主导航' });
  fireEvent.mouseEnter(await within(nav).findByRole('button', { name: /示例模块/ }));
  expect(screen.queryByRole('menu', { name: '子菜单' })).toBeNull();
});

test('收起后弹出的一级菜单名和首页、审批、消息都是能点的链接', async () => {
  openApp('/');
  const nav = await screen.findByRole('navigation', { name: '主导航' });
  document.documentElement.classList.add('nav-c');
  fireEvent.mouseEnter(nav.querySelector('a.side-g[href="/messages"]')!);
  const t1 = (await screen.findByRole('menu', { name: '子菜单' })).querySelector('a.fly-t')!;
  expect(t1).toHaveAttribute('href', '/messages');
  fireEvent.mouseEnter(await within(nav).findByRole('button', { name: /示例模块/ }));
  const fly = await screen.findByRole('menu', { name: '子菜单' });
  const title = fly.querySelector('a.fly-t') as HTMLAnchorElement;
  expect(title).not.toBeNull();
  expect(title.getAttribute('href')).toMatch(/^\/example/);
});

