# Generative UI Skill

让任何 chatbot 的文本输出能够承载交互式 UI 组件（图表、架构图、计算器、数据可视化）。

## 项目背景

2026-03-15，Anthropic 在 Claude.ai 上线了生成式 UI 交互。开源项目 CodePilot 复刻了这套能力，并验证了 Kimi K2.5、Minimax M2.5 等国产模型也能驱动。

Daniel 的目标：把这套能力抽象成通用 Skill，让 OpenClaw 管理的所有 chatbot 和 AI agent 都能生成富 UI 回复。

## 参考

- 原文：《我复刻了 Claude 刚发布的生成式 UI 交互！》（歸藏的AI工具箱）
- URL：https://mp.weixin.qq.com/s/3IQIs6zP5jfdTwmT5LUJ6g
- Obsidian 存档：Knowledge/2026-03-15-claude-generative-ui.md（含 16 张图片）
- CodePilot 仓库：https://github.com/op7418/CodePilot（MIT 协议）

---

## 一、技术分析

### 1.1 Claude 官方 vs CodePilot 方案

| 维度 | Claude.ai | CodePilot |
|------|-----------|-----------|
| 触发 | tool_use（结构化 JSON） | 代码围栏（文本流） |
| 流式 | 等 JSON 拼完才渲染 | HTML 随 token 到达，边生成边预览 |
| 隔离 | Shadow DOM | sandbox iframe + CSP |

代码围栏更优：不依赖特定 SDK 的 tool 注册，文本流天然支持流式传输，任何能输出 markdown 的模型都能用。

### 1.2 核心架构

```
用户消息 → system prompt 注入 widget 指南 → 模型输出 text delta 流
  → 正则检测 ```show-widget
  → 流式阶段：sanitizeForStreaming() → 剥离 script/handler → 120ms debounce → postMessage → iframe
  → 终态阶段：sanitizeForIframe() → 分离 script/visual → visual 相同则跳过替换 → 追加 script 执行
```

### 1.3 安全模型（三层防护）

**第一层：流式清理**（sanitizeForStreaming）
- 剥离：iframe/object/embed/form/meta/link/base
- 剥离：所有 on* 事件处理器、所有 script 标签
- 剥离：javascript:/data: URL

**第二层：终态清理**（sanitizeForIframe）
- 仅剥离嵌套/逃逸标签
- 保留 script 和 event handler（在 sandbox 内安全执行）

**第三层：iframe sandbox**
- sandbox="allow-scripts"（无 allow-same-origin/allow-top-navigation/allow-popups）
- CSP：script-src 'unsafe-inline' + 4 个 CDN 白名单
- connect-src 'none'（禁止 fetch/XHR/WebSocket）
- 链接拦截 → postMessage → 父窗口新标签打开

### 1.4 体验打磨（7 个关键问题）

| 问题 | 原因 | 修复 |
|------|------|------|
| 文字消失 | parseAllShowWidgets 对纯文本返回 [] | 无围栏时直接渲染 MessageResponse |
| 高度跳变 | iframe 从 0px 跳到实际高度 | 首次 resize 跳过 CSS transition |
| Finalize 闪烁 | innerHTML 替换瞬间清空 DOM | 分离 script/visual，visual 相同则跳过替换 |
| 滚动回跳 | streaming→persisted 组件重挂载 | 模块级高度缓存 _heightCache |
| Script 代码泄露 | </script> 未到达时开标签被剥离 | 在 partial code 层截断未闭合 script |
| iframe Ready 竞态 | useEffect 监听晚于 widget:ready | iframe onLoad 回调兜底 |
| React key 不稳定 | partial→closed 路径 key 变化 | partialWidgetKey 与索引对齐 |

---

## 二、CodePilot 源码参考

### 2.1 核心文件清单

| 文件 | 作用 | 大小 |
|------|------|------|
| src/lib/widget-guidelines.ts | 模型 prompt 规范 | ~11KB |
| src/lib/widget-sanitizer.ts | HTML 清理 + receiver iframe srcdoc | ~6KB |
| src/lib/widget-css-bridge.ts | CSS 变量桥接 | ~14KB |
| src/components/chat/WidgetRenderer.tsx | iframe 渲染核心 | ~10KB |
| src/components/chat/StreamingMessage.tsx | 流式围栏检测 | — |
| src/components/chat/WidgetErrorBoundary.tsx | 错误边界 | 很小 |
| src/components/chat/MessageItem.tsx | 持久化 widget 渲染 | — |
| src/components/chat/ChatView.tsx | __widgetSendMessage 桥接 | — |

### 2.2 Widget System Prompt（核心 prompt，~2.5KB）

模型收到的指令，定义了何时/如何生成 widget：

```
<widget-capability>
Format: ```show-widget {"title":"snake_case_id","widget_code":"<svg>...</svg>"}```

When to use:
| User intent              | Format                   |
|--------------------------|--------------------------|
| Process / how X works    | SVG flowchart            |
| Structure / what is X    | SVG hierarchy or layers  |
| History / sequence       | SVG timeline             |
| Cycle / feedback loop    | SVG cycle diagram        |
| Compare A vs B           | SVG side-by-side         |
| Data / trends            | Chart.js (canvas + CDN)  |
| Calculation / formula    | HTML with sliders/inputs |
| Ranking / proportions    | HTML bar display         |

Rules:
1. widget_code is raw HTML/SVG — no DOCTYPE/html/head/body
2. Transparent background — host provides bg
3. Warm minimal — no gradients/shadows/blur
4. Each widget ≤ 3000 chars
5. CDN allowlist: cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, esm.sh
6. Text explanations go OUTSIDE the code fence
7. SVG: <svg width="100%" viewBox="0 0 680 H">
8. Clickable drill-down: onclick="window.__widgetSendMessage('Explain [topic]')"
9. Interactive controls MUST call chart.update() after data changes
</widget-capability>
```

### 2.3 模块化指南系统

按需组装，避免每次注入全量 context：

| 模块 | 包含内容 | 适用场景 |
|------|---------|---------|
| diagram | Core Design + Color Palette + SVG Setup + Diagram Types | 架构图、流程图 |
| chart | Core Design + UI Components + Color Palette + Chart.js | 数据图表 |
| interactive | Core Design + UI Components + Color Palette | 计算器、表单 |
| mockup | Core Design + UI Components + Color Palette | UI 原型 |
| art | Core Design + SVG Setup + Color Palette | 艺术图形 |

共享部分自动去重（如 Core Design 只注入一次）。

### 2.4 Receiver iframe 通信协议

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

### 2.5 CDN 白名单

- cdnjs.cloudflare.com — Chart.js, D3 等
- cdn.jsdelivr.net — npm 包 CDN
- unpkg.com — npm 包 CDN
- esm.sh — ESM 格式 CDN

### 2.6 颜色体系

| 色系 | 50 (fill) | 200 (stroke) | 400 (accent) | 800 (title) |
|------|-----------|-------------|-------------|-------------|
| Indigo | #EEF2FF | #C7D2FE | #818CF8 | #3730A3 |
| Emerald | #ECFDF5 | #A7F3D0 | #34D399 | #065F46 |
| Amber | #FFFBEB | #FDE68A | #FBBF24 | #92400E |
| Slate | #F8FAFC | #E2E8F0 | #94A3B8 | #334155 |
| Rose | #FFF1F2 | #FECDD3 | #FB7185 | #9F1239 |
| Sky | #F0F9FF | #BAE6FD | #38BDF8 | #075985 |

CSS 变量桥接：模型写 `--color-background-primary`，桥接层映射到宿主的 `var(--background)`。同时内置 Tailwind-like 工具类子集，避免加载 Tailwind CDN。

---

## 三、产物规划

### 产物 A：OpenClaw Skill（prompt 注入）

**目标**：让任何 OpenClaw agent 启用后，模型知道如何输出 widget 格式。

**实现**：
- 创建 generative-ui Skill，包含 SKILL.md + prompt 模板
- System prompt 注入 WIDGET_SYSTEM_PROMPT（~2.5KB）
- 按需模块指南通过 Skill 参数控制（diagram/chart/interactive）
- 不依赖前端改造，可立刻验证模型输出效果

**Skill 目录结构**：
```
shared-skills/generative-ui/
├── SKILL.md              # Skill 描述 + 使用说明
├── prompts/
│   ├── system.md         # WIDGET_SYSTEM_PROMPT
│   ├── diagram.md        # SVG 图表指南
│   ├── chart.md          # Chart.js 指南
│   └── interactive.md    # 交互组件指南
└── examples/
    ├── flowchart.json    # 示例 widget 输出
    ├── chart.json        # Chart.js 示例
    └── calculator.json   # 交互计算器示例
```

**验证方式**：
- 启用 Skill 后，让模型回答"解释 JWT 认证流程"
- 检查输出是否包含 show-widget 围栏 + 合法 SVG/HTML
- 在 CodePilot 或自建页面中渲染验证

### 产物 B：渲染运行时（JS 库）

**目标**：任何前端引入后就能渲染 widget。

**实现**：
- 从 CodePilot 提取核心渲染逻辑
- 做成框架无关的 Web Component（<widget-renderer>）
- 暴露简单 API：renderWidget(code, container, options)

**核心模块**：
```
@generative-ui/renderer
├── sanitizer.ts          # HTML 清理（流式 + 终态）
├── css-bridge.ts         # CSS 变量桥接（可配置映射）
├── receiver.ts           # iframe srcdoc 构建
├── widget-renderer.ts    # 渲染核心（Web Component）
├── stream-parser.ts      # 流式围栏检测 + partial code 提取
└── index.ts              # 统一导出
```

**API 设计**：
```typescript
import { WidgetRenderer } from '@generative-ui/renderer';

const renderer = new WidgetRenderer({
  container: document.getElementById('chat'),
  theme: 'auto',
  cdnWhitelist: [...],
  onSendMessage: (text) => { /* widget 内按钮追问 */ },
  onLink: (href) => { /* 链接点击 */ },
});

renderer.streamUpdate(partialHtml);  // 流式渲染
renderer.finalize(fullHtml);         // 终态渲染
renderer.parseAndRender(modelOutput); // 自动检测并渲染
```

**落地场景**：
- Aight app（iOS WKWebView 内嵌）
- OpenClaw web chat UI
- 任何第三方 chat 客户端

### 产物 C：Aight 集成（远期）

**目标**：在 Aight app 聊天界面中原生渲染 widget。

**实现**：
- Aight 消息渲染层引入产物 B
- 检测模型回复中的 show-widget 围栏
- 消息气泡内嵌入 WKWebView 渲染 widget
- 支持深色/浅色主题同步
- 支持 widget 内按钮触发追问

---

## 四、里程碑

| 阶段 | 内容 | 状态 |
|------|------|------|
| M0 | 技术分析 + 源码研究 + 项目规划 | ✅ 完成 |
| M1 | 产物 A：OpenClaw Skill 创建 + 验证 | 待开始 |
| M2 | 产物 B：渲染运行时 JS 库 | 待开始 |
| M3 | 产物 C：Aight 集成 | 待开始 |

---

## 五、已验证的模型兼容性

| 模型 | 支持情况 | 备注 |
|------|---------|------|
| Claude Sonnet 4.6 | ✅ | CodePilot 主力模型 |
| Kimi K2.5 | ✅ | 图形质量甚至优于 Sonnet 4.6 |
| Minimax M2.5 | ✅ | 支持 |
| 其他 markdown 模型 | 理论可行 | 需验证 prompt 遵循度 |

---

## 六、关键设计决策

### 为什么选代码围栏而非 tool_use？
- 不依赖特定 SDK 的 tool 注册机制
- 文本流天然支持流式传输（边生成边渲染）
- 任何能输出 markdown 的模型都能用
- 复用现有 markdown 解析管线

### 为什么选 sandbox iframe 而非 Shadow DOM？
- 完全独立的 JS 执行环境（Shadow DOM 共享 JS 上下文）
- CSP 精确控制资源加载
- 不存在样式泄漏和脚本逃逸
- connect-src 'none' 彻底禁止网络请求

### 为什么内置 Tailwind-like 工具类？
- 避免加载 Tailwind CDN（污染全局样式 + 与宿主冲突）
- 模型可以用熟悉的类名（flex, grid, p-4, rounded-lg）
- 只包含常用子集，体积可控

### 为什么 CSS 变量桥接而非直接用宿主变量？
- 模型按标准变量名写 CSS（--color-background-primary）
- 桥接层负责映射到不同宿主的实际变量
- 换宿主只需改桥接层，模型 prompt 不变
