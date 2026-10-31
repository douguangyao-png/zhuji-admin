import type { ReactNode } from 'react';
import { useMe } from './me';

/**
 * 按钮级、字段级权限：有权限才渲染 children，否则渲染 fallback（默认不渲染）。
 * perm 可以是一个权限点或数组（任一即可）；页面里也可以直接用 useMeSure().can('xxx:yyy')。
 * 这只是界面上的隐藏，接口必须由后端按同一个权限点校验
 */
export function Can({ perm, children, fallback = null }: { perm: string | string[]; children: ReactNode; fallback?: ReactNode }) {
  const perms = useMe().data?.perms ?? [];
  const list = Array.isArray(perm) ? perm : [perm];
  const ok = perms.includes('*') || list.some((p) => perms.includes(p));
  return <>{ok ? children : fallback}</>;
}
