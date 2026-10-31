import { coreApi } from '@/api/core';
import { post } from '@/api/http';
import { rotateMockSm2 } from '@/api/mock/sm2';
import { seal } from '@/api/sm2';
import { useSession } from '@/core/session';
import { freshDb } from './render';

beforeEach(() => { freshDb(); useSession.getState().logout(); });

test('登录只收 SM2 密文：明文 password 被拒，加密后能登录', async () => {
  await expect(post('/auth/login', { username: 'manager', password: 'demo' })).rejects.toMatchObject({ status: 422, data: { pubkeyExpired: true } });
  expect((await coreApi.login('manager', 'demo')).id).toBe('U02');
});

test('同一份密文重放被拒', async () => {
  const s = await seal({ password: 'demo' });
  expect(s.enc).toMatch(/^04[0-9a-f]+$/);
  expect(s.enc).not.toContain(Buffer.from('demo').toString('hex'));
  await post('/auth/login', { username: 'manager', ...s });
  await expect(post('/auth/login', { username: 'manager', ...s })).rejects.toThrow('请求重复提交');
});

test('公钥轮换后自动取新公钥重发，用户无感', async () => {
  await coreApi.login('manager', 'demo');
  rotateMockSm2();
  expect((await coreApi.login('manager', 'demo')).id).toBe('U02');
});

test('改密码走密文；重置密码的默认密码用浏览器的一次性公钥加密回传', async () => {
  useSession.getState().login('U01');
  const raw = await post<{ enc?: string; password?: string }>('/org/users/U02/reset-password', { publicKey: (await import('@/lib/sm2')).publicKeyHex((await import('@/lib/sm2')).generateKeyPair().publicKey) });
  expect(raw.password).toBeUndefined();
  expect(raw.enc).toMatch(/^04[0-9a-f]{192,}$/);
  const { password } = await coreApi.resetPassword('U02');
  expect(password).toBe('Admin@2026');
  useSession.getState().login('U02');
  await expect(post('/me/password', { oldPassword: password, newPassword: 'Newpass-01' })).rejects.toMatchObject({ status: 422 });
  await coreApi.changePassword(password, 'Newpass-01');
  expect((await coreApi.login('manager', 'Newpass-01')).id).toBe('U02');
});
