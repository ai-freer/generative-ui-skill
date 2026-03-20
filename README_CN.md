# Generative UI Skill

[中文](./README_CN.md) | [English](./README.md)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

让任何 chatbot 的文本输出能够承载交互式 UI 组件 —— 图表、架构图、计算器、数据可视化 —— 无需前端改造，任何能输出 markdown 的模型都能驱动。

> **项目状态：** 所有计划里程碑（M0–M3）已全部完成。渲染运行时 [`generative-ui-renderer`](https://www.npmjs.com/package/generative-ui-renderer) 已发布到 npm。渠道适配（Telegram、飞书、QQ）已调通。项目当前进入维护状态，暂无新功能开发计划。

## 致谢

本项目的灵感和核心技术参考来自以下作者和开源项目，在此特别致谢：

- **[@op7418（歸藏）](https://github.com/op7418)**—— 其文章[《我复刻了 Claude 刚发布的生成式 UI 交互！》](https://mp.weixin.qq.com/s/3IQIs6zP5jfdTwmT5LUJ6g)让我们更早意识到代码围栏 + iframe 隔离这条工程方向的可行性，并为本项目提供了重要启发。
- **[pi-generative-ui](https://github.com/Michaelliv/pi-generative-ui)**（[Michaelliv](https://github.com/Michaelliv)，MIT 协议）—— 逆向工程了 Claude.ai 原生 `show_widget` 实现，提取了完整的 Anthropic 设计指南（~72KB），并用 morphdom + Glimpse 在终端 agent 中复现了流式渲染体验。本项目的 `prompts/guidelines/` 设计指南即基于该项目提取适配。逆向工程文章：[Reverse-engineering Claude's generative UI](https://michaellivs.com/blog/reverse-engineering-claude-generative-ui/)

---

## 项目背景

2026-03-12，Anthropic 在 Claude.ai 上线了生成式 UI 交互 —— 模型可以在对话中内联渲染交互式 HTML/SVG 组件。随后，`pi-generative-ui` 对这套机制做了较完整的开源复现，`CodePilot` 的文章与实现方案也提供了有价值的工程启发。

本项目的目标：把这套能力抽象成**通用 Skill**，让 OpenClaw 管理的所有 chatbot 和 AI agent 都能生成富 UI 回复。

---

## 当前发布状态

- `main`：包含 **M1 + M2 + M3** 全部成果。Web Playground 可直接使用，渠道适配脚本（截图 + drill-down 按钮提取）已就绪。
- **Telegram / 飞书 / QQ 渠道适配**已完成：widget 截图为 PNG + drill-down 交互映射为原生按钮。
- **`generative-ui-renderer`** 已发布到 npm。
- **Plugin Hook**（`widget-fence-cleaner`）可选安装，在消息发送前自动清洗围栏代码。

### 渠道适配注意事项

渠道适配依赖 agent 主动调用截图脚本并发送图片，对模型的 **Skill 指令遵循能力要求较高**。实测表现：

- **强模型**（Claude Opus/Sonnet、GPT-5.4）—— 能稳定执行完整的截图 + 发送 + 按钮提取流程
- **中等模型**（Kimi K2.5、Seed 2.0 Pro 等）—— 可能偶尔跳过截图步骤或遗漏按钮提取，需要更强的 prompt 引导
- **较弱模型** —— 可能无法可靠地遵循多步骤 Skill 指令，不建议用于渠道适配场景

Web Playground 不受此限制，任何能输出 `show-widget` 围栏的模型都可以正常使用。

---

## 核心架构

整个方案分为三层：**Prompt Skill → 渲染运行时 → 渠道适配层**，逐层解耦。

```
┌─────────────────────────────────────────────────────────┐
│                    任意 LLM 模型                         │
│          （Claude / GPT / Kimi / Seed / ...）            │
└────────────────────────┬────────────────────────────────┘
                         │  注入 System Prompt + Guidelines
                         ▼
┌─────────────────────────────────────────────────────────┐
│              ① Prompt Skill（M1）                        │
│                                                         │
│  模型学会用 ```show-widget 代码围栏输出 HTML/SVG widget  │
│  模块化设计指南按需加载（diagram / chart / art / ...）    │
└────────────────────────┬────────────────────────────────┘
                         │  模型输出包含 show-widget 围栏的文本流
                         ▼
┌─────────────────────────────────────────────────────────┐
│              ② 渲染运行时（M2）                          │
│              generative-ui-renderer                     │
│                                                         │
│  流式围栏检测 → HTML 清理 → CSS 变量桥接 → 渲染          │
│  三阶段流水线：流式 DOM 预览 → sandbox iframe → 交互桥接  │
└────────────────────────┬────────────────────────────────┘
                         │  标准化的 widget 渲染能力
                         ▼
┌─────────────────────────────────────────────────────────┐
│              ③ 渠道适配层（M3）                           │
│                                                         │
│  按渠道能力选择渲染策略：                                 │
│  Web → 满血渲染（完整流水线）                               │
│  飞书 / Telegram / QQ → 图片 + 按钮                      │
└─────────────────────────────────────────────────────────┘
```

核心设计选择：

- **代码围栏而非 tool_use** —— 不依赖特定 SDK，任何能输出 markdown 的模型都能驱动
- **三阶段渲染流水线** —— 流式预览（边生成边看）→ sandbox iframe（安全执行）→ 交互桥接（drill-down 追问）
- **模块化设计指南** —— 基于 Anthropic 原版提取适配，按场景按需加载，避免 token 浪费

---

## 核心产出

### Prompt Skill

System prompt 注入层，是整个方案的基础。启用后，模型知道如何用 ` ```show-widget ` 代码围栏输出合法的 HTML/SVG widget。

内置 6 个设计指南模块，可自由组合：

| 模块 | 适用场景 |
|------|---------|
| **core** | 结构化文字说明（概念、规则、方法、分点总结） |
| **diagram** | 关系 / 结构 / 流程图（架构图、时序图、用户旅程图等） |
| **chart** | 数据图表（趋势、对比、分布、占比等） |
| **interactive** | 可交互内容（可点 / 可拖 / 可调参数的 demo、模拟器、小工具） |
| **mockup** | 界面、原型和高保真页面效果 |
| **art** | 风格化视觉（插画、海报、情绪板、世界观视觉） |

所有主题至少会有 `core`，再叠加其它视角。每个主题可以同时使用 2–4 个模块，让信息更立体。

### 渲染运行时

框架无关的 JS 库 `generative-ui-renderer`（M2 开发中）。任何前端引入后就能渲染 show-widget 围栏内的 HTML/SVG。核心能力：

- 流式围栏检测 + partial JSON 提取
- 两阶段 HTML 清理（流式阶段剥离危险标签，终态阶段保留脚本在 sandbox 内执行）
- CSS 变量桥接（模型写标准变量名，桥接层映射到宿主实际变量）
- 双模式渲染器（iframe 隔离模式 / morphdom 性能模式）
- 封装为 Web Component `<widget-renderer>`

### Playground

项目自带一个完整的本地测试环境（`playground/`），可以直接体验 Generative UI 的效果：

```bash
cd playground
cp .env.example .env   # 配置 API Key
npm install
npm start              # 启动后访问 http://localhost:3456
```

Playground 包含：
- Express 后端（SSE 流式代理，支持 OpenAI / Anthropic / 兼容 API）
- Chat UI 前端（流式围栏检测 → 增量 DOM 预览 → sandbox iframe 渲染）
- 6 个示例 widget（`examples/` 目录：流程图、图表、计算器、对比图、3D 太阳系场景、3D 酿造流程场景）

Playground 同时也是 M2 渲染运行时的原型验证环境 —— `playground/public/app.js` 中已验证了完整的三阶段渲染流水线，M2 在此基础上提取为可复用库。

### 如何使用 Playground

当前项目采用开源自用方式提供，不提供带统一 API Key 的公共托管试玩环境。

如果你想自己使用 Playground，推荐按下面方式操作：

1. 把仓库 clone 到本地。
2. 进入 `playground/` 目录。
3. 安装依赖并启动本地服务。
4. 在浏览器中打开 `http://localhost:3456`。
5. 优先使用 Playground 自带的配置界面，填写 provider、API Key 和模型列表。
6. 用你自己的模型服务配置开始测试。

示例命令：

```bash
git clone https://github.com/ai-freer/generative-ui-skill.git
cd generative-ui-skill/playground
npm install
npm start
```

如果你是高级用户，或者需要做可重复部署，也可以选择手工编辑 `playground/.env`；但这属于可选方式，不是默认推荐路径。

如果你想在团队内部共享，建议自行部署一份 Playground，并由各自环境通过 GUI 配置或环境变量独立管理 API Key。

---

## 渠道适配与使用方式

不同渠道的消息容器能力差异很大。项目设计了两种渲染策略，按渠道能力自动选择：

这一节既是给最终使用者看的，也是给需要做渠道集成的开发者看的。

如果你要把本项目安装到 OpenClaw 管理的渠道中，或者需要了解 OpenClaw 侧的接入步骤、插件安装方式与运行前准备，请先阅读 [INSTALL.md](./INSTALL.md)。其中已经专门整理了 OpenClaw 安装与配置所需的步骤说明。

| 策略 | 适用渠道 | 方式 |
|------|---------|------|
| 满血渲染 | Web（iframe） | `generative-ui-renderer` 完整流水线，流式预览 + JS 交互 |
| 静态图片 + 按钮 | 飞书、Telegram、QQ | headless 渲染 widget 为 PNG，drill-down 映射为原生按钮 |

### Web 集成

如果你有自己的 Web 应用，可以直接引入渲染运行时：

```html
<script src="generative-ui-renderer"></script>
<widget-renderer stream="..."></widget-renderer>
```

或者参考 `playground/` 的实现，将流式渲染逻辑嵌入你自己的聊天界面。

### 开发自定义渠道适配器

如果你需要接入飞书、Telegram、QQ 或其他渠道，可以参考 `architecture/m3-channel-adapters.md` 中的架构设计，实现自己的 Channel Adapter。每个 adapter 只需要：

1. 接收 Widget Interceptor 解析出的 `{ title, widget_code }`
2. 根据渠道能力选择渲染策略
3. 调用对应的渲染服务（renderer / screenshot）
4. 将结果通过渠道 API 投递

新增渠道只需新增 adapter，不影响上游的 Skill 和 Renderer。

---

## 模型兼容性

| 模型 | 支持情况 | 备注 |
|------|---------|------|
| Claude Opus 4.6 | ✅ 已实测 | 当前验证轮次里整体稳定性最好 |
| Claude Sonnet 4.6 | ✅ 已实测 | 质量与成本平衡较好 |
| GPT-5.4 | ✅ 已实测 | 已完成当前验证集，整体结果稳定 |
| Kimi K2.5 | ✅ 已实测 | 串行补测后视觉质量表现较强 |
| Seed 2.0 Pro | ✅ 已实测（有保留） | 图表和 mockup 表现较好，但在“无 widget 场景”约束上仍偏弱 |
| GLM-5 | ✅ 已实测 | 串行补测后稳定性明显改善 |
| gemini-3.1-pro-preview | ✅ 已实测（有保留） | 已完成 13 条主验证用例与 3D 补测；当前剩余已知问题仍是“无 widget 场景”里的天气问答误输出 widget |

详细验证记录见 [`tests/prompt-validation.md`](./tests/prompt-validation.md)。当前仓库工作流已覆盖 Gemini 的 13 条主验证用例，以及全部已测模型的 3D 补测（`用例 14 / 15A / 15B`）。

### 多模型适应策略

不同模型的指令遵循能力差异显著，尤其体现在交互设计（drill-down、follow-up）上：

- **强模型**（Claude Opus/Sonnet、GPT-4/5）—— 能自主判断哪些内容值得展开，主动在关键节点添加 drill-down 交互，生成追问引导。Prompt 只需给出原则性规则，模型自行决策。
- **中等模型**（Kimi K2.5、Seed 2.0 Pro 等）—— 能完成基本的 widget 渲染，但对"什么内容值得交互"的判断较弱，容易输出纯静态图表。

为此，System Prompt 采用**分层引导**设计：
1. 原则层 —— 定义"meaningful node"的判断标准（术语、数据点、流程步骤、对比项），强模型据此自主决策
2. 兜底倾向 —— "When in doubt, prefer clickable over static"，为中等模型提供明确的行动偏好
3. 保底输出 —— 要求每个 widget 底部至少包含 2–3 个 follow-up 问题按钮，确保即使模型无法在节点级别做交互，用户仍有延展路径

---

## CDN 白名单

Widget 内的 `<script src>` 只能从以下 CDN 加载（CSP 强制执行）：

- **cdnjs.cloudflare.com** — Chart.js, D3 等主流库
- **cdn.jsdelivr.net** — npm 包 CDN
- **unpkg.com** — npm 包 CDN
- **esm.sh** — ESM 格式 CDN

---

## 测试

```bash
cd playground

npm test           # 全部测试
npm run test:unit  # 仅单元测试（parser / search / prompt / planner）
npm run test:e2e   # 仅 E2E + widget 渲染检查
```

---

## 里程碑

| 阶段 | 内容 | 状态 |
|------|------|------|
| M0 | 技术分析 + 源码研究 + 项目规划 | ✅ 完成 |
| M1 | Prompt Skill 创建 + 验证 | ✅ 完成 |
| M2 | 渲染运行时 JS 库 `generative-ui-renderer` | ✅ 完成（已发布 npm） |
| M3a | 渠道适配脚本（截图 + drill-down + 围栏清洗） | ✅ 完成 |
| M3b | Telegram / 飞书 / QQ 渠道联调 | ✅ 完成 |

详细开发计划参见 [DEVELOPMENT.md](./DEVELOPMENT.md)，渠道适配架构参见 [architecture/m3-channel-adapters.md](./architecture/m3-channel-adapters.md)。

---

## 参考资料

- 歸藏原文：[《我复刻了 Claude 刚发布的生成式 UI 交互！》](https://mp.weixin.qq.com/s/3IQIs6zP5jfdTwmT5LUJ6g)
- 逆向工程文章：[Reverse-engineering Claude's generative UI](https://michaellivs.com/blog/reverse-engineering-claude-generative-ui/)
- pi-generative-ui 仓库：https://github.com/Michaelliv/pi-generative-ui （MIT 协议）
- CodePilot 仓库：https://github.com/op7418/CodePilot （未声明开源协议）

---

## 协议

本项目基于 [Apache License 2.0](./LICENSE) 开源。

使用本项目时，请保留 [NOTICE](./NOTICE) 文件中的版权声明和第三方归属信息。
