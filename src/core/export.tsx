import { useEffect, useState } from 'react';
import { Dialog } from '@/ui/Dialog';
import { toast } from '@/ui/Toast';
import { Icon } from '@/ui/Icon';

export interface ExportRequest {
  name: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

const EVT = 'app:export';
// 外壳里挂了 ExportHost 才弹列选择；组件单独渲染（测试、嵌入页）直接下载
let hosts = 0;

/** CSV 带 BOM，Excel 直接打开不乱码 */
export function writeCsv({ name, headers, rows }: ExportRequest) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  try {
    const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name.endsWith('.csv') ? name : `${name}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch { /* 测试环境没有 createObjectURL */ }
}

/** 全站导出的入口：外壳在时先让用户勾选要导出的列，默认全选 */
export function downloadCsv(name: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  if (!hosts) { writeCsv({ name, headers, rows }); return; }
  window.dispatchEvent(new CustomEvent<ExportRequest>(EVT, { detail: { name, headers, rows } }));
}

export function ExportHost() {
  const [req, setReq] = useState<ExportRequest | null>(null);
  useEffect(() => {
    hosts++;
    const on = (e: Event) => setReq((e as CustomEvent<ExportRequest>).detail);
    window.addEventListener(EVT, on);
    return () => { hosts--; window.removeEventListener(EVT, on); };
  }, []);
  return req ? <ExportDialog req={req} onClose={() => setReq(null)} /> : null;
}

function ExportDialog({ req, onClose }: { req: ExportRequest; onClose: () => void }) {
  const [on, setOn] = useState<Set<number>>(() => new Set(req.headers.map((_, i) => i)));
  const toggle = (i: number) => setOn((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const all = on.size === req.headers.length;
  const go = () => {
    const idx = req.headers.map((_, i) => i).filter((i) => on.has(i));
    writeCsv({ name: req.name, headers: idx.map((i) => req.headers[i]), rows: req.rows.map((r) => idx.map((i) => r[i])) });
    toast(`已导出 ${idx.length} 列、${req.rows.length} 行`);
    onClose();
  };
  return (
    <Dialog title="导出" sub={`${req.name} · 共 ${req.rows.length} 行。勾选要导出的列，默认全选。`} onClose={onClose}
      footer={<>
        <span className="grow fg3" style={{ fontSize: 12.5 }}>已选 {on.size} / {req.headers.length} 列</span>
        <button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button>
        <button type="button" className="btn btn-p" disabled={!on.size} onClick={go}><Icon name="download" />导出</button>
      </>}>
      <div className="toolbar" style={{ padding: 0, marginBottom: 10 }}>
        <button type="button" className="btn btn-sm" onClick={() => setOn(all ? new Set() : new Set(req.headers.map((_, i) => i)))}><Icon name="arrow" />{all ? '全不选' : '全选'}</button>
      </div>
      <div className="export-cols">
        {req.headers.map((h, i) => (
          <label key={`${h}-${i}`} className="cb-l">
            <input type="checkbox" checked={on.has(i)} onChange={() => toggle(i)} />
            {h}
          </label>
        ))}
      </div>
    </Dialog>
  );
}
