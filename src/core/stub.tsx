import type { RouteObject } from 'react-router-dom';
import { Building } from './bits';
import type { MenuItem } from './module';

/** 还没做的菜单项先挂「建设中」页，菜单结构先定下来 */
export const stubRoutes = (menu: MenuItem[]): RouteObject[] =>
  menu.map((m) => ({ path: m.to, element: <Building title={m.name} />, handle: { title: m.name } }));
