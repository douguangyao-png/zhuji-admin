import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router-dom';
import type { IconName } from '@/ui/Icon';
import type { FeatureKey } from '@/api/types';

/** anyPerm：有其中任一权限就显示 */
export interface MenuItem { name: string; to: string; icon: IconName; perm?: string; anyPerm?: string[]; feature?: FeatureKey }

/** 菜单项的权限：有 anyPerm 时任一即可，否则看 perm */
export const menuAllowed = (i: MenuItem, can: (perm?: string) => boolean) => (i.anyPerm ? i.anyPerm.some((p) => can(p)) : can(i.perm));

/** 一个业务模块：菜单、路由；模拟接口和数据在各自的 mock.ts 里登记。在 app/modules.ts 的 MODULES 里加上才会出现 */
export interface ModuleDef {
  key: string;
  name: string;
  icon: IconName;
  /** 模块开关，关掉后菜单和路由都不出现 */
  feature?: FeatureKey;
  /** 任一开关打开即显示 */
  anyFeature?: FeatureKey[];
  menu: MenuItem[];
  routes: RouteObject[];
  /** 首页上的卡片，如今日待办数、预警 */
  home?: { key: string; perm?: string; Card: ComponentType }[];
}
