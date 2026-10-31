import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { get, put } from '@/api/http';
import type { AuditLog, Page, Settings } from '@/api/types';
import { buildMenuTree, menuPathOf, type MenuTreeNode } from '@/core/menu-names';
import { useSession } from '@/core/session';
import { freshDb, openApp } from '@/test/render';
import { toConfig, toDrafts } from './MenusPage';
import '@/app/modules';

beforeEach(() => { freshDb(); useSession.getState().login('U01'); });

const keys = (list: MenuTreeNode[]): string[] => list.map((n) => n.key);
const find = (list: MenuTreeNode[], key: string): MenuTreeNode | undefined => {
  for (const n of list) { if (n.key === key) return n; const h = find(n.children, key); if (h) return h; }
  return undefined;
};

describe('菜单树', () => {
  test('没有设置时模块在最上层，菜单页在所属模块下，顺序同默认', () => {
    const t = buildMenuTree({});
    expect(keys(t)).toEqual(['group:example', 'group:system', 'group:help']);
    expect(find(t, '/system/users')).toMatchObject({ parent: 'group:system', level: 2 });
    expect(menuPathOf(t, '/system/users')).toEqual(['group:system', '/system/users']);
  });

  test('菜单页放到别的菜单页下面成三级；模块放进模块，它的菜单页也跟着变三级', () => {
    const t = buildMenuTree({ '/system/user-attrs': { parent: '/system/users' }, 'group:example': { parent: 'group:help' } });
    expect(find(t, '/system/user-attrs')).toMatchObject({ parent: '/system/users', level: 3 });
    expect(menuPathOf(t, '/system/user-attrs')).toEqual(['group:system', '/system/users', '/system/user-attrs']);
    expect(find(t, 'group:example')).toMatchObject({ level: 2, parent: 'group:help' });
    expect(find(t, 'group:example')!.children.every((c) => c.level === 3)).toBe(true);
  });

  test('菜单页提到一级；同级按设置的排序，没设的排在后面', () => {
    const t = buildMenuTree({ '/example': { parent: '' }, 'group:help': { sort: 5 }, 'group:system': { sort: 9 } });
    expect(keys(t).slice(0, 2)).toEqual(['group:help', 'group:system']);
    expect(keys(t)).toContain('/example');
    expect(find(t, '/example')).toMatchObject({ level: 1, parent: null });
  });

  test('设置里的上级不存在、绕圈、超过三层都按默认上级', () => {
    const t = buildMenuTree({
      '/system/org': { parent: '/不存在' },
      'group:example': { parent: '/example' },
      '/system/users': { parent: '/system/roles' },
      '/system/roles': { parent: '/system/users' },
    });
    expect(find(t, '/system/org')!.parent).toBe('group:system');
    expect(find(t, 'group:example')!.parent).toBeNull();
    const a = find(t, '/system/users')!, b = find(t, '/system/roles')!;
    expect(a.parent === 'group:system' || b.parent === 'group:system').toBe(true);
    const deep = buildMenuTree({ '/system/user-attrs': { parent: '/system/users' }, '/system/users': { parent: '/example' }, '/example': { parent: '/example/mine' } });
    const lv = (n: MenuTreeNode): number[] => [n.level, ...n.children.flatMap(lv)];
    expect(Math.max(...deep.flatMap(lv))).toBeLessThanOrEqual(3);
  });
});

describe('功能菜单设置接口', () => {
  test('名称、位置、排序原样存回，空名称不存；记操作日志', async () => {
    const s = await put<Settings>('/settings/menu-config', {
      '/system/users': { name: '用户', parent: 'group:example', sort: 20 },
      'group:system': { name: '  ', parent: '', sort: 5 },
    });
    expect(s.menuConfig!['/system/users']).toEqual({ name: '用户', parent: 'group:example', sort: 20 });
    expect(s.menuConfig!['group:system']).toEqual({ parent: '', sort: 5 });
    expect(s.menuNames).toEqual({ '/system/users': '用户' });
    const log = await get<Page<AuditLog>>('/audit', { q: '修改功能菜单' });
    expect(log.items[0].target).toBe('2 项有设置');
  });

  test('统一改名接口：只改名称，位置排序不动', async () => {
    await put('/settings/menu-config', { '/system/users': { parent: 'group:example', sort: 20 } });
    const s = await put<Settings>('/settings/menu-names', { '/system/users': '用户' });
    expect(s.menuConfig!['/system/users']).toEqual({ name: '用户', parent: 'group:example', sort: 20 });
  });

  test('超长名称、非法键、自己放自己下面、绕圈、排序越界拒绝；非管理员拒绝', async () => {
    await expect(put('/settings/menu-config', { '/a': { name: '一二三四五六七八九十一二三' } })).rejects.toThrow('最多 12 个字');
    await expect(put('/settings/menu-config', { 'x y': { name: 'a' } })).rejects.toThrow('菜单标识不对');
    await expect(put('/settings/menu-config', { '/a': { parent: '/a' } })).rejects.toThrow('不能放在自己下面');
    await expect(put('/settings/menu-config', { '/a': { parent: '/b' }, '/b': { parent: '/a' } })).rejects.toThrow('绕成了圈');
    await expect(put('/settings/menu-config', { '/a': { sort: -1 } })).rejects.toThrow('排序填 0 到 99999');
    useSession.getState().login('U04');
    await expect(put('/settings/menu-config', {})).rejects.toThrow();
  });
});

describe('功能菜单页', () => {
  test('只存和默认不同的设置：什么都没改是空；已有设置原样转回', () => {
    expect(toConfig(toDrafts({}))).toEqual({});
    const cfg = { '/system/user-attrs': { name: '属性', parent: '/system/users', sort: 10 }, 'group:example': { name: '业务' } };
    const back = toConfig(toDrafts(cfg));
    expect(back['/system/user-attrs']).toMatchObject({ name: '属性', parent: '/system/users' });
    expect(back['group:example']).toEqual({ name: '业务' });
  });

  test('改显示名称：左边菜单跟着变', async () => {
    openApp('/system/menus');
    expect(await screen.findByText('功能菜单', { selector: 'h1' })).toBeInTheDocument();
    fireEvent.change(await screen.findByRole('textbox', { name: '人员的显示名称' }), { target: { value: '用户' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const nav = screen.getByRole('navigation', { name: '主导航' });
    await waitFor(() => expect(within(nav).getByRole('link', { name: '用户' })).toBeInTheDocument());
    expect((await get<Settings>('/settings')).menuConfig!['/system/users']).toEqual({ name: '用户' });
  }, 40000);

  test('下移改顺序、选上级成三级', async () => {
    openApp('/system/menus');
    fireEvent.click(await screen.findByRole('button', { name: '下移示例模块' }));
    fireEvent.change(screen.getByRole('combobox', { name: '人员属性的上级菜单' }), { target: { value: '/system/users' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(async () => expect((await get<Settings>('/settings')).menuConfig!['/system/user-attrs']).toMatchObject({ parent: '/system/users' }));
    const s = await get<Settings>('/settings');
    expect(s.menuConfig!['group:example'].sort).toBeGreaterThan(s.menuConfig!['group:system'].sort!);
    const nav = screen.getByRole('navigation', { name: '主导航' });
    const names = within(nav).getAllByRole('button').map((b) => b.textContent);
    expect(names.indexOf('系统管理')).toBeLessThan(names.indexOf('示例模块'));
  }, 40000);

  test('放下去会超过三层的上级选项置灰', async () => {
    openApp('/system/menus');
    fireEvent.change(await screen.findByRole('combobox', { name: '人员属性的上级菜单' }), { target: { value: '/system/users' } });
    // 系统管理下面现在有三层，再放进示例模块下面就是四层，选项置灰
    const grp = screen.getByRole('combobox', { name: '系统管理的上级菜单' });
    expect((grp.querySelector('option[value="group:example"]') as HTMLOptionElement).disabled).toBe(true);
  }, 40000);
});
