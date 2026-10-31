import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { get, post, put } from '@/api/http';
import { runSync } from '@/api/mock/usersync';
import type { Page, User, UserSyncConfig, UserSyncLine, UserSyncLog } from '@/api/types';
import { useSession } from '@/core/session';
import { freshDb, openApp } from './render';

beforeEach(() => freshDb());

const byNo = async (no: string) => (await get<Page<User>>('/org/users', { q: no })).items.find((u) => u.no === no);

test('立即同步：模拟数据新增 3、更新 E1003、跳过锁定的 E1004、2 条失败，记一条同步记录', async () => {
  openApp('/system/devices');
  fireEvent.click(await screen.findByRole('tab', { name: '人员同步' }));
  fireEvent.click(await screen.findByRole('button', { name: '立即同步' }));
  expect(await screen.findByText(/收到 7 条：新增 3，更新 1，无变化 0，跳过 1，失败 2/)).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: '下载明细' })).toBeInTheDocument();

  const added = await byNo('HR26001');
  expect(added).toMatchObject({ username: 'HR26001', name: '赵一鸣', gender: 'M', source: 'sync', roleKeys: ['user'] });
  expect(added?.lastSyncAt).toBeTruthy();
  expect(await byNo('E1003')).toMatchObject({ name: '周文', phone: '13900001003', source: 'sync' });
  expect((await byNo('E1004'))?.source ?? 'manual').toBe('manual');

  const [log] = await get<UserSyncLog[]>('/sys/user-sync/logs');
  expect(log).toMatchObject({ mode: 'manual', total: 7, added: 3, updated: 1, skipped: 1, failed: 2, ok: true });
  const d = await get<UserSyncLog & { lines: UserSyncLine[] }>(`/sys/user-sync/logs/${log.id}`);
  expect(d.lines.find((l) => l.no === 'E1004')).toMatchObject({ result: '跳过', reason: '已设为不允许接口修改' });
  expect(d.lines.find((l) => l.no === 'HR26005')?.reason).toBe('性别「未知」没有对应，请在取值映射里添加');
  expect(d.lines.find((l) => l.no === 'HR26004')?.reason).toBe('姓名为空');
  expect(d.lines.find((l) => l.no === 'HR26003')?.reason).toContain('先放在根组织');

  // 再同步一次都是无变化，不重复新建
  const again = await post<UserSyncLog>('/sys/user-sync/run');
  expect(again).toMatchObject({ added: 0, updated: 0, unchanged: 4, skipped: 1 });
});

test('取值映射：外部用 9 表示女，配置后按映射转换，新建的默认普通用户', async () => {
  useSession.getState().login('U01');
  const c = await put<UserSyncConfig>('/sys/user-sync', { genderMap: { 9: 'F' } });
  expect(c.genderMap['9']).toBe('F');
  const rows = [
    { no: 'X1', name: '王某', gender: '9', dept: '', phone: '' },
    { no: 'X2', name: '李某', gender: '', dept: '', phone: '' },
    { no: 'X3', name: '赵某', gender: '7', dept: '', phone: '' },
  ];
  const r = runSync(rows, 'push', c);
  expect(r).toMatchObject({ added: 2, failed: 1 });
  expect(await byNo('X1')).toMatchObject({ gender: 'F', roleKeys: ['user'] });
});

test('外部不再返回的人员：选停用时只停用接口同步来的、没锁定的', async () => {
  useSession.getState().login('U01');
  const c = await put<UserSyncConfig>('/sys/user-sync', { missing: 'disable' });
  runSync([{ no: 'Y1', name: '甲', gender: '', dept: '', phone: '' }, { no: 'Y2', name: '乙', gender: '', dept: '', phone: '' }], 'manual', c);
  const r = runSync([{ no: 'Y1', name: '甲', gender: '', dept: '', phone: '' }], 'manual', c);
  expect(r.disabled).toBe(1);
  expect((await byNo('Y2'))?.active).toBe(false);
  expect((await byNo('E1000'))?.active).toBe(true);
});

test('人员页：显示接口同步标签、按来源筛选、批量设为不允许接口修改', async () => {
  useSession.getState().login('U01');
  await post('/sys/user-sync/run');
  openApp('/system/users');
  fireEvent.click(await screen.findByRole('button', { name: '来源' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: '接口同步' }));
  fireEvent.click(screen.getByRole('button', { name: '来源' }));
  await waitFor(() => expect(screen.queryByText('系统管理员', { selector: 'b' })).not.toBeInTheDocument());
  expect((await screen.findAllByText('接口同步')).length).toBeGreaterThan(0);
  const id = (await byNo('HR26001'))!.id;
  fireEvent.click(screen.getByRole('checkbox', { name: `选择 ${id}` }));
  fireEvent.click(screen.getByRole('button', { name: '设为不允许接口修改' }));
  await waitFor(async () => expect((await byNo('HR26001'))?.syncLocked).toBe(true));
  const r = await post<UserSyncLog>('/sys/user-sync/run');
  expect(r.skipped).toBe(2);
});

test('编辑接口同步来的人员：改了会被覆盖的字段时提示勾选不允许接口修改', async () => {
  useSession.getState().login('U01');
  await post('/sys/user-sync/run');
  openApp('/system/users');
  fireEvent.change(await screen.findByPlaceholderText('姓名、工号、账号'), { target: { value: 'HR26001' } });
  const row = (await screen.findByText('赵一鸣')).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: '编辑' }));
  const dlg = await screen.findByRole('dialog');
  expect(within(dlg).getByText(/来源：接口同步 · 最后同步/)).toBeInTheDocument();
  expect(within(dlg).queryByRole('note')).not.toBeInTheDocument();
  fireEvent.change(within(dlg).getByLabelText('姓名'), { target: { value: '赵一明' } });
  expect(within(dlg).getByRole('note')).toHaveTextContent('下次同步会覆盖');
  fireEvent.click(within(dlg).getByRole('switch', { name: '不允许接口修改' }));
  expect(within(dlg).queryByRole('note')).not.toBeInTheDocument();
  fireEvent.click(within(dlg).getByRole('button', { name: '保存' }));
  await waitFor(async () => expect(await byNo('HR26001')).toMatchObject({ name: '赵一明', syncLocked: true }));
});
