// 接口约定检查：页面代码里用到的每个后端接口，docs/接口约定.md 里都要有一行；两边对不上就列出来并以 1 退出。
// 用法：node scripts/check-api.mjs
// 只看 src 下的非测试、非模拟层代码；路径里的 ${...} 和 :参数 都按一个占位比较
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs', '接口约定.md');

const walk = (d, out = []) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'mock') walk(p, out); } else if (/\.tsx?$/.test(f) && !/\.test\./.test(f) && !/mock\.ts$/.test(f)) out.push(p);
  }
  return out;
};
const norm = (p) => p.replace(/\$\{[^}]*$/, '').replace(/\$\{[^}]*\}/g, ':').split('?')[0].replace(/:[A-Za-z_]\w*/g, ':').replace(/:+/g, ':').replace(/\/$/, '');
const METHOD = { get: 'GET', post: 'POST', put: 'PUT', del: 'DELETE' };

const used = new Map();
// 第 4 组是紧跟的「+ 变量」，即 '/dict-types/' + key 这种拼接
const CALL = /\b(get|post|put|del)(?:<[^\n]*?>)?\(\s*(['`])(\/[^'`]*)\2(\s*\+)?/g;
const RAW = /\$\{APP\.apiBase\}(\/[^`'"?]*)/g;
for (const file of walk(path.join(ROOT, 'src'))) {
  const s = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  for (const m of s.matchAll(CALL)) used.set(`${METHOD[m[1]]} ${norm(m[4] ? `${m[3]}:` : m[3])}`, rel);
  for (const m of s.matchAll(RAW)) {
    const line = s.slice(s.lastIndexOf('\n', m.index) + 1, s.indexOf('\n', m.index));
    const method = /method: '(\w+)'/.exec(line)?.[1] ?? 'GET';
    used.set(`${method} ${norm(m[1])}`, rel);
  }
}

const doc = fs.readFileSync(DOC, 'utf8');
const documented = new Set([...doc.matchAll(/^\|\s*(GET|POST|PUT|DELETE)\s*\|\s*`([^`]+)`/gm)].map((m) => `${m[1]} ${norm(m[2])}`));

const missing = [...used].filter(([k]) => !documented.has(k)).map(([k, f]) => `${k}（${f}）`);
const unused = [...documented].filter((k) => !used.has(k));
if (missing.length) {
  console.error(`接口约定缺 ${missing.length} 个接口：\n${missing.join('\n')}`);
  process.exit(1);
}
console.log(`接口约定检查通过：页面用到 ${used.size} 个接口，文档列了 ${documented.size} 个${unused.length ? `；文档里有、页面没直接调用的 ${unused.length} 个（如推送、下载）：${unused.join('、')}` : ''}`);
