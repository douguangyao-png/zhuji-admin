import { fromHex, fromUtf8, generateKeyPair, mul, onCurve, parsePublicKey, publicKeyHex, SM2P256V1, sm2Decrypt, sm2Encrypt, sm3, toHex, utf8, type Curve } from './sm2';

const h = (s: string) => BigInt(`0x${s.replace(/\s+/g, '')}`);

test('SM3：GB/T 32905 附录 A 两个示例', () => {
  expect(toHex(sm3(utf8('abc')))).toBe('66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0');
  expect(toHex(sm3(utf8('abcd'.repeat(16))))).toBe('debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732');
});

// GB/T 32918.4 附录 A.2：Fp-256 示例曲线、明文 "encryption standard"、固定 k
const TEST_CURVE: Curve = {
  p: h('8542D69E 4C044F18 E8B92435 BF6FF7DE 45728391 5C45517D 722EDB8B 08F1DFC3'),
  a: h('787968B4 FA32C3FD 2417842E 73BBFEFF 2F3C848B 6831D7E0 EC65228B 3937E498'),
  b: h('63E4C6D3 B23B0C84 9CF84241 484BFE48 F61D59A5 B16BA06E 6E12D1DA 27C5249A'),
  n: h('8542D69E 4C044F18 E8B92435 BF6FF7DD 29772063 0485628D 5AE74EE7 C32E79B7'),
  gx: h('421DEBD6 1B62EAB6 746434EB C3CC315E 32220B3B ADD50BDC 4C4E6C14 7FEDD43D'),
  gy: h('0680512B CBB42C07 D47349D2 153B70C4 E5D7FDFC BFA36EA1 A85841B9 E46E09A2'),
  size: 32,
};
const DB = h('1649AB77 A00637BD 5E2EFE28 3FBF3535 34AA7F7C B89463F2 08DDBC29 20BB0DA0');
const PB = { x: h('435B39CC A8F3B508 C1488AFC 67BE491A 0F7BA07E 581A0E48 49A5CF70 628A7E0A'), y: h('75DDBA78 F15FEECB 4C7895E2 C1CDF5FE 01DEBB2C DBADF453 99CCF77B BA076A42') };
const K = h('4C62EEFD 6ECFC2B9 5B92FD6C 3D957514 8AFA1742 5546D490 18E5388D 49DD7B4F');
const STANDARD_CIPHER = '04'
  + '245C26FB68B1DDDDB12C4B6BF9F2B6D5FE60A383B0D18D1C4144ABF17F6252E7'
  + '76CB9264C2A7E88E52B19903FDC47378F605E36811F5C07423A24B84400F01B8'
  + '9C3D7360C30156FAB7C80A0276712DA9D8094A634B766D3A285E07480653426D'
  + '650053A89B41C418B0C3AAD00D886C00286467';

test('SM2 加密：GB/T 32918.4 附录 A.2 测试向量（C1C3C2）逐字节一致，私钥能解回', () => {
  const G = { x: TEST_CURVE.gx, y: TEST_CURVE.gy };
  expect(onCurve(TEST_CURVE, G)).toBe(true);
  expect(mul(TEST_CURVE, DB, G)).toEqual(PB);
  const c = sm2Encrypt(PB, utf8('encryption standard'), TEST_CURVE, K);
  expect(toHex(c).toUpperCase()).toBe(STANDARD_CIPHER);
  expect(fromUtf8(sm2Decrypt(DB, fromHex(STANDARD_CIPHER), TEST_CURVE))).toBe('encryption standard');
});

test('sm2p256v1：基点在曲线上、[n]G 为无穷远点；随机密钥 200 次加解密往返，篡改一字节即拒绝', () => {
  const G = { x: SM2P256V1.gx, y: SM2P256V1.gy };
  expect(onCurve(SM2P256V1, G)).toBe(true);
  expect(mul(SM2P256V1, SM2P256V1.n, G)).toBeNull();
  const { privateKey, publicKey } = generateKeyPair();
  const pub = parsePublicKey(publicKeyHex(publicKey));
  for (let i = 0; i < 200; i++) {
    const m = globalThis.crypto.getRandomValues(new Uint8Array(1 + (i % 97)));
    const c = sm2Encrypt(pub, m);
    expect(c.length).toBe(97 + m.length);
    expect(toHex(sm2Decrypt(privateKey, c))).toBe(toHex(m));
  }
  expect(() => sm2Encrypt(pub, new Uint8Array(0))).toThrow('明文不能为空');
  const c = sm2Encrypt(pub, utf8('Abc-123 密码'));
  c[c.length - 1] ^= 1;
  expect(() => sm2Decrypt(privateKey, c)).toThrow('校验不通过');
});

/** 前端加密、后端解密的互通样本：SM2_SAMPLES=路径 时生成，后端 Sm2InteropTest 用 BouncyCastle 解 */
test('生成前端加密样本（标准向量 + 随机样本）', async () => {
  const out = process.env.SM2_SAMPLES;
  const n = Number(process.env.SM2_SAMPLE_COUNT || 0);
  if (!out) return;
  const { privateKey, publicKey } = generateKeyPair();
  const alphabet = 'ABCDEFGHabcdefgh0123456789!@#$%^&*()-_=+[]{};:,.<>/?~ 中文密码验证码';
  const samples = Array.from({ length: n }, (_, i) => {
    const len = 1 + (i % 40);
    const plain = Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    const env = i % 2 ? JSON.stringify({ password: plain, n: toHex(globalThis.crypto.getRandomValues(new Uint8Array(16))), t: Date.now() }) : plain;
    return { plain: env, cipher: toHex(sm2Encrypt(publicKey, utf8(env))) };
  });
  const fs = await import('node:fs');
  fs.writeFileSync(out, JSON.stringify({ privateKey: privateKey.toString(16).padStart(64, '0'), publicKey: publicKeyHex(publicKey),
    standard: { cipher: STANDARD_CIPHER, plain: 'encryption standard' }, samples }, null, 1));
});
