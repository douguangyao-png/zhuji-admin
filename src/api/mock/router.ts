import { actor } from './db';
import type { User } from '../types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) { super(message); }
}

export interface Ctx {
  /** 当前登录用户；登录接口之外都有 */
  user: User;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
type Handler = (ctx: Ctx) => unknown;
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

const routes: { method: Method; re: RegExp; keys: string[]; fn: Handler; open: boolean; guestPerm?: string }[] = [];

function add(method: Method, path: string, fn: Handler, open = false, guestPerm?: string) {
  const keys: string[] = [];
  const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, k: string) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ method, re, keys, fn, open, guestPerm });
}

/**
 * 模块在 mock.ts 里登记接口：mock.get('/example', ctx => …)。
 * guestPerm 对应后端的 @RequirePerm / @GuestPerm：游客（未登录）有这个权限点时按游客身份调用，否则 401
 */
export const mock = {
  get: (p: string, fn: Handler, guestPerm?: string) => add('GET', p, fn, false, guestPerm),
  post: (p: string, fn: Handler, guestPerm?: string) => add('POST', p, fn, false, guestPerm),
  put: (p: string, fn: Handler, guestPerm?: string) => add('PUT', p, fn, false, guestPerm),
  del: (p: string, fn: Handler, guestPerm?: string) => add('DELETE', p, fn, false, guestPerm),
  /** 不需要登录的接口 */
  open: (method: Method, p: string, fn: Handler) => add(method, p, fn, true),
};

/** 地址级的统一校验（导入、导出要操作权限），由 core.ts 登记，避免和 services 循环引用 */
let guard: ((method: Method, path: string, user: User) => void) | null = null;
export const setGuard = (fn: typeof guard) => { guard = fn; };

const guestPaths: { method: Method; re: RegExp; perm: string }[] = [];
/** 不登录也能调用的接口：模块登记地址和游客权限点（如公开页面），与后端 AuthFilter.guestPermOf 一致；框架本身没有 */
export const registerGuestPath = (method: Method, re: RegExp, perm: string) => { guestPaths.push({ method, re, perm }); };
export function guestPermOf(method: Method, path: string): string | undefined {
  return guestPaths.find((g) => g.method === method && g.re.test(path))?.perm;
}
/** 游客：权限点和调用时用的身份，由 core.ts 登记 */
let guest: { perms: () => string[]; user: () => User } | null = null;
export const setGuest = (g: typeof guest) => { guest = g; };

export function dispatch(method: Method, url: string, body: unknown, user: User | null) {
  actor.id = user?.id ?? '';
  actor.batch = Math.random().toString(36).slice(2, 12);
  const [path, qs = ''] = url.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (!m) continue;
    let who = user;
    if (r.open && !user) {
      const gp = guestPermOf(method, path);
      if (gp && guest && !guest.perms().includes(gp)) throw new ApiError(401, '未登录或登录已过期');
    }
    if (!r.open && !user) {
      // 未登录：接口有权限点且游客有它时按游客调用，只要求登录的接口仍需登录
      if (!r.guestPerm || !guest || !guest.perms().includes(r.guestPerm)) throw new ApiError(401, '未登录');
      who = guest.user();
    }
    if (!r.open && guard) guard(method, path, who as User);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    return r.fn({ user: who as User, params, query, body: body ?? {} });
  }
  throw new ApiError(404, `接口不存在：${method} ${path}`);
}

/** 列表分页与关键字过滤的通用写法 */
export function paginate<T>(rows: T[], q: Record<string, string>) {
  const page = Math.max(1, Number(q.page) || 1);
  const size = Math.min(500, Number(q.size) || 20);
  return { items: rows.slice((page - 1) * size, page * size), total: rows.length, page, size };
}
export const kw = (q: Record<string, string>, ...fields: (string | undefined)[]) =>
  !q.q || fields.some((f) => f?.toLowerCase().includes(q.q.toLowerCase()));
