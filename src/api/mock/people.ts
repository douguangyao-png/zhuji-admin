import { BASE_ATTRS, type UserAttrDef } from '../types';
import { table } from './db';
import { ApiError, mock } from './router';
import { audit, need, roles, users } from './services';
import { BUILTIN_ROLES, ROLES } from './seed';

// 人员属性目录、内置角色；内置属性（账号、姓名等）存在人员本身的字段上，这里只管扩展属性

const attrT = table<UserAttrDef & { id: string }>('sys_user_attr_def');

const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort;

/** 全部扩展人员属性 */
export function attrDefs(): UserAttrDef[] {
  return attrT.all().map(({ id: _id, ...d }) => {
    const enabled = d.status !== 'void' && d.enabled !== false;
    return { ...d, builtin: false, enabled, status: enabled ? 'active' as const : 'void' as const };
  }).sort(bySort);
}

/** 库里缺内置角色时（老的演示数据）补上 */
export function ensureRoles() {
  for (const r of ROLES) if (!roles.get(r.key)) roles.insert({ ...r, id: r.key });
}

// ---------- 人员属性的值 ----------

/** 与后端 UserAttrService.checkValue 一致：去首尾空格，空串清空；文本按最大长度，日期 yyyy-MM-dd，下拉要是选项之一，多选每项都要是选项、按顿号存 */
export function checkAttrValue(d: UserAttrDef, v: unknown): string {
  const t = String(v ?? '').trim();
  if (!t) return '';
  if (d.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(`${t}T00:00:00`))) throw new ApiError(422, `${d.name}要填日期，如 2026-10-23`);
  } else if (d.type === 'select') {
    if (!(d.options ?? []).includes(t)) throw new ApiError(422, `${d.name}没有选项「${t}」`);
  } else if (d.type === 'multi') {
    const items = [...new Set(t.split(/[、,，]/).map((s) => s.trim()).filter(Boolean))];
    for (const x of items) if (!(d.options ?? []).includes(x)) throw new ApiError(422, `${d.name}没有选项「${x}」`);
    const joined = items.join('、');
    if (joined.length > TEXT_MAX) throw new ApiError(422, `${d.name}最多 ${TEXT_MAX} 个字`);
    return joined;
  } else if (t.length > d.maxLen) throw new ApiError(422, `${d.name}最多 ${d.maxLen} 个字`);
  return t;
}
/** 单项：键要在目录里、启用中 */
export function checkAttr(key: string, v: unknown): string {
  const d = attrDefs().find((x) => x.key === key);
  if (!d) throw new ApiError(422, `没有人员属性「${key}」`);
  if (!d.enabled) throw new ApiError(422, `人员属性「${d.name}」已作废`);
  return checkAttrValue(d, v);
}
/** 扩展属性合进原有的值：没给的不改，空串删掉 */
export function mergeAttrs(old: Record<string, string> | undefined, patch: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!patch || !Object.keys(patch).length) return old;
  const out = { ...(old ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    const t = checkAttr(k, v);
    if (t) out[k] = t; else delete out[k];
  }
  return out;
}

// ---------- 人员属性目录 ----------

const ATTR_NAME_MAX = 20;
const TEXT_MAX = 500;
const SORT_MAX = 9999;
const checkSort = (v: unknown, def: number) => {
  if (v === undefined || v === null) return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > SORT_MAX) throw new ApiError(422, `排序填 0 到 ${SORT_MAX}`);
  return n;
};
const checkAttrName = (v: unknown) => {
  const t = String(v ?? '').trim();
  if (!t) throw new ApiError(422, '属性名称不能为空');
  if (t.length > ATTR_NAME_MAX) throw new ApiError(422, `属性名称最多 ${ATTR_NAME_MAX} 个字`);
  return t;
};
/** 按类型整理最大长度和选项 */
function typed(type: unknown, maxLen: unknown, options: unknown): Pick<UserAttrDef, 'type' | 'maxLen' | 'options'> {
  const t = (type ?? 'text') as UserAttrDef['type'];
  if (!['text', 'date', 'select', 'multi'].includes(t)) throw new ApiError(422, '类型只能是文本、日期、下拉或多选');
  if (t === 'text') {
    const n = maxLen === undefined || maxLen === null ? 64 : Number(maxLen);
    if (!Number.isInteger(n) || n < 1 || n > TEXT_MAX) throw new ApiError(422, `最大长度填 1 到 ${TEXT_MAX}`);
    return { type: t, maxLen: n, options: undefined };
  }
  if (t === 'date') return { type: t, maxLen: 10, options: undefined };
  const opts: string[] = [];
  for (const o of (options ?? []) as unknown[]) {
    const s = String(o ?? '').trim();
    if (!s || opts.includes(s)) continue;
    if (s.length > 40) throw new ApiError(422, '每个选项最多 40 个字');
    opts.push(s);
  }
  if (!opts.length) throw new ApiError(422, '下拉选项至少一个');
  if (opts.length > 50) throw new ApiError(422, '下拉选项最多 50 个');
  return { type: t, maxLen: Math.max(...opts.map((o) => o.length)), options: opts };
}
const newKey = (prefix: string, taken: string[]) => {
  let t = Date.now();
  while (taken.includes(prefix + t.toString(36))) t++;
  return prefix + t.toString(36);
};

mock.get('/user-attrs', () => attrDefs());
/** 内置属性：账号、姓名、性别、证件号码、手机号，所有人通用，只读展示 */
mock.get('/user-attrs/builtin', () => BASE_ATTRS);
const BASE_KEYS = BASE_ATTRS.map((d) => d.key);
const notBase = (key: string) => { if (BASE_KEYS.includes(key)) throw new ApiError(400, '内置属性（账号、姓名、性别、证件号码、手机号）所有人通用，不能删除或作废'); };
/** 入参里的作废意图：status=void 或 enabled=false 为 true；都没给为 undefined */
const voidOf = (body: { status?: unknown; enabled?: unknown }): boolean | undefined => {
  if (body.status !== undefined && body.status !== null) {
    if (body.status !== 'active' && body.status !== 'void') throw new ApiError(422, '状态只能是启用或作废');
    return body.status === 'void';
  }
  return body.enabled === undefined || body.enabled === null ? undefined : !body.enabled;
};
mock.post('/user-attrs', ({ user, body }) => {
  need(user, 'sys:user');
  const all = attrDefs();
  const name = checkAttrName(body.name);
  if (all.some((d) => d.name === name)) throw new ApiError(409, '已有同名属性');
  if (all.length >= 50) throw new ApiError(422, '人员属性最多 50 个');
  const d: UserAttrDef = { key: newKey('a', all.map((x) => x.key)), name, ...typed(body.type, body.maxLen, body.options), sort: checkSort(body.sort, 100), builtin: false, enabled: voidOf(body) !== true, status: voidOf(body) === true ? 'void' : 'active' };
  attrT.insert({ ...d, id: d.key });
  audit(user, '系统', '新增人员属性', name);
  return d;
});
mock.put('/user-attrs/:key', ({ user, params, body }) => {
  need(user, 'sys:user');
  notBase(params.key);
  const cur = attrDefs().find((d) => d.key === params.key);
  if (!cur) throw new ApiError(404, '人员属性不存在');
  const name = body.name === undefined ? cur.name : checkAttrName(body.name);
  if (attrDefs().some((d) => d.name === name && d.key !== cur.key)) throw new ApiError(409, '已有同名属性');
  const shape = (body.type !== undefined || body.maxLen !== undefined || body.options !== undefined)
    ? typed(body.type ?? cur.type, body.maxLen ?? cur.maxLen, body.options ?? cur.options) : {};
  const next: UserAttrDef = { ...cur, ...shape, name, sort: checkSort(body.sort, cur.sort), enabled: voidOf(body) === undefined ? cur.enabled : !voidOf(body) };
  next.status = next.enabled ? 'active' : 'void';
  attrT.update(cur.key, next);
  if (name !== cur.name) audit(user, '系统', '修改人员属性名称', `${cur.name} → ${name}`);
  else if (next.enabled !== cur.enabled) audit(user, '系统', next.enabled ? '启用人员属性' : '作废人员属性', name);
  else audit(user, '系统', '修改人员属性', name);
  return next;
});
/** 删除扩展属性：连同所有人员的值一起清除；内置的 400 */
mock.del('/user-attrs/:key', ({ user, params }) => {
  need(user, 'sys:user');
  notBase(params.key);
  const cur = attrDefs().find((d) => d.key === params.key);
  if (!cur) throw new ApiError(404, '人员属性不存在');
  for (const u of users.where((x) => Boolean(x.attrs && params.key in x.attrs))) {
    const { [params.key]: _drop, ...rest } = u.attrs!;
    users.update(u.id, { attrs: rest });
  }
  attrT.remove(cur.key);
  audit(user, '系统', '删除人员属性', cur.name, '同时清除所有人员的该属性值');
  return true;
});

// ---------- 删除自定义角色：有引用时不能删 ----------

type RoleRule = { role?: string };
/** 用到这个角色的地方：审批流节点；新模块引用角色时在这里补上 */
export function roleUsages(key: string): string[] {
  const out: string[] = [];
  for (const d of table<{ id: string; name: string; nodes: { name: string; approver?: RoleRule; approvers?: RoleRule[] }[] }>('wf_def').all()) {
    d.nodes.forEach((n, i) => {
      const rules = n.approvers?.length ? n.approvers : n.approver ? [n.approver] : [];
      if (rules.some((r) => r.role === key)) out.push(`审批流「${d.name}」第 ${i + 1} 步「${n.name}」`);
    });
  }
  return out;
}

mock.get('/roles/:key/usages', ({ user, params }) => { need(user, 'sys:role'); return roleUsages(params.key); });

mock.del('/roles/:key', ({ user, params }) => {
  need(user, 'sys:role');
  if (BUILTIN_ROLES.includes(params.key)) throw new ApiError(422, '内置角色不能修改名称或删除');
  const r = roles.get(params.key);
  if (!r) throw new ApiError(404, '角色不存在');
  const used = roleUsages(r.key);
  if (used.length) throw new ApiError(422, `角色「${r.name}」正在使用，不能删除：${used.join('；')}。先在这些地方换掉它再删除`);
  const holders = users.where((u) => u.roleKeys.includes(r.key));
  let toUser = 0;
  for (const u of holders) {
    const rest = u.roleKeys.filter((k) => k !== r.key && roles.get(k));
    if (!rest.length) toUser++;
    users.update(u.id, { roleKeys: rest.length ? rest : ['user'] });
  }
  roles.remove(r.key);
  const detail = `${holders.length} 人移除该角色，${toUser} 人改为普通用户`;
  audit(user, '系统', '删除角色', r.name, `删除角色 ${r.name}，${detail}`);
  return { removed: holders.length, toUser };
});
