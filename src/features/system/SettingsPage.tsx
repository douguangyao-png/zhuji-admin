import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { DEFAULT_FEATURES, DEFAULT_PRODUCT_NAME, FEATURE_LABEL, type CaptchaMode, type FeatureKey, type Settings, WORK_END, WORK_START } from '@/api/types';
import { WEEKDAY_NAMES, workDaysOf, workDaysText } from '@/lib/holidays';
import { PageHead } from '@/core/bits';
import { useSettings } from '@/core/me';
import { confirm } from '@/ui/Confirm';
import { Field, Seg } from '@/ui/Field';
import { Loading } from '@/ui/primitives';
import { toast } from '@/ui/Toast';
import { Icon } from '@/ui/Icon';

/** 模块开关的说明；没写的不显示说明 */
const DESC: Partial<Record<FeatureKey, string>> = {
  example: '示例登记的列表、表单、审批、导入导出；新项目可以删掉或照着写自己的模块',
};
/** 不能关闭的基础模块 */
const CORE: FeatureKey[] = [];

/** 与默认不同的模块开关 */
export function featureDiff(from: Settings['features'], to: Settings['features']): FeatureKey[] {
  return (Object.keys(FEATURE_LABEL) as FeatureKey[]).filter((k) => Boolean(from[k]) !== Boolean(to[k]));
}
const diffText = (to: Settings['features'], ks: FeatureKey[]) => ks.map((k) => `${FEATURE_LABEL[k]} ${to[k] ? '关→开' : '开→关'}`).join('，');

/** 名称：产品名称和使用单位名称，登录页、侧栏、浏览器标题和打印页都取这两项 */
function NamesCard({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const product0 = s.productName ?? DEFAULT_PRODUCT_NAME;
  const [product, setProduct] = useState(product0);
  const [org, setOrg] = useState(s.orgName);
  const save = useMutation({
    mutationFn: () => coreApi.saveSettings({ productName: product.trim(), orgName: org.trim() }),
    onSuccess: (r) => { setProduct(r.productName ?? DEFAULT_PRODUCT_NAME); setOrg(r.orgName); void qc.invalidateQueries({ queryKey: ['settings'] }); toast('已保存名称'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const same = product.trim() === product0 && org.trim() === s.orgName;
  return (
    <div className="card">
      <div className="card-h b"><span className="card-t">名称</span><span className="card-s">登录页、侧栏、浏览器标题和打印页的字样都取这里</span></div>
      <div className="card-b stack">
        <div className="grid g-2">
          <Field label="产品名称" required hint="如「协同办公平台」，最长 40 个字">{(id) => <input id={id} className="input" maxLength={40} value={product} onChange={(e) => setProduct(e.target.value)} />}</Field>
          <Field label="使用单位名称" required hint="单位全称，最长 60 个字">{(id) => <input id={id} className="input" maxLength={60} value={org} onChange={(e) => setOrg(e.target.value)} />}</Field>
        </div>
        <div><button type="button" className="btn btn-p" disabled={save.isPending || same || !product.trim() || !org.trim()} onClick={() => save.mutate()}><Icon name="check" />保存</button></div>
      </div>
    </div>
  );
}

/** 外网访问地址：对外链接、二维码和群消息里的链接按它拼 */
function PublicUrlCard({ value }: { value: string }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState(value);
  const save = useMutation({
    mutationFn: () => coreApi.saveSettings({ publicUrl: url }),
    onSuccess: (r) => { setUrl(r.publicUrl ?? ''); void qc.invalidateQueries({ queryKey: ['settings'] }); toast('已保存外网访问地址'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  return (
    <div className="card">
      <div className="card-h b"><span className="card-t">外网访问地址</span></div>
      <div className="card-b stack">
        <Field label="地址" optional hint={`对外链接、二维码和群消息里的链接用这个地址；不填时用当前页面地址（${location.origin}${location.pathname}）`}>{(id) => (
          <input id={id} className="input mono" placeholder="https://app.example.com/" value={url} onChange={(e) => setUrl(e.target.value)} />
        )}</Field>
        <div><button type="button" className="btn btn-p" disabled={save.isPending || url.trim() === value} onClick={() => save.mutate()}><Icon name="check" />保存</button></div>
      </div>
    </div>
  );
}

/** 工作日及时间：没勾的星期按周末算；消息升级、催办只算工作时间 */
function WorkHoursCard({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const days0 = workDaysOf(s);
  const [a, setA] = useState(s.workStart ?? WORK_START);
  const [z, setZ] = useState(s.workEnd ?? WORK_END);
  const [days, setDays] = useState<number[]>(days0);
  const save = useMutation({
    mutationFn: () => coreApi.saveSettings({ workStart: a, workEnd: z, workDays: days }),
    onSuccess: () => { void qc.invalidateQueries(); toast('已保存工作日及时间'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const bad = !(a && z && a < z);
  const noDay = days.length === 0;
  const same = a === (s.workStart ?? WORK_START) && z === (s.workEnd ?? WORK_END) && workDaysText(days) === workDaysText(days0);
  const toggle = (d: number) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((x, y) => x - y));
  return (
    <div className="card">
      <div className="card-h b"><span className="card-t">工作日及时间</span></div>
      <div className="card-b stack">
        <div className="field">
          <label>工作日</label>
          <div className="chips" role="group" aria-label="工作日">
            {WEEKDAY_NAMES.map((n, i) => {
              const on = days.includes(i + 1);
              return <button key={n} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(i + 1)}>{n}</button>;
            })}
          </div>
          <span className={noDay ? 'f-err' : 'fg3'} style={{ fontSize: 12 }}>{noDay ? '至少选一个工作日' : `${workDaysText(days)}上班；没选的日子按周末算，不升级消息、不能催办。默认周一至周五`}</span>
        </div>
        <div className="row gap">
          <Field label="上班时间">{(id) => <input id={id} type="time" className="input mono" value={a} onChange={(e) => setA(e.target.value)} />}</Field>
          <Field label="下班时间" hint="下班后的等待时间不算进消息升级" error={bad ? '上班时间要早于下班时间' : null}>{(id) => <input id={id} type="time" className="input mono" value={z} onChange={(e) => setZ(e.target.value)} />}</Field>
        </div>
        <div><button type="button" className="btn btn-p" disabled={save.isPending || bad || noDay || same} onClick={() => save.mutate()}><Icon name="check" />保存</button></div>
      </div>
    </div>
  );
}

const CAPTCHA_DESC: Record<CaptchaMode, string> = {
  always: '每次账号密码登录都要先拖动滑块。',
  'after-failures': '同一账号连续输错密码 N 次后，下次登录要拖动滑块；登录成功或锁定时长（默认 15 分钟）过后清零。',
  off: '不显示滑块，只靠密码错误锁定（默认错 5 次锁 15 分钟）。',
};

/** 登录验证码：只管账号密码登录，单点登录（平台令牌、CAS、OIDC、令牌换用户）不受影响 */
export function LoginCaptchaCard({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const mode = s.loginCaptcha ?? 'always';
  const [after, setAfter] = useState(String(s.loginCaptchaAfter ?? 3));
  const save = useMutation({
    mutationFn: (p: Partial<Settings>) => coreApi.saveSettings(p),
    onSuccess: (r) => { setAfter(String(r.loginCaptchaAfter ?? 3)); void qc.invalidateQueries({ queryKey: ['settings'] }); toast('已保存登录验证码设置'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const n = Number(after);
  return (
    <div className="card">
      <div className="card-h b"><span className="card-t">登录验证码</span></div>
      <div className="card-b stack">
        <Seg label="登录验证码" value={mode} onChange={(m) => save.mutate({ loginCaptcha: m })}
          options={[{ value: 'always', label: '总是需要' }, { value: 'after-failures', label: '密码错 N 次后需要' }, { value: 'off', label: '关闭' }]} />
        {mode === 'after-failures' && (
          <Field label="连续输错几次后需要" hint="1 到 10；默认错 5 次锁定账号，N 小于 5 才会先出滑块">{(id) => (
            <div style={{ display: 'flex', gap: 8 }}>
              <input id={id} className="input" type="number" min={1} max={10} style={{ width: 90 }} value={after} onChange={(e) => setAfter(e.target.value)} />
              <button type="button" className="btn" disabled={save.isPending || !Number.isInteger(n) || n < 1 || n > 10 || n === s.loginCaptchaAfter} onClick={() => save.mutate({ loginCaptcha: mode, loginCaptchaAfter: n })}><Icon name="check" />保存</button>
            </div>
          )}</Field>
        )}
        <p className="fg3" style={{ fontSize: 13 }}>{CAPTCHA_DESC[mode]}单点登录不受影响。</p>
      </div>
    </div>
  );
}

/** 密码策略：本人改密码、管理员重置后的新密码都按它校验；正式环境下不合规或过期的密码登录后要先改 */
export function PasswordPolicyCard({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const init = { passwordMinLength: s.passwordMinLength ?? 8, passwordMinClasses: s.passwordMinClasses ?? 3, passwordNotUserNo: s.passwordNotUserNo ?? true,
    passwordHistory: s.passwordHistory ?? 3, passwordMaxAgeDays: s.passwordMaxAgeDays ?? 0, defaultPasswordLogins: s.defaultPasswordLogins ?? 5 };
  const [v, setV] = useState(init);
  // 默认密码明文只有系统设置权限的人能读
  const dp = useQuery({ queryKey: ['default-password'], queryFn: coreApi.defaultPassword });
  const [pw, setPw] = useState<string | null>(null);
  const pwShown = pw ?? dp.data?.defaultPassword ?? '';
  const save = useMutation({
    mutationFn: () => coreApi.saveSettings({ ...v, ...(pw !== null && pw !== dp.data?.defaultPassword ? { defaultPassword: pw } : {}) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['settings'] }); void qc.invalidateQueries({ queryKey: ['default-password'] }); setPw(null); toast('已保存密码策略'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const num = (k: 'passwordMinLength' | 'passwordHistory' | 'passwordMaxAgeDays' | 'defaultPasswordLogins') => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) });
  const changed = JSON.stringify(v) !== JSON.stringify(init) || (pw !== null && pw !== dp.data?.defaultPassword);
  return (
    <div className="card">
      <div className="card-h b"><span className="card-t">密码策略</span></div>
      <div className="card-b stack">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Field label="最短长度">{(id) => <input id={id} className="input" type="number" min={6} max={32} style={{ width: 90 }} value={v.passwordMinLength} onChange={num('passwordMinLength')} />}</Field>
          <Field label="不能与最近几次相同" hint="0 为不限制">{(id) => <input id={id} className="input" type="number" min={0} max={10} style={{ width: 90 }} value={v.passwordHistory} onChange={num('passwordHistory')} />}</Field>
          <Field label="有效天数" hint="0 为不过期">{(id) => <input id={id} className="input" type="number" min={0} max={3650} style={{ width: 90 }} value={v.passwordMaxAgeDays} onChange={num('passwordMaxAgeDays')} />}</Field>
        </div>
        <Seg label="大写字母、小写字母、数字、符号至少包含几类" value={String(v.passwordMinClasses) as '1' | '2' | '3' | '4'} onChange={(c) => setV({ ...v, passwordMinClasses: Number(c) })}
          options={['1', '2', '3', '4'].map((c) => ({ value: c as '1' | '2' | '3' | '4', label: `至少 ${c} 类` }))} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <button type="button" role="switch" aria-checked={v.passwordNotUserNo} aria-label="不能包含工号或登录名" className={`sw${v.passwordNotUserNo ? ' on' : ''}`}
            onClick={() => setV({ ...v, passwordNotUserNo: !v.passwordNotUserNo })} />不能包含工号或登录名
        </label>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Field label="默认密码" hint="管理员在「人员」里重置密码时设成它，要符合上面的密码规则">{(id) => <input id={id} className="input mono" maxLength={64} style={{ width: 200 }} value={pwShown} onChange={(e) => setPw(e.target.value)} />}</Field>
          <Field label="默认密码可忽略次数" hint="用默认密码登录，前几次只提示修改，超过后必须改；1–20">{(id) => <input id={id} className="input" type="number" min={1} max={20} style={{ width: 90 }} value={v.defaultPasswordLogins} onChange={num('defaultPasswordLogins')} />}</Field>
        </div>
        <p className="fg3" style={{ fontSize: 13 }}>新建账号的首次登录必须改密码；重置密码改成上面的默认密码，对方用它登录时每次提示修改，超过可忽略次数后必须修改，不改只能退出。正式环境里密码不合规或过期，登录后要先改。演示环境不强制，demo 密码照常能用。</p>
        <div><button type="button" className="btn btn-p" disabled={save.isPending || !changed} onClick={() => save.mutate()}><Icon name="check" />保存</button></div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const s = useSettings().data;
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: coreApi.saveSettings,
    onSuccess: () => { void qc.invalidateQueries(); },
  });
  if (!s) return <div className="page"><Loading /></div>;

  const def = DEFAULT_FEATURES;
  const diff = featureDiff(s.features, def);
  const resetFeatures = async () => {
    const ok = await confirm({ title: '恢复默认模块？', okLabel: '恢复默认', text: `将改变：${diffText(def, diff)}。关掉的模块数据保留。` });
    if (ok) save.mutate({ resetFeatures: true }, { onSuccess: () => toast('已恢复默认模块') });
  };
  const toggle = (k: FeatureKey) => { if (!save.isPending) save.mutate({ features: { ...s.features, [k]: !s.features[k] } }); };

  return (
    <div className="page narrow">
      <PageHead title="基础配置" sub="按模块开关装配；关掉的模块菜单、权限一起隐藏，数据保留。" />
      <div className="card">
        <div className="card-h b"><span className="card-t">模块</span><span className="card-s">{Object.values(s.features).filter(Boolean).length} 个模块已启用{diff.length ? `，${diff.length} 个与默认不同` : ''}</span>
          <button type="button" className="btn btn-sm push" disabled={!diff.length || save.isPending} title={diff.length ? undefined : '已是默认'} onClick={() => void resetFeatures()}><Icon name="refresh" />恢复默认模块</button>
        </div>
        <table className="tbl">
          <tbody>
            {(Object.keys(FEATURE_LABEL) as FeatureKey[]).map((k) => (
              <tr key={k}>
                <td style={{ width: 200 }}><b>{FEATURE_LABEL[k]}</b></td>
                <td className="fg3" style={{ whiteSpace: 'normal' }}>{DESC[k]}</td>
                <td style={{ width: 90, textAlign: 'right' }}>
                  <button type="button" role="switch" aria-checked={s.features[k]} aria-label={FEATURE_LABEL[k]} disabled={CORE.includes(k) || save.isPending}
                    title={CORE.includes(k) ? '基础模块，不能关闭' : undefined}
                    className={`sw${s.features[k] ? ' on' : ''}`} onClick={() => toggle(k)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NamesCard key={`${s.productName}|${s.orgName}`} s={s} />
      <PublicUrlCard value={s.publicUrl ?? ''} />
      <WorkHoursCard s={s} />
    </div>
  );
}
