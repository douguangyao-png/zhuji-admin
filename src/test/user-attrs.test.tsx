import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { get, post, put } from '@/api/http';
import type { Page, User, UserAttrDef } from '@/api/types';
import { useSession } from '@/core/session';
import { freshDb, openApp } from './render';

beforeEach(() => { freshDb(); useSession.getState().logout(); });

type Row = User & { roleNames: string[]; unitName: string };
const users = async (q: Record<string, unknown> = {}) => (await get<Page<Row>>('/org/users', { size: 500, ...q })).items;

/** 建一个下拉属性「岗位级别」和一个多选属性「技能」，给 user 填上 */
async function setup() {
  useSession.getState().login('U01');
  const level = await post<UserAttrDef>('/user-attrs', { name: '岗位级别', type: 'select', options: ['初级', '中级', '高级'] });
  const skill = await post<UserAttrDef>('/user-attrs', { name: '技能', type: 'multi', options: ['驾驶', '急救', '外语'] });
  const u = (await users()).find((x) => x.username === 'user')!;
  await put(`/org/users/${u.id}`, { attrs: { [level.key]: '中级', [skill.key]: '急救，外语' } });
  return { level, skill, u };
}

test('扩展属性按类型校验：下拉要是选项之一，多选按顿号存，日期格式', async () => {
  const { level, skill, u } = await setup();
  const after = (await users()).find((x) => x.id === u.id)!;
  expect(after.attrs).toMatchObject({ [level.key]: '中级', [skill.key]: '急救、外语' });
  await expect(put(`/org/users/${u.id}`, { attrs: { [level.key]: '特级' } })).rejects.toThrow('岗位级别没有选项「特级」');
  const day = await post<UserAttrDef>('/user-attrs', { name: '入职日期', type: 'date' });
  await expect(put(`/org/users/${u.id}`, { attrs: { [day.key]: '2026/10/01' } })).rejects.toThrow('入职日期要填日期');
});

test('按扩展属性筛选：逗号多选，多选属性含其中任一项就算；已填的值去重给筛选项', async () => {
  const { level, skill, u } = await setup();
  expect((await users({ [level.key]: '中级' })).map((x) => x.id)).toEqual([u.id]);
  expect((await users({ [level.key]: '初级,中级' })).map((x) => x.id)).toEqual([u.id]);
  expect((await users({ [skill.key]: '外语' })).map((x) => x.id)).toEqual([u.id]);
  expect(await users({ [level.key]: '高级' })).toEqual([]);
  const opts = await get<Record<string, string[]>>('/org/users/attrs');
  expect(opts[level.key]).toEqual(['中级']);
  expect(opts[skill.key]).toEqual(['驾驶', '急救', '外语']);
});

test('导入：扩展属性填了写入，空着不改；不在选项里的整批不导', async () => {
  const { level, u } = await setup();
  await post('/org/users/import', { rows: [
    { no: u.no, name: u.name, unitName: u.unitName },
    { no: 'E9201', name: '导入人员', unitName: '财务部', attrs: { [level.key]: '高级' } },
  ] });
  const after = await users();
  expect(after.find((x) => x.id === u.id)!.attrs?.[level.key]).toBe('中级');
  expect(after.find((x) => x.no === 'E9201')!.attrs?.[level.key]).toBe('高级');
  await expect(post('/org/users/import', { rows: [{ no: 'E9202', name: 'x', unitName: '财务部', attrs: { [level.key]: '特级' } }] })).rejects.toThrow('第 1 行：岗位级别没有选项「特级」');
});

test('人员页：扩展属性出现在筛选条、详情和编辑里', async () => {
  const { u } = await setup();
  openApp('/system/users', 'U01');
  expect((await screen.findAllByText('岗位级别')).length).toBeGreaterThan(0);
  const row = await waitFor(() => { const r = screen.queryAllByText(u.name).map((e) => e.closest('tr')).find(Boolean); if (!r) throw new Error('没找到人员行'); return r as HTMLElement; });
  fireEvent.click(within(row).getByRole('button', { name: '详情' }));
  const dlg = await screen.findByRole('dialog');
  expect(within(dlg).getByText('岗位级别')).toBeInTheDocument();
  expect(within(dlg).getByText('中级')).toBeInTheDocument();
  fireEvent.click(within(dlg).getByRole('button', { name: '编辑' }));
  const edit = await screen.findByRole('dialog');
  expect(within(edit).getByLabelText(/岗位级别/)).toHaveValue('中级');
});
