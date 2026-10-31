// 系统管理 › 安全策略：登录锁定、空闲超时、同账号并发登录、页面水印，以及登录验证码、密码策略。
// 这里的开关只决定前端提示和模拟层行为；接后端后同样的参数必须由后端执行，前端只是展示
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { SECURITY_DEFAULTS, type SessionPolicy, type Settings } from '@/api/types';
import { PageHead } from '@/core/bits';
import { useSettings } from '@/core/me';
import { Field, Seg } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/primitives';
import { toast } from '@/ui/Toast';
import { LoginCaptchaCard, PasswordPolicyCard } from './SettingsPage';

function SessionCard({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const init = {
    lockAfter: s.lockAfter ?? SECURITY_DEFAULTS.lockAfter,
    lockMinutes: s.lockMinutes ?? SECURITY_DEFAULTS.lockMinutes,
    idleMinutes: s.idleMinutes ?? SECURITY_DEFAULTS.idleMinutes,
    sessionPolicy: s.sessionPolicy ?? SECURITY_DEFAULTS.sessionPolicy,
    watermark: s.watermark ?? SECURITY_DEFAULTS.watermark,
  };
  const [v, setV] = useState(init);
  const save = useMutation({
    mutationFn: () => coreApi.saveSettings(v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['settings'] }); toast('已保存安全策略'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const num = (k: 'lockAfter' | 'lockMinutes' | 'idleMinutes') => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) });
  const bad = !(Number.isInteger(v.lockAfter) && v.lockAfter >= 1 && v.lockAfter <= 20) || !(Number.isInteger(v.lockMinutes) && v.lockMinutes >= 1 && v.lockMinutes <= 1440)
    || !(Number.isInteger(v.idleMinutes) && v.idleMinutes >= 0 && v.idleMinutes <= 1440);
  const changed = JSON.stringify(v) !== JSON.stringify(init);
  return (
    <div className="card">
      <div className="card-h b"><span className="card-t">登录与会话</span></div>
      <div className="card-b stack">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Field label="连续输错几次锁定" hint="1–20，默认 5">{(id) => <input id={id} className="input" type="number" min={1} max={20} style={{ width: 90 }} value={v.lockAfter} onChange={num('lockAfter')} />}</Field>
          <Field label="锁定分钟数" hint="1–1440，默认 15">{(id) => <input id={id} className="input" type="number" min={1} max={1440} style={{ width: 90 }} value={v.lockMinutes} onChange={num('lockMinutes')} />}</Field>
          <Field label="空闲自动退出（分钟）" hint="0 为不自动退出，默认 30；退出前 60 秒提示">{(id) => <input id={id} className="input" type="number" min={0} max={1440} style={{ width: 90 }} value={v.idleMinutes} onChange={num('idleMinutes')} />}</Field>
        </div>
        <Seg<SessionPolicy> label="同一账号再次登录" value={v.sessionPolicy} onChange={(p) => setV({ ...v, sessionPolicy: p })}
          options={[{ value: 'allow', label: '允许多处同时在线' }, { value: 'kick', label: '踢掉之前的登录' }]} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <button type="button" role="switch" aria-checked={v.watermark} aria-label="页面水印" className={`sw${v.watermark ? ' on' : ''}`} onClick={() => setV({ ...v, watermark: !v.watermark })} />
          登录后的页面叠加「账号 + 姓名 + 时间」水印
        </label>
        <p className="fg3" style={{ fontSize: 13 }}>锁定、并发登录要由后端执行才有效；页面水印只能提醒和追溯截图来源，挡不住拍照。改动记操作日志。</p>
        <div><button type="button" className="btn btn-p" disabled={save.isPending || bad || !changed} onClick={() => save.mutate()}><Icon name="check" />{save.isPending ? '保存中…' : '保存'}</button></div>
      </div>
    </div>
  );
}

export function SecurityPage() {
  const s = useSettings().data;
  if (!s) return <div className="page"><Loading /></div>;
  return (
    <div className="page narrow">
      <PageHead title="安全策略" sub="登录锁定、空闲超时、并发登录、页面水印、登录验证码和密码策略。前端只做提示，所有校验以后端为准。" />
      <SessionCard key={JSON.stringify([s.lockAfter, s.lockMinutes, s.idleMinutes, s.sessionPolicy, s.watermark])} s={s} />
      <LoginCaptchaCard s={s} />
      <PasswordPolicyCard s={s} />
    </div>
  );
}
