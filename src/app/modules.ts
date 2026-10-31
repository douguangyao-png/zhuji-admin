import type { FeatureKey } from '@/api/types';
import type { ModuleDef } from '@/core/module';
import { registerMenus } from '@/core/menu-names';
import { exampleModule } from '@/features/example';
import { systemModule } from '@/features/system';
import { helpModule } from '@/features/help';
// 模块引用

/** 侧栏按这个顺序显示；新模块加在「模块列表」标记处（npm run new:module 自动插入） */
export const MODULES: ModuleDef[] = [
  exampleModule,
  // 模块列表
  systemModule, helpModule,
];
registerMenus(MODULES.map((m) => ({ key: m.key, name: m.name, icon: m.icon, feature: m.feature, anyFeature: m.anyFeature, items: m.menu.map((i) => ({ to: i.to, name: i.name, icon: i.icon })) })));

const enabled = (m: ModuleDef, on: (f?: FeatureKey) => boolean) => (m.anyFeature ? m.anyFeature.some(on) : on(m.feature));
export const visibleModules = (on: (f?: FeatureKey) => boolean) => MODULES.filter((m) => enabled(m, on));
