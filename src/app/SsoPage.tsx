import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { SsoKind } from '@/api/types';
import { useProductName } from '@/core/me';
import { useSession } from '@/core/session';
import { Icon, Logo } from '@/ui/Icon';

/** 单点登录回调：#/sso?provider=cas&ticket=…（CAS）、?provider=oidc&code=…（OIDC）、?provider=platform&token=… */
export function SsoCallback() {
  const productName = useProductName();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const provider = (sp.get('provider') ?? 'cas') as SsoKind;
    coreApi.ssoLogin(provider, { token: sp.get('token') ?? undefined, ticket: sp.get('ticket') ?? undefined, code: sp.get('code') ?? undefined })
      .then((u) => { useSession.getState().login(u.id, u.sid); void qc.invalidateQueries(); nav(sp.get('redirect') || '/', { replace: true }); })
      .catch((e: Error) => setError(e.message));
  }, [sp, nav, qc]);
  return (
    <div className="lg-page">
      <section>
        <div className="lg-card">
          <div className="lg-in">
            <div className="lg-brand"><span className="logo"><Logo /></span>{productName}</div>
            <h1>{error ? '单点登录失败' : '正在登录…'}</h1>
            {error && <><div className="f-err" role="alert">{error}</div><Link className="btn" to="/" style={{ marginTop: 16 }}><Icon name="left" />返回登录页</Link></>}
          </div>
        </div>
      </section>
    </div>
  );
}

/** 演示环境没有真实的统一身份认证服务器，用这一页模拟它的登录页，把跳转流程走通 */
export function MockIdp() {
  const productName = useProductName();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const provider = (sp.get('provider') ?? 'cas') as 'cas' | 'oidc';
  const demo = useQuery({ queryKey: ['demo-users'], queryFn: coreApi.demoUsers }).data ?? [];
  const [no, setNo] = useState('');
  const [pw, setPw] = useState('');
  const go = (jobNo: string) => {
    const rand = Math.random().toString(36).slice(2, 10);
    nav(provider === 'cas' ? `/sso?provider=cas&ticket=ST-${jobNo}-${rand}` : `/sso?provider=oidc&code=C-${jobNo}-${rand}`, { replace: true });
  };
  return (
    <div className="lg-page idp">
      <section>
        <div className="lg-card">
          <div className="lg-in">
            <div className="lg-brand"><span className="logo"><Icon name="shield" /></span>统一身份认证 <small>模拟 · {provider === 'cas' ? 'CAS 3.0' : 'OAuth2 / OIDC'}</small></div>
            <h1>工号登录</h1>
            <p className="sub">认证通过后带着{provider === 'cas' ? '票据' : '授权码'}回到{productName}，按工号对应人员</p>
            <form noValidate style={{ marginTop: 22 }} onSubmit={(e) => { e.preventDefault(); if (no.trim() && pw) go(no.trim()); }}>
              <div className="field"><label htmlFor="idp-no" className="req">工号</label><input id="idp-no" className="input mono" value={no} autoFocus onChange={(e) => setNo(e.target.value)} /></div>
              <div className="field"><label htmlFor="idp-pw" className="req">密码</label><input id="idp-pw" className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
              <button className="btn btn-p" type="submit" disabled={!no.trim() || !pw}><span>认证并返回</span><Icon name="arrow" /></button>
            </form>
            <div className="demo-l">演示工号<span>点一下直接认证</span></div>
            <div className="idp-nos">
              {demo.map((u) => <button key={u.id} type="button" className="chip" onClick={() => go(u.no)}><span className="mono">{u.no}</span>{u.name}</button>)}
              <button type="button" className="chip" onClick={() => go('E9999')}><span className="mono">E9999</span>未开通的工号</button>
            </div>
          </div>
          <div className="lg-foot"><Link to="/">取消，返回{productName}登录页</Link></div>
        </div>
      </section>
    </div>
  );
}
