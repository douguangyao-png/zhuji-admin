import { table } from '@/api/mock/db';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { coreApi } from '@/api/core';
import { get, post, put } from '@/api/http';
import type { AuditLog, Page, Settings } from '@/api/types';
import { useSession } from '@/core/session';
import { charClasses, passwordProblems, policyOf } from '@/lib/password';
import { freshDb, openApp } from './render';
const nameOf = (id: string) => table<{ id: string; name: string }>('org_user').get(id)!.name;


beforeEach(() => { freshDb(); useSession.getState().logout(); });

const as = (id: string) => useSession.getState().login(id);

test('复杂度规则：默认 8 位、四类里至少三类、不能包含工号或登录名', () => {
  const p = policyOf();
  expect(p).toEqual({ minLength: 8, minClasses: 3, notUserNo: true, history: 3, maxAgeDays: 0 });
  expect(passwordProblems('Abcdef12', p, 'admin', 'E1001')).toEqual([]);
  expect(passwordProblems('abc-def-12', p, 'admin', 'E1001')).toEqual([]);
  expect(passwordProblems('demo', p, 'admin', 'E1001')).toEqual(['至少 8 位', '大写字母、小写字母、数字、符号至少包含 3 类']);
  expect(passwordProblems('E1001-ab', p, 'admin', 'e1001-AB')).toEqual(['不能包含工号或登录名']);
  expect(passwordProblems('Xadmin-2026', p, 'admin', 'E1001')).toEqual(['不能包含工号或登录名']);
  expect(passwordProblems('Ab-E1001x', p, 'admin', 'e1001')).toEqual(['不能包含工号或登录名']);
  expect(passwordProblems('Ab-cd-12', p, 'ab', 'E1')).toEqual([]);
  expect(passwordProblems('Abc def12', p, 'admin')).toEqual(['不能有空格']);
  expect(charClasses('aA1!')).toBe(4);
});

test('本人改密码：要原密码，按策略校验，不能与最近 3 次相同，改完旧密码失效', async () => {
  as('U02');
  await expect(coreApi.changePassword('bad', 'Abcdef12')).rejects.toThrow('原密码不正确');
  await expect(coreApi.changePassword('demo', 'abc')).rejects.toThrow('新密码至少 8 位');
  await coreApi.changePassword('demo', 'Pass-0001');
  await coreApi.changePassword('Pass-0001', 'Pass-0002');
  await expect(coreApi.changePassword('Pass-0002', 'demo')).rejects.toThrow();
  await expect(coreApi.changePassword('Pass-0002', 'Pass-0001')).rejects.toThrow('不能与最近 3 次用过的密码相同');
  await expect(coreApi.login('manager', 'demo')).rejects.toThrow('用户名或密码不正确');
  expect((await coreApi.login('manager', 'Pass-0002')).id).toBe('U02');
});

test('顶栏「修改密码」：规则逐条提示，提交后生效', async () => {
  openApp('/', 'U02');
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(nameOf('U02')) }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '修改密码' }));
  fireEvent.change(screen.getByLabelText('原密码'), { target: { value: 'demo' } });
  fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'abc' } });
  expect(await screen.findByText('至少 8 位；大写字母、小写字母、数字、符号至少包含 3 类')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'Newpass-01' } });
  fireEvent.change(screen.getByLabelText('再输一次新密码'), { target: { value: 'Newpass-01' } });
  fireEvent.click(screen.getByRole('button', { name: '修改密码' }));
  await waitFor(() => expect(screen.queryByLabelText('原密码')).not.toBeInTheDocument());
  expect((await coreApi.login('manager', 'Newpass-01')).id).toBe('U02');
});

test('管理员重置成基础配置里的默认密码；前 N 次登录只提示可忽略，超过 N 次必须改', async () => {
  as('U01');
  const { password } = await coreApi.resetPassword('U02');
  expect(password).toBe('Admin@2026');
  const logs = await get<Page<AuditLog>>('/audit', { q: '重置密码' });
  expect(logs.items[0]).toMatchObject({ action: '重置密码', target: nameOf('U02') });
  // 基础配置里改默认密码和可忽略次数
  expect((await get<{ defaultPassword: string }>('/settings/default-password')).defaultPassword).toBe('Admin@2026');
  expect(await get<Settings>('/settings')).not.toHaveProperty('defaultPassword');
  await expect(put('/settings', { defaultPassword: 'abc' })).rejects.toThrow('默认密码至少 8 位');
  await expect(put('/settings', { defaultPasswordLogins: 0 })).rejects.toThrow('填 1 到 20');
  await put('/settings', { defaultPassword: 'Hospital#2026', defaultPasswordLogins: 2 });
  expect((await coreApi.resetPassword('U02')).password).toBe('Hospital#2026');
  for (let i = 1; i <= 2; i++) {
    await coreApi.login('manager', 'Hospital#2026');
    as('U02');
    const me = await coreApi.me();
    expect(me.passwordChange).toBe('default');
    expect(me.passwordDefault).toEqual({ logins: i, max: 2 });
  }
  await coreApi.login('manager', 'Hospital#2026');
  expect((await coreApi.me()).passwordChange).toBe('default-force');
  await coreApi.changePassword('Hospital#2026', 'Mine-2026');
  const me = await coreApi.me();
  expect(me.passwordChange).toBeNull();
  expect(me.passwordDefault).toBeNull();
});

test('用默认密码登录：每次登录都提示修改，点以后再说可进系统', async () => {
  as('U01');
  await coreApi.resetPassword('U02');
  await coreApi.login('manager', 'Admin@2026');
  openApp('/', 'U02');
  const dlg = await screen.findByRole('dialog', { name: /请修改默认密码/ });
  expect(within(dlg).getByText(/已登录 1 次/)).toBeInTheDocument();
  fireEvent.click(within(dlg).getByRole('button', { name: '以后再说' }));
  expect(await screen.findByText(new RegExp(`${nameOf('U02')}，`))).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: /请修改默认密码/ })).not.toBeInTheDocument();
});

test('默认密码用满可忽略次数：整页必须改，只能改密码或退出到首页', async () => {
  as('U01');
  await put('/settings', { defaultPasswordLogins: 1 });
  await coreApi.resetPassword('U02');
  await coreApi.login('manager', 'Admin@2026');
  await coreApi.login('manager', 'Admin@2026');
  openApp('/', 'U02');
  expect(await screen.findByRole('heading', { name: '修改密码' })).toBeInTheDocument();
  expect(screen.getByText(/已用默认密码登录 2 次仍未修改.*必须修改密码/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '退出到首页' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('原密码'), { target: { value: 'Admin@2026' } });
  fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'Mine-2026' } });
  fireEvent.change(screen.getByLabelText('再输一次新密码'), { target: { value: 'Mine-2026' } });
  fireEvent.click(screen.getByRole('button', { name: '修改密码' }));
  expect(await screen.findByText(new RegExp(`${nameOf('U02')}，`))).toBeInTheDocument();
});

test('新建人员首次登录必须改密码；只有系统管理员能重置', async () => {
  as('U01');
  const u = await post<{ id: string }>('/org/users', { username: 'newbie', name: '新同事', roleKeys: ['staff'], unitId: 'C0' });
  as(u.id);
  expect((await coreApi.me()).passwordChange).toBe('must');
  as('U04');
  await expect(coreApi.resetPassword('U02')).rejects.toThrow();
});

test('演示环境：demo 密码不因太弱被强制修改', async () => {
  as('U02');
  expect((await coreApi.me()).passwordChange).toBeNull();
});

test('密码策略可改：改成至少 10 位后 9 位不行，记操作日志；越界拒绝', async () => {
  as('U01');
  await put<Settings>('/settings', { passwordMinLength: 10 });
  expect((await get<Settings>('/settings')).passwordMinLength).toBe(10);
  const logs = await get<Page<AuditLog>>('/audit', { q: '密码策略' });
  expect(logs.items[0]).toMatchObject({ action: '修改密码策略', target: '至少 10 位，至少 3 类字符，不能包含工号或登录名，不能与最近 3 次相同，不过期' });
  await expect(coreApi.changePassword('demo', 'Abcdef-12')).rejects.toThrow('新密码至少 10 位');
  await expect(put('/settings', { passwordMinClasses: 5 })).rejects.toThrow('字符类别填 1 到 4');
});

test('系统设置页能看到密码策略并保存', async () => {
  openApp('/system/security');
  const len = await screen.findByLabelText('最短长度');
  fireEvent.change(len, { target: { value: '12' } });
  fireEvent.click(within(len.closest('.card') as HTMLElement).getByRole('button', { name: '保存' }));
  await waitFor(async () => expect((await get<Settings>('/settings')).passwordMinLength).toBe(12));
});
