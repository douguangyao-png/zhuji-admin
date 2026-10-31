import { STORE } from '@/app.config';
import fs from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { freshDb, openApp } from '@/test/render';

beforeEach(() => { localStorage.clear(); freshDb(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('左树右表页面的左栏收起', () => {
  test.each([
    ['/system/roles', '角色', '系统管理员'],
    ['/system/dicts', '分类', '全部'],
  ])('%s 点「收起%s」后左栏只剩「展开」按钮，再点恢复', async (url, label, item) => {
    openApp(url);
    const fold = await screen.findByRole('button', { name: `收起${label}` });
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('button', { name: new RegExp(item) }).length).toBeGreaterThan(0);
    fireEvent.click(fold);
    const open = screen.getByRole('button', { name: `展开${label}` });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    // 按钮上只写「收起」「展开」，读屏名称仍带左栏名称
    expect(fold.textContent).toBe('收起');
    expect(open.textContent).toBe('展开');
    expect(screen.queryByRole('button', { name: `收起${label}` })).toBeNull();
    expect(document.querySelector('.g-side')).toHaveClass('g-side-folded');
    expect(document.querySelector('.g-side')!.firstElementChild!.children).toHaveLength(1);
    fireEvent.click(open);
    expect(await screen.findByRole('button', { name: `收起${label}` })).toBeInTheDocument();
    expect(document.querySelector('.g-side')).not.toHaveClass('g-side-folded');
  });

  test('收起状态按页面记在本机：刷新后角色页仍收起，字典页不受影响', async () => {
    openApp('/system/roles');
    fireEvent.click(await screen.findByRole('button', { name: '收起角色' }));
    cleanup();
    openApp('/system/roles');
    expect(await screen.findByRole('button', { name: '展开角色' })).toHaveAttribute('aria-expanded', 'false');
    cleanup();
    openApp('/system/dicts');
    expect(await screen.findByRole('button', { name: '收起分类' })).toBeInTheDocument();
  });

  test('本机存储读不到时按展开显示', async () => {
    localStorage.setItem(`${STORE}.sideFold.system.roles`, '1');
    const real = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k.startsWith(`${STORE}.sideFold.`)) throw new Error('禁用存储');
      return real.call(this, k);
    });
    openApp('/system/roles');
    expect(await screen.findByRole('button', { name: '收起角色' })).toBeInTheDocument();
  });

  test('左栏 290px，收起后 44px', () => {
    const ui = fs.readFileSync(path.resolve(__dirname, 'ui.css'), 'utf8');
    expect(ui).toMatch(/\.g-side \{ grid-template-columns: 290px minmax\(0, 1fr\); \}/);
    expect(ui).toMatch(/\.g-side\.g-side-folded \{ grid-template-columns: 44px minmax\(0, 1fr\); \}/);
  });

  test('用到 .g-side 的页面都改用公共的左栏组件', () => {
    const root = path.resolve(__dirname, '../features');
    const walk = (d: string): string[] => fs.readdirSync(d).flatMap((f) => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') && !p.includes('.test.') ? [p] : []; });
    const files = walk(root);
    expect(files.filter((f) => /className="grid g-side/.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
    expect(files.filter((f) => /<SideGrid /.test(fs.readFileSync(f, 'utf8'))).length).toBe(3); // 角色权限、字典、数据库查询
  });
});
