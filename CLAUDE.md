# Generative UI — 项目规则

## 测试规则

- 日常开发 / debug：运行相关模块的测试做快速验证（如 `node --test tests/search.test.js`）
- 提交代码前：运行 `cd playground && npm test` 全量回归
- 修改 server.mjs / lib/ 下的模块时，至少运行 `npm run test:unit` 做快速回归
- 新增功能必须同步编写对应的测试用例
- 测试框架：Node.js 内置 `node:test` + `node:assert`，不引入外部测试依赖

### 测试覆盖

- **parser** — 围栏检测、partial JSON 提取、HTML 转义、inline markdown
- **search** — locale 检测（中/英/日/韩 + 国家/语言 hint）
- **prompt** — system prompt 加载、模块去重、自动 prepend core
- **planner** — Planner（截断恢复）逻辑
- **e2e** — API 端点校验（providers / chat SSE 流）
- **widget-render** — example HTML 静态检查（禁止标签、CDN 白名单、CSS 变量）

## 项目结构

- `prompts/` — System prompt + guidelines 模块
- `playground/` — 本地测试环境（Express + 前端）
  - `playground/lib/` — 服务端可测试模块（search.js, prompt.js）
  - `playground/tests/` — 测试文件
  - `playground/public/` — 前端代码（app.js, style.css, index.html）
- `examples/` — 示例 widget HTML 文件
- `packages/renderer/` — M2 渲染运行时（开发中）

## 开发流程

1. 理解需求，阅读相关代码
2. 实现功能 / 修复 bug
3. 编写或更新测试用例
4. 运行 `npm test` 确认全部通过
5. 提交代码
