import { useState } from 'react';
import { csvRecords } from '@/lib/csv';
import { readSheet, SHEET_ACCEPT } from '@/lib/sheet';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/Toast';

/** 选 Excel / CSV 文件，按第一行表头读成记录；没有数据行时提示，不回调 */
export function SheetDrop({ hint, onRows }: { hint?: string; onRows: (rows: Record<string, string>[], fileName: string) => void }) {
  const [busy, setBusy] = useState(false);
  const read = async (f: File) => {
    setBusy(true);
    try {
      const rows = csvRecords(await readSheet(f));
      if (!rows.length) toast(`${f.name} 里没有数据行：第一行是表头，从第二行起是数据`, { tone: 'bad' });
      else onRows(rows, f.name);
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="drop">
      <Icon name="upload" /><b>{busy ? '正在读取…' : '选择 Excel 或 CSV 文件'}</b>{hint && <span>{hint}</span>}
      <input type="file" accept={SHEET_ACCEPT} hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
    </label>
  );
}
