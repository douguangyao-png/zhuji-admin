// 读 .xlsx 第一张工作表，转成 CSV 文本交给原有的导入流程；不引第三方库，解压用浏览器自带的 DecompressionStream

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (u16(b, i) | (u16(b, i + 2) << 16)) >>> 0;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const s = new Response(data).body!.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** zip 里的文件：按中央目录找到本地头，只支持不压缩和 deflate */
async function unzip(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Map<string, string>> {
  const b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('不是有效的 Excel 文件（.xlsx）');
  const n = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (u32(b, p) !== 0x02014b50) break;
    const method = u16(b, p + 10), size = u32(b, p + 20), nameLen = u16(b, p + 28), extra = u16(b, p + 30), comment = u16(b, p + 32), local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    if (!want(name)) continue;
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const raw = b.subarray(start, start + size);
    out.set(name, dec.decode(method === 0 ? raw : await inflate(raw)));
  }
  return out;
}

const unescape = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-f]+));/gi, (_, e: string, d?: string, h?: string) =>
  d ? String.fromCodePoint(Number(d)) : h ? String.fromCodePoint(parseInt(h, 16)) : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()]);
/** 一个 <si> 或 <is> 里所有 <t> 的文字（富文本会拆成多段） */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join('');

const colIndex = (ref: string) => [...ref.replace(/\d+$/, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Excel 日期序列号转 yyyy-mm-dd（1900 日期系统） */
const serialDate = (v: number) => new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);

/** 第一张工作表的行，单元格都转成文字；日期格式的数字转成 yyyy-mm-dd */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buf, (n) => n === 'xl/sharedStrings.xml' || n === 'xl/styles.xml' || n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n.startsWith('xl/worksheets/sheet'));
  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  // 第一张表：workbook 里第一个 sheet 的 r:id 对到 rels 里的路径
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(files.get('xl/workbook.xml') ?? '')?.[1];
  const target = rid && new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(files.get('xl/_rels/workbook.xml.rels') ?? '')?.[1];
  const path = target ? `xl/${target.replace(/^\/?xl\//, '')}` : 'xl/worksheets/sheet1.xml';
  const sheet = files.get(path) ?? [...files.entries()].find(([n]) => n.startsWith('xl/worksheets/sheet'))?.[1];
  if (!sheet) throw new Error('Excel 文件里没有工作表');
  // 哪些样式是日期：内置格式 14–22，或自定义格式里有 y/m/d
  const styles = files.get('xl/styles.xml') ?? '';
  const custom = new Map([...styles.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].map((m) => [Number(m[1]), m[2]]));
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '';
  const dateStyle = [...xfs.matchAll(/<xf\b([^>]*)>/g)].map((m) => {
    const id = Number(/numFmtId="(\d+)"/.exec(m[1])?.[1] ?? 0);
    return (id >= 14 && id <= 22) || /[yd]/i.test((custom.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, ''));
  });

  const rows: string[][] = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], inner = c[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const t = /\bt="(\w+)"/.exec(attrs)?.[1];
      const s = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? 0);
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let text = '';
      if (t === 's') text = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') text = texts(inner);
      else if (t === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined) text = !t && dateStyle[s] && Number.isFinite(Number(v)) ? serialDate(Number(v)) : unescape(v);
      row[ref ? colIndex(ref) : row.length] = text;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  while (rows.length && rows[rows.length - 1].every((x) => !x.trim())) rows.pop();
  return rows;
}

/** 行转 CSV 文本，和手工粘贴的格式一样 */
export const toCsv = (rows: string[][]) => rows.map((r) => r.map((s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)).join(',')).join('\n');
