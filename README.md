# dsh-token-pulse

Token 用量统计插件（动态 Cordis 插件版）——记录 DeepSeek Harness 的 token 用量脉搏。

记录 DeepSeek Harness 进程内**全部模型调用**的 token 用量，在 Web GUI 的设置面板展示：

- 汇总卡片：输入 / 输出 / 缓存 / 总量
- GitHub 风格**每日热力图**：按年份切换（2026 起），周日开头，颜色深浅 = 当日总量，悬停显示明细，未来日期不显示
- **近 24 小时**（小时粒度）与**近 7 天**（天粒度）平滑曲线：输入/输出/缓存/总量四条线，点击图例按钮可筛选
- 页面每 10 秒自动刷新

## 文件说明

| 文件 | 内容 |
| --- | --- |
| `host.js` | Host 半部分：拦截 `llm/stream` 瀑布记录 usage，防抖写入数据文件，提供 `get-stats` / `set-workspace-root` RPC |
| `client.js` | Client 半部分：设置面板「Token 用量」页面（React，无 JSX） |

## 安装方式（动态安装，不改任何源码）

在 DSH 会话中让 Agent 通过 Cordis 动态插件工具安装：

1. `cordis_define`：`kind: "new"`，`idPrefix: "token"`，`code.host` = `host.js` 内容，`code.client` = `client.js` 内容；
2. `cordis_run`：激活生成的 Package；
3. 首次运行需在 Web GUI 的 Run 卡片上批准。

## 数据

- 数据文件：`<会话工作区>/.dsh-token-usage.json`，结构 `{ v: 1, records: [{ t, input, output, cache }] }`，仅保留近 400 天。
- 删除该文件即可清空统计。

## 注意事项（动态插件的特性）

- 插件定义只存在于 DSH 进程内存：**进程重启后插件消失**，需重新安装（数据文件保留）。
- 只统计插件运行期间发生的模型调用。
- 本目录不接入 DeepSeek Harness 的 Node.js 源码，无构建、无配置改动。
