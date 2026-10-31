// 时间一律按北京时间的本地字符串处理：日期 YYYY-MM-DD，时刻 HH:mm，时间 YYYY-MM-DD HH:mm:ss
let fixed: Date | null = null;
/** 测试里固定「现在」 */
export const setNow = (d: string | null) => { fixed = d ? new Date(d.replace(' ', 'T')) : null; };
export const now = () => (fixed ? new Date(fixed) : new Date());

const p2 = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const hm = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
export const stamp = (d = now()) => `${ymd(d)} ${hm(d)}:${p2(d.getSeconds())}`;
export const today = () => ymd(now());

export const parseDate = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parseDate(s); d.setDate(d.getDate() + n); return ymd(d); };
export const diffDays = (a: string, b: string) => Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);
export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = (m: number) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;

export const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;
export const weekday = (s: string) => WEEK[parseDate(s).getDay()];
/** 周一为一周第一天 */
export const weekStart = (s: string) => { const d = parseDate(s); return addDays(s, -((d.getDay() + 6) % 7)); };
export const monthDays = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
