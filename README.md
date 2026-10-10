# Being Goals

A standalone Grove desktop plugin inspired by Muse's conversation-led goals workflow.

目标插件：与你的 Being 制定目标、明确完成标准、记录进展，并让对话与插件页面共享同一份状态。

## 边界

- 目标 UI、分类、状态与协作规则全部在本项目。
- Town Client 只提供通用 **Grove SDK 1.4**、声明式字段校验、隔离存储和 Portal `@plugins` 调用通道。
- 不修改 Being 的主提示词、普通聊天消息、主体工具循环或自主行为。
- 用户从插件点击“与 Being 继续”，或明确要求 Being 使用目标插件时，Being 才读取插件契约与协作偏好。
- “创建目标”必须通过结构化写入完成；自然语言回复不是持久化结果。

## 功能

- 分类创建、目标列表、详情、验收标准、下一步、进展时间线。
- 待完善 / 追踪中 / 待你补充 / 已暂停 / 已完成 / 已归档。
- 当前关注目标与插件范围内的协作偏好。
- 用户在插件编辑 → Being 通过插件命令读取最新数据。
- Being 创建/更新目标 → 页面与独立窗口即时刷新。
- 版本冲突保护、相同请求重试去重、Being 与插件数据隔离。
- 使用宿主并排聊天；不会覆盖现有输入草稿。
- 浅色 / 深色主题与窄侧栏布局。

## 构建与安装

需要 Node.js 22+ 和提供 SDK 1.4 的 Town Client。SDK 类型固定在 `vendor/grove-plugin-sdk`；实际运行时由客户端注入，不需要把 npm 依赖安装到客户端。

```sh
npm ci
npm run typecheck
npm test
npm run build
```

客户端「工具库 → Plugin → 导入插件目录」，选择生成的 `dist`。需要声明的权限会在安装时显示。SDK 1.3 的旧客户端会明确拒绝此包，先更新带有插件行为 SDK 的客户端。

将“目标”视图设置为导航入口后，可在“更多功能”中固定到左侧。也支持独立窗口及“当前目标”侧栏。

## 让 Being 使用插件

安装并启用插件，连接 Being 和本机 Portal。在插件中选择类别或点击“与 Being 继续”，发送生成的草稿。也可直接说：

> 请使用 beings.goals 目标插件，先通过 portal_exec 调用 `@plugins {"plugin":"beings.goals","op":"describe"}` 读取行为契约，然后帮我制定每周阅读目标。

客户端不会把这些内容自动插入其他对话。

Being 调用示例（`portal_exec` 的 `command` 字符串）：

```text
@plugins {"plugin":"beings.goals","op":"describe"}
@plugins {"plugin":"beings.goals","op":"list"}
@plugins {"plugin":"beings.goals","op":"create","requestId":"reading-2026-01","data":{"title":"每周读一本书","category":"interests","outcome":"形成稳定阅读习惯","criteria":["读完一本书并写下三条收获"],"nextAction":"今晚选一本书","status":"active"}}
```

修改目标：先 `get` 最新记录，然后 `update`，提交记录版本 `expectedRevision`、变更 `patch` 和进展依据 `note`。`configure` 可在用户要求时调整本插件的协作偏好或关注目标。完整契约与格式通过 `describe` 获取。

## 运行条件与数据

本版本的 Being → 插件通道复用 Portal 的认证 Desktop client-command 桥。Portal 与客户端需要在同一机器并连接同一 Being；Portal 需要支持该桥。窗口关闭不影响通道，退出客户端后不可用。

这不是后台目标执行器：不会自动安排提醒、调用 subagent 或承诺离线持续工作。

数据保存在客户端用户目录 `plugins/agent-data/beings.goals/<endpoint-hash>.json`，不会上传到本 GitHub 项目。按 Being endpoint 隔离，不做跨设备同步。Being 仅在调用插件时取得返回数据。停用或卸载插件撤销访问，重新安装相同 ID 后恢复本地数据。

SDK 保留最近 2000 条变更，最多 500 条记录、4 MiB 数据；最近 256 个请求支持幂等重试。完成状态需填写依据；Being 端也受插件契约指导，但自然语言契约不是后台调度或策略引擎。

## 测试

```sh
npm test
npm run typecheck
npm run build
# 先在客户端项目构建聊天资源：npm run build:chat
TOWN_CLIENT_DIR=/absolute/path/Town-Client node tests/desktop.mjs
```

跨项目测试启动隔离临时 Electron 配置，使用假的 Being 响应，不读取真实凭据、不连接真实 Being。它验证实际 iframe/SDK、认证命令通道、Being 创建/更新、插件 UI 更新、独立窗口、撤销权限和普通聊天原样发送。AI 是否选择调用工具受实际模型与 Portal 连接影响，测试不冒充真实模型验收。

## 项目结构

- `desktop.plugin.json`：插件行为、字段契约、权限和入口。
- `src/main.tsx`、`style.css`：目标体验。
- `src/adapter.ts`：把目标业务映射到通用 `grove.agent`，宿主无需理解目标。
- `vendor/grove-plugin-sdk`：固定版本的类型契约，无运行时。
- `tests/desktop.mjs`：与客户端联合运行的集成验证。

MIT License.
