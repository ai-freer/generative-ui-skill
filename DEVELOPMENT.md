# Generative UI Skill — 开发计划

本文档指导 generative-ui Skill 的具体实施，覆盖 M1 ~ M3 三个里程碑。

---

## 里程碑总览

```
M0 技术分析 + 项目规划               ✅ 完成
M1 产物 A：Prompt Skill             ✅ 完成（待模型验证）
M2 产物 B：渲染运行时 JS 库          ← 当前
M3 产物 C：Aight 集成
```

依赖关系：M1 独立可交付 → M2 依赖 M1 的 prompt 格式定义 → M3 依赖 M2 的渲染库。

---

## M1：Prompt Skill

### 目标

创建 generative-ui Skill，让任何接入 OpenClaw 的 agent 启用后，模型知道如何输出 `show-widget` 代码围栏格式的交互式 UI 组件。

### 目录结构

```
generative-ui/
├── README.md                       # 项目架构介绍（已完成）
├── DEVELOPMENT.md                  # 开发计划（本文件）
├── SKILL.md                        # Skill 描述 + 使用说明
├── package.json                    # 版本管理
├── prompts/
│   ├── system.md                   # 核心 System Prompt（触发格式 + 基础规则）
│   └── guidelines/
│       ├── core.md                 # Core Design System（哲学、流式规则、CSS 变量、排版）
│       ├── color-palette.md        # 9 色系 x 7 阶色板 + 深色/浅色模式规则
│       ├── svg-setup.md            # SVG 基础设施（标记、预置类名、字体校准表、ViewBox 检查清单）
│       ├── diagram.md              # 图表类型规范（流程图、结构图、示意图、决策框架）
│       ├── chart.md                # Chart.js 指南（仪表板布局、数字格式化、自定义图例）
│       ├── interactive.md          # 交互组件指南（滑块、指标卡片、实时计算）
│       ├── mockup.md               # UI 原型指南（布局、组件 token、骨架加载）
│       └── art.md                  # 艺术图形指南（SVG 插画、Canvas 动画）
├── examples/
│   ├── flowchart.html              # SVG 流程图示例
│   ├── chart.html                  # Chart.js 图表示例
│   ├── calculator.html             # 交互计算器示例
│   └── comparison.html             # 对比图示例
└── tests/
    └── prompt-validation.md        # 验证用例清单
```

### 关键任务

#### 任务 1：提取并适配 Anthropic 原版设计指南

**来源**：[pi-generative-ui/guidelines.ts](https://github.com/Michaelliv/pi-generative-ui/blob/main/.pi/extensions/generative-ui/guidelines.ts)（~800 行，经验证与 claude.ai 原始输出逐字节匹配）

**步骤**：
1. 从 `guidelines.ts` 中提取 10 个独立 section（CORE + 9 个模块 section）
2. 转换为独立 markdown 文件，放入 `prompts/guidelines/`
3. 适配替换：
   - `Anthropic Sans` → `var(--font-sans)` 或系统字体栈
   - `claude.ai` 相关描述 → 通用化
   - `sendPrompt()` → `window.__widgetSendMessage()`（与 CodePilot 对齐）
4. 验证：重新组装各模块组合，确保内容完整无遗漏

**模块组装规则**（复用 Anthropic 的去重逻辑）：

| 模块 | 包含 section |
|------|-------------|
| diagram | Core + Color Palette + SVG Setup + Diagram Types |
| chart | Core + UI Components + Color Palette + Charts (Chart.js) |
| interactive | Core + UI Components + Color Palette |
| mockup | Core + UI Components + Color Palette |
| art | Core + SVG Setup + Color Palette |

#### 任务 2：编写核心 System Prompt

文件：`prompts/system.md`

内容要点：
- **触发格式定义**：` ```show-widget ` 代码围栏 + JSON 元数据（title, widget_code）
- **意图识别表**：什么场景用什么类型的 widget

| 用户意图 | Widget 类型 |
|---------|------------|
| 流程 / 工作原理 | SVG 流程图 |
| 结构 / 是什么 | SVG 层级或分层图 |
| 历史 / 顺序 | SVG 时间线 |
| 循环 / 反馈 | SVG 循环图 |
| 对比 A vs B | SVG 并排对比 |
| 数据 / 趋势 | Chart.js (canvas + CDN) |
| 计算 / 公式 | HTML 滑块/输入框 |
| 排名 / 比例 | HTML 条形展示 |

- **基础规则**：
  1. widget_code 是原始 HTML/SVG，不含 DOCTYPE/html/head/body
  2. 透明背景，宿主提供背景色
  3. 扁平极简，不用渐变/阴影/模糊
  4. 每个 widget 建议 ≤ 3000 字符
  5. CDN 白名单：cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, esm.sh
  6. 文字说明放在代码围栏外面
  7. SVG 使用 `<svg width="100%" viewBox="0 0 680 H">`
  8. 可点击追问：`onclick="window.__widgetSendMessage('Explain [topic]')"`
  9. 交互控件修改数据后必须调用 `chart.update()`
- **模块加载指引**：告诉模型根据任务类型，参考 `guidelines/` 下对应指南文件的内容

#### 任务 3：编写示例 Widget

目录：`examples/`

每个示例包含：
- 触发 prompt（用户问了什么）
- 完整的 show-widget 输出（可直接在浏览器中打开验证）
- 简要说明用了哪些技术点

示例清单：
- `flowchart.html` — JWT 认证流程（SVG，展示流程图能力）
- `chart.html` — 月度收入趋势（Chart.js，展示数据可视化能力）
- `calculator.html` — 复利计算器（HTML 滑块 + 实时计算，展示交互能力）
- `comparison.html` — React vs Vue 对比（SVG 并排，展示对比图能力）

#### 任务 4：编写 SKILL.md

内容要点：
- Skill 名称、描述、版本
- 安装 / 启用方式
- 配置参数（可选择启用哪些 guidelines 模块）
- 快速上手示例
- 输出格式说明
- 已验证的模型列表

#### 任务 5：验证

验证用例（记录在 `tests/prompt-validation.md`）：

| 测试场景 | 输入 prompt | 预期输出 | 检查项 |
|---------|------------|---------|--------|
| 流程图 | "解释 JWT 认证流程" | show-widget 围栏 + SVG | 有效 SVG, viewBox 正确, 透明背景 |
| 数据图表 | "展示过去 6 个月的用户增长" | show-widget 围栏 + Chart.js HTML | CDN 引用正确, canvas 存在 |
| 交互组件 | "做一个 BMI 计算器" | show-widget 围栏 + 带滑块的 HTML | 滑块可操作, 计算逻辑正确 |
| 对比图 | "比较 REST 和 GraphQL" | show-widget 围栏 + SVG | 并排布局, 色彩区分 |
| 无 widget | "今天天气怎么样" | 纯文本回复 | 不应包含 show-widget 围栏 |

验证模型：Claude Sonnet 4.6, Kimi K2.5, Seed 2.0 Pro, GPT-5.4

---

## M2：渲染运行时 JS 库

### 目标

从 CodePilot + Claude 原生方案中提取核心渲染逻辑，做成框架无关的 JS 库 `@generative-ui/renderer`。任何前端引入后就能渲染 show-widget 围栏内的 HTML/SVG。

### 包结构

```
packages/renderer/
├── package.json                    # @generative-ui/renderer
├── tsconfig.json
├── src/
│   ├── index.ts                    # 统一导出
│   ├── types.ts                    # 类型定义
│   ├── stream-parser.ts            # 流式围栏检测 + partial code 提取
│   ├── sanitizer.ts                # HTML 清理（流式 + 终态两阶段）
│   ├── css-bridge.ts               # CSS 变量桥接（宿主 ↔ widget 映射）
│   ├── iframe-renderer.ts          # iframe 模式：sandbox iframe + CSP（安全优先）
│   ├── morphdom-renderer.ts        # morphdom 模式：直接 DOM 注入 + diffing（性能优先）
│   └── widget-renderer.ts          # 统一渲染器（Web Component <widget-renderer>）
├── styles/
│   ├── tailwind-subset.css         # 内置 Tailwind-like 工具类子集
│   └── svg-styles.css              # SVG 预设类（c-blue, c-teal, c-purple 等 9 色系）
└── tests/
    ├── stream-parser.test.ts
    ├── sanitizer.test.ts
    └── renderer.test.ts
```

### 关键任务

#### 任务 1：stream-parser — 流式围栏检测

从模型的文本 delta 流中实时检测 ` ```show-widget ` 围栏，提取 partial widget code。

核心逻辑：
- 状态机：TEXT → FENCE_OPEN → WIDGET_CODE → FENCE_CLOSE
- 处理未闭合的 HTML 标签（partial streaming 特有问题）
- 截断未闭合的 `<script>` 标签（避免内容泄露到可见区域）

参考实现：CodePilot `StreamingMessage.tsx`

#### 任务 2：sanitizer — 两阶段 HTML 清理

**流式阶段**（sanitizeForStreaming）：
- 剥离：iframe / object / embed / form / meta / link / base
- 剥离：所有 on* 事件处理器
- 剥离：所有 script 标签
- 剥离：javascript: / data: URL

**终态阶段**（sanitizeForIframe）：
- 仅剥离嵌套/逃逸标签（防止 iframe 内嵌 iframe）
- 保留 script 和 event handler（在 sandbox 内安全执行）

参考实现：CodePilot `widget-sanitizer.ts`

#### 任务 3：双渲染模式

**iframe-renderer**（安全优先）：
- sandbox="allow-scripts"（无 allow-same-origin / allow-top-navigation / allow-popups）
- CSP：script-src 'unsafe-inline' + CDN 白名单
- connect-src 'none'（禁止 fetch/XHR/WebSocket）
- postMessage 通信协议（update / finalize / theme / ready / resize / link / sendMessage）
- 参考实现：CodePilot `WidgetRenderer.tsx` + `widget-sanitizer.ts`（receiver iframe srcdoc）

**morphdom-renderer**（性能优先）：
- shell HTML 容器 + morphdom CDN 加载
- `_setContent(html)` 通过 morphdom diffing 增量更新
- `onNodeAdded` 回调：新节点播放 fadeIn 动画
- `onBeforeElUpdated` 回调：相同节点跳过更新
- `_runScripts()` 终态执行：clone script 标签使其生效
- 参考实现：pi-generative-ui `index.ts`（shellHTML + morphdom 集成）

#### 任务 4：css-bridge — CSS 变量桥接

模型写标准变量名，桥接层映射到宿主实际变量：

```
模型写                          → 宿主实际
--color-background-primary      → var(--background)
--color-text-primary            → var(--foreground)
--color-border-tertiary         → var(--border)
--font-sans                     → var(--font-family)
...
```

同时注入内置 Tailwind-like 工具类子集和 SVG 预设类（9 色系，自动适配深色/浅色模式）。

参考实现：CodePilot `widget-css-bridge.ts`

#### 任务 5：Web Component 封装

封装为 `<widget-renderer>` 自定义元素：

```html
<widget-renderer
  mode="iframe"
  theme="auto"
></widget-renderer>
```

属性：
- `mode` — `"iframe"` | `"morphdom"`，默认 `"iframe"`
- `theme` — `"auto"` | `"light"` | `"dark"`，默认 `"auto"`

事件：
- `widget-ready` — widget 渲染就绪
- `widget-resize` — widget 高度变化（detail: { height }）
- `widget-message` — widget 内按钮触发追问（detail: { text }）
- `widget-link` — widget 内链接点击（detail: { href }）

### API 设计

```typescript
import { WidgetRenderer } from '@generative-ui/renderer';

const renderer = new WidgetRenderer({
  container: document.getElementById('chat'),
  mode: 'iframe',
  theme: 'auto',
  cdnWhitelist: [
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'unpkg.com',
    'esm.sh',
  ],
  onSendMessage: (text) => { /* widget 内按钮触发追问 */ },
  onLink: (href) => { /* 链接点击 */ },
});

// 流式渲染（逐 token 调用）
renderer.streamUpdate(partialHtml);

// 终态渲染（流式完成后调用）
renderer.finalize(fullHtml);

// 自动检测模型输出中的 show-widget 围栏并渲染
renderer.parseAndRender(fullModelOutput);
```

### 体验打磨清单

从 CodePilot 总结的 7 个关键体验问题，M2 实现中需要逐一解决：

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 文字消失 | parseAllShowWidgets 对纯文本返回 [] | 无围栏时直接透传文本 |
| 高度跳变 | iframe 从 0px 跳到实际高度 | 首次 resize 跳过 CSS transition |
| Finalize 闪烁 | innerHTML 替换瞬间清空 DOM | 分离 script/visual，visual 相同则跳过替换 |
| 滚动回跳 | streaming→persisted 组件重挂载 | 模块级高度缓存 |
| Script 代码泄露 | `</script>` 未到达时开标签被剥离 | 在 partial code 层截断未闭合 script |
| iframe Ready 竞态 | useEffect 监听晚于 widget:ready | iframe onLoad 回调兜底 |
| React key 不稳定 | partial→closed 路径 key 变化 | partialWidgetKey 与索引对齐 |

---

## M3：Aight 集成

### 目标

在 Aight app 的聊天界面中原生渲染 widget，让用户在移动端也能体验交互式 AI 回复。

### 依赖

- 产物 B（`@generative-ui/renderer`）已发布 npm
- Aight app 的消息渲染层支持 WKWebView 嵌入

### 实现要点

- Aight 消息渲染层引入 `@generative-ui/renderer`
- 检测模型回复中的 show-widget 围栏
- 消息气泡内嵌入 WKWebView 渲染 widget
- 支持深色/浅色主题同步（通过 css-bridge）
- 支持 widget 内按钮触发追问（通过 WKScriptMessageHandler 桥接）
- iframe 模式优先（移动端安全性更重要）

具体方案在 M2 完成后细化。

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
