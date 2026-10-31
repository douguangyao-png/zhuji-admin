import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Popover, usePop } from './Popover';

export interface MenuItem { label: string; icon: IconName; to?: string; onClick?: () => void; danger?: boolean; disabled?: string; sep?: boolean }

const item = { width: '100%', border: 0, background: 'none' };

/** The row's "More" button and its `.pop` menu (mockup pop-model / pop-tpl / pop-rule). */
export function RowMenu({ items, className = 'btn btn-xs btn-g btn-ic' }: { items: MenuItem[]; className?: string }) {
  const pop = usePop();
  return (
    <>
      <button type="button" ref={pop.anchor} className={className} aria-label="更多" aria-haspopup="menu" onClick={pop.toggle}><Icon name="more" /></button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} role="menu">
        {items.map((m) => (
          <div key={m.label} style={{ display: 'contents' }}>
            {m.sep && <div className="pop-sep" />}
            {m.to ? (
              <Link className="pop-i" role="menuitem" to={m.to} onClick={pop.close}><Icon name={m.icon} />{m.label}</Link>
            ) : (
              <button type="button" className="pop-i" role="menuitem" disabled={Boolean(m.disabled)} title={m.disabled || undefined}
                style={{ ...item, ...(m.danger ? { color: 'var(--crit-text)' } : {}), ...(m.disabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
                onClick={() => { pop.close(); m.onClick?.(); }}>
                <Icon name={m.icon} />{m.label}
              </button>
            )}
          </div>
        ))}
      </Popover>
    </>
  );
}
