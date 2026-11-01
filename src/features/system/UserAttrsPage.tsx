import { useState } from 'react';
import { SortTh } from '@/ui/SortTh';
import { useTableSort } from '@/ui/useTableSort';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { UserAttrDef, UserAttrType } from '@/api/types';
import { PageHead } from '@/core/bits';
import { confirm } from '@/ui/Confirm';
import { useAttrDefs } from '@/core/people';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Select } from '@/ui/Select';
import { Tag } from '@/ui/Tag';
import { toast } from '@/ui/Toast';
import { ATTR_TYPE_LABEL } from './people';

/** 与后端 UserAttrService 一致的上限 */
const NAME_MAX = 20;
const TEXT_MAX = 500;
const OPTION_LEN = 40;
const OPTIONS_MAX = 50;

/** 删除新增属性前的提示 */
export const DELETE_ATTR_TEXT = '删除后已有人员的该属性数据将一并清除，确定删除？';

/**
 * 系统管理 › 人员属性：账号、姓名、性别、证件号码、手机号是所有人通用的内置属性，只读，不能删除或作废；
 * 新增的扩展属性可选文本、日期、下拉、多选，
 * 可作废（不在人员页、导入模板里显示，已填的保留）、再启用，也可以删除（连同已填的数据一起清除）
 */
export function UserAttrsPage() {
  const qc = useQueryClient();
  const defs = useAttrDefs().data ?? [];
  const base = useQuery({ queryKey: ['userAttrBase'], queryFn: coreApi.baseUserAttrs, staleTime: 60_000 }).data ?? [];
  const [edit, setEdit] = useState<Partial<UserAttrDef> | null>(null);
  const toggle = useMutation({
    mutationFn: (d: UserAttrDef) => coreApi.saveUserAttrDef({ key: d.key, status: d.enabled ? 'void' : 'active' }),
    onSuccess: (d) => { void qc.invalidateQueries({ queryKey: ['userAttrDefs'] }); void qc.invalidateQueries({ queryKey: ['peopleCategories'] }); toast(`${d.name}已${d.enabled ? '启用' : '作废'}`); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const remove = useMutation({
    mutationFn: (d: UserAttrDef) => coreApi.deleteUserAttrDef(d.key),
    onSuccess: (_r, d) => { void qc.invalidateQueries({ queryKey: ['userAttrDefs'] }); void qc.invalidateQueries({ queryKey: ['peopleCategories'] }); void qc.invalidateQueries({ queryKey: ['users'] }); toast(`已删除 ${d.name}`); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const askDelete = async (d: UserAttrDef) => {
    if (remove.isPending) return;
    if (await confirm({ title: `删除属性 · ${d.name}`, text: DELETE_ATTR_TEXT, okLabel: '删除', danger: true })) remove.mutate(d);
  };
  const busy = toggle.isPending || remove.isPending;
  // 内置属性在前、扩展属性在后合成一张表排序；不排序时保持这个顺序
  const merged = [...base.map((d) => ({ base: true as const, d })), ...defs.map((d) => ({ base: false as const, d }))];
  const sort = useTableSort(merged, {
    name: (x) => x.d.name,
    type: (x) => ATTR_TYPE_LABEL[x.d.type],
    maxLen: (x) => (x.base || x.d.type === 'text' ? x.d.maxLen : null),
    options: (x) => (x.base ? null : x.d.options?.join('、')),
    source: (x) => (x.base ? '内置' : (x.d as UserAttrDef).builtin ? '预置' : '扩展'),
    state: (x) => (x.base ? '启用' : (x.d as UserAttrDef).enabled ? '启用' : '作废'),
    sort: (x) => x.d.sort,
  });
  const baseRow = (d: (typeof base)[number]) => (
    <tr key={d.key}>
      <td><b>{d.name}</b></td>
      <td>{ATTR_TYPE_LABEL[d.type]}</td>
      <td>{d.maxLen} 字</td>
      <td>—</td>
      <td><Tag tone="info">内置</Tag></td>
      <td><Tag tone="good">启用</Tag></td>
      <td className="mono">{d.sort}</td>
      <td className="act"><span className="fg3">所有人通用，不能删除或作废</span></td>
    </tr>
  );
  const defRow = (d: UserAttrDef) => (
    <tr key={d.key}>
      <td><b>{d.name}</b></td>
      <td>{ATTR_TYPE_LABEL[d.type]}</td>
      <td>{d.type === 'text' ? `${d.maxLen} 字` : '—'}</td>
      <td style={{ whiteSpace: 'normal' }}>{d.options?.join('、') || '—'}</td>
      <td>{d.builtin ? <Tag tone="info">预置</Tag> : <span className="fg3">扩展</span>}</td>
      <td><Tag tone={d.enabled ? 'good' : 'flat'}>{d.enabled ? '启用' : '作废'}</Tag></td>
      <td className="mono">{d.sort}</td>
      <td className="act">
        <button type="button" className="btn btn-xs btn-o" aria-label={`编辑 ${d.name}`} onClick={() => setEdit(d)}><Icon name="pencil" />编辑</button>
        {!d.builtin && <button type="button" className="btn btn-xs btn-g" disabled={busy} onClick={() => toggle.mutate(d)}><Icon name="power" />{d.enabled ? '作废' : '启用'}</button>}
        {!d.builtin && <button type="button" className="btn btn-xs btn-ds" aria-label={`删除 ${d.name}`} disabled={busy} onClick={() => void askDelete(d)}><Icon name="trash" />删除</button>}
      </td>
    </tr>
  );
  return (
    <div className="page">
      <PageHead title="人员属性" sub="账号、姓名、性别、证件号码、手机号是所有人通用的内置属性，不能删除或作废；其余是扩展属性，可以作废（不显示，数据保留）、再启用或删除；「人员」页显示全部启用的属性。"
        acts={<button type="button" className="btn btn-p" onClick={() => setEdit({ type: 'text', maxLen: 64, sort: 100, enabled: true })}><Icon name="plus" />新增属性</button>} />
      <div className="card">
        <table className="tbl">
          <thead><tr><SortTh sort={sort} k="name">名称</SortTh><SortTh sort={sort} k="type">类型</SortTh><SortTh sort={sort} k="maxLen">最大长度</SortTh><SortTh sort={sort} k="options">下拉选项</SortTh><SortTh sort={sort} k="source">来源</SortTh><SortTh sort={sort} k="state">状态</SortTh><SortTh sort={sort} k="sort">排序</SortTh><th /></tr></thead>
          <tbody>
            {sort.rows.map((x) => (x.base ? baseRow(x.d) : defRow(x.d as UserAttrDef)))}
          </tbody>
        </table>
      </div>
      {edit && <AttrDialog def={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function AttrDialog({ def, onClose }: { def: Partial<UserAttrDef>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: def.name ?? '', type: (def.type ?? 'text') as UserAttrType, maxLen: def.maxLen ?? 64, options: (def.options ?? []).join('\n'), sort: def.sort ?? 100 });
  const builtin = Boolean(def.builtin);
  const save = useMutation({
    mutationFn: () => coreApi.saveUserAttrDef(builtin ? { key: def.key, name: f.name.trim(), sort: f.sort }
      : { key: def.key, name: f.name.trim(), type: f.type, sort: f.sort, ...(f.type === 'text' ? { maxLen: f.maxLen } : {}), ...(f.type === 'select' || f.type === 'multi' ? { options: f.options.split('\n').map((s) => s.trim()).filter(Boolean) } : {}) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['userAttrDefs'] }); void qc.invalidateQueries({ queryKey: ['peopleCategories'] }); toast('已保存'); onClose(); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  return (
    <Dialog title={def.key ? `编辑属性 · ${def.name}` : '新增人员属性'} sub={builtin ? '预置属性只能修改名称和排序' : undefined} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button>
        <button type="button" className="btn btn-p" disabled={!f.name.trim() || save.isPending} onClick={() => save.mutate()}><Icon name="check" />{save.isPending ? '保存中…' : '保存'}</button></>}>
      <div className="grid g-2">
        <Field label="名称" required hint={`最多 ${NAME_MAX} 字，如 认证机构`}>{(id) => <input id={id} className="input" value={f.name} maxLength={NAME_MAX} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="类型">{(id) => (
          <Select id={id} className="input" value={f.type} disabled={builtin} onChange={(e) => setF({ ...f, type: e.target.value as UserAttrType })}>
            {(Object.keys(ATTR_TYPE_LABEL) as UserAttrType[]).map((k) => <option key={k} value={k}>{ATTR_TYPE_LABEL[k]}</option>)}
          </Select>
        )}</Field>
        {f.type === 'text' && <Field label="最大长度（字）" hint={`1 到 ${TEXT_MAX}`}>{(id) => (
          <input id={id} type="number" className="input" min={1} max={TEXT_MAX} value={f.maxLen} disabled={builtin} onChange={(e) => setF({ ...f, maxLen: Number(e.target.value) || 0 })} />
        )}</Field>}
        <Field label="排序" hint="小的在前，0 到 9999">{(id) => <input id={id} type="number" className="input" min={0} max={9999} value={f.sort} onChange={(e) => setF({ ...f, sort: Number(e.target.value) || 0 })} />}</Field>
      </div>
      {(f.type === 'select' || f.type === 'multi') && <Field label={f.type === 'multi' ? '多选选项' : '下拉选项'} required hint={`一行一个，最多 ${OPTIONS_MAX} 个，每个最多 ${OPTION_LEN} 字`}>{(id) => (
        <textarea id={id} className="input" rows={5} value={f.options} disabled={builtin} maxLength={OPTIONS_MAX * (OPTION_LEN + 1)} onChange={(e) => setF({ ...f, options: e.target.value })} />
      )}</Field>}
    </Dialog>
  );
}
