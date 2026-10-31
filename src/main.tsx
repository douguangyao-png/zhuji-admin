import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { coreApi } from './api/core';
import type { SsoKind } from './api/types';
import { Root } from './app/Root';
import { useSession } from './core/session';
import { useBgStore, useThemeStore } from './lib/theme';
import { catchGlobalErrors } from './lib/log';
import './api/report';
import './ui/tokens.css';
import './ui/ui.css';
import './app/login.css';
import './ui/brand.css';

catchGlobalErrors();
document.documentElement.dataset.theme = useThemeStore.getState().theme;
useBgStore.getState().tick();
setInterval(() => useBgStore.getState().tick(), 60_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) useBgStore.getState().tick(); });

/** 平台嵌入时地址带 ?sso=<角色>：按角色登录，再把参数从地址里去掉 */
// 平台签名令牌 ?provider=platform&token=…；统一门户 ?provider=token-exchange&token=…
async function applySso() {
  const q = new URLSearchParams(window.location.search);
  const role = q.get('sso');
  const token = q.get('token');
  if (!role && !token) return;
  try {
    const u = role ? await coreApi.sso(role) : await coreApi.ssoLogin((q.get('provider') ?? 'platform') as SsoKind, { token: token! });
    useSession.getState().login(u.id, u.sid);
  } catch { /* 对不上人员时停在登录页 */ }
  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
}

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false, retry: false } } });

// 接真实后端时不打包模拟层
const ready = import.meta.env.VITE_API === 'server' ? Promise.resolve() : import('./api/mock');

void ready.then(applySso).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={client}><Root /></QueryClientProvider>
    </StrictMode>,
  );
});
