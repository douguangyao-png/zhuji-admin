import { STORE } from '@/app.config';
import { create } from 'zustand';
import { now } from './time';

/** 主题只有白天和黑夜两种；本地存的旧值（如 nocturne、blue 或别的）读到不认识的就回落到白天，不报错 */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_NAMES: Record<Theme, string> = { light: '白天', dark: '黑夜' };
/** 深色底的主题：图表库、登录页背景等按亮暗取色 */
export const isDark = (t: Theme) => t === 'dark';
/** 把存下来的值转成主题，不认识的回落到白天 */
export const themeOf = (v: string | null | undefined): Theme => ((THEMES as readonly string[]).includes(v ?? '') ? (v as Theme) : 'light');
const KEY = `${STORE}.theme`;

const read = (): Theme => {
  try { return themeOf(localStorage.getItem(KEY)); } catch { return 'light'; }
};

export const useThemeStore = create<{ theme: Theme; setTheme: (t: Theme) => void; cycle: () => void }>((set, get) => ({
  theme: read(),
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* 隐私模式 */ }
    set({ theme });
  },
  /** 白天和黑夜之间切换（Shift+T） */
  cycle: () => get().setTheme(get().theme === 'light' ? 'dark' : 'light'),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { const t = read(); document.documentElement.dataset.theme = t; useThemeStore.setState({ theme: t }); }
  });
}

/** 内容区和顶栏的彩色光晕，白天（5–18 点）和黑夜两档；只存开关（auto / off），只存本机 */
export const PERIODS = [
  { key: 'day', name: '白天', from: 5 },
  { key: 'night', name: '黑夜', from: 18 },
] as const;
export type Period = (typeof PERIODS)[number];
/** 5 点到 18 点是白天，18 点到次日 5 点是黑夜 */
export const periodAt = (d: Date): Period => (d.getHours() >= 5 && d.getHours() < 18 ? PERIODS[0] : PERIODS[1]);
const BG_KEY = `${STORE}.bg`;

// 除了 off 一律当作开
const readOn = (): boolean => {
  try { return localStorage.getItem(BG_KEY) !== 'off'; } catch { return true; }
};
const apply = (on: boolean, p: Period) => { document.documentElement.dataset.bg = on ? p.key : 'off'; };

export const useBgStore = create<{ on: boolean; period: Period; setOn: (on: boolean) => void; tick: () => void }>((set, get) => ({
  on: readOn(),
  period: periodAt(now()),
  setOn: (on) => {
    apply(on, get().period);
    try { localStorage.setItem(BG_KEY, on ? 'auto' : 'off'); } catch { /* 隐私模式：照常切换，只是不记住 */ }
    set({ on });
  },
  /** 每分钟和回到前台时调用；跨了时段才改页面 */
  tick: () => {
    const p = periodAt(now());
    if (p.key !== get().period.key) set({ period: p });
    apply(get().on, p);
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === BG_KEY) { const on = readOn(); apply(on, useBgStore.getState().period); useBgStore.setState({ on }); }
  });
}
