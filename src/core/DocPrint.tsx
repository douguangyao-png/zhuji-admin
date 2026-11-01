import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { WfInstance } from '@/api/types';
import { QrCode } from '@/lib/qr';
import { Icon } from '@/ui/Icon';
import { useFeatures } from './me';
import './doc-print.css';

/** 单据打印页：返回、二维码开关、打印；children 拿到是否带二维码 */
export function DocPrint({ back, loading, error, children }: { back: string; loading?: boolean; error?: unknown; children: (qr: boolean) => ReactNode }) {
  const [qr, setQr] = useState(true);
  return (
    <div className="page dp-print">
      <div className="dp-bar">
        <Link className="btn btn-g" to={back}><Icon name="left" />返回</Link>
        <span className="push" />
        <label><input type="checkbox" checked={qr} onChange={(e) => setQr(e.target.checked)} />打印二维码</label>
        <button type="button" className="btn btn-p" disabled={loading || Boolean(error)} onClick={() => window.print()}><Icon name="file" />打印</button>
      </div>
      {error ? <div className="card"><div className="empty"><h4>打不开这张单据</h4><p>{(error as Error).message}</p></div></div>
        : loading ? <p className="fg3">加载中…</p> : children(qr)}
    </div>
  );
}

/** 单据外框：标题、单号，可选单号二维码 */
export function DocSheet({ title, no, qr, children, foot }: { title: string; no: string; qr: boolean; children: ReactNode; foot?: ReactNode }) {
  const f = useFeatures();
  return (
    <article className="dp-sheet" aria-label={title}>
      <div className="dp-head">
        <div>
          <h2>{f.settings?.orgName ?? ''} {title}</h2>
          <div className="dp-no mono">单号 {no}</div>
        </div>
        {qr && <div className="dp-qr"><QrCode text={no} size={72} /><span className="mono">{no}</span></div>}
      </div>
      {children}
      {foot && <div className="dp-foot">{foot}</div>}
    </article>
  );
}

/** 两列一组的信息表：[标题, 内容, 是否占整行] */
export function KvTable({ rows }: { rows: [string, ReactNode, boolean?][] }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < rows.length;) {
    const [k, v, wide] = rows[i];
    const next = rows[i + 1];
    if (wide || !next || next[2]) { out.push(<tr key={k}><th>{k}</th><td colSpan={3}>{v}</td></tr>); i += 1; }
    else { out.push(<tr key={k}><th>{k}</th><td>{v}</td><th>{next[0]}</th><td>{next[1]}</td></tr>); i += 2; }
  }
  return <table className="dp-kv" data-no-sort="打印版式的键值对排版"><tbody>{out}</tbody></table>;
}

/** 按业务 id 取这张单据的全部审批记录 */
export const useApprovals = (type: string, bizId?: string) =>
  useQuery({ queryKey: ['wf-of', type, bizId], queryFn: () => coreApi.approvalsOf(type, bizId!), enabled: Boolean(bizId) });

export function ApprovalTable({ list }: { list?: WfInstance[] }) {
  const steps = (list ?? []).flatMap((w) => w.steps.map((s) => ({ ...s, flow: w.typeName })));
  const pending = (list ?? []).filter((w) => w.status === 'pending').map((w) => w.nodes[w.current]?.name).filter(Boolean);
  return (
    <>
      <h3>审批记录</h3>
      <table data-no-sort="打印版式，环节顺序有意义">
        <thead><tr><th>环节</th><th>处理人</th><th>结果</th><th>意见</th><th>时间</th></tr></thead>
        <tbody>
          {steps.map((s, i) => <tr key={i}><td>{s.node}</td><td>{s.userName}</td><td>{s.action}</td><td>{s.comment ?? ''}</td><td className="mono nw">{s.at.slice(0, 16)}</td></tr>)}
          {pending.map((n) => <tr key={`p-${n}`}><td>{n}</td><td /><td>待审批</td><td /><td /></tr>)}
          {!steps.length && !pending.length && <tr><td colSpan={5}>无需审批</td></tr>}
        </tbody>
      </table>
    </>
  );
}

/** 签字栏：纸质单据留手写签名和日期 */
export function SignRow({ labels }: { labels: string[] }) {
  return <div className="dp-sign">{labels.map((l) => <div key={l}><span>{l}：</span><i /></div>)}</div>;
}
