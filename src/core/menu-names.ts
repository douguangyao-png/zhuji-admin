import { useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { create } from 'zustand';
import type { FeatureKey, MenuNode } from '@/api/types';
import type { IconName } from '@/ui/Icon';
import { useSettings } from './me';

// 管理员改过的菜单显示名：一级菜单键为 group:模块键，二级菜单和固定入口键为地址；没改的用默认名
export interface MenuGroupDef { key: string; name: string; icon?: IconName; feature?: FeatureKey; anyFeature?: FeatureKey[]; items: { to: string; name: string; icon?: IconName }[] }

export const groupKey = (k: string) => `group:${k}`;
/** 侧栏顶上不属于模块的三个一级入口 */
export const FIXED_MENUS = [{ to: '/', name: '首页' }, { to: '/approvals', name: '审批' }, { to: '/messages', name: '消息' }];

// app/modules.ts 启动时登记；core 不反向依赖 app
let groups: MenuGroupDef[] = [];
export function registerMenus(list: MenuGroupDef[]) { groups = list; }

/**
 * 按数据生成的菜单：模块按自己的数据（如可配置的分类）在某个一级菜单下追加、改名或隐藏菜单项，
 * 加载数据后调 setDynamicMenu 登记
 */
export interface DynamicMenu { group: string; items: { to: string; name: string; icon?: IconName; perm?: string }[]; rename: Record<string, string>; hidden: string[] }
export const useDynamicMenu = create<{ menu: DynamicMenu | null }>(() => ({ menu: null }));
export function setDynamicMenu(menu: DynamicMenu | null) {
  if (JSON.stringify(menu) !== JSON.stringify(useDynamicMenu.getState().menu)) useDynamicMenu.setState({ menu });
}
/** 登记的模块菜单，套上按数据生成的菜单 */
export const menuGroups = (): MenuGroupDef[] => {
  const d = useDynamicMenu.getState().menu;
  if (!d) return groups;
  return groups.map((g) => (g.key !== d.group ? g : {
    ...g,
    items: [...g.items.filter((i) => !d.hidden.includes(i.to)).map((i) => (d.rename[i.to] ? { ...i, name: d.rename[i.to] } : i)), ...d.items.map(({ perm: _p, ...i }) => i)],
  }));
};

/** 菜单键 → 默认名 */
export function menuDefaults(): Map<string, string> {
  const m = new Map<string, string>(FIXED_MENUS.map((x) => [x.to, x.name]));
  for (const g of menuGroups()) {
    m.set(groupKey(g.key), g.name);
    for (const i of g.items) m.set(i.to, i.name);
  }
  return m;
}

/** 地址所属的菜单键：固定入口，否则按最长前缀找到所在一级菜单 */
export function menuKeyOf(to: string): string | undefined {
  const path = to.split(/[?#]/)[0];
  const fixed = FIXED_MENUS.find((x) => x.to !== '/' && (path === x.to || path.startsWith(`${x.to}/`)));
  if (fixed) return fixed.to;
  let best: { key: string; len: number } | undefined;
  for (const g of menuGroups()) for (const i of g.items) {
    if ((path === i.to || path.startsWith(`${i.to}/`)) && i.to.length > (best?.len ?? 0)) best = { key: groupKey(g.key), len: i.to.length };
  }
  return best?.key;
}

/** 说明文字里「A › B」「A」形式的菜单引用换成改过的名称；单独一个名称只换不重名的 */
export function renameRefs(text: string, names: Record<string, string>, nameOf: (key: string, def: string) => string): string {
  if (!Object.keys(names).length) return text;
  const byGroup = new Map(menuGroups().map((g) => [g.name, g]));
  const count = new Map<string, string[]>();
  for (const [k, n] of menuDefaults()) count.set(n, [...(count.get(n) ?? []), k]);
  return text.replace(/「([^」]+)」/g, (_m, inner: string) => {
    const parts = inner.split(' › ');
    let g: MenuGroupDef | undefined;
    const out = parts.map((p, i) => {
      if (i === 0 && byGroup.has(p)) { g = byGroup.get(p); return nameOf(groupKey(g!.key), p); }
      const item = g?.items.find((x) => x.name === p);
      if (item) return nameOf(item.to, p);
      const keys = count.get(p);
      return keys?.length === 1 && names[keys[0]] ? names[keys[0]] : p;
    });
    return `「${out.join(' › ')}」`;
  });
}

/** 功能菜单里的一个节点：模块（一级菜单，key 为 group:模块键）或菜单页（key 为地址）；level 为实际所在层级 1 到 3 */
export interface MenuTreeNode { key: string; def: string; icon?: IconName; group: boolean; level: 1 | 2 | 3; parent: string | null; children: MenuTreeNode[] }
export const MENU_MAX_DEPTH = 3;

/** 默认的上级：模块在最上层，菜单页在所属模块下 */
export function defaultParents(): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const g of menuGroups()) { m.set(groupKey(g.key), null); for (const i of g.items) m.set(i.to, groupKey(g.key)); }
  return m;
}

/** 从某个节点往上数它在第几层；绕圈或超过 MENU_MAX_DEPTH 返回 0 */
function depthIn(parents: Map<string, string | null>, key: string): number {
  let d = 1;
  for (let p = parents.get(key); p; p = parents.get(p)) {
    if (!parents.has(p) || ++d > MENU_MAX_DEPTH) return 0;
  }
  return d;
}

/** 按功能菜单设置排出菜单树：设置里的上级不存在、绕圈或超过三层就按默认上级；同级按设置的排序，没设的按默认顺序排在后面 */
export function buildMenuTree(config: Record<string, MenuNode> = {}): MenuTreeNode[] {
  const nodes = new Map<string, MenuTreeNode>();
  const order = new Map<string, number>();
  for (const g of menuGroups()) {
    nodes.set(groupKey(g.key), { key: groupKey(g.key), def: g.name, icon: g.icon, group: true, level: 1, parent: null, children: [] });
    for (const i of g.items) nodes.set(i.to, { key: i.to, def: i.name, icon: i.icon, group: false, level: 2, parent: groupKey(g.key), children: [] });
  }
  [...nodes.keys()].forEach((k, i) => order.set(k, config[k]?.sort ?? 100000 + i));
  const parents = defaultParents();
  for (const k of nodes.keys()) {
    const want = config[k]?.parent;
    if (want === undefined || want === parents.get(k) || (want !== '' && !nodes.has(want))) continue;
    const prev = parents.get(k) ?? null;
    parents.set(k, want === '' ? null : want);
    if ([...nodes.keys()].some((x) => depthIn(parents, x) === 0)) parents.set(k, prev);
  }
  const roots: MenuTreeNode[] = [];
  for (const [k, node] of nodes) {
    node.parent = parents.get(k) ?? null;
    node.level = depthIn(parents, k) as 1 | 2 | 3;
    (node.parent ? nodes.get(node.parent)!.children : roots).push(node);
  }
  const byOrder = (a: MenuTreeNode, b: MenuTreeNode) => order.get(a.key)! - order.get(b.key)!;
  roots.sort(byOrder);
  for (const node of nodes.values()) node.children.sort(byOrder);
  return roots;
}

/** 菜单树的顶层到某个菜单页的路径，如 [group:equipment, /equipment]；找不到为空 */
export function menuPathOf(tree: MenuTreeNode[], to: string): string[] {
  const walk = (list: MenuTreeNode[], trail: string[]): string[] => {
    for (const n of list) {
      if (n.key === to) return [...trail, n.key];
      const hit = walk(n.children, [...trail, n.key]);
      if (hit.length) return hit;
    }
    return [];
  };
  return walk(tree, []);
}

/** 当前的菜单树（功能菜单设置已套用） */
export function useMenuTree(): MenuTreeNode[] {
  const config = useSettings().data?.menuConfig;
  const dyn = useDynamicMenu((x) => x.menu);
  return useMemo(() => buildMenuTree(config), [config, dyn]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** 菜单名解析：侧栏、顶栏、页面标题、首页、操作说明都走这里 */
export function useMenuNames() {
  const names = useSettings().data?.menuNames ?? {};
  const name = (key: string, def: string) => names[key] || def;
  /** 只取改过的名称，叫法本来就不同的地方用 */
  const custom = (key: string): string | undefined => names[key] || undefined;
  /** 页面标题：当前地址正好是某个菜单、标题又是它的默认名时换成改过的名称 */
  const title = (path: string, t: string) => {
    const def = menuDefaults().get(path);
    return names[path] && def !== undefined && t === def ? names[path] : t;
  };
  return { names, name, custom, title, text: (s: string) => renameRefs(s, names, name) };
}

/** 页面标题跟着菜单名走（PageHead 用） */
export function usePageTitle(t: unknown): unknown {
  const { pathname } = useLocation();
  const { title } = useMenuNames();
  return typeof t === 'string' && pathname !== '/' ? title(pathname, t) : t;
}
