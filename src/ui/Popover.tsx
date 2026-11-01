import * as RP from '@radix-ui/react-popover';
import { useRef, useState, type ReactNode, type RefObject } from 'react';

/** An anchored `.pop`: below the anchor, Radix flips and shifts it to stay in view. Esc, outside click and focus return come from Radix. */
export function Popover({ anchor, open, onClose, children, className = '', role, label }: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  role?: string;
  label?: string;
}) {
  // 挂到 body（Portal）：顶栏的 backdrop-filter 会让 fixed 相对顶栏定位，菜单被推出视口
  return (
    <RP.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <RP.Anchor virtualRef={anchor as RefObject<HTMLElement>} />
      <RP.Portal>
        <RP.Content
          className={`pop ${className}`.trim()}
          role={role}
          aria-label={label}
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          style={{ position: 'relative' }}
          // 点到锚点按钮上不当作「点外面」，由按钮自己的开关处理，否则会关了又开
          // 非模态的 Radix 弹层只会把焦点还给 Trigger；这里用 Anchor，所以自己还：焦点丢了（落在 body）才还给锚点，用户点了别处就不抢
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const a = document.activeElement;
            if (!a || a === document.body) anchor.current?.focus();
          }}
          onInteractOutside={(e) => { if (anchor.current?.contains(e.target as Node)) e.preventDefault(); }}
        >
          {children}
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  );
}

/** Open state plus the anchor ref, for a button that toggles a Popover. */
export function usePop() {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return { anchor, open, toggle: () => setOpen((o) => !o), show: () => setOpen(true), close: () => setOpen(false) };
}
