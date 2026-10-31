// 模拟后端的滑块验证码：前端用 canvas 画拼图，规则与后端的验证码校验一致（见 docs/接口约定.md）
import { captchaAutoPass, type CaptchaChallenge, type TrackPoint } from '../captcha';
import { ApiError, mock } from './router';
import { settings } from './services';

const W = 300, H = 150, P = 60, EDGE = 10, SIDE = 40, KNOB = 6.5, SHIFT = 2;
export const CAPTCHA_RULE = { tolerance: 4, ttlMs: 120_000, minDurationMs: 300, minPoints: 5, maxPoints: 600, minSpeedVariation: 0.15, maxKeyStep: 10 };

const answers = new Map<string, { x: number; exp: number }>();
const tokens = new Map<string, number>();
const failures = new Map<string, number>();
const rid = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/** 测试里查答案用 */
export const mockCaptchaAnswer = (id: string) => answers.get(id)?.x;

/** 方块四边：0 无、1 凸、2 凹；顺时针走一圈，凸凹用圆弧 */
function piecePath(): Path2D | null {
  if (typeof Path2D === 'undefined') return null;
  let kind: number[];
  do kind = [0, 1, 2, 3].map(() => rnd(0, 2)); while (kind.filter(Boolean).length < 2 || !kind.includes(1));
  const sides = [
    { s: [EDGE, EDGE], d: [1, 0], n: [0, -1] },
    { s: [EDGE + SIDE, EDGE], d: [0, 1], n: [1, 0] },
    { s: [EDGE + SIDE, EDGE + SIDE], d: [-1, 0], n: [0, 1] },
    { s: [EDGE, EDGE + SIDE], d: [0, -1], n: [-1, 0] },
  ];
  const p = new Path2D();
  const half = Math.sqrt(KNOB * KNOB - SHIFT * SHIFT);
  p.moveTo(EDGE, EDGE);
  sides.forEach(({ s, d, n }, i) => {
    if (kind[i]) {
      const a = SIDE * (0.38 + Math.random() * 0.24);
      const sign = kind[i] === 1 ? 1 : -1;
      const c = [s[0] + d[0] * a + n[0] * SHIFT * sign, s[1] + d[1] * a + n[1] * SHIFT * sign];
      const p1 = [s[0] + d[0] * (a - half), s[1] + d[1] * (a - half)];
      const p2 = [s[0] + d[0] * (a + half), s[1] + d[1] * (a + half)];
      p.lineTo(p1[0], p1[1]);
      p.arc(c[0], c[1], KNOB, Math.atan2(p1[1] - c[1], p1[0] - c[0]), Math.atan2(p2[1] - c[1], p2[0] - c[0]), kind[i] === 2);
    }
    p.lineTo(s[0] + d[0] * SIDE, s[1] + d[1] * SIDE);
  });
  p.closePath();
  return p;
}

/** 四种抽象底纹随机一种，再加噪声；jsdom 没有 canvas 时只返回位置 */
function draw(x: number, y: number) {
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  const g = bg.getContext('2d');
  const shape = piecePath();
  if (!g || !shape) return { image: '', piece: '' };
  const hue = rnd(0, 359);
  const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${(h + 360) % 360},${s}%,${l}%,${a})`;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, hsl(hue, 35, 45));
  grad.addColorStop(1, hsl(hue + 50, 40, 72));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const style = rnd(0, 3);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = hsl(hue + rnd(-40, 80), rnd(25, 55), rnd(30, 80), style === 0 ? 0.45 : 0.9);
    const cx = rnd(-20, W), cy = rnd(-20, H), r = rnd(8, 40);
    g.beginPath();
    if (style === 0) g.arc(cx, cy, r, 0, Math.PI * 2);
    else if (style === 1) { g.moveTo(cx, cy); g.lineTo(cx + r * 1.4, cy + rnd(-r, r)); g.lineTo(cx + rnd(-r, r), cy + r * 1.4); }
    else if (style === 2) g.rect(cx, cy, r * 1.3, rnd(6, 30));
    else g.ellipse(cx, cy, r * 1.6, r * 0.5, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = rnd(-10, 10);
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  const pc = document.createElement('canvas');
  pc.width = P; pc.height = P;
  const pg = pc.getContext('2d')!;
  pg.save();
  pg.clip(shape);
  pg.drawImage(bg, -x, -y);
  pg.restore();
  pg.lineWidth = 1.5;
  pg.strokeStyle = 'rgba(255,255,255,.9)';
  pg.stroke(shape);

  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.fill(shape);
  g.lineWidth = 1.2;
  g.strokeStyle = 'rgba(255,255,255,.65)';
  g.stroke(shape);
  return { image: bg.toDataURL('image/jpeg', 0.85), piece: pc.toDataURL('image/png') };
}

/** 与后端 TrackCheck.speedVariation 一致：不短于 40 毫秒的窗口算速度，取变异系数 */
export function speedVariation(track: TrackPoint[]) {
  let sum = 0, sq = 0, n = 0, from = 0;
  for (let i = 1; i < track.length; i++) {
    const dt = track[i][0] - track[from][0];
    if (dt < 40) continue;
    const v = Math.abs(track[i][1] - track[from][1]) / dt;
    sum += v; sq += v * v; n++; from = i;
  }
  if (n < 3 || sum === 0) return 0;
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sq / n - mean * mean)) / mean;
}

/** 通过返回 null，否则返回原因 */
export function trackReject(track: TrackPoint[] | undefined, x: number, keyboard: boolean) {
  const r = CAPTCHA_RULE;
  if (!Array.isArray(track) || track.length < (keyboard ? 2 : r.minPoints)) return '采样点过少';
  if (track.length > r.maxPoints) return '采样点过多';
  const first = track[0], last = track[track.length - 1];
  if (first[1] > 5) return '起点不在左端';
  if (Math.abs(last[1] - x) > 2) return '终点与提交位置不符';
  if (track.some((p, i) => i > 0 && p[0] < track[i - 1][0])) return '时间倒流';
  if (last[0] - first[0] < r.minDurationMs) return '用时过短';
  if (keyboard) return track.some((p, i) => i > 0 && Math.abs(p[1] - track[i - 1][1]) > r.maxKeyStep) ? '键盘单步过大' : null;
  return speedVariation(track) < r.minSpeedVariation ? '匀速移动' : null;
}

const userKey = (u: unknown) => String(u ?? '').trim().toLowerCase();

export function captchaRequired(username: unknown) {
  if (captchaAutoPass()) return false;
  const s = settings();
  const mode = s.loginCaptcha ?? 'always';
  if (mode === 'off') return false;
  if (mode !== 'after-failures') return true;
  return (failures.get(userKey(username)) ?? 0) >= (s.loginCaptchaAfter ?? 3);
}

/** 登录前调用：需要验证时凭证必须有效，用过即作废 */
export function checkLoginCaptcha(username: unknown, token: unknown) {
  if (!captchaRequired(username)) return;
  if (!token) throw new ApiError(422, '请先拖动滑块完成验证', { captchaRequired: true });
  const exp = tokens.get(String(token));
  tokens.delete(String(token));
  if (!exp || exp < Date.now()) throw new ApiError(422, '验证已过期，请重新拖动滑块', { captchaRequired: true });
}

export function onLoginFailure(username: unknown, e: unknown) {
  const k = userKey(username);
  failures.set(k, (failures.get(k) ?? 0) + 1);
  return e instanceof ApiError ? new ApiError(e.status, e.message, { captchaRequired: captchaRequired(username) }) : e;
}
export const onLoginSuccess = (username: unknown) => failures.delete(userKey(username));

/** 重置演示数据时一起清 */
export function resetMockCaptcha() { answers.clear(); tokens.clear(); failures.clear(); }

mock.open('POST', '/auth/captcha', (): CaptchaChallenge => {
  const x = rnd(P + 10, W - P - 6), y = rnd(6, H - P - 6);
  const id = rid();
  answers.set(id, { x, exp: Date.now() + CAPTCHA_RULE.ttlMs });
  return { captchaId: id, ...draw(x, y), y, width: W, height: H, pieceSize: P };
});

mock.open('POST', '/auth/captcha/verify', ({ body }) => {
  const a = answers.get(String(body.captchaId));
  answers.delete(String(body.captchaId));
  const x = Number(body.x);
  const ok = a && a.exp >= Date.now() && Math.abs(a.x - x) <= CAPTCHA_RULE.tolerance && !trackReject(body.track, x, body.input === 'keyboard');
  if (!ok) throw new ApiError(422, '验证未通过，请重试', { refresh: true });
  const token = rid();
  tokens.set(token, Date.now() + CAPTCHA_RULE.ttlMs);
  return { token };
});
