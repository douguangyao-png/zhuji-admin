import type { ReactNode } from 'react';
import { useMe } from './me';

export type OpKind = 'import' | 'export' | 'print';

/** 导入、导出、打印按钮按角色的操作权限（op:import / op:export / op:print）显示；导入、导出接口在服务端另有校验 */
export function Op({ k, children }: { k: OpKind; children: ReactNode }) {
  const perms = useMe().data?.perms ?? [];
  return perms.includes('*') || perms.includes(`op:${k}`) ? <>{children}</> : null;
}
