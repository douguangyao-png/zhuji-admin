// 国密 SM3（GB/T 32905）与 SM2 公钥加密（GB/T 32918.4，密文 C1C3C2）；离线环境没有现成的国密库，用 BigInt 实现
// 只用于把密码加密后再传给服务端；签名、密钥交换不需要

// ---------- SM3 ----------

const rotl = (x: number, n: number) => ((x << (n & 31)) | (x >>> (32 - (n & 31)))) >>> 0;
const P0 = (x: number) => (x ^ rotl(x, 9) ^ rotl(x, 17)) >>> 0;
const P1 = (x: number) => (x ^ rotl(x, 15) ^ rotl(x, 23)) >>> 0;
const IV = [0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600, 0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e];

export function sm3(msg: Uint8Array): Uint8Array {
  const bitLen = msg.length * 8;
  const padLen = ((msg.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(padLen - 8, Math.floor(bitLen / 2 ** 32));
  dv.setUint32(padLen - 4, bitLen >>> 0);
  const v = IV.slice();
  const w = new Array<number>(68);
  const w1 = new Array<number>(64);
  for (let off = 0; off < padLen; off += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(off + j * 4);
    for (let j = 16; j < 68; j++) w[j] = (P1(w[j - 16] ^ w[j - 9] ^ rotl(w[j - 3], 15)) ^ rotl(w[j - 13], 7) ^ w[j - 6]) >>> 0;
    for (let j = 0; j < 64; j++) w1[j] = (w[j] ^ w[j + 4]) >>> 0;
    let [a, b, c, d, e, f, g, h] = v;
    for (let j = 0; j < 64; j++) {
      const t = j < 16 ? 0x79cc4519 : 0x7a879d8a;
      const ss1 = rotl((rotl(a, 12) + e + rotl(t, j)) >>> 0, 7);
      const ss2 = (ss1 ^ rotl(a, 12)) >>> 0;
      const ff = j < 16 ? a ^ b ^ c : (a & b) | (a & c) | (b & c);
      const gg = j < 16 ? e ^ f ^ g : (e & f) | (~e & g);
      const tt1 = ((ff >>> 0) + d + ss2 + w1[j]) >>> 0;
      const tt2 = ((gg >>> 0) + h + ss1 + w[j]) >>> 0;
      d = c; c = rotl(b, 9); b = a; a = tt1;
      h = g; g = rotl(f, 19); f = e; e = P0(tt2);
    }
    [a, b, c, d, e, f, g, h].forEach((x, i) => { v[i] = (v[i] ^ x) >>> 0; });
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  v.forEach((x, i) => ov.setUint32(i * 4, x));
  return out;
}

// ---------- 字节与大数 ----------

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export function fromHex(h: string): Uint8Array {
  const s = h.replace(/\s+/g, '');
  if (s.length % 2 || /[^0-9a-f]/i.test(s)) throw new Error('不是十六进制');
  return Uint8Array.from({ length: s.length / 2 }, (_, i) => parseInt(s.substr(i * 2, 2), 16));
}
const big = (h: string) => BigInt(`0x${h.replace(/\s+/g, '')}`);
const bytesToBig = (b: Uint8Array) => (b.length ? BigInt(`0x${toHex(b)}`) : 0n);
function bigToBytes(x: bigint, len: number): Uint8Array {
  return fromHex(x.toString(16).padStart(len * 2, '0'));
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

// ---------- 椭圆曲线 ----------

export interface Curve { p: bigint; a: bigint; b: bigint; n: bigint; gx: bigint; gy: bigint; size: number }
export interface Point { x: bigint; y: bigint }

/** GB/T 32918.5 推荐曲线 sm2p256v1 */
export const SM2P256V1: Curve = {
  p: big('FFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFF'),
  a: big('FFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFC'),
  b: big('28E9FA9E9D9F5E344D5A9E4BCF6509A7F39789F515AB8F92DDBCBD414D940E93'),
  n: big('FFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123'),
  gx: big('32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7'),
  gy: big('BC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0'),
  size: 32,
};

const mod = (x: bigint, m: bigint) => { const r = x % m; return r < 0n ? r + m : r; };
function powMod(b: bigint, e: bigint, m: bigint) {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

type Jac = [bigint, bigint, bigint]; // Z 为 0 表示无穷远点

function dbl(c: Curve, [x, y, z]: Jac): Jac {
  const p = c.p;
  if (z === 0n || y === 0n) return [0n, 1n, 0n];
  const yy = (y * y) % p;
  const zz = (z * z) % p;
  const s = (4n * x * yy) % p;
  const m = mod(3n * x * x + c.a * zz * zz, p);
  const x3 = mod(m * m - 2n * s, p);
  return [x3, mod(m * (s - x3) - 8n * yy * yy, p), (2n * y * z) % p];
}

function add(c: Curve, P: Jac, Q: Jac): Jac {
  if (P[2] === 0n) return Q;
  if (Q[2] === 0n) return P;
  const p = c.p;
  const z1z1 = (P[2] * P[2]) % p, z2z2 = (Q[2] * Q[2]) % p;
  const u1 = (P[0] * z2z2) % p, u2 = (Q[0] * z1z1) % p;
  const s1 = (P[1] * Q[2] * z2z2) % p, s2 = (Q[1] * P[2] * z1z1) % p;
  const h = mod(u2 - u1, p), r = mod(s2 - s1, p);
  if (h === 0n) return r === 0n ? dbl(c, P) : [0n, 1n, 0n];
  const hh = (h * h) % p, hhh = (hh * h) % p;
  const x3 = mod(r * r - hhh - 2n * u1 * hh, p);
  return [x3, mod(r * (u1 * hh - x3) - s1 * hhh, p), (h * P[2] * Q[2]) % p];
}

/** [k]P，从高位起倍点加；结果为 null 表示无穷远点 */
export function mul(c: Curve, k: bigint, P: Point): Point | null {
  let R: Jac = [0n, 1n, 0n];
  const base: Jac = [P.x, P.y, 1n];
  for (let i = k.toString(2), j = 0; j < i.length; j++) {
    R = dbl(c, R);
    if (i[j] === '1') R = add(c, R, base);
  }
  if (R[2] === 0n) return null;
  const zi = powMod(R[2], c.p - 2n, c.p);
  const zi2 = (zi * zi) % c.p;
  return { x: (R[0] * zi2) % c.p, y: (R[1] * zi2 * zi) % c.p };
}

export const onCurve = (c: Curve, P: Point) => P.x >= 0n && P.x < c.p && P.y >= 0n && P.y < c.p
  && mod(P.y * P.y - (P.x * P.x * P.x + c.a * P.x + c.b), c.p) === 0n;

function randomScalar(c: Curve, max = c.n - 1n): bigint {
  for (;;) {
    const k = bytesToBig(globalThis.crypto.getRandomValues(new Uint8Array(c.size)));
    if (k >= 1n && k <= max) return k;
  }
}

/** 密钥派生函数 KDF：SM3(Z || 计数器)，计数器从 1 起 32 位大端 */
function kdf(z: Uint8Array, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let ct = 1, off = 0; off < len; ct++, off += 32) {
    const h = sm3(concat(z, Uint8Array.of(ct >>> 24, (ct >>> 16) & 255, (ct >>> 8) & 255, ct & 255)));
    out.set(h.subarray(0, Math.min(32, len - off)), off);
  }
  return out;
}

/** 公钥：04 || x || y 的十六进制 */
export function parsePublicKey(hex: string, c: Curve = SM2P256V1): Point {
  const b = fromHex(hex);
  if (b.length !== 1 + 2 * c.size || b[0] !== 4) throw new Error('SM2 公钥格式不对');
  const P = { x: bytesToBig(b.subarray(1, 1 + c.size)), y: bytesToBig(b.subarray(1 + c.size)) };
  if (!onCurve(c, P)) throw new Error('SM2 公钥不在曲线上');
  return P;
}
export const publicKeyHex = (P: Point, c: Curve = SM2P256V1) => `04${toHex(bigToBytes(P.x, c.size))}${toHex(bigToBytes(P.y, c.size))}`;

export function generateKeyPair(c: Curve = SM2P256V1) {
  const d = randomScalar(c, c.n - 2n);
  return { privateKey: d, publicKey: mul(c, d, { x: c.gx, y: c.gy })! };
}

/** 加密，返回 C1(04||x1||y1) || C3 || C2；k 只给测试向量用 */
export function sm2Encrypt(pub: Point, msg: Uint8Array, c: Curve = SM2P256V1, fixedK?: bigint): Uint8Array {
  if (!msg.length) throw new Error('SM2 明文不能为空'); // 空明文时 KDF 输出为空，标准里的“全零重选 k”无从判断
  for (;;) {
    const k = fixedK ?? randomScalar(c);
    const c1 = mul(c, k, { x: c.gx, y: c.gy })!;
    const s = mul(c, k, pub);
    if (!s) throw new Error('SM2 公钥无效');
    const x2 = bigToBytes(s.x, c.size), y2 = bigToBytes(s.y, c.size);
    const t = kdf(concat(x2, y2), msg.length);
    if (t.every((x) => x === 0)) { if (fixedK) throw new Error('KDF 全零'); continue; }
    const c2 = msg.map((m, i) => m ^ t[i]);
    const c3 = sm3(concat(x2, msg, y2));
    return concat(Uint8Array.of(4), bigToBytes(c1.x, c.size), bigToBytes(c1.y, c.size), c3, c2);
  }
}

export function sm2Decrypt(d: bigint, cipher: Uint8Array, c: Curve = SM2P256V1): Uint8Array {
  const n = c.size;
  if (cipher.length < 1 + 2 * n + 32 || cipher[0] !== 4) throw new Error('SM2 密文格式不对');
  const c1 = { x: bytesToBig(cipher.subarray(1, 1 + n)), y: bytesToBig(cipher.subarray(1 + n, 1 + 2 * n)) };
  if (!onCurve(c, c1)) throw new Error('SM2 密文 C1 不在曲线上');
  const c3 = cipher.subarray(1 + 2 * n, 1 + 2 * n + 32);
  const c2 = cipher.subarray(1 + 2 * n + 32);
  const s = mul(c, d, c1)!;
  const x2 = bigToBytes(s.x, n), y2 = bigToBytes(s.y, n);
  const t = kdf(concat(x2, y2), c2.length);
  const m = c2.map((b, i) => b ^ t[i]);
  if (toHex(sm3(concat(x2, m, y2))) !== toHex(c3)) throw new Error('SM2 密文校验不通过');
  return m;
}

export const utf8 = (s: string) => new TextEncoder().encode(s);
export const fromUtf8 = (b: Uint8Array) => new TextDecoder().decode(b);
