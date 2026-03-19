# M3 开发计划：渠道适配层

> 架构设计见 [`m3-channel-adapters.md`](m3-channel-adapters.md)
> 本文档聚焦"怎么做"和"怎么验证"，按优先级排列。

---

## OpenClaw 源码分析结论

通过分析 [openclaw/openclaw](https://github.com/openclaw/openclaw) 仓库，确认以下关键事实：

**技术栈**：Node.js / TypeScript（tsup 构建，vitest 测试，pnpm 包管理）

**Skill 模型**：Skill = `SKILL.md`（prompt 文档，教 agent 怎么用工具）+ `scripts/`（可被 agent 通过 exec 工具调用的脚本）。Skill 不是独立服务，而是注入到 agent 的 system prompt 中，agent 通过 exec 工具调用 skill 的脚本。

**Channel 插件体系**：每个渠道（Telegram/Discord/Slack 等）是一个 `ChannelPlugin`，有标准化 adapter 接口：
- `ChannelOutboundAdapter` — 发送消息
- `ChannelMessageActionAdapter` — 消息动作（send, sendAttachment, react, edit, reply 等）
- `ChannelStreamingAdapter` — 流式消息（draft stream → finalize）
- `ChannelMessageCapability` — 渠道能力声明（`interactive`, `buttons`, `cards`, `components`, `blocks`）

**消息动作**：已有 `sendAttachment` action，说明渠道层已支持发送附件/图片。

**Hook 系统**：支持 `message:sent` 等事件钩子，可以在消息发送后做 post-processing。

**媒体管线**：`src/media/` 有完整的媒体处理管线（`outbound-attachment.ts`、`store.ts`、`png-encode.ts`），支持从 URL 或 buffer 保存媒体文件。

**关键结论**：M3 的 Telegram 适配不需要自己写 GatewayAdapter 扩展（那是 Fusionclaw 的思路）。正确的路径是：
1. 写一个 **OpenClaw Skill 脚本**（Node.js），负责 widget 截图
2. 利用 OpenClaw 已有的 **`sendAttachment` channel action** 发送图片
3. 或者写一个 **OpenClaw Hook**，在 `message:sent` 事件中拦截 widget 围栏

---

## 前置条件

| 条件 | 状态 |
|------|------|
| M2 `@generative-ui/renderer` 核心完成 | ✅ |
| `@generative-ui/renderer` 发布 npm | ⬜ 待发布 |
| OpenClaw Gateway 部署在 VPS 上 | ✅ |
| OpenClaw 支持 `sendAttachment` channel action | ✅ 已有 |
| OpenClaw 支持 Hook 系统（message:sent 事件） | ✅ 已有 |
| OpenClaw 有 `Dockerfile.sandbox-browser`（headless browser） | ✅ 已有 |

---

## 整体分期

```
M3a  Widget Screenshot Skill（Node.js 脚本）     ← 核心：截图 + 投递
M3b  Telegram 联调验证                            ← 在 VPS 上的 OpenClaw 实例验证
M3b+ 飞书卡片适配                                 ← 结构化 widget → Message Card，视觉型 → 图片卡片
M3c  Aight Adapter                               ← 满血渠道，WKWebView 集成
M3d  其他渠道（QQ 等）                             ← 按需扩展
```

---

## M3a：Widget Screenshot Skill

### 实现思路

OpenClaw 的 Skill 有两种影响 agent 行为的方式：

1. **Prompt 注入**：`SKILL.md` 的内容被注入到 agent 的 system prompt，教 agent 什么时候、怎么调用 skill 的脚本
2. **脚本执行**：agent 通过 `exec` 工具调用 `scripts/` 下的脚本

对于 generative-ui，我们已经有了 Prompt Skill（M1 的 `SKILL.md` + `prompts/`）。M3 需要新增一个 **post-processing 脚本**，在 agent 回复包含 `show-widget` 围栏时，自动截图并发送图片。

Phase 1 调研后确认两种路径的可行性（详见 [`m3-phase1-findings.md`](m3-phase1-findings.md)）：

#### 路径 A：Hook 方式 ~~（推荐）~~ ❌ 不可行

调研结论：OpenClaw 的 Hook 系统**不支持主动发送消息**。
- `message_sent` hook 是 fire-and-forget，context 只有只读字段
- `message_sending` hook 只能修改文本内容或取消发送，不能追加图片
- Internal hook 的 `messages[]` 只支持纯文本

#### 路径 B：Agent 主动调用 ✅ 确认可行

Agent 通过 `exec` 工具调用截图脚本，再通过 `send` action 发送图片。

```
Agent 输出 show-widget 围栏
  → Agent 调用 exec: node scripts/widget-screenshot.mjs --code "..."
  → 脚本截图 → 保存 PNG → 返回文件路径
  → Agent 调用 send action（media 参数传本地路径 + buttons 参数传 drill-down）
```

Telegram `send` action 确认支持：`to`, `message`, `media`（本地路径）, `buttons`（inline keyboard）, `caption`
飞书 outbound adapter 确认支持：本地图片路径自动上传、Markdown 卡片、结构化卡片、按钮回调

#### 路径 B+：Agent 主动调用 + message_sending 清洗（推荐）

在路径 B 基础上，增加一个 `message_sending` Plugin Hook，在消息发送前把 `show-widget` 围栏替换为 Layer 1 Summary 纯文本。这样用户先看到干净的文字回复，图片随后到达。

```
Agent 输出 show-widget 围栏
  │
  ├─ message_sending hook 触发（Plugin Hook）
  │   → 检测围栏 → 替换为 Layer 1 Summary 纯文本
  │   → 用户先看到干净的文字回复
  │
  └─ Agent 接着调用 exec + send action
      → 截图 → 发送图片 + drill-down 按钮
```

**选定路径 B+** 作为实现方案。

### S1：Widget Interceptor（Node.js）

实现位置：`scripts/widget-interceptor.mjs`（generative-ui 项目内）

直接复用 M2 的 `@generative-ui/renderer` 中的 `parseShowWidgetFence()`：

```javascript
import { parseShowWidgetFence } from '@generative-ui/renderer';

/**
 * 从模型输出中检测并提取 show-widget 围栏。
 */
export function interceptWidgets(modelOutput) {
  const fences = parseShowWidgetFence(modelOutput);

  if (fences.length === 0) {
    return { hasWidget: false, widgets: [], plainText: modelOutput };
  }

  const widgets = fences.map((fence, i) => {
    const prevEnd = i > 0 ? fences[i - 1].end : 0;
    const nextStart = i < fences.length - 1 ? fences[i + 1].start : modelOutput.length;
    return {
      title: fence.title,
      widgetCode: fence.widget_code,
      textBefore: modelOutput.slice(prevEnd, fence.start),
      textAfter: modelOutput.slice(fence.end, nextStart),
    };
  });

  // 去除所有围栏后的纯文本
  let plainText = '';
  let pos = 0;
  for (const fence of fences) {
    plainText += modelOutput.slice(pos, fence.start);
    pos = fence.end;
  }
  plainText += modelOutput.slice(pos);

  return { hasWidget: true, widgets, plainText: plainText.trim() };
}
```

因为 OpenClaw 是 Node.js 项目，这里直接 import M2 的库，零重复代码。

### S2：Screenshot Service（Node.js + Playwright）

实现位置：`scripts/widget-screenshot.mjs`

```javascript
import { chromium } from 'playwright';
import { buildWidgetDoc } from '@generative-ui/renderer';

let browser = null;

export async function initBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function captureWidget(widgetCode, options = {}) {
  const { theme = 'light', width = 680, deviceScaleFactor = 2 } = options;
  const b = await initBrowser();
  const page = await b.newPage({
    viewport: { width, height: 800 },
    deviceScaleFactor,
  });

  const html = buildWidgetDoc(widgetCode, {
    // 注入主题对应的 CSS 变量
  });

  await page.setContent(html, { waitUntil: 'networkidle' });
  // 额外等待 Chart.js 动画
  await page.waitForTimeout(500);

  // 自适应高度
  const height = await page.evaluate(() =>
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
  );
  await page.setViewportSize({ width, height: Math.min(height + 16, 2000) });

  const buffer = await page.screenshot({ type: 'png', fullPage: true });
  await page.close();
  return buffer;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
```

关键：直接复用 M2 的 `buildWidgetDoc()`，确保截图结果与 iframe 渲染一致。

OpenClaw 已有 `Dockerfile.sandbox-browser`，说明 headless browser 在其部署环境中是被支持的。

### S3：Drill-down 提取

```javascript
/**
 * 从 widget_code 中提取所有 __widgetSendMessage 调用。
 */
export function extractDrillDowns(widgetCode) {
  const re = /window\.__widgetSendMessage\(\s*['"](.+?)['"]\s*\)/g;
  const drillDowns = [];
  let m;
  while ((m = re.exec(widgetCode)) !== null) {
    drillDowns.push({
      query: m[1],
      label: m[1].length > 30 ? m[1].slice(0, 30) + '…' : m[1],
    });
  }
  return drillDowns;
}
```

### S4：SKILL.md 截图指令 + 可选 Plugin Hook

> Phase 1 调研结论：Hook 不能主动发送消息，改用 Agent 主动调用方案（路径 B+）。
> 详见 [`m3-phase1-findings.md`](m3-phase1-findings.md)

#### S4a：修改 SKILL.md

在现有 `SKILL.md` 中追加一段，教 agent 在非满血渠道（Telegram/飞书等）输出 widget 后主动截图并发送：

```markdown
## Widget 截图与投递（非 Web/Aight 渠道）

当你在 Telegram、飞书等渠道输出 `show-widget` 围栏后，必须执行以下步骤将 widget 渲染为图片并发送给用户：

1. 调用截图脚本：
   ```
   exec: node scripts/widget-screenshot.mjs --title "widget_title"
   ```
   脚本会从你最近的回复中提取 show-widget 围栏，渲染为 PNG，返回文件路径。

2. 用 send action 发送图片：
   ```
   send: { to: "<chat_id>", media: "<png_path>", caption: "<widget_title>" }
   ```

3. 如果 widget 包含 drill-down 按钮，在 send action 中附加 buttons 参数。

注意：在 Web Playground 和 Aight App 中不需要执行此步骤，这些渠道支持直接渲染 widget。
```

#### S4b：可选 message_sending Plugin Hook（围栏清洗）

作为 OpenClaw Plugin 注册一个 `message_sending` hook，在消息发送前把 `show-widget` 围栏替换为 Layer 1 Summary 纯文本，避免用户看到原始 HTML/SVG 代码。

```typescript
// Plugin hook 注册
{
  hookName: 'message_sending',
  handler: (event, ctx) => {
    const { content } = event;
    // 检测 show-widget 围栏
    const fenceRegex = /```show-widget\s*\n[\s\S]*?```/g;
    if (!fenceRegex.test(content)) return;
    // 替换为纯文本摘要（提取 title 字段）
    const cleaned = content.replace(fenceRegex, (match) => {
      const titleMatch = match.match(/"title"\s*:\s*"([^"]+)"/);
      const title = titleMatch ? titleMatch[1] : 'widget';
      return `[📊 ${title} — 图表生成中...]`;
    });
    return { content: cleaned };
  }
}
```

这个 Hook 是可选的增强——即使没有它，Agent 的文字回复中包含围栏代码也不会导致功能问题，只是 UX 不够干净。

#### Phase 1 调研清单（已完成 ✅）

| 问题 | 结论 |
|------|------|
| Hook 能否主动发送消息？ | ❌ 不能。`message_sent` 是 fire-and-forget，`message_sending` 只能修改文本 |
| `send` action 怎么调用？ | Agent tool call，支持 `to`, `message`, `media`（本地路径）, `buttons` |
| 飞书插件能力？ | ✅ 完整：Markdown 卡片、结构化卡片、图片上传、按钮回调 |
| Playwright 可用性？ | ✅ `Dockerfile.sandbox-browser` 预装 Chromium。VPS 需确认 exec 环境 |

---

## M3b：Telegram 联调验证

### 测试环境

开发在本地 MacBook，测试在 VPS 上的 OpenClaw 实例。

```
本地 MacBook（开发）
  ├── generative-ui 项目
  │   ├── scripts/widget-screenshot.mjs（截图脚本）
  │   ├── scripts/widget-drilldown.mjs（drill-down 提取）
  │   └── 独立测试（Playwright 截图验证）
  │
  └── git push → VPS 拉取

VPS (OpenClaw Gateway)
  ├── OpenClaw daemon
  │   ├── generative-ui Skill（M1 prompt + M3 截图指令）
  │   ├── widget-text-cleaner Plugin Hook（可选，围栏清洗）
  │   └── Telegram / 飞书 channel plugin
  │
  ├── Chromium（截图用，sandbox-browser 或系统安装）
  │
  └── Telegram Bot API ←→ Telegram
```

### 部署步骤

1. 本地开发完成后，push 到 repo
2. 在 VPS 上拉取最新代码，安装 generative-ui Skill 到 OpenClaw 实例
3. 确保 Chromium 可用（`npx playwright install chromium` 或使用系统 chromium）
4. 在 Telegram 中测试 agent 输出 widget → 截图 → 发送图片的完整链路

### 测试用例

| # | 输入 | 预期 |
|---|------|------|
| 1 | "解释 JWT 认证流程" | 文字回复 + SVG 流程图 PNG |
| 2 | "展示过去 6 个月的用户增长趋势" | 文字回复 + Chart.js 图表 PNG |
| 3 | "比较 REST 和 GraphQL" | 文字回复 + 对比表格 PNG + drill-down 按钮 |
| 4 | 纯文本回复（无 widget） | 正常文本消息，Hook 不触发 |
| 5 | 一条消息包含多个 widget | 文字 + 多张图片依次发送 |
| 6 | 点击 drill-down 按钮 | 触发追问，agent 生成新回复 |

### 独立测试（不依赖 OpenClaw）

在 generative-ui 项目内加一个独立测试脚本：

```bash
# 测试截图服务
node scripts/test-screenshot.mjs --input examples/jwt-flow.html --output /tmp/test.png

# 测试 interceptor
node scripts/test-interceptor.mjs --input "模型输出文本（含 show-widget 围栏）"
```

---

## M3b+：飞书卡片适配

飞书比 Telegram 强一档——交互卡片（Message Card）支持多栏布局、按钮回调、Markdown 渲染。对于结构化 widget，飞书卡片能提供接近原生的体验，不需要降级到图片。

### 飞书渠道的三层策略

| Widget 类型 | 策略 | 实现 |
|------------|------|------|
| 结构化（指标卡片、对比表格、列表） | 策略 C：飞书 Message Card | 解析 widget 结构 → 映射为卡片 JSON |
| 视觉型（SVG 流程图、Chart.js 图表、插画） | 策略 B：截图 | 复用 M3a Screenshot Service → 图片卡片 |
| 交互型（计算器、可操作图表） | 策略 D：H5 跳转 | widget 存储到临时 URL → 卡片内嵌"打开交互版"按钮 |

### S4b：飞书 Message Card 映射器

```javascript
/**
 * 尝试将 widget_code 映射为飞书 Message Card JSON。
 * 返回 null 表示无法映射，应回退到截图策略。
 */
export function widgetToFeishuCard(widget) {
  const { title, widgetCode } = widget;

  // 检测 widget 类型
  if (isSvgWidget(widgetCode) || isChartWidget(widgetCode)) {
    return null; // 视觉型 → 回退截图
  }

  // 尝试提取结构化内容
  const metrics = extractMetricCards(widgetCode);
  const tables = extractTables(widgetCode);
  const lists = extractLists(widgetCode);

  if (!metrics.length && !tables.length && !lists.length) {
    return null; // 无法识别结构 → 回退截图
  }

  // 构建飞书卡片 JSON
  const elements = [];

  // 标题
  elements.push({
    tag: 'markdown',
    content: `**${title}**`,
  });

  // 指标卡片 → column_set
  if (metrics.length) {
    elements.push({
      tag: 'column_set',
      columns: metrics.map(m => ({
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [
          { tag: 'markdown', content: `**${m.label}**\n${m.value}` },
        ],
      })),
    });
  }

  // 表格 → markdown table
  if (tables.length) {
    for (const table of tables) {
      elements.push({
        tag: 'markdown',
        content: tableToMarkdown(table),
      });
    }
  }

  // 列表 → markdown list
  if (lists.length) {
    for (const list of lists) {
      elements.push({
        tag: 'markdown',
        content: list.items.map(item => `• ${item}`).join('\n'),
      });
    }
  }

  // Drill-down 按钮 → action buttons
  const drillDowns = extractDrillDowns(widgetCode);
  if (drillDowns.length) {
    elements.push({
      tag: 'action',
      actions: drillDowns.slice(0, 5).map(dd => ({
        tag: 'button',
        text: { tag: 'plain_text', content: dd.label },
        type: 'primary',
        value: { action: 'drill_down', query: dd.query },
      })),
    });
  }

  return {
    config: { wide_screen_mode: true },
    elements,
  };
}
```

### S4c：飞书 Hook 集成

### S4c：飞书适配（Phase 1 调研更新）

> Phase 1 调研确认：OpenClaw 已有完整的飞书 channel plugin（`extensions/feishu/`），能力比预期更强。

飞书 outbound adapter 已内置的能力：
- **自动卡片渲染**：文本包含代码块或表格时，自动切换为 Markdown 卡片（`sendStructuredCardFeishu`）
- **本地图片路径自动上传**：outbound adapter 检测到本地图片路径时，自动调用 `sendMediaFeishu` 上传
- **卡片按钮回调**：`card-interaction.ts` 有完整的 `FeishuCardInteractionEnvelope` 解码/验证/路由机制

这意味着飞书适配的工作量比原计划小：

| Widget 类型 | 实现方式 | 复杂度 |
|------------|---------|--------|
| 视觉型（SVG/Chart.js） | 截图 PNG → Agent 调用 send（media 传本地路径，飞书自动上传） | 低（复用 S2） |
| 结构化（指标卡片/表格） | 截图 PNG 为主；或利用飞书自动 Markdown 卡片渲染 | 低 |
| 交互型（计算器等） | 策略 D：widget 存储到临时 URL → 卡片内嵌"打开交互版"按钮 | 中（需 widget hosting） |

Agent 在飞书渠道的截图+发送流程与 Telegram 一致（路径 B+），飞书 outbound adapter 会自动处理图片上传和卡片渲染。

### S4d：飞书按钮回调处理

飞书卡片按钮回调已有完整机制（`card-interaction.ts`）：

```typescript
// FeishuCardInteractionEnvelope 结构
{
  oc: "ocf1",           // 版本标识
  k: "button",          // 交互类型：button | quick | meta
  a: "drill_down",      // action 名称
  q: "详细介绍 JWT 签名过程",  // query 文本
  c: {                  // 上下文
    u: "user_open_id",
    h: "chat_id",
    t: "p2p" | "group"
  }
}
```

Drill-down 按钮的实现思路：
- 截图脚本提取 `__widgetSendMessage` 调用 → 生成按钮列表
- Agent 在 send action 中附加 buttons 参数，value 使用 `FeishuCardInteractionEnvelope` 格式
- 用户点击按钮 → 飞书 card action 回调 → OpenClaw 飞书 plugin 解码 → 转为用户消息 → Agent 处理追问

### 飞书适配的调研清单（已完成 ✅）

| 问题 | 结论 |
|------|------|
| OpenClaw 是否有飞书 channel plugin？ | ✅ `extensions/feishu/`，功能完整 |
| 飞书是否支持 sendCard / Message Card？ | ✅ `sendStructuredCardFeishu`、`sendMarkdownCardFeishu` |
| 飞书图片上传？ | ✅ outbound adapter 自动处理本地路径上传 |
| 飞书卡片按钮回调？ | ✅ `card-interaction.ts` 有完整的解码/路由机制 |

---

## M3c：Aight Adapter

Aight 是满血渠道（WKWebView），不需要截图降级。直接使用 M2 的 `@generative-ui/renderer`。

### S5：Aight 壳页面

创建一个本地 HTML 文件，作为 WKWebView 加载的壳页面：

```
packages/renderer/aight/
  └── widget-shell.html    ← WKWebView 加载这个文件
```

`widget-shell.html` 的职责：
- 引入 `@generative-ui/renderer` 的 dist JS
- 暴露全局函数供 Swift 调用：
  - `window.guFeed(accumulatedText)` — 流式喂入
  - `window.guFlush()` — 流结束
  - `window.guRender(fullOutput)` — 非流式渲染
  - `window.guSetTheme(isDark)` — 主题切换
- 监听 renderer 的回调，通过 `webkit.messageHandlers` 桥接到 Swift：
  - `onSendMessage` → `webkit.messageHandlers.widgetSendMessage.postMessage(text)`
  - `onResize` → `webkit.messageHandlers.widgetResize.postMessage(height)`
  - `onReady` → `webkit.messageHandlers.widgetReady.postMessage({})`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <script src="./renderer.js"></script>
</head>
<body>
  <div id="container"></div>
  <script>
    const renderer = new GenerativeUI.WidgetRenderer({
      container: document.getElementById('container'),
      theme: 'auto',
      onSendMessage: (text) => {
        webkit.messageHandlers.widgetSendMessage.postMessage(text);
      },
      onResize: (height) => {
        webkit.messageHandlers.widgetResize.postMessage({ height });
      },
      onReady: () => {
        webkit.messageHandlers.widgetReady.postMessage({});
      },
    });

    window.guFeed = (text) => renderer.feed(text);
    window.guFlush = () => renderer.flush();
    window.guRender = (text) => renderer.parseAndRender(text);
    window.guSetTheme = (isDark) => {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    };
  </script>
</body>
</html>
```

### S6：Swift 集成指南

给 Aight iOS 开发者的接口文档：

```swift
// 1. 创建 WKWebView，注册 message handlers
let config = WKWebViewConfiguration()
let controller = WKUserContentController()
controller.add(self, name: "widgetSendMessage")
controller.add(self, name: "widgetResize")
controller.add(self, name: "widgetReady")
config.userContentController = controller

let webView = WKWebView(frame: .zero, configuration: config)

// 2. 加载壳页面
let shellURL = Bundle.main.url(forResource: "widget-shell", withExtension: "html")!
webView.loadFileURL(shellURL, allowingReadAccessTo: shellURL.deletingLastPathComponent())

// 3. 流式喂入（每收到一个 SSE chunk）
webView.evaluateJavaScript("window.guFeed('\(escapedText)')")

// 4. 流结束
webView.evaluateJavaScript("window.guFlush()")

// 5. 非流式渲染（历史消息）
webView.evaluateJavaScript("window.guRender('\(escapedFullOutput)')")

// 6. 主题切换
webView.evaluateJavaScript("window.guSetTheme(\(isDark))")
```

Message handler 处理：

```swift
func userContentController(_ controller: WKUserContentController,
                           didReceive message: WKScriptMessage) {
    switch message.name {
    case "widgetSendMessage":
        if let text = message.body as? String {
            delegate?.widgetDidRequestMessage(text)
        }
    case "widgetResize":
        if let dict = message.body as? [String: Any],
           let height = dict["height"] as? CGFloat {
            delegate?.widgetDidResize(height: height)
        }
    case "widgetReady":
        delegate?.widgetDidBecomeReady()
    default:
        break
    }
}
```

### S7：Aight 联调测试

| # | 场景 | 验证点 |
|---|------|--------|
| 1 | 流式渲染 | 发送"解释 JWT"，观察 widget 逐步"长出来" |
| 2 | 非流式渲染 | 切换到历史会话，widget 正确渲染 |
| 3 | Drill-down | 点击 widget 内按钮，触发追问 |
| 4 | 高度自适应 | widget 高度正确，不截断不留白 |
| 5 | 深色模式 | 切换系统深色模式，widget 主题同步 |
| 6 | 多个 widget | 一条消息包含多个 widget，全部正确渲染 |
| 7 | CDN 资源 | Chart.js widget 正确加载 CDN 脚本 |

---

## 开发顺序

```
Phase 1 — 调研（已完成 ✅）
  确认 Hook 不能主动发送消息 → 选定路径 B+
  确认 send action 支持 media + buttons
  确认飞书插件能力完整
  确认 Chromium 在 sandbox 中可用

Phase 2 — M3a 核心实现（已完成 ✅）
  S1 Widget Interceptor（复用 M2 parseShowWidgetFence）
  S2 Screenshot Service（Playwright + buildWidgetDoc + smart wait）
  S3 Drill-down 提取
  S4a SKILL.md 截图指令（英文，强制规则前置）
  S4b message_sending Plugin Hook（widget-fence-cleaner）
  本地独立测试（截图验证、interceptor 验证）

Phase 3 — M3b Telegram / 飞书联调（已完成 ✅ 基本调通）
  Push 到 repo → VPS 拉取安装 Skill
  CDP 连接已有 Chrome 实例
  Telegram 截图 + 发送 PNG 验证通过
  飞书截图 + 发送 PNG 验证通过
  SKILL.md 多轮迭代优化（指令遵循、按钮格式）
  已知限制：模型 Skill 指令遵循能力要求较高，弱模型可能跳过截图步骤

Phase 4 — M3b+ 飞书增强（待定）
  飞书 Markdown 卡片（结构化 widget）
  飞书按钮回调 → drill-down
  视需求决定是否推进

Phase 5 — M3c Aight（待开始，需 iOS 配合）
  S5 壳页面
  S6 Swift 集成
  S7 联调测试
```

---

## 风险与决策点

### 1. ~~Hook vs Agent 主动调用~~ ✅ 已决策

Phase 1 调研确认：Hook 不能主动发送消息。选定路径 B+（Agent 主动调用 + message_sending 围栏清洗）。

### 2. Playwright 在 exec 环境中的可用性

OpenClaw 的 `exec` 工具可能在 Docker sandbox 中运行脚本。`Dockerfile.sandbox-browser` 预装了 Chromium，但需要在 VPS 上实测确认 exec 脚本是否能访问 Chromium。

→ **行动**：M3b 部署到 VPS 时实测。如果 sandbox 内无法访问 Chromium，备选方案是在 Gateway 主进程侧安装 Chromium，截图脚本通过 HTTP 调用。

### 3. Agent 忘记调用截图脚本

路径 B 的固有风险：agent 可能输出 widget 围栏后忘记调用截图脚本。

→ **缓解**：
- 在 SKILL.md 中用强指令（"你**必须**在输出 show-widget 围栏后立即调用截图脚本"）
- message_sending Hook 作为兜底，至少保证用户不会看到原始代码
- 后续可以考虑在 `message_sent` hook 中检测是否有未截图的围栏，记录日志告警

### 4. 截图延迟

Playwright 截图需要 1-3 秒。在 Telegram 中，用户会先看到文字回复（围栏已被清洗为纯文本摘要），然后 1-3 秒后收到图片。

→ **缓解**：保持 browser 实例常驻，避免每次冷启动。首次截图慢，后续复用 browser context。

### 5. Aight 的 JS 资源打包

WKWebView 加载本地 HTML 时，`@generative-ui/renderer` 的 dist JS 需要打包进 Aight 的 app bundle。需要确定：
- 直接 copy `dist/index.js` 到 Xcode 项目？
- 通过 CocoaPods/SPM 自动管理？
- 版本更新时如何同步？

→ **行动**：与 iOS 开发者确认最佳实践。
