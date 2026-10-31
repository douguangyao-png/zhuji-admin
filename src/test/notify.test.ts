import { table } from '@/api/mock/db';
import { publish, registerDailyJob, once, runDailyJobs } from '@/api/mock/notify';
import type { MsgRule, MsgSendLog, User } from '@/api/types';
import { freshDb } from './render';
import '@/api/mock';

beforeEach(() => freshDb());
const log = () => table<MsgSendLog>('msg_send_log').all();
const name = () => table<User>('org_user').get('U04')!.name;

test('示例登记通过：推到企业微信群并给本人发站内消息，群里 @ 本人', () => {
  publish('example.approved', { title: '设备巡检 SL20261031001', applicant: name() }, { applicantId: 'U04' });
  const group = log().find((l) => l.channel === 'wecom')!;
  expect(group.target).toBe('业务工作群');
  expect(group.text).toContain('【示例登记】设备巡检 SL20261031001 已审核通过');
  expect(group.text).toContain(`@${name()}`);
  expect(log().some((l) => l.channel === 'site' && l.target === name())).toBe(true);
});

test('规则停用后不发', () => {
  publish('example.approved', { title: '设备巡检', applicant: name() }, { applicantId: 'U04' });
  expect(log().find((l) => l.channel === 'site')?.title).toBe('【示例登记】设备巡检 已审核通过');
  table<MsgRule>('msg_rule').update('example.approved', { enabled: false });
  const before = log().length;
  publish('example.approved', { title: '设备巡检', applicant: name() }, { applicantId: 'U04' });
  expect(log()).toHaveLength(before);
});

test('每日任务同一件事同一天只提醒一次', () => {
  let n = 0;
  registerDailyJob('test', () => { if (once('job:1')) n++; });
  runDailyJobs(true);
  runDailyJobs(true);
  expect(n).toBe(1);
});
