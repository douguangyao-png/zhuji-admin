// 框架的集中配置：新项目复制后先改这里。界面上的产品名称、使用单位以「系统管理 › 基础配置」为准，这里只是默认值
export const APP = {
  /** 产品名称默认值：登录页、侧栏、浏览器标题 */
  productName: 'xxx管理系统',
  /** 使用单位默认值：打印页等 */
  orgName: 'xxx单位',
  /** 浏览器本地存储的键前缀，同一域名下挂多个系统时互不串数据 */
  storagePrefix: 'zhuji',
  /** 接后端时的接口前缀，相对页面地址 */
  apiBase: './api/v1',
  /** 备份文件名前缀 */
  backupPrefix: 'backup',
} as const;

export const DEFAULT_PRODUCT_NAME = APP.productName;

/** 本地存储键前缀，各处写成 `${STORE}.xxx` */
export const STORE = APP.storagePrefix;
