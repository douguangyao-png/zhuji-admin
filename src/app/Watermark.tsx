import { useEffect, useState } from 'react';
import { useMeSure, useSettings } from '@/core/me';
import { now, stamp } from '@/lib/time';

/**
 * 页面水印：登录后整页叠一层「账号 + 时间」，不挡点击；「系统管理 › 安全策略」里可关。
 * 只能提醒和追溯截图来源，挡不住有意的拍照或改页面，敏感数据仍以权限控制为准
 */
export function Watermark() {
  const me = useMeSure();
  const on = useSettings().data?.watermark !== false;
  const [at, setAt] = useState(() => stamp(now()).slice(0, 16));
  useEffect(() => { const t = setInterval(() => setAt(stamp(now()).slice(0, 16)), 60_000); return () => clearInterval(t); }, []);
  if (!on) return null;
  const text = `${me.user.username} ${me.user.name} ${at}`;
  return (
    <div className="watermark" aria-hidden="true" data-text={text}>
      {Array.from({ length: 24 }, (_, i) => <span key={i}>{text}</span>)}
    </div>
  );
}
