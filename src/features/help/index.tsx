import type { ModuleDef } from '@/core/module';
import { DbQueryPage } from './DbQueryPage';
import { DocsPage } from './DocsPage';
import { FeedbackPage } from './FeedbackPage';
import { GuidePage } from './GuidePage';
import { ReleasesPage } from './ReleasesPage';
import { TESTING } from './release';

export const helpModule: ModuleDef = {
  key: 'help', name: '帮助', icon: 'help',
  menu: [
    { name: '操作说明', to: '/help/guide', icon: 'file' },
    { name: '问题反馈', to: '/help/feedback', icon: 'mail' },
    { name: '版本说明', to: '/help/releases', icon: 'clock' },
    { name: '数据库查询', to: '/help/db', icon: 'database', perm: 'sys:db' },
    ...(TESTING ? [{ name: '项目文档', to: '/help/docs', icon: 'file' as const }] : []),
  ],
  routes: [
    { path: '/help/guide', element: <GuidePage />, handle: { title: '操作说明' } },
    { path: '/help/feedback', element: <FeedbackPage />, handle: { title: '问题反馈' } },
    { path: '/help/releases', element: <ReleasesPage />, handle: { title: '版本说明' } },
    { path: '/help/db', element: <DbQueryPage />, handle: { title: '数据库查询' } },
    ...(TESTING ? [
      { path: '/help/docs', element: <DocsPage />, handle: { title: '文档' } },
      { path: '/help/docs/:name', element: <DocsPage />, handle: { title: '文档' } },
    ] : []),
  ],
};
