# ui/ 来源记录 / Provenance

本目录的组件和样式变量最初写给一个内部管理后台，随后抽取进本框架并继续修改。它不是某个公开 UI 库的副本。
The components and style tokens here were first written for an internal admin front end, then extracted into this framework and modified since. They are not a copy of a public UI library.

| 项 | 内容 |
| --- | --- |
| 基准提交 | `a65d626`（筑基 1.0.0 加许可证） |
| 同步日期 | 2026-11-01 |
| 许可证 | Apache-2.0（与仓库一致） |
| 本地改动 | 全部为本仓库内改动；`Dialog`、`Confirm`、`Popover` 的弹层行为改用 Radix（react-dialog、react-popover），`Tabs` 自带方向键切换 |
| 图标 | `Icon.tsx` 为内联 SVG，线条风格，来源尚未逐个核对；如确认取自 Lucide（ISC），需补充其版权声明 |

更新本目录时，同步修改上面的基准提交和同步日期；`npm run check:clean` 会检查本文件存在且含「同步日期」。
When you update this directory, update the commit and date above; `npm run check:clean` checks that this file exists and contains the 同步日期 row.
