import { useLocation, useNavigate } from 'react-router-dom';

export interface TabItem {
  key: string;
  label: string;
  count?: number | string;
}

interface TabsProps {
  items: TabItem[];
  value?: string;
  onChange?: (key: string) => void;
  /** Active tab is the URL hash instead of a controlled prop; needs a Router around it. */
  hash?: boolean;
}

/** Status categories on a list page are tabs, never a dropdown (project convention). */
export function Tabs(props: TabsProps) {
  return props.hash ? <HashTabs {...props} /> : <ControlledTabs {...props} />;
}

function HashTabs({ items, onChange }: TabsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const fromHash = location.hash.slice(1);
  const active = items.some((i) => i.key === fromHash) ? fromHash : items[0]?.key;
  const select = (key: string) => {
    navigate({ pathname: location.pathname, search: location.search, hash: `#${key}` }, { replace: true });
    onChange?.(key);
  };
  return <TabList items={items} active={active} onSelect={select} />;
}

function ControlledTabs({ items, value, onChange }: TabsProps) {
  return <TabList items={items} active={value} onSelect={(key) => onChange?.(key)} />;
}

function TabList({
  items,
  active,
  onSelect,
}: {
  items: TabItem[];
  active?: string;
  onSelect: (key: string) => void;
}) {
  // 方向键、Home、End 在页签间移动并选中；只有当前页签在 Tab 顺序里（roving tabindex）
  const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key) || items.length === 0) return;
    e.preventDefault();
    const cur = Math.max(0, items.findIndex((i) => i.key === active));
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : (cur + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onSelect(items[next].key);
    (e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next])?.focus();
  };
  return (
    <div className="tabs" role="tablist" onKeyDown={move}>
      {items.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          className={active === t.key ? 'tab on' : 'tab'}
          aria-selected={active === t.key}
          tabIndex={active === t.key || (active === undefined && t === items[0]) ? 0 : -1}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
          {t.count !== undefined && <span className="c">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
