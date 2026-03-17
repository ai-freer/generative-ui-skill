# M3 架构：渠道适配层（Channel Adapter Layer）

## 定位

M1 定义了 widget 输出格式（`show-widget` 围栏），M2 提取了框架无关的渲染库 `@generative-ui/renderer`。M3 解决的问题是：**不同渠道的消息容器能力天差地别，如何让 generative-ui 的能力在各渠道落地？**

M3 不是单一的"Aight 集成"，而是一个渠道适配层——每个渠道一个 adapter，按渠道能力选择最优渲染策略。

---

## 渠道能力矩阵

| 能力 | Aight (iOS) | Web (Playground) | 飞书 Bot | Telegram Bot | 微信公众号 |
|------|:-----------:|:----------------:|:--------:|:------------:|:----------:|
| 嵌入任意 HTML/JS | ✅ WKWebView | ✅ iframe | ❌ | ❌ | ❌ |
| 流式 DOM 预览 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 富文本卡片 | — | — | ✅ 交互卡片 | ❌ | ✅ 图文消息 |
| 按钮回调 | ✅ native | ✅ JS | ✅ 卡片按钮 | ✅ inline keyboard | ✅ 菜单/关键词 |
| 内嵌网页 | ✅ | ✅ | ✅ H5 小程序 | ✅ Mini App | ✅ H5 |
| 发送图片 | ✅ | ✅ | ✅ | ✅ | ✅ |

关键结论：只有 Aight 和 Web 能做满血体验（流式预览 → iframe）。其他渠道必须降级。

---

## 核心架构

```
                    ┌─────────────────────────────┐
                    │   OpenClaw Agent Runtime     │
                    │                              │
                    │  模型输出 show-widget 围栏    │
                    └──────────┬──────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Widget Interceptor  │
                    │                      │
                    │  检测 show-widget     │
                    │  解析 {title,         │
                    │        widget_code}  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Channel Router      │
                    │                      │
                    │  按渠道类型分发        │
                    └──┬───┬───┬───┬───┬──┘
                       │   │   │   │   │
          ┌────────────┘   │   │   │   └────────────┐
          ▼                ▼   ▼   ▼                ▼
    ┌──────────┐  ┌─────┐ ┌──┐ ┌────────┐  ┌──────────┐
    │  Aight   │  │ Web │ │飞│ │Telegram│  │  微信    │
    │ Adapter  │  │Adapt│ │书│ │Adapter │  │ Adapter  │
    └──────────┘  └─────┘ └──┘ └────────┘  └──────────┘
```

---

## 渲染策略分层

每个 adapter 根据 widget 类型和渠道能力，从以下策略中选择：

### 策略 A：满血渲染（Full Rendering）

适用渠道：Aight、Web

```
Token 流 → 流式 DOM 预览 → sandbox iframe（@generative-ui/renderer 完整流水线）
```

- 直接使用 M2 的 `@generative-ui/renderer`
- Aight 通过 WKWebView 承载，Web 通过 iframe 承载
- 支持流式预览、JS 交互、drill-down 追问
- 体验最完整，零降级

### 策略 B：静态图片 + 轻交互（Image + Callback）

适用渠道：飞书、Telegram、微信

```
show-widget 围栏
  → headless browser 渲染成 PNG
  → 发送图片到渠道
  → 提取 onclick 中的 __widgetSendMessage 调用
  → 转换为渠道原生按钮（飞书卡片按钮 / Telegram inline keyboard / 微信关键词）
```

这是大多数渠道的主力策略。视觉效果完整（图片），轻交互通过原生按钮实现。

### 策略 C：富文本卡片（Rich Card）

适用渠道：飞书

```
show-widget 围栏
  → 解析 widget 结构（标题、指标、列表等）
  → 映射为飞书 Message Card JSON
  → 发送交互卡片
```

仅适用于结构化程度高的 widget（指标卡片、对比表格、列表）。飞书卡片支持多栏布局、按钮回调，体验接近原生。复杂的 SVG/Chart.js 不适用此策略，回退到策略 B。

### 策略 D：H5 跳转（Web App Link）

适用渠道：飞书、Telegram、微信

```
show-widget 围栏
  → 将 widget_code 存储到临时 URL
  → 发送链接（飞书 H5 / Telegram Mini App / 微信 H5）
  → 用户点击后在内置浏览器中渲染完整 widget
```

适用于需要完整 JS 交互的复杂 widget（计算器、可操作图表）。多一步点击，但能力最接近满血。

---

## 策略选择矩阵

| Widget 类型 | Aight / Web | 飞书 | Telegram | 微信 |
|------------|:-----------:|:----:|:--------:|:----:|
| SVG 流程图/架构图 | A | B | B | B |
| Chart.js 数据图表 | A | B | B | B |
| 指标卡片/对比表格 | A | C → B fallback | B | B |
| 交互组件（计算器/表单） | A | D | D | D |
| SVG 插画/生成艺术 | A | B | B | B |

选择逻辑伪代码：

```javascript
function selectStrategy(channel, widgetCode) {
  // 满血渠道直接走 renderer
  if (channel.supportsIframe) return 'A';

  // 判断 widget 是否需要 JS 交互
  const needsJS = hasScriptTags(widgetCode) || hasEventHandlers(widgetCode);

  // 飞书：结构化 widget 尝试卡片
  if (channel.type === 'feishu' && isStructuredWidget(widgetCode)) {
    return 'C';
  }

  // 需要 JS 交互 → H5 跳转
  if (needsJS && channel.supportsWebApp) return 'D';

  // 默认：图片 + 按钮
  return 'B';
}
```

---

## Widget Interceptor

Interceptor 是整个适配层的入口，位于 Agent Runtime 和渠道投递之间。它的职责是从模型输出中检测并提取 widget，然后交给 Channel Router。

### 接口定义

```typescript
interface WidgetBlock {
  title: string;           // snake_case widget 标识
  widgetCode: string;      // 原始 HTML/SVG 片段
  rawFence: string;        // 完整的 show-widget 围栏（含 ```show-widget ... ```）
  textBefore: string;      // 围栏前的文本（Layer 1 Summary）
  textAfter: string;       // 围栏后的文本（Layer 3 Notes）
}

interface InterceptResult {
  hasWidget: boolean;
  widgets: WidgetBlock[];
  plainText: string;       // 去除所有围栏后的纯文本（降级兜底用）
}

function interceptWidgets(modelOutput: string): InterceptResult;
```

### 复用关系

Interceptor 的核心解析逻辑直接复用 M2 `stream-parser` 的 `parseShowWidgetFence()`。区别在于：
- M2 的 parser 面向流式场景（逐 chunk 喂入）
- Interceptor 面向完整输出（模型回复结束后一次性解析）

两者共享同一套围栏检测正则和 JSON 提取逻辑。

---

## Channel Adapter 接口

每个渠道实现一个 adapter，遵循统一接口：

```typescript
interface ChannelAdapter {
  /** 渠道标识 */
  readonly channelType: string;

  /** 渠道能力声明 */
  readonly capabilities: {
    supportsIframe: boolean;
    supportsRichCard: boolean;
    supportsWebApp: boolean;
    supportsImage: boolean;
    supportsInlineButton: boolean;
  };

  /**
   * 投递一条包含 widget 的消息
   * @param context  会话上下文（用户 ID、会话 ID 等）
   * @param intercept  Interceptor 解析结果
   * @param strategy  Channel Router 选定的渲染策略
   */
  deliver(
    context: ChannelContext,
    intercept: InterceptResult,
    strategy: RenderStrategy
  ): Promise<DeliverResult>;

  /**
   * 处理用户在渠道内的交互回调
   * （飞书卡片按钮点击、Telegram inline keyboard 回调等）
   */
  handleCallback(callback: ChannelCallback): Promise<string>;
}
```

---

## 各渠道 Adapter 设计

### Aight Adapter（iOS — 满血）

```
┌─────────────────────────────────────────────┐
│  Aight iOS App                              │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Chat Message Cell                  │    │
│  │                                     │    │
│  │  ┌───────────────────────────────┐  │    │
│  │  │  WKWebView                    │  │    │
│  │  │                               │  │    │
│  │  │  @generative-ui/renderer      │  │    │
│  │  │  ┌─────────────────────────┐  │  │    │
│  │  │  │  sandbox iframe         │  │  │    │
│  │  │  │  (widget 最终渲染)       │  │  │    │
│  │  │  └─────────────────────────┘  │  │    │
│  │  └───────────────────────────────┘  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  WKScriptMessageHandler 桥接：              │
│  ├─ widgetResize → 调整 cell 高度           │
│  ├─ widgetSendMessage → 触发追问            │
│  └─ widgetLink → 打开链接                   │
└─────────────────────────────────────────────┘
```

实现要点：

- 消息渲染层引入 `@generative-ui/renderer`，每个 widget 消息气泡内嵌一个 WKWebView
- WKWebView 加载一个本地 HTML 壳页面，壳页面内引入 renderer 并调用 `renderer.feed()` / `renderer.parseAndRender()`
- 流式场景：SSE chunk 通过 `WKWebView.evaluateJavaScript()` 实时喂入 renderer
- 交互桥接：widget 内的 `window.__widgetSendMessage()` 通过 postMessage → WKScriptMessageHandler → Swift delegate → 发送追问消息
- 高度自适应：`widgetResize` postMessage → WKScriptMessageHandler → 更新 UITableViewCell / UICollectionViewCell 高度约束
- 主题同步：App 切换深色/浅色模式时，通过 `evaluateJavaScript()` 调用 renderer 的主题切换 API
- CSP 策略与 Web 版一致：`sandbox="allow-scripts"`，CDN 白名单

### 飞书 Adapter

飞书 Bot 有两种消息能力可用：Message Card（交互卡片）和普通消息（图片/文本）。

```
show-widget 围栏
  │
  ├─ 结构化 widget（指标卡片/表格/列表）
  │   → 策略 C：解析 widget 结构 → 映射为飞书 Message Card JSON
  │   → 卡片按钮 action_url 回调 → handleCallback → 触发追问
  │
  ├─ 视觉型 widget（SVG 图表/流程图/插画）
  │   → 策略 B：headless 渲染 PNG → 发送图片消息
  │   → 提取 drill-down 按钮 → 附加 inline 按钮卡片
  │
  └─ 交互型 widget（计算器/可操作图表）
      → 策略 D：widget_code 存储 → 生成 H5 链接
      → 发送卡片消息，嵌入"打开交互版"按钮
```

飞书 Message Card 映射示例：

```javascript
// widget_code 中的指标卡片
// <div class="metric-card"><h3>DAU</h3><span>12,345</span></div>

// → 飞书 Message Card JSON
{
  "config": { "wide_screen_mode": true },
  "elements": [
    {
      "tag": "column_set",
      "columns": [
        {
          "tag": "column",
          "elements": [
            { "tag": "markdown", "content": "**DAU**\n12,345" }
          ]
        }
      ]
    },
    {
      "tag": "action",
      "actions": [
        {
          "tag": "button",
          "text": { "tag": "plain_text", "content": "查看详情" },
          "type": "primary",
          "value": { "action": "drill_down", "query": "详细介绍 DAU 指标" }
        }
      ]
    }
  ]
}
```

### Telegram Adapter

Telegram Bot API 消息格式有限，核心策略是图片 + inline keyboard。

```
show-widget 围栏
  │
  ├─ 所有视觉型 widget
  │   → 策略 B：headless 渲染 PNG
  │   → sendPhoto + caption（Layer 1 Summary 文本）
  │   → 提取 drill-down → inline_keyboard 按钮
  │
  └─ 交互型 widget
      → 策略 D：widget_code 存储 → 生成 Mini App 链接
      → sendMessage + inline_keyboard 含 web_app 按钮
```

Telegram inline keyboard 映射：

```javascript
// widget_code 中的 drill-down 按钮
// onclick="window.__widgetSendMessage('详细介绍 JWT 的签名过程')"

// → Telegram inline keyboard
{
  "inline_keyboard": [
    [
      {
        "text": "JWT 签名过程",
        "callback_data": "drill:详细介绍 JWT 的签名过程"
      }
    ]
  ]
}
```

### 微信公众号 Adapter

微信公众号的消息能力介于飞书和 Telegram 之间：支持图文消息和 H5 跳转，但没有 inline 按钮回调。

```
show-widget 围栏
  │
  ├─ 视觉型 widget
  │   → 策略 B：headless 渲染 PNG → 图文消息（图片 + 摘要文本）
  │   → drill-down 通过"回复关键词"引导（如"回复 1 查看详情"）
  │
  └─ 交互型 widget
      → 策略 D：widget_code 存储 → H5 链接
      → 图文消息嵌入"点击查看交互版"链接
```

---

## 图片渲染服务（Widget Screenshot Service）

策略 B 的核心依赖。将 widget_code 渲染成 PNG 图片，供非满血渠道使用。

### 流程

```
widget_code
  → 拼装完整 HTML 文档（复用 M2 iframe-renderer 的 buildWidgetDoc）
  → headless browser 加载（Playwright / Puppeteer）
  → 等待渲染就绪（字体加载、Chart.js 动画完成、SVG 布局稳定）
  → 截图 → PNG buffer
  → 返回 / 上传到 CDN
```

### 关键细节

- HTML 文档拼装直接复用 M2 `iframe-renderer` 的 `buildWidgetDoc()`，确保图片渲染结果与 iframe 内一致
- 等待策略：`networkidle` + 额外 500ms 延迟（Chart.js 动画默认 400ms）
- 视口宽度：680px（与 system prompt 中 SVG viewBox `width="680"` 对齐）
- 高度：自适应（`document.body.scrollHeight`）
- 像素密度：`deviceScaleFactor: 2`（Retina 清晰度）
- 深色/浅色：根据用户偏好或渠道设置注入对应 CSS 变量
- 超时兜底：3 秒未就绪则强制截图，避免阻塞投递

### 部署形态

两种选择，按规模决定：

1. **进程内调用**（小规模）— Agent Runtime 进程内启动 headless browser 实例池，直接调用。简单，但吃内存。
2. **独立微服务**（大规模）— 独立的截图服务，接收 widget_code，返回 PNG URL。可水平扩展，支持缓存（相同 widget_code hash → 复用已有图片）。

---

## Widget 临时存储（Widget Hosting）

策略 D（H5 跳转）需要将 widget_code 存储到一个可访问的 URL。

### 方案

```
widget_code
  → buildWidgetDoc() 拼装完整 HTML
  → 存储到临时 KV（Redis / S3 / Cloudflare KV）
  → 生成短链：https://widget.openclaw.com/w/{hash}
  → 访问时返回完整 HTML 文档
```

### 约束

- TTL：24 小时（聊天消息的时效性，过期后显示"widget 已过期"占位页）
- 安全：widget_code 已经过 M2 sanitizer 清理，存储的是 buildWidgetDoc 的完整输出（含 CSP meta 标签）
- 无需登录：链接本身是 capability URL（hash 不可猜测）

---

## Drill-down 交互适配

Widget 的 drill-down 设计（Layer 4）依赖 `window.__widgetSendMessage(text)`，在不同渠道需要不同的桥接方式。

### 提取 drill-down 按钮

从 widget_code 中提取所有 `__widgetSendMessage` 调用：

```javascript
function extractDrillDowns(widgetCode) {
  const re = /window\.__widgetSendMessage\(\s*['"](.+?)['"]\s*\)/g;
  const drillDowns = [];
  let m;
  while ((m = re.exec(widgetCode)) !== null) {
    drillDowns.push({
      query: m[1],
      label: summarizeQuery(m[1]),  // "详细介绍 JWT 签名过程" → "JWT 签名过程"
    });
  }
  return drillDowns;
}
```

### 各渠道映射

| 渠道 | drill-down 实现 | 回调处理 |
|------|----------------|---------|
| Aight | `__widgetSendMessage` → WKScriptMessageHandler → 发送追问 | 原生，无需适配 |
| Web | `__widgetSendMessage` → postMessage → 父页面监听 | 原生，无需适配 |
| 飞书 | 卡片按钮 → action 回调 URL → webhook → 发送追问 | `handleCallback` 解析 action value |
| Telegram | inline keyboard → callback_data → Bot API update → 发送追问 | `handleCallback` 解析 callback_data |
| 微信 | 引导文本"回复 N 查看详情" → 用户回复 → 匹配关键词 → 发送追问 | 消息处理层匹配编号 |

---

## 与 OpenClaw 的集成点

M3 不是独立运行的服务，而是嵌入 OpenClaw Agent Runtime 的一个中间件层。

### 在 Agent Runtime 中的位置

```
用户消息 → Agent Runtime → 模型调用 → 模型输出
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │ Widget        │
                                  │ Interceptor   │
                                  │ (M3 中间件)    │
                                  └──────┬───────┘
                                         │
                              ┌──────────▼──────────┐
                              │                     │
                         有 widget              无 widget
                              │                     │
                              ▼                     ▼
                      Channel Router          直接投递文本
                              │
                              ▼
                      Adapter.deliver()
```

### 集成方式

M3 作为 OpenClaw 消息投递流水线的一个 middleware：

```typescript
// OpenClaw Agent Runtime 伪代码
async function deliverMessage(channelCtx, modelOutput) {
  // M3 中间件：检测 widget
  const intercept = interceptWidgets(modelOutput);

  if (!intercept.hasWidget) {
    // 无 widget，走原有投递逻辑
    return channel.sendText(channelCtx, modelOutput);
  }

  // 有 widget，走 M3 适配层
  const adapter = getAdapter(channelCtx.channelType);
  const strategy = selectStrategy(adapter.capabilities, intercept);
  return adapter.deliver(channelCtx, intercept, strategy);
}
```

### Skill 层面无需改动

M1 的 Prompt Skill 定义了模型的输出格式（`show-widget` 围栏）。这个格式是渠道无关的——模型不需要知道用户在哪个渠道，它只管输出 widget。渠道适配完全在投递层处理。

这意味着：
- `prompts/system.md` 不需要任何修改
- `@generative-ui/renderer`（M2）不需要任何修改
- 新增的只是 Interceptor + Router + Adapters

---

## 模块依赖关系

```
M1 Prompt Skill
  │
  │  定义 show-widget 围栏格式
  │
  ▼
M2 @generative-ui/renderer
  │
  │  提供：parseShowWidgetFence()  ← Interceptor 复用
  │  提供：buildWidgetDoc()        ← Screenshot Service 复用
  │  提供：WidgetRenderer          ← Aight Adapter 直接使用
  │
  ▼
M3 Channel Adapter Layer
  ├── widget-interceptor     复用 M2 stream-parser
  ├── channel-router         策略选择逻辑
  ├── screenshot-service     复用 M2 iframe-renderer
  ├── widget-hosting         临时存储 + 短链
  ├── adapters/
  │   ├── aight.ts           复用 M2 renderer 完整流水线
  │   ├── web.ts             复用 M2 renderer（已有，playground 就是）
  │   ├── feishu.ts          图片 + Message Card + H5
  │   ├── telegram.ts        图片 + inline keyboard + Mini App
  │   └── wechat.ts          图片 + 图文消息 + H5
  └── drill-down-extractor   提取 __widgetSendMessage 调用
```

---

## 开放问题

以下问题在 M2 完成后、M3 开发计划制定前需要明确：

### 1. Screenshot Service 的部署形态

进程内 vs 独立微服务？取决于 OpenClaw 的部署架构和并发量。如果 Agent Runtime 是 serverless（如 Lambda），headless browser 不适合进程内启动，需要独立服务。

### 2. Widget Hosting 的存储选型

Redis TTL vs S3 + CloudFront vs Cloudflare Workers KV？取决于 OpenClaw 现有基础设施。核心需求：写入快、读取快、自动过期、成本低。

### 3. 飞书 Message Card 的映射覆盖度

widget_code 是自由格式的 HTML/SVG，自动映射为飞书卡片 JSON 的覆盖度有多高？可能需要：
- 定义一组"卡片友好"的 widget 模式（指标卡片、对比表格、列表）
- 对这些模式做精确映射
- 其他模式一律回退到图片

### 4. 流式体验在非满血渠道的处理

模型输出是流式的，但策略 B/C/D 都需要等围栏闭合后才能处理。在等待期间，非满血渠道的用户看到什么？

选项：
- a) 先发送 Layer 1 Summary 文本，widget 就绪后再发图片/卡片（两条消息）
- b) 等整个回复完成后一次性发送（一条消息，但延迟更高）
- c) 发送"正在生成图表…"占位消息，就绪后编辑替换（飞书/Telegram 支持消息编辑）

### 5. Planner（截断恢复）在非满血渠道的行为

M2 的 Planner 在 widget 被截断时会触发多步生成。在非满血渠道：
- Planner 的中间状态（planning、subtask_start 等）如何展示？
- 最终组装的 widget 是否需要特殊处理？

建议：Planner 逻辑不变，最终组装完成后再交给 Interceptor → Router → Adapter 流水线。中间状态可以通过渠道的"正在输入…"指示器或占位消息来体现。

---

## 总结

M3 的核心思路是**一次生成，多渠道适配**：

- 模型输出格式不变（M1 Skill）
- 渲染库不变（M2 Renderer）
- 新增一个渠道适配中间件层，按渠道能力选择最优渲染策略
- 满血渠道（Aight/Web）直接用 renderer，其他渠道通过图片/卡片/H5 降级
- drill-down 交互通过各渠道原生按钮机制桥接

这个架构让 Skill 和 Renderer 保持通用，渠道扩展只需新增 adapter，不影响上游。
