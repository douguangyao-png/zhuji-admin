import { useEffect, useRef, useState, type PointerEvent } from 'react';
import './signature.css';
import { Icon } from '@/ui/Icon';

/** 测试环境（jsdom）没有画布时用的 1×1 白色 PNG */
const BLANK_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const blankBlob = () => new Blob([Uint8Array.from(atob(BLANK_PNG), (c) => c.charCodeAt(0))], { type: 'image/png' });

/**
 * 手写签名：指针事件画线，触屏、鼠标、手写笔都能用。
 * 给了 upload 时，停笔片刻把 PNG 交给它上传，onChange 拿到附件 id；不给时 onChange 拿到 data URL。
 * 重签清空并回传空串。
 */
export function SignaturePad({ label, value, onChange, upload, height = 140 }: {
  label: string; value?: string; onChange: (v: string) => void;
  upload?: (png: Blob) => Promise<string>; height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const round = useRef(0);
  const [inked, setInked] = useState(Boolean(value));
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const noCanvas = typeof document !== 'undefined' && !document.createElement('canvas').getContext('2d');

  useEffect(() => {
    const c = ref.current; const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = (r.width || 300) * dpr; c.height = (r.height || height) * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b2a4a';
  }, [height]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const save = async (png: Blob | null, dataUrl: string) => {
    const mine = ++round.current;
    if (!upload) { onChange(dataUrl); return; }
    if (!png) { setState('error'); return; }
    setState('saving');
    try {
      const id = await upload(png);
      // 上传途中又画了或点了重签，以最后一次为准
      if (mine === round.current) { onChange(id); setState('idle'); }
    } catch {
      if (mine === round.current) setState('error');
    }
  };
  const flush = () => {
    const c = ref.current; if (!c) return;
    const url = c.toDataURL('image/png');
    if (upload) c.toBlob((b) => void save(b, url), 'image/png'); else void save(null, url);
  };

  const pos = (e: PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d'); if (!ctx) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    window.clearTimeout(timer.current);
    round.current++;
    drawing.current = true;
    const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke();
    if (!inked) setInked(true);
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    // 一个字常要好几笔，停笔 600 毫秒再导出，免得每一笔都上传一次
    timer.current = window.setTimeout(flush, upload ? 600 : 0);
  };
  const clear = () => {
    window.clearTimeout(timer.current);
    round.current++;
    const c = ref.current; const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setInked(false); setState('idle'); onChange('');
  };
  const fake = () => { setInked(true); void save(blankBlob(), `data:image/png;base64,${BLANK_PNG}`); };

  const status = state === 'saving' ? '保存中…' : state === 'error' ? '没保存上，请重签' : value ? '已签' : inked ? '' : '在框内手写';
  return (
    <div className="sig-pad">
      <div className="sig-pad-h">
        <span>{label}</span>
        <span className={`sig-pad-s${state === 'error' ? ' bad' : value ? ' ok' : ''}`} aria-live="polite">{status}</span>
        <button type="button" className="btn btn-xs btn-g" onClick={clear}><Icon name="refresh" />重签</button>
      </div>
      {noCanvas ? (
        <button type="button" className="sig-pad-c sig-pad-fb" style={{ height }} onClick={fake}>{value ? '已签' : '点击签名'}</button>
      ) : (
        <canvas ref={ref} className="sig-pad-c" style={{ height }} aria-label={`${label}签名区`}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      )}
    </div>
  );
}
