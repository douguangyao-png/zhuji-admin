import * as RD from '@radix-ui/react-dialog';
import { useRef, type ReactNode } from 'react';
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
  const opener = useRef<HTMLElement | null>(null);
  // 焦点陷阱、Esc（只关最上层）、关闭后焦点还原、aria 标记由 Radix 提供；外观沿用 .scrim / .dialog
  return (
    <RD.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <RD.Portal>
        <RD.Overlay className="scrim" />
        <RD.Content
          tabIndex={-1}
          {...(sub ? {} : { 'aria-describedby': undefined })}
          className={`dialog${size ? ` ${size}` : ''} ${className}`.trim()}
          style={style}
          onOpenAutoFocus={(e) => {
            // 保持原行为：页面里写了 autoFocus 的元素优先，否则焦点落在弹窗容器，而不是右上角的关闭钮
            e.preventDefault();
            opener.current = document.activeElement as HTMLElement | null;
            const el = e.currentTarget as HTMLElement;
            if (!el.contains(document.activeElement)) el.focus();
          }}
          onCloseAutoFocus={(e) => { e.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); }}
        >
          <div className="dlg-h">
            <div>
              <RD.Title asChild><h3>{title}</h3></RD.Title>
              {sub && <RD.Description asChild><p>{sub}</p></RD.Description>}
            </div>
            <button type="button" className="btn btn-g btn-sm btn-ic dlg-x" aria-label="关闭" title="关闭" onClick={onClose}><Icon name="x" /></button>
          </div>
          {children !== undefined && <div className="dlg-b">{children}</div>}
          {footer && <div className="dlg-f">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
