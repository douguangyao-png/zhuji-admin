import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { captchaApi, type CaptchaChallenge, type CaptchaInput, type TrackPoint } from '@/api/captcha';
import { ApiError } from '@/api/http';
import { Icon } from '@/ui/Icon';

type State = 'idle' | 'drag' | 'check' | 'pass' | 'fail';
const STEP = 2, BIG_STEP = 10;

/** 登录滑块：拖动或用方向键把拼图块移到缺口，松手（或回车）交给服务端校验；答案不在前端 */
export function SliderCaptcha({ onPass }: { onPass: (token: string) => void }) {
  const [c, setC] = useState<CaptchaChallenge | null>(null);
  const [pos, setPos] = useState(0);
  const [state, setState] = useState<State>('idle');
  const [msg, setMsg] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const drag = useRef({ x0: 0, p0: 0, t0: 0, input: 'pointer' as CaptchaInput, track: [] as TrackPoint[] });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hintId = useId();

  const load = useCallback(async () => {
    clearTimeout(timer.current);
    setState('idle'); setPos(0); setMsg('');
    try { setC(await captchaApi.challenge()); } catch (e) { setC(null); setMsg((e as Error).message); }
  }, []);
  useEffect(() => { void load(); return () => clearTimeout(timer.current); }, [load]);

  const max = c ? c.width - c.pieceSize : 0;
  const clamp = (x: number) => Math.max(0, Math.min(max, x));
  const now = () => Math.round(performance.now() - drag.current.t0);
  const busy = !c || state === 'check' || state === 'pass' || state === 'fail';

  const begin = (input: CaptchaInput, x0: number) => {
    drag.current = { x0, p0: pos, t0: performance.now(), input, track: [[0, Math.round(pos)]] };
  };
  const record = (x: number, force = false) => {
    const t = drag.current.track;
    const at = now();
    if (t.length < 590 && (force || at - t[t.length - 1][0] >= 8)) t.push([at, Math.round(x)]);
  };

  const submit = async (x: number) => {
    if (!c) return;
    setState('check');
    try {
      const { token } = await captchaApi.verify({ captchaId: c.captchaId, x: Math.round(x), track: drag.current.track, input: drag.current.input });
      setState('pass');
      setMsg('验证通过');
      onPass(token);
    } catch (e) {
      const retry = e instanceof ApiError && e.status === 422;
      setState('fail');
      setMsg(retry ? '没对准，已换一张' : (e as Error).message);
      if (retry) timer.current = setTimeout(() => { void load().then(() => setMsg('没对准，已换一张')); }, 500);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy || e.button > 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    begin('pointer', e.clientX);
    setState('drag');
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (state !== 'drag' || !c) return;
    const scale = (box.current?.getBoundingClientRect().width || c.width) / c.width;
    const x = clamp(drag.current.p0 + (e.clientX - drag.current.x0) / scale);
    setPos(x);
    record(x);
  };
  const onPointerUp = () => {
    if (state !== 'drag') return;
    if (pos < 3) { setState('idle'); setPos(0); return; } // 只是点了一下
    record(pos, true);
    void submit(pos);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (busy) return;
    const step = e.shiftKey ? BIG_STEP : STEP;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
    if (d) {
      e.preventDefault();
      if (drag.current.input !== 'keyboard' || state === 'idle' && pos === 0) begin('keyboard', 0);
      const x = clamp(pos + d);
      setPos(x);
      record(x, true);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (pos >= 3 && drag.current.input === 'keyboard') void submit(pos);
    }
  };

  const pct = (v: number) => `${c ? (v / c.width) * 100 : 0}%`;
  // 提示放在滑块左右空间大的一边，滑块停在右半边时不被挤掉
  const textSide = c && pos > c.width * 0.4 ? { left: 8, right: `calc(100% - ${pct(pos)} + 8px)` } : { left: `calc(${pct(pos)} + 52px)` };
  const text = state === 'check' ? '正在校验…' : msg || '按住滑块向右拖，把拼图移到缺口处';

  return (
    <div className="scap" data-state={state}>
      <div className="scap-img" ref={box}>
        {c?.image ? <img src={c.image} alt="滑块验证图片" draggable={false} /> : <div className="scap-ph">{c ? '' : msg || '正在加载…'}</div>}
        {c?.piece && <img className="scap-piece" src={c.piece} alt="" draggable={false} style={{ left: pct(pos), top: `${(c.y / c.height) * 100}%`, width: pct(c.pieceSize) }} />}
        {state !== 'pass' && (
          <button type="button" className="scap-refresh" aria-label="换一张" title="换一张" disabled={state === 'check'} onClick={() => void load()}><Icon name="refresh" /></button>
        )}
      </div>
      <div className="scap-bar" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { if (state === 'drag') { setState('idle'); setPos(0); } }}>
        <div className="scap-fill" style={{ width: `calc(${pct(pos)} + 22px)` }} />
        <span className="scap-text" aria-hidden="true" style={textSide}>{state === 'drag' ? '' : text}</span>
        <div ref={knob} className="scap-knob" role="slider" tabIndex={0} aria-label="拼图滑块" aria-describedby={hintId}
          aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(pos)} aria-valuetext={`向右 ${Math.round(pos)} 像素`} aria-disabled={busy || undefined}
          style={{ left: pct(pos) }} onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
          <Icon name={state === 'pass' ? 'check' : 'arrow'} />
        </div>
      </div>
      <p id={hintId} className="sr-only">方向键移动拼图，按住 Shift 每次移动 10 像素，对准后按回车提交</p>
      <p className="sr-only" role="status" aria-live="polite">{state === 'pass' || state === 'fail' || (msg && !c) ? text : ''}</p>
    </div>
  );
}
