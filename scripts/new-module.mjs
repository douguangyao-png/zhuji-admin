// 按示例模块生成一个新模块，并登记到菜单、模块开关和权限点。
// 用法：npm run new:module <key> <名称> [单号前缀]
//   key：小写字母开头，小写字母、数字、连字符，2–30 位，如 contract、asset-check
//   名称：模块显示名，1–12 个字，如 合同管理
//   单号前缀：两位大写字母，默认取 key 的前两个字母
// 生成后：features/<key>/ 下 types、api、mock、页面、index 五个文件，可直接运行；再按业务改字段和规则。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const TEMPLATE = path.join(SRC, 'features', 'example');
const TEMPLATE_FILES = ['types.ts', 'api.ts', 'mock.ts', 'ExamplePage.tsx', 'index.tsx'];
const RESERVED = ['system', 'help', 'home', 'example', 'app', 'api', 'core', 'ui', 'lib', 'test'];

const fail = (msg) => { console.error(`没有生成：${msg}`); process.exit(1); };

const [key, name, prefixArg] = process.argv.slice(2);
if (!key || !name) fail('用法 npm run new:module <key> <名称> [单号前缀]，如 npm run new:module contract 合同管理');
if (!/^[a-z][a-z0-9-]{1,29}$/.test(key)) fail(`key「${key}」不合法：小写字母开头，只用小写字母、数字、连字符，2–30 位`);
if (RESERVED.includes(key)) fail(`key「${key}」是保留字`);
if (fs.existsSync(path.join(SRC, 'features', key))) fail(`features/${key} 已存在`);
if ([...name].length < 1 || [...name].length > 12) fail('名称 1–12 个字');
const prefix = (prefixArg ?? key.replace(/[^a-z]/g, '').slice(0, 2)).toUpperCase();
if (!/^[A-Z]{2}$/.test(prefix)) fail(`单号前缀「${prefix}」要两位大写字母`);
const used = [...fs.readFileSync(path.join(SRC, 'features', 'example', 'mock.ts'), 'utf8').matchAll(/registerDoc\('([A-Z]{2})'/g)].map((m) => m[1]);
for (const d of fs.readdirSync(path.join(SRC, 'features'))) {
  const m = path.join(SRC, 'features', d, 'mock.ts');
  if (fs.existsSync(m)) used.push(...[...fs.readFileSync(m, 'utf8').matchAll(/registerDoc\('([A-Z]{2})'/g)].map((x) => x[1]));
}
if (used.includes(prefix)) fail(`单号前缀「${prefix}」已被别的模块用了，换一个：npm run new:module ${key} ${name} XX`);

const camel = key.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const Pascal = camel[0].toUpperCase() + camel.slice(1);
const UPPER = key.replace(/-/g, '_').toUpperCase();
const snake = key.replace(/-/g, '_');

// 先改长的、具体的，再改短的
const RULES = [
  ['ExampleItem', `${Pascal}Item`], ['ExampleInput', `${Pascal}Input`], ['ExampleStatus', `${Pascal}Status`], ['ExamplePage', `${Pascal}Page`],
  ['EXAMPLE_STATUS', `${UPPER}_STATUS`], ['EXAMPLE_MAX', `${UPPER}_MAX`],
  ['exampleApi', `${camel}Api`], ['exampleModule', `${camel}Module`], ['exampleCategory', `${camel}Category`],
  ["'ex_item'", `'${snake}_item'`], ["uid('EX')", `uid('${prefix}')`], ['`EX${', `\`${prefix}\${`],
  ["registerDoc('SL'", `registerDoc('${prefix}'`], ["nextNo('SL')", `nextNo('${prefix}')`], ['`SL${', `\`${prefix}\${`], ['单号 SL + ', `单号 ${prefix} + `],
  ["'example:", `'${key}:`], ["'example.", `'${key}.`], ["'/example", `'/${key}`], ['`/example/', `\`/${key}/`],["'example'", `'${key}'`], ["['example']", `['${key}']`],
  ['示例登记', name], ['示例模块', name], ['示例类别', `${name}类别`], ["const MODULE = '示例'", `const MODULE = '${name}'`],
];
const apply = (s) => RULES.reduce((t, [a, b]) => t.split(a).join(b), s);

const out = path.join(SRC, 'features', key);
const files = {};
for (const f of TEMPLATE_FILES) {
  let s = apply(fs.readFileSync(path.join(TEMPLATE, f), 'utf8'));
  if (f === 'index.tsx') {
    // 首页卡片要在 features/home/catalog.ts 登记名称，生成的模块先不带
    s = s.replace(/import \{ RejectedCard \} from '\.\/HomeCard';\r?\n/, '').replace(/\s*home: \[[^\n]*\],?\r?\n/, '\n');
  }
  files[f === 'ExamplePage.tsx' ? `${Pascal}Page.tsx` : f] = s;
}

// 登记：模块列表、模块开关、权限点
const reg = (rel, marker, line, importLine) => {
  const p = path.join(SRC, rel);
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes(marker)) fail(`${rel} 里找不到标记「${marker.trim()}」，请手工登记`);
  s = s.replace(marker, `${line}\n${marker}`);
  if (importLine) {
    const m = '// 模块引用';
    if (!s.includes(m)) fail(`${rel} 里找不到标记「${m}」`);
    s = s.replace(m, `${importLine}\n${m}`);
  }
  return [p, s];
};
const edits = [
  reg('app/modules.ts', '  // 模块列表', `  ${camel}Module,`, `import { ${camel}Module } from '@/features/${key}';`),
  reg('api/types.ts', '  // 模块开关', `  '${key}': '${name}',`),
  reg('api/perms.ts', '  // 模块权限点', `  { name: '${name}', feature: '${key}', perms: [['${key}:view', '查看'], ['${key}:edit', '登记与修改'], ['${key}:approve', '审批']] },`),
];

// 全部检查通过后才写文件
fs.mkdirSync(out);
for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(out, f), s);
for (const [p, s] of edits) fs.writeFileSync(p, s);
console.log(`已生成 features/${key}（单号前缀 ${prefix}），并登记到 app/modules.ts、api/types.ts、api/perms.ts。
下一步：
  1. 改 features/${key}/types.ts 的字段，mock.ts 的校验和种子数据，页面的列和表单；
  2. 给角色勾上「${name}」的权限点（系统管理员默认全有）；
  3. 要发群消息时在 api/mock/notify.ts 的 RULES 里加 ${key}.submitted 等事件的规则；
  4. npm run typecheck、npm test。`);
