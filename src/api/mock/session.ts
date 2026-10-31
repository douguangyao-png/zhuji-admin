// 模拟后端的会话号：每次登录发一个新会话号；安全策略为「踢掉旧会话」时，旧会话号的请求按 401 处理。
// http.ts 直接引用这个文件，所以这里只依赖内存库，不引用模拟层的其他部分
import type { Settings } from '../types';
import { table } from './db';

const sessions = table<{ id: string; sid: string }>('auth_session');
const settings = () => table<Settings & { id: string }>('sys_setting').all()[0];

/** 登录成功时调用，返回新的会话号 */
export function newSession(userId: string): string {
  const sid = `S${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  if (sessions.get(userId)) sessions.update(userId, { sid }); else sessions.insert({ id: userId, sid });
  return sid;
}

/** 这个会话号是否已被后来的登录顶掉（只在「踢掉旧会话」策略下成立） */
export function kicked(userId: string, sid: string): boolean {
  if (settings()?.sessionPolicy !== 'kick') return false;
  const cur = sessions.get(userId)?.sid;
  return Boolean(cur && cur !== sid);
}
