import type { ModuleDef } from '@/core/module';
import { AuditPage } from './AuditPage';
import { BackupPage } from './BackupPage';
import { DevicesPage } from './DevicesPage';
import { DictPage } from './DictPage';
import { MenusPage } from './MenusPage';
import { NotifyPage } from './NotifyPage';
import { OrgPage } from './OrgPage';
import { RolesPage } from './RolesPage';
import { SecurityPage } from './SecurityPage';
import { SettingsPage } from './SettingsPage';
import { UsersPage } from './UsersPage';
import { UserAttrsPage } from './UserAttrsPage';
import { WorkflowPage } from './WorkflowPage';

export const systemModule: ModuleDef = {
  key: 'system', name: '系统管理', icon: 'settings',
  menu: [
    { name: '组织机构', to: '/system/org', icon: 'network', perm: 'sys:org' },
    { name: '人员', to: '/system/users', icon: 'users', perm: 'sys:user' },
    { name: '人员属性', to: '/system/user-attrs', icon: 'tablegrid', perm: 'sys:user' },
    { name: '角色权限', to: '/system/roles', icon: 'key', perm: 'sys:role' },
    { name: '审批流', to: '/system/workflow', icon: 'check', perm: 'sys:workflow' },
    { name: '字典', to: '/system/dicts', icon: 'tablegrid', perm: 'sys:dict' },
    { name: '基础配置', to: '/system/settings', icon: 'layers', perm: 'sys:setting' },
    { name: '安全策略', to: '/system/security', icon: 'lock', perm: 'sys:setting' },
    { name: '功能菜单', to: '/system/menus', icon: 'sidebar', perm: 'sys:setting' },
    { name: '消息推送', to: '/system/notify', icon: 'bell', perm: 'sys:device' },
    { name: '接口配置', to: '/system/devices', icon: 'router', perm: 'sys:device' },
    { name: '操作日志', to: '/system/audit', icon: 'clock', perm: 'sys:audit' },
    { name: '备份与恢复', to: '/system/backup', icon: 'database', perm: 'sys:backup' },
  ],
  routes: [
    { path: '/system/org', element: <OrgPage />, handle: { title: '组织机构' } },
    { path: '/system/users', element: <UsersPage />, handle: { title: '人员' } },
    { path: '/system/user-attrs', element: <UserAttrsPage />, handle: { title: '人员属性' } },
    { path: '/system/roles', element: <RolesPage />, handle: { title: '角色权限' } },
    { path: '/system/workflow', element: <WorkflowPage />, handle: { title: '审批流' } },
    { path: '/system/dicts', element: <DictPage />, handle: { title: '字典' } },
    { path: '/system/settings', element: <SettingsPage />, handle: { title: '基础配置' } },
    { path: '/system/security', element: <SecurityPage />, handle: { title: '安全策略' } },
    { path: '/system/menus', element: <MenusPage />, handle: { title: '功能菜单' } },
    { path: '/system/notify', element: <NotifyPage />, handle: { title: '消息推送' } },
    { path: '/system/devices', element: <DevicesPage />, handle: { title: '接口配置' } },
    { path: '/system/audit', element: <AuditPage />, handle: { title: '操作日志' } },
    { path: '/system/backup', element: <BackupPage />, handle: { title: '备份与恢复' } },
  ],
};
