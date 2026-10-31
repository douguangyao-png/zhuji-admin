// 单点登录与硬件接口的模拟实现。真实对接在后端 auth.sso 与 device 包里，这里只把流程走通
import { stamp } from '@/lib/time';
import type { DeviceEndpoint, DeviceLog, SsoKind, SsoProvider, User } from '../types';
import { signedIn } from './core';
import { table, uid } from './db';
import { ApiError, mock } from './router';
import { registerSeed } from './seed';
import { audit, need, units, users } from './services';

const providers = table<SsoProvider>('sys_sso');
const endpoints = table<DeviceEndpoint>('sys_device_endpoint');
const logs = table<DeviceLog>('sys_device_log');

registerSeed(5, (d) => {
  const sso: SsoProvider[] = [
    { id: 'platform', name: '统一应用平台', enabled: true, matchBy: 'no', autoProvision: false, config: { secret: '********', ttlSeconds: '60' } },
    { id: 'token-exchange', name: '统一门户（令牌换用户）', enabled: false, matchBy: 'no', autoProvision: false,
      config: { url: 'http://<门户地址>/other/api/passport/getLoginUserByToken', header: 'Token', noPath: 'data.jobNo', namePath: 'data.name' } },
    { id: 'cas', name: '统一身份认证（CAS）', enabled: true, matchBy: 'no', autoProvision: false,
      config: { server: 'https://ids.example.edu.cn/cas', attribute: 'employeeNumber' } },
    { id: 'oidc', name: '统一身份认证（OAuth2 / OIDC）', enabled: false, matchBy: 'no', autoProvision: false,
      config: { issuer: 'https://sso.example.org', clientId: 'zhuji', clientSecret: '********', scope: 'openid profile', claim: 'employee_no' } },
  ];
  d.sys_sso = sso;
  const ep = (kind: string, name: string, usedBy: string): DeviceEndpoint => ({ id: kind, kind, name, usedBy, impl: 'mock', vendor: '', address: '', secret: '', enabled: true });
  d.sys_device_endpoint = [
    ep('sms', '短信网关', '验证码、待办提醒'),
    ep('wecom', '企业微信', '消息推送'),
    ep('dingtalk', '钉钉', '消息推送'),
    ep('scanner', '扫码枪', '业务单据扫码；新模块用到外部设备时在这里登记'),
  ];
});

const find = (provider: SsoKind, external: string): User => {
  const p = providers.get(provider);
  if (!p?.enabled) throw new ApiError(403, `${p?.name ?? provider} 未启用`);
  const u = users.find((x) => (p.matchBy === 'no' ? x.no : x.username) === external);
  if (u) { if (!u.active) throw new ApiError(403, '账号已停用'); return u; }
  if (!p.autoProvision) throw new ApiError(403, `统一身份认证账号 ${external} 在本系统中没有对应人员，请联系管理员开通`);
  return users.insert({ id: uid('U'), username: external, name: external, no: external, unitId: units.all()[0].id, roleKeys: [], active: true });
};

/** 演示用的票据格式：平台令牌 P.<工号>，换用户令牌 T-<工号>，CAS 票据 ST-<工号>-…，OIDC 授权码 C-<工号>-… */
const externalOf = (provider: SsoKind, v: string) => {
  const m = { platform: /^P\.([^.]+)/, 'token-exchange': /^T-(.+)$/, cas: /^ST-([^-]+)-/, oidc: /^C-([^-]+)-/ }[provider].exec(v);
  if (!m) throw new ApiError(401, provider === 'cas' ? '票据无效或已过期' : provider === 'oidc' ? '授权码无效或已过期' : '令牌无效或已过期');
  return m[1];
};

mock.open('GET', '/auth/sso/providers', () => providers.where((p) => p.enabled).map((p) => ({ id: p.id, name: p.name })));

mock.open('POST', '/auth/sso/login', ({ body }) => {
  const provider = body.provider as SsoKind;
  const u = find(provider, externalOf(provider, String(body.token ?? body.ticket ?? body.code ?? '')));
  audit(u, '系统', '单点登录', providers.get(provider)?.name ?? provider, undefined, '单点登录');
  return signedIn(u, `单点登录 ${providers.get(provider)?.name ?? provider}`);
});

mock.get('/sys/sso', ({ user }) => { need(user, 'sys:device'); return providers.all(); });
mock.put('/sys/sso/:id', ({ user, params, body }) => {
  need(user, 'sys:device');
  audit(user, '系统', '修改单点登录配置', providers.get(params.id)?.name ?? params.id);
  return providers.update(params.id, body);
});

mock.get('/sys/devices', ({ user }) => { need(user, 'sys:device'); return endpoints.all(); });
mock.put('/sys/devices/:id', ({ user, params, body }) => {
  need(user, 'sys:device');
  audit(user, '系统', '修改接口配置', endpoints.get(params.id)?.name ?? params.id);
  return endpoints.update(params.id, body);
});
mock.get('/sys/device-logs', ({ query }) => logs.where((l) => !query.endpointId || l.endpointId === query.endpointId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50));

/** 测试连接：模拟实现总是成功；厂商适配没填地址时失败 */
mock.post('/sys/test/:kind/:id', ({ user, params }) => {
  need(user, 'sys:device');
  const target = params.kind === 'sso' ? providers.get(params.id) : endpoints.get(params.id);
  if (!target) throw new ApiError(404, '不存在');
  const vendor = 'impl' in target && target.impl === 'vendor';
  const ok = !(vendor && !(target as DeviceEndpoint).address);
  const detail = params.kind === 'sso' ? '模拟环境：配置格式正确，未连接真实认证服务器'
    : ok ? (vendor ? `已连接 ${(target as DeviceEndpoint).address}` : '模拟实现：调用已记录') : '未填写厂商接口地址';
  logs.insert({ id: uid('DL'), at: stamp(), endpointId: params.id, action: '测试连接', ok, detail });
  return { ok, detail };
});

/** 其他模块调用硬件时记一条日志（演示用），返回模拟结果 */
export function deviceCall(kind: string, action: string, detail: string) {
  const ep = endpoints.get(kind);
  logs.insert({ id: uid('DL'), at: stamp(), endpointId: kind, action, ok: Boolean(ep?.enabled), detail });
  return { ok: Boolean(ep?.enabled), mock: ep?.impl !== 'vendor' };
}
