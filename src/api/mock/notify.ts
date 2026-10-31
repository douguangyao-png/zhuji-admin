// 群消息推送：模块调用 publish(event, vars)，按规则发站内消息和钉钉 / 企业微信群消息。
// 真实发送在后端 message 包（群机器人 Webhook）；这里只生成消息正文并记下发送记录，界面按群聊样式预览
import { stamp, today } from '@/lib/time';
import type { MsgEvent, MsgGroup, MsgRule, MsgSendLog } from '../types';
import { table, uid } from './db';
import { ApiError, mock } from './router';
import { registerSeed } from './seed';
import { audit, msgPolicy, need, notify, users } from './services';

const groups = table<MsgGroup>('msg_group');
const rules = table<MsgRule>('msg_rule');
const sendLog = table<MsgSendLog>('msg_send_log');
const jobsDone = table<{ id: string; at: string }>('msg_job_done');

/** 内置推送规则；新模块在 types.ts 的 MsgEvent 加事件，并在这里加一条默认规则 */
const RULES: Omit<MsgRule, 'groupIds'>[] = [
  { id: 'example.submitted', name: '示例登记提交', module: '示例', when: '示例登记提交审批时', enabled: true, site: true, atApplicant: false,
    template: '【示例登记】{applicant}（{dept}）提交了 {title}\n金额：{amount} 元' },
  { id: 'example.approved', name: '示例登记通过', module: '示例', when: '示例登记审批通过时', enabled: true, site: true, atApplicant: true,
    template: '【示例登记】{title} 已审核通过\n申请人：{applicant}' },
];

registerSeed(5, (d) => {
  const g: MsgGroup[] = [
    { id: 'G1', name: '业务工作群', channel: 'wecom', webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=****', secret: '', enabled: true },
    { id: 'G2', name: '管理员群', channel: 'dingtalk', webhook: 'https://oapi.dingtalk.com/robot/send?access_token=****', secret: 'SEC****', enabled: true },
  ];
  d.msg_group = g;
  d.msg_rule = RULES.map((r) => ({ ...r, groupIds: ['G1'] }));
});

const render = (tpl: string, vars: Record<string, string | number | undefined>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

/**
 * 发出一个业务事件。vars 是模板变量；applicantId 收站内消息、群里被 @；link 是站内消息点开的页面。
 * 规则停用时什么也不发；返回是否给本人发了站内消息。
 */
export function publish(event: MsgEvent, vars: Record<string, string | number | undefined>, opts: { applicantId?: string; link?: string } = {}) {
  // 早先存下的演示数据里没有后加的规则，按内置规则发，和后端一致
  const builtIn = RULES.find((r) => r.id === event);
  const rule = rules.get(event) ?? (builtIn && { ...builtIn, groupIds: [] });
  if (!rule?.enabled) return false;
  const text = render(rule.template, vars);
  const title = text.split('\n')[0];
  const who = opts.applicantId ? users.get(opts.applicantId) : undefined;
  if (rule.site && who) {
    // 带日期和开始时刻的事件，消息等级按离开始多久定
    const eventAt = vars.date && vars.start ? `${vars.date} ${vars.start}` : null;
    notify(who.id, { kind: rule.module, title, body: text.split('\n').slice(1).join('；'), link: opts.link, eventAt });
    sendLog.insert({ id: uid('SL'), at: stamp(), event, channel: 'site', target: who.name, title, text, ok: true });
  }
  for (const gid of rule.groupIds) {
    const g = groups.get(gid);
    if (!g?.enabled) continue;
    const at = rule.atApplicant && who ? `\n@${who.name}${who.phone ? `（${who.phone.slice(0, 3)}****${who.phone.slice(7)}）` : ''}` : '';
    sendLog.insert({ id: uid('SL'), at: stamp(), event, channel: g.channel, target: g.name, title, text: text + at, ok: true });
  }
  return Boolean(rule.site && who);
}

// ---------- 定时任务：每天跑一次，同一件事同一天只提醒一次 ----------

type Job = (day: string) => void;
const jobs: { name: string; fn: Job }[] = [];
/** 模块登记每日任务，如到期提醒；任务里用 once() 去重 */
export const registerDailyJob = (name: string, fn: Job) => { jobs.push({ name, fn }); };
/** key 当天第一次出现时返回 true */
export function once(key: string) {
  const id = `${today()}:${key}`;
  if (jobsDone.get(id)) return false;
  jobsDone.insert({ id, at: stamp() });
  return true;
}
let lastRun = '';
/** 打开系统时补跑当天的定时任务（模拟后端没有常驻进程） */
export function runDailyJobs(force = false) {
  if (!force && lastRun === today()) return 0;
  lastRun = today();
  const before = sendLog.all().length;
  for (const j of jobs) j.fn(today());
  return sendLog.all().length - before;
}

// ---------- 接口 ----------

mock.get('/notify/groups', ({ user }) => { need(user, 'sys:device'); return groups.all(); });
mock.post('/notify/groups', ({ user, body }) => {
  need(user, 'sys:device');
  audit(user, '系统', '新增群机器人', body.name);
  return groups.insert({ id: uid('G'), name: body.name, channel: body.channel, webhook: body.webhook ?? '', secret: body.secret ?? '', enabled: true });
});
mock.put('/notify/groups/:id', ({ user, params, body }) => { need(user, 'sys:device'); audit(user, '系统', '修改群机器人', body.name ?? params.id); return groups.update(params.id, body); });
mock.del('/notify/groups/:id', ({ user, params }) => {
  need(user, 'sys:device');
  if (rules.find((r) => r.groupIds.includes(params.id))) throw new ApiError(422, '还有推送规则在用这个群，先在规则里去掉');
  if (msgPolicy().push.rules.some((r) => r.groupIds.includes(params.id))) throw new ApiError(422, '推送策略里还有消息等级推到这个群，先在推送策略里去掉');
  groups.remove(params.id);
  return true;
});
mock.post('/notify/groups/:id/test', ({ user, params }) => {
  need(user, 'sys:device');
  const g = groups.get(params.id);
  if (!g) throw new ApiError(404, '不存在');
  if (!g.webhook) throw new ApiError(422, '还没填 Webhook 地址');
  sendLog.insert({ id: uid('SL'), at: stamp(), event: 'example.submitted', channel: g.channel, target: g.name, title: '【测试】消息推送', text: `【测试】消息推送\n由 ${user.name} 在接口配置里发送，收到说明群机器人配置正确。`, ok: true });
  return { ok: true, detail: `已发送到「${g.name}」（模拟）` };
});

mock.get('/notify/rules', ({ user }) => { need(user, 'sys:device'); return rules.all(); });
mock.put('/notify/rules/:id', ({ user, params, body }) => { need(user, 'sys:device'); audit(user, '系统', '修改推送规则', rules.get(params.id)?.name ?? params.id); return rules.update(params.id, body); });
mock.get('/notify/log', ({ query }) => sendLog.where((l) => (!query.channel || query.channel.split(',').some((x) => (x.trim() === 'group' ? l.channel !== 'site' : l.channel === x.trim()))) && (!query.event || l.event === query.event))
  .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200));
mock.post('/notify/run-jobs', ({ user }) => { need(user, 'sys:device'); return { sent: runDailyJobs(true) }; });
mock.get('/notify/preview/:event', ({ params }) => {
  const r = rules.get(params.event);
  return r ? render(r.template, SAMPLE) : '';
});

const SAMPLE: Record<string, string> = { applicant: '张三', dept: '业务一部', title: '示例登记 SL-0001', amount: '12000.00' };
