// 帮助模块的模拟接口：管理员的只读数据库查询。演示数据在浏览器的内存库里，只支持 select * from 表 [limit n] 和 show tables
import { snapshot } from '@/api/mock/db';
import { ApiError, mock } from '@/api/mock/router';
import { audit, need } from '@/api/mock/services';
import { secretColumn, sqlProblem, SQL_MAX_ROWS, type DbColumn, type DbResult, type DbStructure, type DbTable } from './sql';

const PERM = 'sys:db';
const names = () => Object.keys(snapshot()).filter((k) => /^[a-z][a-z0-9_]*$/.test(k)).sort();
const rowsOf = (t: string) => (snapshot()[t] ?? []) as Record<string, unknown>[];
const typeOf = (v: unknown) => (typeof v === 'number' ? 'numeric' : typeof v === 'boolean' ? 'boolean' : v !== null && typeof v === 'object' ? 'jsonb' : 'character varying');
const colsOf = (t: string): string[] => [...new Set(rowsOf(t).slice(0, 200).flatMap((r) => Object.keys(r)))];

mock.get('/admin/db/tables', ({ user }) => {
  need(user, PERM);
  return names().map((name): DbTable => ({ name, comment: null, rows: rowsOf(name).length }));
});

mock.get('/admin/db/tables/:name', ({ user, params }) => {
  need(user, PERM);
  if (!names().includes(params.name)) throw new ApiError(404, '没有这张表');
  const sample = rowsOf(params.name).find(Boolean) ?? {};
  const columns = colsOf(params.name).map((name): DbColumn => ({ name, type: typeOf(sample[name]), nullable: name !== 'id', default: null, comment: null }));
  return { name: params.name, columns, indexes: columns.some((c) => c.name === 'id') ? [{ name: `pk_${params.name}`, def: `PRIMARY KEY (id)` }] : [] } satisfies DbStructure;
});

mock.post('/admin/db/query', ({ user, body }) => {
  need(user, PERM);
  const sql = String(body.sql ?? '');
  const bad = sqlProblem(sql);
  if (bad) throw new ApiError(422, bad);
  const s = sql.trim().replace(/;+$/, '').trim();
  const m = /^select\s+\*\s+from\s+([a-z][a-z0-9_]*)(?:\s+limit\s+(\d+))?$/i.exec(s);
  if (!m || !names().includes(m[1].toLowerCase())) throw new ApiError(422, '演示环境只支持 select * from 表名 [limit 数量]，正式环境支持完整的 select / with / show / explain');
  const t = m[1].toLowerCase();
  const cols = colsOf(t);
  const want = Math.min(m[2] === undefined ? SQL_MAX_ROWS : Number(m[2]), SQL_MAX_ROWS);
  const all = rowsOf(t);
  const rows = all.slice(0, want).map((r) => cols.map((c) => (secretColumn(c) && r[c] != null ? '******' : r[c] ?? null)));
  audit(user, '系统', '数据库查询', s.slice(0, 200), `返回 ${rows.length} 行`);
  return { columns: cols, rows, count: rows.length, truncated: all.length > want && want >= SQL_MAX_ROWS, ms: 1 } satisfies DbResult;
});
