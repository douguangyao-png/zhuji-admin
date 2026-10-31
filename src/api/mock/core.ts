import { DEFAULT_FEATURES, DEFAULT_PRODUCT_NAME, FEATURE_LABEL, MENU_NAME_MAX, MSG_LEVELS, SECURITY_DEFAULTS, WORK_END, WORK_START, type DictItem, type LoginLog, type FeatureKey, type HomeLayout, type MenuNode, type SettingsInput, type MsgPolicy, type OrgUnit, type Role, type Settings, type User, type WfDef, type WfInstance, type WfPolicy } from '../types';
import { deleteLogs, resetDb, restoreRow, saveDb, table, uid } from './db';
import { byDictOrder, DEFAULT_DICT_SORT } from './dict-order';
import { ApiError, kw, mock, paginate, setGuard } from './router';
import { runDailyJobs } from './notify';
import { passwordProblems, policyOf } from '@/lib/password';
import { openSealed, sealFor } from './sm2';
import { checkLoginCaptcha, onLoginFailure, onLoginSuccess, resetMockCaptcha } from './captcha';
import { now, stamp } from '@/lib/time';
import { workDaysOf, workDaysText } from '@/lib/holidays';
import { DEFAULT_MSG_POLICY, dictTypes, registerSeed } from './seed';
import { matchPeople } from '@/lib/people';
import { attrDefs, checkAttr, ensureRoles, mergeAttrs } from './people';
import { BUILTIN_ROLES } from './seed';
import { newSession } from './session';
import { redact } from '@/lib/mask';
import {
  actWorkflow, audit, can, escalate, levelFor, levelRank, loginLog, messages, msgPolicy, need, onTop, pendingFor, permsOf, proxyPendingFor, roles, saveMsgPolicy, saveWfPolicy,
  settings, todosOf, units, unitName, userName, urgeState, urgeWorkflow, users, wfDefs, wfInstances, wfPolicy,
} from './services';

const DEMO_PASSWORD = 'demo';

// 与后端 PermInterceptor 一致：带 /import 的提交、以 /export 结尾的下载要操作权限
setGuard((method, path, user) => {
  if (method === 'POST' && /\/import(\/[^/]*)?$/.test(path)) need(user, 'op:import');
  if (path.endsWith('/export')) need(user, 'op:export');
});
/** 改过或被重置的密码；没有记录的账号密码是 demo。演示用明文，接后端时服务端只存 SM3 摘要 */
const passwords = table<{ id: string; pw: string; history: string[]; mustChange: boolean; isDefault?: boolean; logins?: number }>('auth_password');
const DEFAULT_RESET_PASSWORD = 'Admin@2026', DEFAULT_LOGINS = 5;
const defaultPw = () => String(settings()?.defaultPassword || DEFAULT_RESET_PASSWORD);
const maxLogins = () => Number(settings()?.defaultPasswordLogins ?? DEFAULT_LOGINS);
/** 要改密码的原因：default 只提示可忽略，超过可忽略次数变 default-force */
const changeReason = (id: string) => {
  const p = passwords.get(id);
  if (p?.mustChange) return 'must' as const;
  if (p?.isDefault) return (p.logins ?? 0) > maxLogins() ? 'default-force' as const : 'default' as const;
  return null;
};
const pwOf = (id: string) => passwords.get(id)?.pw ?? DEMO_PASSWORD;
const savePw = (id: string, row: { pw: string; history: string[]; mustChange: boolean; isDefault?: boolean; logins?: number }) => (passwords.get(id) ? passwords.update(id, row) : passwords.insert({ id, ...row }));
const settingsT = table<Settings & { id: string }>('sys_setting');
const dicts = table<DictItem>('sys_dict');
const audits = table<{ id: string; at: string; module: string; userName: string; action: string; target: string }>('sys_audit');

// 演示账号各几条站内消息，首页和「消息」不至于空着
registerSeed(90, (d) => {
  const ago = (h: number) => stamp(new Date(now().getTime() - h * 3600_000));
  // 等级按默认策略算：报警为紧急，逾期为重要，公告为次要
  const sample: [string, string, string, string, string, number][] = [
    ['示例', '设备报警：机房温度过高', '信息中心机房温度 32℃，请尽快处理。', '/example', 'U01,U02', 0.5],
    ['审批', '示例登记待审核', '有一条示例登记等你审核。', '/approvals', 'U01,U03', 1],
    ['示例', '示例登记已通过', '你提交的示例登记已审核通过。', '/example/mine', 'U01,U04', 6],
    ['示例', '示例登记逾期未处理', '有 2 条示例登记超过 3 天未处理。', '/example', 'U01,U02', 11],
    ['公告', '系统维护公告', '本周六 22:00–23:00 系统维护，期间暂停使用。', '/messages', 'U01,U03,U04,U05', 13],
    ['问题反馈', '你的问题反馈已回复', '你提交的问题反馈已有处理意见。', '/help/feedback', 'U01,U04,U05', 21],
  ];
  const lp = DEFAULT_MSG_POLICY.levels;
  d.msg_message = sample.flatMap(([kind, title, body, link, to, h], i) => to.split(',').map((u) => ({
    id: `MS${i}${u}`, to: u, kind, title, body, link, at: ago(h), read: i > 4, level: levelFor({ kind, title }, lp), eventAt: null,
  })));
});

export const publicUser = (u: User) => ({ ...u, unitName: unitName(u.unitId), roleNames: u.roleKeys.map((k) => roles.get(k)?.name ?? k) });

// ---------- 登录 ----------

/** 连续输错锁定：按账号记失败次数，达到「安全策略」里的次数后锁定若干分钟；登录成功清零 */
const locks = table<{ id: string; fails: number; until?: number }>('auth_lock');
const lockAfter = () => Number(settings()?.lockAfter ?? SECURITY_DEFAULTS.lockAfter);
const lockMinutes = () => Number(settings()?.lockMinutes ?? SECURITY_DEFAULTS.lockMinutes);
const lockKey = (u: unknown) => String(u ?? '').trim().toLowerCase();

/** 登录成功：发会话号（踢下线用），记登录日志 */
function signedIn(u: User, source: string) {
  const sid = newSession(u.id);
  loginLog({ username: u.username, userId: u.id, userName: u.name, result: '成功', source });
  return { ...publicUser(u), sid };
}

mock.open('POST', '/auth/login', ({ body }) => {
  const username = String(body.username ?? '').trim();
  const key = lockKey(username);
  const lock = locks.get(key);
  if (lock?.until && lock.until > now().getTime()) {
    const left = Math.ceil((lock.until - now().getTime()) / 60_000);
    loginLog({ username, result: '锁定', reason: `锁定中，还剩 ${left} 分钟`, source: '账号密码' });
    throw new ApiError(422, `连续输错密码，账号已锁定，请 ${left} 分钟后再试`);
  }
  const password = openSealed(body).password; // 密码只认 SM2 密文
  checkLoginCaptcha(username, body.captchaToken);
  try {
    const u = users.find((x) => x.username === username);
    if (!u || password !== pwOf(u.id)) throw new ApiError(422, '用户名或密码不正确');
    if (!u.active) throw new ApiError(422, '账号已停用');
    onLoginSuccess(username);
    locks.remove(key);
    const pw = passwords.get(u.id);
    if (pw?.isDefault) passwords.update(u.id, { logins: (pw.logins ?? 0) + 1 });
    return signedIn(u, '账号密码');
  } catch (e) {
    // 锁定过期后从 0 重新数
    const fails = (lock && !lock.until ? lock.fails : 0) + 1;
    const locked = fails >= lockAfter();
    const row = { fails: locked ? 0 : fails, until: locked ? now().getTime() + lockMinutes() * 60_000 : undefined };
    if (locks.get(key)) locks.update(key, row); else locks.insert({ id: key, ...row });
    loginLog({ username, userId: users.find((x) => x.username === username)?.id ?? null, result: locked ? '锁定' : '失败',
      reason: locked ? `连续输错 ${fails} 次，锁定 ${lockMinutes()} 分钟` : (e as Error).message, source: '账号密码' });
    if (locked) throw new ApiError(422, `连续输错密码 ${fails} 次，账号已锁定 ${lockMinutes()} 分钟`);
    throw onLoginFailure(username, e);
  }
});
/** 平台单点（演示）：按角色取第一个启用的账号 */
mock.open('POST', '/auth/sso', ({ body }) => {
  const u = users.find((x) => x.active && x.roleKeys.includes(String(body.role)));
  if (!u) throw new ApiError(422, '没有对应角色的账号');
  return signedIn(u, '演示切换');
});
mock.open('POST', '/auth/logout', ({ user }) => {
  if (user) loginLog({ username: user.username, userId: user.id, userName: user.name, result: '退出', source: '页面退出' });
  return { logoutUrl: null };
});
export { signedIn };
mock.open('GET', '/auth/demo-users', () =>
  // 每个角色一个账号，演示时右上角切换
  roles.all().map((r) => users.find((u) => u.active && u.roleKeys[0] === r.key && /^U\d\d$/.test(u.id))).filter((u): u is User => Boolean(u)).map(publicUser));
// 没存过的工作日、模块开关按默认补上，只读时补，不写库
/** 默认密码不随设置返回（登录页就能读到设置），管理员走 /settings/default-password */
const hideDefaultPw = (s: Settings): Settings => { const { defaultPassword, ...r } = s; void defaultPassword; return r; };
mock.open('GET', '/settings', () => { const s0 = settings(); if (!s0) return s0; const s = hideDefaultPw(s0); return { ...s, features: { ...DEFAULT_FEATURES, ...s.features }, workDays: workDaysOf(s) }; });
mock.open('POST', '/demo/reset', () => { resetDb(); resetMockCaptcha(); return true; });

// 前端演示等同后端的演示模式：弱密码、过期不强制改，管理员重置后照样要改
mock.get('/me', ({ user }) => ({ user: publicUser(user), roles: user.roleKeys.map((k) => roles.get(k)).filter(Boolean), perms: permsOf(user), unit: units.get(user.unitId),
  passwordChange: changeReason(user.id),
  passwordDefault: passwords.get(user.id)?.isDefault ? { logins: passwords.get(user.id)?.logins ?? 0, max: maxLogins() } : null }));

mock.post('/me/password', ({ user, body: sealedBody }) => {
  const body = openSealed(sealedBody);
  const cur = pwOf(user.id);
  if (body.oldPassword !== cur) throw new ApiError(422, '原密码不正确');
  const p = policyOf(settings());
  const bad = passwordProblems(String(body.newPassword ?? ''), p, user.username, user.no);
  if (bad.length) throw new ApiError(422, `新密码${bad.join('；')}`);
  const history = passwords.get(user.id)?.history ?? [];
  if (p.history > 0 && [cur, ...history].slice(0, p.history).includes(String(body.newPassword))) throw new ApiError(422, `新密码不能与最近 ${p.history} 次用过的密码相同`);
  savePw(user.id, { pw: String(body.newPassword), history: [cur, ...history].slice(0, 10), mustChange: false, isDefault: false, logins: 0 });
  audit(user, '系统', '修改密码', user.name);
  return true;
});

mock.post('/org/users/:id/reset-password', ({ user, params, body }) => {
  if (!body.publicKey) throw new ApiError(400, '请刷新页面后重试');
  need(user, 'sys:user');
  const u = users.get(params.id);
  if (!u) throw new ApiError(404, '账号不存在');
  const temp = defaultPw(); // 重置成基础配置里的默认密码，用它登录前几次只提示、超过次数必须改
  savePw(u.id, { pw: temp, history: [pwOf(u.id), ...(passwords.get(u.id)?.history ?? [])].slice(0, 10), mustChange: false, isDefault: true, logins: 0 });
  audit(user, '系统', '重置密码', u.name);
  return { enc: sealFor(body.publicKey, temp) };
});

mock.get('/settings/default-password', ({ user }) => { need(user, 'sys:setting'); return { defaultPassword: defaultPw() }; });

mock.put('/settings', ({ user, body }) => {
  need(user, 'sys:setting');
  const cur = settings();
  if (body.publicUrl !== undefined) {
    const u = String(body.publicUrl).trim();
    if (u && !/^https?:\/\/[^\s#]+$/.test(u)) throw new ApiError(422, '外网访问地址要以 http:// 或 https:// 开头，不能带空格和 #');
    body.publicUrl = u && !u.endsWith('/') ? `${u}/` : u;
  }
  if (body.loginCaptcha !== undefined || body.loginCaptchaAfter !== undefined) {
    const mode = body.loginCaptcha ?? cur.loginCaptcha ?? 'always';
    const after = Number(body.loginCaptchaAfter ?? cur.loginCaptchaAfter ?? 3);
    if (!['always', 'after-failures', 'off'].includes(mode)) throw new ApiError(400, '登录验证码只能是 always、after-failures 或 off');
    if (!Number.isInteger(after) || after < 1 || after > 10) throw new ApiError(422, '密码错几次后需要验证码，填 1 到 10');
    const text = (m: string, n: number) => (m === 'after-failures' ? `密码错 ${n} 次后需要` : m === 'off' ? '关闭' : '总是需要');
    if (mode !== (cur.loginCaptcha ?? 'always') || after !== (cur.loginCaptchaAfter ?? 3)) audit(user, '系统', '修改登录验证码', text(mode, after));
    body.loginCaptcha = mode;
    body.loginCaptchaAfter = after;
  }
  const policyKeys = ['passwordMinLength', 'passwordMinClasses', 'passwordNotUserNo', 'passwordHistory', 'passwordMaxAgeDays'] as const;
  if (policyKeys.some((k) => body[k] !== undefined)) {
    const before = policyOf(cur);
    const n = policyOf({ ...cur, ...Object.fromEntries(policyKeys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]])) });
    const int = (v: number, a: number, b: number) => Number.isInteger(v) && v >= a && v <= b;
    if (!int(n.minLength, 6, 32)) throw new ApiError(422, '密码最短长度填 6 到 32');
    if (!int(n.minClasses, 1, 4)) throw new ApiError(422, '字符类别填 1 到 4');
    if (!int(n.history, 0, 10)) throw new ApiError(422, '不能与最近几次相同，填 0 到 10');
    if (!int(n.maxAgeDays, 0, 3650)) throw new ApiError(422, '密码有效天数填 0 到 3650，0 为不过期');
    const text = (p: typeof n) => `至少 ${p.minLength} 位，至少 ${p.minClasses} 类字符${p.notUserNo ? '，不能包含工号或登录名' : ''}${p.history > 0 ? `，不能与最近 ${p.history} 次相同` : ''}${p.maxAgeDays > 0 ? `，${p.maxAgeDays} 天过期` : '，不过期'}`;
    if (text(before) !== text(n)) audit(user, '系统', '修改密码策略', text(n));
  }
  if (body.workStart !== undefined || body.workEnd !== undefined) {
    const a = String(body.workStart ?? cur.workStart ?? WORK_START), z = String(body.workEnd ?? cur.workEnd ?? WORK_END);
    const ok = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    if (!ok(a) || !ok(z) || a >= z) throw new ApiError(422, '工作时间不对：上班时间要早于下班时间，格式 08:00');
    const was = `${cur.workStart ?? WORK_START}–${cur.workEnd ?? WORK_END}`;
    body.workStart = a; body.workEnd = z;
    if (`${a}–${z}` !== was) audit(user, '系统', '修改工作时间', `${was} → ${a}–${z}`);
  }
  if (body.workDays !== undefined) {
    const v = body.workDays as unknown;
    if (!Array.isArray(v) || v.some((x) => !Number.isInteger(x) || x < 1 || x > 7)) throw new ApiError(400, '工作日参数不正确');
    const days = [...new Set(v as number[])].sort((a, b) => a - b);
    if (!days.length) throw new ApiError(422, '至少选一个工作日');
    const was = workDaysOf(cur);
    body.workDays = days;
    if (workDaysText(was) !== workDaysText(days)) audit(user, '系统', '修改工作日', `${workDaysText(was)} → ${workDaysText(days)}`);
  }
  // 产品名称、使用单位名称：去空格，不能为空，限长
  if (body.productName !== undefined) {
    const n = String(body.productName ?? '').trim();
    if (!n) throw new ApiError(422, '产品名称不能为空');
    if (n.length > 40) throw new ApiError(422, '产品名称最长 40 个字');
    body.productName = n;
    if (n !== (cur.productName ?? DEFAULT_PRODUCT_NAME)) audit(user, '系统', '修改产品名称', `${cur.productName ?? DEFAULT_PRODUCT_NAME} → ${n}`);
  }
  if (body.orgName !== undefined) {
    const n = String(body.orgName ?? '').trim();
    if (!n) throw new ApiError(422, '使用单位名称不能为空');
    if (n.length > 60) throw new ApiError(422, '使用单位名称最长 60 个字');
    body.orgName = n;
  }
  if (body.defaultPassword !== undefined) {
    const pw = String(body.defaultPassword);
    if (pw.length > 64) throw new ApiError(422, '默认密码最多 64 位');
    const bad = passwordProblems(pw, policyOf(cur), '', '');
    if (bad.length) throw new ApiError(422, `默认密码${bad.join('；')}`);
    if (pw !== defaultPw()) audit(user, '系统', '修改默认密码', '已更新');
  }
  if (body.defaultPasswordLogins !== undefined) {
    const n = Number(body.defaultPasswordLogins);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw new ApiError(422, '用默认密码可登录的次数填 1 到 20');
    if (n !== maxLogins()) audit(user, '系统', '修改默认密码可忽略次数', `${maxLogins()} → ${n} 次`);
  }
  // 安全策略：锁定、空闲超时、并发登录、水印
  const int = (k: 'lockAfter' | 'lockMinutes' | 'idleMinutes', a: number, b: number, text: string) => {
    if (body[k] === undefined) return;
    const n = Number(body[k]);
    if (!Number.isInteger(n) || n < a || n > b) throw new ApiError(422, `${text}填 ${a} 到 ${b}`);
    const was = cur[k] ?? SECURITY_DEFAULTS[k];
    body[k] = n;
    if (n !== was) audit(user, '系统', '修改安全策略', `${text} ${was} → ${n}`);
  };
  int('lockAfter', 1, 20, '连续输错几次锁定');
  int('lockMinutes', 1, 1440, '锁定分钟数');
  int('idleMinutes', 0, 1440, '空闲自动退出分钟数');
  if (body.sessionPolicy !== undefined) {
    if (body.sessionPolicy !== 'allow' && body.sessionPolicy !== 'kick') throw new ApiError(400, '并发登录策略只能是 allow 或 kick');
    if (body.sessionPolicy !== (cur.sessionPolicy ?? SECURITY_DEFAULTS.sessionPolicy)) audit(user, '系统', '修改安全策略', body.sessionPolicy === 'kick' ? '同账号再次登录时踢掉旧会话' : '允许同账号多处登录');
  }
  if (body.watermark !== undefined) {
    body.watermark = Boolean(body.watermark);
    if (body.watermark !== (cur.watermark ?? SECURITY_DEFAULTS.watermark)) audit(user, '系统', '修改安全策略', body.watermark ? '打开页面水印' : '关闭页面水印');
  }
  const { resetFeatures, ...rest } = body as SettingsInput;
  delete (rest as { menuNames?: unknown }).menuNames; // 菜单名和功能菜单只走 /settings/menu-names、/settings/menu-config，那里有校验
  delete (rest as { menuConfig?: unknown }).menuConfig;
  const curFeatures = { ...DEFAULT_FEATURES, ...cur.features };
  const featuresChanged = Boolean(resetFeatures || rest.features);
  const next: Settings = { ...cur, ...rest, features: resetFeatures ? { ...DEFAULT_FEATURES } : { ...curFeatures, ...(rest.features ?? {}) } };
  settingsT.update('main', next);
  audit(user, '系统', '修改设置', featuresChanged ? featureDiff(curFeatures, next.features) : '基础配置');
  return hideDefaultPw(settings());
});

/** 操作日志里写模块开关的变化：「示例模块 关→开」 */
function featureDiff(a: Settings['features'], b: Settings['features']): string {
  const d = (Object.keys(b) as FeatureKey[]).filter((k) => a[k] !== b[k]).map((k) => `${FEATURE_LABEL[k] ?? k} ${b[k] ? '关→开' : '开→关'}`).join('，');
  return d || '模块开关未变';
}

const MENU_KEY = /^(group:[a-z]+|\/[a-z0-9/-]*)$/;
const nameOk = (v: unknown, what: string): string | undefined => {
  const name = String(v ?? '').trim();
  if (!name) return undefined;
  if ([...name].length > MENU_NAME_MAX) throw new ApiError(422, `${what}最多 ${MENU_NAME_MAX} 个字：${name}`);
  return name;
};
/** menuNames 是 menuConfig 里的显示名，改了功能菜单要重算 */
export function syncMenuNames(): void {
  const s = settings();
  const names: Record<string, string> = {};
  for (const [k, n] of Object.entries(s.menuConfig ?? {})) if (n.name) names[k] = n.name;
  settingsT.update('main', { menuNames: names });
}
mock.put('/settings/menu-names', ({ user, body }) => {
  need(user, 'sys:setting');
  const entries = Object.entries((body ?? {}) as Record<string, unknown>);
  if (entries.length > 200) throw new ApiError(422, '菜单项太多');
  const named: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (k.length > 64 || !MENU_KEY.test(k)) throw new ApiError(422, `菜单标识不对：${k}`);
    const name = String(v ?? '').trim();
    if (!name) throw new ApiError(422, '菜单名称不能为空；要用默认名称请点「恢复默认」');
    if ([...name].length > MENU_NAME_MAX) throw new ApiError(422, `菜单名称最多 ${MENU_NAME_MAX} 个字：${name}`);
    named[k] = name;
  }
  const before = settings().menuNames ?? {};
  // 只改名称，位置和排序不动
  const next: Record<string, MenuNode> = {};
  for (const [k, n] of Object.entries(settings().menuConfig ?? {})) if (n.parent !== undefined || n.sort !== undefined) next[k] = { parent: n.parent, sort: n.sort };
  for (const [k, name] of Object.entries(named)) next[k] = { ...next[k], name };
  settingsT.update('main', { menuConfig: next });
  syncMenuNames();
  audit(user, '系统', '修改菜单名称', `${Object.keys(named).length} 项改名`, `改前 ${JSON.stringify(before)}；改后 ${JSON.stringify(named)}`);
  return settings();
});
mock.put('/settings/menu-config', ({ user, body }) => {
  need(user, 'sys:setting');
  const entries = Object.entries((body ?? {}) as Record<string, MenuNode | null>);
  if (entries.length > 300) throw new ApiError(422, '菜单项太多');
  const next: Record<string, MenuNode> = {};
  for (const [k, n] of entries) {
    if (k.length > 64 || !MENU_KEY.test(k)) throw new ApiError(422, `菜单标识不对：${k}`);
    if (!n) continue;
    const o: MenuNode = {};
    const name = nameOk(n.name, '菜单名称');
    if (name) o.name = name;
    if (n.parent !== undefined && n.parent !== null) {
      if (n.parent && (n.parent.length > 64 || !MENU_KEY.test(n.parent))) throw new ApiError(422, `上级菜单标识不对：${n.parent}`);
      if (n.parent === k) throw new ApiError(422, '菜单不能放在自己下面');
      o.parent = n.parent;
    }
    if (n.sort !== undefined && n.sort !== null) {
      if (!Number.isInteger(n.sort) || n.sort < 0 || n.sort > 99999) throw new ApiError(422, '排序填 0 到 99999');
      o.sort = n.sort;
    }
    if (Object.keys(o).length) next[k] = o;
  }
  for (const k of Object.keys(next)) {
    let p = next[k].parent;
    for (let i = 0; p && i < 10; i++) {
      if (p === k) throw new ApiError(422, `上下级绕成了圈：${k}`);
      p = next[p]?.parent;
    }
  }
  const before = settings().menuConfig ?? {};
  settingsT.update('main', { menuConfig: next });
  syncMenuNames();
  audit(user, '系统', '修改功能菜单', `${Object.keys(next).length} 项有设置`, `改前 ${JSON.stringify(before)}；改后 ${JSON.stringify(next)}`);
  return settings();
});

// ---------- 组织与人员 ----------

mock.get('/org/units', () => [...units.all()].sort((a, b) => a.sort - b.sort));
mock.post('/org/units', ({ user, body }) => {
  need(user, 'sys:org');
  const u: OrgUnit = { id: uid('D'), name: body.name, code: body.code ?? '', type: body.type ?? 'dept', parentId: body.parentId ?? 'C0', headId: body.headId, sort: units.all().length };
  audit(user, '系统', '新增组织', u.name);
  return units.insert(u);
});
mock.put('/org/units/:id', ({ user, params, body }) => { need(user, 'sys:org'); audit(user, '系统', '修改组织', body.name ?? params.id); return units.update(params.id, body); });
mock.del('/org/units/:id', ({ user, params }) => {
  need(user, 'sys:org');
  if (users.find((u) => u.unitId === params.id)) throw new ApiError(422, '组织下还有人员，不能删除');
  if (units.find((u) => u.parentId === params.id)) throw new ApiError(422, '还有下级组织，不能删除');
  audit(user, '系统', '删除组织', unitName(params.id));
  units.remove(params.id);
  return true;
});

mock.get('/org/users', ({ query }) => {
  const extra = attrDefs().filter((d) => !d.builtin && query[d.key]);
  const rows = users.where((u) => kw(query, u.name, u.no, u.username)
    // 多选属性选了其中任一项就算
    && extra.every((d) => (d.type === 'multi' ? attrValues(query[d.key]).some((x) => (u.attrs?.[d.key] ?? '').includes(x)) : attrValues(query[d.key]).includes(u.attrs?.[d.key] ?? '')))
    && (!query.unitId || query.unitId.split(',').includes(u.unitId))
    && (!query.role || query.role.split(',').some((r) => u.roleKeys.includes(r)))
    && (!query.source || query.source.split(',').includes(u.source ?? 'manual'))
    && (query.active === undefined || String(u.active) === query.active));
  return paginate(rows.map(publicUser), query);
});
/** 各扩展人员属性已填过的值，去重排序；日期类不给，多选给选项 */
mock.get('/org/users/attrs', () => Object.fromEntries(attrDefs().filter((d) => !d.builtin && d.type !== 'date')
  .map((d) => [d.key, d.type === 'multi' ? [...(d.options ?? [])] : [...new Set(users.all().map((u) => u.attrs?.[d.key]).filter((v): v is string => Boolean(v)))].sort()])));
mock.get('/org/users/options', ({ query }) => matchPeople(users.where((u) => u.active), String(query.q ?? ''), Math.min(Number(query.size) || 20, 50)).map((u) => ({ id: u.id, name: u.name, no: u.no, unitName: unitName(u.unitId) })));
const attrValues = (csv: string | undefined) => [...new Set((csv ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
/** 人员的增改都要 sys:user；扩展属性按目录合并；新建时没给角色给普通用户 */
function scoped(user: User, old: User | undefined, input: Partial<User>): Partial<User> {
  need(user, 'sys:user');
  const body: Partial<User> = 'attrs' in input ? { ...input, attrs: mergeAttrs(old?.attrs, input.attrs) } : { ...input };
  if (!old && !body.roleKeys?.length) body.roleKeys = ['user'];
  return body;
}

mock.post('/org/users', ({ user, body }) => {
  const b = scoped(user, undefined, body);
  if (users.find((u) => u.username === b.username)) throw new ApiError(409, '用户名已存在');
  const u = { id: uid('U'), active: true, roleKeys: [], ...b, source: 'manual' } as User;
  audit(user, '系统', '新增人员', u.name);
  savePw(u.id, { pw: DEMO_PASSWORD, history: [], mustChange: true }); // 初始密码由管理员告知，首次登录要改
  return publicUser(users.insert(u));
});
/** 按工号/学号匹配：有就更新，没有就新增；有一行不对整批不导 */
mock.post('/org/users/import', ({ user, body }) => {
  const rows = (body.rows ?? []) as { no: string; name: string; username?: string; unitName: string; roleNames?: string; phone?: string; title?: string; attrs?: Record<string, string> }[];
  if (!rows.length) throw new ApiError(422, '没有要导入的行');
  const plan = rows.map((r, i) => {
    const at = `第 ${i + 1} 行：`;
    const unit = units.find((u) => u.name === r.unitName);
    if (!r.no || !r.name) throw new ApiError(422, `${at}工号和姓名必填`);
    if (!unit) throw new ApiError(422, `${at}没有部门「${r.unitName}」`);
    const roleKeys = (r.roleNames ?? '').split(/[、,，;；\s]+/).filter(Boolean).map((n) => {
      const ro = roles.find((x) => x.name === n || x.key === n);
      if (!ro) throw new ApiError(422, `${at}没有角色「${n}」`);
      return ro.key;
    });
    const old = users.find((u) => u.no === r.no);
    const username = r.username || old?.username || r.no;
    const dup = users.find((u) => u.username === username && u.id !== old?.id);
    if (dup) throw new ApiError(409, `${at}账号 ${username} 已被 ${dup.name} 使用`);
    // 扩展属性：空着不改，填了的按目录校验
    const extra = Object.fromEntries(Object.entries(r.attrs ?? {}).filter(([, v]) => String(v ?? '').trim()));
    let patch: Partial<User>;
    try {
      for (const [k, v] of Object.entries(extra)) checkAttr(k, v);
      patch = scoped(user, old, { name: r.name, no: r.no, username, unitId: unit.id, title: r.title || old?.title, phone: r.phone || old?.phone,
        roleKeys: roleKeys.length ? roleKeys : old?.roleKeys, ...(Object.keys(extra).length ? { attrs: extra } : {}) });
    } catch (e) { if (e instanceof ApiError && e.status === 422) throw new ApiError(422, at + e.message); throw e; }
    return { old, patch: { ...patch, roleKeys: patch.roleKeys ?? old?.roleKeys ?? ['user'] } };
  });
  let added = 0, updated = 0;
  for (const { old, patch } of plan) {
    if (old) { users.update(old.id, patch); updated++; } else { users.insert({ id: uid('U'), active: true, ...patch, source: 'import' } as User); added++; }
  }
  audit(user, '系统', '导入人员', `新增 ${added}，更新 ${updated}`);
  return { added, updated, skipped: 0, errors: [] };
});
mock.put('/org/users/:id', ({ user, params, body }) => {
  const b = scoped(user, users.get(params.id), body);
  audit(user, '系统', '修改人员', body.name ?? params.id);
  return publicUser(users.update(params.id, b)!);
});
mock.post('/org/users/:id/toggle', ({ user, params }) => {
  const old = users.get(params.id);
  if (!old) throw new ApiError(404, '人员不存在');
  need(user, 'sys:user');
  const u = users.update(params.id, (x) => ({ active: !x.active }))!;
  audit(user, '系统', u.active ? '启用账号' : '停用账号', u.name);
  return publicUser(u);
});

// ---------- 角色 ----------

/** 与后端 RoleService.checkName / checkDesc 一致 */
const ROLE_NAME_MAX = 20;
const ROLE_DESC_MAX = 100;
const checkRoleName = (v: unknown) => {
  const t = String(v ?? '').trim();
  if (!t) throw new ApiError(422, '角色名称不能为空');
  if (t.length > ROLE_NAME_MAX) throw new ApiError(422, `角色名称最多 ${ROLE_NAME_MAX} 个字`);
  return t;
};
const checkRoleDesc = (v: unknown) => {
  const t = String(v ?? '').trim();
  if (t.length > ROLE_DESC_MAX) throw new ApiError(422, `角色说明最多 ${ROLE_DESC_MAX} 个字`);
  return t;
};
mock.get('/roles', () => { ensureRoles(); return roles.all().map((r) => ({ ...r, builtin: BUILTIN_ROLES.includes(r.key), users: users.where((u) => u.roleKeys.includes(r.key)).length })); });
mock.post('/roles', ({ user, body }) => {
  need(user, 'sys:role');
  const key = `r${Date.now().toString(36)}`;
  const name = checkRoleName(body.name);
  if (roles.all().some((r) => r.name === name)) throw new ApiError(409, '已有同名角色');
  const r: Role & { id: string } = { id: key, key, name, desc: checkRoleDesc(body.desc), builtin: false, perms: body.perms ?? [],
    dataScope: body.dataScope ?? 'all', dataUnits: body.dataUnits ?? [], terminals: body.terminals ?? ['pc', 'mobile'] };
  audit(user, '系统', '新增角色', r.name);
  return roles.insert(r);
});
mock.put('/roles/:key', ({ user, params, body }) => {
  need(user, 'sys:role');
  if (params.key === 'admin') throw new ApiError(422, '系统管理员的权限不能修改');
  const was = roles.get(params.key);
  const raw = body.name === undefined ? undefined : String(body.name).trim();
  if (raw !== undefined && raw !== was?.name && BUILTIN_ROLES.includes(params.key)) throw new ApiError(422, '内置角色不能修改名称或删除');
  const name = raw === undefined || raw === was?.name ? raw : checkRoleName(raw);
  if (name && roles.all().some((r) => r.key !== params.key && r.name === name)) throw new ApiError(409, '已有同名角色');
  if (name !== undefined) body.name = name;
  if (body.desc !== undefined) body.desc = checkRoleDesc(body.desc);
  if (body.components !== undefined) {
    const ks = [...new Set((body.components as string[]).map((k) => String(k).trim()).filter(Boolean))];
    if (ks.length > 60) throw new ApiError(422, '可使用的组件太多');
    const bad = ks.find((k) => k !== '*' && !/^[a-z0-9-]{1,40}$/.test(k));
    if (bad) throw new ApiError(422, `组件标识不对：${bad}`);
    body.components = !ks.length || ks.includes('*') ? ['*'] : ks;
    if (JSON.stringify(body.components) !== JSON.stringify(was?.components ?? ['*'])) audit(user, '系统', '修改角色可用组件', was?.name ?? params.key);
  }
  audit(user, '系统', name && name !== was?.name ? '修改角色名称' : '修改角色权限', name && name !== was?.name ? `${was?.name} → ${name}` : was?.name ?? params.key);
  return roles.update(params.key, body);
});

// ---------- 字典 ----------

const dictTypeRows = table<{ id: string; key: string; name: string; parentId?: string | null; sort: number; builtin?: boolean }>('sys_dict_type');
const ensureDictTypes = () => {
  if (!dictTypeRows.all().length) dictTypes().forEach((t, i) => dictTypeRows.insert({ id: uid('dt'), key: t.key, name: t.name, sort: i, builtin: true }));
  return [...dictTypeRows.all()].sort((a, b) => a.sort - b.sort);
};
mock.get('/dict-types', () => ensureDictTypes().map((t) => ({ key: t.key, name: t.name, parentId: t.parentId ?? null })));
mock.post('/dict-types', ({ user, body }) => {
  need(user, 'sys:dict');
  const name = String(body.name ?? '').trim();
  const parentId = body.parentId ? String(body.parentId) : undefined;
  if (!name) throw new ApiError(400, '分类名称不能为空');
  const all = ensureDictTypes();
  const parent = parentId ? all.find((t) => t.key === parentId) : undefined;
  if (parentId && !parent) throw new ApiError(404, '上级分类不存在');
  if (parent?.parentId) throw new ApiError(422, '最多两级分类');
  if (parent && dicts.where((d) => d.type === parent.key).length) throw new ApiError(422, '这个分类下已经有字典项，不能再加子分类');
  if (all.some((t) => (t.parentId ?? null) === (parentId ?? null) && t.name === name)) throw new ApiError(409, '同级已有同名分类');
  const row = dictTypeRows.insert({ id: uid('dt'), key: uid('c'), name, parentId, sort: all.length, builtin: false });
  audit(user, '系统', '新增字典分类', name);
  return { key: row.key, name, parentId: parentId ?? null };
});
mock.put('/dict-types/:key', ({ user, params, body }) => {
  need(user, 'sys:dict');
  const t = ensureDictTypes().find((x) => x.key === params.key);
  if (!t) throw new ApiError(404, '分类不存在');
  const name = String(body.name ?? '').trim();
  if (!name) throw new ApiError(400, '分类名称不能为空');
  if (ensureDictTypes().some((x) => x.id !== t.id && (x.parentId ?? null) === (t.parentId ?? null) && x.name === name)) throw new ApiError(409, '同级已有同名分类');
  dictTypeRows.update(t.id, { name });
  audit(user, '系统', '修改字典分类', name);
  return { key: t.key, name, parentId: t.parentId ?? null };
});
mock.del('/dict-types/:key', ({ user, params }) => {
  need(user, 'sys:dict');
  const t = ensureDictTypes().find((x) => x.key === params.key);
  if (!t) throw new ApiError(404, '分类不存在');
  if (t.builtin) throw new ApiError(422, '内置分类不能删除，可以改名');
  if (ensureDictTypes().some((x) => x.parentId === t.key)) throw new ApiError(422, '先删除子分类');
  if (dicts.where((d) => d.type === t.key).length) throw new ApiError(422, '分类下还有字典项，不能删除');
  dictTypeRows.remove(t.id);
  audit(user, '系统', '删除字典分类', t.name);
  return true;
});
mock.get('/dicts', ({ query }) => dicts.where((d) => !d.deleted && (!query.type || d.type === query.type) && (query.all === '1' || d.active)).sort(byDictOrder));
mock.get('/dicts/removed', ({ query }) => dicts.where((d) => Boolean(d.deleted) && (!query.type || d.type === query.type)).sort((a, b) => a.type.localeCompare(b.type) || byDictOrder(a, b)));
mock.get('/dicts/:id/usage', () => ({ usage: 0 }));
mock.post('/dicts', ({ user, body }) => {
  need(user, 'sys:dict');
  const name = String(body.name ?? '').trim();
  if (!body.type || !name) throw new ApiError(400, '类型和名称不能为空');
  const list = dicts.where((d) => d.type === body.type);
  if (ensureDictTypes().some((t) => t.parentId === body.type)) throw new ApiError(422, '这个分类下还有子分类，请选择子分类配置字典项');
  if (list.some((d) => d.name === name)) throw new ApiError(409, `已有「${name}」，不能重复添加`);
  const code = String(Math.max(0, ...list.map((d) => Number(d.code) || 0)) + 1);
  audit(user, '系统', '新增字典项', name);
  return dicts.insert({ id: uid('dict'), type: body.type, code, name, sort: DEFAULT_DICT_SORT, active: true });
});
mock.del('/dicts/:id', ({ user, params }) => {
  need(user, 'sys:dict');
  const d = dicts.get(params.id);
  if (!d) throw new ApiError(404, '字典项不存在');
  dicts.update(params.id, { deleted: true });
  audit(user, '系统', '删除字典项', d.name);
  return { usage: 0 };
});
mock.post('/dicts/:id/restore', ({ user, params }) => {
  need(user, 'sys:dict');
  const d = dicts.get(params.id);
  if (!d || !d.deleted) throw new ApiError(404, '没有这项已删除的字典项');
  audit(user, '系统', '恢复字典项', d.name);
  return dicts.update(params.id, { deleted: false });
});
mock.put('/dicts/:id', ({ user, params, body }) => {
  need(user, 'sys:dict');
  const d = dicts.get(params.id);
  if (d && body.name !== undefined && dicts.where((x) => x.type === d.type && x.id !== d.id).some((x) => x.name === String(body.name).trim())) throw new ApiError(409, `已有「${String(body.name).trim()}」，不能重名`);
  return dicts.update(params.id, body);
});

// ---------- 消息、日志 ----------

/** 未读且待处理的按等级置顶，其余按时间倒序；审批待办的节点处理过后不再置顶 */
mock.get('/messages', ({ user, query }) => {
  escalate();
  const all = messages.where((m) => m.to === user.id).map((m) => ({ ...m, level: m.level ?? 'normal', top: onTop(m) }));
  const levels = query.level ? query.level.split(',') : [];
  const rows = all.filter((m) => (query.unread !== '1' || !m.read) && (!levels.length || levels.includes(m.level)))
    .sort((a, b) => Number(b.top) - Number(a.top) || (a.top ? levelRank(b.level) - levelRank(a.level) : 0) || b.at.localeCompare(a.at))
    .map(({ ref: _r, pushKey: _p, top: _t, ...m }) => m);
  return { ...paginate(rows, query), unread: all.filter((m) => !m.read).length, urgent: all.filter((m) => m.top && m.level === 'urgent').length };
});
mock.post('/messages/:id/read', ({ params }) => messages.update(params.id, { read: true }));

// ---------- 消息等级与推送策略、审批流策略 ----------

function checkLevels(p: Pick<MsgPolicy, 'levels' | 'push'>) {
  const lv = p.levels;
  if (!lv.kinds.length) throw new ApiError(422, '至少保留「其余类型」一行');
  for (const k of lv.kinds) {
    const name = k.kind === '*' ? '其余类型' : k.kind;
    if (!k.kind.trim()) throw new ApiError(422, '消息类型不能为空');
    if (!MSG_LEVELS.includes(k.level)) throw new ApiError(422, `「${name}」的等级只能是次要、一般、重要、紧急`);
    if ((k.importantAfter != null && k.importantAfter < 1) || (k.urgentAfter != null && k.urgentAfter < 1)) throw new ApiError(422, `「${name}」的升级时间要大于 0`);
    if (k.importantAfter != null && k.urgentAfter != null && k.importantAfter >= k.urgentAfter) throw new ApiError(422, `「${name}」升为重要的等待时间要短于升为紧急`);
  }
  for (const k of lv.keywords) if (!k.keyword.trim()) throw new ApiError(422, '关键字不能为空');
  if (!(lv.eventUrgentWithin >= 1 && lv.eventUrgentWithin < lv.eventImportantWithin)) throw new ApiError(422, '离开始多少分钟内为紧急，要大于 0 且小于为重要的分钟数');
  if (!(lv.urgeIntervalMinutes >= 1)) throw new ApiError(422, '催办间隔至少 1 分钟');
  if (!(p.push.retries >= 0 && p.push.retries <= 5)) throw new ApiError(422, '重试次数为 0–5');
  return p;
}
mock.get('/msg-policy', () => msgPolicy());
mock.put('/msg-policy', ({ user, body }) => {
  need(user, 'sys:device');
  const cur = msgPolicy();
  const b = body as Partial<MsgPolicy>;
  saveMsgPolicy(checkLevels({ levels: { ...cur.levels, ...b.levels }, push: { ...cur.push, ...b.push } }));
  if (b.levels) audit(user, '系统', '修改消息等级规则', `${b.levels.kinds?.length ?? cur.levels.kinds.length} 个类型`);
  if (b.push) audit(user, '系统', '修改消息推送策略', b.push.enabled === false ? '关闭' : '开启');
  return msgPolicy();
});
mock.post('/msg-policy/run', ({ user }) => { need(user, 'sys:device'); return escalate(); });
mock.get('/wf-policy', () => wfPolicy());
mock.put('/wf-policy', ({ user, body }) => {
  need(user, 'sys:workflow');
  const cur = wfPolicy();
  const b = body as Partial<WfPolicy>;
  saveWfPolicy({
    autoApprove: { ...cur.autoApprove, ...b.autoApprove },
    proxies: (b.proxies ?? cur.proxies).map((x) => {
      if (!x.role) throw new ApiError(422, '代审要选角色');
      if (!x.types?.length) throw new ApiError(422, '代审要选能代审的流程');
      return { role: x.role, types: x.types.includes('*') ? ['*'] : [...new Set(x.types)] };
    }),
  });
  const a = wfPolicy().autoApprove;
  audit(user, '系统', '修改审批流策略', `自动通过${a.enabled ? '开' : '关'}（管理员${a.admin ? '开' : '关'}，本人或有权限${a.self ? '开' : '关'}）；代审 ${wfPolicy().proxies.length} 条`);
  return wfPolicy();
});
mock.post('/messages/read-all', ({ user }) => { for (const m of messages.where((x) => x.to === user.id && !x.read)) messages.update(m.id, { read: true }); return true; });

mock.get('/audit', ({ user, query }) => {
  need(user, 'sys:audit');
  const rows = audits.where((a) => kw(query, a.userName, a.action, a.target) && (!query.module || query.module.split(',').includes(a.module)) && (!query.from || a.at.slice(0, 10) >= query.from) && (!query.to || a.at.slice(0, 10) <= query.to)).sort((a, b) => b.at.localeCompare(a.at));
  return paginate(rows, query);
});

const loginLogsT = table<LoginLog>('sys_login_log');
/** 登录日志：账号、结果（可多选）、时间范围；只读 */
mock.get('/audit/logins', ({ user, query }) => {
  need(user, 'sys:audit');
  const rows = loginLogsT.where((l) => kw(query, l.username, l.userName ?? '', l.reason ?? '') && (!query.result || query.result.split(',').includes(l.result))
    && (!query.from || l.at.slice(0, 10) >= query.from) && (!query.to || l.at.slice(0, 10) <= query.to)).sort((a, b) => b.at.localeCompare(a.at));
  return paginate(rows, query);
});

/** 前端 error 日志上报：不要求登录（登录页也会出错），再脱敏一次，只留最近 500 条 */
const clientLogs = table<{ id: string; at: string; level: string; message: string; data?: unknown; page: string; build: string; userId?: string | null }>('sys_client_log');
mock.open('POST', '/client-logs', ({ body, user }) => {
  const safe = redact(body) as { level?: string; message?: string; data?: unknown; page?: string; build?: string };
  clientLogs.insert({ id: uid('CL'), at: stamp(), level: String(safe.level ?? 'error').slice(0, 10), message: String(safe.message ?? '').slice(0, 500), data: safe.data, page: String(safe.page ?? '').slice(0, 200), build: String(safe.build ?? '').slice(0, 40), userId: user?.id ?? null });
  const all = clientLogs.all();
  if (all.length > 500) clientLogs.replaceAll(all.slice(-500));
  return true;
});

// ---------- 删除记录：系统里的删除只是记一条删除记录，数据可以恢复；物理删除只有系统管理员，要再输一次自己的密码 ----------

mock.get('/audit/deleted', ({ user, query }) => {
  need(user, 'sys:audit');
  const all = [...deleteLogs()].reverse();
  const rows = all.filter((l) => (!query.state || l.state === query.state) && (!query.q || `${l.label}${l.table}${userName(l.by)}`.includes(query.q)));
  const page = paginate(rows, query);
  return {
    ...page,
    items: page.items.map((l) => ({
      id: l.id, table: l.table, tableLabel: l.table, rowId: l.rowId, label: l.label, deletedBy: l.by ? userName(l.by) : null, deletedAt: l.at.slice(0, 16),
      batchOpen: l.batch ? all.filter((x) => x.batch === l.batch && x.state === '已删除').length : 1, state: l.state,
      handledBy: l.handledBy ? userName(l.handledBy) : null, handledAt: l.handledAt?.slice(0, 16) ?? null,
    })),
  };
});
mock.post('/audit/deleted/:id/restore', ({ user, params, body }) => {
  need(user, 'sys:audit');
  const logs = deleteLogs();
  const one = logs.find((l) => l.id === params.id);
  if (!one) throw new ApiError(404, '没有这条删除记录');
  if (one.state !== '已删除') throw new ApiError(422, `这条已经${one.state}了`);
  const targets = body.batch && one.batch ? logs.filter((l) => l.batch === one.batch && l.state === '已删除') : [one];
  for (const l of targets) {
    if (!l.row || !restoreRow(l.table, l.row)) throw new ApiError(409, `恢复失败：已经有相同编号或名称的数据，先改掉重复的再恢复（${l.label}）`);
    l.state = '已恢复';
    l.handledBy = user.id;
    l.handledAt = now().toISOString().slice(0, 16).replace('T', ' ');
    delete l.row;
  }
  saveDb();
  audit(user, '系统', '恢复删除的数据', one.label + (targets.length > 1 ? ` 等 ${targets.length} 条` : ''));
  return { restored: targets.length };
});
mock.post('/audit/deleted/:id/purge', ({ user, params, body: sealedBody }) => {
  if (!can(user, '*')) throw new ApiError(403, '只有系统管理员能物理删除');
  const one = deleteLogs().find((l) => l.id === params.id);
  if (!one) throw new ApiError(404, '没有这条删除记录');
  if (one.state !== '已删除') throw new ApiError(422, `这条已经${one.state}了`);
  const body = openSealed(sealedBody);
  if (String(body.password ?? '') !== pwOf(user.id)) {
    audit(user, '系统', '物理删除密码错误', one.label);
    throw new ApiError(422, '密码不正确');
  }
  one.state = '已清除';
  one.handledBy = user.id;
  one.handledAt = now().toISOString().slice(0, 16).replace('T', ' ');
  delete one.row;
  saveDb();
  audit(user, '系统', '物理删除', one.label, `表 ${one.table}，已不能恢复`);
  return true;
});

// ---------- 审批 ----------

mock.get('/approvals', ({ user, query }) => {
  const scope = query.scope ?? 'todo';
  const rows = scope === 'todo' ? pendingFor(user)
    : scope === 'proxy' ? proxyPendingFor(user)
    : scope === 'mine' ? wfInstances.where((i) => i.applicantId === user.id)
      : wfInstances.where((i) => i.steps.some((s) => s.userId === user.id && s.action !== '提交'));
  return paginate(rows.filter((i) => !query.type || i.type === query.type).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), query);
});
/** 打印单据用：能看这类单据的管理员，或申请人、审批人本人 */
const VIEW_PERM: Record<string, string> = { example: 'example:approve' };
mock.get('/approvals/of-biz', ({ user, query }) => {
  const all = Boolean(query.type && VIEW_PERM[query.type] && can(user, VIEW_PERM[query.type]));
  const involves = (i: WfInstance) => i.applicantId === user.id || i.nodes.some((n) => n.approverIds.includes(user.id)) || i.steps.some((s) => s.userId === user.id);
  return wfInstances.where((i) => i.bizId === query.bizId && (!query.type || i.type === query.type) && (all || involves(i)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
});
mock.get('/approvals/:id', ({ params }) => wfInstances.get(params.id));
mock.get('/approvals/:id/urge', ({ user, params }) => {
  const inst = wfInstances.get(params.id);
  if (!inst) throw new ApiError(404, '审批不存在');
  if (inst.applicantId !== user.id && !can(user, '*')) throw new ApiError(403, '只有申请人可以催办');
  return urgeState(inst, user);
});
mock.post('/approvals/:id/urge', ({ user, params }) => urgeWorkflow(params.id, user));
mock.post('/approvals/:id/approve', ({ user, params, body }) => actWorkflow(params.id, user, 'approve', body.comment));
mock.post('/approvals/:id/reject', ({ user, params, body }) => actWorkflow(params.id, user, 'reject', body.comment));
mock.post('/approvals/batch', ({ user, body }) => (body.ids as string[]).map((id) => actWorkflow(id, user, body.action, body.comment)));

mock.get('/wf-defs', () => wfDefs.all());
mock.put('/wf-defs/:type', ({ user, params, body }) => {
  need(user, 'sys:workflow');
  const nodes = ((body as Partial<WfDef>).nodes ?? []).map((n) => {
    const rules = n.approvers?.length ? n.approvers : n.approver ? [n.approver] : [];
    if (!n.name?.trim() || !rules.length) throw new ApiError(400, '每个节点要有名称和审批人规则');
    for (const r of rules) {
      if ((r.kind === 'perm' || r.kind === 'permOrManager') && !r.perm) throw new ApiError(400, '按权限审批的规则要选权限点');
      if ((r.kind === 'role' || r.kind === 'roleOrManager') && !r.role) throw new ApiError(400, '按角色审批的规则要选角色');
      if (r.kind === 'user' && !r.userId) throw new ApiError(400, '指定人员的规则要选人');
    }
    // 第一条仍写进 approver，只有一条时不存 approvers，与后端一致
    const { approvers: _a, ...rest } = n;
    return rules.length > 1 ? { ...rest, approver: rules[0], approvers: rules } : { ...rest, approver: rules[0] };
  });
  audit(user, '系统', '修改审批流', body.name ?? params.type);
  return wfDefs.update(params.type, { ...(body as Partial<WfDef>), nodes });
});

// ---------- 附件 ----------

/** 演示环境只存文件信息，小文件另存 dataUrl 以便打开；真实后端是 multipart 上传 */
/** 与后端 AttachmentPolicy 一致：网页、脚本和可执行程序不收，SVG 里能写脚本也不收 */
const BLOCKED_EXT = new Set(['html', 'htm', 'xhtml', 'shtml', 'mht', 'mhtml', 'svg', 'svgz', 'hta', 'js', 'mjs', 'vbs', 'wsf', 'jsp', 'jspx', 'php', 'asp', 'aspx', 'exe', 'msi', 'com', 'scr', 'bat', 'cmd', 'ps1', 'sh', 'jar', 'war', 'dll']);

mock.post('/attachments', ({ body }) => {
  if (!String(body.name ?? '').trim()) throw new ApiError(400, '文件为空');
  const ext = String(body.name).includes('.') ? String(body.name).split('.').pop()!.trim().toLowerCase() : '';
  if (BLOCKED_EXT.has(ext)) throw new ApiError(422, `不能上传网页、脚本或可执行程序（.${ext}）`);
  const a = { id: uid('F'), name: String(body.name), type: String(body.type ?? ''), size: Number(body.size) || 0, bizType: body.bizType, dataUrl: body.dataUrl };
  table<typeof a>('sys_attachment').insert(a);
  return { id: a.id, name: a.name, type: a.type, size: a.size };
});

// ---------- 首页 ----------

const homeLayouts = table<{ id: string; layout: HomeLayout }>('sys_home_layout');
const HOME_MODES = ['1:2', '2:1', '1:1'];
/** 与服务端 HomeLayoutService.check 同一套校验：分列模式、两格、卡片标识、同一张卡片只放一次；两格都空的行丢掉 */
export function checkHomeLayout(l: HomeLayout | undefined): HomeLayout {
  if (!l || !Array.isArray(l.rows)) throw new ApiError(422, '首页布局不能为空');
  if (l.rows.length > 30) throw new ApiError(422, '首页布局最多 30 行');
  const seen = new Set<string>();
  const rows: HomeLayout['rows'] = [];
  for (const r of l.rows) {
    if (!r || !HOME_MODES.includes(r.mode)) throw new ApiError(422, '分列模式只能是 1:2、2:1、1:1');
    if (!Array.isArray(r.cells) || r.cells.length !== 2) throw new ApiError(422, '每行要有左右两格');
    const cells = r.cells.map((c) => {
      const k = typeof c === 'string' ? c.trim() : '';
      if (!k) return null;
      if (!/^[a-z0-9-]{1,40}$/.test(k)) throw new ApiError(422, `卡片标识不对：${k}`);
      if (seen.has(k)) throw new ApiError(422, `同一张卡片只能放一次：${k}`);
      seen.add(k);
      return k;
    }) as [string | null, string | null];
    if (cells[0] || cells[1]) rows.push({ mode: r.mode, cells });
  }
  return { rows };
}
mock.get('/home/layout', ({ user }) => homeLayouts.get(user.id)?.layout ?? null);
mock.put('/home/layout', ({ user, body }) => {
  const layout = checkHomeLayout(body as HomeLayout);
  if (homeLayouts.get(user.id)) homeLayouts.update(user.id, { layout }); else homeLayouts.insert({ id: user.id, layout });
  return layout;
});
mock.del('/home/layout', ({ user }) => { homeLayouts.remove(user.id); return null; });
mock.get('/home/todos', ({ user }) => { runDailyJobs(); escalate(); return todosOf(user); });
