import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { DeviceEndpoint, SsoKind, SsoProvider } from '@/api/types';
import { PageHead } from '@/core/bits';
import { Dialog } from '@/ui/Dialog';
import { Field, Seg } from '@/ui/Field';
import { Tabs } from '@/ui/Tabs';
import { Tag } from '@/ui/Tag';
import { toast } from '@/ui/Toast';
import { UserSyncPanel } from './UserSyncPanel';
import { Icon } from '@/ui/Icon';

const SSO_FIELDS: Record<SsoKind, [string, string][]> = {
  platform: [['secret', '共享密钥（HMAC-SM3）'], ['ttlSeconds', '令牌有效期（秒）']],
  'token-exchange': [['url', '换取用户的接口地址'], ['header', '令牌所在请求头'], ['noPath', '响应中工号的路径'], ['namePath', '响应中姓名的路径']],
  cas: [['server', 'CAS 服务器地址'], ['attribute', '工号所在的属性']],
  oidc: [['issuer', '认证服务器（issuer）'], ['clientId', '客户端 ID'], ['clientSecret', '客户端密钥'], ['scope', '授权范围'], ['claim', '工号所在的声明']],
};
const SSO_HOW: Record<SsoKind, string> = {
  platform: '从统一应用平台进入：平台签发 60 秒一次性令牌，本系统验签后按工号登录。',
  'token-exchange': '从统一门户进入：拿门户给的令牌调用门户接口换取用户信息。',
  cas: '登录页「统一身份认证登录」：跳到 CAS 登录，回来时带票据，本系统到 CAS 校验票据。',
  oidc: '登录页「统一身份认证登录」：OAuth2 授权码 + PKCE，换取令牌后读取用户信息。',
};

export function DevicesPage() {
  const [tab, setTab] = useState('sso');
  return (
    <div className="page">
      <PageHead title="接口配置" sub="单点登录、人员同步和硬件接口。硬件到位前用模拟实现，流程照常演示；采购后改成厂商适配并填写地址。" />
      <div className="card">
        <div className="toolbar"><Tabs value={tab} onChange={setTab} items={[{ key: 'sso', label: '单点登录' }, { key: 'user-sync', label: '人员同步' }, { key: 'device', label: '硬件与外部系统' }, { key: 'log', label: '调用记录' }]} /></div>
        {tab === 'sso' ? <SsoList /> : tab === 'user-sync' ? <UserSyncPanel /> : tab === 'device' ? <DeviceList /> : <LogList />}
      </div>
    </div>
  );
}

function useTest() {
  return useMutation({
    mutationFn: ({ kind, id }: { kind: 'sso' | 'device'; id: string }) => coreApi.testIntegration(kind, id),
    onSuccess: (r) => toast(r.detail, r.ok ? {} : { tone: 'bad' }),
  });
}

function SsoList() {
  const list = useQuery({ queryKey: ['sso-config'], queryFn: coreApi.ssoConfig }).data ?? [];
  const [edit, setEdit] = useState<SsoProvider | null>(null);
  const test = useTest();
  return (
    <>
      <table className="tbl">
        <thead><tr><th>方式</th><th>说明</th><th>人员对应</th><th>状态</th><th /></tr></thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td><b>{p.name}</b></td>
              <td className="wrap fg3">{SSO_HOW[p.id]}</td>
              <td>按{p.matchBy === 'no' ? '工号' : '账号'}{p.autoProvision ? '，查不到自动建号' : ''}</td>
              <td><Tag tone={p.enabled ? 'good' : 'flat'}>{p.enabled ? '已启用' : '未启用'}</Tag></td>
              <td className="act">
                <button type="button" className="btn btn-xs btn-g" onClick={() => test.mutate({ kind: 'sso', id: p.id })}><Icon name="arrow" />测试</button>
                <button type="button" className="btn btn-xs btn-g" onClick={() => setEdit(p)}><Icon name="settings" />配置</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <SsoDialog p={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function SsoDialog({ p, onClose }: { p: SsoProvider; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(p);
  const save = useMutation({
    mutationFn: coreApi.saveSso,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sso-config'] }); void qc.invalidateQueries({ queryKey: ['sso-providers'] }); toast('已保存'); onClose(); },
  });
  return (
    <Dialog title={`单点登录 · ${p.name}`} sub={SSO_HOW[p.id]} size="lg" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button><button type="button" className="btn btn-p" onClick={() => save.mutate(f)}><Icon name="check" />保存</button></>}>
      <div className="stack">
        <label className="sw-l"><button type="button" role="switch" aria-checked={f.enabled} aria-label="启用" className={`sw${f.enabled ? ' on' : ''}`} onClick={() => setF({ ...f, enabled: !f.enabled })} />启用</label>
        <div className="grid g-2">
          {SSO_FIELDS[p.id].map(([k, label]) => (
            <Field key={k} label={label}>{(id) => <input id={id} className="input mono" value={f.config[k] ?? ''} onChange={(e) => setF({ ...f, config: { ...f.config, [k]: e.target.value } })} />}</Field>
          ))}
        </div>
        <Field label="外部账号对应本系统人员">{() => (
          <Seg label="对应方式" value={f.matchBy} onChange={(v) => setF({ ...f, matchBy: v })} options={[{ value: 'no', label: '按工号' }, { value: 'username', label: '按账号' }]} />
        )}</Field>
        <label className="sw-l"><button type="button" role="switch" aria-checked={f.autoProvision} aria-label="自动建号" className={`sw${f.autoProvision ? ' on' : ''}`} onClick={() => setF({ ...f, autoProvision: !f.autoProvision })} />
          查不到人员时自动建号（不带角色，等管理员分配）</label>
      </div>
    </Dialog>
  );
}

function DeviceList() {
  const list = useQuery({ queryKey: ['devices'], queryFn: coreApi.devices }).data ?? [];
  const [edit, setEdit] = useState<DeviceEndpoint | null>(null);
  const test = useTest();
  return (
    <>
      <table className="tbl">
        <thead><tr><th>接口</th><th>用于</th><th>实现</th><th>地址</th><th>状态</th><th /></tr></thead>
        <tbody>
          {list.map((d) => (
            <tr key={d.id}>
              <td><b>{d.name}</b></td>
              <td className="wrap fg3">{d.usedBy}</td>
              <td>{d.impl === 'mock' ? '模拟实现' : `厂商适配 · ${d.vendor || '未填写厂商'}`}</td>
              <td className="mono">{d.address || '—'}</td>
              <td><Tag tone={d.enabled ? 'good' : 'flat'}>{d.enabled ? '启用' : '停用'}</Tag></td>
              <td className="act">
                <button type="button" className="btn btn-xs btn-g" onClick={() => test.mutate({ kind: 'device', id: d.id })}><Icon name="arrow" />测试连接</button>
                <button type="button" className="btn btn-xs btn-g" onClick={() => setEdit(d)}><Icon name="settings" />配置</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <DeviceDialog d={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function DeviceDialog({ d, onClose }: { d: DeviceEndpoint; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(d);
  const save = useMutation({
    mutationFn: coreApi.saveDevice,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['devices'] }); toast('已保存'); onClose(); },
  });
  return (
    <Dialog title={`接口 · ${d.name}`} sub={d.usedBy} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button><button type="button" className="btn btn-p" onClick={() => save.mutate(f)}><Icon name="check" />保存</button></>}>
      <div className="stack">
        <Field label="实现">{() => <Seg label="实现" value={f.impl} onChange={(v) => setF({ ...f, impl: v })} options={[{ value: 'mock', label: '模拟实现' }, { value: 'vendor', label: '厂商适配' }]} />}</Field>
        {f.impl === 'vendor' && <>
          <Field label="厂商">{(id) => <input id={id} className="input" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} />}</Field>
          <Field label="接口地址">{(id) => <input id={id} className="input mono" value={f.address} placeholder="https://vendor.example.com/api" onChange={(e) => setF({ ...f, address: e.target.value })} />}</Field>
          <Field label="密钥" optional>{(id) => <input id={id} className="input mono" type="password" value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} />}</Field>
        </>}
        <label className="sw-l"><button type="button" role="switch" aria-checked={f.enabled} aria-label="启用" className={`sw${f.enabled ? ' on' : ''}`} onClick={() => setF({ ...f, enabled: !f.enabled })} />启用</label>
      </div>
    </Dialog>
  );
}

function LogList() {
  const logs = useQuery({ queryKey: ['device-logs'], queryFn: () => coreApi.deviceLogs() }).data ?? [];
  const devices = useQuery({ queryKey: ['devices'], queryFn: coreApi.devices }).data ?? [];
  const sso = useQuery({ queryKey: ['sso-config'], queryFn: coreApi.ssoConfig }).data ?? [];
  const name = (id: string) => devices.find((d) => d.id === id)?.name ?? sso.find((p) => p.id === id)?.name ?? id;
  if (!logs.length) return <div className="empty"><h4>还没有调用记录</h4><p>测试连接、模拟刷卡开门、打印标签等操作会记在这里</p></div>;
  return (
    <table className="tbl">
      <thead><tr><th>时间</th><th>接口</th><th>动作</th><th>结果</th><th>说明</th></tr></thead>
      <tbody>
        {logs.map((l) => (
          <tr key={l.id}><td className="mono">{l.at}</td><td>{name(l.endpointId)}</td><td>{l.action}</td><td><Tag tone={l.ok ? 'good' : 'bad'}>{l.ok ? '成功' : '失败'}</Tag></td><td className="wrap fg3">{l.detail}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
