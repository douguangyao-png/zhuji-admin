import { get, post, put } from '@/api/http';
import { table } from '@/api/mock/db';
import { notify, startWorkflow, users, type StoredMessage } from '@/api/mock/services';
import type { Message, MsgPolicy, MsgSendLog, Page, Role, UrgeState, WfDef, WfInstance, WfPolicy } from '@/api/types';
import { useSession } from '@/core/session';
import { setNow } from '@/lib/time';
import { freshDb } from './render';
import '@/api/mock';

// 消息等级、自动升级、催办、推送、自动通过、多审批人与代审。2026-10-15 周四，10-17/18 周末
// 演示账号：U01 系统管理员，U02 业务管理员，U03 业务一部负责人，U04 业务一部职员，U05 业务二部职员
const fiveDays = () => { const s = table<{ id: string; workDays?: number[] }>('sys_setting').all()[0]; table<{ id: string; workDays?: number[] }>('sys_setting').update(s.id, { workDays: [1, 2, 3, 4, 5] }); };
beforeEach(() => { setNow('2026-10-15 10:00:00'); freshDb(); fiveDays(); });
afterAll(() => setNow(null));

const as = (id: string) => useSession.getState().login(id);
const msgs = () => table<StoredMessage>('msg_message');
const mine = (to: string, f: (m: StoredMessage) => boolean = () => true) => msgs().where((m) => m.to === to && f(m));
const pushLog = () => table<MsgSendLog>('msg_send_log').where((l) => l.event === 'push');
const user = (id: string) => users.get(id)!;
const nm = (id: string) => user(id).name;
/** 测试用的流程：节点和审批人规则按需给 */
function def(nodes: WfDef['nodes'], type = 'tTest') {
  table<WfDef & { id: string }>('wf_def').insert({ id: type, type, name: '测试单', active: true, nodes });
  return type;
}
const policy = (p: Partial<WfPolicy['autoApprove']>) => { as('U01'); return put('/wf-policy', { autoApprove: { enabled: true, admin: true, self: true, ...p } }); };

describe('等级与排序', () => {
  test('发消息时定等级：类型默认、关键字、离开始的时间取最高', () => {
    notify('U04', { kind: '公告', title: '月度公告', body: '' });
    notify('U04', { kind: '示例', title: '登记逾期未处理', body: '' });
    notify('U04', { kind: '示例', title: '设备报警：机房温度', body: '' });
    notify('U04', { kind: '示例', title: '明天的会', body: '', eventAt: '2026-10-15 11:30' });
    notify('U04', { kind: '示例', title: '马上开始的会', body: '', eventAt: '2026-10-15 10:20' });
    const lv = Object.fromEntries(mine('U04', (m) => !m.id.startsWith('MS')).map((m) => [m.title, m.level]));
    expect(lv).toEqual({ 月度公告: 'minor', 登记逾期未处理: 'important', '设备报警：机房温度': 'urgent', 明天的会: 'important', 马上开始的会: 'urgent' });
  });

  test('未读按紧急、重要、一般、次要置顶，已读和处理过的审批待办按时间排在后面', async () => {
    msgs().removeWhere((m) => m.to === 'U05');
    notify('U05', { kind: '示例', title: '一般 1', body: '' });
    setNow('2026-10-15 10:05:00');
    notify('U05', { kind: '公告', title: '次要', body: '' });
    notify('U05', { kind: '示例', title: '设备报警：紧急', body: '' });
    setNow('2026-10-15 10:10:00');
    notify('U05', { kind: '示例', title: '逾期 重要但已读', body: '' });
    msgs().update(mine('U05', (m) => m.title.startsWith('逾期'))[0].id, { read: true });
    // 审批待办：节点处理后不再置顶
    const t = def([{ name: '审核', approver: { kind: 'user', userId: 'U05' } }]);
    await policy({ enabled: false });
    setNow('2026-10-15 10:15:00');
    const w = startWorkflow(t, { id: 'B1', title: '一张单' }, user('U04'));
    as('U05');
    let r = await get<Page<Message> & { urgent: number }>('/messages', { size: 50 });
    expect(r.items.map((m) => m.title)).toEqual(['设备报警：紧急', '待审批：测试单', '一般 1', '次要', '逾期 重要但已读']);
    expect(r.urgent).toBe(1);
    await post(`/approvals/${w.id}/approve`, {});
    r = await get('/messages', { size: 50 });
    expect(r.items.map((m) => m.title)).toEqual(['设备报警：紧急', '一般 1', '次要', '待审批：测试单', '逾期 重要但已读']);
    expect((await get<Page<Message>>('/messages', { level: 'minor' })).items.map((m) => m.title)).toEqual(['次要']);
  });
});

describe('自动升级', () => {
  test('待办按等待的工作时间升级，跨周末只算工作时间，只升不降并记原因', async () => {
    setNow('2026-10-16 16:00:00');
    notify('U05', { kind: '示例', title: '待确认登记 3 条', body: '' });
    const id = mine('U05', (m) => m.title === '待确认登记 3 条')[0].id;
    as('U05');
    setNow('2026-10-17 10:00:00'); // 周六不跑
    await get('/messages');
    expect(msgs().get(id)!.level).toBe('normal');
    setNow('2026-10-19 10:59:00');
    await get('/messages');
    expect(msgs().get(id)!.level).toBe('normal');
    setNow('2026-10-19 11:00:00');
    await get('/home/todos');
    expect(msgs().get(id)).toMatchObject({ level: 'important', levelLog: [{ from: 'normal', to: 'important', reason: '已等待 4 个工作小时' }] });
    setNow('2026-10-20 11:00:00');
    await get('/messages');
    expect(msgs().get(id)!.levelLog!.map((x) => x.to)).toEqual(['important', 'urgent']);
  });

  test('已读的待办前缀消息不再升级；事件临近时升级', async () => {
    notify('U05', { kind: '示例', title: '待确认登记 1 条', body: '' });
    notify('U05', { kind: '示例', title: '下午的会', body: '', eventAt: '2026-10-15 14:00' });
    const [a, b] = ['待确认登记 1 条', '下午的会'].map((t) => mine('U05', (m) => m.title === t)[0].id);
    msgs().update(a, { read: true });
    as('U05');
    setNow('2026-10-15 13:40:00');
    await get('/messages');
    expect(msgs().get(a)!.level).toBe('normal');
    expect(msgs().get(b)).toMatchObject({ level: 'urgent', levelLog: [{ to: 'urgent', reason: '距开始 30 分钟内' }] });
  });
});

describe('催办', () => {
  async function submit() {
    const t = def([{ name: '部门审核', approver: { kind: 'user', userId: 'U03' }, approvers: [{ kind: 'user', userId: 'U03' }, { kind: 'user', userId: 'U02' }] }]);
    return startWorkflow(t, { id: 'B2', title: '急用的单' }, user('U04'));
  }

  test('申请人催办：审批人收到催办、待办升一级；60 分钟内不能再催；别人看不到', async () => {
    const w = await submit();
    as('U04');
    expect((await get<UrgeState>(`/approvals/${w.id}/urge`)).allowed).toBe(true);
    const r = await post<UrgeState>(`/approvals/${w.id}/urge`);
    expect(r).toMatchObject({ allowed: false, reason: '60 分钟内只能催办一次，11:00 后可再催', nextAt: '2026-10-15 11:00:00', records: [{ userName: nm('U04'), node: '部门审核', level: 'important' }] });
    for (const to of ['U03', 'U02']) {
      expect(mine(to, (m) => m.title === '催办：测试单')[0]).toMatchObject({ level: 'important', body: `${nm('U04')} 催办：急用的单（这一步已等待 0 个工作分钟）` });
      expect(mine(to, (m) => m.title === '待审批：测试单')[0]).toMatchObject({ level: 'important', levelLog: [{ reason: '申请人催办' }] });
    }
    await expect(post(`/approvals/${w.id}/urge`)).rejects.toMatchObject({ status: 422, message: '60 分钟内只能催办一次，11:00 后可再催' });
    setNow('2026-10-15 11:00:00');
    await post(`/approvals/${w.id}/urge`);
    expect(mine('U03', (m) => m.title === '待审批：测试单')[0].level).toBe('urgent');
    expect(table<{ id: string; action: string }>('sys_audit').where((a) => a.action === '催办')).toHaveLength(2);
    as('U05');
    await expect(get(`/approvals/${w.id}/urge`)).rejects.toMatchObject({ status: 403 });
  });

  test('非工作时间不能催办，审批结束后也不能', async () => {
    const w = await submit();
    as('U04');
    setNow('2026-10-17 10:00:00');
    expect(await get<UrgeState>(`/approvals/${w.id}/urge`)).toMatchObject({ allowed: false, reason: '现在是非工作时间（工作时间 周一至周五 08:00–17:00），不能催办', nextAt: '2026-10-19 08:00:00' });
    await expect(post(`/approvals/${w.id}/urge`)).rejects.toMatchObject({ status: 422 });
    setNow('2026-10-19 09:00:00');
    as('U02');
    await post(`/approvals/${w.id}/approve`, {});
    as('U04');
    expect((await get<UrgeState>(`/approvals/${w.id}/urge`)).reason).toBe('这条审批已结束');
  });
});

describe('自动通过', () => {
  test('系统管理员提交：整单自动通过，只通知原审批人，不给自己发结果', () => {
    const t = def([{ name: '一审', approver: { kind: 'user', userId: 'U04' } }, { name: '二审', approver: { kind: 'perm', perm: 'example:approve' } }]);
    const w = startWorkflow(t, { id: 'B3', title: '管理员的单' }, user('U01'));
    expect(w.status).toBe('approved');
    expect(w.steps.slice(1).map((s) => [s.node, s.userName, s.action, s.comment])).toEqual([['一审', '系统', '自动通过', '申请人是系统管理员'], ['二审', '系统', '自动通过', '申请人是系统管理员']]);
    expect(mine('U04', (m) => m.title === '系统管理员 提交的测试单已自动通过')).toHaveLength(1);
    expect(mine('U02', (m) => m.title.includes('已自动通过'))).toHaveLength(1);
    expect(mine('U01', (m) => m.title.startsWith('测试单'))).toHaveLength(0);
  });

  test('本人是节点审批人、有节点权限时该节点自动通过并通知其他审批人，后面照常', () => {
    const t = def([
      { name: '指定人审', approver: { kind: 'user', userId: 'U04' }, approvers: [{ kind: 'user', userId: 'U04' }, { kind: 'user', userId: 'U05' }] },
      { name: '管理员审', approver: { kind: 'user', userId: 'U02' } },
    ]);
    const w = startWorkflow(t, { id: 'B4', title: '职员的单' }, user('U04'));
    expect(w).toMatchObject({ status: 'pending', current: 1 });
    expect(w.nodes[0]).toMatchObject({ auto: '申请人本人是该节点审批人', approverIds: ['U05'] });
    expect(w.steps[1]).toMatchObject({ node: '指定人审', userId: null, action: '自动通过', comment: '申请人本人是该节点审批人' });
    expect(mine('U05', (m) => m.title === `${nm('U04')} 提交的测试单已在「指定人审」自动通过` && m.body === '职员的单（申请人本人是该节点审批人，不用再审）')).toHaveLength(1);
    expect(mine('U02', (m) => m.title === '待审批：测试单')).toHaveLength(1);

    const p = def([{ name: '业务审批', approver: { kind: 'perm', perm: 'example:approve' } }], 'tPerm');
    const w2 = startWorkflow(p, { id: 'B5', title: '业务管理员自己的单' }, user('U02'));
    expect(w2.status).toBe('approved');
    expect(w2.steps[1].comment).toBe('申请人有该节点的审批权限');
  });

  test('关掉自动通过后：申请人不审自己的单，交给有同样权限的其他人', async () => {
    table<Role & { id: string }>('org_role').insert({ id: 'rA', key: 'rA', name: 'rA', desc: '', builtin: false, perms: ['example:approve'] });
    table<{ id: string; roleKeys: string[] }>('org_user').update('U03', { roleKeys: ['user', 'rA'] });
    table<{ id: string; roleKeys: string[] }>('org_user').update('U05', { roleKeys: ['user', 'rA'] });
    await policy({ enabled: false });
    const t = def([{ name: '审', approver: { kind: 'perm', perm: 'example:approve' } }]);
    expect(startWorkflow(t, { id: 'B6', title: '关掉后' }, user('U02')).nodes[0]).toEqual({ name: '审', approverIds: ['U03', 'U05'] });
  });
});

describe('多审批人与代审', () => {
  test('节点多条规则取并集，任一人通过即可', async () => {
    await policy({ enabled: false });
    const t = def([{ name: '审核', approver: { kind: 'deptHead' }, approvers: [{ kind: 'deptHead' }, { kind: 'role', role: 'user' }, { kind: 'perm', perm: 'sys:audit' }, { kind: 'user', userId: 'U02' }] }]);
    const w = startWorkflow(t, { id: 'B7', title: '并集' }, user('U04'));
    const ids = w.nodes[0].approverIds;
    expect(ids).toEqual(expect.arrayContaining(['U03', 'U05', 'U02']));
    expect(ids).not.toContain('U04');
    expect(new Set(ids).size).toBe(ids.length);
    as('U02');
    expect((await post<WfInstance>(`/approvals/${w.id}/approve`, {})).status).toBe('approved');
  });

  test('代审：角色覆盖的流程出现在「可代审」，审批记录写代谁审，并通知原审批人', async () => {
    as('U01');
    await put('/wf-policy', { proxies: [{ role: 'user', types: ['tTest'] }] });
    const t = def([{ name: '管理员审', approver: { kind: 'user', userId: 'U02' } }]);
    const w = startWorkflow(t, { id: 'B8', title: '请人代审' }, user('U05'));
    as('U03');
    expect((await get<Page<WfInstance>>('/approvals', { scope: 'proxy' })).items.map((i) => i.id)).toEqual([w.id]);
    const r = await post<WfInstance>(`/approvals/${w.id}/approve`, { comment: '管理员出差' });
    expect(r.status).toBe('approved');
    expect(r.steps[1]).toMatchObject({ userName: nm('U03'), proxyFor: nm('U02'), action: '通过' });
    expect(mine('U02', (m) => m.title === `${nm('U03')} 代你审核了：测试单`)[0].body).toBe('通过：请人代审');
    // 没有代审范围的流程不能处理
    const other = startWorkflow(def([{ name: '审', approver: { kind: 'user', userId: 'U02' } }], 'tOther'), { id: 'B9', title: '别的' }, user('U05'));
    await expect(post(`/approvals/${other.id}/approve`, {})).rejects.toMatchObject({ status: 403 });
  });
});

describe('推送', () => {
  const urgentTo = async (groupIds: string[], offHours = false) => {
    as('U01');
    await put<MsgPolicy>('/msg-policy', { push: { enabled: true, offHours, retries: 2, rules: [{ level: 'urgent', groupIds }] } });
  };

  test('同一件事多人收到只推一次，内容只有等级、标题、链接，手机号打码', async () => {
    await urgentTo(['G1']);
    await put('/settings', { publicUrl: 'https://app.example.com/' });
    notify(['U01', 'U02', 'U04'], { kind: '示例', title: '设备报警：张三 13812345678 带出笔记本', body: '正文不进群', link: '/example' });
    notify(['U03'], { kind: '示例', title: '设备报警：张三 13812345678 带出笔记本', body: '再发一次', link: '/example' });
    notify(['U03'], { kind: '示例', title: '登记逾期', body: '重要不推' });
    expect(pushLog()).toHaveLength(1);
    expect(pushLog()[0]).toMatchObject({ channel: 'wecom', target: '业务工作群', text: '【紧急】xxx管理系统消息：设备报警：张三 138****5678 带出笔记本\n链接：https://app.example.com/#/example' });
  });

  test('审批待办按实例和节点只推一次，带单号；非工作时间等到工作时间再推', async () => {
    await urgentTo(['G2']);
    const t = def([{ name: '审', approver: { kind: 'user', userId: 'U03' }, approvers: [{ kind: 'user', userId: 'U03' }, { kind: 'user', userId: 'U02' }] }]);
    const w = startWorkflow(t, { id: 'B10', title: '要推的单' }, user('U04'));
    as('U04');
    await post(`/approvals/${w.id}/urge`);
    setNow('2026-10-15 11:00:00');
    await post(`/approvals/${w.id}/urge`); // 待办升为紧急，催办和待办共用去重键
    expect(pushLog()).toHaveLength(1);
    expect(pushLog()[0]).toMatchObject({ channel: 'dingtalk', text: `【紧急】xxx管理系统消息：待审批：测试单\n单号：审批 ${w.id}` });

    setNow('2026-10-17 09:00:00');
    notify('U01', { kind: '示例', title: '设备报警：周末', body: '' });
    expect(pushLog()).toHaveLength(1);
    setNow('2026-10-19 08:01:00');
    as('U01');
    await get('/messages');
    expect(pushLog().map((l) => l.title)).toContain('【紧急】xxx管理系统消息：设备报警：周末');
  });

  test('策略校验：阈值倒挂、催办间隔；改策略要接口配置权限', async () => {
    as('U01');
    const p = await get<MsgPolicy>('/msg-policy');
    expect(p.workHours).toBe('周一至周五 08:00–17:00');
    await expect(put('/msg-policy', { levels: { ...p.levels, kinds: [{ kind: '审批', level: 'normal', importantAfter: 480, urgentAfter: 240 }] } })).rejects.toMatchObject({ status: 422 });
    await expect(put('/msg-policy', { levels: { ...p.levels, eventUrgentWithin: 200 } })).rejects.toMatchObject({ status: 422 });
    await expect(put('/msg-policy', { levels: { ...p.levels, urgeIntervalMinutes: 0 } })).rejects.toMatchObject({ status: 422 });
    as('U03');
    await expect(put('/msg-policy', { push: p.push })).rejects.toMatchObject({ status: 403 });
  });
});

describe('工作时间与节假日', () => {
  async function submit() {
    const t = def([{ name: '审', approver: { kind: 'user', userId: 'U03' } }]);
    return startWorkflow(t, { id: 'B20', title: '看工作时间的单' }, user('U04'));
  }

  test('改「基础配置」里的上下班时间后，催办按新时间判断，策略里显示同一个时间', async () => {
    const w = await submit();
    as('U01');
    await put('/settings', { workStart: '10:30', workEnd: '18:00' });
    expect((await get<MsgPolicy>('/msg-policy')).workHours).toBe('周一至周五 10:30–18:00');
    as('U04');
    expect(await get<UrgeState>(`/approvals/${w.id}/urge`)).toMatchObject({ allowed: false, reason: '现在是非工作时间（工作时间 周一至周五 10:30–18:00），不能催办', nextAt: '2026-10-15 10:30:00' });
    setNow('2026-10-15 17:30:00');
    expect((await get<UrgeState>(`/approvals/${w.id}/urge`)).allowed).toBe(true);
  });

  test('节假日里放假的日子不能催办，调休上班的周末可以', async () => {
    const w = await submit();
    const hol = table<{ id: string; year: number; name: string; start: string; end: string; kind: string }>('sys_holiday');
    hol.insert({ id: 'HTEST1', year: 2026, name: '测试放假', start: '2026-10-15', end: '2026-10-15', kind: '放假' });
    hol.insert({ id: 'HTEST2', year: 2026, name: '测试调休', start: '2026-10-17', end: '2026-10-17', kind: '调休上班' });
    as('U04');
    expect(await get<UrgeState>(`/approvals/${w.id}/urge`)).toMatchObject({ allowed: false, nextAt: '2026-10-16 08:00:00' });
    setNow('2026-10-17 09:00:00');
    expect((await get<UrgeState>(`/approvals/${w.id}/urge`)).allowed).toBe(true);
  });
});

describe('工作日', () => {
  test('没存过工作日时默认周一至周五；不能一个不选；保存去重排序并记日志', async () => {
    const t = table<{ id: string; workDays?: number[] }>('sys_setting');
    t.update(t.all()[0].id, { workDays: undefined });
    as('U01');
    expect((await get<{ workDays: number[] }>('/settings')).workDays).toEqual([1, 2, 3, 4, 5]);
    expect((await get<MsgPolicy>('/msg-policy')).workHours).toBe('周一至周五 08:00–17:00');
    await expect(put('/settings', { workDays: [] })).rejects.toThrow('至少选一个工作日');
    await put('/settings', { workDays: [6, 1, 2, 3, 4, 5, 5] });
    expect((await get<{ workDays: number[] }>('/settings')).workDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(table<{ id: string; action: string; target: string }>('sys_audit').where((a) => a.action === '修改工作日').map((a) => a.target)).toEqual(['周一至周五 → 周一至周六']);
  });

  test('工作日含周六时，周六上午能催办', async () => {
    const t = table<{ id: string; workDays?: number[] }>('sys_setting');
    t.update(t.all()[0].id, { workDays: [1, 2, 3, 4, 5, 6] });
    const t2 = def([{ name: '部门审核', approver: { kind: 'user', userId: 'U03' } }]);
    const w = startWorkflow(t2, { id: 'B6', title: '周六催办的单' }, user('U04'));
    setNow('2026-10-17 10:00:00');
    as('U04');
    expect(await get<UrgeState>(`/approvals/${w.id}/urge`)).toMatchObject({ allowed: true });
  });
});
