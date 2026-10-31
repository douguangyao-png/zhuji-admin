// 人员同步的模拟实现：规则与后端 org.sync.UserSync 一致；「立即同步」用内置示例数据，外部推送只有真实后端有
import { stamp } from '@/lib/time';
import type { User, UserSyncConfig, UserSyncLine, UserSyncLog } from '../types';
import { table, uid } from './db';
import { ApiError, mock } from './router';
import { registerSeed } from './seed';
import { audit, need, units, users } from './services';

type Stored = UserSyncConfig & { id: string };
const config = table<Stored>('sys_user_sync');
const logs = table<UserSyncLog & { lines: UserSyncLine[] }>('sys_user_sync_log');

export const DEFAULT_GENDER: Record<string, 'M' | 'F'> = { 男: 'M', M: 'M', male: 'M', 女: 'F', F: 'F', female: 'F' };

registerSeed(6, (d) => {
  const c: Stored = {
    id: 'main', enabled: true, impl: 'mock', appKey: '', secret: '', address: '', headerName: '', headerValue: '', listPath: 'data',
    fields: { no: 'no', name: 'name', gender: 'gender', dept: 'dept', phone: 'phone' },
    genderMap: { ...DEFAULT_GENDER }, scheduleEnabled: false, scheduleAt: '02:00', missing: 'keep',
  };
  d.sys_user_sync = [c];
  d.sys_user_sync_log = [];
  // E1004 勾了「不允许接口修改」，示例同步时显示为跳过
  const locked = (d.org_user as User[]).find((u) => u.no === 'E1004');
  if (locked) locked.syncLocked = true;
});

type Rec = { no: string; name: string; gender: string; dept: string; phone: string };
const SAMPLE: Rec[] = [
  ['HR26001', '赵一鸣', '男', '业务一部', '13800026001'],
  ['HR26002', '钱晓雯', '女', '财务部', ''],
  ['HR26003', '孙浩然', '男', '市场部', ''],
  ['E1003', '周文', '男', '业务一部', '13900001003'],
  ['E1004', '吴静', '女', '业务一部', ''],
  ['HR26004', '', '女', '财务部', ''],
  ['HR26005', '李娜', '未知', '财务部', ''],
].map(([no, name, gender, dept, phone]) => ({ no, name, gender, dept, phone }));

const lookup = (m: Record<string, string>, v: string) => {
  const k = v.trim().toLowerCase();
  return Object.entries(m).find(([x]) => x.trim().toLowerCase() === k)?.[1];
};

export function runSync(rows: Rec[], mode: UserSyncLog['mode'], c: UserSyncConfig) {
  const gen = { ...DEFAULT_GENDER, ...c.genderMap };
  const at = stamp();
  const seen = new Map<string, number>();
  const lines: UserSyncLine[] = [];
  const n = { added: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, disabled: 0 };
  rows.forEach((r, i) => {
    const no = r.no.trim(), name = r.name.trim(), dept = r.dept.trim(), phone = r.phone.trim();
    const line: UserSyncLine = { row: i + 1, no, name, result: '失败' };
    const gender = r.gender.trim() ? lookup(gen, r.gender) as User['gender'] : undefined;
    let err = '';
    if (!no) err = '工号为空';
    else if (seen.has(no)) err = `与第 ${seen.get(no)} 条工号重复`;
    else if (!name) err = '姓名为空';
    else if (r.gender.trim() && !gender) err = `性别「${r.gender.trim()}」没有对应，请在取值映射里添加`;
    else if (phone && !/^1\d{10}$/.test(phone)) err = '手机号应为 11 位数字';
    if (no && !seen.has(no)) seen.set(no, i + 1);
    if (err) { lines.push({ ...line, reason: err }); n.failed++; return; }
    const unit = dept ? units.find((u) => u.name === dept) : undefined;
    const note = dept && !unit ? `部门「${dept}」在本系统不存在` : '';
    const patch: Partial<User> = { name, ...(gender ? { gender } : {}), ...(phone ? { phone } : {}), ...(unit ? { unitId: unit.id } : {}) };
    const old = users.find((u) => u.no === no);
    if (old) {
      if (old.syncLocked) { lines.push({ ...line, result: '跳过', reason: '已设为不允许接口修改' }); n.skipped++; return; }
      const changed = old.name !== name || (gender && gender !== old.gender) || (unit && unit.id !== old.unitId) || (phone && phone !== old.phone);
      users.update(old.id, { ...patch, source: 'sync', lastSyncAt: at });
      lines.push({ ...line, result: changed ? '更新' : '无变化', reason: note ? `${note}，部门未改` : null });
      if (changed) n.updated++; else n.unchanged++;
      return;
    }
    if (users.find((u) => u.username === no)) { lines.push({ ...line, reason: `账号 ${no} 已被其他人员使用` }); n.failed++; return; }
    users.insert({ id: uid('U'), username: no, no, unitId: unit?.id ?? units.find((u) => !u.parentId)!.id, active: true, roleKeys: ['user'],
      source: 'sync', lastSyncAt: at, ...patch } as User);
    lines.push({ ...line, result: '新增', reason: note ? `${note}，先放在根组织` : null });
    n.added++;
  });
  if (c.missing === 'disable' && seen.size) {
    for (const u of users.where((x) => x.source === 'sync' && x.active && !x.syncLocked && !seen.has(x.no))) {
      users.update(u.id, { active: false });
      lines.push({ no: u.no, name: u.name, result: '停用', reason: '外部不再返回' });
      n.disabled++;
    }
  }
  return logs.insert({ id: uid('SL'), at, mode, total: rows.length, ...n, ok: true, message: '', costMs: 0, lines });
}

const view = (c: Stored): UserSyncConfig => {
  const out: Partial<Stored> = { ...c, secret: c.secret ? '********' : '', headerValue: c.headerValue ? '********' : '' };
  delete out.id;
  return out as UserSyncConfig;
};
const strip = (l: UserSyncLog & { lines?: UserSyncLine[] }): UserSyncLog => {
  const out = { ...l };
  delete out.lines;
  return out;
};

mock.get('/sys/user-sync', ({ user }) => { need(user, 'sys:device'); return view(config.get('main')!); });
mock.put('/sys/user-sync', ({ user, body }) => {
  need(user, 'sys:device');
  if (body.scheduleAt !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.scheduleAt))) throw new ApiError(400, '每天同步时间应为 HH:mm，如 02:00');
  const cur = config.get('main')!;
  const next = { ...body };
  delete next.appKey;
  if (next.secret !== undefined) delete next.secret;
  if (next.headerValue === '********') delete next.headerValue;
  if ((next.impl ?? cur.impl) === 'vendor' && next.scheduleEnabled && !(next.address ?? cur.address)) throw new ApiError(422, '开启定时拉取前请填写外部人员接口地址');
  audit(user, '系统', '修改人员同步配置', '人员同步');
  return view(config.update('main', next)!);
});
mock.post('/sys/user-sync/secret', ({ user }) => {
  need(user, 'sys:device');
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const appKey = `zj${hex(16)}`, secret = hex(64);
  config.update('main', { appKey, secret });
  audit(user, '系统', '生成人员同步密钥', appKey);
  return { appKey, secret };
});
mock.post('/sys/user-sync/run', ({ user }) => {
  need(user, 'sys:device');
  const c = config.get('main')!;
  if (c.impl === 'vendor') throw new ApiError(422, '演示环境不能连接外部人员接口，请把实现改为模拟实现');
  return strip(runSync(SAMPLE, 'manual', c));
});
mock.get('/sys/user-sync/logs', ({ user }) => { need(user, 'sys:device'); return [...logs.all()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50).map(strip); });
mock.get('/sys/user-sync/logs/:id', ({ user, params }) => {
  need(user, 'sys:device');
  const l = logs.get(params.id);
  if (!l) throw new ApiError(404, '同步记录不存在');
  return l;
});

mock.post('/org/users/sync-lock', ({ user, body }) => {
  need(user, 'sys:user');
  const ids = (body.ids ?? []) as string[];
  let n = 0;
  for (const id of ids) {
    const u = users.get(id);
    if (!u || Boolean(u.syncLocked) === Boolean(body.locked)) continue;
    users.update(id, { syncLocked: Boolean(body.locked) });
    n++;
  }
  audit(user, '系统', body.locked ? '设为不允许接口修改' : '取消不允许接口修改', `${n} 人`);
  return n;
});
