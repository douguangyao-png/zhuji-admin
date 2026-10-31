// 数据库查询的语句检查，规则同后端 SqlGuard：只放行 select / with / show / explain 开头的单条查询
export const SQL_MAX_ROWS = 10000;
const START = new Set(['select', 'with', 'show', 'explain']);
const DENY = new Set([
  'insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke', 'copy', 'call', 'do', 'execute', 'prepare', 'deallocate',
  'vacuum', 'analyze', 'analyse', 'merge', 'reindex', 'cluster', 'set', 'reset', 'into', 'begin', 'commit', 'rollback', 'savepoint', 'listen', 'notify',
  'pg_read_file', 'pg_read_binary_file', 'pg_ls_dir', 'pg_stat_file', 'pg_sleep', 'lo_import', 'lo_export', 'lo_unlink', 'dblink', 'pg_terminate_backend',
  'pg_cancel_backend', 'pg_reload_conf', 'pg_rotate_logfile', 'pg_switch_xlog', 'pg_switch_wal', 'set_config',
]);

/** 引号外的单词（小写）；遇到分号、注释、美元符引用、反斜杠、引号没闭合时返回提示 */
function words(s: string): string[] | string {
  const out: string[] = [];
  let cur = '';
  const flush = () => { if (cur) { out.push(cur); cur = ''; } };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"') {
      flush();
      let j = i + 1;
      for (;;) {
        if (j >= s.length) return '引号没有闭合';
        if (s[j] === c) { if (s[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      i = j;
      continue;
    }
    if (c === ';') return '一次只能执行一条语句，去掉中间的分号';
    if (c === '\\') return '不支持反斜杠转义';
    if (c === '$' && (s[i + 1] === '$' || /[A-Za-z]/.test(s[i + 1] ?? ''))) return '不支持美元符号引用的字符串';
    if ((c === '-' && s[i + 1] === '-') || (c === '/' && s[i + 1] === '*')) return '不支持注释，请去掉 -- 和 /* */';
    if (/[\p{L}\p{N}_]/u.test(c)) cur += c.toLowerCase(); else flush();
  }
  flush();
  return out;
}

/** 返回 null 表示通过，否则是不通过的原因 */
export function sqlProblem(sql: string): string | null {
  let s = sql.trim();
  while (s.endsWith(';')) s = s.slice(0, -1).trim();
  if (!s) return '请输入要查询的 SQL';
  if (s.length > 20000) return 'SQL 太长，最多 20000 个字符';
  const w = words(s);
  if (typeof w === 'string') return w;
  if (!w.length) return '请输入要查询的 SQL';
  if (!START.has(w[0])) return '只能执行 select、with、show、explain 开头的查询语句';
  const bad = w.find((x) => DENY.has(x));
  return bad ? `只能查询，不能执行「${bad}」` : null;
}

/** 结果里这类列的值不给看：密码、密钥、令牌 */
export const secretColumn = (c: string) => /password|passwd|pwd|secret|token|private|_salt$|^salt$|_enc$|webhook/i.test(c);

export interface DbTable { name: string; comment: string | null; rows: number }
export interface DbColumn { name: string; type: string; nullable: boolean; default: string | null; comment: string | null }
export interface DbStructure { name: string; columns: DbColumn[]; indexes: { name: string; def: string }[] }
export interface DbResult { columns: string[]; rows: unknown[][]; count: number; truncated: boolean; ms: number }

/** 数据表按名称前缀分类，顺序即界面顺序；没有对上的归「其他」 */
export const TABLE_GROUPS: { name: string; prefixes: string[] }[] = [
  { name: '组织与权限', prefixes: ['org', 'auth'] },
  { name: '审批', prefixes: ['wf'] },
  { name: '消息', prefixes: ['msg'] },
  { name: '系统', prefixes: ['sys'] },
  // 业务模块的表按表名前缀分类，新模块在这里加一行
  { name: '示例模块', prefixes: ['ex'] },
];
export const tableGroup = (name: string) => TABLE_GROUPS.find((g) => g.prefixes.includes(name.split('_')[0]))?.name ?? '其他';

/** 把表分好类，空类别不出现 */
export function groupTables<T extends { name: string }>(tables: T[]): { name: string; tables: T[] }[] {
  const order = [...TABLE_GROUPS.map((g) => g.name), '其他'];
  return order.map((name) => ({ name, tables: tables.filter((t) => tableGroup(t.name) === name) })).filter((g) => g.tables.length > 0);
}
