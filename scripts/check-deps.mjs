// 依赖检查（只读，不改任何文件）。用法：
//   node scripts/check-deps.mjs                    本项目依赖与 npm 上最新版的差距
//   node scripts/check-deps.mjs --with <项目目录>   另与该项目的 package.json 比较版本范围
// 有依赖拿不到最新版（断网、包名错）时以非 0 退出，不静默通过。落后大版本只是提示，退出码仍为 0。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const read = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const major = (v) => Number(String(v).replace(/^[^\d]*/, '').split('.')[0]);

const own = read(root);
const withIdx = process.argv.indexOf('--with');
const other = withIdx > 0 ? read(path.resolve(process.argv[withIdx + 1])) : null;
const all = (pj) => ({ ...(pj.dependencies ?? {}), ...(pj.devDependencies ?? {}) });
const mine = all(own);
const theirs = other ? all(other) : {};

const installed = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version; }
  catch { return '未安装'; }
};
const latest = (name) => {
  if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) return null; // 包名不合法就不交给 shell
  try { return execSync(`npm view ${name} version --fetch-retries=0 --fetch-timeout=8000`, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; }
  catch { return null; }
};

const rows = [];
let failed = 0;
for (const [name, range] of Object.entries(mine).sort(([a], [b]) => a.localeCompare(b))) {
  const have = installed(name);
  const last = latest(name);
  let note = '';
  if (!last) { note = '未能获取最新版'; failed++; }
  else if (have !== '未安装' && major(have) < major(last)) note = `落后 ${major(last) - major(have)} 个大版本`;
  else if (major(range) < major(last)) note = `范围 ${range} 低于最新大版本`;
  if (other && theirs[name] && theirs[name] !== range) note += `${note ? '；' : ''}对方项目范围 ${theirs[name]}`;
  rows.push([name, range, have, last ?? '?', note || '—']);
}
const w = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => String(r[i]).length), 4));
console.log(['依赖', '范围', '已装', '最新', '备注'].join('  '));
for (const r of rows) console.log([r[0].padEnd(w[0]), String(r[1]).padEnd(w[1]), String(r[2]).padEnd(w[2]), String(r[3]).padEnd(w[3]), r[4]].join('  '));
const behind = rows.filter((r) => r[4].includes('落后') || r[4].includes('低于')).length;
console.log(`\n共 ${rows.length} 个依赖，落后大版本 ${behind} 个，未能获取 ${failed} 个`);
if (failed) { console.error('有依赖未能获取最新版，检查未完成（断网或包名错误）'); process.exit(2); }
