import { createHashRouter, RouterProvider } from 'react-router-dom';
import { routes } from './App';
import './app.css';
import './base.css';

const router = createHashRouter(routes);

/** 工作台：外壳和全部业务页面，按需加载 */
export default function Workbench() {
  return <RouterProvider router={router} />;
}
