[English](./README.md) | 简体中文

# 筑基（zhuji-admin）

React 管理后台框架：登录与权限、系统管理、消息、审批、帮助与问题反馈，附一个示例模块和新模块生成脚本。复制后改产品名，加自己的模块，接上后端即可使用。

界面上显示的产品名称是占位的「**xxx管理系统**」，复制后到 `src/app.config.ts`（以及 `index.html`）里替换。

## 1. 功能

| 方面 | 内容 |
| --- | --- |
| 登录 | 账号密码（SM2 加密传输）、滑块验证码、连续输错锁定、新建或重置账号首次登录强制改密码、单点登录（平台签名令牌、令牌换用户、CAS、OIDC） |
| 权限 | 角色 + 菜单级、按钮级权限点（`can('xxx:yyy')` 和 `<Can>`）、数据范围、可用端；越权打开路由时回首页并提示 |
| 系统管理 | 组织机构树、人员与扩展人员属性、角色权限、字典、审批流、基础配置、安全策略、功能菜单、消息推送、接口配置、日志、备份与恢复 |
| 首页 | 待办、消息、快捷入口、我发起的审批四张卡片；每人可编辑自己的布局，管理员可设角色默认布局 |
| 消息与审批 | 消息四级、按工作时间自动升级、催办、群机器人推送；多审批人、代审、自动通过规则 |
| 日志 | 操作日志（谁、何时、对象、改前改后、来源，只增不改不删）、登录日志（成功、失败、锁定、退出）、浏览器错误日志（脱敏，可选上报） |
| 安全 | 空闲超时、并发登录策略、页面水印、手机号和证件号码脱敏展示、Markdown 净化、内容安全策略建议，见 [docs/安全说明.md](./docs/安全说明.md) |
| 外观 | 主题只有白天和黑夜两种，顶栏切换或按 Shift+T；背景光晕可随白天 / 黑夜变化；本机存的主题值读不懂时回到白天 |
| 帮助 | 操作说明、问题反馈（含回复）、版本说明、只读数据库查询 |
| 开发体验 | 示例模块、`npm run new:module`、浏览器内模拟后端、接口约定文档、路由冒烟测试自动覆盖新菜单 |

## 2. 快速开始

```bash
git clone https://github.com/douguangyao-png/zhuji-admin.git
cd zhuji-admin
npm install
npm run dev          # http://localhost:3500，跑在浏览器内的模拟后端上
```

演示账号（密码都是 `demo`）：`admin`（系统管理员）、`manager`（业务管理员）、`head`（部门负责人）、`user`、`user2`（普通用户）。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run typecheck` | TypeScript 检查 |
| `npm test` | 单元测试和路由冒烟测试（vitest） |
| `npm run build` | 构建（带模拟后端，演示用） |
| `VITE_API=server npm run build` | 连真实后端构建，产物里不含模拟层代码 |
| `npm run check:clean` | 扫描残留名称和旧前缀；同时检查两份 README 的二级标题数量一致 |
| `npm run check:api` | 比对页面用到的接口和 `docs/接口约定.md` |

## 3. 目录结构

```text
src/
  app.config.ts      产品名称、存储键前缀、接口前缀、备份文件名前缀
  app/               外壳：登录、侧栏、顶栏、空闲超时、水印、错误边界
  core/              会话、权限、菜单、弹窗、导入导出等
  api/               请求入口（http.ts）、类型、权限点目录、模拟后端（mock/）
  ui/                通用组件和样式变量
  lib/               日志、脱敏、净化、时间、密码规则等工具
  features/
    system/          系统管理各页面
    help/            操作说明、问题反馈、版本说明、数据库查询、项目文档
    home/            首页、审批、消息
    example/         示例模块（新模块照它写）
docs/                接口约定、开发指南、安全说明
scripts/             new-module.mjs、check-clean.mjs、check-api.mjs
```

## 4. 新增模块

```bash
npm run new:module contract 合同管理        # 模块键、显示名、可选的两位大写单号前缀
```

脚本把 `features/example` 复制成 `features/<键>/`（类型、接口、模拟后端、页面、入口五个文件），并登记到 `app/modules.ts`、`api/types.ts` 的模块开关和 `api/perms.ts` 的权限点。键不合法、是保留字或已存在时报错退出，不写任何文件。生成后改字段、校验和种子数据，给角色勾上新的权限点，再跑 `npm run typecheck && npm test`（路由冒烟测试会自动打开每个菜单）。

## 5. 对接后端

页面只通过 `src/api/http.ts` 访问后端。用 `VITE_API=server` 构建后，所有请求发到 `apiBase`（默认 `./api/v1`），响应包、状态码、SM2 密码传输和权限规则见 [docs/接口约定.md](./docs/接口约定.md)。页面用到了文档里没有的接口时 `npm run check:api` 会失败。登录凭证由后端写在 HttpOnly Cookie 里，前端不保存令牌。

## 6. 安全与责任

前端只能提示：隐藏菜单和按钮、脱敏展示、水印本身都保护不了数据。**所有权限、校验、锁定、会话控制和数据范围必须以后端为准。** 框架做了什么、没做什么、部署时使用方必须自己做的事（HTTPS、响应头、后端校验、合规工作），写在 [docs/安全说明.md](./docs/安全说明.md) 里。

## 7. 技术栈

版本取自 `package-lock.json` 里解析出的实际版本，只列代码里真正用到的。

| 分类 | 技术 | 版本 | 用途 |
| --- | --- | --- | --- |
| 框架与语言 | React / React DOM | 18.3.1 | 界面 |
| 框架与语言 | TypeScript | 5.6.3 | 严格类型（`npm run build` 里先跑 `tsc`） |
| 构建 | Vite（配 `@vitejs/plugin-react` 5.2.0） | 7.3.7 | 开发服务器和打包；构建目标 `chrome80`，相对路径，产物可挂在任意路径下；构建时加入 CSP meta |
| 路由 | react-router-dom | 7.18.4 | 哈希路由（`createHashRouter`）、路由守卫 |
| 数据请求与缓存 | TanStack Query | 5.104.3 | 所有页面的服务端数据 |
| 表格 | TanStack Table | 8.21.3 | 通用 `DataTable` 组件 |
| 状态 | Zustand | 4.5.7 | 登录会话、主题、确认框、提示等小块客户端状态 |
| Markdown 与图表 | marked | 12.0.2 | 帮助菜单里的项目文档（输出先过净化） |
| Markdown 与图表 | mermaid | 11.4.1 | 文档里的图，按需加载 |
| 二维码 | qrcode-generator | 1.4.4 | 打印单据上的二维码 |
| 国密 SM2 传输加密 | 本仓库自己实现 SM2 / SM3（`src/lib/sm2.ts`） | 非第三方库 | 密码加密后再发送；没有引用第三方密码库 |
| 表格文件 | 本仓库自己实现（`src/lib/xlsx.ts`、`csv.ts`） | 非第三方库 | 用浏览器自带的 `DecompressionStream` 读 `.xlsx`，CSV 导入导出 |
| 测试 | Vitest | 3.2.7 | 单元测试和路由冒烟测试 |
| 测试 | Testing Library（react 16.3.3、jest-dom 6.9.1、user-event 14.6.8） | 见左 | 测试里渲染和操作页面 |
| 测试 | jsdom | 25.0.1 | 测试用的浏览器环境 |
| 样式 | 自带 `tokens.css`、`ui.css`、`brand.css` | 非第三方库 | 设计变量和组件；主题只有白天和黑夜 |

### 不包含什么

没有后端。默认跑在浏览器内的模拟层（`src/api/mock/`）上，数据存在浏览器里；后端按 [docs/接口约定.md](./docs/接口约定.md) 对接。
