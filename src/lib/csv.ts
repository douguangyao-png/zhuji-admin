/** CSV 或从 Excel 复制的制表符文本，返回二维数组；去掉 UTF-8 BOM */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = []; let cell = ''; let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

/** 表头行 + 数据行转成按表头取值的记录，空行跳过 */
export function csvRecords(text: string): Record<string, string>[] {
  const [head = [], ...rows] = parseCsv(text);
  const h = head.map((x) => x.trim());
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
}
