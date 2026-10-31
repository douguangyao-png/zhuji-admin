import { cleanup, screen, waitFor } from '@testing-library/react';
import { MODULES } from '@/app/modules';
import { freshDb, openApp } from './render';

// 路由冒烟：几个演示账号把首页、审批、消息和每个模块的每个菜单页都打开一遍，页面抛错或有 React 警告（如缺 key）就失败。新模块登记后自动纳入
const SHELL = ['/', '/approvals', '/messages'];
const PAGES = [...SHELL, ...MODULES.flatMap((m) => m.menu.map((i) => i.to))];
const ACCOUNTS: [string, string][] = [['U01', '系统管理员'], ['U02', '业务管理员'], ['U04', '普通用户']];

let errors: string[] = [];
beforeEach(() => {
  freshDb();
  errors = [];
  // 查询在测试里异步返回时的「未包在 act 里」提示是测试时序造成的，不算页面问题；缺 key、渲染抛错等其他警告照旧算
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { const m = a.map(String).join(' '); if (!/not wrapped in act/.test(m)) errors.push(m); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each(ACCOUNTS)('%s（%s）', (id) => {
  test.each(PAGES)('打开 %s 不报错', async (to) => {
    openApp(to, id);
    // 外壳出来说明登录态、权限守卫和页面都渲染过了；没有权限的菜单会被转回首页
    expect(await screen.findByRole('navigation', { name: '主导航' }, { timeout: 15000 })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.page')).not.toBeNull(), { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(errors).toEqual([]);
  }, 30000);
});

test('菜单总数：示例 2、系统管理 13、帮助 5（测试版）', () => {
  expect(MODULES.map((m) => [m.key, m.menu.length])).toEqual([['example', 2], ['system', 13], ['help', 5]]);
});
