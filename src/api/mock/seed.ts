// 模拟数据：公共部分（组织、人员、角色、字典、审批流）在这里，各模块在自己的 mock.ts 里用 registerSeed 登记
import { personName, phone } from '@/lib/names';
import { rng } from '@/lib/rng';
import { DEFAULT_DICT_SORT } from './dict-order';
import { APP } from '@/app.config';
import { DEFAULT_FEATURES, type DictItem, type MsgKindRule, type MsgPolicy, type OrgUnit, type Role, type Settings, type User, type WfDef, type WfPolicy } from '../types';

type Data = Record<string, { id: string }[]>;
type SeedFn = (d: Data) => void;
const seeds: { order: number; fn: SeedFn }[] = [];
/** order 小的先跑：10 基础档案，20 业务记录，30 汇总，90 以后是消息等公共数据 */
export const registerSeed = (order: number, fn: SeedFn) => { seeds.push({ order, fn }); };

// 演示组织：一个单位、几个部门；新项目按自己的组织改
const DEPTS = ['办公室', '人力资源部', '财务部', '信息中心', '业务一部', '业务二部', '后勤保障部'];

/** 固定的演示账号：登录页右上角「切换账号」按角色列出；其余人员随机生成 */
export const DEMO_USERS: { id: string; username: string; role: string; title: string; unit: string }[] = [
  { id: 'U01', username: 'admin', role: 'admin', title: '系统管理员', unit: '信息中心' },
  { id: 'U02', username: 'manager', role: 'manager', title: '业务管理员', unit: '业务一部' },
  { id: 'U03', username: 'head', role: 'user', title: '部门负责人', unit: '业务一部' },
  { id: 'U04', username: 'user', role: 'user', title: '职员', unit: '业务一部' },
  { id: 'U05', username: 'user2', role: 'user', title: '职员', unit: '业务二部' },
];

/** 内置三个角色：系统管理员、业务管理员、普通用户；其余角色由用户在「角色权限」里自建 */
export const ROLES: Role[] = [
  { key: 'admin', name: '系统管理员', desc: '组织人员、角色权限、字典、模块开关、接口配置；看得到全部菜单', builtin: true, perms: ['*'] },
  { key: 'manager', name: '业务管理员', desc: '业务模块的管理与审批、操作日志、问题反馈处理；不含组织人员、角色、字典、模块开关、接口配置', builtin: true,
    perms: ['example:view', 'example:edit', 'example:approve', 'sys:audit', 'sys:feedback', 'op:import', 'op:export', 'op:print'] },
  { key: 'user', name: '普通用户', desc: '查看、登记业务数据，提交审批，导出与打印', builtin: true, perms: ['example:view', 'example:edit', 'op:export', 'op:print'] },
];
/** 内置角色的 key：不能改名、不能删除 */
export const BUILTIN_ROLES = ['admin', 'manager', 'user'];

const DICTS: Record<string, string[]> = { priority: ['低', '中', '高'] };
const DICT_NAME: Record<string, string> = { priority: '优先级' };
export const dictTypes = () => Object.entries(DICT_NAME).map(([k, v]) => ({ key: k, name: v }));
/** 模块登记自己的字典分类和初始字典项（在 mock.ts 顶层调用，种子生成前登记好） */
export const registerDict = (type: string, name: string, items: string[]) => { DICT_NAME[type] = name; DICTS[type] = items; };

const WF: WfDef[] = [];
/** 模块登记自己的默认审批流（在 mock.ts 顶层调用）；上线后流程以「系统管理 › 审批流」里改过的为准 */
export const registerWorkflow = (def: WfDef) => { WF.push(def); };

const kind = (k: string, level: MsgKindRule['level'], importantAfter: number | null, urgentAfter: number | null): MsgKindRule => ({ kind: k, level, importantAfter, urgentAfter });
/** 消息等级与推送的默认策略；工作时间不在这里，用系统设置的 workStart / workEnd */
export const DEFAULT_MSG_POLICY: Pick<MsgPolicy, 'levels' | 'push'> = {
  levels: {
    kinds: [kind('审批', 'normal', 240, 480), kind('示例', 'normal', 240, 480), kind('问题反馈', 'normal', null, null), kind('公告', 'minor', null, null), kind('*', 'normal', null, null)],
    keywords: [{ keyword: '报警', level: 'urgent' }, { keyword: '逾期', level: 'important' }, { keyword: '即将开始', level: 'important' }],
    todoPrefixes: ['待', '派给你的'],
    eventImportantWithin: 120, eventUrgentWithin: 30, urgeIntervalMinutes: 60,
  },
  push: { enabled: true, offHours: false, retries: 2, rules: [{ level: 'urgent', groupIds: [] }, { level: 'important', groupIds: [] }] },
};
/** 自动通过默认全开，没有代审 */
export const DEFAULT_WF_POLICY: WfPolicy = { autoApprove: { enabled: true, admin: true, self: true }, proxies: [] };

export function buildSeed(): Data {
  const r = rng(20261031);
  const d: Data = {};
  const settings: Settings & { id: string } = { id: 'main', features: { ...DEFAULT_FEATURES }, productName: APP.productName, orgName: APP.orgName, publicUrl: '', loginCaptcha: 'always', loginCaptchaAfter: 3,
    passwordMinLength: 8, passwordMinClasses: 3, passwordNotUserNo: true, passwordHistory: 3, passwordMaxAgeDays: 0 };
  d.sys_setting = [settings];

  const units: OrgUnit[] = [{ id: 'C0', name: APP.orgName, code: 'ORG', type: 'center', parentId: null, sort: 0 }];
  DEPTS.forEach((n, i) => units.push({ id: `D${String(i + 1).padStart(2, '0')}`, name: n, code: `BM${String(i + 1).padStart(3, '0')}`, type: 'dept', parentId: 'C0', sort: i + 1 }));
  const unitOf = (name: string) => units.find((u) => u.name === name)!.id;

  const users: User[] = DEMO_USERS.map((u, i) => ({
    id: u.id, username: u.username, name: u.id === 'U01' ? '系统管理员' : personName(r), no: `E${String(1000 + i)}`, unitId: unitOf(u.unit),
    title: u.title, phone: phone(r), roleKeys: [u.role], active: true, gender: r.chance(0.5) ? 'M' : 'F',
  }));
  // 每个部门 3–5 名职员
  let n = 0;
  for (const dept of DEPTS) {
    for (let k = r.int(3, 5); k > 0; k--) {
      users.push({ id: `U${String(100 + n)}`, username: `u${100 + n}`, name: personName(r), no: `E${String(2000 + n)}`, unitId: unitOf(dept),
        title: r.pick(['职员', '主管', '专员']), phone: phone(r), roleKeys: ['user'], active: true, gender: r.chance(0.5) ? 'M' : 'F' });
      n++;
    }
  }
  units.find((u) => u.name === '业务一部')!.headId = 'U03';
  d.org_unit = units;
  d.org_user = users;
  d.org_role = ROLES.map((x) => ({ ...x, id: x.key }));
  d.sys_dict = Object.entries(DICTS).flatMap(([type, names]) => names.map((name, i): DictItem => ({ id: `${type}:${i}`, type, code: String(i + 1), name, sort: DEFAULT_DICT_SORT, active: true })));
  d.wf_def = WF.map((w) => ({ ...w, id: w.type }));
  d.msg_policy = [{ id: 'main', ...JSON.parse(JSON.stringify(DEFAULT_MSG_POLICY)) as Pick<MsgPolicy, 'levels' | 'push'> }];
  d.wf_policy = [{ id: 'main', ...JSON.parse(JSON.stringify(DEFAULT_WF_POLICY)) as WfPolicy }];

  for (const s of [...seeds].sort((a, b) => a.order - b.order)) s.fn(d);
  return d;
}
