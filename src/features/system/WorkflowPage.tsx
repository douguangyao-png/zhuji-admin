import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { PERM_GROUPS, PERM_LABEL } from '@/api/perms';
import type { ApproverRule, WfCond, WfDef, WfNode, WfPolicy } from '@/api/types';
import { PageHead } from '@/core/bits';
import { ChipFilter } from '@/ui/ChipFilter';
import { deleteConfirm } from '@/ui/Confirm';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/primitives';
import { toast } from '@/ui/Toast';
import { Select } from '@/ui/Select';

const COND_FIELD: Record<string, string> = { people: '人数', hour: '开始时刻', amount: '金额', type: '类型', night: '夜间', holiday: '节假日', crossDept: '跨部门' };
/** 取值 1/0 的条件，只显示名称 */
const FLAG = ['night', 'holiday', 'crossDept'];
/** 按权限审批：角色里勾了这个权限点的人，自建角色也算 */
const permWho = (p: string) => `有「${PERM_LABEL[p] ?? p}」权限的人`;
/** 节点的审批人规则；旧数据只有 approver */
const rulesOf = (n: WfNode) => (n.approvers?.length ? n.approvers : [n.approver]);
const condText = (c: WfCond) => (FLAG.includes(c.field) ? COND_FIELD[c.field] : `${COND_FIELD[c.field] ?? c.field} ${c.op} ${String(c.value)}`);

export function WorkflowPage() {
  const qc = useQueryClient();
  const defs = useQuery({ queryKey: ['wf-defs'], queryFn: coreApi.wfDefs });
  const roles = useQuery({ queryKey: ['roles'], queryFn: coreApi.roles }).data ?? [];
  const users = useQuery({ queryKey: ['users', 'wf'], queryFn: () => coreApi.users({ active: true, size: 500 }) }).data?.items ?? [];
  const [edit, setEdit] = useState<WfDef | null>(null);
  const toggle = useMutation({
    mutationFn: coreApi.saveWfDef,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wf-defs'] }); },
  });
  if (!defs.data) return <div className="page"><Loading /></div>;
  const roleName = (k: string) => roles.find((r) => r.key === k)?.name ?? k;
  const who = (a: ApproverRule) => a.kind === 'role' ? roleName(a.role) : a.kind === 'roleOrManager' ? `${roleName(a.role)} / 业务负责人（任一）`
    : a.kind === 'perm' ? permWho(a.perm) : a.kind === 'permOrManager' ? `${permWho(a.perm)} / 业务负责人（任一）`
    : a.kind === 'deptHead' ? '申请人部门负责人' : a.kind === 'manager' ? '业务负责人' : `指定人员：${users.find((u) => u.id === a.userId)?.name ?? a.userId}`;

  return (
    <div className="page">
      <PageHead title="审批流" sub="每类单据一条流程；节点按顺序审批，带条件的节点只在条件满足时出现。审批人按权限时，角色里勾了该权限的人都能审，自建角色也算。一个节点可以配多条审批人规则，符合任一条的人都能审，一人处理即通过。停用后提交即通过。" />
      <PolicyCards defs={defs.data} roles={roles.map((r) => ({ key: r.key, name: r.name }))} />
      <div className="card">
        <table className="tbl">
          <thead><tr><th>单据</th><th>节点</th><th>启用</th><th /></tr></thead>
          <tbody>
            {defs.data.map((d) => (
              <tr key={d.type}>
                <td><b>{d.name}</b></td>
                <td style={{ whiteSpace: 'normal', padding: '10px 12px' }}>
                  <div className="wf-flow">
                    {d.nodes.map((n, i) => (
                      <span key={i} className="wf-n">
                        {i > 0 && <Icon name="right" />}
                        <span className="wf-b"><b>{n.name}</b><span className="fg3">{rulesOf(n).map(who).join(' 或 ')}{n.when && ` · ${condText(n.when)}`}</span></span>
                      </span>
                    ))}
                  </div>
                </td>
                <td><button type="button" role="switch" aria-checked={d.active} aria-label={`${d.name} 启用`} className={`sw${d.active ? ' on' : ''}`} onClick={() => toggle.mutate({ ...d, active: !d.active })} /></td>
                <td className="act"><button type="button" className="btn btn-xs btn-o" onClick={() => setEdit(d)}><Icon name="pencil" />编辑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <WfDialog def={edit} roles={roles.map((r) => ({ key: r.key, name: r.name }))} users={users} onClose={() => setEdit(null)} />}
    </div>
  );
}

function WfDialog({ def, roles, users, onClose }: { def: WfDef; roles: { key: string; name: string }[]; users: { id: string; name: string; unitName: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [nodes, setNodes] = useState<WfNode[]>(def.nodes.map((n) => ({ ...n, approvers: rulesOf(n) })));
  const save = useMutation({
    mutationFn: coreApi.saveWfDef,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wf-defs'] }); toast('已保存'); onClose(); },
  });
  const set = (i: number, n: Partial<WfNode>) => setNodes(nodes.map((x, j) => (j === i ? { ...x, ...n } : x)));
  const approverValue = (a: ApproverRule) => (a.kind === 'role' ? `role:${a.role}` : a.kind === 'roleOrManager' ? `any:${a.role}`
    : a.kind === 'perm' ? `perm:${a.perm}` : a.kind === 'permOrManager' ? `pany:${a.perm}` : a.kind === 'user' ? `user:${a.userId}` : a.kind);
  const parse = (v: string): ApproverRule => (v.startsWith('role:') ? { kind: 'role', role: v.slice(5) } : v.startsWith('any:') ? { kind: 'roleOrManager', role: v.slice(4) }
    : v.startsWith('perm:') ? { kind: 'perm', perm: v.slice(5) } : v.startsWith('pany:') ? { kind: 'permOrManager', perm: v.slice(5) }
    : v.startsWith('user:') ? { kind: 'user', userId: v.slice(5) } : { kind: v as 'deptHead' | 'manager' });
  const rules = (n: WfNode) => n.approvers ?? [n.approver];
  const setRules = (i: number, rs: ApproverRule[]) => set(i, { approvers: rs, approver: rs[0] });
  // 「或业务负责人」只给节点上已经配了的
  const anyRoles = [...new Set(nodes.flatMap((n) => rules(n).flatMap((r) => (r.kind === 'roleOrManager' ? [r.role] : []))))];
  const anyPerms = [...new Set([...nodes.flatMap((n) => rules(n).flatMap((r) => (r.kind === 'permOrManager' ? [r.perm] : [])))])];
  // 节点上已经指定、但不在启用人员里的人也要能显示
  const people = [...users, ...nodes.flatMap((n) => rules(n)).flatMap((r) => (r.kind === 'user' && !users.some((u) => u.id === r.userId) ? [{ id: r.userId, name: r.userId, unitName: '' }] : []))];
  const roleName = (k: string) => roles.find((r) => r.key === k)?.name ?? k;
  return (
    <Dialog title={`编辑审批流 · ${def.name}`} size="xl" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button><button type="button" className="btn btn-p" disabled={nodes.some((n) => !n.name.trim())} onClick={() => save.mutate({ ...def, nodes: nodes.map((n) => ({ ...n, approver: rules(n)[0], approvers: rules(n) })) })}><Icon name="check" />保存</button></>}>
      <div className="stack">
        {nodes.map((n, i) => (
          <div key={i} className="wf-edit">
            <span className="wf-no mono">{i + 1}</span>
            <Field label="节点名称" required style={{ gridArea: 'name' }}>{(id) => <input id={id} className="input" value={n.name} onChange={(e) => set(i, { name: e.target.value })} />}</Field>
            <div className="field" style={{ gridArea: 'who' }}>
              <label>审批人<span className="opt">符合任一条即可审</span></label>
              <div className="wf-rules">
                {rules(n).map((r, k) => (
                  <div key={k} className="wf-rule">
                    <Select className="input" aria-label={`节点 ${i + 1} 审批人规则 ${k + 1}`} value={approverValue(r)} onChange={(e) => setRules(i, rules(n).map((x, j) => (j === k ? parse(e.target.value) : x)))}>
                      <option value="manager">业务负责人</option>
                      <option value="deptHead">申请人部门负责人</option>
                      {anyPerms.map((p) => <option key={`pany:${p}`} value={`pany:${p}`}>{permWho(p)} / 业务负责人（任一）</option>)}
                      {anyRoles.map((key) => <option key={`any:${key}`} value={`any:${key}`}>{roleName(key)} / 业务负责人（任一）</option>)}
                      <optgroup label="按角色">
                        {roles.filter((ro) => ro.key !== 'admin').map((ro) => <option key={ro.key} value={`role:${ro.key}`}>角色：{ro.name}</option>)}
                      </optgroup>
                      {PERM_GROUPS.filter((g) => g.name !== '系统').map((g) => (
                        <optgroup key={g.name} label={`按权限 · ${g.name}`}>
                          {g.perms.map(([key, l]) => <option key={key} value={`perm:${key}`}>有「{g.name} · {l}」权限的人</option>)}
                        </optgroup>
                      ))}
                      <optgroup label="指定人员">
                        {people.map((u) => <option key={u.id} value={`user:${u.id}`}>{u.name}{u.unitName ? ` · ${u.unitName}` : ''}</option>)}
                      </optgroup>
                    </Select>
                    {rules(n).length > 1 && (
                      <button type="button" className="btn btn-sm btn-ds" aria-label={`删除节点 ${i + 1} 审批人规则 ${k + 1}`}
                        onClick={async () => { if (await deleteConfirm(`「${n.name || `节点 ${i + 1}`}」的第 ${k + 1} 条审批人规则`)) setRules(i, rules(n).filter((_, j) => j !== k)); }}><Icon name="trash" />删除</button>
                    )}
                  </div>
                ))}
                <div><button type="button" className="btn btn-g btn-sm" onClick={() => setRules(i, [...rules(n), { kind: 'deptHead' }])}><Icon name="plus" />加一条</button></div>
              </div>
            </div>
            <Field label="条件" optional hint="留空表示每次都要审" style={{ gridArea: 'cond' }}>{(id) => (
              <div className="row">
                <Select id={id} className="input" value={n.when?.field ?? ''} onChange={(e) => set(i, { when: !e.target.value ? undefined : FLAG.includes(e.target.value) ? { field: e.target.value, op: '=', value: 1 } : { field: e.target.value, op: '>', value: n.when?.value ?? 0 } })}>
                  <option value="">无</option>
                  {Object.entries(COND_FIELD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                {n.when && !FLAG.includes(n.when.field) && <>
                  <Select className="input" style={{ width: 70 }} value={n.when.op} aria-label="比较" onChange={(e) => set(i, { when: { ...n.when!, op: e.target.value as '>' } })}>
                    {['>', '>=', '<', '='].map((o) => <option key={o}>{o}</option>)}
                  </Select>
                  <input className="input" style={{ width: 90 }} aria-label="值" value={String(n.when.value)} onChange={(e) => set(i, { when: { ...n.when!, value: Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) } })} />
                </>}
              </div>
            )}</Field>
            <button type="button" className="btn btn-sm btn-ds wf-del" aria-label="删除节点" onClick={async () => { if (await deleteConfirm('节点')) { setNodes(nodes.filter((_, j) => j !== i)); } }}><Icon name="trash" />删除</button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" style={{ justifySelf: 'start' }} onClick={() => setNodes([...nodes, { name: '', approver: { kind: 'role', role: 'bizAdmin' }, approvers: [{ kind: 'role', role: 'bizAdmin' }] }])}><Icon name="plus" />添加节点</button>
      </div>
    </Dialog>
  );
}

const ALL = '全部流程';

/** 自动通过开关与代审范围；自动通过只有这一套规则，后端 WorkflowEngine 按它判断 */
function PolicyCards({ defs, roles }: { defs: WfDef[]; roles: { key: string; name: string }[] }) {
  const qc = useQueryClient();
  const pol = useQuery({ queryKey: ['wf-policy'], queryFn: coreApi.wfPolicy }).data;
  const save = useMutation({
    mutationFn: coreApi.saveWfPolicy,
    onSuccess: (r) => qc.setQueryData(['wf-policy'], r),
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  if (!pol) return null;
  const a = pol.autoApprove;
  const flip = (k: keyof WfPolicy['autoApprove']) => save.mutate({ autoApprove: { ...a, [k]: !a[k] } });
  const sw = (k: keyof WfPolicy['autoApprove'], label: string, text: string, off?: boolean) => (
    <label className="sw-l" style={off ? { opacity: 0.5 } : undefined}>
      <button type="button" role="switch" aria-checked={a[k]} aria-label={label} disabled={off} className={`sw${a[k] ? ' on' : ''}`} onClick={() => flip(k)} />
      <span><b className="fg2">{label}</b><span className="fg3">：{text}</span></span>
    </label>
  );
  return (
    <>
      <div className="card">
        <div className="card-h b"><span className="card-t">自动通过</span><span className="card-s">{a.enabled ? '已开启' : '已关闭，全部按节点审批'}</span></div>
        <div className="card-b stack">
          {sw('enabled', '开启自动通过', '关闭后完全按节点审批：申请人本人不审自己的单，没有其他人能审的节点跳过')}
          {sw('admin', '系统管理员整单通过', '系统管理员提交的单据，按条件筛出的节点全部自动通过，审批记录写「申请人是系统管理员」，逐个节点通知原审批人', !a.enabled)}
          {sw('self', '本人或有权限的节点通过', '申请人本人就是某个节点的审批人，或有这个节点要求的角色、审批权限时，这个节点自动通过并通知该节点其他审批人，后面的节点照常审', !a.enabled)}
          <p className="fg3" style={{ fontSize: 12.5, margin: 0 }}>自动通过时业务模块登记的检查（如时段冲突）照样做，人数、金额等条件照常判断。</p>
        </div>
      </div>
      <ProxyCard key={JSON.stringify(pol.proxies)} pol={pol} defs={defs} roles={roles} />
    </>
  );
}

function ProxyCard({ pol, defs, roles }: { pol: WfPolicy; defs: WfDef[]; roles: { key: string; name: string }[] }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState(pol.proxies);
  const save = useMutation({
    mutationFn: () => coreApi.saveWfPolicy({ proxies: rows }),
    onSuccess: (r) => { qc.setQueryData(['wf-policy'], r); toast('已保存代审'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const names = [ALL, ...defs.map((d) => d.name)];
  const toNames = (types: string[]) => (types.includes('*') ? [ALL] : types.map((t) => defs.find((d) => d.type === t)?.name ?? t));
  const toTypes = (ns: string[]) => (ns.includes(ALL) ? ['*'] : ns.map((n) => defs.find((d) => d.name === n)?.type ?? n));
  const set = (i: number, r: Partial<WfPolicy['proxies'][number]>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...r } : x)));
  const roleName = (k: string) => roles.find((r) => r.key === k)?.name ?? k;
  return (
    <div className="card">
      <div className="card-h b"><span className="card-t">代审</span><span className="card-s">{rows.length ? `${rows.length} 条` : '未设置'}</span></div>
      <div className="card-b stack">
        <p className="fg3" style={{ fontSize: 12.5, margin: 0 }}>指定的角色可以替当前节点的审批人处理这些流程，如部门负责人代业务管理员审核；在「审批 · 可代审」里看到。记录显示「张三 代 李四 审核」，并通知原审批人。系统管理员本来就能处理任何节点，同样记为代审。</p>
        {rows.map((r, i) => (
          <div key={i} className="row" style={{ flexWrap: 'wrap' }}>
            <div style={{ width: 160 }}>
              <Select className="input" aria-label={`代审角色 ${i + 1}`} value={r.role} onChange={(e) => set(i, { role: e.target.value })}>
                {roles.map((ro) => <option key={ro.key} value={ro.key}>{ro.name}</option>)}
              </Select>
            </div>
            <span className="fg3">可以代审</span>
            <ChipFilter label="流程" values={names} value={toNames(r.types)} onChange={(v) => set(i, { types: toTypes(v.includes(ALL) && !toNames(r.types).includes(ALL) ? [ALL] : v.filter((x) => x !== ALL || v.length === 1)) })} />
            <button type="button" className="btn btn-xs btn-ds" aria-label={`删除代审 ${i + 1}`}
              onClick={async () => { if (await deleteConfirm(`「${roleName(r.role)}」的代审范围`)) setRows(rows.filter((_, j) => j !== i)); }}><Icon name="trash" />删除</button>
          </div>
        ))}
        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => setRows([...rows, { role: roles.find((r) => r.key === 'bizAdmin')?.key ?? roles[0]?.key ?? '', types: [] }])}><Icon name="plus" />添加代审</button>
          <button type="button" className="btn btn-p btn-sm" disabled={save.isPending || rows.some((r) => !r.types.length) || JSON.stringify(rows) === JSON.stringify(pol.proxies)} onClick={() => save.mutate()}><Icon name="check" />保存</button>
          {rows.some((r) => !r.types.length) && <span className="fg3">每条至少选一个流程</span>}
        </div>
      </div>
    </div>
  );
}
