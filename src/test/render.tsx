import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import '@/api/mock';
import { resetDb } from '@/api/mock/db';
import { routes } from '@/app/App';
import { useSession } from '@/core/session';

/** 用某个演示账号打开某个地址；U01 系统管理员，U02 业务管理员，U03 部门负责人，U04、U05 普通用户；null 为不登录 */
export function openApp(path: string, userId: string | null = 'U01') {
  if (userId) useSession.getState().login(userId); else useSession.getState().logout();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

/** 每个测试前恢复演示数据 */
export function freshDb() { resetDb(); }
