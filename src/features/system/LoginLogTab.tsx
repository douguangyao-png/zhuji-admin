import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { LoginLog, LoginResult } from '@/api/types';
import { Search, SelectFilter } from '@/core/bits';
import { downloadCsv } from '@/core/export';
import { Op } from '@/core/op';
import { today } from '@/lib/time';
import { DataTable, type Columns } from '@/ui/DataTable';
import { Icon } from '@/ui/Icon';
import { Tag, type Tone } from '@/ui/Tag';

const RESULTS: LoginResult[] = ['成功', '失败', '锁定', '退出', '被踢下线'];
const TONE: Record<LoginResult, Tone> = { 成功: 'good', 失败: 'warn', 锁定: 'bad', 退出: 'flat', 被踢下线: 'warn' };

const cols: Columns<LoginLog> = [
  { id: 'at', header: '时间', accessorKey: 'at', meta: { className: 'mono', width: 170 } },
  { id: 'username', header: '账号', accessorKey: 'username', meta: { className: 'mono' } },
  { id: 'name', header: '姓名', accessorFn: (l) => l.userName ?? '' },
  { id: 'result', header: '结果', accessorKey: 'result', cell: (c) => <Tag tone={TONE[c.getValue() as LoginResult] ?? 'flat'}>{c.getValue() as string}</Tag> },
  { id: 'reason', header: '原因', accessorFn: (l) => l.reason ?? '' },
  { id: 'source', header: '方式', accessorKey: 'source' },
  { id: 'ip', header: 'IP', accessorFn: (l) => l.ip ?? '—', meta: { className: 'mono' } },
];

/** 操作日志页里的「登录日志」：成功、失败、锁定、退出都在这里，只读，可导出 */
export function LoginLogTab() {
  const [q, setQ] = useState('');
  const [result, setResult] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = useQuery({ queryKey: ['login-logs', q, result, from, to], queryFn: () => coreApi.loginLogs({ q, result, from, to, size: 500 }), placeholderData: keepPreviousData });
  const rows = list.data?.items ?? [];
  const exportRows = () => downloadCsv(`登录日志-${today()}`, ['时间', '账号', '姓名', '结果', '原因', '方式', 'IP', '浏览器'],
    rows.map((l) => [l.at, l.username, l.userName ?? '', l.result, l.reason ?? '', l.source, l.ip ?? '', l.ua ?? '']));
  return (
    <div className="card">
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="账号、姓名、原因" />
        <SelectFilter label="结果" value={result} onChange={setResult} options={RESULTS} multi />
        <span className="fg3">时间</span>
        <input type="date" className="input" aria-label="登录日志开始日期" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        <span className="fg3">至</span>
        <input type="date" className="input" aria-label="登录日志结束日期" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        <span className="push" />
        <Op k="export"><button type="button" className="btn btn-sm" disabled={!rows.length} onClick={exportRows}><Icon name="download" />导出</button></Op>
      </div>
      <DataTable data={rows} columns={cols} pageId="login-logs" emptyText="还没有登录记录" />
    </div>
  );
}
