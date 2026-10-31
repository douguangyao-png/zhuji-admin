import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/** The v2 `.dialog` shell for hand-written dialogs: header, body, footer, Esc and the scrim close it. */
export function Dialog({ title, sub, size, onClose, footer, children, className = '', style }: {
  title: ReactNode;
  sub?: ReactNode;
  /** xl：一行要放规则列表等宽内容时用（编辑审批流） */
  size?: 'sm' | 'lg' | 'xl';
  onClose: () => void;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className={`dialog${size ? ` ${size}` : ''} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={id} style={style}>
        <div className="dlg-h">
          <div><h3 id={id}>{title}</h3>{sub && <p>{sub}</p>}</div>
          <button type="button" className="btn btn-g btn-sm btn-ic dlg-x" aria-label="关闭" title="关闭" onClick={onClose}><Icon name="x" /></button>
        </div>
        {children !== undefined && <div className="dlg-b">{children}</div>}
        {footer && <div className="dlg-f">{footer}</div>}
      </div>
    </>
  );
}
