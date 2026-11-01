import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { OrgUnit, UnitType } from '@/api/types';
import { PageHead } from '@/core/bits';
import { deleteConfirm } from '@/ui/Confirm';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/primitives';
import { toast } from '@/ui/Toast';
import { Select } from '@/ui/Select';

const TYPE: Record<UnitType, string> = { center: '单位', dept: '部门', office: '科室' };

export function OrgPage() {
  const qc = useQueryClient();
  const units = useQuery({ queryKey: ['units'], queryFn: coreApi.units });
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => coreApi.users({ size: 500 }) });
  const [edit, setEdit] = useState<Partial<OrgUnit> | null>(null);
  // 默认展开根节点，下级可见；点前面的箭头展开或收起
  const [openSet, setOpen] = useState<Set<string> | null>(null);
  const del = useMutation({
    mutationFn: coreApi.deleteUnit,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['units'] }); toast('已删除'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  if (!units.data) return <div className="page"><Loading /></div>;

  const list = units.data;
  const count = (id: string) => users.data?.items.filter((u) => u.unitId === id).length ?? 0;
  const headName = (id?: string) => users.data?.items.find((u) => u.id === id)?.name ?? '—';
  const open = openSet ?? new Set(list.filter((u) => u.parentId === null).map((u) => u.id));
  const rows: { u: OrgUnit; depth: number; hasChild: boolean }[] = [];
  const walk = (pid: string | null, depth: number) => list.filter((u) => u.parentId === pid).forEach((u) => {
    const hasChild = list.some((x) => x.parentId === u.id);
    rows.push({ u, depth, hasChild });
    if (open.has(u.id)) walk(u.id, depth + 1);
  });
  walk(null, 0);

  return (
    <div className="page">
      <PageHead title="组织机构" sub={`${list.length} 个组织；人员、数据范围、审批里的「部门负责人」都按这里取。`}
        acts={<button type="button" className="btn btn-p" onClick={() => setEdit({ type: 'dept', parentId: 'C0' })}><Icon name="plus" />新增组织</button>} />
      <div className="card">
        <table className="tbl" data-no-sort="树形结构，排序会破坏层级">
          <thead><tr><th>名称</th><th>编码</th><th>类型</th><th>负责人</th><th className="num">人员</th><th /></tr></thead>
          <tbody>
            {rows.map(({ u, depth, hasChild }) => (
              <tr key={u.id}>
                <td style={{ paddingLeft: 16 + depth * 22 }}>
                  {hasChild
                    ? <button type="button" className="btn btn-xs btn-g btn-ic" aria-label={`${open.has(u.id) ? '收起' : '展开'}${u.name}`} aria-expanded={open.has(u.id)}
                        onClick={() => setOpen(() => { const n = new Set(open); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}><Icon name="arrow" />{open.has(u.id) ? '▾' : '▸'}</button>
                    : <span style={{ display: 'inline-block', width: 26 }} />}
                  {depth > 0 && <span className="fg4">└ </span>}{u.name}
                </td>
                <td className="mono">{u.code}</td>
                <td>{TYPE[u.type]}</td>
                <td>{headName(u.headId)}</td>
                <td className="num">{count(u.id)}</td>
                <td className="act">
                  <button type="button" className="btn btn-xs btn-o" onClick={() => setEdit(u)}><Icon name="pencil" />编辑</button>
                  {u.parentId && <button type="button" className="btn btn-xs btn-ds" onClick={async () => { if (await deleteConfirm(u.name)) del.mutate(u.id); }}><Icon name="trash" />删除</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <UnitDialog unit={edit} units={list} onClose={() => setEdit(null)} />}
    </div>
  );
}

function UnitDialog({ unit, units, onClose }: { unit: Partial<OrgUnit>; units: OrgUnit[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(unit);
  const save = useMutation({
    mutationFn: coreApi.saveUnit,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['units'] }); toast('已保存'); onClose(); },
  });
  return (
    <Dialog title={unit.id ? '编辑组织' : '新增组织'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button><button type="button" className="btn btn-p" disabled={!f.name?.trim()} onClick={() => save.mutate(f)}><Icon name="check" />保存</button></>}>
      <div className="grid g-2">
        <Field label="名称" required>{(id) => <input id={id} className="input" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="编码" optional>{(id) => <input id={id} className="input mono" value={f.code ?? ''} onChange={(e) => setF({ ...f, code: e.target.value })} />}</Field>
        <Field label="类型">{(id) => (
          <Select id={id} className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as UnitType })}>
            {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}</Field>
        <Field label="上级">{(id) => (
          <Select id={id} className="input" value={f.parentId ?? ''} onChange={(e) => setF({ ...f, parentId: e.target.value || null })}>
            {units.filter((u) => u.id !== f.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}</Field>
      </div>
    </Dialog>
  );
}
