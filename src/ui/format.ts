export function ago(seconds: number): string {
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 30 * 86400) return `${Math.floor(seconds / 86400)} 天前`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} 个月前`;
  return `${Math.floor(seconds / 31536000)} 年前`;
}

/** 角标数字（用户 10-23）：100 以内照实写，100–999 写「99+」，1000 及以上写「999+」 */
export const badgeText = (n: number) => (n > 999 ? '999+' : n > 99 ? '99+' : String(n));
