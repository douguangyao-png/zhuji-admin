import { useEffect, useState } from 'react';
import { ago } from './format';

/** Re-renders every 30s so "5 min ago" keeps ticking without a page reload. */
export function RelativeTime({ iso }: { iso: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()}>
      {ago(seconds)}
    </time>
  );
}
