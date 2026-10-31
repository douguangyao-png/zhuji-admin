import type { FeatureKey } from './types';

/** 权限点目录：角色页按这里显示勾选矩阵；feature 关掉的模块，其权限点在角色页隐藏。新模块的权限点组加在「模块权限点」标记处（npm run new:module 自动插入） */
export const PERM_GROUPS: { name: string; feature?: FeatureKey; perms: [string, string][] }[] = [
  { name: '示例模块', feature: 'example', perms: [['example:view', '查看'], ['example:edit', '登记与修改'], ['example:approve', '审批']] },
  // 模块权限点
  { name: '操作', perms: [['op:import', '导入'], ['op:export', '导出'], ['op:print', '打印']] },
  { name: '系统', perms: [['sys:org', '组织'], ['sys:user', '人员'], ['sys:role', '角色权限'], ['sys:dict', '字典'], ['sys:workflow', '审批流'], ['sys:setting', '基础配置'], ['sys:device', '接口配置'], ['sys:audit', '操作日志'], ['sys:feedback', '问题反馈处理'], ['sys:db', '数据库查询'], ['sys:backup', '备份与恢复']] },
];

export const PERM_LABEL: Record<string, string> = Object.fromEntries(PERM_GROUPS.flatMap((g) => g.perms.map(([k, l]) => [k, `${g.name} · ${l}`])));
