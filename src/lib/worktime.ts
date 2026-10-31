// 工作时间：上下班取系统设置的 workStart / workEnd，哪天上班看节假日设置；消息升级、催办、推送都按这里算，与后端 system.WorkHours 一致
import type { HolidayBase } from '@/api/types';
import { isOffDay, workDaysText } from './holidays';
import { toMin, ymd } from './time';

/** start / end 为 HH:mm；holidays 是节假日设置；days 是工作日（1=周一），没有时按周一至周五 */
export interface WorkHours { start: string; end: string; holidays?: readonly Pick<HolidayBase, 'name' | 'start' | 'end' | 'kind'>[]; days?: readonly number[] }

type When = Date | string;
const toDate = (d: When) => (typeof d === 'string' ? new Date(d.trim().replace(' ', 'T')) : d);
const minOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
const at = (d: Date, min: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, min);
const valid = (s: string | undefined) => Boolean(s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s));

/** 设置值不对或上班不早于下班时用 08:00–17:00 */
export function workHoursOf(start: string | undefined, end: string | undefined, holidays?: WorkHours['holidays'], days?: readonly number[]): WorkHours {
  const a = valid(start) ? start! : '08:00', z = valid(end) ? end! : '17:00';
  return toMin(a) < toMin(z) ? { start: a, end: z, holidays, days } : { start: '08:00', end: '17:00', holidays, days };
}

export const isWorkday = (d: Date, wh: WorkHours) => !isOffDay(ymd(d), wh.holidays ?? [], wh.days);

export function isWorkTime(d: When, wh: WorkHours) {
  const t = toDate(d);
  if (!isWorkday(t, wh)) return false;
  const m = minOfDay(t);
  return m >= toMin(wh.start) && m < toMin(wh.end);
}

/** a 到 b 之间落在工作时间里的整分钟数；b 不晚于 a 时为 0 */
export function workMinutesBetween(a: When, b: When, wh: WorkHours) {
  const from = toDate(a), to = toDate(b);
  if (!(to > from)) return 0;
  let ms = 0;
  for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (!isWorkday(d, wh)) continue;
    const st = Math.max(at(d, toMin(wh.start)).getTime(), from.getTime());
    const en = Math.min(at(d, toMin(wh.end)).getTime(), to.getTime());
    if (en > st) ms += en - st;
  }
  return Math.floor(ms / 60000);
}

/** 下一个工作时间的开始；本身在工作时间里返回原值，一年内找不到返回 null */
export function nextWorkStart(d: When, wh: WorkHours): Date | null {
  const t = toDate(d);
  if (isWorkTime(t, wh)) return t;
  for (let i = 0; i < 370; i++) {
    const day = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
    if (!isWorkday(day, wh)) continue;
    const st = at(day, toMin(wh.start));
    if (st >= t) return st;
  }
  return null;
}

/** 如「周一至周六 08:00–17:00」 */
export const describe = (wh: WorkHours) => `${workDaysText(wh.days)} ${wh.start}–${wh.end}`;

/** 工作分钟写成「4 个工作小时」，不是整小时写分钟 */
export const workSpan = (min: number) => (min % 60 === 0 ? `${min / 60} 个工作小时` : `${min} 个工作分钟`);

/** 「这一步已等待 1 个工作小时 30 分钟」里的时长 */
export const waitText = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} 个工作小时${min % 60 ? ` ${min % 60} 分钟` : ''}` : `${min} 个工作分钟`);
