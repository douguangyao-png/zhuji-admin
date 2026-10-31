import type { ReactNode } from 'react';
import { Icon } from '@/ui/Icon';
import { Select } from '@/ui/Select';
import { Popover, usePop } from '@/ui/Popover';
import { usePageTitle } from './menu-names';

export function PageHead({ title, sub, acts, crumb }: { title: ReactNode; sub?: ReactNode; acts?: ReactNode; crumb?: ReactNode }) {
  const t = usePageTitle(title) as ReactNode;
  return (
    <div className="ph">
      <div>{crumb && <div className="sub">{crumb}</div>}<h1>{t}</h1>{sub && <div className="sub">{sub}</div>}</div>
      {acts && <div className="acts">{acts}</div>}
    </div>
  );
}

/** 多选查询条件：值为逗号分隔，空串为全部 */
export const inSel = (sel: string, v: string | undefined) => !sel || (v != null && sel.split(',').includes(v));

/** 带放大镜的关键字搜索框 */
export function Search({ value, onChange, placeholder = '搜索', width = 240 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  return (
    <label className="in-ic" style={{ width }}>
      <Icon name="search" />
      <input className="input" value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** 带标签的下拉筛选：选中后一眼看得出是哪个条件；点开可输入筛选。all 为 null 时没有「全部」，总有一项选中 */
export function SelectFilter({ label, value, options, onChange, all = '全部', ariaLabel, multi }: {
  label: string; value: string; options: (string | { value: string; label: string })[]; onChange: (v: string) => void; all?: string | null; ariaLabel?: string;
  /** 多选：值用逗号连接，空串为全部 */
  multi?: boolean;
}) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  if (multi) return <MultiFilter label={label} value={value} options={opts} onChange={onChange} all={all} ariaLabel={ariaLabel} />;
  return (
    <span className={`sel-f${value || all === null ? ' on' : ''}`} onClick={(e) => {
      // 点标签文字也打开；下拉列表挂在 body 上，它的点击经 React 冒泡过来时不算
      const t = e.target as HTMLElement;
      if (e.currentTarget.contains(t) && !t.closest('button')) e.currentTarget.querySelector<HTMLButtonElement>('.sel-btn')?.click();
    }}>
      <span className="k">{label}</span>
      <Select className="sel-f-b" value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel ?? label}>
        {all !== null && <option value="">{all}</option>}
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </span>
  );
}

/** 查询条件多选：勾选多项按逗号传，空为全部 */
function MultiFilter({ label, value, options, onChange, all, ariaLabel }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; all: string | null; ariaLabel?: string;
}) {
  const pop = usePop();
  const sel = value ? value.split(',').filter(Boolean) : [];
  const toggle = (v: string) => {
    const next = sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v];
    onChange(next.join(','));
  };
  return (
    <span className={`sel-f${sel.length ? ' on' : ''}`}>
      <span className="k">{label}</span>
      <button type="button" ref={pop.anchor} className="input sel-f-b sel-multi" aria-label={ariaLabel ?? label} aria-expanded={pop.open} onClick={pop.toggle}>
        {sel.length ? `已选 ${sel.length} 项` : all ?? '请选择'}<Icon name="down" />
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} label={`${label}多选`}>
        <div className="ms-list">
          {all !== null && <button type="button" className="ms-i" onClick={() => { onChange(''); pop.close(); }}><span className={sel.length ? '' : 'on'}>全部</span></button>}
          {options.map((o) => (
            <label key={o.value} className="ms-i"><input type="checkbox" checked={sel.includes(o.value)} onChange={() => toggle(o.value)} />{o.label}</label>
          ))}
        </div>
      </Popover>
    </span>
  );
}

/** 未完成的页面占位 */
export const Building = ({ title }: { title: string }) => (
  <div className="page"><PageHead title={title} /><div className="card"><div className="empty"><h4>建设中</h4><p>这一页在后续阶段完成</p></div></div></div>
);

/** 节假日标记：放假写假日名称，调休上班单独标出；样式 .hol 在 app.css */
export function HolMark({ m }: { m?: { name: string; kind: '放假' | '调休上班' } }) {
  if (!m) return null;
  return <span className={m.kind === '放假' ? 'hol' : 'hol work'} title={m.name + m.kind}>{m.kind === '放假' ? m.name : '调休上班'}</span>;
}
