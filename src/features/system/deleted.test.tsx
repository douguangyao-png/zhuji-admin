import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { del, get, post } from '@/api/http';
import type { DeletedRow, Page } from '@/api/types';
import { useSession } from '@/core/session';
import type { ExampleItem } from '@/features/example/types';
import { freshDb, openApp } from '@/test/render';
import '@/app/modules';

beforeEach(() => { freshDb(); useSession.getState().login('U01'); });

const list = (state = '已删除') => get<Page<DeletedRow>>('/audit/deleted', { state });
const items = async () => (await get<Page<ExampleItem>>('/example', { size: 500 })).items;
/** 能删的示例登记：草稿或已驳回 */
const removable = async () => (await items()).filter((x) => x.status === '草稿' || x.status === '已驳回');

describe('删除记录接口', () => {
  test('删除后数据还在删除记录里，操作人和名称都记下；恢复后回到列表', async () => {
    const before = (await items()).length;
    const x = (await removable())[0];
    await del(`/example/${x.id}`);
    expect((await items()).length).toBe(before - 1);
    const rows = (await list()).items;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ table: 'ex_item', rowId: x.id, state: '已删除', deletedBy: '系统管理员' });
    expect(await post('/audit/deleted/' + rows[0].id + '/restore', {})).toEqual({ restored: 1 });
    expect((await items()).length).toBe(before);
    expect((await list()).items).toHaveLength(0);
    expect((await list('已恢复')).items[0]).toMatchObject({ state: '已恢复', handledBy: '系统管理员' });
    await expect(post('/audit/deleted/' + rows[0].id + '/restore', {})).rejects.toThrow('已经已恢复了');
  });

  test('物理删除要系统管理员的密码；密码不对不删，对了不能再恢复', async () => {
    await del(`/example/${(await removable())[0].id}`);
    const id = (await list()).items[0].id;
    const { coreApi } = await import('@/api/core');
    await expect(coreApi.purgeDeleted(id, 'wrong')).rejects.toThrow('密码不正确');
    expect((await list()).items).toHaveLength(1);
    await coreApi.purgeDeleted(id, 'demo');
    expect((await list()).items).toHaveLength(0);
    expect((await list('已清除')).items[0].state).toBe('已清除');
    await expect(post('/audit/deleted/' + id + '/restore', {})).rejects.toThrow('已经已清除了');
    const log = await get<Page<{ action: string }>>('/audit', { q: '物理删除' });
    expect(log.items.map((a) => a.action)).toEqual(expect.arrayContaining(['物理删除', '物理删除密码错误']));
  });

  test('只有系统管理员能物理删除；没有操作日志权限的看不了', async () => {
    await del(`/example/${(await removable())[0].id}`);
    const id = (await list()).items[0].id;
    useSession.getState().login('U02');
    const { coreApi } = await import('@/api/core');
    await expect(coreApi.purgeDeleted(id, 'demo')).rejects.toThrow('只有系统管理员');
    useSession.getState().login('U04');
    await expect(list()).rejects.toThrow('没有权限');
  });
});

describe('删除记录页面', () => {
  test('操作日志里切到删除记录，恢复一条；物理删除弹出密码确认', async () => {
    const [a, b] = await removable();
    await del(`/example/${a.id}`);
    await del(`/example/${b.id}`);
    openApp('/system/audit');
    fireEvent.click(await screen.findByRole('tab', { name: '删除记录' }));
    const btn = await screen.findByRole('button', { name: new RegExp(`恢复 ${a.title}`) });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.queryByRole('button', { name: new RegExp(`恢复 ${a.title}`) })).toBeNull());
    expect((await items()).some((x) => x.id === a.id)).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`物理删除 ${b.title}`) }));
    const dlg = await screen.findByRole('dialog');
    const ok = within(dlg).getByRole('button', { name: /确认物理删除/ });
    expect(ok).toBeDisabled();
    fireEvent.change(within(dlg).getByLabelText(/当前账号的密码/), { target: { value: 'demo' } });
    fireEvent.click(ok);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await list('已清除')).items).toHaveLength(1);
  }, 40000);
});
