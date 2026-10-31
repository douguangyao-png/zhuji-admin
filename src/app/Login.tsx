import { APP } from '@/app.config';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { captchaAutoPass } from '@/api/captcha';
import { coreApi } from '@/api/core';
import { ApiError } from '@/api/http';
import { useProductName, useSettings } from '@/core/me';
import { useSession } from '@/core/session';
import { ThemeMenu } from './ThemeMenu';
import { Icon, Logo } from '@/ui/Icon';
import { LoginBackdrop } from './LoginBackdrop';
import { SliderCaptcha } from './SliderCaptcha';

/** embedded：嵌在别的页面里，只要登录卡片；登录页不放演示账号和快捷登录入口 */
export function Login({ embedded, onLogin }: { embedded?: boolean; onLogin?: () => void } = {}) {
  const qc = useQueryClient();
  const settings = useSettings().data;
  const productName = useProductName();
  const sso = useQuery({ queryKey: ['sso-providers'], queryFn: coreApi.ssoProviders }).data ?? [];
  const nav = useNavigate();
  const redirectable = sso.filter((p) => p.id === 'cas' || p.id === 'oidc');
  const entered = sso.filter((p) => p.id === 'platform' || p.id === 'token-exchange');
  const ssoGo = (id: string) => {
    if (import.meta.env.VITE_API === 'server') window.location.href = `${APP.apiBase}/auth/${id}/login?redirect=${encodeURIComponent(window.location.href)}`;
    else nav(`/sso/idp?provider=${id}`);
  };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  // 「密码错 N 次后需要」由登录失败的响应告诉前端；总是需要时一进来就显示
  const [forced, setForced] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const needCaptcha = !captchaAutoPass() && (forced || (settings?.loginCaptcha ?? 'always') === 'always');
  const blocked = needCaptcha && !token;

  const login = async (name: string, pw: string) => {
    try {
      const u = await coreApi.login(name, pw, token ?? undefined);
      onLogin?.();
      useSession.getState().login(u.id, u.sid);
      void qc.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
      const hint = e instanceof ApiError ? (e.data as { captchaRequired?: boolean } | undefined)?.captchaRequired : undefined;
      if (hint !== undefined) setForced(hint);
      setToken(null);
      setRound((r) => r + 1); // 凭证已在服务端作废，换一张重新验证
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) { setError('请输入用户名和密码'); return; }
    if (blocked) { setError('请先拖动滑块完成验证'); return; }
    void login(username, password);
  };
  return (
    <div className={embedded ? 'lg-page lg-embed' : 'lg-page'}>
      {!embedded && <LoginBackdrop />}
      {!embedded && <ThemeMenu className="btn btn-sm btn-ic lg-theme" />}
      <section>
        <div className="lg-card">
          <div className="lg-in">
            <div className="lg-brand"><span className="logo"><Logo /></span>{productName} <small>{settings?.orgName}</small></div>
            <h1>登录</h1>
            <p className="sub">组织人员 · 角色权限 · 审批 · 消息</p>
            <form noValidate onSubmit={submit} style={{ marginTop: 22 }}>
              <div className="field">
                <label htmlFor="un" className="req">用户名</label>
                <input id="un" className="input" value={username} autoComplete="username" autoFocus={!embedded} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="pw" className="req">密码</label>
                <div className="pw">
                  <input id="pw" className="input" type={show ? 'text' : 'password'} value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" aria-pressed={show} aria-label={show ? '隐藏密码' : '显示密码'} onClick={() => setShow((s) => !s)}><Icon name="eye" /></button>
                </div>
              </div>
              {needCaptcha && <SliderCaptcha key={round} onPass={(t) => { setToken(t); setError(''); }} />}
              {error && <div className="f-err" role="alert" style={{ marginTop: 12 }}>{error}</div>}
              <button className="btn btn-p" type="submit" disabled={blocked} title={blocked ? '先完成滑块验证' : undefined}><span>登录</span><Icon name="arrow" /></button>
            </form>
            {redirectable.map((p) => (
              <button key={p.id} type="button" className="btn lg-sso" onClick={() => ssoGo(p.id)}><Icon name="shield" />{p.name}登录</button>
            ))}
          </div>
          <div className="lg-foot"><span>{entered.length ? `从${entered.map((p) => p.name).join('、')}进入时自动登录` : '账号由系统管理员在「人员」里开通'}</span></div>
        </div>
      </section>
    </div>
  );
}
