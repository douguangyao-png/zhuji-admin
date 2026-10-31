// 敏感信息脱敏：界面展示、日志、上报共用一套规则

/** 手机号 138****5678；不是 11 位的原样返回 */
export const maskPhone = (s?: string | null) => (s && /^1\d{10}$/.test(s) ? `${s.slice(0, 3)}****${s.slice(7)}` : s ?? '');

/** 证件号码：保留前 6 位和后 4 位，中间打星；太短的只留最后 1 位 */
export function maskIdCard(s?: string | null) {
  if (!s) return '';
  const t = s.trim();
  if (t.length >= 15) return `${t.slice(0, 6)}${'*'.repeat(t.length - 10)}${t.slice(-4)}`;
  return t.length > 1 ? `${'*'.repeat(t.length - 1)}${t.slice(-1)}` : '*';
}

/** 文字里出现的身份证号、手机号打码（群消息、日志正文用） */
export const maskText = (s: string) => s
  .replace(/(?<![0-9Xx])(\d{6})\d{8}(\d{3}[0-9Xx])(?![0-9Xx])/g, '$1********$2')
  .replace(/(?<!\d)(1[3-9]\d)\d{4}(\d{4})(?!\d)/g, '$1****$2');

/** 键名像密码、令牌、密钥、证件号的字段，值整个换成 *** */
const SECRET_KEY = /pass(word)?|pwd|token|secret|ticket|code$|^enc$|authorization|cookie|session|sid|idcard|id_card|credential|private/i;

/** 日志、上报前的深拷贝脱敏：敏感键整值隐藏，其余字符串里的手机号、身份证号打码；循环引用和过深的层级截断 */
export function redact(v: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') return maskText(v.length > 2000 ? `${v.slice(0, 2000)}…` : v);
  if (typeof v !== 'object') return v;
  if (depth > 5) return '[已截断]';
  if (seen.has(v)) return '[循环引用]';
  seen.add(v);
  if (v instanceof Error) return { name: v.name, message: maskText(v.message), stack: v.stack ? maskText(v.stack.split('\n').slice(0, 8).join('\n')) : undefined };
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redact(x, depth + 1, seen));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET_KEY.test(k) ? '***' : redact(x, depth + 1, seen)]));
}
