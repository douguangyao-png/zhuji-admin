import { useState } from 'react';
import { Link, useMatches, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { signOut, useMeSure } from '@/core/me';
import { useMenuNames } from '@/core/menu-names';
import { useSession } from '@/core/session';
import { ThemeMenu } from './ThemeMenu';
import { Avatar } from '@/ui/Avatar';
import { confirm } from '@/ui/Confirm';
import { Icon } from '@/ui/Icon';
import { Popover, usePop } from '@/ui/Popover';
import { ChangePasswordDialog } from './ChangePassword';
import { toast } from '@/ui/Toast';

// 接真实后端时没有一键重置
const DEMO = import.meta.env.VITE_API !== 'server';
const item = { width: '100%', border: 0, background: 'none' };

function AccountMenu() {
  const pop = usePop();
  const me = useMeSure();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [pw, setPw] = useState(false);
  const demo = useQuery({ queryKey: ['demo-users'], queryFn: coreApi.demoUsers, enabled: pop.open }).data ?? [];
  const switchTo = async (roleKey: string, name: string, role: string) => {
    pop.close();
    const u = await coreApi.sso(roleKey); // 演示登录按角色换服务端的登录 Cookie，不走密码和滑块
    useSession.getState().login(u.id, u.sid);
    void qc.invalidateQueries();
    nav('/');
    toast(`已切换为 ${name}（${role}）`);
  };
  return (
    <>
      <button type="button" ref={pop.anchor} className="me" onClick={pop.toggle} aria-haspopup="menu">
        <div><div className="nm">{me.user.name}</div><div className="rl">{me.user.roleNames.join('、')} · {me.user.unitName}</div></div>
        <Avatar text={me.user.name.slice(0, 1)} seed={me.user.name} />
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} role="menu">
        <div className="pop-who"><div className="nm">{me.user.name}</div><div className="s mono">{me.user.username} · {me.user.no}</div></div>
        <div className="pop-sep" />
        <div className="pop-l">演示：切换账号</div>
        {demo.map((u) => (
          <button key={u.id} type="button" role="menuitemradio" aria-checked={u.id === me.user.id} className={`pop-i${u.id === me.user.id ? ' on' : ''}`} style={item}
            onClick={() => void switchTo(u.roleKeys[0], u.name, u.roleNames[0]).catch((e: Error) => toast(e.message))}>
            <span className="nm">{u.name}</span><span className="s">{u.roleNames[0]}</span>
          </button>
        ))}
        <div className="pop-sep" />
        <button type="button" role="menuitem" className="pop-i" style={item} onClick={() => { pop.close(); setPw(true); }}><Icon name="lock" />修改密码</button>
        <button type="button" role="menuitem" className="pop-i" style={item} onClick={() => { pop.close(); void signOut(); }}><Icon name="logout" />退出登录</button>
      </Popover>
      {pw && <ChangePasswordDialog onClose={() => setPw(false)} />}
    </>
  );
}

export function Topbar() {
  const qc = useQueryClient();
  const box = useQuery({ queryKey: ['messages', 'unread'], queryFn: () => coreApi.messages({ unread: 1, size: 1 }), refetchInterval: 60_000 }).data;
  const unread = box?.unread ?? 0, urgent = box?.urgent ?? 0;
  const menu = useMenuNames();
  const m = [...useMatches()].reverse().find((x) => (x.handle as { title?: string } | undefined)?.title);
  const title = m && menu.title(m.pathname, (m.handle as { title: string }).title);
  const reset = async () => {
    if (!(await confirm({ title: '重置演示数据？', text: '登记、审批、消息、设置等所有操作都会恢复到初始状态。', okLabel: '重置' }))) return;
    await coreApi.reset();
    await qc.invalidateQueries();
    toast('演示数据已重置');
  };
  return (
    <header className="top">
      <div className="crumbs"><b>{title ?? ''}</b></div>
      {DEMO && <span className="bd warn top-demo">演示数据</span>}
      <span className="push" />
      <Link to="/messages" className={`btn btn-g btn-sm btn-ic top-bell${urgent ? ' urgent' : ''}`} title={unread ? `${unread} 条未读消息${urgent ? `，其中 ${urgent} 条紧急` : ''}` : '消息'}
        aria-label={`消息，${unread} 条未读${urgent ? `，其中 ${urgent} 条紧急` : ''}`}>
        <Icon name="bell" />{unread > 0 && <span className="top-n" aria-hidden>{unread > 99 ? '99+' : unread}</span>}
      </Link>
      {DEMO && <button type="button" className="btn btn-g btn-sm" onClick={() => void reset()}><Icon name="refresh" />重置演示</button>}
      <ThemeMenu />
      <AccountMenu />
    </header>
  );
}
