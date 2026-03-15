# Prompt 验证用例

验证 Generative UI Skill 注入后，模型的输出行为是否符合预期。

## 验证模型

- Claude Sonnet 4.6
- Kimi K2.5
- Seed 2.0 Pro
- GPT-5.4

## 用例清单

### 1. 流程图生成

| 项目 | 内容 |
|------|------|
| **输入** | "解释 JWT 认证流程" |
| **预期** | 回复包含 `show-widget` 代码围栏 + SVG 内容 |
| **检查项** | 有效 SVG, `viewBox` 正确, 透明背景, 使用 `c-*` 颜色类, 节点可点击 |
| **指南模块** | core + color-palette + svg-setup + diagram |

### 2. 数据图表

| 项目 | 内容 |
|------|------|
| **输入** | "展示过去 6 个月的用户增长趋势" |
| **预期** | 回复包含 `show-widget` 代码围栏 + Chart.js HTML |
| **检查项** | CDN 引用 `cdnjs.cloudflare.com`, canvas 存在, `onload` 初始化, 自定义图例, 指标卡片 |
| **指南模块** | core + ui-components + color-palette + chart |

### 3. 交互组件

| 项目 | 内容 |
|------|------|
| **输入** | "做一个 BMI 计算器" |
| **预期** | 回复包含 `show-widget` 代码围栏 + 带滑块/输入框的 HTML |
| **检查项** | 滑块有 `step` 属性, 数字经过 `Math.round()`, 实时计算逻辑正确, 使用 CSS 变量 |
| **指南模块** | core + ui-components + color-palette |

### 4. 对比图

| 项目 | 内容 |
|------|------|
| **输入** | "比较 REST 和 GraphQL" |
| **预期** | 回复包含 `show-widget` 代码围栏 + SVG 或 HTML 卡片 |
| **检查项** | 并排布局, 色彩区分两方, 使用不同 `c-*` 色系, 节点可点击追问 |
| **指南模块** | core + color-palette + svg-setup + diagram |

### 5. 无 widget 场景

| 项目 | 内容 |
|------|------|
| **输入** | "今天天气怎么样" |
| **预期** | 纯文本回复 |
| **检查项** | 不应包含 `show-widget` 代码围栏 |
| **指南模块** | 仅 core（或不注入） |

### 6. 结构图

| 项目 | 内容 |
|------|------|
| **输入** | "画一下 Kubernetes 的架构" |
| **预期** | 回复包含 `show-widget` 代码围栏 + SVG 嵌套容器 |
| **检查项** | 外层容器 rx=20+, 内层区域不同色系, 20px 内边距, 最多 2-3 层嵌套 |
| **指南模块** | core + color-palette + svg-setup + diagram |

### 7. 深色模式兼容

| 项目 | 内容 |
|------|------|
| **输入** | 任意 widget 生成场景 |
| **预期** | Widget 在深色背景下仍然可读 |
| **检查项** | 无硬编码颜色（如 `#333`, `black`）, SVG 文本使用 `t`/`ts`/`th` 类, HTML 文本使用 `var(--color-text-*)` |
| **指南模块** | 所有 |

### 8. CDN 合规

| 项目 | 内容 |
|------|------|
| **输入** | "做一个 D3.js 的数据可视化" |
| **预期** | `<script src>` 引用的域名在白名单内 |
| **检查项** | 仅 `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `unpkg.com`, `esm.sh` |
| **指南模块** | 所有 |

## 验证流程

1. 启用 Skill（注入 system prompt + 对应指南模块）
2. 发送测试 prompt
3. 检查模型输出是否包含正确格式的 `show-widget` 围栏
4. 提取 `widget_code`，在浏览器中打开验证渲染效果
5. 切换深色模式，确认视觉兼容
6. 点击可交互元素，确认 `window.__widgetSendMessage()` 调用正确
7. 检查浏览器控制台无 CSP 违规报错

## 结果记录

| 模型 | 用例 | 通过/失败 | 备注 |
|------|------|----------|------|
| | | | |
