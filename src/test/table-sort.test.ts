// 列表排序守卫：页面里每一个 <table> 要么有可排序表头（SortTh），要么在它前面紧挨着写一行「不排序：原因」的注释登记为例外
// （JSX 子节点里写 {/* 不排序：原因 */}，在 return、括号后面写 // 不排序：原因）；注释只在源码里，不会进到页面。
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

/** 紧挨着 <table>（中间只允许空白、return、左括号）的「不排序：原因」注释，原因不能为空 */
const REASON = /(?:\{\/\*\s*不排序：\s*[^*\s][^*]*\*\/\}|\/\/\s*不排序：\s*\S[^\n]*)\s*(?:return\s*)?\(?\s*$/;

/** 返回没排序也没登记例外的 <table> 位置 */
export function unsortedTables(code: string, file: string): string[] {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bad: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'table') {
      const hasReason = REASON.test(code.slice(0, n.getStart()));
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

test('守卫拦得住：没排序也没登记的表格会被报出，写了「不排序：原因」注释或用 SortTh 后放行', () => {
  const at = `${ROOT}/x.tsx`;
  const plain = 'const A = () => <table><thead><tr><th>名称</th></tr></thead><tbody /></table>;';
  expect(unsortedTables(plain, at)).toHaveLength(1);
  expect(unsortedTables(plain.replace('<table>', '<div>{/* 不排序：打印版式 */}\n<table>').replace('</table>;', '</table></div>;'), at)).toEqual([]);
  expect(unsortedTables(`// 不排序：键值对\nconst A = () => { return <table><tbody /></table>; }`, at)).toEqual([]);
  expect(unsortedTables(`const A = () => (\n  // 不排序：卡片摘要\n  <table><tbody /></table>\n);`, at)).toEqual([]);
  expect(unsortedTables(plain.replace('<th>名称</th>', '<SortTh sort={s} k="a">名称</SortTh>'), at)).toEqual([]);
  // 原因为空、或只是一条别的注释，都不算登记
  expect(unsortedTables(plain.replace('<table>', '<div>{/* 不排序： */}\n<table>').replace('</table>;', '</table></div>;'), at)).toHaveLength(1);
  expect(unsortedTables(plain.replace('<table>', '<div>{/* 随便的注释 */}\n<table>').replace('</table>;', '</table></div>;'), at)).toHaveLength(1);
});
