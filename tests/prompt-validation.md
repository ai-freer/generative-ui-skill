# Prompt 验证用例

验证 Generative UI Skill 注入后，模型的输出行为是否符合预期。

## 验证模型

- Claude Opus 4.6
- Claude Sonnet 4.6
- Kimi K2.5
- Seed 2.0 Pro
- GLM-5
- GPT-5.4
- gemini-3.1-pro-preview

## 用例清单

### 1. 流程图生成


| 项目       | 内容                                              |
| -------- | ----------------------------------------------- |
| **输入**   | "解释 JWT 认证流程"                                   |
| **预期**   | 回复包含 `show-widget` 代码围栏 + SVG 内容                |
| **检查项**  | 有效 SVG, `viewBox` 正确, 透明背景, 使用 `c-`* 颜色类, 节点可点击 |
| **指南模块** | core + color-palette + svg-setup + diagram      |


### 2. 数据图表


| 项目       | 内容                                                                  |
| -------- | ------------------------------------------------------------------- |
| **输入**   | "展示过去 6 个月的 OpenAI 用户增长趋势"                                          |
| **预期**   | 回复包含 `show-widget` 代码围栏 + Chart.js HTML                             |
| **检查项**  | CDN 引用 `cdnjs.cloudflare.com`, canvas 存在, `onload` 初始化, 自定义图例, 指标卡片 |
| **指南模块** | core + ui-components + color-palette + chart                        |


### 3. 交互组件


| 项目       | 内容                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------- |
| **输入**   | "做一个 BMI 计算器"                                                                                        |
| **预期**   | 回复包含 `show-widget` 代码围栏 + 带滑块/输入框的 HTML                                                              |
| **检查项**  | 滑块有 `step` 属性, 数字经过格式化处理（如 `.toFixed()` / `Math.round()` / `Intl.NumberFormat`）, 实时计算逻辑正确, 使用 CSS 变量 |
| **指南模块** | core + ui-components + color-palette                                                                 |


### 4. 对比图


| 项目       | 内容                                         |
| -------- | ------------------------------------------ |
| **输入**   | "比较 REST 和 GraphQL"                        |
| **预期**   | 回复包含 `show-widget` 代码围栏 + SVG 或 HTML 卡片    |
| **检查项**  | 并排布局, 色彩区分两方, 使用不同 `c-`* 色系, 节点可点击追问       |
| **指南模块** | core + color-palette + svg-setup + diagram |


### 5. 无 widget 场景


| 项目       | 内容                      |
| -------- | ----------------------- |
| **输入**   | "今天天气怎么样"               |
| **预期**   | 纯文本回复                   |
| **检查项**  | 不应包含 `show-widget` 代码围栏 |
| **指南模块** | 仅 core（或不注入）            |


### 6. 结构图


| 项目       | 内容                                          |
| -------- | ------------------------------------------- |
| **输入**   | "画一下 Kubernetes 的架构"                        |
| **预期**   | 回复包含 `show-widget` 代码围栏 + SVG 嵌套容器          |
| **检查项**  | 外层容器 rx=20+, 内层区域不同色系, 20px 内边距, 最多 2-3 层嵌套 |
| **指南模块** | core + color-palette + svg-setup + diagram  |


### 7. 深色模式兼容


| 项目       | 内容                                                                                   |
| -------- | ------------------------------------------------------------------------------------ |
| **输入**   | 任意 widget 生成场景                                                                       |
| **预期**   | Widget 在深色背景下仍然可读                                                                    |
| **检查项**  | 无硬编码颜色（如 `#333`, `black`）, SVG 文本使用 `t`/`ts`/`th` 类, HTML 文本使用 `var(--color-text-*)` |
| **指南模块** | 所有                                                                                   |


### 8. CDN 合规


| 项目       | 内容                                                                  |
| -------- | ------------------------------------------------------------------- |
| **输入**   | "做一个 D3.js 的数据可视化"                                                  |
| **预期**   | `<script src>` 引用的域名在白名单内                                           |
| **检查项**  | 仅 `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `unpkg.com`, `esm.sh` |
| **指南模块** | 所有                                                                  |


### 9. 产品/功能设计（mockup + diagram）


| 项目       | 内容                                                          |
| -------- | ----------------------------------------------------------- |
| **输入**   | "设计一个电商 App 的商品详情页，包含主要功能模块"                                |
| **预期**   | 回复包含 `show-widget` 代码围栏 + 页面 mockup 或功能模块图                  |
| **检查项**  | 有清晰的页面区域划分, 使用 UI 组件样式（卡片/按钮/标签）, 配合流程或结构图说明模块关系, 使用 CSS 变量 |
| **指南模块** | core + mockup + diagram                                     |


### 10. 算法可视化（interactive + diagram）


| 项目       | 内容                                                             |
| -------- | -------------------------------------------------------------- |
| **输入**   | "用可视化的方式演示冒泡排序的过程，最好能一步步操作"                                    |
| **预期**   | 回复包含 `show-widget` 代码围栏 + 带步进控制的交互式 HTML                       |
| **检查项**  | 有"下一步"/"重置"按钮, 数组元素有颜色高亮区分当前比较项, 排序状态实时更新, 使用 CSS 变量和 `c-`* 色系 |
| **指南模块** | core + diagram + interactive                                   |


### 11. 品牌/世界观设定（art + mockup）


| 项目       | 内容                                                              |
| -------- | --------------------------------------------------------------- |
| **输入**   | "帮我设计一个赛博朋克风格的虚拟咖啡品牌，包括品牌名、视觉风格和菜单概念"                           |
| **预期**   | 回复包含 `show-widget` 代码围栏 + 强视觉风格的品牌展示                            |
| **检查项**  | 有明确的视觉风格（配色/字体/氛围）, 品牌元素完整, SVG 或 HTML 布局精致, 使用 `c-`* 色系或自定义主题色 |
| **指南模块** | core + art + mockup                                             |


### 12. 复杂策略/流程优化（diagram + chart + interactive）


| 项目       | 内容                                            |
| -------- | --------------------------------------------- |
| **输入**   | "分析一个 SaaS 产品从获客到留存的完整用户生命周期，给出优化建议"          |
| **预期**   | 回复包含 `show-widget` 代码围栏 + 流程图/漏斗图/数据图表组合      |
| **检查项**  | 有生命周期阶段流程图, 有转化率数据可视化, 关键节点可点击查看详情, 多种可视化形式配合 |
| **指南模块** | core + diagram + chart + interactive          |


### 13. 纯视觉灵感（art + mockup，弱 core）


| 项目       | 内容                                                |
| -------- | ------------------------------------------------- |
| **输入**   | "给我一些日式侘寂风格的室内设计灵感，用视觉方式呈现"                       |
| **预期**   | 回复包含 `show-widget` 代码围栏 + 以视觉为主的展示                |
| **检查项**  | 视觉比重大于文字, 有氛围感的配色和排版, 使用 SVG 或精致 HTML 布局, 弱化结构化信息 |
| **指南模块** | art + mockup（可选少量 core）                           |


### 14. 3D 空间场景


| 项目       | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **输入**   | "用 3D 模型展示太阳系的运行原理"                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **预期**   | 回复包含 `show-widget` 代码围栏 + Three.js canvas 3D 场景                                                                                                                                                                                                                                                                                                                                                                                                             |
| **检查项**  | CDN 引用 `cdnjs.cloudflare.com` (three.min.js) + `cdn.jsdelivr.net` (OrbitControls) 且 OrbitControls 有 `onload="init()"`, `<canvas>` 存在, 透明背景 (`alpha: true`), OrbitControls 初始化, 仅 AmbientLight + DirectionalLight, 材质使用 `MeshLambertMaterial` 或 `MeshBasicMaterial`, 颜色使用 palette 200/400-stop hex（亮色/发光体可用 200-stop，普通对象用 400-stop）, mesh 对象 ≤8（process/gear 场景 ≤12）, 可点击 drill-down (raycaster + `__widgetSendMessage`), `setPixelRatio(Math.min(..., 2))` |
| **指南模块** | core + color-palette + 3d-scene                                                                                                                                                                                                                                                                                                                                                                                                                             |


### 15. 3D 与 illustrative diagram 路由判定


| 项目       | 内容                                                                                                                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **输入 A** | "用 3D 展示 DNA 双螺旋结构"                                                                                                                                                                                                                    |
| **输入 B** | "解释 DNA 复制的过程"                                                                                                                                                                                                                         |
| **预期**   | A → Three.js 3D 场景（螺旋几何需要空间透视）; B → SVG illustrative diagram 或 HTML stepper（流程/机制解释）                                                                                                                                                   |
| **检查项**  | A: 包含 `three.min.js` CDN, `<canvas>`, OrbitControls, 且场景中存在螺旋相关几何构建（如 `SphereGeometry` 原子 + `CylinderGeometry` 键沿螺旋路径排列，或参数化 helix 坐标 `Math.cos/sin`），不能只是空 Three.js 壳子; B: 不包含 Three.js, 使用 SVG 或 HTML stepper, 内容聚焦复制机制（解旋→引物→延伸等步骤） |
| **指南模块** | A: core + color-palette + 3d-scene; B: core + color-palette + svg-setup + diagram                                                                                                                                                      |


## 验证流程

1. 启用 Skill（注入 system prompt + 对应指南模块）
2. 发送测试 prompt
3. 检查模型输出是否包含正确格式的 `show-widget` 围栏
4. 提取 `widget_code`，在浏览器中打开验证渲染效果
5. 切换深色模式，确认视觉兼容
6. 点击可交互元素，确认 `window.__widgetSendMessage()` 调用正确
7. 检查浏览器控制台无 CSP 违规报错

## 自动化验证计划

当前“渠道截图 + 按钮映射”主要依赖手工测试，回归成本高。后续建议补齐一套**分层自动化验证**，目标不是替代最终人工 smoke test，而是在每次调整 `prompt / screenshot / drill-down / adapter` 后，先提供一层稳定、快速、可重复的基础保障。

### 第一层：Pipeline 自动化验证

目标：验证 `模型输出 → widget 解析 → 截图 → drill-down 提取 → 渠道 payload 组装` 这条链路不断。

建议新增脚本：

- `scripts/pipeline-validation-runner.mjs`

输入来源：

- 优先复用 `tests/manual-validation/` 中已沉淀的真实模型输出样本
- 每个样本至少包含完整回复文本，能够喂给 `widget-interceptor.mjs`

执行步骤：

1. 读取样本回复文本
2. 调用 `widget-interceptor.mjs` 或对应模块 API，提取 `title / widgetCode / plainText`
3. 调用 `widget-screenshot.mjs` 或 `captureWidget()` 生成 PNG
4. 调用 `widget-drilldown.mjs` 或 `extractDrillDowns()` 提取 drill-down
5. 调用 mock channel adapter，组装 Telegram / Feishu payload

最低断言：

- 至少解析出 1 个 widget
- `title` 非空，`widgetCode` 非空
- PNG 文件存在，大小大于 0
- PNG 宽高在合理范围内
- drill-down 数量符合预期下限
- Telegram payload / Feishu payload 结构合法

这层测试的价值最高，能优先发现：

- 围栏解析失效
- 截图脚本回归
- 3D / canvas 等待逻辑失效
- drill-down 正则提取失败
- 渠道按钮结构被改坏

### 第二层：截图轻量回归

目标：避免“能出 PNG，但截图为空白、半渲染、只截到背景”这类问题。

建议挑选固定 case：

- 1 个 SVG 流程图
- 1 个 Chart.js 图表
- 1 个 HTML mockup
- 2 个 3D case（例如太阳系 / DNA）

建议新增脚本：

- `scripts/screenshot-regression.mjs`

建议断言：

- 文件大小阈值：过小说明可能空白或渲染失败
- 图片尺寸阈值：防止高度坍塌或 viewport 异常
- 非背景像素比例超过阈值：避免整张图接近纯背景色
- 3D case 单独设置更严格阈值

这一层先不建议上来做像素级 golden diff，因为 3D / canvas 结果有一定抖动，维护成本高。先做“轻量健康检查”更稳。

### 第三层：Mock 渠道适配验证

目标：验证“图片 + 按钮”最终生成的 outbound payload 是否符合渠道约束，而不依赖真实 Telegram / 飞书网络调用。

建议新增模块或脚本：

- `tests/mocks/channel-adapters/telegram.mjs`
- `tests/mocks/channel-adapters/feishu.mjs`

建议断言：

- `media` 指向真实存在的 PNG 文件
- caption / title 存在
- Telegram buttons 为二维数组
- Feishu action/button JSON 结构完整
- 按钮数量、行数符合当前排版规则
- 空 drill-down 场景能正确降级为“仅发送图片”

这一层可以把“渠道格式问题”提前暴露，不必每次都真的发到机器人里再点开看。

### 不建议一开始就做的自动化

- 真 Telegram Bot / 真飞书机器人端到端自动发消息
- OCR 校验截图文字内容
- 全量像素级 golden image 对比

原因：

- 接入和维护成本高
- 容易引入外部网络、账号权限、限流等不稳定因素
- 对当前阶段的“基础回归保障”来说性价比不高

### 推荐落地顺序

1. 先做 `pipeline-validation-runner.mjs`
2. 直接复用 `tests/manual-validation/` 的历史样本
3. 产出 `summary.json`
4. 在本地与 CI 中先跑最小 case 集：SVG / Chart.js / 3D 各 1-2 条
5. 稳定后再补截图轻量回归和 mock adapter 校验

### 执行建议

后续凡是涉及以下改动，至少先跑一次自动化 pipeline：

- `SKILL.md`
- `prompts/`
- `scripts/widget-screenshot.mjs`
- `scripts/widget-drilldown.mjs`
- `scripts/widget-interceptor.mjs`
- 未来的 Telegram / Feishu adapter 实现

自动化通过后，再补一次最小人工 smoke test：

- Telegram 实测 1 条
- 飞书实测 1 条

这样可以把“全靠手工点 bot 看效果”收敛成“自动化先兜底，人工只做最后确认”。

## 结果记录

### 汇总结论

- Claude Opus 4.6：稳定性最好，本轮复测后所有已测用例都能稳定输出合格 widget；修正 `BMI` 数值格式化口径后，本轮也已带出 CTA
- Seed 2.0 Pro：整体次优，图表、mockup、品牌和复杂策略表现较好；修正 `BMI` 数值格式化口径后交互组件已通过，但无 widget 场景约束仍偏弱
- GLM-5：串行补测后稳定性明显改善，图表、结构图、算法可视化、复杂策略、产品 mockup 与 `BMI` 交互组件都已补测通过；render rebuild 后 `BMI` 继续保持通过并命中 CTA
- Claude Sonnet 4.6 / Kimi K2.5：串行补测后大部分“流中断”已恢复；两者此前因阻断或格式异常失败的条目已基本补齐，render rebuild 后 `BMI` 交互组件都稳定通过并命中 CTA
- GPT-5.4：全量补测后 13 条用例均已拿到可用结果；二次补测确认数据图表也满足 `Chart.js + canvas + onload` 口径，当前全用例通过
- gemini-3.1-pro-preview：已完成 13 条主验证用例与 3D 两组补测；当前唯一稳定失败项仍是“无 widget 场景”里天气问答误输出 widget，其余用例均通过
- 3D 用例：本轮已完成 7 个模型的 `用例 14 / 15A / 15B` 串行补测；当前全部通过，说明 `3D 场景生成` 与 `3D / 非 3D 路由判定` 在现有模型集上已具备稳定可用结果
- 共同问题：当前剩余显著问题主要集中在“无 widget 场景”的模型约束与部分模型在特定视觉类任务上的模块触发稳定性，而非 `BMI` 数值格式化本身

### 结果矩阵

| 用例 \ 模型 | Opus | Sonnet | GPT-5.4 | Kimi | Seed | GLM | Gemini | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1. 流程图生成 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | M1 |
| 2. 数据图表 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | M2 |
| 3. 交互组件 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | M3 |
| 4. 对比图 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | M4 |
| 5. 无 widget 场景 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | F1 |
| 6. 结构图 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | M5 |
| 7. 深色模式兼容 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | M6 |
| 8. CDN 合规 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | M7 |
| 9. 产品/功能设计 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | M8 |
| 10. 算法可视化 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | M9 |
| 11. 品牌/世界观设定 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | M10 |
| 12. 复杂策略/流程优化 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | M11 |
| 13. 纯视觉灵感 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | F2 |
| 14. 3D 空间场景 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | D1 |
| 15A. 3D DNA 双螺旋 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | D2 |
| 15B. DNA 复制过程 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | D3 |

### 备注索引

- `F1`：`Seed 2.0 Pro` 与 `Gemini` 在“无 widget 场景”里仍会把天气问答错误渲染成 widget。
- `F2`：`Seed 2.0 Pro` 在“纯视觉灵感”原始 prompt 下更像结构化元素清单，视觉氛围不足；若提示词明确要求“设计图/视觉方式呈现”，可触发 Art 模组生成更合适结果。
- `M1`：流程图用例已完成补测；Gemini 为 2026-03-19 串行补测，其余模型为此前实测结果。
- `M2`：数据图表用例已确认包含 `canvas` 与白名单 CDN；`GPT-5.4` 另做过 `Chart.js + onload` 口径复核。
- `M3`：BMI 用例已统一按“数值经过格式化处理”判定；当前通过模型均满足 `step`、格式化与 CSS 变量要求。
- `M4`：对比图用例当前都能稳定产出并排对比与点击追问。
- `M5`：结构图静态回归已由 `playground/tests/structural-diagram.test.js` 锁定关键结构约束。
- `M6`：深色模式兼容当前以未见硬编码深色文本、使用语义类或 CSS 变量为通过口径。
- `M7`：CDN 合规当前均未见白名单外域名。
- `M8`：产品/功能设计用例当前都能产出完整商品详情页 mockup。
- `M9`：算法可视化用例当前都包含步进或自动播放等交互控制。
- `M10`：品牌/世界观设定用例当前都能产出完整视觉展示。
- `M11`：复杂策略用例当前都能产出生命周期分析与可点击流程/结构。
- `D1`：`14` 已对 7 个模型完成串行 3D 补测，全部通过。
- `D2`：`15A` 已对 7 个模型完成串行 3D 补测，全部通过。
- `D3`：`15B` 已对 7 个模型完成串行补测，全部通过，且未误触发 Three.js。

### 本轮执行说明

- 执行日期：2026-03-17
- 执行方式：通过 `playground` 页面发起 13 条用例；每条用例对 5 个可用模型并发请求，并在浏览器里检查 widget 渲染、DOM 结构、点击回调与控制台表现
- 本轮可用模型：Claude Opus 4.6、Claude Sonnet 4.6、Kimi K2.5、Seed 2.0 Pro、GLM-5、GPT-5.4
- 当前限制：`playground/server.mjs` 现在固定注入全部 guidelines，而不是按用例清单单独切模块，所以本次结果反映的是“全量 prompt 注入”下的真实行为
- 浏览器检查：本轮已完成条目未捕获到 CSP 违规，也未记录到页面级 console error / warn
- 并发限制：多模型并发时，部分请求出现 `BodyStreamBuffer was aborted`；这些条目按“失败（流中断）”记录，建议后续串行复测确认
- 2026-03-18 补测：已对用例 3、4 做全模型串行复测，并对“并发实测流中断”条目持续做串行补测；其中 `Claude Sonnet 4.6 / 用例 1` 已根据手工截图复核改判为通过，后续补测结果已同步回填表格
- 2026-03-18 Prompt 调整后复测（用例 3）：`Claude Opus 4.6` 未见质量退步，但这轮未主动产出 follow-up CTA；`Claude Sonnet 4.6` 补齐 CTA 且通过；`Seed 2.0 Pro`、`GLM-5` 这轮也出现了 CTA，但仍未稳定命中 `Math.round()`；`Kimi K2.5` 在 CTA 复测中再次出现合法 JSON 不稳定
- 2026-03-18 CTA 提醒补充后复测（用例 3）：`Claude Opus 4.6` 依旧稳定通过，但连续两轮都未主动产出 CTA；`Claude Sonnet 4.6` 稳定命中 CTA 且保持通过；`Kimi K2.5` 本轮同时命中 CTA 与 `Math.round()`，回到通过；`Seed 2.0 Pro`、`GLM-5` 都命中 CTA，但仍未稳定补齐 `Math.round()`
- 2026-03-18 render rebuild 后全量复测（用例 3）：`Claude Opus 4.6`、`Claude Sonnet 4.6`、`Kimi K2.5`、`GLM-5` 全部稳定命中双滑块、`step`、`Math.round()` 与 CSS 变量；其中 `Sonnet / Kimi / GLM` 同时带出 CTA，`Opus` 仍未主动给 CTA；`Seed 2.0 Pro` 仍缺 `Math.round()`，但保留了 `window.__widgetSendMessage()` 交互入口
- 2026-03-18 GPT-5.4 补测：已完成 13 条用例实测；二次补测已确认数据图表用例包含 `<canvas>`、`cdnjs.cloudflare.com` 的 `Chart.js`、`onload` 初始化与 `new Chart(...)`，现已全量回填表格
- 2026-03-18 Seed 2.0 Pro 定向补测：仅重跑了 `用例 3 / BMI` 与 `用例 5 / 无 widget 场景`；结果均未改判。`BMI` 仍为双滑块、`step`、CSS 变量与 CTA 齐全，但数值格式化依旧使用 `.toFixed(1)` 而非 `Math.round()`；天气询问仍误输出 widget
- 2026-03-18 BMI 判定口径修正后复测（用例 3）：确认 `.toFixed()` 比 `Math.round()` 更适合作为 BMI 结果展示；已将检查项修正为“数值经过格式化处理”，并重跑 5 个模型。`Claude Opus 4.6`、`Claude Sonnet 4.6`、`Kimi K2.5`、`Seed 2.0 Pro`、`GLM-5` 全部命中双滑块、`step`、数值格式化与 CSS 变量；5 个模型本轮均通过，且都带出 CTA
- 2026-03-19 Gemini + 3D 补测：通过 `scripts/prompt-validation-runner.mjs` 串行执行 `Gemini / 用例 1-13`，随后补跑 `Gemini、Claude Opus 4.6、Claude Sonnet 4.6、GPT-5.4、Kimi K2.5、GLM-5、Seed 2.0 Pro` 的 `用例 14 / 15A / 15B`；原始结果已保存至 `tests/manual-validation/2026-03-19-gemini-3d-batch/`
- 静态回归：`playground/tests/structural-diagram.test.js` 已锁定结构图外层 `rx>=20`、20px 容器内边距和内层不同色系；后续改 prompt 可先跑该单测再做多模型实测
