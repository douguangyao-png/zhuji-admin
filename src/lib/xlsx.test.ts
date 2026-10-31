import { deflateRawSync } from 'node:zlib';
import { matchPeople } from './people';
import { readXlsx, toCsv } from './xlsx';

/** 拼一个最小的 zip：每个文件 deflate 压缩，带中央目录 */
function zip(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name), raw = enc.encode(text), data = new Uint8Array(deflateRawSync(raw));
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(8, 8, true);
    local.setUint32(18, data.length, true); local.setUint32(22, raw.length, true); local.setUint16(26, n.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(10, 8, true);
    cd.setUint32(20, data.length, true); cd.setUint32(24, raw.length, true); cd.setUint16(28, n.length, true); cd.setUint32(42, off, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    central.push(new Uint8Array(cd.buffer), n);
    off += 30 + n.length + data.length;
  }
  const size = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, size, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, x) => s + x.length, 0));
  let p = 0;
  for (const x of all) { out.set(x, p); p += x.length; }
  return out.buffer;
}

test('读 xlsx：共享字符串、数字、日期格式、空单元格和内联字符串都转成文字', async () => {
  const book = zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="入库" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>物品名称</t></si><si><t>入库数量</t></si><si><t>有效期</t></si><si><r><t>一次性</t></r><r><t>手套, 7号</t></r></si></sst>',
    'xl/styles.xml': '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="yyyy/m/d"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData>'
      + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>200</v></c><c r="C2" s="1"><v>46934</v></c></row>'
      + '<row r="3"><c r="A3" t="inlineStr"><is><t>纱布 &amp; 绷带</t></is></c><c r="C3" s="1"/></row>'
      + '</sheetData></worksheet>',
  });
  const rows = await readXlsx(book);
  expect(rows).toEqual([['物品名称', '入库数量', '有效期'], ['一次性手套, 7号', '200', '2028-06-30'], ['纱布 & 绷带', '', '']]);
  expect(toCsv(rows).split('\n')[1]).toBe('"一次性手套, 7号",200,2028-06-30');
});

test('不是 xlsx 时给出能看懂的错误', async () => {
  await expect(readXlsx(new TextEncoder().encode('工号,姓名').buffer as ArrayBuffer)).rejects.toThrow('不是有效的 Excel 文件');
});

test('选人匹配：姓氏开头的排前面，工号按前缀，姓名包含的排最后', () => {
  const list = [
    { id: '1', name: '李吴', no: '2001' },
    { id: '2', name: '吴敏', no: '3002' },
    { id: '3', name: '王芳', no: '1003' },
    { id: '4', name: '吴刚', no: '1004' },
    { id: '5', name: '赵一', no: '2100' },
  ];
  expect(matchPeople(list, '吴').map((p) => p.name)).toEqual(['吴刚', '吴敏', '李吴']);
  expect(matchPeople(list, '1').map((p) => p.no)).toEqual(['1003', '1004']);
  expect(matchPeople(list, '21').map((p) => p.no)).toEqual(['2100']);
  expect(matchPeople(list, '', 2)).toHaveLength(2);
});
