// 按钮规范：所有 btn 按钮都是「图标 + 文字」，弹窗右上角的叉号例外只有图标，翻页按钮例外只有页码或方向箭头（2026-10-23 用户要求去掉翻页上的箭头）；删除按钮统一用 btn-ds（垃圾桶图标红色，底色同普通按钮），点击前有「您确定要删除吗？」确认
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
/** 点击后会弹确认的写法；确认窗里的「确认物理删除」按钮本身就是确认 */
const CONFIRM = /deleteConfirm|confirm\(|askDelete|removeSel|ask\(|setPurging|purge\.mutate/;
const attr = (open: ts.JsxOpeningElement, name: string) => open.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === name);

interface Found { where: string; icon: boolean; text: boolean; cls: string; del: boolean; confirmed: boolean }
function scan(): Found[] {
  const out: Found[] = [];
  for (const file of walk(ROOT)) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if (ts.isJsxElement(n) && ['button', 'Link', 'a'].includes(n.openingElement.tagName.getText())) {
        const open = n.openingElement;
        const cls = attr(open, 'className')?.initializer?.getText() ?? '';
        if (/(^|["'`\s{])btn($|["'`\s}])/.test(cls) || /\bbtn-/.test(cls)) {
          const icon = n.children.some((k) => (ts.isJsxSelfClosingElement(k) && k.tagName.getText() === 'Icon') || (ts.isJsxElement(k) && k.openingElement.tagName.getText() === 'Icon'));
          const text = n.children.some((k) => (ts.isJsxText(k) && k.text.trim() !== '') || ts.isJsxExpression(k) || (ts.isJsxElement(k) && k.openingElement.tagName.getText() !== 'Icon'));
          const del = /btn-ds/.test(cls) && /删除|trash/.test(n.getText());
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
          out.push({ where: `${path.relative(ROOT, file).replace(/\\/g, '/')}:${line + 1}`, icon, text, cls, del, confirmed: CONFIRM.test(open.getText()) });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

const all = scan();

test('按钮都是「图标 + 文字」；弹窗右上角的叉号只有图标，翻页按钮只有页码或方向箭头', () => {
  expect(all.length).toBeGreaterThan(150);
  const pager = (b: Found) => b.where.startsWith('ui/Pager.tsx:');
  expect(all.filter((b) => !/dlg-x/.test(b.cls) && !pager(b) && (!b.icon || !b.text)).map((b) => b.where)).toEqual([]);
  expect(all.filter((b) => /dlg-x/.test(b.cls)).map((b) => [b.where, b.icon, b.text])).toEqual([['ui/Dialog.tsx:32', true, false]]);
});

test('删除按钮统一用 btn-ds，不再有灰色、描边或纯图标的删除', () => {
  expect(all.filter((b) => b.del).length).toBeGreaterThan(8);
  expect(all.filter((b) => b.del && /btn-(g|o|d|ic)\b/.test(b.cls)).map((b) => b.where)).toEqual([]);
});

test('每个删除按钮点击前都有「您确定要删除吗？」确认', () => {
  expect(all.filter((b) => b.del && !b.confirmed).map((b) => b.where)).toEqual([]);
});
