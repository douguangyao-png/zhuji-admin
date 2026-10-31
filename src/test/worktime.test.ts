import { describe as label, isWorkTime, nextWorkStart, waitText, workHoursOf, workMinutesBetween, workSpan } from '@/lib/worktime';

// 工作时间取系统设置的上下班时间，哪天上班看节假日设置；2026-10-16 周五，10-17、10-18 周末，10-19 周一
const DAY = workHoursOf('08:00', '17:00');

test('工作时间内外，下班那一刻不算', () => {
  expect(isWorkTime('2026-10-16 08:00:00', DAY)).toBe(true);
  expect(isWorkTime('2026-10-16 17:00:00', DAY)).toBe(false);
  expect(isWorkTime('2026-10-17 10:00:00', DAY)).toBe(false);
});

test('同一天、跨日、跨周末只算工作时间', () => {
  expect(workMinutesBetween('2026-10-16 09:00', '2026-10-16 11:00', DAY)).toBe(120);
  expect(workMinutesBetween('2026-10-15 16:00', '2026-10-16 09:00', DAY)).toBe(120);
  // 周五 16:00 到下周一 11:00：周五 1 小时 + 周一 3 小时
  expect(workMinutesBetween('2026-10-16 16:00', '2026-10-19 11:00', DAY)).toBe(240);
});

test('起止在非工作时间、倒序为 0', () => {
  expect(workMinutesBetween('2026-10-16 18:00', '2026-10-19 07:00', DAY)).toBe(0);
  expect(workMinutesBetween('2026-10-17 10:00', '2026-10-19 08:30', DAY)).toBe(30);
  expect(workMinutesBetween('2026-10-16 06:00', '2026-10-16 20:00', DAY)).toBe(540);
  expect(workMinutesBetween('2026-10-19 10:00', '2026-10-16 10:00', DAY)).toBe(0);
});

test('节假日设置：放假不上班，调休的周末上班', () => {
  const wh = workHoursOf('08:00', '17:00', [
    { name: '调休', start: '2026-10-17', end: '2026-10-17', kind: '调休上班' },
    { name: '放假', start: '2026-10-19', end: '2026-10-19', kind: '放假' },
  ]);
  expect(isWorkTime('2026-10-17 09:00:00', wh)).toBe(true);
  expect(isWorkTime('2026-10-19 09:00:00', wh)).toBe(false);
  expect(workMinutesBetween('2026-10-16 16:00', '2026-10-19 12:00', wh)).toBe(60 + 540);
  expect(nextWorkStart('2026-10-18 10:00', wh)?.getDate()).toBe(20);
});

test('上下班时间取系统设置，不对时用 08:00–17:00', () => {
  expect(label(workHoursOf('08:30', '17:30'))).toBe('周一至周五 08:30–17:30');
  expect(isWorkTime('2026-10-16 08:15:00', workHoursOf('08:30', '17:30'))).toBe(false);
  expect(label(workHoursOf(undefined, undefined))).toBe('周一至周五 08:00–17:00');
  expect(label(workHoursOf('18:00', '17:00'))).toBe('周一至周五 08:00–17:00');
  expect(label(workHoursOf('8点', '17:30'))).toBe('周一至周五 08:00–17:30');
});

test('下一个工作时间的开始与时长文字', () => {
  expect(nextWorkStart('2026-10-17 10:00', DAY)?.getDate()).toBe(19);
  expect(nextWorkStart('2026-10-16 06:00', DAY)?.getHours()).toBe(8);
  expect(workSpan(240)).toBe('4 个工作小时');
  expect(workSpan(90)).toBe('90 个工作分钟');
  expect(waitText(90)).toBe('1 个工作小时 30 分钟');
  expect(waitText(0)).toBe('0 个工作分钟');
});

test('工作日：周六在工作日里就算工作时间，节假日放假仍不算', () => {
  const six = workHoursOf('08:00', '17:00', [{ name: '国庆节', start: '2026-10-01', end: '2026-10-07', kind: '放假' }], [1, 2, 3, 4, 5, 6]);
  expect(isWorkTime('2026-10-17 10:00:00', six)).toBe(true);
  expect(isWorkTime('2026-10-18 10:00:00', six)).toBe(false);
  expect(isWorkTime('2026-10-03 10:00:00', six)).toBe(false);
  // 周五 16:00 到下周一 11:00：周五 1 小时 + 周六 9 小时 + 周一 3 小时
  expect(workMinutesBetween('2026-10-16 16:00', '2026-10-19 11:00', six)).toBe(780);
  expect(label(six)).toBe('周一至周六 08:00–17:00');
  expect(label(workHoursOf('08:00', '17:00', [], [1, 3, 5]))).toBe('周一、周三、周五 08:00–17:00');
  expect(label(workHoursOf('08:00', '17:00', [], [1, 2, 3, 4, 5, 6, 7]))).toBe('每天 08:00–17:00');
});
