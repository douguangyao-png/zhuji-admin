// 弹窗一行最多两个输入框：含 <Dialog 的文件里不许写 g-3；全局样式兜底，弹窗里误写 g-3 也只排两列
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(p);
  }
  return out;
};
/** 类名里单独的 g-3；--line-3、fg-3 这类不算 */
const G3 = /(^|["'`\s{])g-3($|["'`\s}])/;

test('含弹窗的文件里没有一行 3 列的 g-3', () => {
  const files = walk(ROOT).filter((f) => fs.readFileSync(f, 'utf8').includes('<Dialog'));
  expect(files.length).toBeGreaterThan(10);
  const bad: string[] = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (G3.test(line)) bad.push(`${path.relative(ROOT, f).replace(/\\/g, '/')}:${i + 1}`);
    });
  }
  expect(bad).toEqual([]);
});

test('ui.css 有弹窗内 g-3 只排两列的兜底规则', () => {
  const css = fs.readFileSync(path.join(ROOT, 'ui/ui.css'), 'utf8');
  expect(css).toMatch(/\.dialog \.g-3 \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
});

test('字段对齐：并排的字段标签一行、超长省略，行内字段顶部对齐，提示和报错在输入框下面', () => {
  const css = fs.readFileSync(path.join(ROOT, 'ui/ui.css'), 'utf8');
  expect(css).toContain('.field > label:first-child { min-height: 20px; line-height: 20px; }');
  expect(css).toContain(':is(.grid, .row2, .row) > .field:not([style*="grid-column"]) > label:first-child { white-space: nowrap; overflow: hidden; min-width: 0; }');
  expect(css).toContain('.row > .field { align-self: flex-start; }');
  expect(css).toContain('.row > .field + .field { margin-top: 0; }');
  // Field：标签文字单独一层（可省略），控件在中间，提示、报错排在控件后面
  const src = fs.readFileSync(path.join(ROOT, 'ui/Field.tsx'), 'utf8');
  expect(src).toMatch(/<span className="fl-t">\{label\}<\/span>[\s\S]*\{children\(id\)\}[\s\S]*hint err/);
});
