import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { AuditLog } from '@/api/types';
import { PageHead, Search, SelectFilter } from '@/core/bits';
import { DocText } from '@/core/doc';
import { DataTable, type Columns } from '@/ui/DataTable';
import { Tabs } from '@/ui/Tabs';
import { DeletedTab } from './DeletedTab';
import { LoginLogTab } from './LoginLogTab';
import { downloadCsv } from '@/core/export';
import { Op } from '@/core/op';
import { today } from '@/lib/time';
import { Icon } from '@/ui/Icon';

/** 操作日志的模块筛选；新模块写日志时用的模块名加在这里 */
const MODULES = ['系统', '示例', '问题反馈', '备份与恢复'];

const cols: Columns<AuditLog> = [
  { id: 'at', header: '时间', accessorKey: 'at', meta: { className: 'mono', width: 170 } },
  { id: 'user', header: '操作人', accessorKey: 'userName' },
  { id: 'module', header: '模块', accessorKey: 'module' },
  { id: 'action', header: '动作', accessorKey: 'action' },
  { id: 'target', header: '对象', accessorKey: 'target', cell: (c) => <DocText module={c.row.original.module} text={c.getValue() as string} /> },
  { id: 'detail', header: '说明（改前改后）', accessorKey: 'detail', cell: (c) => <span className="cm-cell">{(c.getValue() as string) ?? ''}</span> },
  { id: 'source', header: '来源', accessorFn: (a) => a.source ?? '页面操作' },
];

export function AuditPage() {
  const [tab, setTab] = useState('log');
  const [q, setQ] = useState('');
  const [module, setModule] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = useQuery({ queryKey: ['audit', q, module, from, to], queryFn: () => coreApi.audit({ q, module, from, to, size: 500 }), placeholderData: keepPreviousData });
  return (
    <div className="page">
      <PageHead title="操作日志" sub="增删改、审批、导入导出、配置变更全程留痕，只增不改不删；登录、退出、锁定在「登录日志」里；删除的数据在「删除记录」里可以恢复。" />
      <Tabs value={tab} onChange={setTab} items={[{ key: 'log', label: '操作日志' }, { key: 'login', label: '登录日志' }, { key: 'deleted', label: '删除记录' }]} />
      {tab === 'deleted' ? <DeletedTab /> : tab === 'login' ? <LoginLogTab /> : <div className="card">
        <div className="toolbar">
          <Search value={q} onChange={setQ} placeholder="操作人、动作、对象" />
          <SelectFilter label="模块" value={module} onChange={setModule} options={MODULES} multi />
          <span className="fg3">时间</span>
          <input type="date" className="input" aria-label="开始日期" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <span className="fg3">至</span>
          <input type="date" className="input" aria-label="结束日期" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          <span className="push" />
          <Op k="export"><button type="button" className="btn btn-sm" disabled={!list.data?.items.length} onClick={() => downloadCsv(`操作日志-${today()}`, ['时间', '操作人', '模块', '动作', '对象', '说明', '来源'], (list.data?.items ?? []).map((a) => [a.at, a.userName, a.module, a.action, a.target, a.detail ?? '', a.source ?? '页面操作']))}><Icon name="download" />导出</button></Op>
        </div>
        <DataTable data={list.data?.items ?? []} columns={cols} pageId="audit" emptyText="还没有操作记录" />
      </div>}
    </div>
  );
}
