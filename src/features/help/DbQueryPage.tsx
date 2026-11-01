import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { get, post } from '@/api/http';
import { PageHead, Search } from '@/core/bits';
import { downloadXlsx, toCsv } from '@/lib/sheet';
import { today } from '@/lib/time';
import { DataTable, type Columns } from '@/ui/DataTable';
import { Dialog } from '@/ui/Dialog';
import { Icon } from '@/ui/Icon';
import { Empty, Loading } from '@/ui/primitives';
import { Tabs } from '@/ui/Tabs';
import { SortTh } from '@/ui/SortTh';
import { useTableSort } from '@/ui/useTableSort';
import { toast } from '@/ui/Toast';
import './help.css';
import { groupTables, sqlProblem, SQL_MAX_ROWS, type DbResult, type DbStructure, type DbTable } from './sql';
import { SideFoldButton, SideGrid } from '@/ui/SidePane';

const dbApi = {
  tables: () => get<DbTable[]>('/admin/db/tables'),
  structure: (name: string) => get<DbStructure>(`/admin/db/tables/${encodeURIComponent(name)}`),
  query: (sql: string) => post<DbResult>('/admin/db/query', { sql }),
};

const cell = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
/** 查询结果导出：第一行是列名，和界面上看到的一致（密码、密钥列已是 ******） */
const sheetOf = (r: DbResult): string[][] => [r.columns, ...r.rows.map((row) => row.map(cell))];
function exportCsv(r: DbResult, name: string) {
  const url = URL.createObjectURL(new Blob(['﻿', toCsv(sheetOf(r))], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 单元格里的完整内容：JSON 字符串（如 {"a":1}）排版成多行，方便看 */
function pretty(v: unknown): string {
  const raw = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
  if (/^\s*[{[]/.test(raw)) {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { /* 不是合法 JSON 就原样显示 */ }
  }
  return raw;
}

/** 结果里每个单元格固定宽度，一行放不下的用省略号，点开看完整内容 */
function Cell({ v, col, onOpen }: { v: unknown; col: string; onOpen: (c: { col: string; text: string }) => void }) {
  if (v === null || v === undefined) return <span className="fg3">NULL</span>;
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return (
    <button type="button" className="db-cell" title={text.length > 200 ? `${text.slice(0, 200)}…（点开看完整内容）` : text} aria-label={`${col}：${text.slice(0, 40)}`} onClick={() => onOpen({ col, text: pretty(v) })}>{text}</button>
  );
}

/** 管理员的只读数据库查询：看有哪些表、表结构，输入 select / show 等语句查数据；只能查，不能改 */
export function DbQueryPage() {
  const tables = useQuery({ queryKey: ['db', 'tables'], queryFn: dbApi.tables, retry: 2 });
  const [q, setQ] = useState('');
  const [cur, setCur] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [full, setFull] = useState<{ col: string; text: string } | null>(null);
  const [tab, setTab] = useState('sql');
  const [sql, setSql] = useState('select * from sys_setting limit 100');
  const [result, setResult] = useState<DbResult | null>(null);
  const [error, setError] = useState('');
  const list = (tables.data ?? []).filter((t) => !q || t.name.includes(q.toLowerCase()) || (t.comment ?? '').includes(q));
  const groups = useMemo(() => groupTables(list), [list]);
  const structure = useQuery({ queryKey: ['db', 'table', cur], queryFn: () => dbApi.structure(cur), enabled: Boolean(cur) });
  const run = useMutation({
    mutationFn: dbApi.query,
    onSuccess: (r) => { setResult(r); setError(''); },
    onError: (e: Error) => { setResult(null); setError(e.message); },
  });
  const problem = sqlProblem(sql);
  const exec = () => {
    if (problem) { setError(problem); setResult(null); return; }
    run.mutate(sql);
  };
  /** 选一张表：看它的结构，同时把「SQL 查询」里的语句换成查这张表的 */
  const pick = (name: string) => {
    setCur(name);
    setTab('structure');
    setSql(`select * from ${name} limit 100`);
    setResult(null);
    setError('');
  };
  const sample = (name: string) => {
    setSql(`select * from ${name} limit 100`);
    setTab('sql');
    setResult(null);
    setError('');
  };

  const resultCols = useMemo<Columns<unknown[]>>(() => (result?.columns ?? []).map((name, i) => ({
    id: `c${i}`, header: name, accessorFn: (r: unknown[]) => (r[i] === null || r[i] === undefined ? '' : typeof r[i] === 'object' ? JSON.stringify(r[i]) : String(r[i])),
    meta: { width: 180 },
    cell: (c) => <Cell v={c.row.original[i]} col={name} onOpen={setFull} />,
  })), [result]);

  return (
    <div className="page">
      <PageHead title="数据库查询" sub={`只有系统管理员能用，只能查询：select、with、show、explain，一次一条，最多返回 ${SQL_MAX_ROWS} 行；不能新增、修改、删除。每次查询都记操作日志，密码、密钥一类列的值显示为 ******。`} />
      <SideGrid id="help.db" label="数据表">
        <div className="card">
          <div className="card-h b"><span className="card-t">数据表</span><span className="card-s">{tables.data ? `${tables.data.length} 张` : ''}</span>
            <SideFoldButton push /></div>
          <div className="toolbar"><Search value={q} onChange={setQ} placeholder="表名、说明" /></div>
          {tables.isLoading ? <Loading /> : tables.isError ? (
            <div className="card-b stack"><span className="fg3">数据表读取失败：{(tables.error as Error).message}</span><div><button type="button" className="btn btn-sm" onClick={() => void tables.refetch()}><Icon name="refresh" />重试</button></div></div>
          ) : (
            <div className="role-l" style={{ maxHeight: 560, overflow: 'auto' }}>
              {groups.map((g) => {
                const open = Boolean(q) || !closed.has(g.name);
                return (
                  <div key={g.name} role="group" aria-label={g.name}>
                    <button type="button" className="role-i" style={{ fontWeight: 600 }} aria-expanded={open}
                      onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(g.name)) n.delete(g.name); else n.add(g.name); return n; })}>
                      <span><Icon name={open ? 'down' : 'right'} style={{ width: 12, height: 12, marginRight: 6 }} />{g.name}</span>
                      <span className="fg3 mono">{g.tables.length}</span>
                    </button>
                    {open && g.tables.map((t) => (
                      <button key={t.name} type="button" className={`role-i${t.name === cur ? ' on' : ''}`} style={{ paddingLeft: 28 }} onClick={() => pick(t.name)}>
                        <span><b className="mono" style={{ fontSize: 12.5 }}>{t.name}</b>{t.comment && <span className="fg3" style={{ display: 'block', fontSize: 12 }}>{t.comment}</span>}</span>
                        <span className="fg3 mono">{t.rows}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {!list.length && <div className="card-b fg3">没有匹配的表</div>}
            </div>
          )}
        </div>
        <div className="card">
          <Tabs value={tab} onChange={setTab} items={[{ key: 'sql', label: 'SQL 查询' }, { key: 'structure', label: cur ? `表结构：${cur}` : '表结构' }]} />
          {tab === 'structure' ? (
            !cur ? <Empty text="在左边选一张表" sub="可以看列的名称、类型、是否可空、默认值、说明和索引。" /> : structure.isLoading ? <Loading /> : structure.isError ? <div className="card-b fg3">{(structure.error as Error).message}</div> : (
              <div className="card-b stack">
                <div className="row"><b className="mono">{cur}</b><span className="push" /><button type="button" className="btn btn-sm" onClick={() => sample(cur)}><Icon name="search" />查询前 100 行</button></div>
                <StructColumns columns={structure.data!.columns} />
                {structure.data!.indexes.length > 0 && <StructIndexes indexes={structure.data!.indexes} />}
              </div>
            )
          ) : (
            <div className="card-b stack">
              <textarea className="input mono" rows={6} aria-label="SQL 语句" spellCheck={false} value={sql} placeholder="select * from org_user limit 100"
                onChange={(e) => setSql(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') exec(); }} />
              <div className="row">
                <button type="button" className="btn btn-p" disabled={run.isPending} onClick={exec}><Icon name="play" />执行</button>
                <span className="fg3" style={{ fontSize: 12 }}>Ctrl + Enter 执行；超过 {SQL_MAX_ROWS} 行只返回前 {SQL_MAX_ROWS} 行，建议自己加 limit。</span>
              </div>
              {error && <div className="note crit" role="alert"><Icon name="alert" /><span>{error}</span></div>}
              {result && (
                <>
                  <div className="row">
                    <span className="fg3" role="status">{result.count} 行 · {result.ms} 毫秒{result.truncated ? `，结果超过 ${SQL_MAX_ROWS} 行，只显示前 ${SQL_MAX_ROWS} 行` : ''}</span>
                    <span className="push" />
                    <button type="button" className="btn btn-sm" disabled={!result.count} onClick={() => downloadXlsx(`数据库查询-${today()}`, sheetOf(result))}><Icon name="download" />导出 Excel</button>
                    <button type="button" className="btn btn-sm" disabled={!result.count} onClick={() => exportCsv(result, `数据库查询-${today()}`)}><Icon name="download" />导出 CSV</button>
                  </div>
                  <DataTable data={result.rows} columns={resultCols} pageId="db-result" emptyText="没有数据" />
                </>
              )}
            </div>
          )}
        </div>
      </SideGrid>
      {full && (
        <Dialog title={full.col} sub="单元格的完整内容" size="lg" onClose={() => setFull(null)}
          footer={<><button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(full.text).then(() => toast('已复制'))}><Icon name="copy" />复制</button><span className="push" /><button type="button" className="btn btn-p" onClick={() => setFull(null)}><Icon name="x" />关闭</button></>}>
          <pre className="db-full">{full.text}</pre>
        </Dialog>
      )}
    </div>
  );
}

function StructColumns({ columns }: { columns: DbStructure['columns'] }) {
  const sort = useTableSort(columns, { name: (c) => c.name, type: (c) => c.type, nullable: (c) => c.nullable, default: (c) => c.default, comment: (c) => c.comment });
  return (
    <table className="tbl" aria-label="表结构">
      <thead><tr><SortTh sort={sort} k="name">列名</SortTh><SortTh sort={sort} k="type">类型</SortTh><SortTh sort={sort} k="nullable">可空</SortTh><SortTh sort={sort} k="default">默认值</SortTh><SortTh sort={sort} k="comment">说明</SortTh></tr></thead>
      <tbody>
        {sort.rows.map((c) => (
          <tr key={c.name}><td className="mono">{c.name}</td><td className="mono">{c.type}</td><td>{c.nullable ? '是' : '否'}</td><td className="mono fg3">{c.default ?? ''}</td><td className="fg3">{c.comment ?? ''}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function StructIndexes({ indexes }: { indexes: DbStructure['indexes'] }) {
  const sort = useTableSort(indexes, { name: (i) => i.name, def: (i) => i.def });
  return (
    <table className="tbl" aria-label="索引">
      <thead><tr><SortTh sort={sort} k="name">索引</SortTh><SortTh sort={sort} k="def">定义</SortTh></tr></thead>
      <tbody>{sort.rows.map((i) => <tr key={i.name}><td className="mono">{i.name}</td><td className="mono fg3" style={{ whiteSpace: 'normal' }}>{i.def}</td></tr>)}</tbody>
    </table>
  );
}
