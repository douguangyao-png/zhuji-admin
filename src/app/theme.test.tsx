import { STORE } from '@/app.config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { PERIODS, THEMES, THEME_NAMES, isDark, periodAt, themeOf, useBgStore, useThemeStore } from '@/lib/theme';
import { setNow } from '@/lib/time';
import { freshDb, openApp } from '@/test/render';

beforeEach(() => freshDb());
afterEach(() => { vi.restoreAllMocks(); setNow(null); act(() => { useThemeStore.getState().setTheme('light'); useBgStore.getState().setOn(true); }); });

test('主题只有两个：白天、黑夜；Shift+T 对应的切换在两者之间来回', () => {
  expect(THEMES).toEqual(['light', 'dark']);
  expect(THEMES.map((t) => THEME_NAMES[t])).toEqual(['白天', '黑夜']);
  expect(THEMES.filter(isDark)).toEqual(['dark']);
  const { setTheme, cycle } = useThemeStore.getState();
  setTheme('light');
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) { cycle(); seen.push(useThemeStore.getState().theme); }
  expect(seen).toEqual(['dark', 'light', 'dark']);
});

test('本地存的旧主题值读到不认识的就回落到白天，不报错；白天和黑夜照常读', () => {
  for (const old of ['nocturne', 'blue', 'green', 'xyz', '', null, undefined]) expect(themeOf(old as string | null | undefined), String(old)).toBe('light');
  expect(themeOf('light')).toBe('light');
  expect(themeOf('dark')).toBe('dark');
  // 别的标签页写入旧值时，当前页面回到白天
  localStorage.setItem(`${STORE}.theme`, 'nocturne');
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: `${STORE}.theme` })); });
  expect(useThemeStore.getState().theme).toBe('light');
  expect(document.documentElement.dataset.theme).toBe('light');
});

test('顶栏主题菜单：只列白天、黑夜，选黑夜后页面和本地存储都变', async () => {
  openApp('/', 'U01');
  fireEvent.click(await screen.findByRole('button', { name: '切换主题' }));
  const menu = within(await screen.findByRole('group', { name: '主题' }));
  expect(menu.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['白天', '黑夜']);
  expect(menu.getByRole('menuitemradio', { name: '白天' })).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(menu.getByRole('menuitemradio', { name: '黑夜' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem(`${STORE}.theme`)).toBe('dark');
  expect(screen.queryByRole('menu', { name: '主题' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '切换主题' }));
  expect(within(await screen.findByRole('group', { name: '主题' })).getByRole('menuitemradio', { name: '黑夜' })).toHaveAttribute('aria-checked', 'true');
});

test('背景按时段只分白天和黑夜：5 点到 18 点白天，其余黑夜', () => {
  expect(PERIODS.map((p) => p.name)).toEqual(['白天', '黑夜']);
  const at = (t: string) => periodAt(new Date(`2026-10-22T${t}:00`)).key;
  expect(['04:59', '05:00', '12:00', '17:59', '18:00', '23:59', '00:00'].map(at)).toEqual(['night', 'day', 'day', 'day', 'night', 'night', 'night']);
  for (const [t, k] of [['06:30', 'day'], ['15:00', 'day'], ['20:00', 'night'], ['02:00', 'night']]) {
    setNow(`2026-10-22 ${t}`);
    act(() => useBgStore.getState().tick());
    expect(document.documentElement.dataset.bg, t).toBe(k);
  }
});

test('页面开着跨过 18 点，下一次每分钟检查就换成黑夜配色', () => {
  vi.useFakeTimers();
  try {
    setNow('2026-10-22 17:59');
    act(() => useBgStore.getState().tick());
    const id = setInterval(() => useBgStore.getState().tick(), 60_000);
    expect(document.documentElement.dataset.bg).toBe('day');
    setNow('2026-10-22 18:00');
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(document.documentElement.dataset.bg).toBe('night');
    expect(useBgStore.getState().period.name).toBe('黑夜');
    clearInterval(id);
  } finally { vi.useRealTimers(); }
});

test('主题菜单：主题两项，背景只剩一个开关；点了关掉并记住，菜单不关', async () => {
  setNow('2026-10-22 09:00');
  act(() => useBgStore.getState().tick());
  openApp('/', 'U01');
  fireEvent.click(await screen.findByRole('button', { name: '切换主题' }));
  const menu = within(await screen.findByRole('menu', { name: '主题' }));
  expect(menu.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['白天', '黑夜']);
  const sw = menu.getByRole('menuitemcheckbox', { name: /背景随时段变化/ });
  expect(sw).toHaveAttribute('aria-checked', 'true');
  expect(sw).toHaveTextContent('白天');
  fireEvent.click(sw);
  expect(document.documentElement.dataset.bg).toBe('off');
  expect(localStorage.getItem(`${STORE}.bg`)).toBe('off');
  expect(localStorage.getItem(`${STORE}.theme`)).not.toBe('off');
  expect(menu.getByRole('menuitemcheckbox', { name: /背景随时段变化/ })).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(menu.getByRole('menuitemcheckbox', { name: /背景随时段变化/ }));
  expect(document.documentElement.dataset.bg).toBe('day');
  expect(localStorage.getItem(`${STORE}.bg`)).toBe('auto');
});

test('背景开关：除 off 以外的值（含旧值）都按开，off 按关；别的标签页改了跟着变', () => {
  const read = (v: string) => {
    localStorage.setItem(`${STORE}.bg`, v);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: `${STORE}.bg` })); });
    return useBgStore.getState().on;
  };
  expect(['fresh', 'warm', 'aurora', 'xyz', 'off', 'auto'].map(read)).toEqual([true, true, true, true, false, true]);
  read('off');
  expect(document.documentElement.dataset.bg).toBe('off');
});

test('背景开关：浏览器禁用本地存储时照常切换，不报错', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  expect(() => act(() => useBgStore.getState().setOn(false))).not.toThrow();
  expect(document.documentElement.dataset.bg).toBe('off');
});

test('样式表：只定义 light 和 dark 两套，没有别的主题选择器', () => {
  const css = ['../ui/tokens.css', '../ui/brand.css', '../ui/ui.css', '../app/base.css', '../app/login.css'].map((f) => readFileSync(resolve(__dirname, f), 'utf-8')).join('\n');
  const names = new Set(Array.from(css.matchAll(/\[data-theme="([a-z]+)"\]/g)).map((m) => m[1]));
  expect([...names].sort()).toEqual(['dark', 'light']);
  expect(css).not.toMatch(/nocturne|Nocturne/);
  expect(readFileSync(resolve(__dirname, '../ui/tokens.css'), 'utf-8')).toMatch(/:root, \[data-theme="light"\] \{/);
});
