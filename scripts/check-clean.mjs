// 清洁检查：框架里不能留下来源项目的名称、业务词、人名、内网地址和旧前缀。
// 用法：node scripts/check-clean.mjs        扫描全部文件（node_modules、dist 除外），有命中就列出并以 1 退出
//       node scripts/check-clean.mjs --selftest  往临时文件写一个禁用词，确认检查拦得住
// 禁用词以 base64 存放，脚本本身不含明文，所以不用把自己排除在外；要加词时用
//   node -e "console.log(Buffer.from(JSON.stringify([...])).toString('base64'))" 重新生成 WORDS
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORDS = JSON.parse(Buffer.from('WyLlrp7orq3kuK3lv4MiLCLlrp7orq0iLCJ0cmFpbmluZyIsIui1hOihoSIsInppaGVuZyIsIuabmeWFiSIsIuaYn+eOryIsImhvc3BpdGFsLXBsYXRmb3JtIiwi5oqk55CG566h55CGIiwi5a6e6aqM5a6e6K6t5a6kIiwi5a2m5ZGYIiwi5a2m5pe2Iiwi5byA6K++Iiwi6ICD5a6YIiwi5a2m5qCh54mIIiwi5Yy76Zmi54mIIiwiZWRpdGlvbiIsImNvbS5ocCIsIuetkeWfuueuoeeQhuezu+e7nyIsInN5dGVzdCIsImFpYWRtaW4iLCJ0cmFuc3dhcnAiLCJrYWlyb3MiLCLljbHljJblk4EiLCLogJfmnZAiLCLluKbmlZkiLCLkvY/ln7kiLCLop4Tln7kiLCLmoIflh4bljJbnl4XkuroiLCLmioDog73ogIPmoLgiLCLlkajlu7rljY4iLCLliJjoirMiLCJDb2xsaW4iLCI1MTA0MCIsIjEwMy4yMDUuNy4zOSIsIkZLLTAiXQ==', 'base64').toString('utf8'));
/** 旧前缀：hp- / hp. / hp: 开头的标识符（如事件名、存储键），前面不能是字母数字 */
const PATTERNS = [/(?<![A-Za-z0-9])hp[-.:][a-z]/, /(?<![\d.])(?:10|172|192)\.\d{1,3}\.\d{1,3}\.\d{1,3}(?![\d.])/];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.vite']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.zip']);

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(f)) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (!SKIP_EXT.has(path.extname(f).toLowerCase())) out.push(p);
  }
  return out;
}

/** 返回命中列表：「文件:行 词」；文件名本身也查 */
export function scan(root = ROOT) {
  const hits = [];
  for (const file of walk(root)) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    for (const w of WORDS) if (rel.toLowerCase().includes(w.toLowerCase())) hits.push(`${rel} 文件名含「${w}」`);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    // package-lock.json 只查自己的 name，依赖包的内容不归我们管
    const only = rel === 'package-lock.json' ? lines.slice(0, 12) : lines;
    only.forEach((line, i) => {
      for (const w of WORDS) if (line.toLowerCase().includes(w.toLowerCase())) hits.push(`${rel}:${i + 1} 「${w}」`);
      for (const re of PATTERNS) if (re.test(line)) hits.push(`${rel}:${i + 1} 「${line.match(re)[0]}」`);
    });
  }
  return hits;
}

/** 默认产品名称必须是占位名，使用方复制后自行替换 */
function checkDefaultName(root = ROOT) {
  const cfg = fs.readFileSync(path.join(root, 'src/app.config.ts'), 'utf8');
  return /productName: 'xxx管理系统'/.test(cfg) ? [] : ['src/app.config.ts 默认产品名称不是「xxx管理系统」'];
}

/** 成对的中英文文档：二级标题（## 开头的行）数量要一致 */
/** ui/ 的来源记录必须在，并且写了同步日期 */
function checkSource() {
  const f = 'src/ui/SOURCE.md';
  if (!fs.existsSync(f)) return [`${f} 缺失：ui/ 要有来源记录`];
  return fs.readFileSync(f, 'utf8').includes('同步日期') ? [] : [`${f} 里没有「同步日期」`];
}

const PAIRS = [['README.md', 'README.zh-CN.md'], ['docs/Security.md', 'docs/安全说明.md']];
function checkPairs(root = ROOT) {
  const h2 = (f) => fs.readFileSync(path.join(root, f), 'utf8').split(String.fromCharCode(10)).filter((l) => l.startsWith('## ')).length;
  return PAIRS.flatMap(([a, b]) => (h2(a) === h2(b) ? [] : [`${a} 有 ${h2(a)} 个二级标题，${b} 有 ${h2(b)} 个，两份要一一对应`]));
}

function selftest() {
  const probe = path.join(ROOT, 'src', `__probe_${Date.now()}.txt`);
  const word = WORDS[1];
  fs.writeFileSync(probe, `这里写了${word}`);
  try {
    const hit = scan().some((h) => h.includes('__probe_') && h.includes(word));
    if (!hit) { console.error('自检失败：写入禁用词后没有被拦住'); process.exit(1); }
    console.log('自检通过：写入禁用词后检查能拦住');
  } finally { fs.rmSync(probe); }
}

if (process.argv.includes('--selftest')) selftest();
else {
  const hits = [...scan(), ...checkDefaultName(), ...checkPairs(), ...checkSource()];
  if (hits.length) { console.error(`清洁检查未通过，命中 ${hits.length} 处：\n${hits.join('\n')}`); process.exit(1); }
  console.log('清洁检查通过，命中 0 处');
}
