import { STORE } from '@/app.config';
import { create } from 'zustand';

const KEY = `${STORE}.session`;
const SID = `${STORE}.sid`;
const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };

/**
 * 当前登录账号。浏览器里只记用户 id（决定显示谁的界面）和会话号（同账号踢下线判断用），都不是凭证；
 * 真正的登录凭证由后端写在 HttpOnly Cookie 里，前端读不到，也不要改成把令牌存进 localStorage
 */
export const useSession = create<{ userId: string | null; sid: string | null; login: (id: string, sid?: string | null) => void; logout: () => void }>((set) => ({
  userId: read(KEY),
  sid: read(SID),
  login: (userId, sid = null) => {
    try { localStorage.setItem(KEY, userId); if (sid) localStorage.setItem(SID, sid); else localStorage.removeItem(SID); } catch { /* 隐私模式 */ }
    set({ userId, sid });
  },
  logout: () => { try { localStorage.removeItem(KEY); localStorage.removeItem(SID); } catch { /* 同上 */ } set({ userId: null, sid: null }); },
}));
