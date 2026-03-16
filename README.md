# Generative UI Skill

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

让任何 chatbot 的文本输出能够承载交互式 UI 组件 —— 图表、架构图、计算器、数据可视化 —— 无需前端改造，任何能输出 markdown 的模型都能驱动。

## 致谢

本项目的灵感和核心技术参考来自以下作者和开源项目，在此特别致谢：

- **[@op7418（歸藏）](https://github.com/op7418)**—— 其文章[《我复刻了 Claude 刚发布的生成式 UI 交互！》](https://mp.weixin.qq.com/s/3IQIs6zP5jfdTwmT5LUJ6g)验证了代码围栏 + sandbox iframe 方案的可行性，并证明 Kimi K2.5、Minimax M2.5 等国产模型同样能驱动该能力，为本项目提供了核心灵感。
- **[pi-generative-ui](https://github.com/Michaelliv/pi-generative-ui)**（[Michaelliv](https://github.com/Michaelliv)，MIT 协议）—— 逆向工程了 Claude.ai 原生 `show_widget` 实现，提取了完整的 Anthropic 设计指南（~72KB），并用 morphdom + Glimpse 在终端 agent 中复现了流式渲染体验。本项目的 `prompts/guidelines/` 设计指南即基于该项目提取适配。逆向工程文章：[Reverse-engineering Claude's generative UI](https://michaellivs.com/blog/reverse-engineering-claude-generative-ui/)

---

## 项目背景

2026-03-12，Anthropic 在 Claude.ai 上线了生成式 UI 交互 —— 模型可以在对话中内联渲染交互式 HTML/SVG 组件。CodePilot 用开源方案复刻了这套能力。

本项目的目标：把这套能力抽象成**通用 Skill**，让 OpenClaw 管理的所有 chatbot 和 AI agent 都能生成富 UI 回复。

---

## 技术架构

### Claude 原生方案

通过逆向工程（来源：[pi-generative-ui](https://github.com/Michaelliv/pi-generative-ui)）揭示的 Claude.ai 原生实现：

**触发方式：`show_widget` tool call**

模型调用 `show_widget` 工具，传入结构化 JSON（非 markdown 文本流）：

```json
{
  "i_have_seen_read_me": true,
  "title": "snake_case_identifier",
  "loading_messages": ["Generating chart...", "Almost ready..."],
  "widget_code": "<style>...</style>\n<div>...</div>\n<script>...</script>"
}
```

**渐进式文档加载：`read_me` 工具**

模型在首次调用 `show_widget` 前，必须先调用 `read_me` 工具按需加载设计指南：

| 模块 | 内容 | 大小 |
|------|------|------|
| diagram | Core + Color Palette + SVG Setup + Diagram Types | ~59KB |
| chart | Core + UI Components + Color Palette + Chart.js | ~22KB |
| interactive | Core + UI Components + Color Palette | ~19KB |
| mockup | Core + UI Components + Color Palette | ~19KB |
| art | Core + SVG Setup + Art/Illustration | ~17KB |

共享部分自动去重（如 Core Design System 只注入一次）。这是渐进式信息披露应用于模型自身指令的范例 —— 基础 system prompt 保持精简，专业知识按需加载。

**流式渲染：morphdom DOM diffing**

Claude.ai 的 widget 不使用 iframe，而是直接注入父页面 DOM：

```
LLM 开始生成 show_widget tool call
  → widget_code 参数逐 token 流式输出（streaming partial JSON）
  → 客户端增量解析 partial JSON，提取已到达的 HTML
  → morphdom 对比新旧 DOM 树，仅更新变化的节点
  → 新增节点播放 fadeIn 动画，相同节点保持不动
  → 流式完成后，clone script 标签使其执行
```

安全边界通过 CSP 策略实现，限制 `script src` 只能从 4 个 CDN 白名单加载。

**Widgets vs Artifacts**

| 维度 | Widgets（show_widget） | Artifacts |
|------|----------------------|-----------|
| 定位 | 对话内嵌增强 | 可交付物 |
| 展示 | 内联在聊天中，透明背景 | 侧边栏，可下载 |
| 库支持 | 任意 CDN 白名单内的库，运行时下载 | 固定预置库集合 |
| 生命周期 | 临时，绑定到消息 | 持久化，跨会话 |

### CodePilot 方案

CodePilot 采用了不同的技术路线：

**触发方式：代码围栏（文本流）**

模型在 markdown 输出中使用 ` ```show-widget ` 围栏包裹 widget 代码，不依赖 tool_use 机制。

**渲染方式：sandbox iframe + CSP**

使用 sandbox iframe 实现完全隔离的执行环境，通过 postMessage 实现父子通信。

**三层安全防护：**

1. **流式清理**（sanitizeForStreaming）—— 剥离 iframe/object/embed/form/meta/link/base、所有 on* 事件处理器、所有 script 标签、javascript:/data: URL
2. **终态清理**（sanitizeForIframe）—— 仅剥离嵌套/逃逸标签，保留 script 和 event handler（在 sandbox 内安全执行）
3. **iframe sandbox** —— `sandbox="allow-scripts"`（无 allow-same-origin/allow-top-navigation/allow-popups），CSP 限制 CDN 白名单，`connect-src 'none'` 禁止 fetch/XHR/WebSocket

**iframe 通信协议：**

```
父页面 → iframe:
  widget:update    { html }           流式预览（无脚本）
  widget:finalize  { html }           完整渲染（执行脚本）
  widget:theme     { vars, isDark }   主题同步

iframe → 父页面:
  widget:ready     {}                 iframe 就绪
  widget:resize    { height }         高度变化
  widget:link      { href }           链接点击
  widget:sendMessage { text }         widget 内按钮触发追问
```

### 方案对比

| 维度 | Claude.ai 原生 | CodePilot | 本项目方案 |
|------|---------------|-----------|-----------|
| 触发 | `show_widget` tool call | ` ```show-widget ` 代码围栏 | 代码围栏（兼容任何 markdown 模型） |
| 流式渲染 | morphdom DOM diffing，直接注入父 DOM | HTML 流 → sanitize → postMessage → iframe | 支持双模式：morphdom（性能）/ iframe（安全） |
| 隔离 | CSP 限制 CDN 白名单 | sandbox iframe + CSP | 按场景选择隔离级别 |
| 文档加载 | `read_me` 渐进加载 5 模块 | 静态注入简化版 prompt | 渐进加载（基于 Anthropic 原版指南） |
| 模型依赖 | 仅限 Claude | 任何 markdown 模型 | 任何 markdown 模型 |

---

## 产物概览

本项目分三个产物递进交付：

### 产物 A：Prompt Skill（M1）

System prompt 注入层。启用后，模型知道如何输出 widget 格式（` ```show-widget ` 代码围栏 + 合法 HTML/SVG）。包含基于 Anthropic 原版的模块化设计指南（Core / Diagram / Chart / Interactive / Mockup / Art），按需注入，避免 token 浪费。不依赖前端改造，可立刻验证模型输出效果。

### Guidelines 模块与主题映射

Guidelines 不是「几套固定模板」，而是一组可以自由组合的**表达能力基元**，用来让同一个主题从多个视角被「看见」。

当前内置模块：

- **core**：结构化文字说明（概念、规则、方法、分点总结）。
- **diagram**：关系 / 结构 / 流程图（架构图、时序图、用户旅程图等）。
- **chart**：数据图表（趋势、对比、分布、占比等）。
- **interactive**：可交互内容（可点 / 可拖 / 可调参数的 demo、模拟器、小工具）。
- **mockup**：界面、原型和高保真页面效果。
- **art**：风格化视觉（插画、海报、情绪板、世界观视觉）。

我们不预设有限的主题类型，而是用一组通用问题，把「任意主题」映射到对应模块组合：

1. **这个主题的核心是什么？**
   - 概念、规则、方法 → 必选 `core`
   - 结构 / 流程复杂 → 再加 `diagram`
   - 指标 / 数字很多 → 再加 `chart`
2. **它更像「系统」还是「体验」？**
   - 偏系统设计、架构、流程 → `core + diagram (+ chart)`
   - 偏产品体验、页面、交互 → `mockup (+ interactive) + core`
3. **有没有「需要用户亲手操作一下才懂」的部分？**
   - 有：把这块拆成 `interactive` 模块（参数调节、状态切换、可视化 playground）
4. **是否需要强烈的风格 / 情绪 / 品牌感？**
   - 有：加上 `art`，让它可以弱化纯文字比重，用视觉说话。

经验法则：

- 所有主题**至少**会有 `core`，再叠加其它视角。
- 每个主题可以同时使用 2–4 个模块，让信息更立体。
- 当遇到一个全新的主题时，只需要重新回答上面四个问题，就能自然映射到一组模块组合；未来新增主题或模块，都不需要改这套规则。

常见主题的示例组合（可按需扩展）：

| 主题示例                     | 推荐模块组合                      |
|------------------------------|-----------------------------------|
| 任意技术 / 概念讲解          | core, diagram                     |
| 任意数据相关主题             | core, chart, diagram              |
| 任意产品 / 功能设计          | core, mockup, diagram             |
| 任意交互或算法可视化         | core, diagram, interactive        |
| 任意品牌 / 世界观 / 设定     | core, art, mockup                 |
| 任意复杂策略 / 流程优化方案 | core, diagram, chart, interactive |
| 任意「只想看视觉灵感」主题   | art, mockup, （可选少量 core）    |

### 产物 B：渲染运行时（M2）

框架无关的 JS 库（`@generative-ui/renderer`）。任何前端引入后就能渲染 widget。核心能力：流式围栏检测、HTML 清理（两阶段）、CSS 变量桥接、双模式渲染器（iframe / morphdom）。封装为 Web Component `<widget-renderer>`。

### 产物 C：Aight 集成（M3）

在 Aight app 聊天界面中集成产物 B，实现 WKWebView 内嵌 widget 渲染、深色/浅色主题同步、widget 内按钮触发追问。

---

## 设计决策

### 为什么选代码围栏而非 tool_use？

Claude 原生用 `show_widget` tool call，但我们选择代码围栏：
- 不依赖特定 SDK 的 tool 注册机制
- 文本流天然支持流式传输（边生成边渲染）
- 任何能输出 markdown 的模型都能用（Claude, GPT, Kimi, Zhipu...）
- 复用现有 markdown 解析管线

### 为什么支持双渲染模式？

Claude 原生用 morphdom 直接 DOM 注入（性能好但安全依赖 CSP），CodePilot 用 sandbox iframe（安全但有性能开销）。我们同时支持两种模式：
- **iframe 模式**：适合不可信环境（第三方集成、公开 chat），完全隔离
- **morphdom 模式**：适合可信环境（自有产品），更流畅的渲染体验

### 为什么内置 Tailwind-like 工具类？

- 避免加载 Tailwind CDN（污染全局样式 + 与宿主冲突）
- 模型可以用熟悉的类名（flex, grid, p-4, rounded-lg）
- 只包含常用子集，体积可控

### 为什么 CSS 变量桥接而非直接用宿主变量？

- 模型按标准变量名写 CSS（`--color-background-primary`）
- 桥接层负责映射到不同宿主的实际变量
- 换宿主只需改桥接层，模型 prompt 不变

---

## 模型兼容性

| 模型 | 支持情况 | 备注 |
|------|---------|------|
| Claude Sonnet 4.6 | ✅ | 高性价比 Sota 模型 |
| Openai GPT 5.4 | ✅ | 高性价比 Sota 模型 |
| Kimi K2.5 | ✅ | 图形质量甚至优于 Sonnet 4.6 |
| Seed 2.0 Pro | 待验证 | 需测试 prompt 遵循度和生成质量 |
| 其他 markdown 模型 | 理论可行 | 需验证 prompt 遵循度 |

---

## CDN 白名单

以下 CDN 被 CSP 策略允许，widget 内的 `<script src>` 只能从这些域加载：

- **cdnjs.cloudflare.com** — Chart.js, D3 等主流库
- **cdn.jsdelivr.net** — npm 包 CDN
- **unpkg.com** — npm 包 CDN
- **esm.sh** — ESM 格式 CDN

---

## 测试

Playground 使用 Node.js 内置测试框架（`node:test` + `node:assert`），零外部依赖。

```bash
cd playground

# 全部测试
npm test

# 仅单元测试（parser / search / prompt）
npm run test:unit

# 仅 E2E + widget 渲染检查
npm run test:e2e
```

测试覆盖：
- **parser** — 围栏检测、partial JSON 提取、HTML 转义、inline markdown
- **search** — locale 检测（中/英/日/韩 + 国家/语言 hint）
- **prompt** — system prompt 加载、模块去重、自动 prepend core
- **e2e** — API 端点校验（providers / chat SSE 流）
- **widget-render** — example HTML 静态检查（禁止标签、CDN 白名单、CSS 变量）

开发规则：
- 日常开发 / debug：运行相关模块的单元测试（`npm run test:unit` 或指定文件）
- 提交代码前：运行 `npm test` 全量回归，确认无交叉影响

---

## 里程碑

| 阶段 | 内容 | 状态 |
|------|------|------|
| M0 | 技术分析 + 源码研究 + 项目规划 | ✅ 完成 |
| M1 | 产物 A：Prompt Skill 创建 + 验证 | ✅ 完成（待模型验证） |
| M2 | 产物 B：渲染运行时 JS 库 | 待开始 |
| M3 | 产物 C：Aight 集成 | 待开始 |

详细开发计划参见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

---

## 参考资料

- 歸藏原文：[《我复刻了 Claude 刚发布的生成式 UI 交互！》](https://mp.weixin.qq.com/s/3IQIs6zP5jfdTwmT5LUJ6g)
- 逆向工程文章：[Reverse-engineering Claude's generative UI](https://michaellivs.com/blog/reverse-engineering-claude-generative-ui/)
- pi-generative-ui 仓库：https://github.com/Michaelliv/pi-generative-ui （MIT 协议）
- CodePilot 仓库：https://github.com/op7418/CodePilot （未声明开源协议）
- Obsidian 存档：Knowledge/2026-03-15-claude-generative-ui.md（含 16 张图片）

---

## 协议

本项目基于 [Apache License 2.0](./LICENSE) 开源。

使用本项目时，请保留 [NOTICE](./NOTICE) 文件中的版权声明和第三方归属信息。
