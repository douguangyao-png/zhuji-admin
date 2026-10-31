import type { CSSProperties } from 'react';

// same hue hash as the mockup's hydrate(), so a name keeps its colour everywhere
export const hue = (s: string): number => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const initials = (s: string): string => s.split(' ').map((w) => w[0]).join('').slice(0, 2);

export function Avatar({ text, seed, className = '' }: { text: string; seed?: string; className?: string }) {
  return <span className={`av ${className}`.trim()} style={{ '--h': String(hue(seed ?? text)) } as CSSProperties}>{text}</span>;
}
