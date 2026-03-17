# M3 Phase 1 调研结论

> 调研日期：2026-03-17
> 调研方法：通过 `gh api` 直接阅读 [openclaw/openclaw](https://github.com/openclaw/openclaw) 源码

---

## 核心结论

### 1. Hook 能否主动发送消息？

**结论：Hook 本身不能直接调用 channel API 发送消息。**

OpenClaw 有两套 Hook 系统：

#### a) Internal Hooks（内部钩子）

- `InternalHookEvent` 有一个 `messages: string[]` 数组，注释写着 "Messages to send back to the user (hooks can push to this array)"
- 这意味着 Hook handler 可以往 `event.messages` 里 push 文本，系统会把这些文本发回给用户
- **但这只支持纯文本**，不支持发送图片/附件/卡片

#### b) Plugin Hooks（插件钩子）

- `message_sending` hook：在消息发送**前**触发，可以**修改内容**或**取消发送**
  ```typescript
  PluginHookMessageSendingResult = {
    content?: string;  // 修改消息内容
    cancel?: boolean;  // 取消发送
  }
  ```
- `message_sent` hook：在消息发送**后**触发，fire-and-forget，**只能观察不能修改**
- Plugin Hook 的 context 只有 `{ channelId, accountId, conversationId }`，**没有 send 方法**

#### 影响

原计划的 **路径 A（Hook 拦截 → 自动截图 → sendAttachment）不可行**，因为：
1. `message_sent` hook 是 fire-and-forget，没有 channel send 能力
2. `message_sending` hook 只能修改文本内容，不能追加图片附件
3. Internal hook 的 `messages[]` 只支持纯文本

**必须改用路径 B（Agent 主动调用）或路径 C（混合方案）。**

### 2. `message_sending` Hook 的价值

虽然不能直接发图片，但 `message_sending` hook 有一个重要能力：**修改即将发送的消息内容**。

这意味着我们可以：
- 在 `message_sending` hook 中检测 `show-widget` 围栏
- 把围栏替换为占位文本（如 `[📊 图表生成中...]`）或纯文本摘要（Layer 1 Summary）
- 避免把原始 HTML/SVG 代码直接发到 Telegram/飞书

这解决了一个重要的 UX 问题：即使截图还没生成，用户也不会看到一堆乱码。

### 3. 推荐实现路径：Agent 主动调用 + message_sending 清洗

```
Agent 输出 show-widget 围栏
  │
  ├─ message_sending hook 触发
  │   → 检测围栏 → 替换为 Layer 1 Summary 纯文本
  │   → 用户先看到干净的文字回复
  │
  └─ Agent 接着调用 exec 工具：
      → node scripts/widget-screenshot.mjs --code "..." --to "chat_id"
      → 脚本截图 → 保存 PNG → 输出文件路径
      → Agent 调用 send action 发送图片（带 inline buttons）
```

优点：
- 用户立即看到文字回复（无乱码）
- 图片随后到达（1-3 秒延迟可接受）
- Agent 可以附加 drill-down 按钮（Telegram inline keyboard）

需要修改 `SKILL.md` 的 system prompt，教 agent：
1. 输出 `show-widget` 围栏后，调用截图脚本
2. 用截图结果调用 send action 发送图片

### 4. sendAttachment / send action 的调用方式

从 Telegram channel-actions 源码确认：

```typescript
// Agent 通过 tool call 调用 channel action
// action: "send"
// params: { to, message, media, buttons, caption, ... }
```

Telegram 的 `send` action 支持：
- `to`: 目标 chat ID
- `message`: 文本内容
- `media`: 媒体 URL 或本地文件路径
- `buttons`: Telegram inline keyboard 按钮
- `caption`: 图片说明文字
- `forceDocument`: 是否作为文件发送（避免压缩）
- `replyTo`: 回复目标消息 ID
- `threadId`: 论坛话题 ID

**关键发现**：`media` 参数支持本地文件路径。这意味着截图脚本只需要把 PNG 保存到本地，Agent 就可以通过 `send` action 的 `media` 参数发送。

### 5. 飞书插件能力确认

飞书 extension (`extensions/feishu/`) 功能完整：

#### 消息发送
- `sendMessageFeishu()` — 发送普通文本
- `sendMarkdownCardFeishu()` — 发送 Markdown 卡片（代码块、表格自动用卡片）
- `sendStructuredCardFeishu()` — 发送结构化卡片（自定义 header、template color）
- `sendMediaFeishu()` — 发送图片/媒体

#### Outbound Adapter
- `feishuOutbound` 实现了完整的 `ChannelOutboundAdapter`
- `sendText` 自动判断是否需要卡片渲染（`renderMode: "auto" | "card"`）
- `sendMedia` 支持本地文件路径自动上传（`normalizePossibleLocalImagePath`）
- 支持 reply threading（`replyToMessageId`）

#### 卡片交互
- `card-interaction.ts` — 完整的卡片按钮回调处理
- `FeishuCardInteractionEnvelope` — 结构化的按钮回调 payload
- 支持 `button`、`quick`、`meta` 三种交互类型
- 回调包含用户 ID、会话 ID、过期时间等上下文

#### 关键发现
- 飞书的 `sendText` 已经有**自动卡片渲染**：当文本包含代码块或表格时，自动切换为 Markdown 卡片
- 飞书支持**本地图片路径自动上传**：outbound adapter 检测到本地图片路径时，自动调用 `sendMediaFeishu` 上传
- 飞书卡片按钮回调已有完整的解码/验证/路由机制

### 6. Playwright / Chromium 可用性

- `Dockerfile.sandbox-browser` 基于 Debian bookworm，预装 `chromium`、字体、xvfb
- OpenClaw sandbox 环境支持 headless browser
- **但需要确认**：Skill 脚本是否在 sandbox 内执行？如果是，Playwright 可用；如果不是，需要单独安装

---

## 修订后的实现方案

### 方案概述

```
┌─────────────────────────────────────────────────────┐
│  OpenClaw Gateway                                    │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  generative-ui Skill                          │   │
│  │                                               │   │
│  │  SKILL.md (M1 prompt + M3 截图指令)           │   │
│  │  scripts/widget-screenshot.mjs (截图脚本)     │   │
│  │                                               │   │
│  │  Agent 输出 show-widget → 调用截图脚本        │   │
│  │  → 保存 PNG → 调用 send action 发送图片       │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  widget-text-cleaner Plugin Hook (可选)       │   │
│  │                                               │   │
│  │  message_sending hook:                        │   │
│  │  检测 show-widget 围栏 → 替换为纯文本摘要     │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  Channel Plugins (Telegram / 飞书 / ...)             │
│  └─ send action: text + media + buttons              │
└─────────────────────────────────────────────────────┘
```

### 组件清单

| 组件 | 类型 | 说明 |
|------|------|------|
| `scripts/widget-screenshot.mjs` | Skill 脚本 | Playwright 截图，输入 widget_code，输出 PNG 路径 |
| `scripts/widget-drilldown.mjs` | Skill 脚本 | 提取 `__widgetSendMessage` 调用，输出按钮列表 |
| `SKILL.md` 追加段落 | Prompt 修改 | 教 agent 在非满血渠道调用截图脚本 + send action |
| Plugin Hook（可选） | OpenClaw Plugin | `message_sending` hook，清洗围栏为纯文本 |

### 与原方案的差异

| 维度 | 原方案（路径 A：Hook 自动截图） | 修订方案（路径 B：Agent 主动调用） |
|------|------|------|
| 触发方式 | Hook 自动检测并截图 | Agent 主动调用截图脚本 |
| 对 Agent 透明？ | ✅ 完全透明 | ❌ 需要修改 prompt |
| 额外 token 消耗 | 无 | 有（截图 tool call + send tool call） |
| 可靠性 | 高（自动触发） | 中（agent 可能忘记调用） |
| 灵活性 | 低（所有 widget 统一处理） | 高（agent 可以按 widget 类型决定策略） |
| 实现复杂度 | 高（需要 Hook 有 channel send 能力） | 低（复用已有 exec + send action） |

---

## 对开发计划的影响

### M3a 调整

1. **去掉 Hook 自动截图方案**，改为 Agent 主动调用
2. **新增 `message_sending` Plugin Hook**（可选，用于清洗围栏文本）
3. **修改 `SKILL.md`**，追加截图和发送指令
4. **截图脚本**保持不变（`widget-screenshot.mjs`）

### M3b+ 飞书调整

飞书的能力比预期更强：
- 自动卡片渲染已内置（代码块/表格 → Markdown 卡片）
- 本地图片路径自动上传已内置
- 卡片按钮回调机制完整

这意味着飞书适配的工作量比预期小：
- 视觉型 widget → 截图 PNG → Agent 调用 send（media 参数传本地路径，飞书自动上传）
- 结构化 widget → 可以考虑直接用飞书的 Markdown 卡片渲染（而不是自己映射 JSON）
- Drill-down 按钮 → 利用飞书已有的 `card-interaction` 机制

### 开发优先级不变

```
M3a  截图脚本 + SKILL.md 修改 + 可选 Plugin Hook
M3b  Telegram 联调
M3b+ 飞书适配
M3c  Aight WKWebView 集成
```

---

## 待确认事项

1. **Skill 脚本执行环境**：exec 工具是否在 sandbox-browser 容器内执行？还是在 Gateway 主进程？
   - 如果在 sandbox 内 → Chromium 可用，直接用 Playwright
   - 如果在主进程 → 需要在 VPS 上单独安装 Chromium

2. **Agent 的 send action 是否支持 buttons 参数**：从 Telegram channel-actions 看是支持的，但需要在 VPS 上实际测试

3. **飞书 send action 是否支持 structured card**：飞书 outbound adapter 有 `sendStructuredCardFeishu`，但 agent tool 层面是否暴露了这个能力？

> 以上待确认事项可以在 M3a 编码阶段通过 VPS 实测解决。
