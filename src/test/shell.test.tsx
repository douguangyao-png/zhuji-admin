import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { get } from '@/api/http';
import { useSession } from '@/core/session';
import { freshDb, openApp } from './render';

beforeEach(() => freshDb());

test('打开登录页 /login，没有演示账号入口，用账号密码登录', async () => {
  useSession.getState().logout();
  const { render } = await import('@testing-library/react');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { createMemoryRouter, RouterProvider } = await import('react-router-dom');
  const { routes } = await import('@/app/App');
  render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/login'] })} /></QueryClientProvider>);
  fireEvent.change(await screen.findByLabelText('用户名'), { target: { value: 'admin' } });
  expect(screen.queryByText('演示账号')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /演示账号|业务管理员|系统管理员/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'demo' } });
  fireEvent.click(screen.getByRole('button', { name: /^登录/ }));
  expect(await screen.findByText(/系统管理员，/)).toBeInTheDocument();
});

test('系统管理员看得到全部模块', async () => {
  openApp('/');
  const nav = await screen.findByRole('navigation', { name: '主导航' });
  for (const name of ['示例模块', '系统管理', '帮助']) expect(await within(nav).findByRole('button', { name })).toBeInTheDocument();
});

test('普通用户没有系统管理菜单，直接打开管理页回到首页', async () => {
  const r = openApp('/system/roles', 'U04');
  await waitFor(() => expect(r.state.location.pathname).toBe('/'));
  expect(await screen.findByRole('button', { name: '示例模块' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '系统管理' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '角色权限' })).not.toBeInTheDocument();
});

test('业务管理员：系统管理下只有操作日志；直接打开人员页回首页', async () => {
  const r = openApp('/system/users', 'U02');
  await waitFor(() => expect(r.state.location.pathname).toBe('/'));
  expect(await screen.findByRole('link', { name: '操作日志' })).toBeInTheDocument();
  for (const name of ['人员', '角色权限', '审批流', '字典', '基础配置', '功能菜单', '接口配置']) expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
});

test('右上角：消息铃铛显示未读数，账号菜单有修改密码和退出登录，退出后回到登录页', async () => {
  openApp('/', 'U01');
  const bell = await screen.findByRole('link', { name: /^消息，\d+ 条未读/ });
  await waitFor(() => expect(bell.textContent).toMatch(/\d/));
  fireEvent.click(screen.getByRole('button', { name: /系统管理员/ }));
  expect(await screen.findByRole('menuitem', { name: '修改密码' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));
  await waitFor(() => expect(useSession.getState().userId).toBeNull());
  expect(await screen.findByLabelText('用户名')).toBeInTheDocument();
});

test('角色权限：给普通用户勾上示例审批后保存', async () => {
  openApp('/system/roles');
  fireEvent.click(await screen.findByRole('button', { name: /普通用户/ }));
  const chip = await screen.findByRole('button', { name: '审批', pressed: false });
  fireEvent.click(chip);
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(async () => {
    const roles = await get<{ key: string; perms: string[] }[]>('/roles');
    expect(roles.find((r) => r.key === 'user')!.perms).toContain('example:approve');
  });
});
