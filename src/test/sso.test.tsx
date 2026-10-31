import { table } from '@/api/mock/db';
import { fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { coreApi } from '@/api/core';
import { routes } from '@/app/App';
import { useSession } from '@/core/session';
import { freshDb } from './render';
const nameOf = (id: string) => table<{ id: string; name: string }>('org_user').get(id)!.name;


beforeEach(() => { freshDb(); useSession.getState().logout(); });

const open = (path: string) => render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} /></QueryClientProvider>);

test('CAS：登录页跳模拟认证页，按工号认证后回来登录', async () => {
  open('/');
  fireEvent.click(await screen.findByRole('button', { name: /统一身份认证（CAS）登录/ }));
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`E1001.*${nameOf('U02')}`) }));
  expect(await screen.findByText(new RegExp(`${nameOf('U02')}，`))).toBeInTheDocument();
  expect(useSession.getState().userId).toBe('U02');
});

test('工号在本系统里没有人员时提示开通，不登录', async () => {
  open('/sso?provider=cas&ticket=ST-E9999-abc');
  expect(await screen.findByRole('alert')).toHaveTextContent('E9999 在本系统中没有对应人员');
  expect(useSession.getState().userId).toBeNull();
});

test('平台令牌按工号登录；未启用的方式拒绝', async () => {
  expect((await coreApi.ssoLogin('platform', { token: 'P.E1002.1760500000' })).name).toBe(nameOf('U03'));
  await expect(coreApi.ssoLogin('oidc', { code: 'C-E1002-x' })).rejects.toThrow('未启用');
  await expect(coreApi.ssoLogin('cas', { ticket: 'bad' })).rejects.toThrow('票据无效');
});
