import { STORE } from '@/app.config';
import { Children, createContext, useContext, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

// 左树右表页面的左栏收起：收起后左栏只剩一个竖排的「展开 xx」按钮，状态按页面记在本机
const KEY = `${STORE}.sideFold.`;
const read = (id: string): boolean => { try { return localStorage.getItem(KEY + id) === '1'; } catch { return false; } };
const write = (id: string, folded: boolean) => { try { if (folded) localStorage.setItem(KEY + id, '1'); else localStorage.removeItem(KEY + id); } catch { /* 隐私模式只在本次有效 */ } };

/** 某个页面左栏是否收起；读不到本机记录时按展开 */
export function useSideFold(id: string): [boolean, (folded: boolean) => void] {
  const [folded, setFolded] = useState(() => read(id));
  return [folded, (v: boolean) => { write(id, v); setFolded(v); }];
}

const Ctx = createContext<{ label: string; fold: () => void } | null>(null);

/**
 * 左右两栏：第一个子元素是左栏，其余是右侧内容。
 * id 区分页面（记住收起状态），label 是左栏的名称：按钮上只写「收起」「展开」，读屏和提示仍是「收起{label}」「展开{label}」。
 * 左栏里放 <SideFoldButton /> 作为收起按钮。
 */
export function SideGrid({ id, label, className, children }: { id: string; label: string; className?: string; children: ReactNode }) {
  const [folded, setFolded] = useSideFold(id);
  const [side, ...rest] = Children.toArray(children);
  return (
    <div className={`grid g-side${className ? ` ${className}` : ''}${folded ? ' g-side-folded' : ''}`}>
      {folded ? (
        <div className="card side-folded">
          <button type="button" className="btn btn-g side-open" aria-expanded={false} aria-label={`展开${label}`} title={`展开${label}`} onClick={() => setFolded(false)}>
            <Icon name="right" /><span>展开</span>
          </button>
        </div>
      ) : <Ctx.Provider value={{ label, fold: () => setFolded(true) }}>{side}</Ctx.Provider>}
      {rest}
    </div>
  );
}

/** 左栏标题行里的收起按钮；窄屏左栏在上方一列显示，不出现这个按钮 */
export function SideFoldButton({ push }: { push?: boolean }) {
  const c = useContext(Ctx);
  if (!c) return null;
  return (
    <button type="button" className={`btn btn-g btn-xs side-fold${push ? ' push' : ''}`} aria-expanded aria-label={`收起${c.label}`} title={`收起${c.label}`} onClick={c.fold}>
      <Icon name="left" />收起
    </button>
  );
}
