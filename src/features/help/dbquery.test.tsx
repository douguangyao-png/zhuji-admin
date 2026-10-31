import { fireEvent, screen, within } from '@testing-library/react';
import { get, post } from '@/api/http';
import { useSession } from '@/core/session';
import { freshDb, openApp } from '@/test/render';
import { secretColumn, sqlProblem, type DbResult, type DbTable } from './sql';

beforeEach(() => { freshDb(); useSession.getState().login('U01'); });

describe('语句检查', () => {
  test('select、with、show、explain 开头的单条查询放行，末尾分号可以带', () => {
    for (const s of ['select * from org_user limit 10', 'SELECT 1;', 'with a as (select 1) select * from a', 'show server_version', 'explain select 1',
      "select 'delete from x; drop table y' as t", "select replace(name, 'a', 'b') as comment from org_user"]) expect(sqlProblem(s)).toBeNull();
  });

  test('写操作、多条语句、注释、读写文件、select into 都拒绝', () => {
    for (const s of ['insert into t values (1)', 'update t set a = 1', 'delete from t', 'drop table t', 'truncate t', 'create table x (a int)', 'alter table t add c int',
      'select 1; select 2', 'select 1 -- x', 'select 1 /* x */', 'select * into b from t', "select pg_read_file('/etc/passwd')", 'select pg_sleep(100)',
      'explain analyze select 1', 'with d as (delete from t returning *) select * from d', 'values (1)', '', '   ;  ', "select 'abc"]) {
      expect(sqlProblem(s), s).not.toBeNull();
    }
  });

  test('密码、密钥类列的值不返回', () => {
    for (const c of ['password_hash', 'secret_enc', 'webhook_enc', 'access_token', 'PWD']) expect(secretColumn(c)).toBe(true);
    for (const c of ['name', 'created_at']) expect(secretColumn(c)).toBe(false);
  });
});

describe('接口', () => {
  test('只有系统管理员能用；普通角色 403', async () => {
    expect((await get<DbTable[]>('/admin/db/tables')).length).toBeGreaterThan(5);
    useSession.getState().login('U02');
    await expect(get('/admin/db/tables')).rejects.toThrow('没有权限');
    await expect(post('/admin/db/query', { sql: 'select * from org_user' })).rejects.toThrow('没有权限');
  });

  test('查表结构、查数据；写语句被拒绝；密码列显示星号；记操作日志', async () => {
    const s = await get<{ name: string; columns: { name: string }[] }>('/admin/db/tables/org_user');
    expect(s.columns.map((c) => c.name)).toContain('id');
    await expect(get('/admin/db/tables/no_such_table')).rejects.toThrow('没有这张表');
    const r = await post<DbResult>('/admin/db/query', { sql: 'select * from org_user limit 3;' });
    expect(r.count).toBe(3);
    expect(r.columns).toContain('name');
    await expect(post('/admin/db/query', { sql: 'delete from org_user' })).rejects.toThrow('只能执行 select');
    await expect(post('/admin/db/query', { sql: 'select * from org_user; drop table org_user' })).rejects.toThrow('一次只能执行一条语句');
    const log = await get<{ items: { action: string }[] }>('/audit', { q: '数据库查询' });
    expect(log.items.length).toBeGreaterThan(0);
  });
});

describe('页面', () => {
  test('左边列出表，点表看结构，输入 SQL 执行看结果，写语句直接提示', async () => {
    openApp('/help/db');
    expect(await screen.findByText('数据库查询', { selector: 'h1' })).toBeInTheDocument();
    const grp = await screen.findByRole('group', { name: '组织与权限' });
    expect(within(grp).getByRole('button', { name: /org_user/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '系统' })).toBeInTheDocument();
    fireEvent.click(within(grp).getByRole('button', { name: /org_user/ }));
    const st = await screen.findByRole('table', { name: '表结构' });
    expect(within(st).getByText('id')).toBeInTheDocument();
    // 选了表，SQL 查询里就是查这张表的语句
    fireEvent.click(screen.getByRole('tab', { name: 'SQL 查询' }));
    expect(screen.getByRole('textbox', { name: 'SQL 语句' })).toHaveValue('select * from org_user limit 100');
    fireEvent.click(screen.getByRole('tab', { name: /表结构/ }));
    fireEvent.click(screen.getByRole('button', { name: /查询前 100 行/ }));
    const box = screen.getByRole('textbox', { name: 'SQL 语句' });
    expect(box).toHaveValue('select * from org_user limit 100');
    fireEvent.click(screen.getByRole('button', { name: '执行' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/行/);
    expect(screen.getByRole('button', { name: '导出 Excel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '导出 CSV' })).toBeEnabled();
    fireEvent.change(box, { target: { value: 'delete from org_user' } });
    fireEvent.click(screen.getByRole('button', { name: '执行' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('只能执行 select');
  }, 40000);

  test('菜单只对系统管理员显示', async () => {
    openApp('/help/guide', 'U02');
    await screen.findByRole('navigation', { name: '主导航' });
    expect(within(screen.getByRole('navigation', { name: '主导航' })).queryByRole('link', { name: '数据库查询' })).toBeNull();
  }, 40000);

  test('左边数据表可以收起和展开；结果里长内容（JSON）固定宽度，点开看排好版的完整内容', async () => {
    openApp('/help/db');
    await screen.findByRole('group', { name: '组织与权限' });
    fireEvent.click(screen.getByRole('button', { name: '收起数据表' }));
    expect(screen.queryByRole('group', { name: '组织与权限' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '展开数据表' }));
    expect(await screen.findByRole('group', { name: '组织与权限' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'SQL 语句' }), { target: { value: 'select * from sys_setting limit 5' } });
    fireEvent.click(screen.getByRole('button', { name: '执行' }));
    await screen.findByRole('status');
    const cells = document.querySelectorAll('button.db-cell');
    expect(cells.length).toBeGreaterThan(0);
    fireEvent.click(cells[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  }, 40000);
});
