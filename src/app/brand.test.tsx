import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, get, put } from '@/api/http';
import { Root } from '@/app/Root';
import { useSession } from '@/core/session';
import type { Settings } from '@/api/types';
import { freshDb, openApp } from '@/test/render';
import { APP } from '@/app.config';

// 界面字样统一取基础配置的「产品名称」「使用单位名称」
beforeEach(() => { freshDb(); window.location.hash = '#/'; document.title = ''; });

const rename = async () => {
  useSession.getState().login('U01');
  await put<Settings>('/settings', { productName: '协同办公平台', orgName: '示范单位' });
  useSession.getState().logout();
};

test('产品名称有默认值，可改，空和超长拒绝，使用单位名称同样', async () => {
  useSession.getState().login('U01');
  expect((await get<Settings>('/settings')).productName).toBe(APP.productName);
  await expect(put('/settings', { productName: '  ' })).rejects.toMatchObject({ status: 422, message: '产品名称不能为空' });
  await expect(put('/settings', { productName: '名'.repeat(41) })).rejects.toMatchObject({ status: 422, message: '产品名称最长 40 个字' });
  await expect(put('/settings', { orgName: '名'.repeat(61) })).rejects.toBeInstanceOf(ApiError);
  const r = await put<Settings>('/settings', { productName: ' 协同办公平台 ', orgName: '示范单位' });
  expect(r).toMatchObject({ productName: '协同办公平台', orgName: '示范单位' });
});

test('登录页的系统名称和单位名称跟着基础配置走', async () => {
  await rename();
  openApp('/login', null);
  expect(await screen.findByText('协同办公平台', {}, { timeout: 8000 })).toBeInTheDocument();
  expect(screen.getByText('示范单位')).toBeInTheDocument();
  expect(screen.queryByText(APP.productName)).not.toBeInTheDocument();
});

test('浏览器标题跟着基础配置走', async () => {
  await rename();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Root /></QueryClientProvider>);
  await waitFor(() => expect(document.title).toBe('协同办公平台'), { timeout: 15000 });
});

test('登录后侧栏顶部显示产品名称', async () => {
  await rename();
  openApp('/', 'U01');
  expect(await screen.findByTitle('协同办公平台', {}, { timeout: 15000 })).toBeInTheDocument();
});
