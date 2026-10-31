// 前端日志：debug / info / warn / error 四级。开发时全部输出，生产构建默认只输出 warn 以上；
// error 级别脱敏后通过 POST /client-logs 上报（接口约定见 docs/接口约定.md），上报失败不影响页面，也不再记日志
import { redact } from './mask';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let threshold: LogLevel = import.meta.env.PROD ? 'warn' : 'debug';
/** 运行时调整输出级别，如排查问题时在控制台执行 */
export const setLogLevel = (l: LogLevel) => { threshold = l; };

/** 上报函数由 api/http.ts 注入，避免和 http 互相引用；测试里可以换成假的 */
type Reporter = (entry: ClientLog) => Promise<unknown>;
let reporter: Reporter | null = null;
export const setLogReporter = (r: Reporter | null) => { reporter = r; };

export interface ClientLog { level: LogLevel; message: string; data?: unknown; page: string; at: string; build: string }

// 每分钟最多上报 10 条，同一条消息 1 分钟内只报一次
const LIMIT = 10;
let windowStart = 0, sent = 0;
const recent = new Map<string, number>();
const allow = (key: string, now: number) => {
  if (now - windowStart > 60_000) { windowStart = now; sent = 0; recent.clear(); }
  if (sent >= LIMIT || recent.has(key)) return false;
  sent++; recent.set(key, now);
  return true;
};

function write(level: LogLevel, message: string, data?: unknown) {
  const safe = data === undefined ? undefined : redact(data);
  if (RANK[level] >= RANK[threshold]) {
    const out = level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error;
    if (safe === undefined) out(`[${level}] ${message}`); else out(`[${level}] ${message}`, safe);
  }
  if (level !== 'error' || !reporter) return;
  const now = Date.now();
  if (!allow(message, now)) return;
  const entry: ClientLog = { level, message: String(redact(message)), data: safe, page: window.location.hash.slice(1) || '/', at: new Date(now).toISOString(), build: typeof __BUILD__ === 'string' ? __BUILD__ : '' };
  try { void reporter(entry).catch(() => { /* 上报失败不影响页面 */ }); } catch { /* 同上 */ }
}

export const log = {
  debug: (m: string, d?: unknown) => write('debug', m, d),
  info: (m: string, d?: unknown) => write('info', m, d),
  warn: (m: string, d?: unknown) => write('warn', m, d),
  error: (m: string, d?: unknown) => write('error', m, d),
};

/** 未捕获的异常和 Promise 拒绝统一记 error；main.tsx 启动时调用一次 */
export function catchGlobalErrors() {
  window.addEventListener('error', (e) => log.error('未捕获的异常', { message: e.message, source: e.filename, line: e.lineno, error: e.error }));
  window.addEventListener('unhandledrejection', (e) => log.error('未处理的 Promise 拒绝', { reason: e.reason }));
}

/** 测试用：清空限流计数 */
export const resetLogLimit = () => { windowStart = 0; sent = 0; recent.clear(); };
