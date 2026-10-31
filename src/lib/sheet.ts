import { APP } from '@/app.config';
// 导入用的表格读写：.xlsx 真实后端交给 /files/sheet 解析，模拟层在浏览器里按同样规则解析；模板生成不压缩的 .xlsx，不依赖第三方库

export const SHEET_ACCEPT = '.xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** 与后端 SheetReader 一致 */
export const MAX_ROWS = 20000;
const MAX_BYTES = 50 * 1024 * 1024;

const isXlsx = (f: File) => /\.xlsx$/i.test(f.name) || f.type === XLSX_TYPE;

/** 读成 CSV 文本，交给 parseCsv / csvRecords */
export async function readSheet(f: File): Promise<string> {
  if (/\.xls$/i.test(f.name)) throw new Error('不支持 .xls，请在 Excel 里另存为 .xlsx 或 .csv');
  if (!isXlsx(f)) return decodeText(f);
  if (import.meta.env.VITE_API === 'server') {
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch(`${APP.apiBase}/files/sheet`, { method: 'POST', body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.code !== 0) throw new Error(json.message ?? '文件读取失败');
    return toCsv(json.data.rows as string[][]);
  }
  return toCsv(await parseXlsx(await bytes(f)));
}

/** 老浏览器和 jsdom 的 File 没有 arrayBuffer()，退回 FileReader */
const bytes = (f: File) => (typeof f.arrayBuffer === 'function' ? f.arrayBuffer().then((b) => new Uint8Array(b)) : new Promise<Uint8Array>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(new Uint8Array(r.result as ArrayBuffer));
  r.onerror = () => bad(r.error);
  r.readAsArrayBuffer(f);
}));

/** UTF-8 不合法时按 GBK：Excel 中文版另存的 CSV 默认是 GBK */
async function decodeText(f: File): Promise<string> {
  const buf = await bytes(f);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('gbk').decode(buf); }
}

export function toCsv(rows: string[][]): string {
  const esc = (s: string) => (/[",\t\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return rows.map((r) => r.map((c) => esc(c ?? '')).join(',')).join('\r\n');
}

// ---------- 解析 ----------

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('浏览器版本太旧，无法读取 .xlsx，请另存为 .csv');
  // 不经 Blob.stream()：jsdom 的 Blob 没有它
  const src = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } });
  const s = src.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

const isXlsxPart = (name: string) => name.startsWith('xl/') && /\.(xml|rels)$/.test(name);

/** 按中央目录取要的部件（默认 xl/ 下的 xml）；stored 直接读，deflate 才解压。证书模板（.docx）也用它 */
export async function unzip(b: Uint8Array, keep: (name: string) => boolean = isXlsxPart, bad = '文件不是有效的 .xlsx'): Promise<Map<string, string>> {
  let e = b.length - 22;
  while (e >= 0 && u32(b, e) !== 0x06054b50) e--;
  if (e < 0) throw new Error(bad);
  const count = u16(b, e + 10);
  let p = u32(b, e + 16), total = 0;
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let k = 0; k < count && u32(b, p) === 0x02014b50; k++) {
    const method = u16(b, p + 10), size = u32(b, p + 20), nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), off = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (!keep(name)) continue;
    const start = off + 30 + u16(b, off + 26) + u16(b, off + 28);
    const raw = b.subarray(start, start + size);
    const data = method === 0 ? raw : await inflate(raw);
    total += data.length;
    if (total > MAX_BYTES) throw new Error('文件解压后超过 50MB，请拆成几个文件导入');
    out.set(name, dec.decode(data));
  }
  return out;
}

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const els = (n: Document | Element, tag: string) => [...n.getElementsByTagNameNS('*', tag)];

/** 0 不是日期、1 日期、2 日期时间、3 时间；规则与后端 SheetReader.dateKind 相同 */
export function dateKind(id: number, custom: Map<number, string>): number {
  if (id >= 14 && id <= 17) return 1;
  if (id >= 18 && id <= 21) return 3;
  if (id === 22) return 2;
  const code = custom.get(id);
  if (code == null) return 0;
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*]/g, '').replace(/\\./g, '').toLowerCase();
  const day = /[yd]/.test(c), time = /[hs]/.test(c);
  return day ? (time ? 2 : 1) : time ? 3 : 0;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Excel 日期序号转文本；1900 体系从 1899-12-30 起算 */
export function serial(d: number, kind: number, d1904 = false): string {
  const t = new Date((d1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + Math.round(Math.round(d * 86400000) / 1000) * 1000);
  const day = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, hm = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
  if (kind === 3) return hm;
  if (kind === 2) return t.getUTCHours() || t.getUTCMinutes() || t.getUTCSeconds() ? `${day} ${hm}` : day;
  return day;
}

/** 浮点误差按 16 位有效数字收掉，和后端 BigDecimal DECIMAL64 一致 */
const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? String(Number(n.toPrecision(16))) : v; };

function colOf(ref: string) {
  let c = 0;
  for (const ch of ref.toUpperCase()) { if (ch < 'A' || ch > 'Z') break; c = c * 26 + ch.charCodeAt(0) - 64; }
  return c - 1;
}

function cellText(c: Element, sst: string[], kinds: number[], d1904: boolean): string {
  const t = c.getAttribute('t');
  if (t === 'inlineStr') return els(c, 't').filter((x) => !x.closest('rPh')).map((x) => x.textContent ?? '').join('');
  const v = els(c, 'v')[0]?.textContent;
  if (v == null) return '';
  if (t === 's') return sst[Number(v.trim())] ?? '';
  if (t === 'b') return v.trim() === '1' ? 'TRUE' : 'FALSE';
  if (t === 'str' || t === 'e') return v;
  if (t === 'd') return v.slice(0, 10);
  const kind = kinds[Number(c.getAttribute('s') ?? 0)] ?? 0;
  if (Number.isNaN(Number(v))) return v;
  return kind ? serial(Number(v), kind, d1904) : num(v);
}

export async function parseXlsx(b: Uint8Array): Promise<string[][]> {
  const parts = await unzip(b);
  const wb = parts.get('xl/workbook.xml');
  if (!wb) throw new Error('文件不是有效的 .xlsx');
  const wdoc = xml(wb);
  const d1904 = ['1', 'true'].includes(els(wdoc, 'workbookPr')[0]?.getAttribute('date1904') ?? '');
  const rid = els(wdoc, 'sheet')[0]?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  let path = 'xl/worksheets/sheet1.xml';
  const rels = parts.get('xl/_rels/workbook.xml.rels');
  if (rels && rid) {
    const target = els(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target');
    if (target) { const p = target.startsWith('/') ? target.slice(1) : `xl/${target}`; if (parts.has(p)) path = p; }
  }
  const sheet = parts.get(path);
  if (!sheet) throw new Error('文件里没有工作表');
  const sstXml = parts.get('xl/sharedStrings.xml');
  const sst = sstXml ? els(xml(sstXml), 'si').map((si) => els(si, 't').filter((x) => !x.closest('rPh')).map((x) => x.textContent ?? '').join('')) : [];
  const kinds: number[] = [];
  const stylesXml = parts.get('xl/styles.xml');
  if (stylesXml) {
    const sd = xml(stylesXml);
    const custom = new Map(els(sd, 'numFmt').map((f) => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? ''] as const));
    for (const x of els(sd, 'cellXfs').flatMap((n) => els(n, 'xf'))) kinds.push(dateKind(Number(x.getAttribute('numFmtId') ?? 0), custom));
  }
  const rows: string[][] = [];
  for (const r of els(xml(sheet), 'row')) {
    const idx = r.getAttribute('r') ? Number(r.getAttribute('r')) - 1 : rows.length;
    if (idx >= MAX_ROWS) throw new Error(`最多导入 ${MAX_ROWS} 行，请拆成几个文件`);
    while (rows.length < idx) rows.push([]);
    const row: string[] = [];
    for (const c of els(r, 'c')) {
      const ref = c.getAttribute('r');
      const col = ref ? colOf(ref) : row.length;
      while (row.length < col) row.push('');
      row.push(cellText(c, sst, kinds, d1904));
    }
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((c) => !c.trim())) rows.pop();
  return rows;
}

// ---------- 生成 ----------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** 不压缩的 zip，xlsx、docx 只要求是 zip，Office、WPS 都能打开 */
export function zip(files: [string, string][]): Uint8Array {
  const enc = new TextEncoder();
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let off = 0;
  for (const [name, text] of files) {
    const n = enc.encode(name), d = enc.encode(text), crc = crc32(d);
    const h = new Uint8Array(30 + n.length), v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(12, 0x21, true);
    v.setUint32(14, crc, true); v.setUint32(18, d.length, true); v.setUint32(22, d.length, true); v.setUint16(26, n.length, true);
    h.set(n, 30);
    const c = new Uint8Array(46 + n.length), w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(14, 0x21, true);
    w.setUint32(16, crc, true); w.setUint32(20, d.length, true); w.setUint32(24, d.length, true); w.setUint16(28, n.length, true); w.setUint32(42, off, true);
    c.set(n, 46);
    local.push(h, d); central.push(c);
    off += h.length + d.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...local, ...central, end], out = new Uint8Array(all.reduce((s, x) => s + x.length, 0));
  let p = 0;
  for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); // eslint-disable-line no-control-regex
const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
/** 中文按两个字符宽算列宽 */
const width = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);

/** 第一行按表头加粗；单元格全部按文本写，编号前导 0 不会丢 */
export function buildXlsx(rows: string[][], sheetName = 'Sheet1'): Uint8Array {
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, i) => Math.min(50, Math.max(8, ...rows.slice(0, 200).map((r) => width(r[i] ?? '') + 2))));
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => (c === '' || c == null ? ''
    : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escXml(String(c))}</t></is></c>`)).join('')}</row>`).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${ns}>${cols ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}<sheetData>${body}</sheetData></worksheet>`;
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escXml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="宋体"/></font><font><b/><sz val="11"/><name val="宋体"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml', sheet],
  ]);
}

/** 下载为 .xlsx；文件名不带扩展名时补上 */
export function downloadXlsx(fileName: string, rows: string[][]) {
  const name = /\.xlsx$/i.test(fileName) ? fileName : `${fileName}.xlsx`;
  const url = URL.createObjectURL(new Blob([buildXlsx(rows) as BlobPart], { type: XLSX_TYPE }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
