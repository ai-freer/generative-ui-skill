---
name: generative-ui
description: "在对话中生成交互式 UI 组件（图表、架构图、流程图、计算器、数据可视化）。Use when: 用户请求可视化、图表、流程图、架构图、对比表、数据展示、交互组件，或任何适合用图形化方式呈现的内容。NOT for: 纯文本问答、代码生成、文件操作。"
homepage: https://github.com/ai-freer/generative-ui-skill
metadata: { "openclaw": { "emoji": "📊", "requires": { "env": ["CHROME_CDP_URL"] } } }
---

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

## 渠道适配：Widget 截图与投递（M3）

在 Telegram、飞书等非 Web 渠道，widget 无法直接渲染为 iframe。Agent 需要在输出 `show-widget` 围栏后，主动调用截图脚本将 widget 渲染为 PNG 图片并发送给用户。

> Web Playground 和 Aight App 支持直接渲染 widget，无需执行此步骤。

### 截图流程

> 脚本路径使用 `{baseDir}` 占位符，OpenClaw 会自动替换为本 Skill 的安装目录。

1. 输出 `show-widget` 围栏后，调用截图脚本（通过 exec 工具，host 设为 gateway）：

```
exec: echo '<模型回复全文>' | node {baseDir}/scripts/widget-screenshot.mjs --title "<widget_title>"
```

脚本会从回复中提取对应的 show-widget 围栏，渲染为 PNG，输出文件路径。

2. 用 send action 发送图片到当前会话：

```
send: { to: "<chat_id>", media: "<png_path>", caption: "<widget_title>" }
```

3. 如果 widget 包含 drill-down 按钮（`__widgetSendMessage` 调用），可以提取按钮列表：

```
exec: echo '<widget_code>' | node {baseDir}/scripts/widget-drilldown.mjs
```

然后在 send action 中附加 buttons 参数，让用户可以点击追问。

### 环境要求

- exec 工具需使用 `host: gateway`（或 `node`），以继承宿主环境变量（如 `CHROME_CDP_URL`）
- 如果 VPS 上使用已有的 Chrome 实例，需设置环境变量：`CHROME_CDP_URL=http://localhost:9222`
- 如果未设置 `CHROME_CDP_URL`，脚本会自动启动 headless Chromium（需要 Playwright + Chromium 已安装）

### 脚本参数

| 脚本 | 参数 | 说明 |
|------|------|------|
| `widget-screenshot.mjs` | `--title <name>` | 从 stdin 的模型输出中按 title 提取 widget 并截图 |
| | `--file <path>` | 直接截图一个 HTML 文件 |
| | `--output <path>` | 指定输出 PNG 路径（默认自动生成临时路径） |
| | `--theme light\|dark` | 截图主题（默认 light） |
| | `--width <px>` | 视口宽度（默认 680） |
| `widget-drilldown.mjs` | `--code <html>` | 从 widget_code 中提取 drill-down 按钮 |
| | `--file <path>` | 从文件中提取 |

## 相关项目

- 渲染运行时（`@generative-ui/renderer`）—— 见 M2 里程碑
- 原始参考：[CodePilot](https://github.com/op7418/CodePilot) / [pi-generative-ui](https://github.com/Michaelliv/pi-generative-ui)
