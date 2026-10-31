import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { MENU_NAME_MAX, type MenuNode } from '@/api/types';
import { PageHead } from '@/core/bits';
import { useFeatures, useSettings } from '@/core/me';
import { buildMenuTree, FIXED_MENUS, MENU_MAX_DEPTH, menuGroups, type MenuTreeNode } from '@/core/menu-names';
import { Icon } from '@/ui/Icon';
import { confirm } from '@/ui/Confirm';
import { Loading } from '@/ui/primitives';
import { Select } from '@/ui/Select';
import { toast } from '@/ui/Toast';

/** 编辑中的一项：显示名、上级（null 为一级菜单）、同级里的顺序 */
interface Draft { name: string; parent: string | null; sort: number }
type Drafts = Record<string, Draft>;

const LEVEL = ['', '一级', '二级', '三级'];
const nameErr = (v: string) => (!v.trim() ? '不能为空' : [...v.trim()].length > MENU_NAME_MAX ? `最多 ${MENU_NAME_MAX} 个字` : null);

/** 全部菜单（不含固定入口）的默认名称，键 → 名称 */
const defOf = (): Map<string, string> => {
  const m = new Map<string, string>();
  for (const g of menuGroups()) { m.set(`group:${g.key}`, g.name); for (const i of g.items) m.set(i.to, i.name); }
  return m;
};

/** 已保存的设置 → 编辑用的草稿 */
export function toDrafts(config: Record<string, MenuNode>): Drafts {
  const out: Drafts = {};
  const dive = (list: MenuTreeNode[], parent: string | null) => list.forEach((n, i) => {
    out[n.key] = { name: config[n.key]?.name ?? n.def, parent, sort: (i + 1) * 10 };
    dive(n.children, n.key);
  });
  dive(buildMenuTree(config), null);
  for (const f of FIXED_MENUS) out[f.to] = { name: config[f.to]?.name ?? f.name, parent: null, sort: 0 };
  return out;
}

/** 草稿 → 要保存的设置：只存和默认不同的名称、位置和顺序 */
export function toConfig(d: Drafts): Record<string, MenuNode> {
  const out: Record<string, MenuNode> = {};
  const def = defOf();
  const defTree = buildMenuTree({});
  const defKids = new Map<string | null, string[]>([[null, defTree.map((n) => n.key)]]);
  const walk = (n: MenuTreeNode) => { defKids.set(n.key, n.children.map((c) => c.key)); n.children.forEach(walk); };
  defTree.forEach(walk);
  const defParent = new Map<string, string | null>();
  defKids.forEach((ks, p) => ks.forEach((k) => defParent.set(k, p)));
  for (const [k, v] of Object.entries(d)) {
    const base = def.get(k) ?? FIXED_MENUS.find((f) => f.to === k)?.name ?? k;
    const node: MenuNode = {};
    if (v.name.trim() !== base) node.name = v.name.trim();
    if (Object.keys(node).length) out[k] = node;
  }
  const kidsOf = (p: string | null) => Object.keys(d).filter((k) => def.has(k) && d[k].parent === p).sort((a, b) => d[a].sort - d[b].sort);
  for (const p of [null, ...def.keys()]) {
    const now = kidsOf(p);
    if (!now.length || now.join() === (defKids.get(p) ?? []).join()) continue;
    now.forEach((k, i) => {
      out[k] = { ...out[k], sort: (i + 1) * 10 };
      if (d[k].parent !== defParent.get(k)) out[k].parent = d[k].parent ?? '';
    });
  }
  return out;
}

/** 功能菜单：菜单的位置、排序、上下级和显示名称 */
export function MenusPage() {
  const s = useSettings().data;
  const f = useFeatures();
  const qc = useQueryClient();
  const saved = s?.menuConfig;
  const def = defOf();
  // 按数据生成的菜单是加载后才登记的：菜单目录变了要重算草稿，否则新菜单没有草稿行
  const defKeys = [...def.keys()].join('|');
  const base = useMemo(() => toDrafts(saved ?? {}), [saved, defKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<Drafts | null>(null);
  const d = draft ?? base;
  const save = useMutation({
    mutationFn: (c: Record<string, MenuNode>) => coreApi.saveMenuConfig(c),
    onSuccess: (r) => { setDraft(null); qc.setQueryData(['settings'], r); void qc.invalidateQueries({ queryKey: ['settings'] }); toast(`已保存，${Object.keys(r.menuConfig ?? {}).length} 个菜单有自定义设置`); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  if (!s) return <div className="page"><Loading /></div>;

  const kids = (p: string | null) => Object.keys(d).filter((k) => def.has(k) && d[k].parent === p).sort((a, b) => d[a].sort - d[b].sort);
  const levelOf = (k: string): number => { let n = 1; for (let p = d[k]?.parent; p && n < 9; p = d[p]?.parent) n++; return n; };
  const height = (k: string): number => 1 + Math.max(0, ...kids(k).map(height));
  const under = (k: string, anc: string): boolean => { for (let p = d[k]?.parent; p; p = d[p]?.parent) if (p === anc) return true; return false; };
  /** 能不能把 k 放到 p 下面：不能是自己或自己的下级，放下去不超过三层 */
  const canPut = (k: string, p: string | null) => p === null || (p !== k && !under(p, k) && levelOf(p) + height(k) <= MENU_MAX_DEPTH);
  const rows: { key: string; depth: number }[] = [];
  const dive = (p: string | null, depth: number) => kids(p).forEach((k) => { rows.push({ key: k, depth }); dive(k, depth + 1); });
  dive(null, 0);

  const put = (k: string, patch: Partial<Draft>) => setDraft({ ...d, [k]: { ...d[k], ...patch } });
  const setParent = (k: string, p: string | null) => {
    const top = Math.max(0, ...kids(p).map((x) => d[x].sort));
    put(k, { parent: p, sort: top + 10 });
  };
  const shift = (k: string, dir: -1 | 1) => {
    const sib = kids(d[k].parent);
    const i = sib.indexOf(k), j = i + dir;
    if (j < 0 || j >= sib.length) return;
    [sib[i], sib[j]] = [sib[j], sib[i]];
    const next = { ...d };
    sib.forEach((x, n) => { next[x] = { ...next[x], sort: (n + 1) * 10 }; });
    setDraft(next);
  };

  const all = [...FIXED_MENUS.map((m) => m.to), ...rows.map((r) => r.key)];
  const errors = all.filter((k) => nameErr(d[k].name));
  const config = toConfig(d);
  const dirty = JSON.stringify(config) !== JSON.stringify(toConfig(base));
  const changed = Object.keys(saved ?? {}).length;
  const off = (k: string) => {
    const g = menuGroups().find((x) => `group:${x.key}` === k);
    return Boolean(g) && !(g!.anyFeature ? g!.anyFeature.some(f.on) : f.on(g!.feature));
  };
  const resetAll = async () => {
    if (await confirm({ title: '功能菜单全部恢复默认？', text: `${changed} 个菜单的名称、位置、顺序恢复为系统默认。`, okLabel: '恢复默认' })) save.mutate({});
  };
  const nameCell = (k: string, label: string) => {
    const err = nameErr(d[k].name);
    const title = def.get(k) ?? FIXED_MENUS.find((m) => m.to === k)?.name ?? k;
    return (
      <td>
        <input className="input" style={{ height: 30, maxWidth: 200 }} value={d[k].name} aria-label={`${title}的${label}`} aria-invalid={Boolean(err)}
          onChange={(e) => put(k, { name: e.target.value })} />
        {err && <span className="hint err" role="alert" style={{ marginLeft: 8 }}>{err}</span>}
      </td>
    );
  };

  return (
    <div className="page">
      <PageHead title="功能菜单" sub="调整左边菜单的名称、位置、顺序和上下级（最多三级）。" />
      <div className="card">
        <div className="card-h b">
          <span className="card-t">菜单</span>
          <span className="card-s">{changed ? `${changed} 个菜单有自定义设置` : '全部为默认设置'}；名称最多 {MENU_NAME_MAX} 个字</span>
          <span className="push" />
          <button type="button" className="btn btn-sm" disabled={!changed || save.isPending} onClick={() => void resetAll()}><Icon name="refresh" />全部恢复默认</button>
          <button type="button" className="btn btn-sm" disabled={!dirty || save.isPending} onClick={() => setDraft(null)}><Icon name="x" />放弃修改</button>
          <button type="button" className="btn btn-sm btn-p" disabled={!dirty || errors.length > 0 || save.isPending} onClick={() => save.mutate(config)}><Icon name="check" />保存</button>
        </div>
        <div className="tw">
          <table className="tbl">
            <thead><tr><th>菜单（默认名称）</th><th>层级</th><th>显示名称</th><th>上级菜单</th><th style={{ width: 100 }}>顺序</th></tr></thead>
            <tbody>
              {FIXED_MENUS.map((m) => (
                <tr key={m.to}>
                  <td><b>{m.name}</b></td><td className="fg3">固定</td>
                  {nameCell(m.to, '显示名称')}
                  <td className="fg3">固定在最上面</td><td />
                </tr>
              ))}
              {rows.map(({ key: k, depth }) => {
                const sib = kids(d[k].parent);
                const i = sib.indexOf(k);
                const name = def.get(k) ?? k;
                return (
                  <tr key={k}>
                    <td style={{ paddingLeft: 12 + depth * 24 }}>{depth === 0 ? <b>{name}</b> : name}{off(k) && <span className="fg4"> · 模块已关闭</span>}</td>
                    <td className="fg3">{LEVEL[depth + 1]}</td>
                    {nameCell(k, '显示名称')}
                    <td>
                      <Select className="input" style={{ height: 30, width: 200 }} aria-label={`${name}的上级菜单`} value={d[k].parent ?? ''} onChange={(e) => setParent(k, e.target.value || null)}>
                        <option value="">（一级菜单）</option>
                        {[...def.keys()].filter((p) => p !== k && d[p]).map((p) => (
                          <option key={p} value={p} disabled={!canPut(k, p)}>{`${'　'.repeat(levelOf(p) - 1)}${def.get(p)}`}</option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <button type="button" className="btn btn-g btn-sm btn-ic" aria-label={`上移${name}`} title="上移" disabled={i <= 0} onClick={() => shift(k, -1)}><Icon name="up" />上移</button>
                      <button type="button" className="btn btn-g btn-sm btn-ic" aria-label={`下移${name}`} title="下移" disabled={i >= sib.length - 1} onClick={() => shift(k, 1)}><Icon name="down" />下移</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
