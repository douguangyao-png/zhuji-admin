import { useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { DEFAULT_FEATURES, DEFAULT_PRODUCT_NAME, type FeatureKey, type Settings } from '@/api/types';
import { useSession } from './session';

export function useMe() {
  const userId = useSession((s) => s.userId);
  return useQuery({ queryKey: ['me', userId], queryFn: coreApi.me, enabled: Boolean(userId), staleTime: 60_000 });
}

/** 已登录页面里用；权限判断 can('example:edit')；terminals 是角色允许的菜单端，多个角色取并集 */
export function useMeSure() {
  const me = useMe().data!;
  const can = (perm?: string) => !perm || me.perms.includes('*') || me.perms.includes(perm);
  const terminals = me.perms.includes('*') ? ['pc', 'mobile'] : [...new Set(me.roles.flatMap((r) => r.terminals ?? ['pc', 'mobile']))];
  return { ...me, can, terminals };
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: coreApi.settings, staleTime: 60_000 });
}

/** 产品名称（基础配置 › 名称）：界面上的系统名称都取它，不要写死 */
export function useProductName() {
  return useSettings().data?.productName || DEFAULT_PRODUCT_NAME;
}

/** 模块开关；设置没加载完时按默认 */
export function useFeatures() {
  const s = useSettings().data;
  const on = (f?: FeatureKey) => !f || Boolean(s?.features[f] ?? DEFAULT_FEATURES[f]);
  return { on, settings: s as Settings | undefined };
}

/** 退出：清掉服务端的登录 Cookie；单点登录进来的再跳认证中心退出，其余回登录页 */
export async function signOut() {
  const r = await coreApi.logout().catch(() => null);
  useSession.getState().logout();
  if (r?.logoutUrl) window.location.href = r.logoutUrl;
  else window.location.hash = '#/';
}

export function useRefreshAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
