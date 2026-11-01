// 首页的两张通用卡片：快捷入口、我发起的审批；业务模块的卡片放在各自 ModuleDef.home 里
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { visibleModules } from '@/app/modules';
import { useFeatures, useMeSure } from '@/core/me';
import { useMenuNames } from '@/core/menu-names';
import { menuAllowed } from '@/core/module';
import { Icon } from '@/ui/Icon';
import { WfStatusTag } from './ApprovalsPage';

/** 快捷入口：当前用户能打开的业务菜单，最多 8 个；系统管理和帮助不放 */
export function QuickCard() {
  const me = useMeSure();
  const f = useFeatures();
  const menu = useMenuNames();
  const items = visibleModules(f.on).filter((m) => m.key !== 'system' && m.key !== 'help')
    .flatMap((m) => m.menu.filter((i) => menuAllowed(i, me.can) && f.on(i.feature))).slice(0, 8);
  return (
    <div className="card">
      <div className="card-h b"><span className="card-t">快捷入口</span></div>
      {items.length === 0 ? <div className="card-b fg3">没有可用的业务菜单。</div> : (
        <div className="todo-g">
          {items.map((i) => (
            <Link key={i.to} to={i.to} className="todo-i">
              <span className="todo-m"><Icon name={i.icon} /></span>
              <span className="todo-l">{menu.name(i.to, i.name)}</span>
              <Icon name="right" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** 我发起的审批：最近 5 条，点开到「审批」页 */
export function MyApprovalsCard() {
  const list = useQuery({ queryKey: ['approvals', 'mine', 'home'], queryFn: () => coreApi.approvals({ scope: 'mine', size: 5 }) }).data;
  return (
    <div className="card">
      <div className="card-h b">
        <span className="card-t">我发起的审批</span>
        <span className="push" />
        <Link to="/approvals" className="link">全部<Icon name="right" /></Link>
      </div>
      {!list ? <div className="card-b fg3">加载中…</div> : list.items.length === 0 ? <div className="card-b fg3">还没有发起过审批。</div> : (
        // 不排序：首页卡片列表，无表头
        <table className="tbl">
          <tbody>
            {list.items.map((i) => (
              <tr key={i.id}>
                <td>{i.typeName}</td>
                <td>{i.title}</td>
                <td><WfStatusTag s={i.status} /></td>
                <td className="mono fg3">{i.createdAt.slice(5, 16)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
