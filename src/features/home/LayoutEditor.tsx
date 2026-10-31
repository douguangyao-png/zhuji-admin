import type { DragEvent } from 'react';
import type { HomeRow, HomeRowMode } from '@/api/types';
import { Icon } from '@/ui/Icon';
import { Select } from '@/ui/Select';
import { addRow, colsOf, moveRow, placeCard, placed, removeRow, ROW_MODES, setMode } from './layout';
import { deleteConfirm } from '@/ui/Confirm';

const SIDE = ['左', '右'] as const;
/** 拖动时带的内容：cell:行:格 从某一格拖起，pool:键 从未放置里拖起 */
const MIME = 'text/plain';

/** 编辑首页布局：每行选分列模式，卡片拖到格子里（也可以用格子里的下拉选）；没放进格子的在下面「未放置」 */
export function LayoutEditor({ rows, onChange, items }: { rows: HomeRow[]; onChange: (rows: HomeRow[]) => void; items: { key: string; label: string }[] }) {
  const label = (k: string | null) => items.find((i) => i.key === k)?.label ?? k ?? '';
  const free = items.filter((i) => !placed(rows).has(i.key));

  const start = (e: DragEvent, from: string) => { e.dataTransfer.setData(MIME, from); e.dataTransfer.effectAllowed = 'move'; };
  const over = (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const take = (e: DragEvent): string | null | undefined => {
    const v = e.dataTransfer.getData(MIME);
    if (v.startsWith('pool:')) return v.slice(5);
    const m = /^cell:(\d+):([01])$/.exec(v);
    return m ? rows[Number(m[1])]?.cells[Number(m[2])] : undefined;
  };
  const drop = (e: DragEvent, r: number, c: 0 | 1) => {
    e.preventDefault();
    const key = take(e);
    if (key) onChange(placeCard(rows, r, c, key));
  };
  /** 拖回未放置：把原来那一格清空 */
  const dropFree = (e: DragEvent) => {
    e.preventDefault();
    const m = /^cell:(\d+):([01])$/.exec(e.dataTransfer.getData(MIME));
    if (m) onChange(placeCard(rows, Number(m[1]), Number(m[2]) as 0 | 1, null));
  };

  return (
    <div className="home-edit">
      <p className="fg3 home-edit-tip">每一行选一种分列模式（一行只能用一种），把卡片拖到格子里；也可以用格子里的下拉框选。卡片没放进格子就不显示。保存后下次登录还是这个布局，只对你自己生效。</p>
      {rows.map((row, r) => (
        <div key={r} className="home-edit-row">
          <div className="row home-edit-h">
            <b>第 {r + 1} 行</b>
            <Select className="input" value={row.mode} aria-label={`第 ${r + 1} 行分列模式`} style={{ width: 190, height: 30 }}
              onChange={(e) => onChange(setMode(rows, r, e.target.value as HomeRowMode))}>
              {ROW_MODES.map((m) => <option key={m.mode} value={m.mode}>{m.label}</option>)}
            </Select>
            <span className="push" />
            <button type="button" className="btn btn-xs btn-g" aria-label={`上移第 ${r + 1} 行`} disabled={r === 0} onClick={() => onChange(moveRow(rows, r, -1))}><Icon name="up" />上移第</button>
            <button type="button" className="btn btn-xs btn-g" aria-label={`下移第 ${r + 1} 行`} disabled={r === rows.length - 1} onClick={() => onChange(moveRow(rows, r, 1))}><Icon name="down" />下移第</button>
            <button type="button" className="btn btn-xs btn-ds" aria-label={`删除第 ${r + 1} 行`} onClick={async () => { if (await deleteConfirm(`第 ${r + 1} 行`)) { onChange(removeRow(rows, r)); } }}><Icon name="trash" />删除</button>
          </div>
          <div className="home-row" style={{ gridTemplateColumns: colsOf(row.mode) }}>
            {([0, 1] as const).map((c) => {
              const key = row.cells[c];
              return (
                <div key={c} className={`home-slot${key ? ' full' : ''}`} onDragOver={over} onDrop={(e) => drop(e, r, c)}>
                  <div className="home-slot-t" draggable={Boolean(key)} onDragStart={(e) => start(e, `cell:${r}:${c}`)}>
                    <Icon name="grip" />
                    <span>{key ? label(key) : `${SIDE[c]}格：拖一张卡片到这里`}</span>
                  </div>
                  <Select className="input" value={key ?? ''} aria-label={`第 ${r + 1} 行${SIDE[c]}格的卡片`} style={{ height: 30 }}
                    onChange={(e) => onChange(placeCard(rows, r, c, e.target.value || null))}>
                    <option value="">（空）</option>
                    {items.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-sm" onClick={() => onChange(addRow(rows))}><Icon name="plus" />添加一行</button>
      </div>
      <div className="home-pool" onDragOver={over} onDrop={dropFree} aria-label="未放置的卡片">
        <b>未放置的卡片</b>
        <span className="fg3">不显示在首页；拖到上面的格子里就会显示</span>
        <div className="chips">
          {free.length === 0 ? <span className="fg3">（都已放进格子）</span> : free.map((i) => (
            <span key={i.key} className="chip" draggable onDragStart={(e) => start(e, `pool:${i.key}`)}><Icon name="grip" />{i.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
