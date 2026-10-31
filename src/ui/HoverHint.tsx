import { useEffect, useRef, useState } from 'react';

/** One tooltip for every `.h-i` info icon: its title shows on hover or focus (mockup app.js tipShow). */
export function HoverHint() {
  const [tip, setTip] = useState<{ text: string; left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = (e: Event) => {
      const el = (e.target as HTMLElement).closest?.('.h-i') as HTMLElement | null;
      if (!el) return;
      if (el.title) { el.dataset.tip = el.title; el.setAttribute('aria-label', el.title); el.removeAttribute('title'); }
      if (!el.dataset.tip) return;
      anchor.current = el;
      const r = el.getBoundingClientRect();
      setTip({ text: el.dataset.tip, left: r.left + r.width / 2, top: r.bottom + 8 });
    };
    const hide = (e: Event) => { if ((e.target as HTMLElement).closest?.('.h-i')) setTip(null); };
    const off = () => setTip(null);
    document.addEventListener('mouseover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('mouseout', hide);
    document.addEventListener('focusout', hide);
    addEventListener('scroll', off, { passive: true });
    return () => {
      document.removeEventListener('mouseover', show);
      document.removeEventListener('focusin', show);
      document.removeEventListener('mouseout', hide);
      document.removeEventListener('focusout', hide);
      removeEventListener('scroll', off);
    };
  }, []);

  // keep it on screen once its size is known
  useEffect(() => {
    const el = ref.current, a = anchor.current;
    if (!tip || !el || !a) return;
    const r = a.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8))}px`;
    el.style.top = `${r.bottom + 8 + h > innerHeight ? r.top - h - 8 : r.bottom + 8}px`;
  }, [tip]);

  return tip ? <div ref={ref} className="h-tip" role="tooltip" style={{ left: tip.left, top: tip.top }}>{tip.text}</div> : null;
}
