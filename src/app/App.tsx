import { useEffect, type ReactNode } from 'react';
import { toast } from '@/ui/Toast';
import { Navigate, useSearchParams, type RouteObject } from 'react-router-dom';
import { useFeatures, useMe, useMeSure, useSettings } from '@/core/me';
import { useSession } from '@/core/session';
import { ApprovalsPage } from '@/features/home/ApprovalsPage';
import { HomePage } from '@/features/home/HomePage';
import { MessagesPage } from '@/features/home/MessagesPage';
import { Loading } from '@/ui/primitives';
import { DefaultPasswordPrompt, ForcePasswordPage } from './ChangePassword';
import { Login } from './Login';
import { MODULES } from './modules';
import { menuAllowed } from '@/core/module';
import { Shell } from './Shell';
import { MockIdp, SsoCallback } from './SsoPage';

/** 未登录显示登录页，登录后留在原地址 */
function Gate({ children }: { children: ReactNode }) {
  const userId = useSession((s) => s.userId);
  const me = useMe();
  const settings = useSettings();
  if (!userId) return <Login />;
  if (!me.data || !settings.data) return me.isError ? <Login /> : <div className="page"><Loading /></div>;
  if (me.data.passwordChange && me.data.passwordChange !== 'default') return <ForcePasswordPage reason={me.data.passwordChange} />;
  return <>{children}{me.data.passwordChange === 'default' && <DefaultPasswordPrompt />}</>;
}

/** 单独的登录页：已登录时回到 next 指的页面 */
function LoginRoute() {
  const userId = useSession((s) => s.userId);
  const next = useSearchParams()[0].get('next');
  return userId ? <Navigate to={next?.startsWith('/') ? next : '/'} replace /> : <Login />;
}

/** 越权打开的地址：提示一次后回首页 */
function Denied() {
  useEffect(() => { toast('没有权限访问这个页面，已回到首页', { tone: 'bad' }); }, []);
  return <Navigate to="/" replace />;
}

/** 模块关掉、或没有对应菜单的权限时直接打开它的地址，回首页并提示；只管和菜单同地址的页面，详情页由接口校验 */
function FeatureGuard({ mod, path, children }: { mod: (typeof MODULES)[number]; path?: string; children: ReactNode }) {
  const f = useFeatures();
  const me = useMeSure();
  const ok = mod.anyFeature ? mod.anyFeature.some(f.on) : f.on(mod.feature);
  const items = mod.menu.filter((i) => i.to.split('?')[0] === path);
  const allowed = !items.length || items.some((i) => menuAllowed(i, me.can));
  if (ok && allowed) return <>{children}</>;
  return <Denied />;
}

export const routes: RouteObject[] = [
  { path: '/sso', element: <SsoCallback /> },
  { path: '/sso/idp', element: <MockIdp /> },
  { path: '/login', element: <LoginRoute /> },
  // 不进外壳、不用登录的页面（如公开页）加在这里
  {
    element: <Gate><Shell /></Gate>,
    children: [
      { index: true, element: <HomePage />, handle: { title: '首页' } },
      { path: '/approvals', element: <ApprovalsPage />, handle: { title: '审批' } },
      { path: '/messages', element: <MessagesPage />, handle: { title: '消息' } },
      ...MODULES.flatMap((m) => m.routes.map((r) => ({ ...r, element: <FeatureGuard mod={m} path={r.path}>{r.element}</FeatureGuard> }))),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
