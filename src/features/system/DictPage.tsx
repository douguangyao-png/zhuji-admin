import { useState } from 'react';
import { SortTh } from '@/ui/SortTh';
import { useTableSort } from '@/ui/useTableSort';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { DictItem } from '@/api/types';
import { PageHead } from '@/core/bits';
import { confirm } from '@/ui/Confirm';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/Toast';
import { SideFoldButton, SideGrid } from '@/ui/SidePane';

type DictTypeRow = { key: string; name: string; parentId?: string | null };
type CatEdit = { mode: 'add' | 'rename'; parentId?: string; key?: string; name?: string };

export function DictPage() {
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ['dict-types'], queryFn: coreApi.dictTypes }).data ?? [];
  const [type, setType] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [catEdit, setCatEdit] = useState<CatEdit | null>(null);
  const parents = types.filter((t) => !t.parentId);
  const childrenOf = (id: string) => types.filter((t) => t.parentId === id);
  const firstLeaf = types.find((t) => childrenOf(t.key).length === 0) ?? types[0];
  const cur = type || firstLeaf?.key || '';
  const curType = types.find((t) => t.key === cur);
  const hasChildren = curType ? childrenOf(curType.key).length > 0 : false;
  const items = useQuery({ queryKey: ['dicts', cur, 'all'], queryFn: () => coreApi.dicts(cur, true), enabled: Boolean(cur) && !hasChildren }).data ?? [];
  const removed = useQuery({ queryKey: ['dicts', 'removed', cur], queryFn: () => coreApi.removedDicts(cur), enabled: Boolean(cur) && !hasChildren }).data ?? [];
  const sort = useTableSort(items, { code: (d) => d.code, name: (d) => d.name, sort: (d) => d.sort, active: (d) => d.active });
  const sortRemoved = useTableSort(removed, { code: (d) => d.code, name: (d) => d.name });
  const [showRemoved, setShowRemoved] = useState(false);
  const [name, setName] = useState('');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['dicts'] }); void qc.invalidateQueries({ queryKey: ['dict-types'] }); };
  const add = useMutation({
    mutationFn: (n: string) => coreApi.addDict(cur, n),
    onSuccess: (d) => { refresh(); setName(''); toast(`已添加「${d.name}」`); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const submit = () => { const n = name.trim(); if (n && !add.isPending) add.mutate(n); };
  const save = useMutation({ mutationFn: coreApi.saveDict, onSuccess: () => void refresh() });
  const remove = useMutation({
    mutationFn: coreApi.deleteDict,
    onSuccess: (r) => { refresh(); toast(`已删除${r.usage ? `，${r.usage} 条历史数据会显示为「未配置」` : ''}`); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const restore = useMutation({ mutationFn: coreApi.restoreDict, onSuccess: () => { refresh(); toast('已恢复'); }, onError: (e: Error) => toast(e.message, { tone: 'bad' }) });
  const delType = useMutation({ mutationFn: coreApi.deleteDictType, onSuccess: () => { setType(''); refresh(); toast('已删除分类'); }, onError: (e: Error) => toast(e.message, { tone: 'bad' }) });
  const askDelete = async (d: DictItem) => {
    const { usage } = await coreApi.dictUsage(d.id);
    if (await confirm({
      title: '您确定要删除吗？',
      text: `将删除字典项「${d.name}」。` + (usage ? `有 ${usage} 条业务数据用了这一项。删除后历史数据保留原值，界面显示为「未配置」；可以到回收列表恢复。` : '没有业务数据用到这一项。删除后可以到回收列表恢复。'),
      okLabel: '删除', danger: true,
    })) remove.mutate(d.id);
  };
  const toggle = (key: string) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  return (
    <div className="page">
      <PageHead title="字典" sub="分类最多两级；有子分类的父分类不能直接配置字典项。停用后新单据里不再出现，历史数据照常显示。" />
      <SideGrid id="system.dict" label="分类">
        <div className="card">
          <div className="card-h b"><span className="card-t">分类</span><button type="button" className="btn btn-xs btn-g push" onClick={() => setCatEdit({ mode: 'add' })}><Icon name="plus" />一级分类</button><SideFoldButton /></div>
          <div className="role-l">
            {/* 选中分类后的操作放在树的顶部，和其他树形页面一致 */}
            <div className="tree-top">
              <button type="button" className={`role-i${!cur ? ' on' : ''}`} onClick={() => setType('')}><b>全部</b><span className="mono fg3">{types.length}</span></button>
              {curType && (
                <span className="tree-acts" title={`对「${curType.name}」操作`}>
                  {!curType.parentId && <button type="button" className="btn btn-xs btn-g" aria-label={`给 ${curType.name} 加子分类`} onClick={() => setCatEdit({ mode: 'add', parentId: curType.key })}><Icon name="plus" />子分类</button>}
                  <button type="button" className="btn btn-xs btn-g" aria-label={`改名 ${curType.name}`} onClick={() => setCatEdit({ mode: 'rename', key: curType.key, name: curType.name })}><Icon name="pencil" />改名</button>
                  <button type="button" className="btn btn-xs btn-ds" aria-label={`删除 ${curType.name}`} onClick={async () => { if (await confirm({ title: '您确定要删除吗？', text: `将删除分类「${curType.name}」。分类下还有子分类或字典项时不能删除。`, okLabel: '删除', danger: true })) delType.mutate(curType.key); }}><Icon name="trash" />删除</button>
                </span>
              )}
            </div>
            {parents.map((p) => {
              const kids = childrenOf(p.key);
              return (
                <div key={p.key}>
                  <button type="button" className={`role-i${cur === p.key ? ' on' : ''}`} onClick={() => setType(p.key)}>
                    {kids.length > 0 && (
                      <span role="button" tabIndex={0} aria-label={open.has(p.key) ? `收起 ${p.name}` : `展开 ${p.name}`} style={{ width: 14, color: 'var(--fg-3)' }}
                        onClick={(e) => { e.stopPropagation(); toggle(p.key); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(p.key); } }}>
                        {open.has(p.key) ? '▾' : '▸'}
                      </span>
                    )}
                    <b>{p.name}</b><span className="mono fg3">{kids.length ? kids.length : '—'}</span>
                  </button>
                  {open.has(p.key) && kids.map((c) => (
                    <button key={c.key} type="button" className={`role-i${cur === c.key ? ' on' : ''}`} style={{ paddingLeft: 26 }} onClick={() => setType(c.key)}><span>{c.name}</span></button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          {hasChildren ? (
            <div className="card-b fg3">「{curType?.name}」下面还有子分类，请选择子分类配置字典项。</div>
          ) : (
            <>
              <div className="toolbar">
                <input className="input" style={{ width: 240 }} value={name} placeholder="新增一项" aria-label="新增字典项" onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }} />
                <button type="button" className="btn btn-sm" disabled={!name.trim() || add.isPending} onClick={submit}><Icon name="plus" />{add.isPending ? '添加中…' : '添加'}</button>
                <span className="push" />
                <button type="button" className="btn btn-sm" disabled={!removed.length} onClick={() => setShowRemoved(true)}><Icon name="archive" />已删除{removed.length ? `（${removed.length}）` : ''}</button>
              </div>
              <table className="tbl">
                <thead><tr><SortTh sort={sort} k="code" style={{ width: 70 }}>编码</SortTh><SortTh sort={sort} k="name">名称</SortTh><SortTh sort={sort} k="sort" style={{ width: 90 }}>排序号</SortTh><SortTh sort={sort} k="active" style={{ width: 90 }}>启用</SortTh><th style={{ width: 60 }} /></tr></thead>
                <tbody>
                  {sort.rows.map((d) => (
                    <tr key={d.id}>
                      <td className="mono">{d.code}</td>
                      <td><input className="input in-line" defaultValue={d.name} aria-label="名称"
                        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== d.name) save.mutate({ id: d.id, name: v }); }} /></td>
                      <td><input className="input in-line mono" type="number" min={0} max={9999} defaultValue={d.sort} aria-label={`${d.name} 排序号`}
                        onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isInteger(v) && v >= 0 && v !== d.sort) save.mutate({ id: d.id, sort: v }); else e.target.value = String(d.sort); }} /></td>
                      <td><button type="button" role="switch" aria-checked={d.active} aria-label={`${d.name} 启用`} className={`sw${d.active ? ' on' : ''}`} onClick={() => save.mutate({ id: d.id, active: !d.active })} /></td>
                      <td className="act"><button type="button" className="btn btn-xs btn-ds" aria-label={`删除 ${d.name}`} onClick={() => void askDelete(d)}><Icon name="trash" />删除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </SideGrid>
      {catEdit && <CatDialog c={catEdit} types={types} onClose={() => setCatEdit(null)} onSaved={refresh} />}
      {showRemoved && (
        <Dialog title="已删除的字典项" sub={`${types.find((t) => t.key === cur)?.name ?? ''} · 恢复后重新出现在下拉选项里，历史数据照常显示。`} onClose={() => setShowRemoved(false)}
          footer={<button type="button" className="btn" onClick={() => setShowRemoved(false)}><Icon name="x" />关闭</button>}>
          {removed.length === 0 ? <p className="fg3">没有已删除的字典项。</p> : (
            <table className="tbl">
              <thead><tr><SortTh sort={sortRemoved} k="code" style={{ width: 70 }}>编码</SortTh><SortTh sort={sortRemoved} k="name">名称</SortTh><th style={{ width: 80 }} /></tr></thead>
              <tbody>{sortRemoved.rows.map((d) => (
                <tr key={d.id}><td className="mono">{d.code}</td><td>{d.name}</td>
                  <td className="act"><button type="button" className="btn btn-xs" disabled={restore.isPending} onClick={() => restore.mutate(d.id)}><Icon name="refresh" />恢复</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </Dialog>
      )}
    </div>
  );
}

function CatDialog({ c, types, onClose, onSaved }: { c: CatEdit; types: DictTypeRow[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(c.name ?? '');
  const parent = c.parentId ? types.find((t) => t.key === c.parentId) : undefined;
  const save = useMutation({
    mutationFn: () => (c.mode === 'add' ? coreApi.addDictType(name.trim(), parent?.key) : coreApi.renameDictType(c.key!, name.trim())),
    onSuccess: () => { onSaved(); toast('已保存'); onClose(); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  return (
    <Dialog title={c.mode === 'add' ? (parent ? `在「${parent.name}」下加子分类` : '新增一级分类') : '分类改名'} size="sm" onClose={onClose}
      footer={<><span className="grow" /><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button><button type="button" className="btn btn-p" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}><Icon name="check" />保存</button></>}>
      <Field label="名称" required hint="分类名称可以随时改，不影响已有数据">{(id) => <input id={id} className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />}</Field>
    </Dialog>
  );
}
