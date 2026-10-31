import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { del, get, put } from '@/api/http';
import type { HomeLayout, HomeRow, Role } from '@/api/types';
import { useSession } from '@/core/session';
import { freshDb, openApp } from '@/test/render';
import { MODULES } from '@/app/modules';
import { allowedComponents, HOME_COMPONENTS } from './catalog';
import { addRow, defaultRows, moveRow, normalizeRows, placeCard, removeRow, setMode } from './layout';

beforeEach(() => { freshDb(); localStorage.clear(); useSession.getState().login('U01'); });

const row = (mode: HomeRow['mode'], a: string | null, b: string | null): HomeRow => ({ mode, cells: [a, b] });

describe('布局计算', () => {
  test('默认布局：卡片两个一行均分，最后一个单独占左格', () => {
    expect(defaultRows(['todo', 'msg', 'a'])).toEqual([row('1:1', 'todo', 'msg'), row('1:1', 'a', null)]);
    expect(defaultRows([])).toEqual([]);
  });

  test('放卡片：原来在别处的和这一格互换，来自未放置的顶替这一格，清空', () => {
    const rows = [row('1:2', 'a', 'b'), row('2:1', 'c', null)];
    expect(placeCard(rows, 0, 0, 'c')).toEqual([row('1:2', 'c', 'b'), row('2:1', 'a', null)]);
    expect(placeCard(rows, 1, 1, 'b')).toEqual([row('1:2', 'a', null), row('2:1', 'c', 'b')]);
    expect(placeCard(rows, 0, 1, 'x')).toEqual([row('1:2', 'a', 'x'), row('2:1', 'c', null)]);
    expect(placeCard(rows, 0, 0, null)).toEqual([row('1:2', null, 'b'), row('2:1', 'c', null)]);
    expect(placeCard(rows, 0, 0, 'a')).toEqual(rows);
  });

  test('一行只有一种分列模式；加行、删行、上下移', () => {
    const rows = [row('1:1', 'a', 'b'), row('1:1', 'c', null)];
    expect(setMode(rows, 1, '2:1')[1].mode).toBe('2:1');
    expect(setMode(rows, 1, '2:1')[0].mode).toBe('1:1');
    expect(addRow(rows)).toHaveLength(3);
    expect(removeRow(rows, 0)).toEqual([rows[1]]);
    expect(moveRow(rows, 0, 1)).toEqual([rows[1], rows[0]]);
    expect(moveRow(rows, 0, -1)).toEqual(rows);
  });

  test('去掉用不了的和重复的卡片，空行丢掉', () => {
    const rows = [row('1:2', 'a', 'gone'), row('1:1', 'gone', null), row('2:1', 'a', 'b')];
    expect(normalizeRows(rows, new Set(['a', 'b']))).toEqual([row('1:2', 'a', null), row('2:1', null, 'b')]);
  });

  test('角色可使用的组件：没配或含 * 是全部，多个角色取并集', () => {
    expect(allowedComponents([{}])).toBe('all');
    expect(allowedComponents([{ components: ['todo'] }, { components: ['*'] }])).toBe('all');
    expect([...(allowedComponents([{ components: ['todo'] }, { components: ['msg'] }]) as Set<string>)]).toEqual(['todo', 'msg']);
  });

  test('模块登记的首页卡片都在组件目录里', () => {
    const keys = new Set(HOME_COMPONENTS.map((c) => c.key));
    for (const m of MODULES) for (const c of m.home ?? []) expect(keys.has(c.key)).toBe(true);
  });
});

describe('首页卡片不出现滚动条', () => {
  test('卡片高度跟内容走，卡片里不设固定高度和滚动', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/app/base.css', 'utf-8');
    const rule = (sel: string) => css.split(/\r?\n/).find((l) => l.startsWith(sel)) ?? '';
    const card = rule('.home-cell > .card {'), inner = rule('.home-cell > .card > :not(.card-h)');
    expect(card).toContain('height: auto');
    expect(card).not.toMatch(/(^|[^-])height: \d+px/);
    expect(card).not.toMatch(/overflow(-[xy])?: (auto|scroll)/);
    expect(inner).toContain('overflow: visible');
    expect(inner).not.toMatch(/overflow(-[xy])?: (auto|scroll)/);
  });
});

describe('首页布局接口', () => {
  test('每人一份：没保存过为空，保存后原样取回，恢复默认清掉', async () => {
    expect(await get<HomeLayout | null>('/home/layout')).toBeNull();
    await put('/home/layout', { rows: [row('1:2', 'todo', 'msg'), row('2:1', 'quick', null)] });
    expect((await get<HomeLayout>('/home/layout')).rows[1]).toEqual(row('2:1', 'quick', null));
    useSession.getState().login('U04');
    expect(await get<HomeLayout | null>('/home/layout')).toBeNull();
    useSession.getState().login('U01');
    await del('/home/layout');
    expect(await get<HomeLayout | null>('/home/layout')).toBeNull();
  });

  test('分列模式、格数、卡片标识、重复放置拒绝；空行丢掉', async () => {
    await expect(put('/home/layout', { rows: [row('3:1' as HomeRow['mode'], 'todo', null)] })).rejects.toThrow('分列模式');
    await expect(put('/home/layout', { rows: [{ mode: '1:1', cells: ['a'] }] })).rejects.toThrow('左右两格');
    await expect(put('/home/layout', { rows: [row('1:1', 'To Do', null)] })).rejects.toThrow('卡片标识不对');
    await expect(put('/home/layout', { rows: [row('1:1', 'todo', null), row('1:1', null, 'todo')] })).rejects.toThrow('只能放一次');
    expect((await put<HomeLayout>('/home/layout', { rows: [row('1:1', null, null), row('1:1', 'todo', ' ')] })).rows).toEqual([row('1:1', 'todo', null)]);
  });

  test('角色可使用的组件：保存、含 * 或空为全部、标识不对拒绝', async () => {
    let r = await put<Role>('/roles/manager', { components: ['todo', 'msg', 'todo'] });
    expect(r.components).toEqual(['todo', 'msg']);
    expect((await get<Role[]>('/roles')).find((x) => x.key === 'manager')!.components).toEqual(['todo', 'msg']);
    await expect(put('/roles/manager', { components: ['To Do'] })).rejects.toThrow('组件标识不对');
    r = await put<Role>('/roles/manager', { components: [] });
    expect(r.components).toEqual(['*']);
  });
});

describe('首页', () => {
  test('编辑布局：改分列模式、拿掉一张卡片，保存后重新打开还是这样；恢复默认', async () => {
    openApp('/');
    fireEvent.click(await screen.findByRole('button', { name: '编辑布局' }));
    fireEvent.change(await screen.findByRole('combobox', { name: '第 1 行分列模式' }), { target: { value: '2:1' } });
    fireEvent.change(screen.getByRole('combobox', { name: '第 1 行右格的卡片' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存布局' }));
    await waitFor(async () => expect((await get<HomeLayout>('/home/layout')).rows[0]).toEqual(row('2:1', 'todo', null)));
    await waitFor(() => expect(screen.getByRole('button', { name: '编辑布局' })).toBeInTheDocument());
    expect(screen.getByText('待办', { selector: '.card-t' })).toBeInTheDocument();
    expect(screen.queryByText('全部消息')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '编辑布局' }));
    expect(await screen.findByLabelText('未放置的卡片')).toHaveTextContent('消息');
    expect(screen.getByRole('combobox', { name: '第 1 行分列模式' })).toHaveValue('2:1');
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    await waitFor(async () => expect(await get<HomeLayout | null>('/home/layout')).toBeNull());
  }, 40000);

  test('把卡片拖到另一格：和那一格互换；拖到未放置：取下', async () => {
    openApp('/');
    fireEvent.click(await screen.findByRole('button', { name: '编辑布局' }));
    const left = await screen.findByRole('combobox', { name: '第 1 行左格的卡片' });
    const right = screen.getByRole('combobox', { name: '第 1 行右格的卡片' });
    expect([left, right].map((x) => (x as HTMLSelectElement).value)).toEqual(['todo', 'msg']);
    const data = new Map<string, string>();
    const dt = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: '' };
    const title = (sel: HTMLElement) => sel.closest('.home-slot')!.querySelector('.home-slot-t') as HTMLElement;
    fireEvent.dragStart(title(left), { dataTransfer: dt });
    fireEvent.drop(right.closest('.home-slot')!, { dataTransfer: dt });
    expect(left).toHaveValue('msg');
    expect(right).toHaveValue('todo');
    fireEvent.dragStart(title(left), { dataTransfer: dt });
    fireEvent.drop(screen.getByLabelText('未放置的卡片'), { dataTransfer: dt });
    expect(left).toHaveValue('');
    expect(within(screen.getByLabelText('未放置的卡片')).getByText('消息')).toBeInTheDocument();
  }, 40000);

  test('角色只开放了待办和消息：编辑布局里只有这两个组件', async () => {
    await put('/roles/manager', { components: ['todo', 'msg'] });
    openApp('/', 'U02');
    fireEvent.click(await screen.findByRole('button', { name: '编辑布局' }));
    const sel = await screen.findByRole('combobox', { name: '第 1 行左格的卡片' });
    expect([...sel.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['（空）', '待办', '消息']);
  }, 40000);

  test('角色权限页：可使用的组件默认全部，去掉一个后保存，只剩其余', async () => {
    openApp('/system/roles');
    fireEvent.click(await screen.findByRole('button', { name: /业务管理员/ }));
    const chip = await screen.findByRole('button', { name: '组件：消息' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '组件：待办' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(async () => {
      const c = (await get<Role[]>('/roles')).find((x) => x.key === 'manager')!.components!;
      expect(c).toContain('todo');
      expect(c).not.toContain('msg');
    });
  }, 40000);
});
