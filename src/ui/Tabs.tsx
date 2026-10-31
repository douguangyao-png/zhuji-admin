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
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          className={active === t.key ? 'tab on' : 'tab'}
          aria-selected={active === t.key}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
          {t.count !== undefined && <span className="c">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
