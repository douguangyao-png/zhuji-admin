import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { WfInstance, WfPolicy } from '@/api/types';
import { PageHead } from '@/core/bits';
import { useMeSure } from '@/core/me';
import { DataTable, type Columns } from '@/ui/DataTable';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Tabs } from '@/ui/Tabs';
import { Tag } from '@/ui/Tag';
import { toast } from '@/ui/Toast';
import { UrgePanel } from './Urge';

const STATUS: Record<WfInstance['status'], [string, 'warn' | 'good' | 'bad' | 'flat']> = {
  pending: ['审批中', 'warn'], approved: ['已通过', 'good'], rejected: ['已驳回', 'bad'], withdrawn: ['已撤回', 'flat'],
};
export const WfStatusTag = ({ s }: { s: WfInstance['status'] }) => <Tag tone={STATUS[s][1]}>{STATUS[s][0]}</Tag>;

/** 审批记录时间线，各模块的详情里也用 */
export function WfTimeline({ inst }: { inst: WfInstance }) {
  return (
    <ul className="tl">
      {inst.steps.map((s, i) => (
        <li key={i} className={s.action === '自动通过' ? 'auto' : undefined}>
          <span className="mono fg3">{s.at.slice(5, 16)}</span>
          <b>{s.proxyFor ? `${s.userName} 代 ${s.proxyFor} 审核` : s.userName}</b>
          <span>{s.action}{s.node !== '提交' && s.node !== s.action ? ` · ${s.node}` : ''}</span>
          {s.comment && <p>{s.comment}</p>}
        </li>
      ))}
      {inst.status === 'pending' && inst.nodes.slice(inst.current).map((n, i) => (
        <li key={`n${i}`} className="todo"><span className="mono fg4">待处理</span><b className="fg3">{n.name}</b><span /></li>
      ))}
    </ul>
  );
}

/** 我的角色能代审哪些流程，'*' 为全部 */
export function useProxyTypes() {
  const me = useMeSure();
  const pol = useQuery({ queryKey: ['wf-policy'], queryFn: coreApi.wfPolicy, staleTime: 60_000 }).data;
  return proxyTypes(pol, me.user.roleKeys);
}
export const proxyTypes = (pol: WfPolicy | undefined, roleKeys: string[]) => [...new Set((pol?.proxies ?? []).filter((p) => roleKeys.includes(p.role)).flatMap((p) => p.types))];
const covers = (types: string[], type: string) => types.includes('*') || types.includes(type);

export function ApprovalsPage() {
  const [sp] = useSearchParams();
  const qc = useQueryClient();
  const [scope, setScope] = useState('todo');
  const type = sp.get('type') ?? '';
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<WfInstance | null>(null);
  const proxy = useProxyTypes();
  const list = useQuery({ queryKey: ['approvals', scope, type], queryFn: () => coreApi.approvals({ scope, type, size: 500 }) });
  const batch = useMutation({
    mutationFn: () => coreApi.batchApprove([...sel]),
    onSuccess: (r) => { void qc.invalidateQueries(); setSel(new Set()); toast(`已通过 ${r.length} 条`); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });

  const cols: Columns<WfInstance> = [
    { id: 'type', header: '类型', accessorKey: 'typeName' },
    { id: 'title', header: '内容', accessorKey: 'title', cell: (c) => <button type="button" className="link" onClick={() => setOpen(c.row.original)}>{c.getValue() as string}</button> },
    { id: 'who', header: '申请人', accessorKey: 'applicantName' },
    { id: 'node', header: '当前节点', accessorFn: (i) => (i.status === 'pending' ? (i.nodes[i.current]?.name ?? '') : '—') },
    { id: 'status', header: '状态', accessorKey: 'status', cell: (c) => <WfStatusTag s={c.row.original.status} /> },
    { id: 'at', header: '提交时间', accessorKey: 'createdAt', meta: { className: 'mono' } },
  ];

  return (
    <div className="page">
      <PageHead title="审批" sub="各模块发起的审批都在这里；也可以在业务页面里直接审。" />
      <div className="card">
        <div className="toolbar">
          <Tabs value={scope} onChange={(k) => { setScope(k); setSel(new Set()); }} items={[
            { key: 'todo', label: '待我审批', count: scope === 'todo' ? list.data?.total : undefined },
            ...(proxy.length ? [{ key: 'proxy', label: '可代审', count: scope === 'proxy' ? list.data?.total : undefined }] : []),
            { key: 'done', label: '我已审批' }, { key: 'mine', label: '我发起的' }]} />
          <span className="push" />
          {(scope === 'todo' || scope === 'proxy') && <button type="button" className="btn btn-sm" disabled={!sel.size} onClick={() => batch.mutate()}><Icon name="check" />批量通过{sel.size ? ` ${sel.size} 条` : ''}</button>}
        </div>
        <DataTable data={list.data?.items ?? []} columns={cols} pageId="approvals" selectable={scope === 'todo' || scope === 'proxy'} selected={sel} onSelect={setSel}
          emptyText={scope === 'todo' ? '没有待审批的事项' : scope === 'proxy' ? '没有可以代审的单据' : '没有记录'} />
      </div>
      {open && <ApprovalDialog inst={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function ApprovalDialog({ inst, onClose }: { inst: WfInstance; onClose: () => void }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const fresh = useQuery({ queryKey: ['approval', inst.id], queryFn: () => coreApi.approval(inst.id), initialData: inst }).data;
  const act = useMutation({
    mutationFn: (a: 'approve' | 'reject') => (a === 'approve' ? coreApi.approve(inst.id, comment) : coreApi.reject(inst.id, comment)),
    onSuccess: (_, a) => { void qc.invalidateQueries(); toast(a === 'approve' ? '已通过' : '已驳回'); onClose(); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const link = fresh.data.link as string | undefined;
  const me = useMeSure();
  const proxy = useProxyTypes();
  const own = fresh.nodes[fresh.current]?.approverIds.includes(me.user.id) ?? false;
  // 申请人看自己的单据不显示通过、驳回，只能催办
  const canAct = fresh.status === 'pending' && (own || me.can('*') || covers(proxy, fresh.type));
  return (
    <Dialog title={fresh.title} sub={`${fresh.typeName} · ${fresh.applicantName} 提交于 ${fresh.createdAt}`} onClose={onClose}
      footer={canAct ? <>
        {link && <Link className="btn btn-g" to={link} onClick={onClose}><Icon name="file" />查看单据</Link>}
        <span className="push" />
        <button type="button" className="btn" onClick={() => act.mutate('reject')}><Icon name="x" />驳回</button>
        <button type="button" className="btn btn-p" onClick={() => act.mutate('approve')}><Icon name="check" />通过</button>
      </> : undefined}>
      <div className="stack">
        <WfStatusTag s={fresh.status} />
        <WfTimeline inst={fresh} />
        <UrgePanel inst={fresh} />
        {canAct && (
          <Field label="意见" optional hint={own ? '驳回时必填' : '驳回时必填。你不是这一步的审批人，处理后记为代审，并通知原审批人'}>{(id) => <textarea id={id} className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
        )}
      </div>
    </Dialog>
  );
}
