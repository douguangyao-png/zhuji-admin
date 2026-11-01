import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/ui/Icon';
import { exampleApi } from './api';

/** 首页卡片：自己被驳回、还没重新提交的示例登记；卡片键 ex-rejected 要在 features/home/catalog.ts 里登记名称 */
export function RejectedCard() {
  const list = useQuery({ queryKey: ['example', 'mine', 'rejected'], queryFn: () => exampleApi.list({ mine: 1, status: '已驳回', size: 5 }) }).data;
  return (
    <div className="card">
      <div className="card-h b">
        <span className="card-t">被驳回的示例登记</span>
        <span className="card-s">{list ? `${list.total} 条` : ''}</span>
        <span className="push" />
        <Link to="/example/mine?status=已驳回" className="link">去处理<Icon name="right" /></Link>
      </div>
      {!list ? <div className="card-b fg3">加载中…</div> : list.items.length === 0 ? <div className="card-b fg3">没有被驳回的登记。</div> : (
        // 不排序：首页卡片摘要，无表头
        <table className="tbl">
          <tbody>{list.items.map((x) => <tr key={x.id}><td className="mono">{x.no}</td><td>{x.title}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
