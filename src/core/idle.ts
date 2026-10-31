// 空闲超时：一段时间没有键盘、鼠标、触摸操作就自动退出，退出前 60 秒提示，期间有操作或点「继续使用」就重新计时。
// 纯计时逻辑和页面分开，方便用假时钟测；分钟数来自「系统管理 › 安全策略」，0 为不自动退出

export const WARN_BEFORE_MS = 60_000;

/** touch：有操作（1 秒内只算一次）；reset：立即重新计时（如点「继续使用」）；stop：不再计时 */
export interface IdleTimer { touch: () => void; reset: () => void; stop: () => void }

/** onWarn(剩余毫秒) 在到点前 60 秒调一次；onTimeout 到点调一次；minutes ≤ 0 时什么都不做 */
export function createIdleTimer(minutes: number, onWarn: (leftMs: number) => void, onTimeout: () => void, clock: { now: () => number } = Date): IdleTimer {
  if (!(minutes > 0)) return { touch: () => {}, reset: () => {}, stop: () => {} };
  const total = minutes * 60_000;
  let warnT: ReturnType<typeof setTimeout> | undefined, doneT: ReturnType<typeof setTimeout> | undefined;
  let last = clock.now();
  const arm = () => {
    clearTimeout(warnT); clearTimeout(doneT);
    const warnIn = Math.max(0, total - WARN_BEFORE_MS);
    warnT = setTimeout(() => onWarn(Math.min(WARN_BEFORE_MS, total)), warnIn);
    doneT = setTimeout(onTimeout, total);
  };
  arm();
  return {
    // 操作很频繁时 1 秒内只重排一次
    touch: () => { const t = clock.now(); if (t - last < 1000) return; last = t; arm(); },
    reset: () => { last = clock.now(); arm(); },
    stop: () => { clearTimeout(warnT); clearTimeout(doneT); },
  };
}
