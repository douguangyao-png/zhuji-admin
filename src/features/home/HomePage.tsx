import { STORE } from '@/app.config';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { HomeRow } from '@/api/types';
import { visibleModules } from '@/app/modules';
import { PageHead } from '@/core/bits';
import { useFeatures, useMeSure, useSettings } from '@/core/me';
import { menuKeyOf, useMenuNames } from '@/core/menu-names';
import { now, today, weekday } from '@/lib/time';
import { Dialog } from '@/ui/Dialog';
import { Icon } from '@/ui/Icon';
import { Select } from '@/ui/Select';
import { toast } from '@/ui/Toast';
import { MessageList } from './MessagesPage';
import { MyApprovalsCard, QuickCard } from './GeneralCards';
import { allowedComponents, HOME_COMPONENT_LABEL } from './catalog';
import { LayoutEditor } from './LayoutEditor';
import { colsOf, defaultRows, normalizeRows } from './layout';

const greet = () => { const h = now().getHours(); return h < 11 ? '上午好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好'; };
/** 早期版本把「不显示的卡片」存在浏览器里；还没在服务器上保存过布局的人，默认布局按它来 */
const storeKey = (id: string) => `${STORE}.homeHidden.${id}`;
const loadHidden = (id: string, fallback?: string[]) => {
  try {
    const own = localStorage.getItem(storeKey(id));
    return new Set<string>(own === null ? fallback ?? [] : JSON.parse(own) as string[]);
  } catch { return new Set<string>(fallback ?? []); }
};

export function HomePage() {
  const me = useMeSure();
  const f = useFeatures();
  const menu = useMenuNames();
  const qc = useQueryClient();
  const settings = useSettings().data;
  const roleKey = me.user.roleKeys[0] ?? '';
  const [editing, setEditing] = useState<HomeRow[] | null>(null);
  const [roleDlg, setRoleDlg] = useState(false);
  const todos = useQuery({ queryKey: ['todos'], queryFn: coreApi.todos });
  const saved = useQuery({ queryKey: ['home', 'layout'], queryFn: coreApi.homeLayout });
  const list = todos.data ?? [];
  const msgs = useQuery({ queryKey: ['messages', 'home'], queryFn: () => coreApi.messages({ size: 5 }) }).data;
  const unread = useQuery({ queryKey: ['messages', 'unread'], queryFn: () => coreApi.messages({ unread: 1, size: 1 }) }).data?.unread ?? 0;
  const approvals = list.filter((t) => t.key.startsWith('wf:')).reduce((n, t) => n + t.count, 0);
  const allowed = allowedComponents(me.roles);

  /** 当前这个人能用的全部卡片，按默认顺序：待办、消息、快捷入口、我发起的审批、模块卡片；模块没开、没权限、角色不允许的不在里面 */
  const comps = useMemo(() => {
    const cards = visibleModules(f.on).flatMap((m) => (m.home ?? []).filter((c) => !c.perm || me.can(c.perm)).map((c) => ({ key: c.key, label: HOME_COMPONENT_LABEL[c.key] ?? m.name, Card: c.Card })));
    return [{ key: 'todo', label: '待办' }, { key: 'msg', label: '消息' }, { key: 'quick', label: '快捷入口', Card: QuickCard }, { key: 'my-wf', label: '我发起的审批', Card: MyApprovalsCard }, ...cards]
      .filter((c) => allowed === 'all' || allowed.has(c.key)) as { key: string; label: string; Card?: () => ReactNode }[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.on, me.roles, me.perms]);
  const available = useMemo(() => new Set(comps.map((c) => c.key)), [comps]);
  const items = comps.map((c) => ({ key: c.key, label: c.label }));

  const base = useMemo<HomeRow[]>(() => {
    if (saved.data) return normalizeRows(saved.data.rows, available);
    const hidden = loadHidden(me.user.id, settings?.homeLayouts?.[roleKey]);
    return defaultRows(comps.map((c) => c.key).filter((k) => !hidden.has(k)));
  }, [saved.data, available, comps, me.user.id, settings?.homeLayouts, roleKey]);

  const save = useMutation({
    mutationFn: (rows: HomeRow[]) => coreApi.saveHomeLayout({ rows: normalizeRows(rows, available) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['home', 'layout'] }); setEditing(null); toast('首页布局已保存'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const reset = useMutation({
    mutationFn: coreApi.resetHomeLayout,
    onSuccess: () => { try { localStorage.removeItem(storeKey(me.user.id)); } catch { /* 浏览器禁用存储 */ } void qc.invalidateQueries({ queryKey: ['home', 'layout'] }); setEditing(null); toast('已恢复默认布局'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });

  const render = (key: string): ReactNode => {
    if (key === 'todo') {
      return (
        <div className="card">
          <div className="card-h b"><span className="card-t">待办</span><span className="card-s">{list.length ? `${list.reduce((n, t) => n + t.count, 0)} 项` : ''}</span></div>
          {todos.isLoading ? <div className="card-b fg3">加载中…</div> : list.length === 0 ? <div className="card-b fg3">没有待办事项。</div> : (
            <div className="todo-g">
              {list.map((t) => (
                <Link key={t.key} to={t.to} data-m={t.to.split(/[/?#]/)[1]} className={`todo-i${t.tone ? ` ${t.tone}` : ''}`}>
                  <span className="todo-m">{menu.custom(menuKeyOf(t.to) ?? '') ?? t.module}</span>
                  <span className="todo-l">{t.label}</span>
                  <b className="todo-n">{t.count}</b>
                  <Icon name="right" />
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (key === 'msg') {
      return (
        <div className="card home-msg">
          <div className="card-h b">
            <span className="card-t">消息</span>
            <span className="card-s">{msgs && (msgs.unread ? `${msgs.unread} 条未读${msgs.urgent ? `，紧急 ${msgs.urgent} 条` : ''}` : '没有未读')}</span>
            <span className="push" />
            <Link to="/messages" className="link">全部消息<Icon name="right" /></Link>
          </div>
          {msgs && <MessageList items={msgs.items} empty="暂时没有消息" />}
        </div>
      );
    }
    const Card = comps.find((c) => c.key === key)?.Card;
    return Card ? <Card /> : null;
  };

  return (
    <div className="page home">
      <PageHead title={`${me.user.name}，${greet()}`} sub={`${today()} ${weekday(today())} · ${me.user.roleNames.join('、')} · ${me.user.unitName}`}
        acts={editing ? (
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)}><Icon name="x" />取消</button>
            <button type="button" className="btn" disabled={reset.isPending} onClick={() => reset.mutate()}><Icon name="refresh" />恢复默认</button>
            <button type="button" className="btn btn-p" disabled={save.isPending} onClick={() => save.mutate(editing)}><Icon name="settings" />保存布局</button>
          </>
        ) : (
          <>
            {me.can('sys:setting') && <button type="button" className="btn btn-g" onClick={() => setRoleDlg(true)}><Icon name="settings" />角色默认布局</button>}
            <button type="button" className="btn btn-g" onClick={() => setEditing(base)}><Icon name="settings" />编辑布局</button>
          </>
        )} />
      <div className="sum-bar" aria-label="今日概况">
        <Link className="sum-i" to="/approvals"><span>{menu.name('/approvals', '审批')} · 待我处理</span><b className={approvals ? 'warn' : undefined}>{approvals}</b></Link>
        <div className="sum-i"><span>待办合计</span><b>{list.reduce((n, t) => n + t.count, 0)}</b></div>
        <Link className="sum-i" to="/messages"><span>{menu.name('/messages', '消息')} · 未读</span><b>{unread}</b></Link>
      </div>
      {editing ? <LayoutEditor rows={editing} onChange={setEditing} items={items} /> : saved.isLoading ? <div className="fg3" style={{ marginTop: 16 }}>加载中…</div> : (
        base.map((row, r) => (
          <div key={r} className="home-row" style={{ gridTemplateColumns: colsOf(row.mode) }}>
            {row.cells.map((k, c) => <div key={c} className="home-cell">{k && render(k)}</div>)}
          </div>
        ))
      )}
      {roleDlg && <RoleDefaultDialog items={items} onClose={() => setRoleDlg(false)} defaultRole={roleKey} />}
    </div>
  );
}

/** 没自己保存过布局的人，默认按角色的这份显示：取消勾选的卡片不显示 */
function RoleDefaultDialog({ items, defaultRole, onClose }: { items: { key: string; label: string }[]; defaultRole: string; onClose: () => void }) {
  const settings = useSettings().data;
  const roles = useQuery({ queryKey: ['roles'], queryFn: coreApi.roles }).data ?? [];
  const [role, setRole] = useState(defaultRole);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(settings?.homeLayouts?.[defaultRole] ?? []));
  const pick = (k: string) => { setRole(k); setHidden(new Set(settings?.homeLayouts?.[k] ?? [])); };
  const save = useMutation({
    mutationFn: () => coreApi.saveSettings({ ...settings, homeLayouts: { ...(settings?.homeLayouts ?? {}), [role]: [...hidden] } }),
    onSuccess: () => toast(`已保存「${roles.find((r) => r.key === role)?.name ?? role}」的默认首页布局`),
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  return (
    <Dialog title="角色默认布局" sub="没自己保存过布局的人，按所在角色的这份显示；保存过的仍用自己的。哪些组件角色能用，在「角色权限」里设置。" onClose={onClose}
      footer={<><span className="push" /><button type="button" className="btn btn-p" onClick={onClose}><Icon name="check" />完成</button></>}>
      <div className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <b style={{ fontSize: 13 }}>角色</b>
          <Select className="input" value={role} onChange={(e) => pick(e.target.value)} aria-label="选择角色" style={{ width: 180, height: 32 }}>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </Select>
          <span className="push" />
          <button type="button" className="btn btn-sm btn-p" disabled={save.isPending} onClick={() => save.mutate()}><Icon name="check" />保存为该角色默认</button>
        </div>
        <div className="export-cols">
          {items.map((c) => (
            <label key={c.key} className="cb-l"><input type="checkbox" aria-label={`角色默认：${c.label}`} checked={!hidden.has(c.key)} onChange={() => setHidden((x) => { const n = new Set(x); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} />{c.label}</label>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
