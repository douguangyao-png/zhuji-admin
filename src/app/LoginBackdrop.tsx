import { isDark, type Theme } from '@/lib/theme';
import { useEffect, useRef } from 'react';

type Kind = 'center' | 'dept' | 'unit';
interface Node { kind: Kind; label?: string; ax: number; ay: number; x: number; y: number; amp: number; w: number; ph: number }
interface Link { a: Node; b: Node; dashed: boolean }
interface Pulse { l: Link; t0: number; dur: number; up: boolean }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const LEFT = ['办公室', '人力资源', '财务', '采购', '法务'];
const RIGHT = ['信息中心', '业务一部', '业务二部', '后勤保障', '市场'];
/** 部门之间的协作关系，左右两簇各画一半 */
const PAIRS: [string, string][] = [
  ['办公室', '信息中心'], ['办公室', '业务一部'], ['办公室', '后勤保障'],
  ['人力资源', '财务'], ['人力资源', '业务二部'], ['采购', '财务'],
  ['采购', '后勤保障'], ['市场', '业务一部'], ['市场', '业务二部'], ['法务', '市场'],
];

/** 登录页背景：平台的部门关系网，中心连到各部门，协作部门之间用虚线相连；数据脉冲沿线流动 */
export function LoginBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    let cx: CanvasRenderingContext2D | null = null;
    try { cx = cv?.getContext('2d') ?? null; } catch { return; }
    if (!cv || !cx) return;
    const rm = matchMedia('(prefers-reduced-motion: reduce)');
    let W = 0, H = 0, raf = 0, lastPulse = 0, rz = 0;
    let nodes: Node[] = [], links: Link[] = [], pulses: Pulse[] = [];
    let col = { line: '', dev: '', mid: '', top: '', acc: '', bg: '', lineA: 0, nodeA: 0 };
    const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const colors = () => {
      const light = !isDark(document.documentElement.dataset.theme as Theme);
      col = { line: css('--line-3'), dev: css('--fg-4'), mid: css('--fg-3'), top: css('--fg-2'), acc: css('--accent'), bg: css('--bg'),
        lineA: light ? 0.55 : 0.4, nodeA: light ? 0.6 : 0.55 };
    };

    const build = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes = []; links = []; pulses = [];
      const add = (kind: Kind, x: number, y: number, label?: string, amp = 5): Node => {
        const n = { kind, label, ax: x, ay: y, x, y, amp, w: rnd(0.0001, 0.00028), ph: rnd(0, 7) };
        nodes.push(n);
        return n;
      };
      const link = (a: Node, b: Node, dashed = false) => links.push({ a, b, dashed });
      // 左右两簇部门，避开中间的登录卡片
      const narrow = W < 760;
      const cluster = (names: string[], fx: number) => names.slice(0, narrow ? 3 : names.length).map((name, i, all) =>
        add('dept', fx * W + rnd(-0.025, 0.025) * W, H * (0.3 + i * 0.4 / Math.max(1, all.length - 1)) + rnd(-0.02, 0.02) * H, name));
      const left = cluster(LEFT, 0.14);
      const right = cluster(RIGHT, 0.86);
      const center = add('center', W * 0.5, H * 0.1, '统一平台', 4);
      [...left, ...right].forEach((n) => link(center, n));
      const byName = new Map([...left, ...right].filter((n) => n.label).map((n) => [n.label!, n]));
      PAIRS.forEach(([a, b]) => {
        const x = byName.get(a), y = byName.get(b);
        if (x && y) link(x, y, true);
      });
      // 每个部门下面挂几个终端点
      [...left, ...right].forEach((n) => {
        for (let k = 0; k < (narrow ? 1 : 2); k++) {
          const a = rnd(0, Math.PI * 2), d = rnd(38, 90);
          link(n, add('unit', n.ax + Math.cos(a) * d, n.ay + Math.sin(a) * d * 0.8, undefined, 7), true);
        }
      });
    };

    const icon = (n: Node) => {
      const { x, y } = n;
      cx.beginPath();
      if (n.kind === 'center') {
        cx.arc(x, y, 9, 0, 7); cx.stroke();
        cx.beginPath(); cx.arc(x, y, 4.5, 0, 7); cx.fill();
      } else if (n.kind === 'dept') {
        cx.arc(x, y, 5, 0, 7); cx.fill(); cx.stroke();
        cx.beginPath(); cx.arc(x, y, 8.5, 0, 7); cx.globalAlpha *= 0.5; cx.stroke(); cx.globalAlpha /= 0.5;
      } else {
        cx.arc(x, y, 2.2, 0, 7); cx.fill();
      }
    };

    const draw = (t: number) => {
      cx.clearRect(0, 0, W, H);
      nodes.forEach((n) => { n.x = n.ax + Math.sin(t * n.w + n.ph) * n.amp; n.y = n.ay + Math.cos(t * n.w * 0.8 + n.ph) * n.amp; });
      cx.globalAlpha = col.lineA; cx.strokeStyle = col.line; cx.lineWidth = 1;
      for (const dashed of [false, true]) {
        cx.setLineDash(dashed ? [2, 5] : []); cx.beginPath();
        links.forEach((l) => { if (l.dashed === dashed) { cx.moveTo(l.a.x, l.a.y); cx.lineTo(l.b.x, l.b.y); } });
        cx.stroke();
      }
      cx.setLineDash([]);
      nodes.forEach((n) => {
        cx.globalAlpha = n.kind === 'unit' ? col.nodeA * 0.7 : col.nodeA;
        cx.strokeStyle = n.kind === 'center' ? col.top : n.kind === 'dept' ? col.mid : col.dev;
        cx.fillStyle = n.kind === 'unit' ? col.dev : col.bg;
        cx.lineWidth = 1.2;
        icon(n);
      });
      // 部门名称
      cx.globalAlpha = col.nodeA * 0.9; cx.fillStyle = col.mid;
      cx.font = `500 ${W < 760 ? 10 : 11}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      cx.textBaseline = 'middle';
      nodes.forEach((n) => {
        if (!n.label) return;
        const right = n.x > W * 0.7;
        cx.textAlign = right ? 'right' : 'left';
        cx.fillText(n.label, n.x + (right ? -13 : 13), n.y + 1);
      });
      cx.textAlign = 'left';
      cx.globalAlpha = 1;
      if (!rm.matches && links.length) {
        if (t - lastPulse > 170) { lastPulse = t; pulses.push({ l: pick(links), t0: t, dur: rnd(1500, 3400), up: Math.random() < 0.6 }); }
        pulses = pulses.filter((p) => t - p.t0 < p.dur);
        cx.fillStyle = col.acc;
        pulses.forEach((p) => {
          const k = (t - p.t0) / p.dur, [a, b] = p.up ? [p.l.b, p.l.a] : [p.l.a, p.l.b];
          cx.globalAlpha = Math.sin(k * Math.PI) * 0.8;
          cx.beginPath(); cx.arc(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 1.8, 0, 7); cx.fill();
        });
      }
      cx.globalAlpha = 1;
    };

    const loop = (t: number) => { draw(t); raf = requestAnimationFrame(loop); };
    const start = () => { cancelAnimationFrame(raf); raf = 0; draw(rm.matches ? 0 : performance.now()); if (!rm.matches && !document.hidden) raf = requestAnimationFrame(loop); };
    const resize = () => { clearTimeout(rz); rz = window.setTimeout(() => { build(); start(); }, 120); };
    colors(); build(); start();
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', start);
    rm.addEventListener?.('change', start);
    const mo = new MutationObserver(() => { colors(); if (rm.matches) draw(0); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      cancelAnimationFrame(raf); clearTimeout(rz); mo.disconnect();
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', start);
      rm.removeEventListener?.('change', start);
    };
  }, []);

  return <canvas ref={ref} className="lg-bg" aria-hidden="true" />;
}
