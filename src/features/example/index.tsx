import type { ModuleDef } from '@/core/module';
import { ExamplePage } from './ExamplePage';
import { RejectedCard } from './HomeCard';

/** 示例模块：菜单、路由；在 app/modules.ts 的 MODULES 里登记后出现在侧栏 */
export const exampleModule: ModuleDef = {
  key: 'example', name: '示例模块', icon: 'file', feature: 'example',
  menu: [
    { name: '示例登记', to: '/example', icon: 'tablegrid', perm: 'example:approve' },
    { name: '我的登记', to: '/example/mine', icon: 'file', perm: 'example:view' },
  ],
  routes: [
    { path: '/example', element: <ExamplePage />, handle: { title: '示例登记' } },
    { path: '/example/mine', element: <ExamplePage mine />, handle: { title: '我的登记' } },
  ],
  home: [{ key: 'ex-rejected', perm: 'example:edit', Card: RejectedCard }],
};
