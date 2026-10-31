/** 时长等一位小数的数：去掉多余的 0 */
export const fmtHour = (n: number | null | undefined) => (n == null ? '—' : String(Math.round(n * 10) / 10));
/** 金额：￥ + 千分位 + 两位小数，负数写「-￥12.00」；导出 CSV 不用它，仍是纯数字 */
export const fmtMoney = (n: number | null | undefined) => (n == null ? '—' : `${n < 0 ? '-' : ''}￥${Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const fmtNum = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('zh-CN'));
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');
/** 手机号脱敏，见 lib/mask.ts */
export { maskPhone } from './mask';
