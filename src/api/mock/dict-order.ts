/** 字典项排序：先按排序号从小到大，相同时按名称 */
export const byDictOrder = (a: { sort: number; name: string }, b: { sort: number; name: string }) =>
  a.sort - b.sort || a.name.localeCompare(b.name, 'zh-Hans-CN');

/** 新增字典项和旧数据的默认排序号 */
export const DEFAULT_DICT_SORT = 9999;
