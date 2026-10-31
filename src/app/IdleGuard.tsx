import { useEffect, useRef, useState } from 'react';
import { createIdleTimer, type IdleTimer } from '@/core/idle';
import { signOut, useSettings } from '@/core/me';
import { SECURITY_DEFAULTS } from '@/api/types';
import { Dialog } from '@/ui/Dialog';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/Toast';

const EVENTS = ['mousedown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;

/** 空闲超时：按「安全策略」里的分钟数，到点前 60 秒弹提示，到点自动退出 */
export function IdleGuard() {
  const minutes = useSettings().data?.idleMinutes ?? SECURITY_DEFAULTS.idleMinutes;
  const [left, setLeft] = useState<number | null>(null);
  const timer = useRef<IdleTimer | null>(null);

  useEffect(() => {
    const t = createIdleTimer(minutes, (ms) => setLeft(Math.round(ms / 1000)), () => {
      setLeft(null);
      toast(`已空闲 ${minutes} 分钟，自动退出`);
      void signOut();
    });
    timer.current = t;
    // 提示弹出后鼠标晃动不算，要点「继续使用」
    const touch = () => { if (!document.querySelector('[data-idle-warn]')) t.touch(); };
    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    return () => { t.stop(); EVENTS.forEach((e) => window.removeEventListener(e, touch)); };
  }, [minutes]);

  // 倒计时显示
  useEffect(() => {
    if (left === null || left <= 0) return;
    const t = setTimeout(() => setLeft((x) => (x === null ? null : x - 1)), 1000);
    return () => clearTimeout(t);
  }, [left]);

  if (left === null) return null;
  const keep = () => { setLeft(null); timer.current?.reset(); };
  return (
    <Dialog title="即将自动退出" size="sm" onClose={keep}
      footer={<>
        <button type="button" className="btn" onClick={() => void signOut()}><Icon name="logout" />现在退出</button>
        <button type="button" className="btn btn-p" onClick={keep}><Icon name="check" />继续使用</button>
      </>}>
      <p data-idle-warn>已经 {minutes} 分钟没有操作，{Math.max(0, left)} 秒后自动退出登录。</p>
    </Dialog>
  );
}
