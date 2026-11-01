// 列表排序守卫：页面里每一个 <table> 要么有可排序表头（SortTh），要么在 <table> 上用 data-no-sort="原因" 登记为例外；
// 共用的 DataTable 自带排序，它自己的 <table> 不检查。新增表格忘了排序，这里会失败。（2026-11-01）
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(p);
  }
  return out;
};

/** 返回没排序也没登记例外的 <table> 位置 */
export function unsortedTables(code: string, file: string): string[] {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bad: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'table') {
      const reason = n.openingElement.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === 'data-no-sort');
      const hasReason = !!reason && ts.isStringLiteral(reason.initializer!) && reason.initializer.text.trim().length > 0;
      let hasSort = false;
      const find = (c: ts.Node) => {
        if ((ts.isJsxOpeningElement(c) || ts.isJsxSelfClosingElement(c)) && c.tagName.getText() === 'SortTh') hasSort = true;
        ts.forEachChild(c, find);
      };
      find(n);
      if (!hasSort && !hasReason) bad.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return bad;
}

test('每个表格都有可排序表头，或写明不排序的原因', () => {
  const bad = walk(ROOT)
    .filter((f) => !f.replace(/\\/g, '/').endsWith('/ui/DataTable.tsx'))
    .flatMap((f) => unsortedTables(fs.readFileSync(f, 'utf8'), f));
  expect(bad).toEqual([]);
});

test('守卫拦得住：没排序也没登记的表格会被报出，登记原因或用 SortTh 后放行', () => {
  const plain = 'const A = () => <table><thead><tr><th>名称</th></tr></thead><tbody /></table>;';
  expect(unsortedTables(plain, `${ROOT}/x.tsx`)).toHaveLength(1);
  expect(unsortedTables(plain.replace('<table>', '<table data-no-sort="打印版式">'), `${ROOT}/x.tsx`)).toEqual([]);
  expect(unsortedTables(plain.replace('<th>名称</th>', '<SortTh sort={s} k="a">名称</SortTh>'), `${ROOT}/x.tsx`)).toEqual([]);
  expect(unsortedTables(plain.replace('<table>', '<table data-no-sort="">'), `${ROOT}/x.tsx`)).toHaveLength(1);
});
