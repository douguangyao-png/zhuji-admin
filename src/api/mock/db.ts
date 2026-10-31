import { STORE } from '@/app.config';
import { now, stamp } from '@/lib/time';

// 模拟后端的内存库：集合名 → 行；整库存 localStorage，刷新后保留，可一键重置
const KEY = `${STORE}.db.v1`;

type Row = { id: string };
type Data = Record<string, Row[]>;

let data: Data = {};
let seeded = false;
let seedFn: () => Data = () => ({});
let timer: ReturnType<typeof setTimeout> | undefined;

function load(): Data | null {
  try { const s = localStorage.getItem(KEY); return s ? (JSON.parse(s) as Data) : null; } catch { return null; }
}
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 写满时只留在内存里 */ } }, 200);
}

/** 当前请求的操作人和批号，由 router.dispatch 设置；删除记录用 */
export const actor = { id: '', batch: '' };

/** 删除记录：集合里删掉一行时，把整行存进 sys_delete_log，状态「已删除」；恢复就是放回去，清除就是丢掉快照 */
export interface DeleteLog { id: string; table: string; rowId: string; label: string; by: string; at: string; batch: string; state: '已删除' | '已恢复' | '已清除'; handledBy?: string; handledAt?: string; row?: Row }
const NO_LOG = /^(sys_audit|sys_delete_log|msg_)/;
const LABEL_KEYS = ['name', 'title', 'no', 'username', 'subject', 'reason', 'fileName', 'code', 'text'];
const labelOf = (r: Row) => String(LABEL_KEYS.map((k) => (r as unknown as Record<string, unknown>)[k]).find((v) => typeof v === 'string' && v) ?? r.id).slice(0, 200);
let logSeq = 0;
function logDelete(table: string, r: Row) {
  if (NO_LOG.test(table)) return;
  (data.sys_delete_log ??= []).push({ id: `DL${Date.now().toString(36)}${(logSeq++).toString(36)}`, table, rowId: r.id, label: labelOf(r), by: actor.id, at: stamp(), batch: actor.batch, state: '已删除', row: r } as unknown as Row);
}
export const deleteLogs = () => { ensure(); return (data.sys_delete_log ??= []) as unknown as DeleteLog[]; };
export function restoreRow(table: string, row: Row): boolean {
  ensure();
  const list = (data[table] ??= []);
  if (list.some((x) => x.id === row.id)) return false;
  list.push(row);
  save();
  return true;
}
export const saveDb = () => save();

/** 只读快照：集合名 → 行，给演示用的数据库查询看 */
export function snapshot(): Readonly<Record<string, readonly unknown[]>> { ensure(); return data; }

export function setSeed(fn: () => Data) { seedFn = fn; }
function ensure() {
  if (seeded) return;
  data = load() ?? seedFn();
  seeded = true;
}
export function resetDb() {
  data = seedFn();
  seeded = true;
  try { localStorage.removeItem(KEY); } catch { /* 同上 */ }
  save();
}

let seq = 0;
export const uid = (p = '') => `${p}${now().getTime().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** 一个集合的读写；返回的数组是只读快照，改数据只能走 insert/update/remove */
export function table<T extends Row>(name: string) {
  const rows = () => { ensure(); return (data[name] ??= []) as T[]; };
  return {
    all: (): readonly T[] => rows(),
    get: (id: string) => rows().find((r) => r.id === id),
    find: (f: (r: T) => boolean) => rows().find(f),
    where: (f: (r: T) => boolean) => rows().filter(f),
    insert(r: T) { rows().push(r); save(); return r; },
    insertMany(rs: T[]) { rows().push(...rs); save(); },
    update(id: string, patch: Partial<T> | ((r: T) => Partial<T>)) {
      const list = rows();
      const i = list.findIndex((r) => r.id === id);
      if (i < 0) return undefined;
      list[i] = { ...list[i], ...(typeof patch === 'function' ? patch(list[i]) : patch) };
      save();
      return list[i];
    },
    remove(id: string) { const list = rows(); const i = list.findIndex((r) => r.id === id); if (i >= 0) { logDelete(name, list[i]); list.splice(i, 1); save(); } },
    removeWhere(f: (r: T) => boolean) { const all = rows(); all.filter(f).forEach((r) => logDelete(name, r)); data[name] = all.filter((r) => !f(r)); save(); },
    replaceAll(rs: T[]) { data[name] = rs; save(); },
  };
}
