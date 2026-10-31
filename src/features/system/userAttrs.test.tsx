import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { del, get, post, put } from '@/api/http';
import type { Page, User, UserAttrDef } from '@/api/types';
import { useSession } from '@/core/session';
import { freshDb, openApp } from '@/test/render';
import { DELETE_ATTR_TEXT } from './UserAttrsPage';

// 人员属性：内置（账号、姓名、性别、证件号码、手机号）不可删除；扩展属性可作废、启用、删除
beforeEach(() => { freshDb(); useSession.getState().logout(); });
afterEach(cleanup);
const as = (id: string) => useSession.getState().login(id);
const status = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { return (e as { status: number }).status; } };
const someone = async () => (await get<Page<User>>('/org/users', { size: 500 })).items.find((u) => u.username === 'user')!;

test('内置属性是账号、姓名、性别、证件号码、手机号：只读，删除和作废返回 400', async () => {
  as('U01');
  const base = await get<UserAttrDef[]>('/user-attrs/builtin');
  expect(base.map((d) => d.name)).toEqual(['账号', '姓名', '性别', '证件号码', '手机号']);
  expect(base.every((d) => d.builtin && d.enabled)).toBe(true);
  for (const d of base) {
    expect(await status(del(`/user-attrs/${d.key}`))).toBe(400);
    expect(await status(put(`/user-attrs/${d.key}`, { status: 'void' }))).toBe(400);
  }
  expect(await get<UserAttrDef[]>('/user-attrs')).toEqual([]);
});

test('扩展属性作废后不能再填，已填的值保留，启用后恢复', async () => {
  as('U01');
  const org = await post<UserAttrDef>('/user-attrs', { name: '认证机构', type: 'text', maxLen: 64 });
  expect(org.status).toBe('active');
  const u = await someone();
  await put(`/org/users/${u.id}`, { attrs: { [org.key]: '行业协会' } });
  const off = await put<UserAttrDef>(`/user-attrs/${org.key}`, { status: 'void' });
  expect(off).toMatchObject({ status: 'void', enabled: false });
  await expect(put(`/org/users/${u.id}`, { attrs: { [org.key]: 'x' } })).rejects.toThrow('人员属性「认证机构」已作废');
  expect(((await someone()).attrs ?? {})[org.key]).toBe('行业协会');
  const on = await put<UserAttrDef>(`/user-attrs/${org.key}`, { status: 'active' });
  expect(on).toMatchObject({ status: 'active', enabled: true });
  await put(`/org/users/${u.id}`, { attrs: { [org.key]: '学会' } });
});

test('删除扩展属性：属性和所有人的值一起清除', async () => {
  as('U01');
  const org = await post<UserAttrDef>('/user-attrs', { name: '认证机构', type: 'text', maxLen: 64 });
  const u = await someone();
  await put(`/org/users/${u.id}`, { attrs: { [org.key]: '行业协会' } });
  expect(await del<boolean>(`/user-attrs/${org.key}`)).toBe(true);
  expect((await get<UserAttrDef[]>('/user-attrs')).some((d) => d.key === org.key)).toBe(false);
  expect(((await someone()).attrs ?? {})[org.key]).toBeUndefined();
  expect(await status(del(`/user-attrs/${org.key}`))).toBe(404);
});

test('人员属性页：内置行没有按钮；扩展属性作废、启用、删除（先确认）', async () => {
  as('U01');
  const org = await post<UserAttrDef>('/user-attrs', { name: '认证机构', type: 'text', maxLen: 64 });
  openApp('/system/user-attrs', 'U01');
  const row = async (name: string) => (await screen.findByText(name, { selector: 'b' }, { timeout: 8000 })).closest('tr')!;
  for (const n of ['账号', '姓名', '性别', '证件号码', '手机号']) {
    const r = await row(n);
    expect(within(r).getByText('内置')).toBeInTheDocument();
    expect(within(r).queryByRole('button')).not.toBeInTheDocument();
  }
  const r = await row('认证机构');
  fireEvent.click(within(r).getByRole('button', { name: '作废' }));
  fireEvent.click(await within(r).findByRole('button', { name: '启用' }));
  await waitFor(() => expect(within(r).getByRole('button', { name: '作废' })).toBeInTheDocument());
  fireEvent.click(within(r).getByRole('button', { name: '删除 认证机构' }));
  const dlg = await screen.findByRole('alertdialog');
  expect(within(dlg).getByText(DELETE_ATTR_TEXT)).toBeInTheDocument();
  expect((await get<UserAttrDef[]>('/user-attrs')).some((d) => d.key === org.key)).toBe(true);
  fireEvent.click(within(dlg).getByRole('button', { name: '删除' }));
  await waitFor(() => expect(screen.queryByText('认证机构', { selector: 'b' })).not.toBeInTheDocument());
});
