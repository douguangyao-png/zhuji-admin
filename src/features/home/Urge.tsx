import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { MSG_LEVEL_LABEL, type WfInstance } from '@/api/types';
import { useMeSure } from '@/core/me';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/Toast';

/** 申请人看自己审批中的单据：催当前节点审批人；不能催时按钮置灰，旁边写原因 */
export function UrgePanel({ inst }: { inst: WfInstance }) {
  const me = useMeSure();
  const qc = useQueryClient();
  const mine = inst.applicantId === me.user.id;
  const st = useQuery({ queryKey: ['approval', inst.id, 'urge'], queryFn: () => coreApi.urgeState(inst.id), enabled: mine }).data;
  const urge = useMutation({
    mutationFn: () => coreApi.urge(inst.id),
    onSuccess: (r) => { qc.setQueryData(['approval', inst.id, 'urge'], r); void qc.invalidateQueries({ queryKey: ['messages'] }); toast(`已催办「${inst.nodes[inst.current]?.name ?? ''}」的审批人`); },
    onError: (e: Error) => { void qc.invalidateQueries({ queryKey: ['approval', inst.id, 'urge'] }); toast(e.message, { tone: 'bad' }); },
  });
  if (!mine || !st || (inst.status !== 'pending' && !st.records.length)) return null;
  return (
    <section className="urge" aria-label="催办">
      {inst.status === 'pending' && (
        <div className="urge-h">
          <button type="button" className="btn btn-sm" disabled={!st.allowed || urge.isPending} onClick={() => urge.mutate()}><Icon name="bell" />催办</button>
          <span className="fg3">{st.reason ?? `提醒「${inst.nodes[inst.current]?.name ?? ''}」的审批人尽快处理，${st.interval} 分钟内只能催一次`}</span>
        </div>
      )}
      {st.records.length > 0 && (
        <ul className="urge-l" aria-label="催办记录">
          {st.records.map((r, i) => <li key={i}><span className="mono fg4">{r.at.slice(5, 16)}</span><span>{r.userName} 催办「{r.node}」</span><span className="fg3">待办升为{MSG_LEVEL_LABEL[r.level]}</span></li>)}
        </ul>
      )}
    </section>
  );
}
