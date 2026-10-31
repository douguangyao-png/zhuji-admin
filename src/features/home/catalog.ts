/** 首页组件目录：键与名称。角色管理里「可使用的组件」和首页编辑布局都按这份列；组件本身在 HomePage 里按模块开关和权限再筛一遍 */
export interface HomeComponentDef { key: string; label: string }

export const HOME_COMPONENTS: HomeComponentDef[] = [
  { key: 'todo', label: '待办' },
  { key: 'msg', label: '消息' },
  { key: 'quick', label: '快捷入口' },
  { key: 'my-wf', label: '我发起的审批' },
  // 模块的首页卡片：key 与 ModuleDef.home 里的一致
  { key: 'ex-rejected', label: '被驳回的示例登记' },
];

export const HOME_COMPONENT_LABEL: Record<string, string> = Object.fromEntries(HOME_COMPONENTS.map((c) => [c.key, c.label]));

/** 角色可使用的组件：没配或含 * 为全部；多个角色取并集 */
export function allowedComponents(roles: { components?: string[] }[]): Set<string> | 'all' {
  if (!roles.length) return 'all';
  const out = new Set<string>();
  for (const r of roles) {
    if (!r.components || r.components.includes('*')) return 'all';
    r.components.forEach((k) => out.add(k));
  }
  return out;
}
