import { Icon } from './Icon';
import { Popover, usePop } from './Popover';

/** "+ Label" chip with a multi-select menu; picked values show on the chip, × clears them. */
export function ChipFilter({ label, values, value, onChange }: {
  label: string;
  values: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const pop = usePop();
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : values.filter((x) => x === v || value.includes(x)));
  const shown = value.length <= 2 ? value.join('、') : `${value[0]} 等 ${value.length} 项`;
  return (
    <>
      {value.length ? (
        <button type="button" className="chip on" onClick={pop.toggle} ref={pop.anchor} title={value.join('、')}>
          <span className="k">{label}</span> {shown}
          <span className="x" role="button" tabIndex={0} aria-label={`去掉「${label}」筛选`}
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange([]); } }}>
            <Icon name="x" />
          </span>
        </button>
      ) : (
        <button type="button" className="chip" ref={pop.anchor} onClick={pop.toggle}><Icon name="plus" />{label}</button>
      )}
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} role="menu">
        {values.map((v) => (
          <button key={v} type="button" className="pop-i cf-i" role="menuitemcheckbox" aria-checked={value.includes(v)} onClick={() => toggle(v)}>
            <span className={`cb${value.includes(v) ? ' on' : ''}`} />{v}
          </button>
        ))}
        {value.length > 0 && <button type="button" className="pop-i cf-i fg3" onClick={() => { onChange([]); pop.close(); }}>清除</button>}
      </Popover>
    </>
  );
}

/** Empty selection means no filter. */
export const pass = (picked: string[], v: string) => !picked.length || picked.includes(v);
