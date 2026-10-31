import { checkHoliday, copyToYear, dayType, defaultWorkDays, isOffDay, offOn, presetOf, workDaysOf } from './holidays';

// 用例与后端 calendar.HolidayRulesTest 一致
const list = [
  { name: '国庆节', start: '2026-10-01', end: '2026-10-07', kind: '放假' as const },
  { name: '国庆节调休', start: '2026-10-10', end: '2026-10-10', kind: '调休上班' as const },
];

test('日子类型：放假、调休上班、周末、工作日', () => {
  expect(dayType('2026-10-05', list)).toBe('放假');
  expect(dayType('2026-10-10', list)).toBe('调休上班');
  expect(dayType('2026-10-11', list)).toBe('周末');
  expect(dayType('2026-10-09', list)).toBe('工作日');
  expect(isOffDay('2026-10-03', list)).toBe(true);
  expect(isOffDay('2026-10-10', list)).toBe(false);
  expect(isOffDay('2026-10-11', list)).toBe(true);
  expect(offOn('2026-10-11', list)).toBeUndefined();
  expect(offOn('2026-10-01', list)?.name).toBe('国庆节');
});

test('调休上班优先于放假', () => {
  const both = [{ name: '院庆', start: '2026-11-02', end: '2026-11-06', kind: '放假' as const }, { name: '院庆值班', start: '2026-11-04', end: '2026-11-04', kind: '调休上班' as const }];
  expect(dayType('2026-11-04', both)).toBe('调休上班');
});

test('校验：日期顺序、类型、重叠、天数', () => {
  const y = 2026;
  expect(checkHoliday({ year: y, name: 'x', start: '2026-05-03', end: '2026-05-01', kind: '放假' }, list)).toBe('结束日期不能早于开始日期');
  expect(checkHoliday({ year: y, name: 'x', start: '2026-05-01', end: '2026-05-01', kind: '补课' as never }, list)).toBe('类型只能是放假或调休上班');
  expect(checkHoliday({ year: y, name: '中秋', start: '2026-09-30', end: '2026-10-02', kind: '放假' }, list)).toMatch(/^和「国庆节」/);
  expect(checkHoliday({ year: y, name: '寒假', start: '2026-01-10', end: '2026-02-20', kind: '放假' }, list)).toBe('一段不超过 31 天');
  expect(checkHoliday({ year: y, name: '劳动节', start: '2026-05-01', end: '2026-05-05', kind: '放假' }, list)).toBeNull();
});

test('国家安排只内置 2026 年；复制到下一年月日不变，2 月 29 日落到 28 日', () => {
  const p = presetOf(2026);
  expect(p).toHaveLength(13);
  expect(p).toContainEqual({ year: 2026, name: '劳动节', start: '2026-05-01', end: '2026-05-05', kind: '放假' });
  expect(p.some((x) => x.kind === '调休上班' && x.start === '2026-02-14')).toBe(true);
  expect(presetOf(2027)).toEqual([]);
  expect(copyToYear({ year: 2026, name: '劳动节', start: '2026-05-01', end: '2026-05-05', kind: '放假' as const }, 2027)).toMatchObject({ year: 2027, start: '2027-05-01', end: '2027-05-05' });
  expect(copyToYear({ year: 2028, name: 'x', start: '2028-02-29', end: '2028-02-29', kind: '放假' as const }, 2029).start).toBe('2029-02-28');
});

test('工作日：不在工作日里的星期算周末；放假、调休上班优先；没存过按周一至周五', () => {
  const six = [1, 2, 3, 4, 5, 6];
  expect(dayType('2026-10-24', list, six)).toBe('工作日');
  expect(dayType('2026-10-25', list, six)).toBe('周末');
  expect(isOffDay('2026-10-24', list, six)).toBe(false);
  expect(dayType('2026-10-24', list)).toBe('周末');
  expect(dayType('2026-10-03', list, six)).toBe('放假');
  expect(dayType('2026-10-10', list, [1, 2, 3, 4, 5])).toBe('调休上班');
  expect(dayType('2026-10-21', list, [1, 2, 4, 5])).toBe('周末');
  expect(defaultWorkDays()).toEqual([1, 2, 3, 4, 5]);
  expect(workDaysOf({})).toEqual([1, 2, 3, 4, 5]);
  expect(workDaysOf({ workDays: [1, 2] })).toEqual([1, 2]);
});
