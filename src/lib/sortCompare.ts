// 列表排序的统一比较规则（DataTable 和页面里直接写的表格共用）：
// 数字按数值；字符串按中文拼音，其中的数字段按数值（"2" 在 "10" 前，"2026-9-30" 在 "2026-10-05" 前）；
// 数字排在文字前；空值（null、undefined、空串、NaN）在升序和降序下都排最后。
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

export const isEmptyValue = (v: unknown): boolean =>
  v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

const kind = (v: unknown): number => (typeof v === 'number' || typeof v === 'boolean' || v instanceof Date ? 0 : 1);
const num = (v: unknown): number => (v instanceof Date ? v.getTime() : Number(v));

/**
 * 返回「按升序比较」的结果；调用方在降序时把结果取反（TanStack 和 useTableSort 都是这样做的）。
 * 为了让空值在降序时也排最后，降序（desc=true）下空值返回相反的符号，取反之后仍在后面。
 */
export function sortCompare(a: unknown, b: unknown, desc = false): number {
  const ea = isEmptyValue(a), eb = isEmptyValue(b);
  if (ea || eb) {
    if (ea && eb) return 0;
    const lastIsA = ea ? 1 : -1;
    return desc ? -lastIsA : lastIsA;
  }
  const ka = kind(a), kb = kind(b);
  if (ka !== kb) return ka - kb;
  if (ka === 0) return num(a) - num(b);
  return collator.compare(String(a), String(b));
}
