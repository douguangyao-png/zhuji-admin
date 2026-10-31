// 示例模块的模拟后端：接口、种子数据、审批回调、首页待办、单号链接。新模块照这个写，规则要与后端一致
import { table, uid } from '@/api/mock/db';
import { ApiError, kw, mock, paginate } from '@/api/mock/router';
import { registerDict, registerSeed, registerWorkflow } from '@/api/mock/seed';
import { audit, can, need, nextNo, notify, onWorkflowDone, registerTodos, sees, startWorkflow, unitName, users } from '@/api/mock/services';
import { publish } from '@/api/mock/notify';
import type { User } from '@/api/types';
import { registerDoc } from '@/core/doc';
import { personName } from '@/lib/names';
import { rng } from '@/lib/rng';
import { addDays, stamp, today } from '@/lib/time';
import { EXAMPLE_MAX, EXAMPLE_STATUS, type ExampleInput, type ExampleItem } from './types';

const MODULE = '示例';
const items = table<ExampleItem>('ex_item');

registerDict('exampleCategory', '示例类别', ['日常', '专项', '临时']);
registerWorkflow({ type: 'example', name: '示例登记', active: true, nodes: [
  { name: '部门负责人审核', approver: { kind: 'deptHead' } },
  { name: '业务管理员审批（金额 1 万元以上）', approver: { kind: 'perm', perm: 'example:approve' }, when: { field: 'amount', op: '>', value: 10000 } },
] });

// 操作日志里的单号点开到列表页；有审批权限的看全部，其余看自己的
registerDoc('SL', [{ to: '/example', perm: 'example:approve', feature: 'example' }, { to: '/example/mine', perm: 'example:view', feature: 'example' }]);

registerSeed(20, (d) => {
  const r = rng(31);
  const people = (d.org_user as User[]).filter((u) => u.active).slice(0, 12);
  const rows: ExampleItem[] = Array.from({ length: 36 }, (_, i) => {
    const u = r.pick(people);
    const status = r.pick(EXAMPLE_STATUS);
    const date = addDays(today(), -r.int(0, 60));
    return {
      id: `EX${String(i + 1).padStart(3, '0')}`, no: status === '草稿' ? '' : `SL${date.replace(/-/g, '')}${String(i + 1).padStart(3, '0')}`,
      title: `${r.pick(['设备巡检', '物资采购', '场地使用', '培训报名', '费用报销'])}${i + 1}`, category: String(r.int(1, 3)),
      amount: Math.round(r.int(200, 30000) * 100) / 100, date, note: r.chance(0.4) ? `备注：${personName(r)} 经办` : undefined,
      status, ownerId: u.id, ownerName: u.name, unitId: u.unitId, unitName: '', createdAt: `${date} 09:${String(r.int(10, 59))}`,
    };
  });
  d.ex_item = rows;
});

const view = (x: ExampleItem): ExampleItem => ({ ...x, unitName: unitName(x.unitId), ownerName: users.get(x.ownerId)?.name ?? x.ownerName });

/** 校验并整理入参：去空格、必填、限长、金额两位小数 */
function clean(b: Partial<ExampleInput>): Omit<ExampleInput, 'id'> {
  const title = String(b.title ?? '').trim();
  if (!title) throw new ApiError(422, '标题不能为空');
  if (title.length > EXAMPLE_MAX.title) throw new ApiError(422, `标题最多 ${EXAMPLE_MAX.title} 个字`);
  const note = String(b.note ?? '').trim();
  if (note.length > EXAMPLE_MAX.note) throw new ApiError(422, `备注最多 ${EXAMPLE_MAX.note} 个字`);
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!(amount >= 0) || amount > 1e9) throw new ApiError(422, '金额填 0 到 10 亿元');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? ''))) throw new ApiError(422, '日期格式应为 2026-10-31');
  if (!b.category) throw new ApiError(422, '请选择类别');
  return { title, category: String(b.category), amount, date: String(b.date), note: note || undefined };
}

/** 只有本人能改、能删、能提交，且只在草稿或已驳回时 */
function own(user: User, id: string) {
  const x = items.get(id);
  if (!x) throw new ApiError(404, '登记不存在');
  if (x.ownerId !== user.id && !can(user, '*')) throw new ApiError(403, '只能操作自己的登记');
  if (x.status === '审批中' || x.status === '已通过') throw new ApiError(422, `${x.status}的登记不能修改或删除`);
  return x;
}

mock.get('/example', ({ user, query }) => {
  need(user, 'example:view');
  // 有审批权限的看数据范围内全部，其余只看自己的
  const all = can(user, 'example:approve') && query.mine !== '1';
  const rows = items.where((x) => (all ? sees(user, x.ownerId, x.unitId) : x.ownerId === user.id)
    && kw(query, x.title, x.no, x.ownerName)
    && (!query.status || query.status.split(',').includes(x.status))
    && (!query.category || query.category.split(',').includes(x.category)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return paginate(rows.map(view), query);
});

mock.post('/example', ({ user, body }) => {
  need(user, 'example:edit');
  const x: ExampleItem = { id: uid('EX'), no: '', ...clean(body), status: '草稿', ownerId: user.id, ownerName: user.name, unitId: user.unitId, unitName: '', createdAt: stamp() };
  items.insert(x);
  audit(user, MODULE, '新增登记', x.title);
  return view(x);
});

mock.put('/example/:id', ({ user, params, body }) => {
  need(user, 'example:edit');
  own(user, params.id);
  const x = items.update(params.id, clean(body))!;
  audit(user, MODULE, '修改登记', x.title);
  return view(x);
});

mock.del('/example/:id', ({ user, params }) => {
  need(user, 'example:edit');
  const x = own(user, params.id);
  items.remove(x.id);
  audit(user, MODULE, '删除登记', x.no || x.title);
  return true;
});

mock.post('/example/:id/submit', ({ user, params }) => {
  need(user, 'example:edit');
  const cur = own(user, params.id);
  const no = cur.no || nextNo('SL');
  const x = items.update(cur.id, { no, status: '审批中' })!;
  startWorkflow('example', { id: x.id, title: `${x.title}（${x.amount.toFixed(2)} 元）`, data: { amount: x.amount } }, user, '/example/mine');
  publish('example.submitted', { applicant: user.name, dept: unitName(user.unitId), title: `${x.title} ${no}`, amount: x.amount.toFixed(2) });
  audit(user, MODULE, '提交审批', no);
  return view(items.get(x.id)!);
});

mock.post('/example/import', ({ user, body }) => {
  need(user, 'example:edit');
  const rows = (body.rows ?? []) as ExampleInput[];
  if (!rows.length) throw new ApiError(422, '没有要导入的行');
  if (rows.length > 500) throw new ApiError(422, '一次最多导入 500 行');
  // 先整批校验，有一行不对整批不导
  const ok = rows.map((r, i) => { try { return clean(r); } catch (e) { throw new ApiError(422, `第 ${i + 1} 行：${(e as Error).message}`); } });
  for (const c of ok) items.insert({ id: uid('EX'), no: '', ...c, status: '草稿', ownerId: user.id, ownerName: user.name, unitId: user.unitId, unitName: '', createdAt: stamp() });
  audit(user, MODULE, '导入登记', `${ok.length} 条`);
  return { added: ok.length };
});

// 审批结束：改单据状态；通过时按推送规则通知申请人
onWorkflowDone('example', (inst, result) => {
  const status = result === 'approved' ? '已通过' : result === 'rejected' ? '已驳回' : '草稿';
  const x = items.update(inst.bizId, { status });
  if (x && result === 'approved') {
    publish('example.approved', { title: `${x.title} ${x.no}`, applicant: x.ownerName }, { applicantId: x.ownerId, link: '/example/mine' });
    return 'notified';
  }
  if (x && result === 'rejected') notify(x.ownerId, { kind: MODULE, title: '示例登记被驳回', body: `${x.title} ${x.no}`, link: '/example/mine' });
  return x && result === 'rejected' ? 'notified' : undefined;
});

// 首页待办：自己被驳回、还没重新提交的
registerTodos((u) => [{ key: 'example:rejected', module: MODULE, label: '被驳回的示例登记', count: items.where((x) => x.ownerId === u.id && x.status === '已驳回').length, to: '/example/mine?status=已驳回', tone: 'bad' }]);
