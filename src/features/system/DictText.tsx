import { useQuery } from '@tanstack/react-query';
import { coreApi } from '@/api/core';

/** 字典项被删除后，业务数据里的旧值显示成灰色的「未配置」 */
export function useDictItems(type: string) {
  return useQuery({ queryKey: ['dicts', type, 'all'], queryFn: () => coreApi.dicts(type, true), staleTime: 60_000 }).data ?? [];
}

export function DictText({ type, value, byCode }: { type: string; value?: string | null; byCode?: boolean }) {
  const items = useDictItems(type);
  const v = value?.trim();
  if (!v) return <>—</>;
  const ok = items.some((d) => (byCode ? d.code : d.name) === v);
  return ok ? <>{v}</> : <span className="fg4" title={`字典里没有这一项：${v}`}>未配置</span>;
}
