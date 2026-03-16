# Generative UI Skill — 开发计划

本文档指导 generative-ui Skill 的具体实施，覆盖 M1 ~ M3 三个里程碑。

---

## 里程碑总览

```
M0 技术分析 + 项目规划               ✅ 完成
M1 产物 A：Prompt Skill             ✅ 完成
M2 产物 B：渲染运行时 JS 库          ← 当前
M3 产物 C：渠道适配层
```

依赖关系：M1 独立可交付 → M2 依赖 M1 的 prompt 格式定义 → M3 依赖 M2 的渲染库。

---

## M1：Prompt Skill ✅

### 目标

创建 generative-ui Skill，让任何接入 OpenClaw 的 agent 启用后，模型知道如何输出 `show-widget` 代码围栏格式的交互式 UI 组件。

### 完成产出

```
generative-ui/
├── README.md                       # 项目架构介绍
├── DEVELOPMENT.md                  # 开发计划（本文件）
├── SKILL.md                        # Skill 描述 + 使用说明
├── package.json                    # 版本管理
├── prompts/
│   ├── system.md                   # 核心 System Prompt（四层响应结构 + Drill-down 设计）
│   └── guidelines/
│       ├── core.md                 # Core Design System
│       ├── color-palette.md        # 9 色系 × 7 阶色板
│       ├── svg-setup.md            # SVG 基础设施（预置 class、箭头标记、字体校准）
│       ├── diagram.md              # 流程图 / 结构图规范
│       ├── chart.md                # Chart.js 指南
│       ├── ui-components.md        # UI 组件（指标卡片、交互控件）
│       └── art.md                  # SVG 插画 / 生成艺术
├── examples/                       # 4 个完整示例 widget
├── tests/
│   └── prompt-validation.md        # 验证用例清单
└── playground/                     # 本地测试环境（M2 原型验证）
    ├── server.mjs                  # Express 后端（SSE 流式代理）
    └── public/                     # Chat UI + 渲染逻辑原型
```

### M1 期间的关键发现

以下经验直接影响了 M2 的架构设计：

1. **四层响应结构**：system prompt 增加了 Summary → Widget → Notes → Drill-down 的输出顺序规范，让图表更早出现
2. **SVG 预置 class 必须注入**：模型会用 `c-blue`、`.t` 等 class，但 iframe/预览 div 中必须有对应 CSS 定义，否则回退黑色填充
3. **深色填充对比度问题**：模型有时 hardcode 深色 SVG 填充，需要 `fixContrast()` 脚本自动检测并修正文字颜色
4. **增量渲染消除闪烁**：全量重建（`innerHTML = ''`）导致 iframe 反复创建，改为增量渲染后闪烁消失
5. **流式 DOM 预览**：围栏未闭合时，从不完整 JSON 提取部分 widget_code，在预览 div 中直接渲染 SVG，实现逐步"长出来"的体验
6. **iframe 自适应高度**：通过 postMessage 上报 `document.body.scrollHeight`，父页面动态设置 iframe 高度

验证模型：Claude Opus 4.6, Claude Sonnet 4.6（通过第三方兼容 API）

---

## M2：渲染运行时 JS 库

### 目标

从 playground 验证过的渲染逻辑中提取核心模块，做成框架无关的 JS 库 `@generative-ui/renderer`。任何前端引入后就能渲染 show-widget 围栏内的 HTML/SVG。

> **参考实现**：`playground/public/app.js` 是 M1 期间迭代出的原型，已验证完整的流式围栏检测 → 增量渲染 → sandbox iframe 流水线。M2 在此基础上重构为可复用库。

### 核心架构：三阶段渲染流水线

M1 playground 验证了一种比原 CodePilot 方案更优的渲染模型——不是 iframe 和 morphdom 二选一，而是**三阶段流水线**：

```
Token 流入
  │
  ├─ 围栏未开始 ──→ 纯文本渲染（增量更新 activeTextEl.innerHTML）
  │
  ├─ 围栏已开启，widget_code 未就绪 ──→ 阶段 1：占位符（"正在生成图表…"）
  │
  ├─ 围栏已开启，widget_code 开始流入 ──→ 阶段 2：流式 DOM 预览
  │   ├─ 直接 innerHTML 注入（或 morphdom diff）部分 SVG/HTML
  │   ├─ 不使用 iframe → 零开销，SVG 逐步"长出来"
  │   └─ 需要 extractPartialWidgetCode() 从不完整 JSON 提取部分内容
  │
  └─ 围栏闭合，JSON 解析成功 ──→ 阶段 3：sandbox iframe（最终态）
      ├─ 完整 CSP 安全沙箱
      ├─ script 可执行，onclick 交互生效
      └─ postMessage 自适应高度 + 对比度修复
```

**关键洞见**：
- morphdom 不是 iframe 的替代品，而是阶段 2 流式预览的优化手段（用 DOM diff 代替 innerHTML 全量替换）
- 阶段 3 始终是 iframe（安全边界不可妥协）
- 阶段 2 → 阶段 3 的切换只发生一次，切换后 iframe 永不销毁（消除闪烁）

### 包结构

```
packages/renderer/
├── package.json                    # @generative-ui/renderer
├── tsconfig.json
├── src/
│   ├── index.ts                    # 统一导出
│   ├── types.ts                    # 类型定义
│   ├── stream-parser.ts            # 流式围栏检测 + partial JSON 提取
│   ├── sanitizer.ts                # HTML 清理（流式 + 终态两阶段）
│   ├── css-bridge.ts               # CSS 变量桥接 + SVG 预置 class
│   ├── streaming-preview.ts        # 阶段 2：流式 DOM 预览（可选 morphdom 增强）
│   ├── iframe-renderer.ts          # 阶段 3：sandbox iframe 最终渲染
│   └── widget-renderer.ts          # 统一编排器（Web Component <widget-renderer>）
├── styles/
│   ├── widget-base.css             # iframe 内注入的基础样式
│   ├── svg-classes.css             # SVG 预置 class（9 色阶 × 文字/结构/色彩）
│   └── streaming-preview.css       # 流式预览作用域样式
└── tests/
    ├── stream-parser.test.ts
    ├── sanitizer.test.ts
    └── renderer.test.ts
```

### 关键任务

#### 任务 1：stream-parser — 流式围栏检测 + partial JSON 提取

从模型的文本 delta 流中实时检测 ` ```show-widget ` 围栏，提取 widget code。

核心模块（playground 已验证）：
- `parseShowWidgetFence(streamText)` — 检测所有已闭合围栏，返回 `{ title, widget_code, start, end }[]`
- `isShowWidgetFence(firstLine)` — 大小写不敏感判断围栏类型（兼容 `show-widget` / `show_widget`）
- `extractPartialWidgetCode(partialBody)` — 从未完成的 JSON 中提取部分 widget_code，处理 JSON 转义（`\"` → `"`, `\n` → 换行等）

待补充：
- 截断未闭合的 `<script>` 标签（避免流式预览中脚本代码泄露为可见文本）
- 正式状态机封装（TEXT → FENCE_OPEN → WIDGET_CODE → FENCE_CLOSE）

参考实现：`playground/public/app.js` parseShowWidgetFence / extractPartialWidgetCode

#### 任务 2：sanitizer — 两阶段 HTML 清理

**流式阶段**（sanitizeForStreaming）— 用于阶段 2 流式预览：
- 剥离：iframe / object / embed / form / meta / link / base
- 剥离：所有 on* 事件处理器
- 剥离：所有 script 标签
- 剥离：javascript: / data: URL

**终态阶段**（sanitizeForIframe）— 用于阶段 3 iframe：
- 仅剥离嵌套/逃逸标签（防止 iframe 内嵌 iframe）
- 保留 script 和 event handler（在 sandbox 内安全执行）

参考实现：CodePilot `widget-sanitizer.ts`

#### 任务 3：streaming-preview — 流式 DOM 预览

阶段 2 渲染器，在围栏未闭合期间实时预览部分 SVG/HTML。

核心逻辑（playground 已验证）：
- 创建 `.widget-streaming` 预览 div，注入 SVG 预置 class 样式
- 调用 `extractPartialWidgetCode()` 获取部分 widget_code
- 通过 innerHTML 更新预览内容（SVG 逐步"长出来"）
- 围栏闭合后移除预览 div，切换到 iframe

可选增强：用 morphdom 替代 innerHTML 实现更精细的 DOM diff
- `onNodeAdded` 回调：新节点播放 fadeIn 动画
- `onBeforeElUpdated` 回调：相同节点跳过更新

参考实现：`playground/public/app.js` renderStreamChunk（widget-streaming 逻辑）+ pi-generative-ui `index.ts`（morphdom 集成）

#### 任务 4：iframe-renderer — sandbox iframe 最终渲染

阶段 3 渲染器，围栏闭合后创建安全沙箱。

核心逻辑（playground 已验证）：
- `sandbox="allow-scripts"`（无 allow-same-origin / allow-top-navigation / allow-popups）
- CSP：`script-src 'unsafe-inline'` + CDN 白名单；`connect-src 'none'`
- `buildWidgetDoc(widgetCode)` — 拼装完整 HTML 文档（CSS 变量 + SVG class + widget_code + 通信脚本）
- postMessage 通信：`widgetResize`（自适应高度）/ `widgetSendMessage`（钻取交互）
- 对比度修复脚本 `fixContrast()` — 自动检测深色填充的 SVG 形状，将内部文字改白色
- 高度自适应 `reportHeight()` — load + MutationObserver + 多次延迟上报，上限 800px

待补充：
- `widget:theme` 主题同步（postMessage 通知 iframe 切换深色/浅色）
- `widget:ready` 握手（iframe 就绪信号，避免竞态）

参考实现：`playground/public/app.js` buildWidgetDoc + message listener

#### 任务 5：css-bridge — CSS 变量桥接 + SVG 预置 class

模型写标准变量名，桥接层映射到宿主实际变量：

```
模型写                          → 宿主实际
--color-background-primary      → var(--background)
--color-text-primary            → var(--foreground)
--color-border-tertiary         → var(--border)
--font-sans                     → var(--font-family)
...
```

SVG 预置 class（playground 已验证，9 色阶完整实现）：
- 文字类：`.t`（14px 正文）、`.ts`（12px 副标题）、`.th`（14px medium 标题）
- 结构类：`.box`（中性矩形）、`.arr`（箭头线）、`.leader`（虚线引导线）
- 色阶类：`.c-purple` / `.c-teal` / `.c-coral` / `.c-pink` / `.c-gray` / `.c-blue` / `.c-green` / `.c-amber` / `.c-red` —— 每个包含浅色填充(50)、描边(600)、标题文字(800)、副标题文字(600)

需要生成两份样式：
- `widget-base.css` — 注入 iframe 内（含 :root 变量 + body 样式 + SVG class）
- `streaming-preview.css` — 注入宿主页面（所有选择器加 `.widget-streaming` 前缀作用域隔离）

参考实现：`playground/public/app.js` buildWidgetDoc 中的 svgStyles + `playground/public/style.css` 中的 .widget-streaming 样式

#### 任务 6：Web Component 封装

封装为 `<widget-renderer>` 自定义元素，编排三阶段流水线：

```html
<widget-renderer theme="auto"></widget-renderer>
```

属性：
- `theme` — `"auto"` | `"light"` | `"dark"`，默认 `"auto"`

方法：
- `feed(streamText)` — 喂入完整累积文本，内部增量 diff 渲染
- `reset()` — 清除状态，准备下一条消息

事件：
- `widget-ready` — widget iframe 渲染就绪
- `widget-resize` — widget 高度变化（detail: { height }）
- `widget-message` — widget 内按钮触发追问（detail: { text }）
- `widget-link` — widget 内链接点击（detail: { href }）

### API 设计

```typescript
import { WidgetRenderer } from '@generative-ui/renderer';

const renderer = new WidgetRenderer({
  container: document.getElementById('chat'),
  theme: 'auto',
  cdnWhitelist: [
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'unpkg.com',
    'esm.sh',
  ],
  cssVarMapping: {
    '--color-background-primary': 'var(--background)',
    '--color-text-primary': 'var(--foreground)',
    // ...
  },
  onSendMessage: (text) => { /* widget 内按钮触发追问 */ },
  onLink: (href) => { /* 链接点击 */ },
});

// 流式渲染 — 传入完整累积文本，渲染器内部做增量 diff
// 每个 SSE chunk 到达后调用，渲染器自动处理：
//   纯文本 → 更新文本节点
//   未闭合围栏 → 流式预览
//   已闭合围栏 → sandbox iframe
renderer.feed(accumulatedStreamText);

// 流结束后的最终调用（处理 buffer 中残余内容）
renderer.flush();

// 非流式场景：一次性解析完整模型输出
renderer.parseAndRender(fullModelOutput);
```

### 体验打磨清单

| 问题 | 原因 | 解决方案 | 状态 |
|------|------|---------|------|
| 文字消失 | 纯文本输出被错误忽略 | 无围栏时直接透传文本 | ✅ playground 已验证 |
| 高度跳变 | iframe 从 0px 跳到实际高度 | postMessage 上报 + min-height + CSS transition | ✅ playground 已验证 |
| Finalize 闪烁 | 全量重建销毁已有 iframe | 增量渲染：已创建的 iframe 永不销毁 | ✅ playground 已验证 |
| 流式等待感 | 围栏未闭合时只显示占位符 | 流式 DOM 预览：提取部分 widget_code 直接渲染 | ✅ playground 已验证 |
| 深色填充遮字 | 模型 hardcode 深色 SVG 填充 | iframe 内注入 fixContrast() 自动修正 | ✅ playground 已验证 |
| SVG class 失效 | 模型用 c-blue/t 等 class 但未注入 CSS | iframe + 预览 div 均注入完整 SVG 预置 class | ✅ playground 已验证 |
| 滚动回跳 | streaming→final 切换导致高度突变 | 预览→iframe 切换时保持 min-height 平滑过渡 | 待优化 |
| Script 代码泄露 | 未闭合 `<script>` 标签内容可见 | 流式预览阶段截断未闭合 script | 待实现 |
| iframe Ready 竞态 | 消息早于 iframe 加载完成 | iframe onLoad 回调兜底 + ready 握手 | 待实现 |

### 实施分期

```
M2a — 核心提取（从 playground 重构）
  ├─ stream-parser.ts       从 app.js 提取 + 状态机封装
  ├─ iframe-renderer.ts     从 app.js 提取 buildWidgetDoc + postMessage
  ├─ streaming-preview.ts   从 app.js 提取预览逻辑
  ├─ css-bridge.ts          从 app.js 提取样式常量 + 可配置映射
  ├─ types.ts               类型定义
  └─ ✅ 测试：每个模块完成后立即编写单元测试并通过

M2b — 安全 + 封装
  ├─ sanitizer.ts           两阶段 HTML 清理（新建）
  ├─ widget-renderer.ts     Web Component 编排（新建）
  ├─ morphdom 增强          可选替换 innerHTML
  └─ ✅ 测试：sanitizer 安全边界测试 + Web Component 集成测试

M2c — 质量 + 发布
  ├─ 全量回归测试（npm test 全部通过）
  ├─ playground 迁移到使用 @generative-ui/renderer
  ├─ 迁移后回归测试（playground 原有测试全部通过）
  └─ npm 发布
```

---

## M3：渠道适配层（Channel Adapter Layer）

> 详细架构文档：[`architecture/m3-channel-adapters.md`](architecture/m3-channel-adapters.md)

### 目标

让 generative-ui 的 widget 能力在各渠道落地。不同渠道的消息容器能力差异巨大，M3 构建一个渠道适配中间件层，按渠道能力选择最优渲染策略。

### 核心思路

一次生成，多渠道适配：
- 模型输出格式不变（M1 Skill）
- 渲染库不变（M2 Renderer）
- 新增 Widget Interceptor + Channel Router + 各渠道 Adapter

### 渲染策略

| 策略 | 适用渠道 | 方式 |
|------|---------|------|
| A 满血渲染 | Aight (WKWebView)、Web (iframe) | `@generative-ui/renderer` 完整流水线 |
| B 静态图片 + 轻交互 | 飞书、Telegram、微信 | headless 渲染 PNG + 原生按钮 |
| C 富文本卡片 | 飞书 | 结构化 widget → Message Card JSON |
| D H5 跳转 | 飞书、Telegram、微信 | widget 存储到临时 URL，内置浏览器打开 |

### 依赖

- 产物 B（`@generative-ui/renderer`）已发布 npm
- OpenClaw Agent Runtime 消息投递流水线支持中间件扩展
- 各渠道 Bot API 接入（飞书 / Telegram / 微信）

### 新增组件

- Widget Interceptor — 检测并提取 show-widget 围栏（复用 M2 stream-parser）
- Channel Router — 按渠道能力 + widget 类型选择渲染策略
- Screenshot Service — headless browser 渲染 widget 为 PNG（复用 M2 buildWidgetDoc）
- Widget Hosting — 临时存储 widget HTML，生成短链供 H5 跳转
- Drill-down Extractor — 提取 `__widgetSendMessage` 调用，映射为各渠道原生按钮

具体开发计划在 M2 完成后制定。

---

## 技术参考索引

| 参考 | 内容 | 链接 |
|------|------|------|
| CodePilot 仓库 | 代码围栏 + iframe 完整实现 | https://github.com/op7418/CodePilot |
| pi-generative-ui 仓库 | Claude 原生逆向 + morphdom 实现 + 完整设计指南 | https://github.com/Michaelliv/pi-generative-ui |
| 逆向工程文章 | show_widget / read_me / morphdom 技术细节 | https://michaellivs.com/blog/reverse-engineering-claude-generative-ui/ |
| Claude 设计指南原文 | guidelines.ts (~800 行) | https://github.com/Michaelliv/pi-generative-ui/blob/main/.pi/extensions/generative-ui/guidelines.ts |
| CodePilot widget-sanitizer | 两阶段 HTML 清理 + receiver iframe | CodePilot `src/lib/widget-sanitizer.ts` |
| CodePilot widget-css-bridge | CSS 变量桥接 + Tailwind 子集 | CodePilot `src/lib/widget-css-bridge.ts` |
| CodePilot WidgetRenderer | iframe 渲染核心 | CodePilot `src/components/chat/WidgetRenderer.tsx` |
| CodePilot StreamingMessage | 流式围栏检测 | CodePilot `src/components/chat/StreamingMessage.tsx` |
| morphdom | DOM diffing 库 | https://github.com/patrick-steele-idem/morphdom |
| **playground 原型** | **M1 期间验证的完整渲染流水线** | **`playground/public/app.js`** |
