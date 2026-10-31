import type { Settings } from '@/api/types';

// 密码复杂度，规则和提示与后端一致；不能与历史密码相同只在服务端查
export interface PasswordPolicy { minLength: number; minClasses: number; notUserNo: boolean; history: number; maxAgeDays: number }

export const policyOf = (s?: Partial<Settings>): PasswordPolicy => ({
  minLength: s?.passwordMinLength ?? 8,
  minClasses: s?.passwordMinClasses ?? 3,
  notUserNo: s?.passwordNotUserNo ?? true,
  history: s?.passwordHistory ?? 3,
  maxAgeDays: s?.passwordMaxAgeDays ?? 0,
});

/** 大写、小写、数字、其他可见字符各算一类 */
export function charClasses(pw: string) {
  return [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9\s]/].filter((r) => r.test(pw)).length;
}

/** 密码里含有账号或工号（不分大小写；3 位以下的账号不查，免得误伤） */
const contains = (pw: string, s?: string) => { const t = s?.trim().toLowerCase(); return Boolean(t && t.length >= 3 && pw.toLowerCase().includes(t)); };

/** 不满足的条目，空数组为通过 */
export function passwordProblems(pw: string, p: PasswordPolicy, username?: string, userNo?: string): string[] {
  const out: string[] = [];
  if (pw.length < p.minLength) out.push(`至少 ${p.minLength} 位`);
  if (/\s/.test(pw)) out.push('不能有空格');
  if (charClasses(pw) < p.minClasses) out.push(`大写字母、小写字母、数字、符号至少包含 ${p.minClasses} 类`);
  if (p.notUserNo && (contains(pw, userNo) || contains(pw, username))) out.push('不能包含工号或登录名');
  return out;
}

/** 给人看的规则清单 */
export function policyRules(p: PasswordPolicy): string[] {
  return [
    `至少 ${p.minLength} 位`,
    `大写字母、小写字母、数字、符号至少包含 ${p.minClasses} 类`,
    ...(p.notUserNo ? ['不能包含工号或登录名'] : []),
    ...(p.history > 0 ? [`不能与最近 ${p.history} 次用过的密码相同`] : []),
  ];
}
