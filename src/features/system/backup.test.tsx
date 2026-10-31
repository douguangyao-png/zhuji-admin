import { APP } from '@/app.config';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { get } from '@/api/http';
import { useSession } from '@/core/session';
import { freshDb, openApp } from '@/test/render';
import { backupApi, type BackupList } from './backup-api';
import { setBackupRunning } from './mock';

// 方案「备份与恢复」T4：系统管理员能看到菜单和列表；立即备份防连点；恢复要密码和「确认恢复」；业务管理员看不到菜单、调接口 403
beforeEach(() => { freshDb(); setBackupRunning(null); });
const T = { timeout: 15000 };
const as = (id: string) => useSession.getState().login(id);

test('系统管理员看到「备份与恢复」菜单和备份列表、设置', async () => {
  openApp('/system/backup', 'U01');
  expect((await screen.findAllByRole('link', { name: /备份与恢复/ }, T)).length).toBeGreaterThan(0);
  expect(await screen.findByText('2026-10-23 02:00:00', {}, T)).toBeInTheDocument();
  expect(screen.getByText('2026-10-20 17:42:00')).toBeInTheDocument();
  expect(screen.getAllByText('自动').length).toBeGreaterThan(0);
  expect(screen.getByText(`/data/${APP.storagePrefix}/backups`)).toBeInTheDocument();
  expect(screen.getByLabelText('备份时间')).toHaveValue('02:00');
  expect(screen.getByLabelText('自动备份保留份数')).toHaveValue(7);
});

test('立即备份：连点两下也只生成一份', async () => {
  openApp('/system/backup', 'U01');
  const btn = await screen.findByRole('button', { name: '立即备份' }, T);
  fireEvent.click(btn);
  fireEvent.click(btn);
  await screen.findByText(/已备份：/, {}, T);
  await waitFor(() => expect(screen.getByRole('button', { name: '立即备份' })).toBeEnabled());
  as('U01');
  const l = await get<BackupList>('/backups');
  expect(l.items.filter((b) => b.kind === 'manual')).toHaveLength(2);
});

test('立即备份执行中按钮显示「备份中…」且不可点', async () => {
  setBackupRunning('backup');
  openApp('/system/backup', 'U01');
  const btn = await screen.findByRole('button', { name: '备份中…' }, T);
  expect(btn).toBeDisabled();
  for (const b of screen.getAllByRole('button', { name: /^恢复 / })) expect(b).toBeDisabled();
});

test('恢复弹窗：没输入「确认恢复」时恢复按钮不可点；密码错提示；都对后生成恢复前备份并提示重新登录', async () => {
  const user = userEvent.setup();
  openApp('/system/backup', 'U01');
  const rows = await screen.findAllByRole('button', { name: new RegExp(`^恢复 ${APP.backupPrefix}-`) }, T);
  await user.click(rows[0]);
  const dlg = within(await screen.findByRole('dialog', { name: '恢复备份' }));
  expect(dlg.getByText(/会用这份备份覆盖现在的全部数据/)).toBeInTheDocument();
  const ok = dlg.getByRole('button', { name: '恢复' });
  expect(ok).toBeDisabled();
  await user.type(dlg.getByLabelText(/当前账号的密码/), 'demo');
  expect(ok).toBeDisabled();
  await user.type(dlg.getByLabelText(/输入「确认恢复」/), '确认');
  expect(ok).toBeDisabled();
  expect(dlg.getByLabelText(/输入「确认恢复」/)).toHaveAttribute('maxLength', '10');
  await user.clear(dlg.getByLabelText(/当前账号的密码/));
  await user.type(dlg.getByLabelText(/当前账号的密码/), 'wrong');
  await user.type(dlg.getByLabelText(/输入「确认恢复」/), '恢复');
  expect(ok).toBeEnabled();
  await user.click(ok);
  expect(await screen.findByText('密码不正确', {}, T)).toBeInTheDocument();
  await user.clear(dlg.getByLabelText(/当前账号的密码/));
  await user.type(dlg.getByLabelText(/当前账号的密码/), 'demo');
  await user.click(dlg.getByRole('button', { name: '恢复' }));
  const done = within(await screen.findByRole('dialog', { name: '数据已恢复' }, T));
  expect(done.getByText(/所有人都要重新登录/)).toBeInTheDocument();
  expect(done.getByRole('button', { name: '重新登录' })).toBeInTheDocument();
  as('U01');
  const l = await get<BackupList>('/backups');
  expect(l.items.some((b) => b.kind === 'prerestore')).toBe(true);
});

test('删除备份要二次确认：取消不删，确认后从列表消失', async () => {
  const user = userEvent.setup();
  openApp('/system/backup', 'U01');
  const del = await screen.findAllByRole('button', { name: new RegExp(`^删除 ${APP.backupPrefix}-`) }, T);
  await user.click(del[0]);
  await user.click(await screen.findByRole('button', { name: '取消' }));
  as('U01');
  expect((await get<BackupList>('/backups')).items).toHaveLength(2);
  await user.click(screen.getAllByRole('button', { name: new RegExp(`^删除 ${APP.backupPrefix}-`) })[0]);
  const box = within(await screen.findByRole('alertdialog'));
  expect(box.getByText('您确定要删除吗？')).toBeInTheDocument();
  await user.click(box.getByRole('button', { name: '删除' }));
  await screen.findByText('已删除备份', {}, T);
  expect((await get<BackupList>('/backups')).items).toHaveLength(1);
});

test('备份设置：保留份数超出 1～90 不能保存，保存后记操作日志', async () => {
  const user = userEvent.setup();
  openApp('/system/backup', 'U01');
  const keep = await screen.findByLabelText('自动备份保留份数', {}, T);
  await user.clear(keep);
  await user.type(keep, '91');
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  await user.clear(keep);
  await user.type(keep, '14');
  await user.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByText('已保存备份设置', {}, T);
  as('U01');
  expect(await backupApi.settings()).toEqual({ auto: true, time: '02:00', keep: 14 });
  const logs = await get<{ items: { module: string; action: string }[] }>('/audit', { module: '备份与恢复' });
  expect(logs.items.some((l) => l.action === '修改备份设置')).toBe(true);
});

test('业务管理员看不到「备份与恢复」菜单，直接调接口返回 403', async () => {
  openApp('/system/audit', 'U02');
  await screen.findAllByText('操作日志', {}, T);
  expect(screen.queryByRole('link', { name: /备份与恢复/ })).toBeNull();
  as('U02');
  await expect(get('/backups')).rejects.toMatchObject({ status: 403 });
  await expect(backupApi.create()).rejects.toMatchObject({ status: 403 });
});
