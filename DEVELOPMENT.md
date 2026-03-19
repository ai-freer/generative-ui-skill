# Generative UI Skill — 开发计划

本文档指导 generative-ui Skill 的具体实施，覆盖 M1 ~ M3 三个里程碑。

---

## 里程碑总览

```
M0 技术分析 + 项目规划               ✅ 完成
M1 产物 A：Prompt Skill             ✅ 完成
M2 产物 B：渲染运行时 JS 库          ✅ 核心完成（M2a+M2b+M2c），待 npm 发布
M3a 渠道适配脚本                     ✅ 完成（截图 + drill-down + 围栏清洗 Plugin Hook）
M3b Telegram / 飞书联调              ✅ 基本调通
M3c Aight WKWebView 集成             待开始
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
├── examples/                       # 6 个完整示例 widget（含 2 个 3D 场景）
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

### Guidelines 模块与主题映射

Guidelines 不是「几套固定模板」，而是一组可以自由组合的**表达能力基元**，用来让同一个主题从多个视角被「看见」。

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

常见主题的示例组合：

| 主题示例                     | 推荐模块组合                      |
|------------------------------|-----------------------------------|
| 任意技术 / 概念讲解          | core, diagram                     |
| 任意数据相关主题             | core, chart, diagram              |
| 任意产品 / 功能设计          | core, mockup, diagram             |
| 任意交互或算法可视化         | core, diagram, interactive        |
| 任意品牌 / 世界观 / 设定     | core, art, mockup                 |
| 任意复杂策略 / 流程优化方案 | core, diagram, chart, interactive |
| 任意「只想看视觉灵感」主题   | art, mockup, （可选少量 core）    |

### 设计决策

**为什么选代码围栏而非 tool_use？**

Claude 原生用 `show_widget` tool call，但我们选择代码围栏：
- 不依赖特定 SDK 的 tool 注册机制
- 文本流天然支持流式传输（边生成边渲染）
- 任何能输出 markdown 的模型都能用（Claude, GPT, Kimi, Zhipu...）
- 复用现有 markdown 解析管线

**为什么支持双渲染模式？**

根据 `pi-generative-ui` 对 Claude.ai 原生实现的逆向研究，流式阶段采用 morphdom 直接 DOM 注入可以获得更强的“逐步长出”体验；这也是我们最主要的技术参考来源。与此同时，`CodePilot` 的文章与公开实现让我们更早意识到“代码围栏触发 + iframe 隔离”这条工程方向可行。我们在 M1 playground 中以 `pi-generative-ui` 为主参考，吸收少量工程启发，形成自己的双模式与三阶段流水线设计：
- **iframe 模式**：适合不可信环境（第三方集成、公开 chat），完全隔离
- **morphdom 模式**：适合可信环境（自有产品），更流畅的渲染体验

**为什么内置 Tailwind-like 工具类？**

- 避免加载 Tailwind CDN（污染全局样式 + 与宿主冲突）
- 模型可以用熟悉的类名（flex, grid, p-4, rounded-lg）
- 只包含常用子集，体积可控

**为什么 CSS 变量桥接而非直接用宿主变量？**

- 模型按标准变量名写 CSS（`--color-background-primary`）
- 桥接层负责映射到不同宿主的实际变量
- 换宿主只需改桥接层，模型 prompt 不变

---

## M2：渲染运行时 JS 库

### 目标

从 playground 验证过的渲染逻辑中提取核心模块，做成框架无关的 JS 库 `@generative-ui/renderer`。任何前端引入后就能渲染 show-widget 围栏内的 HTML/SVG。

> **参考实现**：`playground/public/app.js` 是 M1 期间迭代出的原型，已验证完整的流式围栏检测 → 增量渲染 → sandbox iframe 流水线。M2 在此基础上重构为可复用库。

### 核心架构：三阶段渲染流水线

M1 playground 验证了一种适合我们场景的渲染模型：不是 iframe 和 morphdom 二选一，而是**三阶段流水线**：

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

参考来源：
- Claude 原生能力边界与流式体验参考 `pi-generative-ui`
- 本项目实际实现与验证以 `playground/public/app.js` 为准

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
| 滚动回跳 | streaming→final 切换导致高度突变 | 预览→iframe 切换时保持 min-height 平滑过渡 | ✅ M2b renderer 统一 min-height: 300px + transition |
| Script 代码泄露 | 未闭合 `<script>` 标签内容可见 | 流式预览阶段截断未闭合 script | ✅ M2a `stripUnclosedScript()` 已实现 |
| iframe Ready 竞态 | 消息早于 iframe 加载完成 | iframe onLoad 回调兜底 + ready 握手 | ✅ M2b `widgetReady` postMessage 已实现 |
| 主题同步 | iframe 内无法响应宿主深色/浅色切换 | postMessage `widget:theme` 通知 iframe 重新注入 CSS 变量 | ⏳ 延后 — M2c 或 M3 按需实现 |

### 实施分期

#### M2a — 核心提取（从 playground 重构）

**Step 0: 包初始化**
- 创建 `packages/renderer/` 目录结构
- `package.json`（name: `@generative-ui/renderer`, type: module, exports 配置）
- `tsconfig.json`（target: ES2020, module: ESNext, strict, declaration）
- 构建工具：tsup（零配置打包，输出 ESM + CJS + .d.ts）
- 测试工具：vitest（兼容 Node.js 内置 test 风格，支持 TypeScript）

**Step 1: types.ts — 类型定义**
- `WidgetFence`：`{ title, widget_code, start, end }`
- `ParsedFence`：`{ start, end, parsed: { title, widget_code } | null }`
- `StreamParserState`：`'TEXT' | 'FENCE_OPEN' | 'WIDGET_CODE' | 'FENCE_CLOSE'`
- `RendererOptions`：`{ container, theme, cdnWhitelist, cssVarMapping, onSendMessage, onLink }`
- `WidgetMessage`：`{ type: 'widgetResize' | 'widgetSendMessage' | 'widgetReady' | 'widgetTheme', ... }`

**Step 2: stream-parser.ts — 围栏检测 + partial JSON**
- 来源：`app.js` parseShowWidgetFence / extractPartialWidgetCode / isShowWidgetFence + `parser.js` 同名函数
- 重构点：
  - 封装 `StreamParser` class，维护状态机（TEXT → FENCE_OPEN → WIDGET_CODE → FENCE_CLOSE）
  - `feed(chunk)` 增量喂入，`getCompletedWidgets()` 返回已闭合围栏
  - `getPartialWidgetCode()` 返回当前未闭合围栏的部分 widget_code
  - 同时导出无状态工具函数（parseShowWidgetFence / extractPartialWidgetCode）供非流式场景使用
- 测试：移植 playground/tests/parser.test.js 中围栏相关用例 + 新增状态机边界测试

**Step 3: css-bridge.ts — CSS 变量桥接 + SVG 预置 class**
- 来源：`app.js` buildWidgetDoc 中的 svgStyles 字符串 + `style.css` 中 `.widget-streaming .c-*` 规则
- 输出：
  - `generateIframeStyles(mapping?)` → 完整 CSS 字符串（:root 变量 + body 样式 + SVG class），注入 iframe
  - `generateStreamingStyles(scopeClass?)` → 带作用域前缀的 CSS 字符串，注入宿主页面
  - `DEFAULT_CSS_VAR_MAPPING` — 默认变量映射表
  - `CDN_WHITELIST` — 默认 CDN 白名单
- 测试：验证生成的 CSS 包含所有 9 色阶、变量映射正确

**Step 4: iframe-renderer.ts — sandbox iframe 最终渲染**
- 来源：`app.js` buildWidgetDoc + postMessage listener (widgetResize / widgetSendMessage)
- 重构点：
  - `buildWidgetDoc(widgetCode, styles, options?)` — 拼装完整 HTML（CSP + CSS + widget + 通信脚本）
  - `createWidgetIframe(container, widgetCode, options)` — 创建 sandbox iframe 并挂载
  - `fixContrast()` + `reportHeight()` 脚本保持不变，内联到 iframe
  - 高度上限可配置（默认 800px）
- 测试：验证 CSP 头正确、sandbox 属性正确、buildWidgetDoc 输出结构完整

**Step 5: streaming-preview.ts — 流式 DOM 预览**
- 来源：`app.js` renderStreamChunk 中 previewEl 逻辑
- 重构点：
  - `StreamingPreview` class：`update(partialCode)` / `destroy()` / `getElement()`
  - **新增**：截断未闭合 `<script>` 标签（解决 Script 代码泄露问题）
    - `stripUnclosedScript(html)` — 检测最后一个 `<script` 开标签，若无对应 `</script>`，截断该标签及其后内容
  - 注入 streaming 作用域 CSS（来自 css-bridge）
- 测试：验证 partialCode 渲染、script 截断、destroy 清理

#### M2b — 安全 + 封装

**Step 6: sanitizer.ts — 两阶段 HTML 清理**
- 新建模块（沿用本项目已验证的两阶段清理思路，并对齐 Claude 原生能力边界）
- `sanitizeForStreaming(html)` — 流式阶段：
  - 剥离：iframe / object / embed / form / meta / link / base
  - 剥离：所有 on* 事件处理器（正则匹配 `\bon\w+=`）
  - 剥离：所有 script 标签
  - 剥离：javascript: / data: URL
- `sanitizeForIframe(html)` — 终态阶段：
  - 仅剥离嵌套 iframe / object / embed（防逃逸）
  - 保留 script 和 event handler（sandbox 内安全执行）
- 测试：XSS 向量测试集（onerror、javascript:、嵌套 iframe、data: URL 等）

**Step 7: widget-renderer.ts — Web Component 编排**
- 封装 `<widget-renderer>` 自定义元素
- 编排三阶段流水线：
  - TEXT → 纯文本透传
  - FENCE_OPEN + widget_code 流入 → StreamingPreview（sanitizeForStreaming 后渲染）
  - FENCE_CLOSE → 销毁 preview，创建 sandbox iframe（sanitizeForIframe 后渲染）
- 属性：`theme`（auto/light/dark）
- 方法：`feed(streamText)` / `flush()` / `reset()` / `parseAndRender(fullOutput)`
- 事件：`widget-ready` / `widget-resize` / `widget-message` / `widget-link`
- **新增**：`widget:ready` 握手（iframe postMessage ready 信号，解决竞态）
- **新增**：`widget:theme` 主题同步（监听 prefers-color-scheme 变化，postMessage 通知 iframe）
- **新增**：预览→iframe 切换时统一 min-height 平滑过渡（解决滚动回跳）
- 测试：集成测试（feed 流式文本 → 验证 DOM 输出阶段正确）

**Step 8: morphdom 增强（可选）**
- 可选依赖：`morphdom`
- 替换 StreamingPreview 中的 innerHTML 为 morphdom diff
- `onNodeAdded` → fadeIn 动画
- `onBeforeElUpdated` → 相同节点跳过
- 测试：对比 innerHTML 和 morphdom 两种模式输出一致性

#### M2c — 质量 + 发布

- ✅ 全量回归测试（renderer 86 tests + playground 152 tests 全部通过）
- ✅ playground 迁移到使用 `@generative-ui/renderer`（替换 buildWidgetDoc + 新增 sanitization + streaming styles 动态注入）
- ✅ 迁移后回归测试
- npm 发布（待 guideline 模块变更完成后执行）

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
| B 静态图片 + 轻交互 | 飞书、Telegram、QQ | headless 渲染 PNG + 原生按钮 |
| C 富文本卡片 | 飞书 | 结构化 widget → Message Card JSON |
| D H5 跳转 | 飞书、Telegram、QQ | widget 存储到临时 URL，内置浏览器打开 |

### 依赖

- 产物 B（`@generative-ui/renderer`）已发布 npm
- OpenClaw Agent Runtime 消息投递流水线支持中间件扩展
- 各渠道 Bot API 接入（飞书 / Telegram / QQ）

### 新增组件

- Widget Interceptor — 检测并提取 show-widget 围栏（复用 M2 stream-parser）
- Channel Router — 按渠道能力 + widget 类型选择渲染策略
- Screenshot Service — headless browser 渲染 widget 为 PNG（复用 M2 buildWidgetDoc）
- Widget Hosting — 临时存储 widget HTML，生成短链供 H5 跳转
- Drill-down Extractor — 提取 `__widgetSendMessage` 调用，映射为各渠道原生按钮

开发计划：[`architecture/m3-development-plan.md`](architecture/m3-development-plan.md)

---

## 技术研究

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

### 本项目的工程化取舍

我们没有直接复刻 Claude.ai 原生实现，而是在 `pi-generative-ui` 揭示的原生机制基础上，结合自身 playground 验证结果，做了更适合通用宿主环境的设计。就真实开发参考价值而言，`pi-generative-ui` 更完整，也更接近我们后续的代码组织、模板规模和 GUI 交互目标；`CodePilot` 的公开文章和工程思路也提供了有价值的启发。

**触发方式：代码围栏（文本流）**

模型在 markdown 输出中使用 ` ```show-widget ` 围栏包裹 widget 代码，不依赖特定 SDK 的 tool_use 机制，便于接入任意支持 markdown 输出的模型与流式通道。

**渲染方式：流式预览 + sandbox iframe 终态**

流式阶段尽量保留 Claude 原生的“边生成边可见”体验；终态阶段切换到 sandbox iframe，确保交互脚本与宿主环境隔离。

这里的来源需要区分开写：
- “原生对话内直接注入 DOM、morphdom 增量更新、script 在完成后执行”这一组结论，主要来自 `pi-generative-ui` 对 Claude.ai 的逆向结果
- `CodePilot` 的实现方案，也提供了一些工程方向上的启发
- 我们自己的方案则是把原生体验目标与更稳妥的宿主隔离方案合并到同一条流水线里

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

这里的 `pi-generative-ui` 代表对 Claude.ai generative UI 机制的开源复现与扩展实现，因此它更适合作为我们进行横向比较的主要参照对象。

| 维度 | pi-generative-ui | CodePilot | 本项目方案 |
|------|------------------|-----------|-----------|
| 触发 | `show_widget` tool call（复现原生协议） | ` ```show-widget ` 代码围栏 | 代码围栏（兼容任何 markdown 模型） |
| 流式渲染 | morphdom DOM diffing + 原生窗口内流式更新 | iframe 驱动的流式渲染 | 三阶段流水线：文本 / 流式预览 / iframe 终态 |
| 宿主环境 | pi / Glimpse / WKWebView 原生窗口 | 通用桌面/Web 聊天容器 | 通用 Web 宿主，默认 chat 容器集成 |
| 隔离 | 依赖宿主 WebView 能力与原生窗口容器 | sandbox iframe + CSP | 按场景选择隔离级别，终态默认 sandbox iframe + CSP |
| 文档加载 | 复现 `read_me` / guideline 按需加载 | 静态注入项目侧 guideline | 渐进加载（基于 Anthropic 原版指南） |
| 模型依赖 | 依赖支持 tool call 的接入环境 | 任何 markdown 模型 | 任何 markdown 模型 |

---

## 技术参考索引

| 参考 | 内容 | 链接 |
|------|------|------|
| pi-generative-ui 仓库 | Claude 原生逆向、完整设计指南、GUI 级流式渲染实现；本项目的主要参考来源 | https://github.com/Michaelliv/pi-generative-ui |
| 逆向工程文章 | show_widget / read_me / morphdom 技术细节 | https://michaellivs.com/blog/reverse-engineering-claude-generative-ui/ |
| Claude 设计指南原文 | guidelines.ts (~800 行) | https://github.com/Michaelliv/pi-generative-ui/blob/main/.pi/extensions/generative-ui/guidelines.ts |
| CodePilot 公众号文章 | 《我复刻了 Claude 刚发布的生成式 UI 交互！》；提供了代码围栏与 iframe 方向的早期启发 | https://mp.weixin.qq.com/s/3IQIs6zP5jfdTwmT5LUJ6g |
| CodePilot 仓库 | 公众号文章与实现提供了部分工程方向上的启发 | https://github.com/op7418/CodePilot |
| morphdom | DOM diffing 库 | https://github.com/patrick-steele-idem/morphdom |
