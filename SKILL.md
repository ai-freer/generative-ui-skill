# Generative UI Skill

让 AI agent 在对话中生成交互式 UI 组件 —— 图表、架构图、计算器、数据可视化。

## 概述

本 Skill 通过 System Prompt 注入，教会模型使用 `show-widget` 代码围栏输出可渲染的 HTML/SVG widget。不依赖特定 SDK 或 tool_use 机制，任何能输出 markdown 的模型都能使用。

## 安装

将本 Skill 目录添加到 agent 的 skill 列表中，确保 `prompts/system.md` 被注入到模型的 system prompt。

## 配置

根据使用场景，选择注入哪些设计指南模块。每个模块都应与 `prompts/guidelines/core.md` 组合使用。

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `modules` | 加载哪些指南模块 | `["core"]` |
| `send_message_fn` | widget 内追问的函数名 | `window.__widgetSendMessage` |

### 可用模块

| 模块 | 加载的指南文件 | 适用场景 |
|------|-------------|---------|
| `diagram` | core + color-palette + svg-setup + diagram | 流程图、架构图、示意图 |
| `chart` | core + ui-components + color-palette + chart | Chart.js 数据图表、仪表板 |
| `interactive` | core + ui-components + color-palette | 计算器、表单、交互组件 |
| `mockup` | core + ui-components + color-palette | UI 原型、卡片、布局 |
| `art` | core + svg-setup + art | SVG 插画、生成艺术 |

## 使用方式

### 1. 注入 System Prompt

将 `prompts/system.md` 的内容追加到模型的 system prompt 中。

### 2. 按需注入指南模块

根据对话场景，将 `prompts/guidelines/` 下对应的指南文件内容追加到 system prompt。共享部分（如 core.md）只需注入一次。

### 3. 模型输出 Widget

模型会在回复中使用代码围栏输出 widget：

````
一些文字说明...

```show-widget
{"title": "jwt_auth_flow", "widget_code": "<svg width=\"100%\" viewBox=\"0 0 680 420\">...</svg>"}
```

更多文字说明...
````

### 4. 前端渲染

前端检测到 `show-widget` 围栏后，提取 `widget_code` 并渲染到 iframe 或 DOM 中。

## 示例

- `examples/flowchart.html` — JWT 认证流程（SVG 流程图）
- `examples/chart.html` — 用户增长趋势（Chart.js 折线图 + 指标卡片）
- `examples/calculator.html` — 复利计算器（交互滑块 + 实时图表）
- `examples/comparison.html` — REST vs GraphQL 对比（SVG 并排图）

## 已验证的模型

| 模型 | 状态 | 备注 |
|------|------|------|
| Claude Sonnet 4.6 | ✅ | 原始方案验证模型 |
| Kimi K2.5 | ✅ | 图形质量甚至优于 Sonnet 4.6 |
| Minimax M2.5 | ✅ | 支持 |
| Seed 2.0 Pro | 待验证 | — |
| GPT-5.4 | 待验证 | — |

## 技术要求

### CDN 白名单

Widget 内的外部资源只能从以下 CDN 加载（CSP 强制执行）：

- `cdnjs.cloudflare.com`
- `cdn.jsdelivr.net`
- `unpkg.com`
- `esm.sh`

### 安全约束

- Widget 代码在 sandbox iframe 中执行（无 allow-same-origin / allow-top-navigation）
- `connect-src 'none'` 禁止 fetch / XHR / WebSocket
- 链接点击被拦截，由宿主应用处理

## 相关项目

- 渲染运行时（`@generative-ui/renderer`）—— 见 M2 里程碑
- 原始参考：[CodePilot](https://github.com/op7418/CodePilot) / [pi-generative-ui](https://github.com/Michaelliv/pi-generative-ui)
