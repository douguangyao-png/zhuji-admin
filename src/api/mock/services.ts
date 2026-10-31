// 模拟后端的公共能力：留痕、消息、单据编号、审批流、待办。各模块的 mock.ts 只通过这里互相影响
import type { HolidayBase } from '../types';
import { hm, now, stamp, today } from '@/lib/time';
import { workDaysOf } from '@/lib/holidays';
import { describe, isWorkTime, nextWorkStart, waitText, workHoursOf, workMinutesBetween, workSpan } from '@/lib/worktime';
import {
  DEFAULT_PRODUCT_NAME, MSG_LEVELS, MSG_LEVEL_LABEL, type ApproverRule, type LoginLog, type AuditLog, type Message, type MsgGroup, type MsgLevel, type MsgLevelPolicy, type MsgPolicy, type MsgSendLog,
  type OrgUnit, type Role, type Settings, type Todo, type UrgeState, type User, type WfCond, type WfDef, type WfInstance, type WfNode, type WfPolicy, type WfStep,
} from '../types';
import { table, uid } from './db';
import { ApiError } from './router';
import { DEFAULT_MSG_POLICY, DEFAULT_WF_POLICY } from './seed';

export const users = table<User>('org_user');
export const units = table<OrgUnit>('org_unit');
export const roles = table<Role & { id: string }>('org_role');
export const settings = () => table<Settings & { id: string }>('sys_setting').all()[0];

export const userName = (id?: string) => (id ? users.get(id)?.name ?? '—' : '—');
export const unitName = (id?: string) => (id ? units.get(id)?.name ?? '—' : '—');
export const usersWithRole = (role: string) => users.where((u) => u.active && u.roleKeys.includes(role));
/** 角色里明确勾了这个权限点的启用人员；不含只有 * 的系统管理员，与后端 activeUsersWithPerm 一致 */
export const usersWithPerm = (perm: string) => users.where((u) => u.active && u.roleKeys.some((k) => roles.get(k)?.perms.includes(perm)));
export function permsOf(u: User): string[] {
  return [...new Set(u.roleKeys.flatMap((k) => roles.get(k)?.perms ?? []))];
}
/** 数据范围内的组织，null 为全部；与后端 OrgService.scopeUnits 一致 */
export function scopeUnitsOf(u: User): Set<string> | null {
  const rs = u.roleKeys.map((k) => roles.get(k)).filter((r): r is Role & { id: string } => Boolean(r));
  if (!rs.length || rs.some((r) => r.perms.includes('*') || !r.dataScope || r.dataScope === 'all')) return null;
  const out = new Set<string>();
  for (const r of rs) {
    if (r.dataScope === 'unit') out.add(u.unitId);
    if (r.dataScope === 'custom') (r.dataUnits ?? []).forEach((x) => out.add(x));
    if (r.dataScope === 'unitTree') {
      const seen = new Set<string>();
      const todo = [u.unitId];
      while (todo.length) {
        const x = todo.pop()!;
        if (seen.has(x)) continue;
        seen.add(x);
        todo.push(...units.where((c) => c.parentId === x).map((c) => c.id));
      }
      seen.forEach((x) => out.add(x));
    }
  }
  return out;
}
/** 管理列表里能不能看到这条：自己的总能看，其余按数据范围看申请人（或单据）所属组织 */
export function sees(u: User, ownerId: string | undefined, unitId: string | undefined) {
  const s = scopeUnitsOf(u);
  return !s || ownerId === u.id || (Boolean(unitId) && s.has(unitId!));
}
export const can = (u: User, perm: string) => { const ps = permsOf(u); return ps.includes('*') || ps.includes(perm); };
export function need(u: User, perm: string) { if (!can(u, perm)) throw new ApiError(403, '没有权限'); }

// ---------- 留痕 ----------

const audits = table<AuditLog>('sys_audit');
/** 记操作日志，只增不改不删；source 默认「页面操作」 */
export function audit(u: User, module: string, action: string, target: string, detail?: string, source = '页面操作') {
  audits.insert({ id: uid('L'), at: stamp(), userId: u.id, userName: u.name, module, action, target, detail, source });
}

// ---------- 登录日志 ----------

const loginLogs = table<LoginLog>('sys_login_log');
/** 记一条登录日志；模拟层拿不到 IP，记为空，浏览器信息取当前页面的 */
export function loginLog(e: Omit<LoginLog, 'id' | 'at' | 'ip' | 'ua'>) {
  loginLogs.insert({ id: uid('LL'), at: stamp(), ip: null, ua: typeof navigator === 'undefined' ? null : navigator.userAgent.slice(0, 200), ...e });
}

// ---------- 消息 ----------

/** ref：审批待办记 wf:<实例id>:<节点下标>；pushKey：推送去重键，缺省按 ref 或 类型+标题+链接+日期 */
export type StoredMessage = Message & { ref?: string; pushKey?: string };
export type NewMessage = Omit<Message, 'id' | 'to' | 'at' | 'read' | 'level' | 'levelLog'> & { level?: MsgLevel; ref?: string; pushKey?: string };
export const messages = table<StoredMessage>('msg_message');
const policies = table<MsgPolicy & { id: string }>('msg_policy');
const wfPolicies = table<WfPolicy & { id: string }>('wf_policy');

/** 工作时间：系统设置的上下班时间（那一处），哪天上班看节假日设置；不另存一份 */
export const workHours = () => workHoursOf(settings()?.workStart, settings()?.workEnd, table<HolidayBase>('sys_holiday').all(), workDaysOf(settings()));
/** 旧数据里没有策略时用默认值；workHours 只是说明文字 */
export const msgPolicy = (): MsgPolicy => {
  const p = policies.get('main');
  return { levels: p?.levels ?? DEFAULT_MSG_POLICY.levels, push: p?.push ?? DEFAULT_MSG_POLICY.push, workHours: describe(workHours()) };
};
export function saveMsgPolicy(p: Pick<MsgPolicy, 'levels' | 'push'>) {
  const v = { levels: p.levels, push: p.push };
  if (policies.get('main')) policies.update('main', v); else policies.insert({ id: 'main', ...v });
}
export const wfPolicy = (): WfPolicy => {
  const p = wfPolicies.get('main');
  return p ? { autoApprove: p.autoApprove, proxies: p.proxies } : DEFAULT_WF_POLICY;
};
export function saveWfPolicy(p: WfPolicy) {
  if (wfPolicies.get('main')) wfPolicies.update('main', p); else wfPolicies.insert({ id: 'main', ...p });
}

export const levelRank = (l: MsgLevel | undefined) => MSG_LEVELS.indexOf(l ?? 'normal');
const maxLevel = (a: MsgLevel, b: MsgLevel) => (levelRank(a) >= levelRank(b) ? a : b);
export const bumpLevel = (l: MsgLevel) => MSG_LEVELS[Math.min(MSG_LEVELS.length - 1, levelRank(l) + 1)];
const kindRule = (lp: MsgLevelPolicy, kind: string) => lp.kinds.find((k) => k.kind === kind) ?? lp.kinds.find((k) => k.kind === '*')
  ?? { kind: '*', level: 'normal' as MsgLevel, importantAfter: null, urgentAfter: null };
const toTime = (s: string) => new Date(s.trim().replace(' ', 'T')).getTime();

/** 事件未开始且临近时的等级和对应阈值；否则为次要，不影响取较高 */
function eventLevel(eventAt: string | null | undefined, lp: MsgLevelPolicy, t: Date): [MsgLevel, number] {
  if (!eventAt) return ['minor', 0];
  const left = toTime(eventAt) - t.getTime();
  if (Number.isNaN(left) || left < 0) return ['minor', 0];
  const m = Math.floor(left / 60000);
  if (m <= lp.eventUrgentWithin) return ['urgent', lp.eventUrgentWithin];
  if (m <= lp.eventImportantWithin) return ['important', lp.eventImportantWithin];
  return ['minor', 0];
}

/** 发消息时定等级：类型默认 → 标题关键字 → 离事件开始的时间，取最高 */
export function levelFor(m: Pick<NewMessage, 'kind' | 'title' | 'level' | 'eventAt'>, lp: MsgLevelPolicy = msgPolicy().levels, t = now()): MsgLevel {
  let l = maxLevel(kindRule(lp, m.kind).level, m.level ?? 'minor');
  for (const k of lp.keywords) if (k.keyword && m.title.includes(k.keyword)) l = maxLevel(l, k.level);
  return maxLevel(l, eventLevel(m.eventAt, lp, t)[0]);
}

export function notify(to: string | string[], m: NewMessage) {
  const level = levelFor(m);
  const at = stamp();
  const made = [...new Set(Array.isArray(to) ? to : [to])].map((id) => messages.insert({ ...m, eventAt: m.eventAt ?? null, level, id: uid('M'), to: id, at, read: false }));
  if (made.length) pushFor(made[0]);
}

// ---------- 群推送：同一件事只推一次，多个收件人也只推一次 ----------

let pushed = 0;
const pushes = table<{ id: string; at: string; level: MsgLevel; text: string; sent: boolean }>('msg_push');
const pushKeyOf = (m: StoredMessage) => m.pushKey ?? m.ref ?? `${m.kind}|${m.title}|${m.link ?? ''}|${m.at.slice(0, 10)}`;
const pushGroups = (level: MsgLevel) => {
  const p = msgPolicy().push;
  const ids = p.enabled ? p.rules.find((r) => r.level === level)?.groupIds ?? [] : [];
  return ids.map((id) => table<MsgGroup>('msg_group').get(id)).filter((g): g is MsgGroup => Boolean(g?.enabled));
};
export { maskText } from '@/lib/mask';
import { maskText } from '@/lib/mask';
/** 群里只放等级、标题、审批单号、链接，正文不出群；没填外网地址时不放链接 */
function pushText(m: StoredMessage) {
  const wf = /^wf:([^:]+):/.exec(m.pushKey ?? m.ref ?? '')?.[1];
  const base = settings()?.publicUrl;
  return [`【${MSG_LEVEL_LABEL[m.level]}】${settings()?.productName ?? DEFAULT_PRODUCT_NAME}消息：${maskText(m.title)}`, wf && `单号：审批 ${wf}`, base && m.link && `链接：${base}#${m.link}`].filter(Boolean).join('\n');
}
function sendPush(level: MsgLevel, text: string) {
  pushed++;
  for (const g of pushGroups(level)) {
    table<MsgSendLog>('msg_send_log').insert({ id: uid('SL'), at: stamp(), event: 'push', channel: g.channel, target: g.name, title: text.split('\n')[0], text, ok: true });
  }
}
function pushFor(m: StoredMessage) {
  const key = pushKeyOf(m);
  if (!pushGroups(m.level).length || pushes.get(key)) return;
  const p = msgPolicy();
  // 非工作时间不推时先记下，到工作时间由升级任务补推
  const wait = !p.push.offHours && !isWorkTime(now(), workHours());
  const text = pushText(m);
  pushes.insert({ id: key, at: stamp(), level: m.level, text, sent: !wait });
  if (!wait) sendPush(m.level, text);
}

// ---------- 自动升级：只升不降，非工作时间不跑 ----------

const wfRef = (ref?: string) => {
  const r = /^wf:(.+):(\d+)$/.exec(ref ?? '');
  return r ? { inst: wfInstances.get(r[1]), node: Number(r[2]) } : null;
};
/** 审批待办对应的节点还在等人处理 */
const wfWaiting = (ref?: string) => { const r = wfRef(ref); return Boolean(r?.inst && r.inst.status === 'pending' && r.inst.current === r.node); };
/** 排序时置顶：未读，且不是已经处理掉的审批待办 */
export const onTop = (m: StoredMessage) => !m.read && (!wfRef(m.ref) || wfWaiting(m.ref));

function raise(m: StoredMessage, to: MsgLevel, reason: string) {
  const from = m.level ?? 'normal';
  if (levelRank(to) <= levelRank(from)) return m;
  const next = messages.update(m.id, { level: to, levelLog: [...(m.levelLog ?? []), { at: stamp(), from, to, reason }] })!;
  pushFor(next);
  return next;
}

/** 定时任务（模拟后端在打开首页、消息时顺带跑）：补推等工作时间的推送，待办按等待的工作时间、事件按临近程度升级 */
export function escalate() {
  const p = msgPolicy();
  const t = now();
  pushed = 0;
  let escalated = 0;
  const wh = workHours();
  if (!isWorkTime(t, wh)) return { escalated, pushed };
  for (const x of pushes.where((r) => !r.sent)) { pushes.update(x.id, { sent: true }); sendPush(x.level, x.text); }
  for (const m of messages.all()) {
    const cands: [MsgLevel, string][] = [];
    const todo = m.ref?.startsWith('wf:') ? wfWaiting(m.ref) : !m.read && p.levels.todoPrefixes.some((x) => x && m.title.startsWith(x));
    if (todo) {
      const r = kindRule(p.levels, m.kind);
      const waited = workMinutesBetween(m.at, t, wh);
      const lv = r.urgentAfter != null && waited >= r.urgentAfter ? 'urgent' : r.importantAfter != null && waited >= r.importantAfter ? 'important' : null;
      if (lv) cands.push([lv, `已等待 ${workSpan(waited)}`]);
    }
    const [el, within] = eventLevel(m.eventAt, p.levels, t);
    if (within) cands.push([el, `距开始 ${within} 分钟内`]);
    const best = cands.sort((a, b) => levelRank(b[0]) - levelRank(a[0]))[0];
    if (best && levelRank(best[0]) > levelRank(m.level)) { raise(m, best[0], best[1]); escalated++; }
  }
  return { escalated, pushed };
}

// ---------- 单据编号 ----------

const serials = table<{ id: string; n: number }>('sys_serial');
/** 前缀 + 日期 + 3 位流水，如 YY20261015003 */
export function nextNo(prefix: string) {
  const key = `${prefix}${today().replace(/-/g, '')}`;
  const n = (serials.get(key)?.n ?? 0) + 1;
  if (serials.get(key)) serials.update(key, { n }); else serials.insert({ id: key, n });
  return `${key}${String(n).padStart(3, '0')}`;
}

// ---------- 审批流 ----------

export const wfDefs = table<WfDef & { id: string }>('wf_def');
export const wfInstances = table<WfInstance>('wf_instance');

type Done = (inst: WfInstance, result: 'approved' | 'rejected' | 'withdrawn', by: User) => void | 'notified';
const doneHandlers: Record<string, Done> = {};
/** 业务模块登记：审批结束后改自己的单据状态；自己已通知申请人时返回 'notified'，不再发通用的审批结果消息 */
export const onWorkflowDone = (type: string, fn: Done) => { doneHandlers[type] = fn; };
const approveGuards: Record<string, (inst: WfInstance, by: User) => void> = {};
/** 业务模块登记：审批人点通过前再查一次（如时段冲突），抛错即拦下；对应后端 WorkflowActGuard */
export const onWorkflowApprove = (type: string, fn: (inst: WfInstance, by: User) => void) => { approveGuards[type] = fn; };

function meets(c: WfCond | undefined, data: Record<string, unknown>) {
  if (!c) return true;
  const v = data[c.field];
  switch (c.op) {
    case '>': return Number(v) > Number(c.value);
    case '>=': return Number(v) >= Number(c.value);
    case '<': return Number(v) < Number(c.value);
    case '=': return String(v) === String(c.value);
    case 'in': return (c.value as string[]).includes(String(v));
  }
}

function approversOf(rule: ApproverRule, applicant: User, data: Record<string, unknown>): string[] {
  switch (rule.kind) {
    case 'role': return usersWithRole(rule.role).map((u) => u.id);
    case 'user': return [rule.userId];
    // 部门没设负责人时跳过这一级，后面的节点照常审
    case 'deptHead': { const h = units.get(applicant.unitId)?.headId; return h ? [h] : []; }
    // manager 是业务数据里的负责人，没设时这一级跳过
    case 'manager': { const m = data.managerId as string | undefined; return m ? [m] : []; }
    // 业务负责人缺失时只剩角色里的人
    case 'roleOrManager': return [...new Set([...usersWithRole(rule.role).map((u) => u.id), ...((data.managerIds as string[] | undefined) ?? [])])];
    case 'perm': return usersWithPerm(rule.perm).map((u) => u.id);
    case 'permOrManager': return [...new Set([...usersWithPerm(rule.perm).map((u) => u.id), ...((data.managerIds as string[] | undefined) ?? [])])];
  }
}
export const rulesOf = (n: WfNode) => (n.approvers?.length ? n.approvers : [n.approver]);
/** 多条规则取并集（或签），未排除申请人 */
export const nodeApprovers = (n: WfNode, applicant: User, data: Record<string, unknown>) => [...new Set(rulesOf(n).flatMap((r) => approversOf(r, applicant, data)))];

/** 连续两个节点审批人相同只审一次，名称括号里的条件合并；自动通过与人审不合并 */
function mergeSame(nodes: WfInstance['nodes']) {
  const out: WfInstance['nodes'] = [];
  const split = (n: string) => /^(.*)（(.*)）$/.exec(n) ?? [n, n, ''];
  for (const n of nodes) {
    const p = out[out.length - 1];
    if (!p || p.approverIds.join() !== n.approverIds.join() || (p.auto ?? null) !== (n.auto ?? null)) { out.push(n); continue; }
    const [, a, ca] = split(p.name), [, b, cb] = split(n.name);
    p.name = a === b && ca && cb ? `${a}（${ca}、${cb}）` : `${p.name}、${n.name}`;
  }
  return out;
}

const WHY_ADMIN = '申请人是系统管理员';
const WHY_SELF = '申请人本人是该节点审批人';
const WHY_PERM = '申请人有该节点的审批权限';
/** 申请人有节点规则要求的权限或角色、或本人就在审批人里；系统管理员的 * 不算，由整单规则管 */
function selfReason(n: WfNode, raw: string[], applicant: User) {
  const perms = permsOf(applicant);
  for (const r of rulesOf(n)) {
    if ((r.kind === 'perm' || r.kind === 'permOrManager') && perms.includes(r.perm)) return WHY_PERM;
    if ((r.kind === 'role' || r.kind === 'roleOrManager') && applicant.roleKeys.includes(r.role)) return WHY_PERM;
  }
  return raw.includes(applicant.id) ? WHY_SELF : null;
}

const todoMsg = (inst: WfInstance, idx: number) => notify(inst.nodes[idx].approverIds, {
  kind: '审批', title: `待审批：${inst.typeName}`, body: `${inst.applicantName}：${inst.title}`, link: '/approvals', ref: `wf:${inst.id}:${idx}`,
});

/** 发起审批；没有需要审的节点时直接通过。data 里放条件字段（人数、时段等）和 managerId */
export function startWorkflow(type: string, biz: { id: string; title: string; data?: Record<string, unknown> }, applicant: User, link?: string): WfInstance {
  const def = wfDefs.find((d) => d.type === type);
  const data = biz.data ?? {};
  const pol = wfPolicy().autoApprove;
  const auto = pol.enabled;
  const admin = auto && pol.admin && (applicant.roleKeys.includes('admin') || can(applicant, '*'));
  const self = auto && pol.self;
  const nodes = mergeSame((def?.active ? def.nodes : [])
    .filter((n) => meets(n.when, data))
    .map((n) => {
      const raw = nodeApprovers(n, applicant, data);
      const why = admin ? WHY_ADMIN : self ? selfReason(n, raw, applicant) : null;
      // 不自动通过时沿用原规则：排除申请人本人，指定人员就是本人的除外
      const keepSelf = !self && rulesOf(n).some((r) => r.kind === 'user' && r.userId === applicant.id);
      return { name: n.name, approverIds: raw.filter((id) => keepSelf || id !== applicant.id), ...(why ? { auto: why } : {}) };
    })
    .filter((n) => n.auto || n.approverIds.length));
  const first: WfStep = { node: '提交', userId: applicant.id, userName: applicant.name, action: '提交', at: stamp() };
  const inst: WfInstance = {
    id: uid('W'), type, typeName: def?.name ?? type, bizId: biz.id, title: biz.title, applicantId: applicant.id, applicantName: applicant.name,
    status: 'pending', nodes, current: 0, steps: [first], createdAt: stamp(), data: { ...data, link },
  };
  wfInstances.insert(inst);
  if (!nodes.length) return finish(inst, 'approved', applicant, { step: true });
  return advance(inst.id, applicant, false);
}

/** 姓名本身就是「系统管理员」的账号不重复写，与后端 WorkflowEngine.adminName 一致 */
const adminName = (name: string) => (name.includes('系统管理员') ? name : `系统管理员 ${name}`);

/** 走过发起时判定为自动通过的节点，停在下一个要人审的节点并发待办；acted 为有人审过，全部走完时通知申请人 */
function advance(id: string, by: User, acted: boolean): WfInstance {
  const inst = wfInstances.get(id)!;
  const steps = [...inst.steps];
  let cur = inst.current;
  for (; cur < inst.nodes.length && inst.nodes[cur].auto; cur++) {
    const n = inst.nodes[cur];
    steps.push({ node: n.name, userId: null, userName: '系统', action: '自动通过', comment: n.auto!, at: stamp() });
    notify(n.approverIds.filter((x) => x !== inst.applicantId), n.auto === WHY_ADMIN
      ? { kind: '审批', title: `${adminName(inst.applicantName)} 提交的${inst.typeName}已自动通过`, body: inst.title, link: '/approvals' }
      : { kind: '审批', title: `${inst.applicantName} 提交的${inst.typeName}已在「${n.name}」自动通过`, body: `${inst.title}（${n.auto}，不用再审）`, link: '/approvals' });
  }
  const updated = wfInstances.update(id, { steps, current: cur })!;
  if (cur >= inst.nodes.length) return finish(updated, 'approved', by, { silent: !acted });
  todoMsg(updated, cur);
  return updated;
}

/** step：记一步「系统 自动通过」；silent：不给申请人发审批结果 */
function finish(inst: WfInstance, result: 'approved' | 'rejected' | 'withdrawn', by: User, opts: { step?: boolean; silent?: boolean } = {}) {
  const done = wfInstances.update(inst.id, (i) => ({
    status: result,
    steps: opts.step ? [...i.steps, { node: '审批', userId: by.id, userName: '系统', action: '自动通过', at: stamp() }] : i.steps,
  }))!;
  const notified = doneHandlers[inst.type]?.(done, result, by) === 'notified';
  if (result !== 'withdrawn' && !opts.step && !opts.silent && !notified) {
    notify(inst.applicantId, { kind: '审批', title: `${inst.typeName}${result === 'approved' ? '已通过' : '被驳回'}`, body: inst.title, link: String(inst.data.link ?? '/approvals') });
  }
  return done;
}

/** 代审：我的角色在 proxies 里覆盖了这类流程 */
export const canProxy = (u: User, type: string) => wfPolicy().proxies.some((p) => u.roleKeys.includes(p.role) && (p.types.includes('*') || p.types.includes(type)));

export function actWorkflow(id: string, by: User, action: 'approve' | 'reject', comment?: string) {
  const inst = wfInstances.get(id);
  if (!inst || inst.status !== 'pending') throw new ApiError(422, '这条审批已经处理过了');
  const node = inst.nodes[inst.current];
  const own = node.approverIds.includes(by.id);
  if (!own && !can(by, '*') && !canProxy(by, inst.type)) throw new ApiError(403, '不是当前节点的审批人');
  if (action === 'reject' && !comment?.trim()) throw new ApiError(422, '驳回要填写意见');
  if (action === 'approve') approveGuards[inst.type]?.(inst, by);
  const proxyFor = own ? '' : node.approverIds.map(userName).join('、') || node.name;
  const step: WfStep = { node: node.name, userId: by.id, userName: by.name, action: action === 'approve' ? '通过' : '驳回', comment, at: stamp(), ...(proxyFor ? { proxyFor } : {}) };
  const updated = wfInstances.update(id, (i) => ({ steps: [...i.steps, step], current: action === 'approve' ? i.current + 1 : i.current }))!;
  if (proxyFor) notify(node.approverIds, { kind: '审批', title: `${by.name} 代你审核了：${inst.typeName}`, body: `${step.action}：${inst.title}`, link: '/approvals' });
  if (action === 'reject') return finish(updated, 'rejected', by);
  return advance(id, by, true);
}

export function withdrawWorkflow(bizId: string, by: User) {
  const inst = wfInstances.find((i) => i.bizId === bizId && i.status === 'pending');
  if (!inst) return;
  wfInstances.update(inst.id, (i) => ({ steps: [...i.steps, { node: '撤回', userId: by.id, userName: by.name, action: '撤回', at: stamp() }] }));
  finish(wfInstances.get(inst.id)!, 'withdrawn', by);
}

// ---------- 催办 ----------

const urges = table<{ id: string; instId: string; userId: string; userName: string; node: string; level: MsgLevel; at: string }>('wf_urge');

export function urgeState(inst: WfInstance, u: User): UrgeState {
  const p = msgPolicy();
  const interval = p.levels.urgeIntervalMinutes;
  const records = urges.where((r) => r.instId === inst.id).sort((a, b) => b.at.localeCompare(a.at));
  const t = now();
  const out = (reason: string | null, next: Date | null = null): UrgeState => ({
    allowed: !reason, reason, nextAt: next && stamp(next), interval,
    records: records.map((r) => ({ at: r.at, userName: r.userName, node: r.node, level: r.level })),
  });
  if (inst.status !== 'pending') return out('这条审批已结束');
  if (inst.applicantId !== u.id) return out('只有申请人可以催办');
  const wh = workHours();
  if (!isWorkTime(t, wh)) return out(`现在是非工作时间（工作时间 ${describe(wh)}），不能催办`, nextWorkStart(t, wh));
  const last = records.find((r) => r.userId === u.id);
  const next = last && new Date(toTime(last.at) + interval * 60000);
  if (next && next > t) return out(`${interval} 分钟内只能催办一次，${hm(next)} 后可再催`, next);
  return out(null);
}

/** 给当前节点审批人发催办，他们这一节点的待办消息各升一级 */
export function urgeWorkflow(id: string, u: User): UrgeState {
  const inst = wfInstances.get(id);
  if (!inst) throw new ApiError(404, '审批不存在');
  const st = urgeState(inst, u);
  if (!st.allowed) throw new ApiError(422, st.reason!);
  const node = inst.nodes[inst.current];
  const ref = `wf:${inst.id}:${inst.current}`;
  let top: MsgLevel = 'minor';
  const waited = waitText(workMinutesBetween(inst.steps[inst.steps.length - 1]?.at ?? inst.createdAt, now(), workHours()));
  for (const to of node.approverIds) {
    const todo = messages.find((m) => m.ref === ref && m.to === to);
    const lv = bumpLevel(todo?.level ?? levelFor({ kind: '审批', title: `待审批：${inst.typeName}` }));
    if (todo) raise(todo, lv, '申请人催办');
    // 催办和待办是同一件事，推送共用一个去重键
    notify(to, { kind: '审批', title: `催办：${inst.typeName}`, body: `${inst.applicantName} 催办：${inst.title}（这一步已等待 ${waited}）`, link: '/approvals', level: lv, pushKey: ref });
    top = maxLevel(top, lv);
  }
  urges.insert({ id: uid('UR'), instId: inst.id, userId: u.id, userName: u.name, node: node.name, level: top, at: stamp() });
  audit(u, '审批', '催办', `${inst.typeName}：${inst.title}`, `节点「${node.name}」，待办升为${MSG_LEVEL_LABEL[top]}`);
  return urgeState(inst, u);
}

export const pendingFor = (u: User) => wfInstances.where((i) => i.status === 'pending' && (i.nodes[i.current]?.approverIds.includes(u.id) ?? false));
/** 我可以代审、但不是当前节点审批人的单据 */
export const proxyPendingFor = (u: User) => wfInstances.where((i) => i.status === 'pending' && canProxy(u, i.type) && !(i.nodes[i.current]?.approverIds.includes(u.id) ?? false));
export const workflowOf = (bizId: string) => wfInstances.where((i) => i.bizId === bizId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

// ---------- 首页待办 ----------

const todoProviders: ((u: User) => Todo[])[] = [];
/** 模块登记待办，如被驳回的登记、到期提醒；审批待办由审批流统一出 */
export const registerTodos = (fn: (u: User) => Todo[]) => { todoProviders.push(fn); };
export function todosOf(u: User): Todo[] {
  const byType = new Map<string, { label: string; n: number }>();
  for (const i of pendingFor(u)) { const t = byType.get(i.type) ?? { label: `待审批 · ${i.typeName}`, n: 0 }; t.n++; byType.set(i.type, t); }
  const wf: Todo[] = [...byType].map(([type, t]) => ({ key: `wf:${type}`, module: '审批', label: t.label, count: t.n, to: `/approvals?type=${type}`, tone: 'warn' }));
  return [...wf, ...todoProviders.flatMap((f) => f(u))].filter((t) => t.count > 0);
}
