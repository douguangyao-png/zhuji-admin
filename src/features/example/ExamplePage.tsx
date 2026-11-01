// 示例模块的列表页：筛选、分页、新增与编辑、删除、提交审批、导入、导出。新模块的页面照这个写
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHead, Search, SelectFilter } from '@/core/bits';
import { DocChip, useDocNo } from '@/core/doc';
import { downloadCsv } from '@/core/export';
import { ImportDialog } from '@/core/ImportDialog';
import { useMeSure } from '@/core/me';
import { Op } from '@/core/op';
import { useDictItems } from '@/features/system/DictText';
import { fmtMoney } from '@/lib/format';
import { useTableSort } from '@/ui/useTableSort';
import { SortTh } from '@/ui/SortTh';
import { today } from '@/lib/time';
import { deleteConfirm } from '@/ui/Confirm';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Empty, Loading, StatusTag } from '@/ui/primitives';
import { Select } from '@/ui/Select';
import { toast } from '@/ui/Toast';
import { exampleApi } from './api';
import { EXAMPLE_MAX, EXAMPLE_STATUS, type ExampleInput, type ExampleItem } from './types';

const KEY = ['example'];

/** mine：「我的登记」只看自己的；否则有审批权限的看全部 */
export function ExamplePage({ mine }: { mine?: boolean }) {
  const qc = useQueryClient();
  const me = useMeSure();
  const [sp] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [no, clearNo] = useDocNo();
  const [edit, setEdit] = useState<Partial<ExampleInput> | null>(null);
  const [importing, setImporting] = useState(false);
  const cats = useDictItems('exampleCategory');
  const catName = (code: string) => cats.find((c) => c.code === code)?.name ?? '未配置';
  const list = useQuery({ queryKey: [...KEY, mine ? 'mine' : 'all', q || no, status], queryFn: () => exampleApi.list({ q: q || no || undefined, status: status || undefined, mine: mine ? 1 : undefined, size: 500 }) });
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  const fail = (e: Error) => toast(e.message, { tone: 'bad' });
  const remove = useMutation({ mutationFn: exampleApi.remove, onSuccess: () => { void refresh(); toast('已删除'); }, onError: fail });
  const submit = useMutation({ mutationFn: exampleApi.submit, onSuccess: (x) => { void refresh(); void qc.invalidateQueries({ queryKey: ['todos'] }); toast(`已提交审批，单号 ${x.no}`); }, onError: fail });
  const rows = list.data?.items ?? [];
  const sort = useTableSort(rows, { no: (x) => x.no, title: (x) => x.title, cat: (x) => catName(x.category), amount: (x) => x.amount, date: (x) => x.date, status: (x) => x.status, owner: (x) => x.ownerName });
  const editable = (x: ExampleItem) => x.ownerId === me.user.id && (x.status === '草稿' || x.status === '已驳回');

  const exportRows = () => downloadCsv(`示例登记-${today()}`, ['单号', '标题', '类别', '金额', '日期', '状态', '登记人', '部门'],
    rows.map((x) => [x.no, x.title, catName(x.category), x.amount.toFixed(2), x.date, x.status, x.ownerName, x.unitName]));

  return (
    <div className="page">
      <PageHead title={mine ? '我的登记' : '示例登记'} sub="示例模块：照着它的 types、api、mock、页面四个文件写新模块。"
        acts={<>
          <Op k="import"><button type="button" className="btn" onClick={() => setImporting(true)}><Icon name="upload" />导入</button></Op>
          <Op k="export"><button type="button" className="btn" disabled={!rows.length} onClick={exportRows}><Icon name="download" />导出</button></Op>
          {me.can('example:edit') && <button type="button" className="btn btn-p" onClick={() => setEdit({ date: today(), category: '1', amount: 0 })}><Icon name="plus" />新增登记</button>}
        </>} />
      <div className="card">
        <div className="toolbar">
          <Search value={q} onChange={setQ} placeholder="标题、单号、登记人" />
          <SelectFilter label="状态" value={status} options={EXAMPLE_STATUS} onChange={setStatus} />
          <DocChip no={no} onClear={clearNo} />
          <span className="push fg3">{list.data ? `共 ${list.data.total} 条` : ''}</span>
        </div>
        {!list.data ? <Loading /> : !rows.length ? <Empty text="没有登记" sub="点右上角「新增登记」录一条。" /> : (
          <table className="tbl">
            <thead><tr><SortTh sort={sort} k="no">单号</SortTh><SortTh sort={sort} k="title">标题</SortTh><SortTh sort={sort} k="cat">类别</SortTh><SortTh sort={sort} k="amount" className="num">金额</SortTh><SortTh sort={sort} k="date">日期</SortTh><SortTh sort={sort} k="status">状态</SortTh>{!mine && <SortTh sort={sort} k="owner">登记人</SortTh>}<th /></tr></thead>
            <tbody>
              {sort.rows.map((x) => (
                <tr key={x.id}>
                  <td className="mono">{x.no || '—'}</td>
                  <td>{x.title}</td>
                  <td>{catName(x.category)}</td>
                  <td className="num">{fmtMoney(x.amount)}</td>
                  <td className="mono">{x.date}</td>
                  <td><StatusTag value={x.status} /></td>
                  {!mine && <td>{x.ownerName}<span className="fg4"> · {x.unitName}</span></td>}
                  <td className="act">
                    {editable(x) && <>
                      <button type="button" className="btn btn-xs btn-o" onClick={() => setEdit(x)}><Icon name="pencil" />编辑</button>
                      <button type="button" className="btn btn-xs btn-o" disabled={submit.isPending} onClick={() => submit.mutate(x.id)}><Icon name="check" />{submit.isPending && submit.variables === x.id ? '提交中…' : '提交审批'}</button>
                      <button type="button" className="btn btn-xs btn-ds" disabled={remove.isPending} onClick={async () => { if (await deleteConfirm(x.title)) remove.mutate(x.id); }}><Icon name="trash" />删除</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <EditDialog value={edit} cats={cats.filter((c) => c.active)} onClose={() => setEdit(null)} />}
      {importing && (
        <ImportDialog<ExampleInput> title="导入示例登记" name="示例登记" onClose={() => setImporting(false)}
          cols={[{ key: '标题', required: true }, { key: '类别', required: true, hint: cats.map((c) => c.name).join('、') }, { key: '金额', required: true }, { key: '日期', required: true, hint: '2026-10-31' }, { key: '备注' }]}
          example={['设备巡检 1', cats[0]?.name ?? '日常', '1200.00', today(), '']}
          preview={['标题', '类别', '金额', '日期']}
          parse={(r) => {
            const cat = cats.find((c) => c.name === r['类别']?.trim());
            if (!cat) return { error: `没有类别「${r['类别'] ?? ''}」` };
            return { item: { title: r['标题'], category: cat.code, amount: Number(r['金额']), date: r['日期'], note: r['备注'] } };
          }}
          submit={async (items) => { const n = await exampleApi.importRows(items); void refresh(); return `已导入 ${n.added} 条`; }} />
      )}
    </div>
  );
}

function EditDialog({ value, cats, onClose }: { value: Partial<ExampleInput>; cats: { code: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(value);
  const set = (p: Partial<ExampleInput>) => setF({ ...f, ...p });
  const save = useMutation({
    mutationFn: () => exampleApi.save(f as ExampleInput),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: KEY }); toast('已保存'); onClose(); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  return (
    <Dialog title={value.id ? '编辑登记' : '新增登记'} onClose={onClose}
      footer={<>
        <button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button>
        <button type="button" className="btn btn-p" disabled={!f.title?.trim() || save.isPending} onClick={() => save.mutate()}><Icon name="check" />{save.isPending ? '保存中…' : '保存'}</button>
      </>}>
      <div className="grid g-2">
        <Field label="标题" required>{(id) => <input id={id} className="input" maxLength={EXAMPLE_MAX.title} value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} />}</Field>
        <Field label="类别" required>{(id) => (
          <Select id={id} className="input" value={f.category ?? ''} onChange={(e) => set({ category: e.target.value })}>
            {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
        )}</Field>
        <Field label="金额（元）" required hint="超过 1 万元多一级业务管理员审批">{(id) => <input id={id} className="input" type="number" min={0} step="0.01" value={f.amount ?? 0} onChange={(e) => set({ amount: Number(e.target.value) })} />}</Field>
        <Field label="日期" required>{(id) => <input id={id} className="input" type="date" value={f.date ?? ''} onChange={(e) => set({ date: e.target.value })} />}</Field>
      </div>
      <Field label="备注" optional>{(id) => <textarea id={id} className="input" rows={3} maxLength={EXAMPLE_MAX.note} value={f.note ?? ''} onChange={(e) => set({ note: e.target.value })} />}</Field>
    </Dialog>
  );
}
