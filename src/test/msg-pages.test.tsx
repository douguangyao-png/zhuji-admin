import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { get, post, put } from '@/api/http';
import { table } from '@/api/mock/db';
import { notify, startWorkflow, users } from '@/api/mock/services';
import type { MsgPolicy, WfDef, WfInstance, WfPolicy } from '@/api/types';
import { useSession } from '@/core/session';
import { setNow } from '@/lib/time';
import { freshDb, openApp } from './render';

// 消息等级、催办、自动通过与代审相关页面
beforeEach(() => { setNow('2026-10-15 10:00:00'); freshDb(); });
afterAll(() => setNow(null));
const T = { timeout: 8000 };
const nm = (id: string) => users.get(id)!.name;

function pending(applicant = 'U04') {
  table<WfDef & { id: string }>('wf_def').insert({ id: 'tTest', type: 'tTest', name: '测试单', active: true, nodes: [{ name: '管理员审', approver: { kind: 'user', userId: 'U02' } }] });
  return startWorkflow('tTest', { id: 'B1', title: '要催的单' }, users.get(applicant)!);
}

test('消息页：紧急标红排在最前，按等级筛选，升级记录可展开', async () => {
  notify('U01', { kind: '示例', title: '待确认登记 2 条', body: '' });
  const m = table<{ id: string; title: string; to: string }>('msg_message').find((x) => x.to === 'U01' && x.title === '待确认登记 2 条')!;
  table<{ id: string }>('msg_message').update(m.id, { level: 'important', levelLog: [{ at: '2026-10-15 09:00:00', from: 'normal', to: 'important', reason: '已等待 4 个工作小时' }] } as never);
  openApp('/messages');
  const first = within(await screen.findByRole('list', { name: '消息列表' }, T)).getAllByRole('listitem')[0];
  expect(within(first).getByText('紧急')).toHaveClass('crit');
  expect(within(first).getByText('设备报警：机房温度过高')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '升级 1 次' }));
  expect(await screen.findByText('已等待 4 个工作小时')).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('group', { name: '等级' })).getByRole('button', { name: '次要' }));
  await waitFor(() => expect(screen.queryByText('设备报警：机房温度过高')).not.toBeInTheDocument(), T);
  expect(await screen.findByText('系统维护公告', {}, T)).toBeInTheDocument();
});

test('顶栏铃铛写明紧急条数，铃铛标红', async () => {
  openApp('/');
  const bell = await screen.findByRole('link', { name: /^消息，\d+ 条未读，其中 1 条紧急$/ }, T);
  expect(bell).toHaveClass('urgent');
  expect(bell).toHaveAttribute('href', '/messages');
});

test('首页消息卡片：紧急的排最前，写明紧急条数', async () => {
  openApp('/');
  const card = (await screen.findByText('全部消息', {}, T)).closest('.card') as HTMLElement;
  const first = within(await within(card).findByRole('list', { name: '消息列表' }, T)).getAllByRole('listitem')[0];
  expect(first).toHaveTextContent('设备报警');
  expect(within(card).getByText(/紧急 1 条/)).toBeInTheDocument();
});

test('申请人在审批详情里催办，催过后按钮置灰并写明原因，记录列出来', async () => {
  const w = pending();
  openApp('/approvals', 'U04');
  fireEvent.click(await screen.findByRole('tab', { name: '我发起的' }));
  fireEvent.click(await screen.findByRole('button', { name: w.title }, T));
  const dlg = await screen.findByRole('dialog');
  const btn = await within(dlg).findByRole('button', { name: '催办' }, T);
  expect(within(dlg).queryByRole('button', { name: '通过' })).not.toBeInTheDocument();
  fireEvent.click(btn);
  expect(await within(dlg).findByText('60 分钟内只能催办一次，11:00 后可再催', {}, T)).toBeInTheDocument();
  expect(within(dlg).getByRole('button', { name: '催办' })).toBeDisabled();
  expect(within(within(dlg).getByRole('list', { name: '催办记录' })).getByText(`${nm('U04')} 催办「管理员审」`)).toBeInTheDocument();
});

test('审批时间线显示代审', async () => {
  table<WfPolicy & { id: string }>('wf_policy').update('main', { proxies: [{ role: 'user', types: ['tTest'] }] });
  const w = pending('U05');
  useSession.getState().login('U03');
  await post<WfInstance>(`/approvals/${w.id}/approve`, {});
  openApp('/approvals', 'U05');
  fireEvent.click(await screen.findByRole('tab', { name: '我发起的' }));
  fireEvent.click(await screen.findByRole('button', { name: w.title }, T));
  const dlg = await screen.findByRole('dialog');
  expect(await within(dlg).findByText(`${nm('U03')} 代 ${nm('U02')} 审核`)).toBeInTheDocument();
});

test('可代审页签：有代审范围才显示', async () => {
  table<WfPolicy & { id: string }>('wf_policy').update('main', { proxies: [{ role: 'user', types: ['tTest'] }] });
  const w = pending('U05');
  openApp('/approvals', 'U03');
  fireEvent.click(await screen.findByRole('tab', { name: /可代审/ }, T));
  expect(await screen.findByRole('button', { name: w.title }, T)).toBeInTheDocument();
});

test('系统管理员提交的单在时间线里写明自动通过原因', async () => {
  const w = pending('U01');
  expect(w.status).toBe('approved');
  openApp('/approvals', 'U01');
  fireEvent.click(await screen.findByRole('tab', { name: '我发起的' }));
  fireEvent.click(await screen.findByRole('button', { name: w.title }, T));
  expect(await within(await screen.findByRole('dialog')).findByText('申请人是系统管理员')).toBeInTheDocument();
});

test('消息等级页写明工作时间取自系统设置', async () => {
  await put('/settings', { workStart: '08:30', workEnd: '17:30' });
  openApp('/system/notify');
  fireEvent.click(await screen.findByRole('tab', { name: '消息等级' }, T));
  expect(await screen.findByText(/周一至周五 08:30–17:30，工作日和上下班时间在「基础配置 › 工作日及时间」里设置/, {}, T)).toBeInTheDocument();
});

test('消息推送：消息等级按工作小时改阈值，推送策略给紧急选群', async () => {
  openApp('/system/notify');
  fireEvent.click(await screen.findByRole('tab', { name: '消息等级' }, T));
  const input = await screen.findByLabelText('审批 升为重要（工作小时）', {}, T);
  expect(input).toHaveValue('4');
  fireEvent.change(input, { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(async () => expect((await get<MsgPolicy>('/msg-policy')).levels.kinds.find((k) => k.kind === '审批')!.importantAfter).toBe(120), T);

  fireEvent.click(screen.getByRole('tab', { name: '推送策略' }));
  const urgent = await screen.findByRole('group', { name: '紧急推到' }, T);
  fireEvent.click(within(urgent).getByRole('button', { name: /业务工作群/ }));
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(async () => expect((await get<MsgPolicy>('/msg-policy')).push.rules.find((r) => r.level === 'urgent')!.groupIds).toEqual(['G1']), T);
  expect(screen.getByText('推送记录')).toBeInTheDocument();
});

test('审批流：自动通过开关；节点审批人可以加多条规则', async () => {
  openApp('/system/workflow');
  fireEvent.click(await screen.findByRole('switch', { name: '本人或有权限的节点通过' }, T));
  await waitFor(async () => expect((await get<WfPolicy>('/wf-policy')).autoApprove.self).toBe(false), T);
  const row = (await screen.findByText('示例登记', { selector: 'b' })).closest('tr') as HTMLElement;
  fireEvent.click(within(row).getByRole('button', { name: '编辑' }));
  const dlg = await screen.findByRole('dialog');
  fireEvent.click(within(dlg).getAllByRole('button', { name: '加一条' })[0]);
  fireEvent.change(within(dlg).getByLabelText('节点 1 审批人规则 2'), { target: { value: 'user:U02' } });
  fireEvent.click(within(dlg).getByRole('button', { name: '保存' }));
  await waitFor(async () => {
    const d = (await get<WfDef[]>('/wf-defs')).find((x) => x.type === 'example')!;
    expect(d.nodes[0].approvers).toEqual([{ kind: 'deptHead' }, { kind: 'user', userId: 'U02' }]);
    expect(d.nodes[0].approver).toEqual({ kind: 'deptHead' });
  }, T);
  expect(await screen.findByText(new RegExp(`申请人部门负责人 或 指定人员：${nm('U02')}`), {}, T)).toBeInTheDocument();
});

test('基础配置的「工作日及时间」：七个勾选；全不选不能保存', async () => {
  openApp('/system/settings');
  const g = within(await screen.findByRole('group', { name: '工作日' }, T));
  expect(g.getAllByRole('button').map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? '✓' : ''}`)).toEqual(['周一✓', '周二✓', '周三✓', '周四✓', '周五✓', '周六', '周日']);
  for (const d of ['周一', '周二', '周三', '周四', '周五']) fireEvent.click(g.getByRole('button', { name: d }));
  expect(screen.getByText('至少选一个工作日')).toBeInTheDocument();
  fireEvent.click(g.getByRole('button', { name: '周一' }));
  fireEvent.click(g.getByRole('button', { name: '周二' }));
  const card = screen.getByText('工作日及时间').closest('.card') as HTMLElement;
  fireEvent.click(within(card).getByRole('button', { name: '保存' }));
  await waitFor(async () => expect((await get<{ workDays: number[] }>('/settings')).workDays).toEqual([1, 2]));
});
