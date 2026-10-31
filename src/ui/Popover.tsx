import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** An anchored `.pop` (mockup app.js togglePop): below the anchor, flipped left or up when it would overflow. */
export function Popover({ anchor, open, onClose, children, className = '', role, label }: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  role?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor.current || !ref.current) return;
    const r = anchor.current.getBoundingClientRect();
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight;
    const left = r.left + w > innerWidth - 12 ? r.right - w : r.left;
    const up = r.bottom + 6 + h > innerHeight && r.top > h + 6;
    setPos({ left: Math.max(8, left), top: up ? r.top - h - 6 : r.bottom + 6 });
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', down);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', down); };
  }, [open, onClose, anchor]);

  if (!open) return null;
  // 挂到 body：顶栏的 backdrop-filter 会让 fixed 相对顶栏定位，菜单被推出视口
  return createPortal(
    <div ref={ref} className={`pop ${className}`.trim()} role={role} aria-label={label} style={{ position: 'fixed', left: pos.left, top: pos.top }}>
      {children}
    </div>,
    document.body,
  );
}

/** Open state plus the anchor ref, for a button that toggles a Popover. */
export function usePop() {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return { anchor, open, toggle: () => setOpen((o) => !o), show: () => setOpen(true), close: () => setOpen(false) };
}
