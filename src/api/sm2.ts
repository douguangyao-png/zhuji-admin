import { fromHex, fromUtf8, generateKeyPair, parsePublicKey, publicKeyHex, sm2Decrypt, sm2Encrypt, toHex, utf8, type Point } from '@/lib/sm2';
import { ApiError, get } from './http';

// 密码先用服务端的 SM2 公钥加密再传：密文里带一次性随机数 n 和时间戳 t，服务端据此防重放
let cached: { kid: string; pub: Point; offset: number } | null = null;

async function key() {
  if (!cached) {
    const r = await get<{ kid: string; publicKey: string; now: number }>('/auth/pubkey');
    cached = { kid: r.kid, pub: parsePublicKey(r.publicKey), offset: r.now - Date.now() }; // 按服务器时间校正本机时钟
  }
  return cached;
}

export async function seal(fields: Record<string, string>) {
  const k = await key();
  const body = JSON.stringify({ ...fields, n: toHex(globalThis.crypto.getRandomValues(new Uint8Array(16))), t: Date.now() + k.offset });
  return { kid: k.kid, enc: toHex(sm2Encrypt(k.pub, utf8(body))) };
}

/** 公钥换过或时间对不上时服务端回 pubkeyExpired，重新取公钥再发一次 */
export async function sealed<T>(fields: Record<string, string>, send: (s: { kid: string; enc: string }) => Promise<T>): Promise<T> {
  try {
    return await send(await seal(fields));
  } catch (e) {
    if (!(e instanceof ApiError) || !(e.data as { pubkeyExpired?: boolean } | undefined)?.pubkeyExpired) throw e;
    cached = null;
    return send(await seal(fields));
  }
}

/** 服务端回给浏览器的密码（重置的临时密码）：浏览器临时生成一对密钥，只把公钥发过去 */
export async function receiveSealed(send: (publicKey: string) => Promise<{ enc?: string; password?: string }>) {
  const kp = generateKeyPair();
  const r = await send(publicKeyHex(kp.publicKey));
  return r.enc ? fromUtf8(sm2Decrypt(kp.privateKey, fromHex(r.enc))) : r.password ?? '';
}

export const forgetPubkey = () => { cached = null; };
