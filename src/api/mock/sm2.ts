// 模拟后端的 SM2 传输加密：和后端的 SM2 传输解密同一套规则，前端演示时也走加密、在这里解开
import { fromHex, fromUtf8, generateKeyPair, publicKeyHex, parsePublicKey, sm2Decrypt, sm2Encrypt, toHex, utf8 } from '@/lib/sm2';
import { ApiError, mock } from './router';

const MAX_SKEW = 5 * 60_000;
let pair: ReturnType<typeof generateKeyPair> | null = null;
let kid = '';
const nonces = new Map<string, number>();

function current() {
  if (!pair) { pair = generateKeyPair(); kid = toHex(globalThis.crypto.getRandomValues(new Uint8Array(8))); }
  return pair;
}

const stale = (msg: string) => new ApiError(422, msg, { pubkeyExpired: true });

/** 解开 {kid, enc}，校验时间戳和一次性随机数，返回里面的字段 */
export function openSealed(body: { kid?: string; enc?: string }): Record<string, unknown> {
  if (!body.enc) throw stale('请刷新页面后重新提交');
  if (body.kid !== kid) throw stale('登录页已过期，请刷新后重新提交');
  let m: Record<string, unknown>;
  try { m = JSON.parse(fromUtf8(sm2Decrypt(current().privateKey, fromHex(body.enc)))); } catch { throw stale('请求内容无法解密，请刷新后重新提交'); }
  const now = Date.now();
  if (typeof m.t !== 'number' || typeof m.n !== 'string' || m.n.length < 16) throw new ApiError(400, '参数不正确');
  if (Math.abs(now - m.t) > MAX_SKEW) throw stale('请求已过期，请刷新后重新提交');
  for (const [n, exp] of nonces) if (exp < now) nonces.delete(n);
  if (nonces.has(m.n)) throw new ApiError(422, '请求重复提交，请刷新后重试');
  nonces.set(m.n, now + 2 * MAX_SKEW);
  return m;
}

/** 用浏览器给的一次性公钥加密回传 */
export const sealFor = (publicKey: string, text: string) => toHex(sm2Encrypt(parsePublicKey(publicKey), utf8(text)));

/** 测试里模拟轮换：换一把新钥，旧 kid 立即作废 */
export function rotateMockSm2() { pair = null; current(); }

mock.open('GET', '/auth/pubkey', () => {
  const p = current();
  return { kid, publicKey: publicKeyHex(p.publicKey), curve: 'sm2p256v1', mode: 'C1C3C2', now: Date.now() };
});
