import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { DeletedRow } from '@/api/types';
import { Search } from '@/core/bits';
import { useMeSure } from '@/core/me';
import { DataTable, type Columns } from '@/ui/DataTable';
import { Dialog } from '@/ui/Dialog';
import { Field, Seg } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Tag } from '@/ui/Tag';
import { toast } from '@/ui/Toast';

const TONE = { 已删除: 'warn', 已恢复: 'good', 已清除: 'flat' } as const;

/**
 * 操作日志里的「删除记录」：系统里的删除都只是置删除标识，数据还在，这里可以恢复；
 * 物理删除只有系统管理员能做，而且要再输入自己的密码，删了就不能恢复。
 */
export function DeletedTab() {
  const qc = useQueryClient();
  const me = useMeSure();
  const [state, setState] = useState('已删除');
  const [q, setQ] = useState('');
  const [purging, setPurging] = useState<DeletedRow | null>(null);
  const list = useQuery({ queryKey: ['audit', 'deleted', state, q], queryFn: () => coreApi.deleted({ state, q, size: 200 }), placeholderData: keepPreviousData });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['audit'] }); void qc.invalidateQueries(); };
  const restore = useMutation({
    mutationFn: ({ id, batch }: { id: string; batch: boolean }) => coreApi.restoreDeleted(id, batch),
    onSuccess: (r) => { refresh(); toast(r.restored > 1 ? `已恢复 ${r.restored} 条` : '已恢复'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const cols: Columns<DeletedRow> = [
    { id: 'at', header: '删除时间', accessorKey: 'deletedAt', meta: { className: 'mono', width: 140 } },
    { id: 'by', header: '操作人', accessorFn: (r) => r.deletedBy ?? '系统' },
    { id: 'table', header: '类型', accessorKey: 'tableLabel', cell: (c) => <span title={c.row.original.table}>{c.getValue() as string}</span> },
    { id: 'label', header: '内容', accessorFn: (r) => r.label ?? r.rowId, cell: (c) => <b>{c.getValue() as string}</b> },
    { id: 'state', header: '状态', accessorKey: 'state', cell: (c) => (
      <span title={c.row.original.handledBy ? `${c.row.original.handledBy} ${c.row.original.handledAt ?? ''}` : undefined}>
        <Tag tone={TONE[c.row.original.state]}>{c.row.original.state}</Tag>{c.row.original.handledBy && <span className="fg3"> {c.row.original.handledBy}</span>}
      </span>
    ) },
    { id: 'act', header: '', enableSorting: false, meta: { className: 'act' }, cell: (c) => {
      const r = c.row.original;
      if (r.state !== '已删除') return null;
      return (
        <>
          <button type="button" className="btn btn-xs btn-o" aria-label={`恢复 ${r.label ?? r.rowId}`} disabled={restore.isPending} onClick={() => restore.mutate({ id: r.id, batch: false })}><Icon name="refresh" />恢复</button>
          {r.batchOpen > 1 && <button type="button" className="btn btn-xs btn-o" aria-label={`全部恢复 ${r.label ?? r.rowId}`} title="把同一次操作一起删除的数据都恢复" disabled={restore.isPending} onClick={() => restore.mutate({ id: r.id, batch: true })}><Icon name="refresh" />全部恢复（{r.batchOpen}）</button>}
          {me.can('*') && <button type="button" className="btn btn-xs btn-ds" aria-label={`物理删除 ${r.label ?? r.rowId}`} onClick={() => setPurging(r)}><Icon name="trash" />物理删除</button>}
        </>
      );
    } },
  ];
  return (
    <div className="card">
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="内容、类型、操作人" />
        <Seg label="状态" value={state} onChange={setState} options={[{ value: '已删除', label: '已删除' }, { value: '已恢复', label: '已恢复' }, { value: '已清除', label: '已清除' }, { value: '', label: '全部' }]} />
      </div>
      <div className="card-b fg3" style={{ paddingTop: 0 }}>系统里的删除都不是真删：数据还保存着，点「恢复」就回来。物理删除只有系统管理员能做，要再输入自己的密码，删了就不能恢复。</div>
      <DataTable data={list.data?.items ?? []} columns={cols} pageId="audit-deleted" emptyText={state === '已删除' ? '没有被删除的数据' : '没有记录'} />
      {purging && <PurgeDialog row={purging} onClose={() => setPurging(null)} onDone={() => { setPurging(null); refresh(); }} />}
    </div>
  );
}

function PurgeDialog({ row, onClose, onDone }: { row: DeletedRow; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const purge = useMutation({
    mutationFn: () => coreApi.purgeDeleted(row.id, pw),
    onSuccess: () => { toast('已物理删除'); onDone(); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  return (
    <Dialog title="物理删除" sub={`${row.tableLabel}：${row.label ?? row.rowId}`} onClose={onClose}
      footer={<><span className="push" /><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button>
        <button type="button" className="btn btn-ds" disabled={!pw || purge.isPending} onClick={() => purge.mutate()}><Icon name="trash" />确认物理删除</button></>}>
      <div className="note crit"><Icon name="alert" /><span>物理删除后数据从数据库里真正删掉，不能再恢复。请输入你当前登录账号的密码确认。</span></div>
      <Field label="当前账号的密码" required>{(id) => <input id={id} type="password" className="input" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && pw) purge.mutate(); }} />}</Field>
    </Dialog>
  );
}
