import { STORE } from '@/app.config';
import { useRef, useState } from 'react';

// 表格左侧名称列的拖动调宽：鼠标拖动或键盘左右方向键，宽度记在本机
export const COL_MIN = 120;
export const COL_MAX = 480;
export const COL_STEP = 16;
const KEY = `${STORE}.colWidth.`;
const clamp = (n: number) => Math.round(Math.max(COL_MIN, Math.min(COL_MAX, n)));
/** 本机存储不可用时留在内存里，本次打开仍能调 */
const mem = new Map<string, number>();
const read = (id: string): number | null => {
  if (mem.has(id)) return mem.get(id)!;
  try {
    const n = Number(localStorage.getItem(KEY + id));
    return n > 0 ? clamp(n) : null;
  } catch { return null; }
};

/** 某一列的宽度：本机记过的优先，没有就用 def（不受 120～480 限制，窄屏的默认值可以更窄） */
export function useColWidth(id: string, def: number): [number, (n: number) => void] {
  const [, bump] = useState(0);
  return [read(id) ?? def, (n: number) => {
    const v = clamp(n);
    try { localStorage.setItem(KEY + id, String(v)); } catch { mem.set(id, v); }
    bump((x) => x + 1);
  }];
}

/** 竖向拖动手柄，放在列的右边线上（父元素需是定位元素） */
export function ColResize({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [on, setOn] = useState(false);
  return (
    <div role="separator" tabIndex={0} aria-orientation="vertical" aria-valuenow={value} aria-valuemin={COL_MIN} aria-valuemax={COL_MAX} aria-label={label} title={`${label}：拖动或按左右方向键`}
      className={`col-rz${on ? ' on' : ''}`}
      onPointerDown={(e) => {
        if (e.button > 0) return;
        e.preventDefault();
        e.stopPropagation();
        drag.current = { x: e.clientX, w: value };
        setOn(true);
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 旧浏览器没有指针捕获 */ }
      }}
      onPointerMove={(e) => { const d = drag.current; if (d) onChange(d.w + e.clientX - d.x); }}
      onPointerUp={() => { drag.current = null; setOn(false); }}
      onPointerCancel={() => { drag.current = null; setOn(false); }}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowLeft' ? -COL_STEP : e.key === 'ArrowRight' ? COL_STEP : 0;
        if (!d) return;
        e.preventDefault();
        onChange(value + d);
      }} />
  );
}
