import { STORE } from '@/app.config';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { useFeatures, useMeSure, useProductName } from '@/core/me';
import { groupKey, useDynamicMenu, useMenuNames, useMenuTree, type MenuTreeNode } from '@/core/menu-names';
import { Icon, Logo } from '@/ui/Icon';
import { visibleModules } from './modules';
import { menuAllowed, type MenuItem } from '@/core/module';
import { badgeText } from '@/ui/format';

const KEY = `${STORE}.subnav`;
export const readCollapsed = (): boolean => { try { return localStorage.getItem(KEY) === 'collapsed'; } catch { return false; } };
export function setCollapsed(on: boolean): void {
  document.documentElement.classList.toggle('nav-c', on);
  try { localStorage.setItem(KEY, on ? 'collapsed' : 'open'); } catch { /* 隐私模式 */ }
}

/** 按权限和模块开关裁剪后的菜单：item 有值才是能点的页面，没有的是分组标题 */
interface Vis { node: MenuTreeNode; item?: MenuItem; children: Vis[] }
const hasItem = (v: Vis): boolean => Boolean(v.item) || v.children.some(hasItem);
const flat = (list: Vis[]): Vis[] => list.flatMap((v) => [v, ...flat(v.children)]);

const plain = { width: '100%', border: 0, background: 'none', font: 'inherit' };

export function Sidebar() {
  const { pathname } = useLocation();
  const me = useMeSure();
  const f = useFeatures();
  const productName = useProductName();
  const { name } = useMenuNames();
  const todos = useQuery({ queryKey: ['todos'], queryFn: coreApi.todos, refetchInterval: 60_000 }).data ?? [];
  const unread = useQuery({ queryKey: ['messages', 'unread'], queryFn: () => coreApi.messages({ unread: 1, size: 1 }), refetchInterval: 60_000 }).data?.unread ?? 0;
  const approvals = todos.filter((t) => t.key.startsWith('wf:')).reduce((n, t) => n + t.count, 0);
  const tree = useMenuTree();
  const mods = visibleModules(f.on);
  const open_ = new Set(mods.map((m) => groupKey(m.key)));
  // 按数据生成的菜单（setDynamicMenu 登记），所在模块显示时才有
  const dyn = useDynamicMenu((x) => x.menu);
  const extra: MenuItem[] = dyn && mods.some((m) => m.key === dyn.group) ? dyn.items.map((i) => ({ to: i.to, name: i.name, icon: i.icon ?? 'users', perm: i.perm })) : [];
  const allowed = new Map<string, MenuItem>([...mods.flatMap((m) => m.menu), ...extra].filter((i) => menuAllowed(i, me.can) && f.on(i.feature)).map((i) => [i.to, i]));
  const prune = (n: MenuTreeNode): Vis | null => {
    const v: Vis = { node: n, item: allowed.get(n.key), children: n.children.map(prune).filter((x): x is Vis => Boolean(x)) };
    return (n.group ? open_.has(n.key) && v.children.some(hasItem) : hasItem(v)) ? v : null;
  };
  const roots = tree.map(prune).filter((x): x is Vis => Boolean(x));
  // 最长前缀匹配，子页面只点亮最具体的菜单
  const active = flat(roots).filter((v) => v.item).map((v) => v.node.key).filter((to) => pathname === to || pathname.startsWith(`${to}/`)).sort((a, b) => b.length - a.length)[0];
  const cur = roots.find((r) => flat([r]).some((v) => v.node.key === active))?.node.key;
  const [open, setOpen] = useState<string | undefined>(undefined);
  /** 菜单收起成图标后，鼠标移到哪个图标上就在右边弹出它的一级菜单名和下面的二级菜单 */
  const [fly, setFly] = useState<{ key: string; top: number } | null>(null);
  const hover = (key: string) => (e: React.MouseEvent<HTMLElement>) => {
    if (!document.documentElement.classList.contains('nav-c')) return;
    setFly({ key, top: e.currentTarget.getBoundingClientRect().top });
  };
  const flyRoot = fly ? roots.find((r) => r.node.key === fly.key) : undefined;
  /** 点一级菜单名去哪：它自己有页面去它自己，没有就去下面第一个能打开的页面 */
  const first = (v: Vis): string | undefined => (v.item ? v.node.key : flat(v.children).find((x) => x.item)?.node.key);
  const shown = open ?? cur;

  const list = (vs: Vis[], level: number): React.ReactNode => vs.map((v) => (
    <div key={v.node.key} className="side-sub">
      {v.item
        ? <Link className={`sub-i${level > 2 ? ' l3' : ''}${v.node.key === active ? ' on' : ''}`} to={v.node.key} aria-current={v.node.key === active ? 'page' : undefined}>
            <Icon name={v.item.icon} className="si" />{name(v.node.key, v.node.def)}
          </Link>
        : <div className={`sub-label${level > 2 ? ' l3' : ''}`}>{name(v.node.key, v.node.def)}</div>}
      {list(v.children, level + 1)}
    </div>
  ));

  return (
    <nav className="side" aria-label="主导航" onMouseLeave={() => setFly(null)}>
      <div className="side-h">
        <Link className="logo" to="/" title="首页"><Logo /></Link><span className="brand" title={productName}>{productName}</span>
        <button type="button" className="btn btn-g btn-sm btn-ic side-tog" title="收起菜单（[）" aria-label="收起菜单"
          onClick={() => setCollapsed(!document.documentElement.classList.contains('nav-c'))}><Icon name="sidebar" /><span className="sr-only">收起菜单</span></button>
      </div>
      <div className="side-b">
        <Link className={`side-g${pathname === '/' ? ' on' : ''}`} to="/" onMouseEnter={hover('/')}><Icon name="dashboard" /><span className="gl">{name('/', '首页')}</span></Link>
        <Link className={`side-g${pathname.startsWith('/approvals') ? ' on' : ''}`} to="/approvals" onMouseEnter={hover('/approvals')}>
          <Icon name="check" /><span className="gl">{name('/approvals', '审批')}</span>
          {approvals > 0 && <span className="sub-n hot side-n" title={`${approvals} 条待审批`}>{badgeText(approvals)}</span>}
        </Link>
        <Link className={`side-g${pathname.startsWith('/messages') ? ' on' : ''}`} to="/messages" onMouseEnter={hover('/messages')}>
          <Icon name="bell" /><span className="gl">{name('/messages', '消息')}</span>
          {unread > 0 && <span className="sub-n hot side-n" title={`${unread} 条未读`}>{badgeText(unread)}</span>}
        </Link>
        {roots.map((r) => {
          const k = r.node.key;
          if (r.item && !r.children.length) {
            return (
              <Link key={k} className={`side-g${k === active ? ' on' : ''}`} to={k} aria-current={k === active ? 'page' : undefined} onMouseEnter={hover(k)}>
                <Icon name={r.item.icon} /><span className="gl">{name(k, r.node.def)}</span>
              </Link>
            );
          }
          const isOpen = shown === k;
          return (
            <div key={k} className={`side-grp${isOpen ? ' open' : ''}`}>
              <button type="button" className={`side-g${cur === k ? ' on' : ''}`} title={name(k, r.node.def)} aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? '' : k)} onMouseEnter={hover(k)} style={plain}>
                <Icon name={r.node.icon ?? r.item?.icon ?? 'layers'} /><span className="gl">{name(k, r.node.def)}</span><Icon name="right" className="chev" />
              </button>
              <div className="side-items">
                {r.item && <Link className={`sub-i${k === active ? ' on' : ''}`} to={k} aria-current={k === active ? 'page' : undefined}><Icon name={r.item.icon} className="si" />{name(k, r.node.def)}</Link>}
                {list(r.children, 2)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="side-f"><div className="side-ctx">{f.settings?.orgName}</div></div>
      {fly && (
        <div className="side-fly" role="menu" aria-label="子菜单" style={{ top: fly.top }}>
          {flyRoot ? (
            <>
              {first(flyRoot) ? <Link className="fly-t fly-link" to={first(flyRoot)!} onClick={() => setFly(null)}>{name(flyRoot.node.key, flyRoot.node.def)}<Icon name="right" /></Link> : <div className="fly-t">{name(flyRoot.node.key, flyRoot.node.def)}</div>}
              {flyRoot.item && flyRoot.children.length > 0 && (
                <Link className={`sub-i${flyRoot.node.key === active ? ' on' : ''}`} to={flyRoot.node.key} onClick={() => setFly(null)}><Icon name={flyRoot.item.icon} className="si" />{name(flyRoot.node.key, flyRoot.node.def)}</Link>
              )}
              <div onClick={() => setFly(null)}>{list(flyRoot.children, 2)}</div>
            </>
          ) : (
            <Link className="fly-t fly-link" to={fly.key} onClick={() => setFly(null)}>{name(fly.key, fly.key === '/' ? '首页' : fly.key === '/approvals' ? '审批' : '消息')}<Icon name="right" /></Link>
          )}
        </div>
      )}
    </nav>
  );
}
