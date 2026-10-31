import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { coreApi } from '@/api/core';
import { get, post, put } from '@/api/http';
import { setCaptchaAutoPass } from '@/api/captcha';
import type { AuditLog, LoginLog, Page, Settings } from '@/api/types';
import { useSession } from '@/core/session';
import { freshDb, openApp } from './render';

// 安全策略：连续输错锁定、登录日志、同账号踢下线、越权提示、页面水印
beforeEach(() => { freshDb(); useSession.getState().logout(); setCaptchaAutoPass(true); });
const as = (id: string) => useSession.getState().login(id);
const logins = async (q: Record<string, unknown> = {}) => { as('U01'); return (await get<Page<LoginLog>>('/audit/logins', { size: 100, ...q })).items; };

test('连续输错达到次数后锁定，锁定期间密码对了也进不去；成功、失败、锁定、退出都进登录日志', async () => {
  as('U01');
  await put('/settings', { lockAfter: 3, lockMinutes: 10 });
  useSession.getState().logout();
  await expect(coreApi.login('user', 'bad1')).rejects.toThrow('用户名或密码不正确');
  await expect(coreApi.login('user', 'bad2')).rejects.toThrow('用户名或密码不正确');
  await expect(coreApi.login('user', 'bad3')).rejects.toThrow('账号已锁定 10 分钟');
  await expect(coreApi.login('user', 'demo')).rejects.toThrow(/已锁定，请 \d+ 分钟后再试/);
  const ok = await coreApi.login('admin', 'demo');
  expect(ok.sid).toBeTruthy();
  useSession.getState().login(ok.id, ok.sid);
  await coreApi.logout();
  const rows = await logins();
  expect(rows.filter((l) => l.username === 'user').map((l) => l.result).sort()).toEqual(['失败', '失败', '锁定', '锁定'].sort());
  expect(rows.find((l) => l.username === 'admin' && l.result === '成功')).toMatchObject({ source: '账号密码' });
  expect(rows.some((l) => l.username === 'admin' && l.result === '退出')).toBe(true);
  expect((await logins({ result: '锁定' })).every((l) => l.result === '锁定')).toBe(true);
  // 日志只读：没有改和删的接口
  await expect(put(`/audit/logins/${rows[0].id}`, {})).rejects.toMatchObject({ status: 404 });
});

test('安全策略校验范围，改动记操作日志', async () => {
  as('U01');
  await expect(put('/settings', { lockAfter: 0 })).rejects.toThrow('连续输错几次锁定填 1 到 20');
  await expect(put('/settings', { idleMinutes: 2000 })).rejects.toThrow('空闲自动退出分钟数填 0 到 1440');
  await expect(put('/settings', { sessionPolicy: 'x' })).rejects.toMatchObject({ status: 400 });
  const s = await put<Settings>('/settings', { idleMinutes: 10, sessionPolicy: 'kick', watermark: false });
  expect(s).toMatchObject({ idleMinutes: 10, sessionPolicy: 'kick', watermark: false });
  const log = await get<Page<AuditLog>>('/audit', { q: '修改安全策略' });
  expect(log.items.map((a) => a.target)).toEqual(expect.arrayContaining(['空闲自动退出分钟数 30 → 10', '同账号再次登录时踢掉旧会话', '关闭页面水印']));
  as('U04');
  await expect(put('/settings', { idleMinutes: 0 })).rejects.toMatchObject({ status: 403 });
});

test('踢掉旧会话：同账号在别处登录后，旧会话的请求按未登录处理', async () => {
  as('U01');
  await put('/settings', { sessionPolicy: 'kick' });
  useSession.getState().logout();
  const first = await coreApi.login('user', 'demo');
  useSession.getState().login(first.id, first.sid);
  expect((await coreApi.me()).user.username).toBe('user');
  const second = await coreApi.login('user', 'demo');
  expect(second.sid).not.toBe(first.sid);
  await expect(coreApi.me()).rejects.toMatchObject({ status: 401 });
  expect(useSession.getState().userId).toBeNull();
  useSession.getState().login(second.id, second.sid);
  expect((await coreApi.me()).user.username).toBe('user');
});

test('允许多处登录时，旧会话照常可用', async () => {
  const first = await coreApi.login('user', 'demo');
  useSession.getState().login(first.id, first.sid);
  await coreApi.login('user', 'demo');
  expect((await coreApi.me()).user.username).toBe('user');
});

test('前端日志上报接口：不登录也能报，敏感字段再脱敏一次', async () => {
  expect(await post('/client-logs', { level: 'error', message: '出错 13812345678', data: { password: 'x', token: 'y' }, page: '/', build: '' })).toBe(true);
  const { table } = await import('@/api/mock/db');
  const row = table<{ id: string; message: string; data: unknown }>('sys_client_log').all().at(-1)!;
  expect(row.message).toBe('出错 138****5678');
  expect(row.data).toEqual({ password: '***', token: '***' });
});

test('越权打开页面：回到首页并提示；登录后有水印，安全策略里关掉后没有', async () => {
  const r = openApp('/system/security', 'U04');
  await waitFor(() => expect(r.state.location.pathname).toBe('/'));
  expect(await screen.findByText('没有权限访问这个页面，已回到首页')).toBeInTheDocument();
  expect(document.querySelector('.watermark')?.textContent).toContain('user');

  cleanup();
  openApp('/system/security', 'U01');
  fireEvent.click(await screen.findByRole('switch', { name: '页面水印' }));
  const card = screen.getByText('登录与会话').closest('.card') as HTMLElement;
  fireEvent.click(within(card).getByRole('button', { name: '保存' }));
  await waitFor(async () => expect((await get<Settings>('/settings')).watermark).toBe(false));
  await waitFor(() => expect(document.querySelector('.watermark')).toBeNull());
});
