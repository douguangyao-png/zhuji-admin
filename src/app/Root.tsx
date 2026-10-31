import { lazy, Suspense, useEffect } from 'react';
import { useProductName } from '@/core/me';

const Workbench = lazy(() => import('./Workbench'));

/** 工作台按需加载；浏览器标题跟产品名称走 */
export function Root() {
  const productName = useProductName();
  useEffect(() => { document.title = productName; }, [productName]);
  return <Suspense fallback={<div className="pt-boot" aria-busy="true" />}><Workbench /></Suspense>;
}
