import { maskIdCard, maskPhone } from '@/lib/mask';

/** 手机号、证件号码的统一脱敏展示；空值显示「—」。要看全号的场景由后端单独授权返回，不在前端拼 */
export function Masked({ kind, value }: { kind: 'phone' | 'idCard'; value?: string | null }) {
  if (!value) return <span className="fg4">—</span>;
  const text = kind === 'phone' ? maskPhone(value) : maskIdCard(value);
  return <span className="mono" aria-label={kind === 'phone' ? `手机号 ${text}` : `证件号码 ${text}`}>{text}</span>;
}
