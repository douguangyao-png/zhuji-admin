import { useQuery } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { useSession } from './session';

/** 扩展人员属性目录（含作废的） */
export function useAttrDefs() {
  const userId = useSession((s) => s.userId);
  return useQuery({ queryKey: ['userAttrDefs'], queryFn: coreApi.userAttrDefs, enabled: Boolean(userId), staleTime: 60_000 });
}
