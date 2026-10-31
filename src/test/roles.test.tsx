import { screen } from '@testing-library/react';
import { get, post, put } from '@/api/http';
import { table } from '@/api/mock/db';
import type { Page, Role, User, WfInstance } from '@/api/types';
import { useSession } from '@/core/session';
import type { ExampleItem } from '@/features/example/types';
import { freshDb, openApp } from './render';

// 内置三个角色、按权限审批、数据范围、导入导出打印的操作权限
beforeEach(() => freshDb());

const as = (id: string) => useSession.getState().login(id);
const roles = () => table<Role & { id: string }>('org_role');
const addRole = (key: string, perms: string[], extra: Partial<Role> = {}) =>
  roles().insert({ id: key, key, name: key, desc: '', builtin: false, perms, ...extra });

test('内置角色是系统管理员、业务管理员、普通用户，不能改名、不能删除', async () => {
  as('U01');
  const list = await get<(Role & { users: number })[]>('/roles');
  expect(list.map((r) => r.name)).toEqual(['系统管理员', '业务管理员', '普通用户']);
  expect(list.every((r) => r.builtin)).toBe(true);
  await expect(put('/roles/manager', { name: '改名' })).rejects.toThrow('内置角色不能修改名称或删除');
  await expect(put('/roles/admin', { perms: [] })).rejects.toThrow('系统管理员的权限不能修改');
});

test('按权限审批：自建角色勾上示例审批也进 1 万元以上那一级的审批人', async () => {
  addRole('rApprover', ['example:view', 'example:approve']);
  table<User>('org_user').update('U05', { roleKeys: ['user', 'rApprover'] });
  as('U04');
  const x = await post<ExampleItem>('/example', { title: '大额采购', category: '1', amount: 20000, date: '2026-10-31' });
  await post(`/example/${x.id}/submit`);
  const wf = table<WfInstance>('wf_instance').find((w) => w.bizId === x.id)!;
  expect(wf.nodes.map((n) => n.name)).toEqual(['部门负责人审核', '业务管理员审批（金额 1 万元以上）']);
  expect(wf.nodes[0].approverIds).toEqual(['U03']);
  expect(wf.nodes[1].approverIds).toEqual(expect.arrayContaining(['U02', 'U05']));
});

test('数据范围：业务管理员改成「本部门」后，示例登记只剩本部门和自己的', async () => {
  as('U01');
  await put('/roles/manager', { dataScope: 'unit' });
  as('U02');
  const unit = table<User>('org_user').get('U02')!.unitId;
  const rows = (await get<Page<ExampleItem>>('/example', { size: 500 })).items;
  expect(rows.every((x) => x.ownerId === 'U02' || x.unitId === unit)).toBe(true);
  as('U01');
  await put('/roles/manager', { dataScope: 'all' });
  as('U02');
  expect((await get<Page<unknown>>('/example', { size: 500 })).total).toBeGreaterThan(rows.length);
});

test('数据范围：本部门及下级沿组织树展开，自定义按勾选的组织', async () => {
  const units = table<{ id: string; parentId: string | null }>('org_unit');
  units.insert({ id: 'Dsub', parentId: table<User>('org_user').get('U03')!.unitId } as never);
  table<User>('org_user').insert({ id: 'Usub', username: 'usub', name: '下级部门的人', no: 'X1', unitId: 'Dsub', roleKeys: ['user'], active: true });
  const { scopeUnitsOf } = await import('@/api/mock/services');
  addRole('rTree', ['example:approve'], { dataScope: 'unitTree' });
  addRole('rCustom', ['example:approve'], { dataScope: 'custom', dataUnits: ['D05'] });
  const u = { ...table<User>('org_user').get('U03')!, roleKeys: ['rTree'] };
  expect([...scopeUnitsOf(u)!].sort()).toEqual([u.unitId, 'Dsub'].sort());
  expect([...scopeUnitsOf({ ...u, roleKeys: ['rTree', 'rCustom'] })!]).toContain('D05');
  expect(scopeUnitsOf({ ...u, roleKeys: ['rTree', 'manager'] })).toBeNull();
});

test('操作权限：去掉导出、导入后列表页不显示这两个按钮，导入接口返回 403', async () => {
  as('U01');
  const m = (await get<Role[]>('/roles')).find((r) => r.key === 'manager')!;
  await put('/roles/manager', { perms: m.perms.filter((p) => p !== 'op:export' && p !== 'op:import') });
  as('U02');
  await expect(post('/example/import', { rows: [] })).rejects.toMatchObject({ status: 403 });
  openApp('/example', 'U02');
  expect(await screen.findByRole('button', { name: '新增登记' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /导出/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /导入/ })).not.toBeInTheDocument();
});

test('删除自建角色：被审批流引用时不能删；没引用的删掉，只有这个角色的人改为普通用户', async () => {
  addRole('rTmp', ['example:view']);
  table<User>('org_user').update('U05', { roleKeys: ['rTmp'] });
  as('U01');
  const wf = (await get<{ type: string; name: string; nodes: unknown[] }[]>('/wf-defs')).find((w) => w.type === 'example')!;
  await put('/wf-defs/example', { ...wf, nodes: [{ name: '临时审核', approver: { kind: 'role', role: 'rTmp' } }] });
  await expect(post('/roles/rTmp', {})).rejects.toBeTruthy();
  const { del } = await import('@/api/http');
  await expect(del('/roles/rTmp')).rejects.toThrow('正在使用');
  await put('/wf-defs/example', wf);
  expect(await del<{ removed: number; toUser: number }>('/roles/rTmp')).toEqual({ removed: 1, toUser: 1 });
  expect(table<User>('org_user').get('U05')!.roleKeys).toEqual(['user']);
});
