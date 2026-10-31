import { APP } from '@/app.config';
// 模拟后端的备份与恢复：只记备份清单，不真的打包；恢复校验密码和「确认恢复」、先生成恢复前备份，数据本身不动。规则与后端 backup 包一致
import { snapshot, table } from '@/api/mock/db';
import { ApiError, mock } from '@/api/mock/router';
import { registerSeed } from '@/api/mock/seed';
import { openSealed } from '@/api/mock/sm2';
import { audit, need } from '@/api/mock/services';
import { stamp } from '@/lib/time';
import type { BackupItem, BackupKind, BackupSettings } from './backup-api';
import { CONFIRM_TEXT } from './backup-api';

const PERM = 'sys:backup';
const MODULE = '备份与恢复';
const LABEL: Record<BackupKind, string> = { manual: '手动', auto: '自动', prerestore: '恢复前', upload: '上传' };
const NAME = new RegExp(`^${APP.backupPrefix}-\\d{8}-\\d{6}-(manual|auto|prerestore|upload)(-\\d{1,3})?\\.zip$`);
/** 清单整个存在一行里：删备份不进「删除记录」（后端删的是文件，也不进） */
type State = { id: string; items: BackupItem[]; settings: BackupSettings };
const states = table<State>('sys_backup');
const passwords = table<{ id: string; pw: string }>('auth_password');
const DEFAULTS: BackupSettings = { auto: true, time: '02:00', keep: 7 };
let running: 'backup' | 'restore' | null = null;

const DEFAULT_STATE = (): State => ({ id: 'main', items: [], settings: DEFAULTS });
const state = () => states.get('main') ?? states.insert(DEFAULT_STATE());
const items = () => state().items;
const setItems = (list: BackupItem[]) => states.update('main', { items: list });
const find = (name: string) => items().find((b) => b.name === name);

const nameOf = (at: string, kind: BackupKind, taken: (n: string) => boolean = (n) => Boolean(find(n))) => {
  const base = `${APP.backupPrefix}-${at.replace(/-/g, '').replace(' ', '-').replace(/:/g, '')}${at.length === 16 ? '00' : ''}-${kind}`;
  let name = `${base}.zip`;
  for (let i = 2; taken(name); i++) name = `${base}-${i}.zip`;
  return name;
};

/** 按当前模拟库估算表数、行数、附件数 */
function make(kind: BackupKind, operator: string, at = stamp(), taken?: (n: string) => boolean, db: Readonly<Record<string, readonly unknown[] | undefined>> = snapshot()): BackupItem {
  const tables = Object.keys(db).filter((k) => !k.startsWith('sys_backup'));
  const rows = tables.reduce((s, k) => s + (db[k]?.length ?? 0), 0);
  const attachments = db.sys_attachment?.length ?? 0;
  const name = nameOf(at, kind, taken);
  return { name, kind, kindLabel: LABEL[kind], createdAt: at.length === 16 ? `${at}:00` : at, size: 2048 * 1024 + rows * 180, operator, schemaVersion: '55', appVersion: '演示',
    tables: tables.length, rows, attachments, missing: 0 };
}

registerSeed(95, (d) => {
  const none = () => false;
  const seed: State = { id: 'main', settings: DEFAULTS, items: [make('auto', '系统', '2026-10-23 02:00', none, d), make('manual', '系统管理员', '2026-10-20 17:42', none, d)] };
  d.sys_backup = [seed] as unknown as typeof d.sys_backup;
});

const add = (b: BackupItem) => { setItems([b, ...items()]); return b; };
const one = (name: string) => {
  if (!NAME.test(name)) throw new ApiError(400, '备份文件名不合规');
  const b = find(name);
  if (!b) throw new ApiError(404, '备份不存在');
  return b;
};
const busy = () => { if (running) throw new ApiError(409, running === 'restore' ? '系统正在恢复数据，请稍后' : '正在备份，请稍后'); };

mock.get('/backups', ({ user }) => {
  need(user, PERM);
  const list = [...items()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { items: list, dir: `/data/${APP.storagePrefix}/backups`, freeBytes: 86 * 1024 ** 3, running };
});
mock.post('/backups', ({ user }) => {
  need(user, PERM);
  busy();
  const b = add(make('manual', user.name));
  audit(user, MODULE, '备份', b.name, `${b.tables} 张表 ${b.rows} 行，${b.attachments} 个附件`);
  return b;
});
mock.del('/backups/:name', ({ user, params }) => {
  need(user, PERM);
  const b = one(params.name);
  busy();
  setItems(items().filter((x) => x.name !== b.name));
  audit(user, MODULE, '删除备份', b.name);
  return true;
});
mock.post('/backups/upload', ({ user, body }) => {
  need(user, PERM);
  busy();
  const fileName = String(body.fileName ?? '');
  if (!/\.zip$/i.test(fileName)) throw new ApiError(422, '不是本系统的备份包：文件不是 zip 格式或已损坏');
  const b = add(make('upload', user.name));
  audit(user, MODULE, '上传备份', b.name, fileName);
  return b;
});
mock.post('/backups/:name/restore', ({ user, params, body }) => {
  need(user, PERM);
  const b = one(params.name);
  if (String(body.confirm ?? '').trim() !== CONFIRM_TEXT) throw new ApiError(422, `请输入「${CONFIRM_TEXT}」四个字`);
  const pw = String(openSealed(body).password ?? '');
  if (pw !== (passwords.get(user.id)?.pw ?? 'demo')) {
    audit(user, MODULE, '恢复密码错误', b.name);
    throw new ApiError(422, '密码不正确');
  }
  busy();
  if (b.error) throw new ApiError(422, '不是本系统的备份包');
  const pre = add(make('prerestore', user.name));
  audit(user, MODULE, '恢复', b.name, `${b.tables} 张表 ${b.rows} 行；恢复前备份 ${pre.name}（演示环境数据不变）`);
  return { name: b.name, tables: b.tables, rows: b.rows, attachments: b.attachments, fileErrors: 0, preRestore: pre.name, relogin: true };
});
mock.get('/backups/settings', ({ user }) => {
  need(user, PERM);
  return state().settings;
});
mock.put('/backups/settings', ({ user, body }) => {
  need(user, PERM);
  const time = String(body.time ?? '');
  const keep = Number(body.keep);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ApiError(422, '自动备份时间填 00:00 到 23:59');
  if (!Number.isInteger(keep) || keep < 1 || keep > 90) throw new ApiError(422, '自动备份保留份数填 1 到 90');
  const s = { auto: Boolean(body.auto), time, keep };
  state();
  states.update('main', { settings: s });
  audit(user, MODULE, '修改备份设置', '自动备份', `${s.auto ? `每天 ${time} 自动备份` : '不自动备份'}，保留最近 ${keep} 份`);
  return s;
});

/** 测试用：模拟正在备份或恢复 */
export const setBackupRunning = (r: typeof running) => { running = r; };
