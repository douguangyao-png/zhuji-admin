import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { get, put } from '@/api/http';
import { DEFAULT_FEATURES, type AuditLog, type Page, type Settings, type User } from '@/api/types';
import { menuKeyOf, renameRefs } from '@/core/menu-names';
import { useSession } from '@/core/session';
import { freshDb, openApp } from '@/test/render';
import '@/app/modules';

beforeEach(() => { freshDb(); useSession.getState().login('U01'); });
const saveBtn = () => { const b = screen.getAllByRole('button', { name: '保存' }); return b[b.length - 1]; };

describe('模块开关', () => {
  test('默认打开示例模块；关掉后菜单不出现，恢复默认并记日志', async () => {
    expect((await get<Settings>('/settings')).features).toEqual(DEFAULT_FEATURES);
    const s = await put<Settings>('/settings', { features: { example: false } });
    expect(s.features.example).toBe(false);
    openApp('/system/settings');
    const nav = () => within(screen.getByRole('navigation', { name: '主导航' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: '示例模块' })).toHaveAttribute('aria-checked', 'false'));
    expect(nav().queryByText('示例模块')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复默认模块' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent('将改变：示例模块 关→开');
    fireEvent.click(within(dlg).getByRole('button', { name: '恢复默认' }));
    await waitFor(async () => expect((await get<Settings>('/settings')).features.example).toBe(true));
    await waitFor(() => expect(nav().getByText('示例模块')).toBeInTheDocument());
    const log = await get<Page<AuditLog>>('/audit', { q: '修改设置' });
    expect(log.items.map((l) => l.target)).toContain('示例模块 开→关');
  });
});

describe('菜单名称', () => {
  test('接口：去空格、整体替换；空值、超长、非法键拒绝；记操作日志；普通用户不能改', async () => {
    const s = await put<Settings>('/settings/menu-names', { 'group:example': ' 业务登记 ', '/example/mine': '我的单子' });
    expect(s.menuNames).toEqual({ 'group:example': '业务登记', '/example/mine': '我的单子' });
    await expect(put('/settings/menu-names', { '/example': '  ' })).rejects.toThrow('不能为空');
    await expect(put('/settings/menu-names', { '/example': '一二三四五六七八九十一二三' })).rejects.toThrow('最多 12 个字');
    await expect(put('/settings/menu-names', { 'x y': '登记' })).rejects.toThrow('菜单标识不对');
    expect((await get<Settings>('/settings')).menuNames).toEqual({ 'group:example': '业务登记', '/example/mine': '我的单子' });
    const log = await get<Page<AuditLog>>('/audit', { q: '修改菜单名称' });
    expect(log.items[0].target).toBe('2 项改名');
    useSession.getState().login('U04');
    await expect(put('/settings/menu-names', {})).rejects.toThrow();
  });

  test('侧栏、顶栏跟着改', async () => {
    await put('/settings/menu-names', { 'group:example': '业务登记', '/example/mine': '我的单子', '/messages': '通知' });
    openApp('/example/mine');
    const nav = await screen.findByRole('navigation', { name: '主导航' });
    expect(await within(nav).findByRole('button', { name: '业务登记' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^通知/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: '我的单子' })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.crumbs')).toHaveTextContent('我的单子'));
  });

  test('系统管理员在功能菜单页改名称、恢复默认', async () => {
    openApp('/system/menus');
    const input = await screen.findByRole('textbox', { name: '示例模块的显示名称' });
    fireEvent.change(input, { target: { value: '' } });
    expect(await screen.findByText('不能为空')).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();
    fireEvent.change(input, { target: { value: '业务' } });
    fireEvent.click(saveBtn());
    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(await within(nav).findByRole('button', { name: '业务' })).toBeInTheDocument();
    expect((await get<Settings>('/settings')).menuNames).toEqual({ 'group:example': '业务' });
    fireEvent.click(screen.getByRole('button', { name: '全部恢复默认' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '恢复默认' }));
    expect(await within(nav).findByRole('button', { name: '示例模块' })).toBeInTheDocument();
  }, 40000);

  test('人员与操作日志的查询条件支持多选', async () => {
    const all = await get<Page<User>>('/org/users', { size: 500 });
    const units = [...new Set(all.items.map((u) => u.unitId))].slice(0, 2);
    const byUnit = await get<Page<User>>('/org/users', { size: 500, unitId: units.join(',') });
    expect(byUnit.total).toBeGreaterThan(0);
    expect(byUnit.items.every((u) => units.includes(u.unitId))).toBe(true);
    await put('/settings/menu-names', { '/example': '全部登记' });
    await put('/settings', { features: { example: true } });
    const logs = await get<Page<AuditLog>>('/audit', { size: 500 });
    const mods = [...new Set(logs.items.map((l) => l.module))].slice(0, 2);
    const byMod = await get<Page<AuditLog>>('/audit', { size: 500, module: mods.join(',') });
    expect(byMod.items.length).toBeGreaterThan(0);
    expect(byMod.items.every((l) => mods.includes(l.module))).toBe(true);
  });

  test('操作说明里的菜单引用按改后名称显示', () => {
    const names = { 'group:system': '系统设置', '/system/workflow': '审批配置' };
    const nameOf = (k: string, d: string) => names[k as keyof typeof names] ?? d;
    expect(renameRefs('在「系统管理 › 审批流」里配置', names, nameOf)).toBe('在「系统设置 › 审批配置」里配置');
    expect(renameRefs('打开「审批流」', names, nameOf)).toBe('打开「审批配置」');
    expect(menuKeyOf('/example/mine?x=1')).toBe('group:example');
    expect(menuKeyOf('/approvals?type=example')).toBe('/approvals');
  });
});
