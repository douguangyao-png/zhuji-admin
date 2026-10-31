import { APP } from '@/app.config';
import { useSession } from '@/core/session';
import { log } from '@/lib/log';
import { table } from './mock/db';
import { ApiError, dispatch } from './mock/router';
import { kicked } from './mock/session';
import type { User } from './types';

export { ApiError };
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

const SERVER = import.meta.env.VITE_API === 'server';
const DELAY = import.meta.env.MODE === 'test' ? 0 : 120;

const inflight = new Map<string, Promise<unknown>>();

/** 所有接口都走这里：demo 模式转给模拟后端，VITE_API=server 时请求后端（接口约定见 docs/接口约定.md）。
 * 同一个写请求（方法、地址、内容都相同）还没返回时再发，直接复用前一个，双击、回车加点击不会提交两次 */
export function http<T>(method: Method, url: string, body?: unknown): Promise<T> {
  if (method === 'GET') return send<T>(method, url, body);
  const key = `${method} ${url} ${body === undefined ? '' : JSON.stringify(body)}`;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = send<T>(method, url, body).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function send<T>(method: Method, url: string, body?: unknown): Promise<T> {
  if (SERVER) {
    const res = await fetch(`${APP.apiBase}${url}`, {
      method, headers: { 'Content-Type': 'application/json' }, // 令牌在 HttpOnly Cookie 里
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.startsWith('/auth/')) useSession.getState().logout();
    if (res.status >= 500 && !url.startsWith('/client-logs')) log.error('接口失败', { method, url: url.split('?')[0], status: res.status, message: json.message });
    if (!res.ok || json.code !== 0) throw new ApiError(res.status, json.message ?? '请求失败', json.data);
    return json.data as T;
  }
  if (DELAY) await new Promise((r) => setTimeout(r, DELAY + Math.random() * 150));
  const { userId: id, sid } = useSession.getState();
  const user = id ? table<User>('org_user').get(id) ?? null : null;
  try {
    // 同账号踢下线：会话号对不上说明别处登录过，按后端一样回 401
    if (user && sid && !url.startsWith('/auth/') && kicked(user.id, sid)) throw new ApiError(401, '账号已在别处登录，请重新登录');
    const out = dispatch(method, url, body, user?.active ? user : null);
    return (out === undefined ? undefined : JSON.parse(JSON.stringify(out))) as T;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) useSession.getState().logout();
    throw e;
  }
}

export const get = <T>(url: string, q?: Record<string, unknown>) => {
  const qs = q ? new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => [k, String(v)])).toString() : '';
  return http<T>('GET', qs ? `${url}?${qs}` : url);
};
export const post = <T>(url: string, body?: unknown) => http<T>('POST', url, body);
export const put = <T>(url: string, body?: unknown) => http<T>('PUT', url, body);
export const del = <T>(url: string) => http<T>('DELETE', url);
