import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { csvRecords } from '@/lib/csv';
import { downloadXlsx } from '@/lib/sheet';
import { today } from '@/lib/time';
import { readXlsx, toCsv } from '@/lib/xlsx';
import { Dialog } from '@/ui/Dialog';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/Toast';

export interface ImportCol { key: string; required?: boolean; hint?: string }
export type Parsed<T> = { item?: T; error?: string };

function template(name: string, cols: ImportCol[], example: string[]) {
  downloadXlsx(`${name}导入模板-${today()}`, [cols.map((c) => c.key), example]);
}

/** 批量导入：选 Excel（.xlsx）、CSV 或从 Excel 复制粘贴，逐行校验后预览，有错的行不提交 */
export function ImportDialog<T>({ title, name, cols, example, parse, preview, submit, onClose, onTemplate }: {
  title: string;
  /** 模板文件名前缀 */
  name: string;
  cols: ImportCol[];
  example: string[];
  /** 一行记录转成提交对象；返回 error 时这一行标红不提交 */
  parse: (r: Record<string, string>) => Parsed<T>;
  /** 预览表显示的列（表头里的字段名） */
  preview: string[];
  submit: (items: T[]) => Promise<string>;
  onClose: () => void;
  /** 模板带现成数据时（如盘点单的账面清单）由调用方生成 */
  onTemplate?: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const recs = useMemo(() => csvRecords(text), [text]);
  const missing = recs.length ? cols.filter((c) => c.required && !(c.key in recs[0])).map((c) => c.key) : [];
  const rows = useMemo(() => recs.map((r) => {
    const empty = cols.filter((c) => c.required && !r[c.key]).map((c) => c.key);
    return { r, ...(empty.length ? { error: `${empty.join('、')}没填` } : parse(r)) };
  }), [recs, cols, parse]);
  const ok = rows.filter((x) => x.item && !x.error);
  const bad = rows.length - ok.length;
  const go = useMutation({
    mutationFn: () => submit(ok.map((x) => x.item as T)),
    onSuccess: (msg) => { void qc.invalidateQueries(); toast(msg); onClose(); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const [fileErr, setFileErr] = useState('');
  const read = async (f?: File) => {
    if (!f) return;
    setFileErr('');
    try {
      if (/\.xls$/i.test(f.name)) throw new Error('旧版 .xls 读不了，请在 Excel 里另存为 .xlsx 或 CSV 再选');
      setText(/\.xlsx$/i.test(f.name) ? toCsv(await readXlsx(await f.arrayBuffer())) : await f.text());
    } catch (e) { setFileErr((e as Error).message); }
  };

  return (
    <Dialog title={title} size="lg" onClose={onClose}
      sub={<>表头：{cols.map((c, i) => <span key={c.key}>{i > 0 && '、'}{c.key}{c.required && <b className="imp-err">*</b>}</span>)}。带 * 的必填；可以直接从 Excel 复制整张表粘贴进来。</>}
      footer={<>
        <span className="grow">{rows.length ? `${rows.length} 行，可导入 ${ok.length} 行${bad ? `，${bad} 行有问题不导入` : ''}` : ''}</span>
        <button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button>
        <button type="button" className="btn btn-p" disabled={!ok.length || missing.length > 0 || go.isPending} onClick={() => go.mutate()}><Icon name="check" />{ok.length ? `导入 ${ok.length} 行` : '导入'}</button>
      </>}>
      <div className="stack">
        <label className="drop"><Icon name="upload" /><b>选择 Excel 或 CSV 文件</b><span>.xlsx 读第一张工作表；也可以把内容粘贴到下面</span><input type="file" accept=".xlsx,.xls,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {fileErr && <div className="note crit" role="alert"><Icon name="alert" /><span>{fileErr}</span></div>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="fg3" style={{ fontSize: 12.5 }}>{cols.filter((c) => c.hint).map((c) => `${c.key}：${c.hint}`).join('；')}</span>
          <button type="button" className="btn btn-sm" onClick={() => (onTemplate ? onTemplate() : template(name, cols, example))}><Icon name="download" />下载模板</button>
        </div>
        <textarea className="input mono" rows={6} aria-label="导入内容" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={`${cols.map((c) => c.key).join(',')}\n${example.join(',')}`} />
        {missing.length > 0 && <div className="note crit" role="alert"><Icon name="alert" /><span>表头缺少：{missing.join('、')}</span></div>}
        {rows.length > 0 && (
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            {/* 不排序：导入预览，行号对应导入文件的行 */}
            <table className="tbl">
              <thead><tr><th className="num">行</th>{preview.map((h) => <th key={h}>{h}</th>)}<th>校验</th></tr></thead>
              <tbody>{rows.map((x, i) => (
                <tr key={i}>
                  <td className="num mono fg3">{i + 2}</td>
                  {preview.map((h) => <td key={h} className="nw">{x.r[h] || <span className="fg4">—</span>}</td>)}
                  <td>{x.error ? <span className="imp-err">{x.error}</span> : <span className="fg3">可导入</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}
