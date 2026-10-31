import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { PasswordChange } from '@/api/types';
import { signOut, useMe, useMeSure, useProductName, useSettings } from '@/core/me';
import { passwordProblems, policyOf, policyRules } from '@/lib/password';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Field';
import { Icon, Logo } from '@/ui/Icon';
import { toast } from '@/ui/Toast';

const WHY: Record<Exclude<PasswordChange, 'default-force'>, string> = {
  must: '这是管理员设置的初始密码或重置后的临时密码，请改成只有你知道的密码。',
  expired: '密码已超过有效期，请修改后继续使用。',
  weak: '当前密码不符合系统的密码规则，请修改后继续使用。',
  default: '你在使用管理员重置的默认密码，请改成只有你知道的密码。',
};

/** 原密码 + 新密码 + 确认；规则与服务端一致，提交前逐条提示 */
function PasswordForm({ onDone, footer }: { onDone: () => void; footer?: React.ReactNode }) {
  const me = useMeSure();
  const policy = policyOf(useSettings().data);
  const [old, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const problems = pw ? passwordProblems(pw, policy, me.user.username, me.user.no) : [];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!old) { setError('请输入原密码'); return; }
    if (problems.length || !pw) { setError(`新密码${(pw ? problems : [`至少 ${policy.minLength} 位`]).join('；')}`); return; }
    if (pw !== again) { setError('两次输入的新密码不一样'); return; }
    setBusy(true);
    try {
      await coreApi.changePassword(old, pw);
      onDone();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="stack">
      <Field label="原密码">{(id) => <input id={id} className="input" type="password" autoComplete="current-password" value={old} onChange={(e) => setOld(e.target.value)} />}</Field>
      <Field label="新密码" error={pw && problems.length ? problems.join('；') : null}>{(id) => (
        <input id={id} className="input" type="password" autoComplete="new-password" value={pw} aria-invalid={Boolean(pw && problems.length)} onChange={(e) => setPw(e.target.value)} />
      )}</Field>
      <Field label="再输一次新密码" error={again && again !== pw ? '两次输入的新密码不一样' : null}>{(id) => (
        <input id={id} className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      )}</Field>
      <ul className="pw-rules">{policyRules(policy).map((r) => <li key={r}>{r}</li>)}</ul>
      {error && <div className="f-err" role="alert">{error}</div>}
      <div className="pw-actions">
        <button className="btn btn-p" type="submit" disabled={busy}><Icon name="pencil" />修改密码</button>
        {footer}
      </div>
    </form>
  );
}

/** 首次登录、被重置、过期或不合规时整页显示，改完才进系统 */
export function ForcePasswordPage({ reason }: { reason: PasswordChange }) {
  const qc = useQueryClient();
  const productName = useProductName();
  const info = useMe().data?.passwordDefault;
  const force = reason === 'default-force';
  // 默认密码已登录超过可忽略次数，这次必须改，不改只能退出到首页
  const why = force ? `你已用默认密码登录 ${info?.logins ?? ''} 次仍未修改（最多可忽略 ${info?.max ?? ''} 次），这次必须修改密码，否则请退出到首页。` : WHY[reason as keyof typeof WHY];
  return (
    <div className="lg-page">
      <section>
        <div className="lg-card">
          <div className="lg-in">
            <div className="lg-brand"><span className="logo"><Logo /></span>{productName}</div>
            <h1>修改密码</h1>
            <p className="sub">{why}</p>
            <div style={{ marginTop: 22 }}>
              <PasswordForm onDone={() => { toast('密码已修改'); void qc.invalidateQueries({ queryKey: ['me'] }); }}
                footer={<button type="button" className="btn" onClick={() => void signOut()}><Icon name="logout" />{force ? '退出到首页' : '退出登录'}</button>} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="修改密码" size="sm" onClose={onClose}>
      <PasswordForm onDone={() => { toast('密码已修改，下次登录用新密码'); onClose(); }} />
    </Dialog>
  );
}

/** 最近一次点了「以后再说」的登录：账号 + 默认密码已登录次数，每次登录次数加一，所以每次登录都会再提示 */
let skipped = '';

/** 用着管理员重置的默认密码、还没超过可忽略次数时，登录后弹出，可以改也可以先忽略 */
export function DefaultPasswordPrompt() {
  const me = useMeSure();
  const qc = useQueryClient();
  const info = me.passwordDefault;
  const key = `${me.user.id}:${info?.logins ?? 0}`;
  const [closed, setClosed] = useState(skipped === key);
  if (closed || !info) return null;
  const later = () => { skipped = key; setClosed(true); };
  return (
    <Dialog title="请修改默认密码" size="sm" onClose={later}>
      <p className="fg3" style={{ fontSize: 13, marginBottom: 12 }}>
        你在使用管理员重置的默认密码，已登录 {info.logins} 次；用默认密码登录超过 {info.max} 次后，必须先修改密码才能使用系统。
      </p>
      <PasswordForm onDone={() => { toast('密码已修改，下次登录用新密码'); skipped = ''; setClosed(true); void qc.invalidateQueries({ queryKey: ['me'] }); }}
        footer={<button type="button" className="btn" onClick={later}><Icon name="x" />以后再说</button>} />
    </Dialog>
  );
}
