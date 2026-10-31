// 公共 DTO，字段名与后端一致；各模块自己的类型放在 features/<模块>/types.ts

/** 产品名称的默认值，设置没加载到或没配过时用；改名改 src/app.config.ts */
export { DEFAULT_PRODUCT_NAME } from '@/app.config';

/** 模块开关：模块的 ModuleDef.feature 填这里的键，「基础配置」里可关，默认都打开；新模块加在「模块开关」标记处（npm run new:module 自动插入） */
export const FEATURE_LABEL = {
  example: '示例模块',
  // 模块开关
} as const;
export type FeatureKey = keyof typeof FEATURE_LABEL;

export const DEFAULT_FEATURES = Object.fromEntries(Object.keys(FEATURE_LABEL).map((k) => [k, true])) as Record<FeatureKey, boolean>;

/** 功能菜单里一项的设置，字段缺省为默认 */
export interface MenuNode { name?: string; parent?: string; sort?: number }

export interface Settings {
  /** 模块开关 */
  features: Record<FeatureKey, boolean>;
  /** 产品名称：登录页、侧栏、浏览器标题、打印页等界面字样统一取它；1–40 字 */
  productName?: string;
  /** 使用单位名称：打印页等取它；1–60 字 */
  orgName: string;
  /** 外网访问地址，如 https://xxx/app/；生成对外链接用，空为当前页面地址 */
  publicUrl?: string;
  /** 改过的菜单显示名：键为 group:模块键 或菜单地址，没改的不出现 */
  menuNames?: Record<string, string>;
  /** 功能菜单设置：显示名称、上级菜单（空串为一级）、同级排序；没改的菜单不出现。menuNames 是由它算出的显示名 */
  menuConfig?: Record<string, MenuNode>;
  /** 各角色的默认首页布局：角色 key → 隐藏的卡片 key */
  homeLayouts?: Record<string, string[]>;
  /** 登录验证码：always 总是需要、after-failures 密码错 N 次后需要、off 关闭；旧数据没有时按 always */
  loginCaptcha?: CaptchaMode;
  /** after-failures 的 N，默认 3 */
  loginCaptchaAfter?: number;
  /** 密码策略，默认 8 位、3 类字符、不能包含工号或登录名、不能与最近 3 次相同、不过期（0） */
  passwordMinLength?: number;
  passwordMinClasses?: number;
  passwordNotUserNo?: boolean;
  passwordHistory?: number;
  passwordMaxAgeDays?: number;
  /** 重置密码时设成的默认密码，只写；读取走 GET /settings/default-password */
  defaultPassword?: string;
  /** 用默认密码登录最多可忽略修改几次，超过必须改；1–20，默认 5 */
  defaultPasswordLogins?: number;
  /** 工作时间（HH:MM），默认 08:00–17:00；消息升级、催办按它判断 */
  workStart?: string;
  workEnd?: string;
  /** 工作日，1=周一 … 7=周日；没存过按周一至周五 */
  workDays?: number[];
  /** 安全策略：连续输错几次密码锁定账号（1–20，默认 5）、锁定多少分钟（1–1440，默认 15） */
  lockAfter?: number;
  lockMinutes?: number;
  /** 空闲多少分钟自动退出（0–1440，0 为不自动退出，默认 30），退出前 60 秒提示 */
  idleMinutes?: number;
  /** 同一账号再次登录：allow 允许多处同时在线，kick 踢掉之前的会话（默认 allow） */
  sessionPolicy?: SessionPolicy;
  /** 登录后的页面叠加「账号 + 时间」水印，默认开 */
  watermark?: boolean;
}
export type SessionPolicy = 'allow' | 'kick';
/** 安全策略的默认值，与后端一致 */
export const SECURITY_DEFAULTS = { lockAfter: 5, lockMinutes: 15, idleMinutes: 30, sessionPolicy: 'allow' as SessionPolicy, watermark: true };
/** 工作时间默认值，与后端 Settings 一致 */
export const WORK_START = '08:00';
export const WORK_END = '17:00';
export type CaptchaMode = 'always' | 'after-failures' | 'off';

/** 菜单显示名最多几个字，与后端 SettingsService.NAME_MAX 一致 */
export const MENU_NAME_MAX = 12;

/** PUT /settings 的入参；resetFeatures 只写：true 把模块开关恢复为默认 */
export type SettingsInput = Partial<Omit<Settings, 'menuNames' | 'menuConfig'>> & { resetFeatures?: boolean };

export type UnitType = 'center' | 'dept' | 'office';
export interface OrgUnit { id: string; name: string; code: string; type: UnitType; parentId: string | null; headId?: string; sort: number }

export type UserSource = 'manual' | 'sync' | 'import';
export interface User {
  id: string; username: string; name: string; no: string; unitId: string;
  title?: string; phone?: string; roleKeys: string[]; active: boolean;
  gender?: 'M' | 'F';
  /** 没有时按系统录入 */
  source?: UserSource;
  /** 不允许接口修改：同步时跳过 */
  syncLocked?: boolean;
  lastSyncAt?: string;
  /** 扩展人员属性：属性键 → 值，目录见「系统管理 › 人员属性」 */
  attrs?: Record<string, string>;
}

/** 人员属性的类型：文本、日期、下拉、多选 */
export type UserAttrType = 'text' | 'date' | 'select' | 'multi';
/** 人员属性目录的一项（「系统管理 › 人员属性」） */
export interface UserAttrDef { key: string; name: string; type: UserAttrType; maxLen: number; options?: string[]; sort: number; builtin: boolean; enabled: boolean; /** active 启用 / void 作废 */ status?: UserAttrStatus }
export type UserAttrStatus = 'active' | 'void';
/** 所有人通用的内置属性：账号、姓名、性别、证件号码、手机号；值存人员本身的字段，不能删除、不能作废，只读展示 */
export const BASE_ATTRS: UserAttrDef[] = [
  { key: 'username', name: '账号', type: 'text', maxLen: 32, sort: 1, builtin: true, enabled: true, status: 'active' },
  { key: 'name', name: '姓名', type: 'text', maxLen: 64, sort: 2, builtin: true, enabled: true, status: 'active' },
  { key: 'gender', name: '性别', type: 'text', maxLen: 1, sort: 3, builtin: true, enabled: true, status: 'active' },
  { key: 'idCard', name: '证件号码', type: 'text', maxLen: 32, sort: 4, builtin: true, enabled: true, status: 'active' },
  { key: 'phone', name: '手机号', type: 'text', maxLen: 20, sort: 5, builtin: true, enabled: true, status: 'active' },
];

/** 数据范围：全部 / 本部门及下级 / 本部门 / 本人 / 自定义组织；多个角色取并集 */
export type DataScope = 'all' | 'unitTree' | 'unit' | 'self' | 'custom';
/** 菜单出现在哪些端 */
export type Terminal = 'pc' | 'mobile';
export interface Role {
  key: string; name: string; desc: string; builtin: boolean; perms: string[];
  dataScope?: DataScope; dataUnits?: string[]; terminals?: Terminal[];
  /** 可使用的首页组件键；没有或含 '*' 为全部（默认） */
  components?: string[];
}

/** 首页一行的分列模式：左:右 = 1:2、2:1、1:1 */
export type HomeRowMode = '1:2' | '2:1' | '1:1';
export interface HomeRow { mode: HomeRowMode; cells: [string | null, string | null] }
/** 一个人保存的首页卡片布局 */
export interface HomeLayout { rows: HomeRow[] }

/** must 首次登录或被重置、expired 过期、weak 不符合密码策略；有值时只显示改密码页 */
/** must 首次登录或新建；expired 过期；weak 不合规；default-force 默认密码已用满可忽略次数；default 用着默认密码，只提示可忽略 */
export type PasswordChange = 'must' | 'expired' | 'weak' | 'default-force' | 'default';
export interface Me { user: User; roles: Role[]; perms: string[]; unit?: OrgUnit; passwordChange?: PasswordChange | null; passwordDefault?: { logins: number; max: number } | null }

/** 删除记录：被删除的数据，可恢复；系统管理员可物理删除 */
export interface DeletedRow {
  id: string; table: string; tableLabel: string; rowId: string; label: string | null; deletedBy: string | null; deletedAt: string;
  /** 同一批里还没处理的条数（含自己），大于 1 时可以「连同一起删的恢复」 */
  batchOpen: number; state: '已删除' | '已恢复' | '已清除'; handledBy: string | null; handledAt: string | null;
}

export interface DictItem { id: string; type: string; code: string; name: string; sort: number; active: boolean; /** 仅模拟层：已删除，进回收列表 */ deleted?: boolean }

// ---------- 消息等级 ----------

export type MsgLevel = 'minor' | 'normal' | 'important' | 'urgent';
export const MSG_LEVELS: MsgLevel[] = ['minor', 'normal', 'important', 'urgent'];
export const MSG_LEVEL_LABEL: Record<MsgLevel, string> = { minor: '次要', normal: '一般', important: '重要', urgent: '紧急' };
export interface MsgLevelChange { at: string; from: MsgLevel; to: MsgLevel; reason: string }

export interface Message {
  id: string; to: string; kind: string; title: string; body: string; link?: string; at: string; read: boolean;
  level: MsgLevel;
  /** 升级记录，旧到新 */
  levelLog?: MsgLevelChange[];
  /** 事件开始时间（如会议开始），没有为空 */
  eventAt?: string | null;
}

/** kind 为 '*' 是其余类型；importantAfter/urgentAfter 是待办等待多少工作分钟后升级，null 不升 */
export interface MsgKindRule { kind: string; level: MsgLevel; importantAfter: number | null; urgentAfter: number | null }
export interface MsgLevelPolicy {
  kinds: MsgKindRule[];
  /** 标题含关键字时至少是这个等级 */
  keywords: { keyword: string; level: MsgLevel }[];
  /** 标题以这些开头的也算待办（审批待办天然算） */
  todoPrefixes: string[];
  /** 离事件开始多少分钟内直接为重要 / 紧急 */
  eventImportantWithin: number; eventUrgentWithin: number;
  /** 同一单同一申请人两次催办的最小间隔（分钟） */
  urgeIntervalMinutes: number;
}
export interface MsgPushPolicy {
  enabled: boolean;
  /** 非工作时间也推；否则等到工作时间再推 */
  offHours: boolean;
  retries: number;
  rules: { level: MsgLevel; groupIds: string[] }[];
}
/** workHours 只读：系统设置里工作时间的说明，如「周一至周六 08:00–17:00」；在「基础配置」里改 */
export interface MsgPolicy { levels: MsgLevelPolicy; push: MsgPushPolicy; workHours?: string }

/** 操作日志：只增不改不删。detail 里写改前改后的值；source 是来源（页面操作、接口同步、定时任务等） */
export interface AuditLog { id: string; at: string; userId: string; userName: string; module: string; action: string; target: string; detail?: string; source?: string }

/** 登录日志：成功、失败、锁定、退出都记；source 是登录方式（账号密码、单点登录 CAS 等） */
export type LoginResult = '成功' | '失败' | '锁定' | '退出' | '被踢下线';
export interface LoginLog { id: string; at: string; username: string; userId?: string | null; userName?: string | null; result: LoginResult; reason?: string | null; source: string; ip?: string | null; ua?: string | null }

export interface Todo { key: string; module: string; label: string; count: number; to: string; tone?: 'warn' | 'bad' }

export interface Page<T> { items: T[]; total: number; page: number; size: number }

/** 附件引用：上传到 /attachments 后得到的 id 和文件信息 */
export interface FileRef { id: string; name: string; type: string; size: number }

// ---------- 审批流 ----------

export type ApproverRule =
  | { kind: 'role'; role: string }
  | { kind: 'user'; userId: string }
  | { kind: 'deptHead' }
  /** 业务数据里的 managerId，如业务对象的负责人 */
  | { kind: 'manager' }
  /** 角色里的人加业务数据里的 managerIds，任一人审批 */
  | { kind: 'roleOrManager'; role: string }
  /** 角色勾了这个权限点的人都可审批，自建角色也算 */
  | { kind: 'perm'; perm: string }
  /** 同 perm，再加业务数据里的 managerIds，任一人审批 */
  | { kind: 'permOrManager'; perm: string };

export interface WfCond { field: string; op: '>' | '>=' | '<' | '=' | 'in'; value: number | string | string[] }
/** approvers 有值时取并集（或签，任一人处理即通过），approver 保存为 approvers[0]；旧数据只有 approver */
export interface WfNode { name: string; approver: ApproverRule; approvers?: ApproverRule[]; when?: WfCond }
export interface WfDef { type: string; name: string; nodes: WfNode[]; active: boolean }

export type WfStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export interface WfStep {
  /** 系统记的自动通过步骤 userId 为 null，comment 是原因 */
  node: string; userId: string | null; userName: string; action: '提交' | '通过' | '驳回' | '撤回' | '自动通过'; comment?: string; at: string;
  /** 代审时原审批人姓名，顿号分隔 */
  proxyFor?: string;
}
export interface WfInstance {
  id: string; type: string; typeName: string; bizId: string; title: string; applicantId: string; applicantName: string;
  status: WfStatus;
  /** auto 非空表示这一节点发起时判定为自动通过，值为原因 */
  nodes: { name: string; approverIds: string[]; auto?: string | null }[]; current: number; steps: WfStep[]; createdAt: string;
  data: Record<string, unknown>;
}

export interface WfPolicy {
  autoApprove: { enabled: boolean; admin: boolean; self: boolean };
  /** 角色可代审的流程类型，['*'] 为全部 */
  proxies: { role: string; types: string[] }[];
}
export interface UrgeState {
  allowed: boolean; reason: string | null; nextAt: string | null; interval: number;
  records: { at: string; userName: string; node: string; level: MsgLevel }[];
}

// ---------- 单点登录与硬件接口 ----------

export type SsoKind = 'platform' | 'token-exchange' | 'cas' | 'oidc';
export interface SsoProvider {
  id: SsoKind; name: string; enabled: boolean;
  /** 地址、密钥、字段映射；键随方式不同 */
  config: Record<string, string>;
  /** 外部账号按哪个字段对应本系统人员 */
  matchBy: 'no' | 'username';
  /** 查不到人员时自动建号（没有角色，等管理员分配） */
  autoProvision: boolean;
}

export interface DeviceEndpoint {
  id: string; kind: string; name: string; usedBy: string;
  impl: 'mock' | 'vendor'; vendor: string; address: string; secret: string; enabled: boolean;
}
export interface DeviceLog { id: string; at: string; endpointId: string; action: string; ok: boolean; detail: string }

export type UserSyncField = 'no' | 'name' | 'gender' | 'dept' | 'phone';
export interface UserSyncConfig {
  enabled: boolean; impl: 'mock' | 'vendor';
  /** 推送用；密钥只在生成时返回明文 */
  appKey: string; secret: string;
  /** 拉取用 */
  address: string; headerName: string; headerValue: string; listPath: string;
  fields: Record<UserSyncField, string>;
  genderMap: Record<string, 'M' | 'F'>;
  scheduleEnabled: boolean; scheduleAt: string;
  /** 外部不再返回的人员 */
  missing: 'keep' | 'disable';
  lastCallAt?: string;
}
export type UserSyncMode = 'push' | 'schedule' | 'manual';
export interface UserSyncLog {
  id: string; at: string; mode: UserSyncMode; total: number; added: number; updated: number; unchanged: number;
  skipped: number; failed: number; disabled: number; ok: boolean; message: string; costMs?: number;
}
export interface UserSyncLine { row?: number; no: string; name: string; result: '新增' | '更新' | '无变化' | '跳过' | '失败' | '停用'; reason?: string | null }

// ---------- 群消息推送（钉钉、企业微信群机器人） ----------

export type GroupChannel = 'dingtalk' | 'wecom';
export interface MsgGroup {
  id: string; name: string; channel: GroupChannel;
  /** 群机器人 Webhook；钉钉另有加签密钥 */
  webhook: string; secret: string; enabled: boolean;
}

/** 业务事件；模块调用 publish(event, …)，按规则发站内消息和群消息 */
/** 业务事件，写成「模块键.动作」；模块调用 publish(event, …)，按规则发站内消息和群消息。没有规则的事件不发，规则在 api/mock/notify.ts 的 RULES 里给默认值 */
export type MsgEvent =
  | 'example.submitted' | 'example.approved'
  /** 按消息等级推到群里 */
  | 'push'
  | (string & {});

/** 节假日：放假和调休上班，工作时间按它判定哪天上班 */
export interface HolidayBase { id: string; year: number; name: string; start: string; end: string; kind: '放假' | '调休上班'; note?: string }

export interface MsgRule {
  id: MsgEvent; name: string; module: string; when: string; enabled: boolean;
  /** 站内消息发给申请人 */
  site: boolean;
  groupIds: string[];
  /** 群消息里 @ 申请人（按手机号） */
  atApplicant: boolean;
  /** 模板，{变量} 由事件提供 */
  template: string;
}

export interface MsgSendLog {
  id: string; at: string; event: MsgEvent; channel: GroupChannel | 'site'; target: string; title: string; text: string; ok: boolean;
  /** 失败原因，如「试了 3 次：errcode -1：system busy」 */
  error?: string | null;
}
