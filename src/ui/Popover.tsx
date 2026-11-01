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
