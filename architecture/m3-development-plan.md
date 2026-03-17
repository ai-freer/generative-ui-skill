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

有两种实现路径：

#### 路径 A：Hook 方式（推荐）

写一个 OpenClaw Hook，监听 `message:sent` 事件。当检测到回复中包含 `show-widget` 围栏时：
1. 提取 widget_code
2. 调用 headless browser 截图
3. 通过 `sendAttachment` action 发送图片到当前渠道

```
agent 回复（含 show-widget 围栏）
  → message:sent hook 触发
  → 检测围栏 → 提取 widget_code
  → Playwright 截图 → PNG
  → sendAttachment → Telegram/Discord/...
```

优点：
- 对 agent 透明，不需要 agent 主动调用截图脚本
- 适用于所有渠道，不限于 Telegram
- 不改变现有 Skill 的 prompt

#### 路径 B：Agent 主动调用方式

在 `SKILL.md` 中教 agent：当输出 `show-widget` 围栏后，主动调用截图脚本。

```
agent 输出 show-widget 围栏
  → agent 自己调用 exec: node scripts/widget-screenshot.js --code "..."
  → 脚本截图 → 保存 PNG → 返回文件路径
  → agent 调用 sendAttachment 发送图片
```

缺点：
- 需要 agent 额外的 tool call 轮次（增加延迟和 token 消耗）
- agent 可能忘记调用
- 需要修改 system prompt

**建议选路径 A（Hook 方式）**，更可靠且对 agent 透明。

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

### S4：OpenClaw Hook 集成

这是最关键的集成点。需要研究 OpenClaw Hook 的具体注册和执行方式。

从源码看到：
- Hook 有 `HOOK.md`（frontmatter 描述）+ `handler.ts`（处理逻辑）
- Hook 通过 `events` 字段声明监听的事件
- `message:sent` 事件在消息发送后触发，包含 `content`、`channelId`、`conversationId` 等上下文

Hook 结构：

```
generative-ui/
  hooks/
    widget-renderer/
      HOOK.md          ← Hook 描述 + 元数据
      handler.mjs      ← 处理逻辑
```

`HOOK.md`:
```markdown
---
name: widget-renderer
description: Detects show-widget fences in agent replies and sends rendered PNG screenshots to the channel.
metadata:
  openclaw:
    emoji: "🎨"
    events: ["message:sent"]
    requires:
      bins: ["node"]
---

# Widget Renderer Hook

Automatically renders `show-widget` code fences as PNG images and sends them to the current channel.
```

`handler.mjs`:
```javascript
import { interceptWidgets } from '../../scripts/widget-interceptor.mjs';
import { captureWidget } from '../../scripts/widget-screenshot.mjs';
import { extractDrillDowns } from '../../scripts/widget-drilldown.mjs';

export default async function handler(event, context) {
  const { content, channelId, conversationId } = event;

  const result = interceptWidgets(content);
  if (!result.hasWidget) return;

  for (const widget of result.widgets) {
    // 截图
    const png = await captureWidget(widget.widgetCode);

    // 保存到临时文件
    const tmpPath = `/tmp/widget-${Date.now()}.png`;
    await fs.writeFile(tmpPath, png);

    // 通过 OpenClaw channel action 发送图片
    await context.sendAttachment({
      channelId,
      conversationId,
      filePath: tmpPath,
      caption: widget.title,
    });

    // 提取 drill-down 按钮（如果渠道支持 buttons）
    const drillDowns = extractDrillDowns(widget.widgetCode);
    if (drillDowns.length > 0 && context.channelCapabilities?.includes('buttons')) {
      // 发送 inline buttons
      // 具体 API 取决于 OpenClaw 的 channel action 接口
    }
  }
}
```

> **注意**：上面的 `context.sendAttachment` 和 `context.channelCapabilities` 是推测的 API。需要进一步确认 OpenClaw Hook handler 的实际 context 接口。这是 M3a 的首要调研任务。

### S4 的调研清单

在开始编码前，需要确认：

1. **Hook handler 的 context 对象有哪些方法？** 特别是能否发送附件、获取渠道能力。
   - 查看 `src/hooks/internal-hooks.ts` 中 `MessageSentHookContext` 的定义
   - 查看 `src/channels/plugins/types.adapters.ts` 中 `ChannelOutboundAdapter` 的接口

2. **Hook 能否在 message:sent 之后追加发送新消息？** 还是只能修改即将发送的消息？
   - 如果只能修改，需要换成 `message:before-send` 事件，把 widget 围栏替换为"[图表见下方]"占位符

3. **OpenClaw 的 `sendAttachment` action 具体怎么调用？**
   - 查看 Telegram channel plugin 的 `sendAttachment` 实现
   - 确认是否支持 inline keyboard

4. **Hook 是否能访问 Playwright？** 或者需要通过 exec 调用外部脚本？
   - OpenClaw 有 `Dockerfile.sandbox-browser`，但 Hook 可能运行在 sandbox 内

---

## M3b：Telegram 联调验证

### 测试环境

```
VPS (OpenClaw Gateway)
  ├── OpenClaw daemon
  │   ├── generative-ui Skill（M1 prompt）
  │   ├── widget-renderer Hook（M3a）
  │   └── Telegram channel plugin
  │
  ├── Playwright + Chromium（截图服务）
  │
  └── Telegram Bot API ←→ Telegram
```

### 部署步骤

1. 在 VPS 的 OpenClaw 实例中安装 generative-ui Skill
2. 安装 widget-renderer Hook
3. 确保 Playwright + Chromium 可用（`npx playwright install chromium`）
4. 在 Telegram 中测试

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

在 widget-renderer Hook 中增加飞书分支：

```javascript
// handler.mjs 中的渠道分发逻辑
async function handleWidget(widget, channelId, context) {
  if (channelId === 'feishu' || channelId === 'lark') {
    // 飞书：先尝试卡片映射
    const card = widgetToFeishuCard(widget);
    if (card) {
      // 策略 C：发送交互卡片
      await context.sendCard({ channelId, card });
      return;
    }
    // 卡片映射失败 → 回退截图，但用飞书图片卡片包装
    const png = await captureWidget(widget.widgetCode);
    const tmpPath = saveTempFile(png);
    // 飞书图片卡片（比裸图片好看）
    const imageCard = {
      config: { wide_screen_mode: true },
      elements: [
        { tag: 'img', img_key: await uploadToFeishu(tmpPath), alt: { tag: 'plain_text', content: widget.title } },
        // 附加 drill-down 按钮
        ...buildDrillDownActions(widget.widgetCode),
      ],
    };
    await context.sendCard({ channelId, card: imageCard });
  } else {
    // Telegram / 其他渠道：截图 + sendAttachment
    const png = await captureWidget(widget.widgetCode);
    const tmpPath = saveTempFile(png);
    await context.sendAttachment({ channelId, filePath: tmpPath, caption: widget.title });
  }
}
```

### S4d：飞书按钮回调处理

飞书卡片按钮点击会触发 action 回调。需要在 Hook 或 Skill 中处理：

```javascript
// 飞书卡片按钮回调
// 当用户点击 drill-down 按钮时，飞书会发送 action 回调
// OpenClaw 的飞书 channel plugin 应该能将这个回调转换为用户消息

// 回调 payload 示例：
// { action: { value: { action: "drill_down", query: "详细介绍 JWT 签名过程" } } }
// → 转换为用户消息 "详细介绍 JWT 签名过程" → agent 处理追问
```

### 飞书适配的调研清单

1. **OpenClaw 是否有飞书 channel plugin？** 搜索 `extensions/` 目录
   - 如果没有，飞书适配需要先写 channel plugin（工作量大）
   - 如果有，确认它是否支持 `sendCard` / Message Card API
2. **飞书 Bot API 的 Message Card 发送方式** — 需要 `app_id` + `app_secret`，通过 REST API 发送
3. **飞书图片上传** — 卡片内嵌图片需要先上传到飞书获取 `img_key`
4. **飞书卡片按钮回调** — 需要配置回调 URL，OpenClaw Gateway 是否能接收？

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
Phase 1 — 调研（1-2 天）
  确认 OpenClaw Hook handler 的 context API
  确认 sendAttachment 的调用方式
  确认 Playwright 在 OpenClaw sandbox 中的可用性
  确认 OpenClaw 是否有飞书 channel plugin

Phase 2 — M3a 核心实现（3-5 天）
  S1 Widget Interceptor（复用 M2 parseShowWidgetFence）
  S2 Screenshot Service（Playwright + buildWidgetDoc）
  S3 Drill-down 提取
  S4 Hook 集成

Phase 3 — M3b Telegram 联调（2-3 天）
  部署到 VPS
  Telegram 端到端测试
  修复问题

Phase 4 — M3b+ 飞书卡片适配（3-5 天）
  S4b 飞书 Message Card 映射器
  S4c 飞书 Hook 集成（渠道分发逻辑）
  S4d 飞书按钮回调处理
  飞书端到端测试

Phase 5 — M3c Aight（3-5 天，需 iOS 配合）
  S5 壳页面
  S6 Swift 集成
  S7 联调测试
```

---

## 风险与决策点

### 1. Hook vs Agent 主动调用

如果 OpenClaw Hook 的 `message:sent` 事件不支持追加发送新消息（只能修改当前消息），需要改用路径 B（agent 主动调用截图脚本）。这会增加 prompt 复杂度和 token 消耗。

→ **行动**：Phase 1 调研时确认。

### 2. Playwright 在 OpenClaw sandbox 中的可用性

OpenClaw 的 exec 工具可能在 Docker sandbox 中运行脚本。需要确认 sandbox 是否有 Chromium。`Dockerfile.sandbox-browser` 的存在是好信号。

→ **行动**：在 VPS 上测试 `npx playwright install chromium` 是否可行。

### 3. 截图延迟

Playwright 截图需要 1-3 秒（启动页面 + 等待渲染 + 截图）。在 Telegram 中，用户会先看到文字回复，然后 1-3 秒后收到图片。这个延迟是否可接受？

→ **缓解**：保持 browser 实例常驻，避免每次冷启动。首次截图慢，后续复用 browser context。

### 4. Aight 的 JS 资源打包

WKWebView 加载本地 HTML 时，`@generative-ui/renderer` 的 dist JS 需要打包进 Aight 的 app bundle。需要确定：
- 直接 copy `dist/index.js` 到 Xcode 项目？
- 通过 CocoaPods/SPM 自动管理？
- 版本更新时如何同步？

→ **行动**：与 iOS 开发者确认最佳实践。
