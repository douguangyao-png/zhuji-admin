// 节假日的纯规则，模拟后端和页面共用；后端 calendar.HolidayRules 逐条对照，用例见 holidays.test.ts
import type { HolidayBase } from '@/api/types';
import { addDays, diffDays, parseDate } from './time';

export type DayType = '工作日' | '周末' | '放假' | '调休上班';
type H = Pick<HolidayBase, 'name' | 'start' | 'end' | 'kind'> & Partial<Pick<HolidayBase, 'id' | 'year' | 'note'>>;

const covers = (h: H, d: string) => d >= h.start && d <= h.end;

/** 覆盖这天的那一段，调休上班优先 */
export function holidayOn<T extends H>(d: string, list: readonly T[]): T | undefined {
  let off: T | undefined;
  for (const h of list) {
    if (!covers(h, d)) continue;
    if (h.kind === '调休上班') return h;
    off = h;
  }
  return off;
}

/** 星期几：1=周一 … 7=周日 */
export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;
export const weekdayOf = (d: string) => ((parseDate(d).getDay() + 6) % 7) + 1;
/** 周一至周五 */
export const FIVE_DAYS: readonly number[] = [1, 2, 3, 4, 5];
/** 没设置过工作日时按周一至周五 */
export const defaultWorkDays = (): number[] => [1, 2, 3, 4, 5];
/** 设置里的工作日；没存过按版本默认 */
export const workDaysOf = (s?: { workDays?: number[] } | null): number[] => (s?.workDays?.length ? s.workDays : defaultWorkDays());

/** 节假日优先；不在工作日里的星期算周末 */
export function dayType(d: string, list: readonly H[], workDays: readonly number[] = FIVE_DAYS): DayType {
  const h = holidayOn(d, list);
  if (h) return h.kind;
  return workDays.includes(weekdayOf(d)) ? '工作日' : '周末';
}

/** 放假日和没调休的周末算休息日，审批条件里的「节假日」按这个 */
export const isOffDay = (d: string, list: readonly H[], workDays: readonly number[] = FIVE_DAYS) => { const t = dayType(d, list, workDays); return t === '放假' || t === '周末'; };

/** 「周一至周六」「每天」「周一、周三、周五」 */
export function workDaysText(days: readonly number[] = FIVE_DAYS) {
  const v = [...new Set(days)].sort((a, b) => a - b);
  if (v.length === 7) return '每天';
  const run = v.length > 1 && v.every((x, i) => i === 0 || x === v[i - 1] + 1);
  return run ? `${WEEKDAY_NAMES[v[0] - 1]}至${WEEKDAY_NAMES[v[v.length - 1] - 1]}` : v.map((x) => WEEKDAY_NAMES[x - 1]).join('、');
}

/** 只看放假段；普通周末不算 */
export const offOn = <T extends H>(d: string, list: readonly T[]) => { const h = holidayOn(d, list); return h?.kind === '放假' ? h : undefined; };

export const MAX_DAYS = 31;
/** 字段校验；others 是同一年里别的段 */
export function checkHoliday(h: Partial<H>, others: readonly H[]): string | null {
  if (!h.name?.trim()) return '请填写名称';
  if (!h.start || !h.end) return '请填写开始和结束日期';
  if (h.end < h.start) return '结束日期不能早于开始日期';
  if (diffDays(h.end, h.start) + 1 > MAX_DAYS) return `一段不超过 ${MAX_DAYS} 天`;
  if (h.kind !== '放假' && h.kind !== '调休上班') return '类型只能是放假或调休上班';
  if (!h.year || Number(h.start.slice(0, 4)) !== h.year) return `开始日期要在 ${h.year} 年内`;
  const hit = others.find((o) => (!h.id || o.id !== h.id) && h.start! <= o.end && o.start <= h.end!);
  return hit ? `和「${hit.name}」${hit.start} 至 ${hit.end} 重叠` : null;
}

/** 复制到另一年：月日不变，2 月 29 日落到 28 日 */
export function copyToYear<T extends H>(h: T, year: number): T {
  const shift = (d: string) => {
    const md = d.slice(5) === '02-29' ? '02-28' : d.slice(5);
    return `${Number(d.slice(0, 4)) + year - Number(h.start.slice(0, 4))}-${md}`;
  };
  return { ...h, id: undefined, year, start: shift(h.start), end: shift(h.end) } as T;
}

/** 国务院办公厅 2025-11-04 发布的 2026 年安排，只作参考 */
const PRESET_2026: [string, string, string, H['kind']][] = [
  ['元旦', '2026-01-01', '2026-01-03', '放假'], ['元旦调休', '2026-01-04', '2026-01-04', '调休上班'],
  ['春节', '2026-02-15', '2026-02-23', '放假'], ['春节调休', '2026-02-14', '2026-02-14', '调休上班'], ['春节调休', '2026-02-28', '2026-02-28', '调休上班'],
  ['清明节', '2026-04-04', '2026-04-06', '放假'],
  ['劳动节', '2026-05-01', '2026-05-05', '放假'], ['劳动节调休', '2026-05-09', '2026-05-09', '调休上班'],
  ['端午节', '2026-06-19', '2026-06-21', '放假'],
  ['中秋节', '2026-09-25', '2026-09-27', '放假'],
  ['国庆节', '2026-10-01', '2026-10-07', '放假'], ['国庆节调休', '2026-09-20', '2026-09-20', '调休上班'], ['国庆节调休', '2026-10-10', '2026-10-10', '调休上班'],
];
export const presetOf = (year: number): Omit<HolidayBase, 'id'>[] =>
  year === 2026 ? PRESET_2026.map(([name, start, end, kind]) => ({ year, name, start, end, kind })) : [];

export const daysOf = (h: Pick<H, 'start' | 'end'>) => diffDays(h.end, h.start) + 1;
/** from 至 to 的每一天 */
export const eachDay = (from: string, to: string) => Array.from({ length: Math.max(0, diffDays(to, from) + 1) }, (_, i) => addDays(from, i));
